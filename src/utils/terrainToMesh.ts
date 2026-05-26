import * as THREE from 'three'

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
