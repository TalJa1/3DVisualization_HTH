import { createContext, useContext, useState, useRef } from 'react'
import type { ReactNode, MutableRefObject } from 'react'
import * as THREE from 'three'

export interface HeightmapState {
  data: Float32Array
  width: number
  height: number
  fileName: string
}

export interface TerrainCapture {
  data: Float32Array
  bbox: { north: number; south: number; east: number; west: number }
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
}

const ModelContext = createContext<ModelContextValue | null>(null)

export function ModelProvider({ children }: { children: ReactNode }) {
  const [heightmap,     setHeightmap]     = useState<HeightmapState | null>(null)
  const [model3D,       setModel3D]       = useState<THREE.Group | null>(null)
  const [heightScale,   setHeightScale]   = useState(1)
  const [polygonDetail, setPolygonDetail] = useState(3)
  const [colorScheme,   setColorScheme]   = useState('terrain')
  const [terrainData,   setTerrainData]   = useState<TerrainCapture | null>(null)
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
