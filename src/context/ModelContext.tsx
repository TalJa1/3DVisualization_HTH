import { createContext, useContext, useState, useRef } from 'react'
import type { ReactNode, MutableRefObject } from 'react'
import * as THREE from 'three'

export interface HeightmapState {
  data: Float32Array
  width: number
  height: number
  fileName: string
}

interface ModelContextValue {
  heightmap: HeightmapState | null
  setHeightmap: (h: HeightmapState | null) => void
  heightScale: number
  setHeightScale: (v: number) => void
  polygonDetail: number
  setPolygonDetail: (v: number) => void
  colorScheme: string
  setColorScheme: (v: string) => void
  meshRef: MutableRefObject<THREE.Mesh | null>
}

const ModelContext = createContext<ModelContextValue | null>(null)

export function ModelProvider({ children }: { children: ReactNode }) {
  const [heightmap,     setHeightmap]     = useState<HeightmapState | null>(null)
  const [heightScale,   setHeightScale]   = useState(1)
  const [polygonDetail, setPolygonDetail] = useState(3)
  const [colorScheme,   setColorScheme]   = useState('terrain')
  const meshRef = useRef<THREE.Mesh | null>(null)

  return (
    <ModelContext.Provider value={{
      heightmap, setHeightmap,
      heightScale, setHeightScale,
      polygonDetail, setPolygonDetail,
      colorScheme, setColorScheme,
      meshRef,
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
