import * as THREE from 'three'

/**
 * Takes an indexed terrain PlaneGeometry (already Y-displaced, with optional vertex colors)
 * and returns a new non-indexed solid geometry that includes side walls and a flat bottom cap,
 * making it watertight for 3D printing.
 *
 * @param geo      The source indexed PlaneGeometry with Y displacement applied
 * @param segments Number of segments used (PlaneGeometry segments parameter)
 */
export function addSolidBase(geo: THREE.BufferGeometry, segments: number): THREE.BufferGeometry {
  const cols = segments + 1
  const pos = geo.attributes.position as THREE.BufferAttribute

  const extraCount = segments * 4 * 6 + 6 // 4 edges × segments quads × 6 verts + 6 for bottom cap
  const ePos = new Float32Array(extraCount * 3)
  const eCol = new Float32Array(extraCount * 3)
  let vi = 0
  const [br, bg, bb] = [0.25, 0.18, 0.12] // dark earth brown for base

  const addV = (x: number, y: number, z: number) => {
    ePos[vi * 3] = x; ePos[vi * 3 + 1] = y; ePos[vi * 3 + 2] = z
    eCol[vi * 3] = br; eCol[vi * 3 + 1] = bg; eCol[vi * 3 + 2] = bb
    vi++
  }

  const wall = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
    addV(x1, y1, z1); addV(x2, y2, z2); addV(x1, 0, z1)
    addV(x2, y2, z2); addV(x2, 0, z2); addV(x1, 0, z1)
  }

  const gv = (i: number): [number, number, number] => [pos.getX(i), pos.getY(i), pos.getZ(i)]

  // Top edge (row=0), left → right
  for (let c = 0; c < segments; c++) {
    wall(...gv(c), ...gv(c + 1))
  }
  // Bottom edge (row=segments), right → left
  for (let c = segments; c > 0; c--) {
    wall(...gv(segments * cols + c), ...gv(segments * cols + c - 1))
  }
  // Left edge (col=0), front → back (row=segments → row=0)
  for (let r = segments; r > 0; r--) {
    wall(...gv(r * cols), ...gv((r - 1) * cols))
  }
  // Right edge (col=segments), back → front (row=0 → row=segments)
  for (let r = 0; r < segments; r++) {
    wall(...gv(r * cols + segments), ...gv((r + 1) * cols + segments))
  }

  // Bottom cap at Y=0 using actual geometry bounds
  const bx0 = pos.getX(0)
  const bz0 = pos.getZ(0)
  const bx1 = pos.getX(cols * cols - 1)
  const bz1 = pos.getZ(cols * cols - 1)
  addV(bx0, 0, bz0); addV(bx1, 0, bz1); addV(bx1, 0, bz0)
  addV(bx0, 0, bz0); addV(bx0, 0, bz1); addV(bx1, 0, bz1)

  // Flatten the indexed top surface and merge everything
  const topNI = geo.toNonIndexed()
  const tPos = topNI.attributes.position as THREE.BufferAttribute
  const tCol = geo.hasAttribute('color') ? topNI.attributes.color as THREE.BufferAttribute : null
  const total = tPos.count + vi

  const aPos = new Float32Array(total * 3)
  const aCol = new Float32Array(total * 3)
  aPos.set(tPos.array as Float32Array)
  aPos.set(ePos.subarray(0, vi * 3), tPos.count * 3)
  if (tCol) aCol.set(tCol.array as Float32Array)
  aCol.set(eCol.subarray(0, vi * 3), tPos.count * 3)

  const solid = new THREE.BufferGeometry()
  solid.setAttribute('position', new THREE.BufferAttribute(aPos, 3))
  solid.setAttribute('color', new THREE.BufferAttribute(aCol, 3))
  solid.computeVertexNormals()
  topNI.dispose()
  return solid
}

export function buildTerrainGeometry(
  heightmapData: Float32Array,
  gridSize: number = 32,
  verticalScale: number = 0.005,
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(10, 10, gridSize - 1, gridSize - 1)

  // Rotate flat XY plane to face up (XZ plane)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.attributes.position as THREE.BufferAttribute
  const count = positions.count

  // Find min elevation for normalisation
  let minElev = Infinity
  for (let i = 0; i < count; i++) {
    const elev = heightmapData[i] ?? 0
    if (elev < minElev) minElev = elev
  }

  // Displace each vertex along Y by (elevation - minElev) * verticalScale
  for (let i = 0; i < count; i++) {
    const elev = (heightmapData[i] ?? 0) - minElev
    positions.setY(i, elev * verticalScale)
  }

  positions.needsUpdate = true
  geometry.computeVertexNormals()

  return geometry
}

export function getElevationColor(
  elevation: number,
  minElev: number,
  maxElev: number,
): THREE.Color {
  const range = maxElev - minElev || 1
  const t = Math.max(0, Math.min(1, (elevation - minElev) / range))

  // Colour stops: [t, r, g, b] in linear [0,1]
  const stops: [number, number, number, number][] = [
    [0.00, 0.13, 0.40, 0.13], // #214d21 deep green
    [0.45, 0.35, 0.55, 0.20], // #598c33 mid green
    [0.60, 0.55, 0.40, 0.20], // #8c6633 brown
    [0.80, 0.60, 0.50, 0.40], // #998066 grey-brown
    [0.90, 0.78, 0.78, 0.78], // #c8c8c8 light grey
    [1.00, 1.00, 1.00, 1.00], // #ffffff white snow
  ]

  // Find the two stops that bracket t and lerp between them
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }

  const span = hi[0] - lo[0] || 1
  const f = (t - lo[0]) / span

  return new THREE.Color(
    lo[1] + (hi[1] - lo[1]) * f,
    lo[2] + (hi[2] - lo[2]) * f,
    lo[3] + (hi[3] - lo[3]) * f,
  )
}
