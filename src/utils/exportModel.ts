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

export function exportSTL(mesh: THREE.Mesh): void {
  let geo = mesh.geometry.clone()
  if (geo.index !== null) geo = geo.toNonIndexed()
  geo.computeVertexNormals()
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

export function exportOBJ(mesh: THREE.Mesh): void {
  let geo = mesh.geometry.clone()
  if (geo.index !== null) geo = geo.toNonIndexed()
  const pos  = geo.attributes.position as THREE.BufferAttribute
  const norm = geo.attributes.normal   as THREE.BufferAttribute | undefined
  const lines: string[] = ['# terrain.obj', 'g terrain']
  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`)
  }
  if (norm) {
    for (let i = 0; i < norm.count; i++) {
      lines.push(`vn ${norm.getX(i).toFixed(6)} ${norm.getY(i).toFixed(6)} ${norm.getZ(i).toFixed(6)}`)
    }
    for (let i = 0; i < pos.count; i += 3) {
      const a = i+1, b = i+2, c = i+3
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`)
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      lines.push(`f ${i+1} ${i+2} ${i+3}`)
    }
  }
  geo.dispose()
  triggerDownload(lines.join('\n'), 'terrain.obj')
}
