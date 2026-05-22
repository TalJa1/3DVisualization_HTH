import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TerrainScene from '../components/TerrainScene'
import { useModel } from '../context/ModelContext'
import { exportSTL, exportOBJ } from '../utils/exportModel'
import './Export.css'

export default function Export() {
  const navigate = useNavigate()
  const { heightmap, heightScale, polygonDetail, colorScheme, meshRef } = useModel()

  const handleExport = useCallback((fmt: 'stl' | 'obj') => {
    const mesh = meshRef.current
    if (!mesh) return
    if (fmt === 'stl') exportSTL(mesh)
    else               exportOBJ(mesh)
  }, [meshRef])

  if (!heightmap) {
    return (
      <div className="export">
        <header className="export__header">
          <h1>Export / Download</h1>
          <p>No model loaded yet. Go back to the editor and upload a heightmap first.</p>
        </header>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/editor')}>
          ← Back to Editor
        </button>
      </div>
    )
  }

  return (
    <div className="export">
      <header className="export__header">
        <h1>Export / Download</h1>
        <p>Preview your model and download in your preferred format.</p>
      </header>

      {/* Live terrain preview */}
      <div className="export__preview-card">
        <div className="export__preview-canvas" style={{ padding: 0 }}>
          <TerrainScene
            heightmapData={heightmap.data}
            mapWidth={heightmap.width}
            mapHeight={heightmap.height}
            heightScale={heightScale}
            colorScheme={colorScheme}
            polygonDetail={polygonDetail}
            meshRef={meshRef}
            autoRotate={true}
            showGrid={false}
          />
        </div>
      </div>

      {/* Download options */}
      <section className="export__downloads">
        <h2>Download</h2>
        <div className="export__download-list">
          {[
            { format: 'STL' as const, desc: 'Best for 3D printing (Cura, PrusaSlicer)', icon: '🖨️' },
            { format: 'OBJ' as const, desc: 'Best for Blender, Maya, Unity, Unreal',    icon: '🎨' },
          ].map(f => (
            <div key={f.format} className="export__download-card">
              <span className="export__format-icon">{f.icon}</span>
              <div className="export__format-info">
                <strong>{f.format}</strong>
                <p>{f.desc}</p>
              </div>
              <button
                type="button"
                className="btn btn--primary export__dl-btn"
                onClick={() => handleExport(f.format.toLowerCase() as 'stl' | 'obj')}
              >
                Download .{f.format.toLowerCase()}
              </button>
            </div>
          ))}
        </div>
      </section>

      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/editor')}>
          ← Back to Editor
        </button>
      </div>

      {/* Instructions */}
      <section className="export__instructions">
        <h2>Importing into 3D printing software</h2>
        <ol>
          <li>Download the STL file above.</li>
          <li>Open your slicer (e.g. Cura, PrusaSlicer, Bambu Studio).</li>
          <li>Drag the STL into the build plate.</li>
          <li>Scale, rotate and set print settings as needed.</li>
          <li>Slice and send to your printer!</li>
        </ol>
      </section>
    </div>
  )
}
