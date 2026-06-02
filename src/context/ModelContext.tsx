import { createContext, useContext, useState, useRef } from 'react'
import type { ReactNode, MutableRefObject } from 'react'
import * as THREE from 'three'

export interface HeightmapState {
  data: Float32Array
  width: number
  height: number
  fileName: string
}

export interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
}

export interface TerrainCapture {
  data: Float32Array
  bbox: BoundingBox
}

interface ModelContextValue {
  heightmap: HeightmapState | null
  setHeightmap: (h: HeightmapState | null) => void
  model3D: THREE.Group | null
  setModel3D: (m: THREE.Group | null) => void
  heightScale: number
  setHeightScale: (v: number) => void
  polygonDetail: number
  setPolygonDetail: (v: number) => void
  colorScheme: string
  setColorScheme: (v: string) => void
  meshRef: MutableRefObject<THREE.Mesh | null>
  terrainData: TerrainCapture | null
  setTerrainData: (t: TerrainCapture | null) => void
  // Persisted map view state
  mapCenter: [number, number]
  setMapCenter: (c: [number, number]) => void
  mapZoom: number
  setMapZoom: (z: number) => void
  savedBbox: BoundingBox | null
  setSavedBbox: (b: BoundingBox | null) => void
}

const ModelContext = createContext<ModelContextValue | null>(null)

export function ModelProvider({ children }: { children: ReactNode }) {
  const [heightmap,     setHeightmap]     = useState<HeightmapState | null>(null)
  const [model3D,       setModel3D]       = useState<THREE.Group | null>(null)
  const [heightScale,   setHeightScale]   = useState(1)
  const [polygonDetail, setPolygonDetail] = useState(3)
  const [colorScheme,   setColorScheme]   = useState('terrain')
  const [terrainData,   setTerrainData]   = useState<TerrainCapture | null>(null)
  const [mapCenter,     setMapCenter]     = useState<[number, number]>([20, 0])
  const [mapZoom,       setMapZoom]       = useState(3)
  const [savedBbox,     setSavedBbox]     = useState<BoundingBox | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)

  return (
    <ModelContext.Provider value={{
      heightmap, setHeightmap,
      model3D, setModel3D,
      heightScale, setHeightScale,
      polygonDetail, setPolygonDetail,
      colorScheme, setColorScheme,
      meshRef,
      terrainData, setTerrainData,
      mapCenter, setMapCenter,
      mapZoom, setMapZoom,
      savedBbox, setSavedBbox,
    }}>
      {children}
    </ModelContext.Provider>
  )
}

export function useModel() {
  const ctx = useContext(ModelContext)
  if (!ctx) throw new Error('useModel must be used inside ModelProvider')
  return ctx
}
