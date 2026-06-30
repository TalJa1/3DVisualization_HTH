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

