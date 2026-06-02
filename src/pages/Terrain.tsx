import { useNavigate } from 'react-router-dom'
import MapTerrainTab from '../components/MapTerrainTab'
import type { BoundingBox } from '../context/ModelContext'
import { useModel } from '../context/ModelContext'
import './Terrain.css'

export default function Terrain() {
  const navigate = useNavigate()
  const { setTerrainData } = useModel()

  function handleTerrainCapture(heightmap: Float32Array, bbox: BoundingBox) {
    setTerrainData({ data: heightmap, bbox })
    navigate('/editor')
  }

  return (
    <div className="terrain-page">
      <MapTerrainTab onTerrainCapture={handleTerrainCapture} />
    </div>
  )
}
