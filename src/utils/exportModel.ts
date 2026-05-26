import * as THREE from 'three'

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Collect all mesh geometries from an Object3D tree, baking each mesh's
 * world transform into the geometry so the export is in world-space.
 */
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

  // Count total vertices
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

export function exportSTL(root: THREE.Object3D): void {
  const geos = collectGeometries(root)
  if (geos.length === 0) return
  const geo  = mergeGeometries(geos)

  const pos  = geo.attributes.position as THREE.BufferAttribute
  const norm = geo.attributes.normal   as THREE.BufferAttribute
  const lines: string[] = ['solid terrain']

  for (let i = 0; i < pos.count; i += 3) {
    lines.push(
      `  facet normal ${norm.getX(i).toFixed(6)} ${norm.getY(i).toFixed(6)} ${norm.getZ(i).toFixed(6)}`,
      '    outer loop',
    )
    for (let j = 0; j < 3; j++) {
      lines.push(
        `      vertex ${pos.getX(i+j).toFixed(6)} ${pos.getY(i+j).toFixed(6)} ${pos.getZ(i+j).toFixed(6)}`,
      )
    }
    lines.push('    endloop', '  endfacet')
  }
  lines.push('endsolid terrain')
  geo.dispose()
  triggerDownload(lines.join('\n'), 'terrain.stl')
}

export function exportOBJ(root: THREE.Object3D): void {
  const geos = collectGeometries(root)
  if (geos.length === 0) return
  const geo  = mergeGeometries(geos)

  const pos  = geo.attributes.position as THREE.BufferAttribute
  const norm = geo.attributes.normal   as THREE.BufferAttribute
  const lines: string[] = ['# terrain.obj', 'g terrain']

  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`)
  }
  for (let i = 0; i < norm.count; i++) {
    lines.push(`vn ${norm.getX(i).toFixed(6)} ${norm.getY(i).toFixed(6)} ${norm.getZ(i).toFixed(6)}`)
  }
  for (let i = 0; i < pos.count; i += 3) {
    const a = i+1, b = i+2, c = i+3
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`)
  }

  geo.dispose()
  triggerDownload(lines.join('\n'), 'terrain.obj')
}
