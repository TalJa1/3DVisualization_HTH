import * as THREE from 'three'

const PRINTER_MAX_X = 220
const PRINTER_MAX_Y = 220
const PRINTER_MAX_Z = 250

function triggerDownload(content: BlobPart, filename: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function collectGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  root.updateWorldMatrix(true, true)
  const geos: THREE.BufferGeometry[] = []

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    let geo = child.geometry.clone() as THREE.BufferGeometry
    if (geo.index !== null) geo = geo.toNonIndexed()
    geo.applyMatrix4(child.matrixWorld)
    geo.computeVertexNormals()
    geos.push(geo)
  })

  return geos
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 1) return geos[0]

  let total = 0
  for (const g of geos) total += g.attributes.position.count

  const positions = new Float32Array(total * 3)
  const normals   = new Float32Array(total * 3)
  let offset = 0

  for (const g of geos) {
    const pos  = g.attributes.position as THREE.BufferAttribute
    const norm = g.attributes.normal   as THREE.BufferAttribute | undefined
    for (let i = 0; i < pos.count; i++) {
      positions[(offset + i) * 3]     = pos.getX(i)
      positions[(offset + i) * 3 + 1] = pos.getY(i)
      positions[(offset + i) * 3 + 2] = pos.getZ(i)
      if (norm) {
        normals[(offset + i) * 3]     = norm.getX(i)
        normals[(offset + i) * 3 + 1] = norm.getY(i)
        normals[(offset + i) * 3 + 2] = norm.getZ(i)
      }
    }
    offset += pos.count
    g.dispose()
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.setAttribute('normal',   new THREE.BufferAttribute(normals, 3))
  return merged
}

function fitToPrinter(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const bbox = new THREE.Box3().setFromBufferAttribute(pos)
  const size = new THREE.Vector3()
  bbox.getSize(size)

  // Three.js Y is up; in printer coords X→X, Z→Y (depth), Y→Z (height)
  const modelX = size.x || 1
  const modelY = size.z || 1
  const modelZ = size.y || 1

  const scale = Math.min(
    PRINTER_MAX_X / modelX,
    PRINTER_MAX_Y / modelY,
    PRINTER_MAX_Z / modelZ,
    1000, // don't scale up tiny models more than 1000x
  )

  if (scale >= 1000) return // already fits or essentially zero-size

  // Scale all vertices
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * scale)
    pos.setY(i, pos.getY(i) * scale)
    pos.setZ(i, pos.getZ(i) * scale)
  }
  pos.needsUpdate = true

  // Re-center on XZ plane, set bottom at Y=0
  const newBbox = new THREE.Box3().setFromBufferAttribute(pos)
  const centerX = (newBbox.min.x + newBbox.max.x) / 2
  const centerZ = (newBbox.min.z + newBbox.max.z) / 2
  const bottomY = newBbox.min.y

  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) - centerX)
    pos.setY(i, pos.getY(i) - bottomY)
    pos.setZ(i, pos.getZ(i) - centerZ)
  }
  pos.needsUpdate = true

  // Recompute normals after scaling
  geo.computeVertexNormals()
}

export function exportSTL(root: THREE.Object3D): void {
  const geos = collectGeometries(root)
  if (geos.length === 0) return
  const geo = mergeGeometries(geos)

  fitToPrinter(geo)

  const pos  = geo.attributes.position as THREE.BufferAttribute
  const norm = geo.attributes.normal   as THREE.BufferAttribute
  const triCount = pos.count / 3

  // Binary STL: 80-byte header + 4-byte tri count + 50 bytes per triangle
  const bufferSize = 84 + triCount * 50
  const buffer = new ArrayBuffer(bufferSize)
  const view = new DataView(buffer)

  // Header
  const header = 'binary STL - HuaTrienHao 3D - Anycubic Kobra X'
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0)
  }
  view.setUint32(80, triCount, true)

  let offset = 84
  for (let i = 0; i < pos.count; i += 3) {
    // Normal (from first vertex of triangle)
    view.setFloat32(offset, norm.getX(i), true); offset += 4
    view.setFloat32(offset, norm.getY(i), true); offset += 4
    view.setFloat32(offset, norm.getZ(i), true); offset += 4
    // 3 vertices
    for (let j = 0; j < 3; j++) {
      view.setFloat32(offset, pos.getX(i + j), true); offset += 4
      view.setFloat32(offset, pos.getY(i + j), true); offset += 4
      view.setFloat32(offset, pos.getZ(i + j), true); offset += 4
    }
    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2
  }

  geo.dispose()
  triggerDownload(buffer, 'terrain.stl', 'application/octet-stream')
}

export function exportOBJ(root: THREE.Object3D): void {
  const geos = collectGeometries(root)
  if (geos.length === 0) return
  const geo = mergeGeometries(geos)

  fitToPrinter(geo)

  const pos  = geo.attributes.position as THREE.BufferAttribute
  const norm = geo.attributes.normal   as THREE.BufferAttribute
  const lines: string[] = [
    '# terrain.obj - HuaTrienHao 3D',
    '# Units: mm (scaled to fit Anycubic Kobra X 220x220x250)',
    'g terrain',
  ]

  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}`)
  }
  for (let i = 0; i < norm.count; i++) {
    lines.push(`vn ${norm.getX(i).toFixed(4)} ${norm.getY(i).toFixed(4)} ${norm.getZ(i).toFixed(4)}`)
  }
  for (let i = 0; i < pos.count; i += 3) {
    const a = i + 1, b = i + 2, c = i + 3
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`)
  }

  geo.dispose()
  triggerDownload(lines.join('\n'), 'terrain.obj')
}
