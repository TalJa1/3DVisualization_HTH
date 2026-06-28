import * as THREE from 'three'

// ── Kobra X printer limits ───────────────────────────────────────────────────
const PRINTER = {
  maxX: 220,
  maxY: 220,
  maxZ: 250,
  filamentDiameter: 1.75,
} as const

// ── Filament presets (from Kobra X config) ───────────────────────────────────
export type FilamentType = 'PLA' | 'PETG' | 'ABS' | 'TPU' | 'SilkPLA'

interface FilamentPreset {
  label: string
  nozzleTemp: number
  bedTemp: number
  printSpeed: number
  firstLayerSpeed: number
  retractDist: number
  retractSpeed: number
  fanPercent: number
}

export const FILAMENT_PRESETS: Record<FilamentType, FilamentPreset> = {
  PLA:     { label: 'PLA',      nozzleTemp: 215, bedTemp: 60,  printSpeed: 150, firstLayerSpeed: 35, retractDist: 0.8, retractSpeed: 40, fanPercent: 100 },
  PETG:    { label: 'PETG',     nozzleTemp: 240, bedTemp: 70,  printSpeed: 100, firstLayerSpeed: 22, retractDist: 0.9, retractSpeed: 40, fanPercent: 45  },
  ABS:     { label: 'ABS',      nozzleTemp: 230, bedTemp: 80,  printSpeed: 65,  firstLayerSpeed: 28, retractDist: 6.0, retractSpeed: 40, fanPercent: 25  },
  TPU:     { label: 'TPU 95A',  nozzleTemp: 222, bedTemp: 60,  printSpeed: 25,  firstLayerSpeed: 15, retractDist: 0.4, retractSpeed: 25, fanPercent: 80  },
  SilkPLA: { label: 'Silk PLA', nozzleTemp: 222, bedTemp: 60,  printSpeed: 120, firstLayerSpeed: 30, retractDist: 0.8, retractSpeed: 40, fanPercent: 50  },
}

export interface GcodeSettings {
  filament: FilamentType
  nozzleDiameter: number
  layerHeight: number
  firstLayerHeight: number
  infillPercent: number
  infillPattern: 'grid' | 'lines'
  wallCount: number
  topBottomLayers: number
  printSpeed: number
  travelSpeed: number
  outputSizeX: number
  outputSizeY: number
  outputSizeZ: number
  brim: boolean
  brimWidth: number
  support: boolean
  supportOverhangAngle: number
}

export const DEFAULT_GCODE_SETTINGS: GcodeSettings = {
  filament: 'PLA',
  nozzleDiameter: 0.4,
  layerHeight: 0.2,
  firstLayerHeight: 0.2,
  infillPercent: 20,
  infillPattern: 'grid',
  wallCount: 2,
  topBottomLayers: 4,
  printSpeed: 150,
  travelSpeed: 200,
  outputSizeX: 100,
  outputSizeY: 100,
  outputSizeZ: 30,
  brim: false,
  brimWidth: 6,
  support: false,
  supportOverhangAngle: 45,
}

// ── Height grid from geometry ────────────────────────────────────────────────
function buildHeightGrid(geo: THREE.BufferGeometry, gridRes: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const bbox = new THREE.Box3().setFromBufferAttribute(pos)
  const rangeX = bbox.max.x - bbox.min.x || 1
  const rangeZ = bbox.max.z - bbox.min.z || 1
  const grid = new Float32Array(gridRes * gridRes).fill(0)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ix = Math.min(gridRes - 1, Math.max(0, Math.round(((x - bbox.min.x) / rangeX) * (gridRes - 1))))
    const iz = Math.min(gridRes - 1, Math.max(0, Math.round(((z - bbox.min.z) / rangeZ) * (gridRes - 1))))
    const idx = iz * gridRes + ix
    if (y > grid[idx]) grid[idx] = y
  }

  return { grid, bbox, rangeX, rangeZ }
}

function sampleHeight(grid: Float32Array, gridRes: number, fx: number, fz: number): number {
  const ix0 = Math.max(0, Math.min(gridRes - 2, Math.floor(fx)))
  const iz0 = Math.max(0, Math.min(gridRes - 2, Math.floor(fz)))
  const tx = fx - ix0
  const tz = fz - iz0
  return grid[iz0 * gridRes + ix0] * (1 - tx) * (1 - tz)
       + grid[iz0 * gridRes + ix0 + 1] * tx * (1 - tz)
       + grid[(iz0 + 1) * gridRes + ix0] * (1 - tx) * tz
       + grid[(iz0 + 1) * gridRes + ix0 + 1] * tx * tz
}

// ── Extrusion math ───────────────────────────────────────────────────────────
function extrusionPerMm(nozzleDiameter: number, layerHeight: number): number {
  const lineWidth = nozzleDiameter
  const crossSection = lineWidth * layerHeight
  const filamentArea = Math.PI * (PRINTER.filamentDiameter / 2) ** 2
  return crossSection / filamentArea
}

// ── Clamp output size to printer build volume ────────────────────────────────
export function clampToPrinter(settings: GcodeSettings): GcodeSettings {
  return {
    ...settings,
    outputSizeX: Math.min(settings.outputSizeX, PRINTER.maxX),
    outputSizeY: Math.min(settings.outputSizeY, PRINTER.maxY),
    outputSizeZ: Math.min(settings.outputSizeZ, PRINTER.maxZ),
  }
}

// ── Main G-code generator ────────────────────────────────────────────────────
export function generateGcode(geometry: THREE.BufferGeometry, rawSettings: GcodeSettings): string {
  const settings = clampToPrinter(rawSettings)
  const {
    filament, nozzleDiameter, layerHeight, firstLayerHeight,
    infillPercent, infillPattern, wallCount, topBottomLayers,
    printSpeed, travelSpeed,
    outputSizeX, outputSizeY, outputSizeZ,
    brim, brimWidth,
  } = settings

  const preset = FILAMENT_PRESETS[filament]
  const nozzleTemp = preset.nozzleTemp
  const bedTemp = preset.bedTemp
  const retractDist = preset.retractDist
  const retractSpeed = preset.retractSpeed
  const firstLayerSpeed = preset.firstLayerSpeed

  let geo = geometry.clone()
  if (geo.index) geo = geo.toNonIndexed()

  const GRID_RES = 128
  const { grid, bbox } = buildHeightGrid(geo, GRID_RES)
  geo.dispose()

  const minY = bbox.min.y
  const maxY = bbox.max.y
  const elevRange = maxY - minY || 1

  const lineWidth = nozzleDiameter
  const firstLayerLineWidth = nozzleDiameter * 1.2
  const ePerMm = extrusionPerMm(nozzleDiameter, layerHeight)
  const ePerMmFirst = extrusionPerMm(nozzleDiameter, firstLayerHeight)

  // Center model on bed
  const offsetX = (PRINTER.maxX - outputSizeX) / 2
  const offsetY = (PRINTER.maxY - outputSizeY) / 2

  const lines: string[] = []
  let E = 0
  let lastX = 0, lastY = 0
  let retracted = false

  function f(n: number): string { return n.toFixed(3) }
  function fi(n: number): string { return n.toFixed(1) }

  function move(x: number, y: number, z: number) {
    lines.push(`G0 X${f(x)} Y${f(y)} Z${f(z)} F${travelSpeed * 60}`)
    lastX = x; lastY = y
  }

  function extrude(x: number, y: number, speed: number, eRate: number) {
    const dx = x - lastX
    const dy = y - lastY
    const dist = Math.sqrt(dx * dx + dy * dy)
    E += dist * eRate
    lines.push(`G1 X${f(x)} Y${f(y)} E${f(E)} F${Math.round(speed * 60)}`)
    lastX = x; lastY = y
  }

  function retract() {
    if (retracted) return
    E -= retractDist
    lines.push(`G1 E${f(E)} F${Math.round(retractSpeed * 60)}`)
    retracted = true
  }

  function unretract() {
    if (!retracted) return
    E += retractDist
    lines.push(`G1 E${f(E)} F${Math.round(retractSpeed * 60)}`)
    retracted = false
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push('; G-code generated by HuaTrienHao 3D')
  lines.push(`; Printer: Anycubic Kobra X`)
  lines.push(`; Filament: ${preset.label}`)
  lines.push(`; Nozzle: ${nozzleDiameter}mm  Layer: ${layerHeight}mm`)
  lines.push(`; Model size: ${fi(outputSizeX)}x${fi(outputSizeY)}x${fi(outputSizeZ)}mm`)
  lines.push(`; Infill: ${infillPercent}% ${infillPattern}`)
  lines.push(`; Walls: ${wallCount}  Top/Bottom: ${topBottomLayers} layers`)
  lines.push('')

  // ── Start G-code (Kobra X) ─────────────────────────────────────────────────
  lines.push('G90')
  lines.push('M82')
  lines.push(`M104 S${nozzleTemp}`)
  lines.push(`M140 S${bedTemp}`)
  lines.push(`M190 S${bedTemp}`)
  lines.push(`M109 S${nozzleTemp}`)
  lines.push('G28')
  lines.push('G29')
  lines.push('G92 E0')
  lines.push('G1 Z2.0 F3000')
  lines.push('G1 X5 Y20 Z0.3 F5000')
  lines.push('G1 X5 Y200 E15 F1500')
  lines.push('G92 E0')
  lines.push('G1 Z2.0 F3000')
  lines.push('')
  E = 0

  // ── Compute total layers ───────────────────────────────────────────────────
  const totalLayers = Math.max(1, Math.ceil((outputSizeZ - firstLayerHeight) / layerHeight) + 1)

  // For each grid cell, compute the max terrain height in output-Z space
  function terrainHeightAt(gx: number, gy: number): number {
    const fx = (gx / outputSizeX) * (GRID_RES - 1)
    const fz = (gy / outputSizeY) * (GRID_RES - 1)
    const h = sampleHeight(grid, GRID_RES, fx, fz)
    const t = (h - minY) / elevRange
    return t * outputSizeZ
  }

  // ── Brim (layer 0 only) ────────────────────────────────────────────────────
  if (brim) {
    const z = firstLayerHeight
    lines.push(`; BRIM`)
    lines.push(`G0 Z${f(z)} F3000`)
    const brimLoops = Math.ceil(brimWidth / firstLayerLineWidth)
    for (let b = 0; b < brimLoops; b++) {
      const margin = (b + 1) * firstLayerLineWidth
      const x0 = offsetX - margin
      const y0 = offsetY - margin
      const x1 = offsetX + outputSizeX + margin
      const y1 = offsetY + outputSizeY + margin
      const cx0 = Math.max(0, x0)
      const cy0 = Math.max(0, y0)
      const cx1 = Math.min(PRINTER.maxX, x1)
      const cy1 = Math.min(PRINTER.maxY, y1)

      move(cx0, cy0, z)
      unretract()
      extrude(cx1, cy0, firstLayerSpeed, ePerMmFirst)
      extrude(cx1, cy1, firstLayerSpeed, ePerMmFirst)
      extrude(cx0, cy1, firstLayerSpeed, ePerMmFirst)
      extrude(cx0, cy0, firstLayerSpeed, ePerMmFirst)
      retract()
    }
  }

  // ── Layer-by-layer ─────────────────────────────────────────────────────────
  const infillSpacing = lineWidth / Math.max(0.05, infillPercent / 100)

  for (let layer = 0; layer < totalLayers; layer++) {
    const z = layer === 0
      ? firstLayerHeight
      : firstLayerHeight + layer * layerHeight
    const isFirstLayer = layer === 0
    const currentSpeed = isFirstLayer ? firstLayerSpeed : printSpeed
    const currentERate = isFirstLayer ? ePerMmFirst : ePerMm
    const currentLineWidth = isFirstLayer ? firstLayerLineWidth : lineWidth

    const isSolidLayer = layer < topBottomLayers || layer >= totalLayers - topBottomLayers

    // Determine which cells are active at this Z height
    // The terrain base always has a solid floor, so all cells are active
    // at bottom layers. Above that, only cells where terrain >= z.
    const cellRes = Math.min(64, GRID_RES)
    const cellSizeX = outputSizeX / cellRes
    const cellSizeY = outputSizeY / cellRes

    // Build active bitmap for this layer
    const active = new Uint8Array(cellRes * cellRes)
    let anyActive = false
    for (let cy = 0; cy < cellRes; cy++) {
      for (let cx = 0; cx < cellRes; cx++) {
        const terrH = terrainHeightAt(
          (cx + 0.5) * cellSizeX,
          (cy + 0.5) * cellSizeY,
        )
        if (z <= terrH + 0.001) {
          active[cy * cellRes + cx] = 1
          anyActive = true
        }
      }
    }

    if (!anyActive) continue

    lines.push('')
    lines.push(`; LAYER ${layer} Z=${f(z)}`)
    lines.push(`G0 Z${f(z)} F3000`)

    if (isFirstLayer) {
      lines.push('M107')
    } else if (layer === 1) {
      const fanVal = Math.round(preset.fanPercent * 2.55)
      lines.push(`M106 S${fanVal}`)
    }

    // ── Find row spans of active cells ───────────────────────────────────────
    // For simplicity, find the bounding box of active cells per row and print
    // perimeters around the full active region, then infill.

    let minCx = cellRes, maxCx = 0, minCy = cellRes, maxCy = 0
    for (let cy = 0; cy < cellRes; cy++) {
      for (let cx = 0; cx < cellRes; cx++) {
        if (active[cy * cellRes + cx]) {
          if (cx < minCx) minCx = cx
          if (cx > maxCx) maxCx = cx
          if (cy < minCy) minCy = cy
          if (cy > maxCy) maxCy = cy
        }
      }
    }

    const regionX0 = offsetX + minCx * cellSizeX
    const regionY0 = offsetY + minCy * cellSizeY
    const regionX1 = offsetX + (maxCx + 1) * cellSizeX
    const regionY1 = offsetY + (maxCy + 1) * cellSizeY

    // ── Perimeters (walls) ───────────────────────────────────────────────────
    for (let w = 0; w < wallCount; w++) {
      const inset = currentLineWidth * (w + 0.5)
      const wx0 = regionX0 + inset
      const wy0 = regionY0 + inset
      const wx1 = regionX1 - inset
      const wy1 = regionY1 - inset
      if (wx1 <= wx0 || wy1 <= wy0) break

      lines.push(w === 0 ? '; WALL-OUTER' : '; WALL-INNER')
      move(wx0, wy0, z)
      unretract()
      extrude(wx1, wy0, w === 0 ? currentSpeed * 0.6 : currentSpeed * 0.85, currentERate)
      extrude(wx1, wy1, w === 0 ? currentSpeed * 0.6 : currentSpeed * 0.85, currentERate)
      extrude(wx0, wy1, w === 0 ? currentSpeed * 0.6 : currentSpeed * 0.85, currentERate)
      extrude(wx0, wy0, w === 0 ? currentSpeed * 0.6 : currentSpeed * 0.85, currentERate)
      retract()
    }

    // ── Infill ───────────────────────────────────────────────────────────────
    if (infillPercent > 0) {
      const wallInset = currentLineWidth * (wallCount + 0.5)
      const ix0 = regionX0 + wallInset
      const iy0 = regionY0 + wallInset
      const ix1 = regionX1 - wallInset
      const iy1 = regionY1 - wallInset

      if (ix1 > ix0 && iy1 > iy0) {
        const spacing = isSolidLayer ? currentLineWidth : infillSpacing
        lines.push(isSolidLayer ? '; SOLID-FILL' : '; INFILL')

        // Lines along X (or both for grid / solid)
        const doX = infillPattern === 'grid' || isSolidLayer || layer % 2 === 0
        const doY = infillPattern === 'grid' || isSolidLayer || layer % 2 === 1

        if (doX) {
          let row = 0
          for (let y = iy0; y <= iy1; y += spacing) {
            const yc = Math.min(y, iy1)
            const ltr = row % 2 === 0
            const sx = ltr ? ix0 : ix1
            const ex = ltr ? ix1 : ix0
            move(sx, yc, z)
            unretract()
            extrude(ex, yc, currentSpeed, currentERate)
            retract()
            row++
          }
        }

        if (doY && infillPattern === 'grid') {
          let col = 0
          for (let x = ix0; x <= ix1; x += spacing) {
            const xc = Math.min(x, ix1)
            const btt = col % 2 === 0
            const sy = btt ? iy0 : iy1
            const ey = btt ? iy1 : iy0
            move(xc, sy, z)
            unretract()
            extrude(xc, ey, currentSpeed, currentERate)
            retract()
            col++
          }
        }
      }
    }
  }

  // ── End G-code (Kobra X) ───────────────────────────────────────────────────
  lines.push('')
  lines.push('; END G-CODE')
  lines.push('G91')
  lines.push('G1 E-2 F2700')
  lines.push('G1 E-2 Z0.2 F2400')
  lines.push('G1 X5 Y5 F3000')
  lines.push('G1 Z10')
  lines.push('G90')
  lines.push('G1 X0 Y220 F3000')
  lines.push('M106 S0')
  lines.push('M104 S0')
  lines.push('M140 S0')
  lines.push('M84 X Y E')
  lines.push('')

  return lines.join('\n')
}
