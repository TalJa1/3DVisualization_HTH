import { useMemo, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import './TerrainScene.css'

// ── detail level → mesh segments ─────────────────────────────────────────────
const DETAIL_SEGMENTS: Record<number, number> = {
  1: 32, 2: 64, 3: 128, 4: 192, 5: 256,
}

// ── colour scheme helper ──────────────────────────────────────────────────────
function getVertexColor(t: number, scheme: string): [number, number, number] {
  const c = Math.max(0, Math.min(1, t))
  switch (scheme) {
    case 'greyscale':
      return [c, c, c]
    case 'heatmap':
      if (c < 0.25) return [0, c * 4, 1]
      if (c < 0.5)  return [0, 1, 1 - (c - 0.25) * 4]
      if (c < 0.75) return [(c - 0.5) * 4, 1, 0]
      return [1, 1 - (c - 0.75) * 4, 0]
    case 'ocean':
      if (c < 0.35) return [0.05, 0.2 + c * 0.4, 0.7 - c * 0.2]
      if (c < 0.55) return [0.1, 0.55, 0.2]
      if (c < 0.8)  return [0.45 + c * 0.2, 0.35 + c * 0.1, 0.1]
      return [0.9, 0.9, 0.9]
    default: // terrain
      if (c < 0.1)  return [0.15, 0.35, 0.75]
      if (c < 0.35) return [0.25 + c * 0.3, 0.55 + c * 0.1, 0.12]
      if (c < 0.65) return [0.35 + c * 0.15, 0.38 + c * 0.05, 0.1]
      if (c < 0.85) return [0.55 + c * 0.2, 0.42, 0.25]
      return [0.95, 0.95, 0.95]
  }
}

// ── inner terrain mesh ────────────────────────────────────────────────────────
interface TerrainMeshProps {
  heightmapData: Float32Array
  mapWidth: number
  mapHeight: number
  heightScale: number
  colorScheme: string
  polygonDetail: number
  meshRef: React.MutableRefObject<THREE.Mesh | null>
  wireframe?: boolean
}

function TerrainMesh({
  heightmapData, mapWidth, mapHeight,
  heightScale, colorScheme, polygonDetail, meshRef, wireframe = false,
}: TerrainMeshProps) {
  const segments = DETAIL_SEGMENTS[polygonDetail] ?? 128

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(10, 10, segments, segments)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position as THREE.BufferAttribute
    const count = pos.count
    const rawHeights = new Float32Array(count)
    let minH = Infinity, maxH = -Infinity

    // first pass – collect raw heights
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const u = (x + 5) / 10
      const v = (z + 5) / 10
      const px = Math.min(Math.floor(u * (mapWidth - 1)), mapWidth - 1)
      const py = Math.min(Math.floor(v * (mapHeight - 1)), mapHeight - 1)
      const h = heightmapData[py * mapWidth + px] ?? 0
      rawHeights[i] = h
      if (h < minH) minH = h
      if (h > maxH) maxH = h
    }

    // second pass – apply heights + vertex colours
    const range = maxH - minH || 1
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const normalizedH = (rawHeights[i] - minH) / range
      pos.setY(i, normalizedH * heightScale * 4)
      const [r, g, b] = getVertexColor(normalizedH, colorScheme)
      colors[i * 3]     = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }

    pos.needsUpdate = true
    geo.computeVertexNormals()
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [heightmapData, mapWidth, mapHeight, heightScale, colorScheme, segments])

  // dispose old geometry when it changes
  useEffect(() => () => { geometry.dispose() }, [geometry])

  return (
    <mesh ref={meshRef as React.Ref<THREE.Mesh>} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.85} metalness={0.05} wireframe={wireframe} />
    </mesh>
  )
}

// ── exported scene ────────────────────────────────────────────────────────────
export interface TerrainSceneProps {
  heightmapData: Float32Array | null
  mapWidth: number
  mapHeight: number
  heightScale: number
  colorScheme: string
  polygonDetail: number
  meshRef: React.MutableRefObject<THREE.Mesh | null>
  wireframe?: boolean
  autoRotate?: boolean
  showGrid?: boolean
  lightIntensity?: number
}

export default function TerrainScene({
  heightmapData, mapWidth, mapHeight,
  heightScale, colorScheme, polygonDetail, meshRef,
  wireframe = false,
  autoRotate = false,
  showGrid = true,
  lightIntensity = 1.6,
}: TerrainSceneProps) {
  return (
    <div className="terrain-canvas">
      <Canvas
        camera={{ position: [8, 6, 8], fov: 50 }}
        shadows
        gl={{ preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#0e0f14']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={lightIntensity} castShadow />
        <hemisphereLight args={['#8cb4d2', '#0e0f14', 0.25] as unknown as []} />

        {heightmapData ? (
          <TerrainMesh
            heightmapData={heightmapData}
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            heightScale={heightScale}
            colorScheme={colorScheme}
            polygonDetail={polygonDetail}
            meshRef={meshRef}
            wireframe={wireframe}
          />
        ) : (
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[10, 10, 32, 32]} />
            <meshStandardMaterial color="#1a1b2e" wireframe />
          </mesh>
        )}

        {showGrid && <gridHelper args={[20, 20, '#2e2e4e', '#1a1b2e']} />}
        <OrbitControls makeDefault enableDamping dampingFactor={0.06} autoRotate={autoRotate} autoRotateSpeed={1.5} />
      </Canvas>
    </div>
  )
}
