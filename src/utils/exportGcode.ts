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

// ── Mask contour tracing (so layer outlines follow the real terrain shape) ──
interface Pt { x: number; y: number }

function computeDistanceField(active: Uint8Array, cellRes: number): Int32Array {
  const dist = new Int32Array(cellRes * cellRes).fill(-1)
  const queue: number[] = []
  for (let cy = 0; cy < cellRes; cy++) {
    for (let cx = 0; cx < cellRes; cx++) {
      const idx = cy * cellRes + cx
      if (!active[idx]) continue
      const onEdge =
        cx === 0 || cy === 0 || cx === cellRes - 1 || cy === cellRes - 1 ||
        !active[idx - 1] || !active[idx + 1] || !active[idx - cellRes] || !active[idx + cellRes]
      if (onEdge) {
        dist[idx] = 0
        queue.push(idx)
      }
    }
  }
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const cx = idx % cellRes
    const d = dist[idx]
    const candidates = [idx - 1, idx + 1, idx - cellRes, idx + cellRes]
    for (const n of candidates) {
      if (n < 0 || n >= active.length) continue
      const ncx = n % cellRes
      if (Math.abs(ncx - cx) > 1) continue
      if (active[n] && dist[n] === -1) {
        dist[n] = d + 1
        queue.push(n)
      }
    }
  }
  return dist
}

function maskAtRadius(active: Uint8Array, dist: Int32Array, radiusCells: number): Uint8Array {
  const out = new Uint8Array(active.length)
  for (let i = 0; i < active.length; i++) {
    if (active[i] && dist[i] >= radiusCells) out[i] = 1
  }
  return out
}

// Traces closed boundary loops of a binary cell mask (square/marching-squares style),
// so the outline follows the real (possibly irregular) terrain shape instead of a bbox.
function traceContours(
  mask: Uint8Array, cellRes: number,
  cellSizeX: number, cellSizeY: number, offsetX: number, offsetY: number,
): Pt[][] {
  const isActive = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < cellRes && cy < cellRes && mask[cy * cellRes + cx] === 1
  const corner = (cx: number, cy: number): Pt => ({ x: offsetX + cx * cellSizeX, y: offsetY + cy * cellSizeY })
  const vkey = (cx: number, cy: number) => `${cx},${cy}`

  const edges = new Map<string, { to: string; pt: Pt }>()
  for (let cy = 0; cy < cellRes; cy++) {
    for (let cx = 0; cx < cellRes; cx++) {
      if (!isActive(cx, cy)) continue
      if (!isActive(cx, cy - 1)) edges.set(vkey(cx, cy), { to: vkey(cx + 1, cy), pt: corner(cx, cy) })
      if (!isActive(cx + 1, cy)) edges.set(vkey(cx + 1, cy), { to: vkey(cx + 1, cy + 1), pt: corner(cx + 1, cy) })
      if (!isActive(cx, cy + 1)) edges.set(vkey(cx + 1, cy + 1), { to: vkey(cx, cy + 1), pt: corner(cx + 1, cy + 1) })
      if (!isActive(cx - 1, cy)) edges.set(vkey(cx, cy + 1), { to: vkey(cx, cy), pt: corner(cx, cy + 1) })
    }
  }

  const visited = new Set<string>()
  const loops: Pt[][] = []
  const maxSteps = cellRes * cellRes * 4
  for (const startKey of edges.keys()) {
    if (visited.has(startKey)) continue
    const loop: Pt[] = []
    let curKey = startKey
    let steps = 0
    while (edges.has(curKey) && !visited.has(curKey) && steps < maxSteps) {
      visited.add(curKey)
      const e = edges.get(curKey)!
      loop.push(e.pt)
      curKey = e.to
      steps++
    }
    if (loop.length >= 3) loops.push(simplifyLoop(loop))
  }
  return loops
}

function simplifyLoop(loop: Pt[]): Pt[] {
  if (loop.length < 3) return loop
  const out: Pt[] = []
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length]
    const cur = loop[i]
    const next = loop[(i + 1) % loop.length]
    const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y
    const dx2 = next.x - cur.x, dy2 = next.y - cur.y
    if (Math.abs(dx1 * dy2 - dy1 * dx2) > 1e-6) out.push(cur)
  }
  return out.length >= 3 ? out : loop
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

    // ── Contour-following walls + infill ─────────────────────────────────────
    // The active mask is irregular (it follows the real terrain heightfield),
    // so walls/infill are traced from the mask itself instead of its bbox.
    const cellSizeAvg = (cellSizeX + cellSizeY) / 2
    const dist = computeDistanceField(active, cellRes)

    // ── Perimeters (walls), each successive wall eroded inward by one line width
    let innermostRadiusCells = 0
    for (let w = 0; w < wallCount; w++) {
      const inset = currentLineWidth * (w + 0.5)
      const radiusCells = inset / cellSizeAvg
      const wallMask = maskAtRadius(active, dist, radiusCells)
      const loops = traceContours(wallMask, cellRes, cellSizeX, cellSizeY, offsetX, offsetY)
      if (loops.length === 0) break
      innermostRadiusCells = inset / cellSizeAvg

      lines.push(w === 0 ? '; WALL-OUTER' : '; WALL-INNER')
      const wallSpeed = w === 0 ? currentSpeed * 0.6 : currentSpeed * 0.85
      for (const loop of loops) {
        move(loop[0].x, loop[0].y, z)
        unretract()
        for (let i = 1; i < loop.length; i++) extrude(loop[i].x, loop[i].y, wallSpeed, currentERate)
        extrude(loop[0].x, loop[0].y, wallSpeed, currentERate)
        retract()
      }
    }

    // ── Infill (scanline, clipped to the eroded mask so it follows the terrain edge)
    if (infillPercent > 0) {
      const infillRadiusCells = wallCount > 0
        ? innermostRadiusCells + currentLineWidth / cellSizeAvg
        : 0
      const infillMask = maskAtRadius(active, dist, infillRadiusCells)
      const spacing = isSolidLayer ? currentLineWidth : infillSpacing
      lines.push(isSolidLayer ? '; SOLID-FILL' : '; INFILL')

      const doX = infillPattern === 'grid' || isSolidLayer || layer % 2 === 0
      const doY = infillPattern === 'grid' || isSolidLayer || layer % 2 === 1

      if (doX) {
        const rowStep = Math.max(1, Math.round(spacing / cellSizeY))
        let rowIdx = 0
        for (let cy = 0; cy < cellRes; cy += rowStep) {
          const yc = offsetY + (cy + 0.5) * cellSizeY
          const ltr = rowIdx % 2 === 0
          const cxRange = ltr
            ? Array.from({ length: cellRes }, (_, i) => i)
            : Array.from({ length: cellRes }, (_, i) => cellRes - 1 - i)
          let spanStart = -1
          for (const cx of cxRange) {
            const isOn = infillMask[cy * cellRes + cx] === 1
            if (isOn && spanStart === -1) spanStart = cx
            if ((!isOn || cx === cxRange[cxRange.length - 1]) && spanStart !== -1) {
              const endCx = isOn ? cx : cx + (ltr ? -1 : 1)
              const x0 = offsetX + (Math.min(spanStart, endCx)) * cellSizeX
              const x1 = offsetX + (Math.max(spanStart, endCx) + 1) * cellSizeX
              const sx = ltr ? x0 : x1
              const ex = ltr ? x1 : x0
              move(sx, yc, z)
              unretract()
              extrude(ex, yc, currentSpeed, currentERate)
              retract()
              spanStart = -1
            }
          }
          rowIdx++
        }
      }

      if (doY && infillPattern === 'grid') {
        const colStep = Math.max(1, Math.round(spacing / cellSizeX))
        let colIdx = 0
        for (let cx = 0; cx < cellRes; cx += colStep) {
          const xc = offsetX + (cx + 0.5) * cellSizeX
          const btt = colIdx % 2 === 0
          const cyRange = btt
            ? Array.from({ length: cellRes }, (_, i) => i)
            : Array.from({ length: cellRes }, (_, i) => cellRes - 1 - i)
          let spanStart = -1
          for (const cy of cyRange) {
            const isOn = infillMask[cy * cellRes + cx] === 1
            if (isOn && spanStart === -1) spanStart = cy
            if ((!isOn || cy === cyRange[cyRange.length - 1]) && spanStart !== -1) {
              const endCy = isOn ? cy : cy + (btt ? -1 : 1)
              const y0 = offsetY + (Math.min(spanStart, endCy)) * cellSizeY
              const y1 = offsetY + (Math.max(spanStart, endCy) + 1) * cellSizeY
              const sy = btt ? y0 : y1
              const ey = btt ? y1 : y0
              move(xc, sy, z)
              unretract()
              extrude(xc, ey, currentSpeed, currentERate)
              retract()
              spanStart = -1
            }
          }
          colIdx++
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
