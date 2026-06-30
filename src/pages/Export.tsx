import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import TerrainScene from '../components/TerrainScene'
import { useModel } from '../context/ModelContext'
import { exportSTL, exportOBJ } from '../utils/exportModel'
import './Export.css'

function getExportGeometry(
  meshRef: React.MutableRefObject<THREE.Mesh | null>,
  model3D: THREE.Group | null,
): THREE.BufferGeometry | null {
  if (meshRef.current) return meshRef.current.geometry
  if (model3D) {
    let geo: THREE.BufferGeometry | null = null
    model3D.traverse((obj) => {
      if (!geo && obj instanceof THREE.Mesh) geo = obj.geometry
    })
    return geo
  }
  return null
}

interface ModelStats {
  vertices: number
  triangles: number
}

function computeStats(geo: THREE.BufferGeometry): ModelStats {
  const vertices = geo.attributes.position?.count ?? 0
  const triangles = geo.index ? geo.index.count / 3 : vertices / 3
  return { vertices, triangles: Math.round(triangles) }
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

const FORMATS = [
  {
    format: 'STL' as const,
    title: 'STL',
    desc: 'Industry standard for 3D printing. Import into Cura, PrusaSlicer, Bambu Studio or any slicer.',
    tag: '3D Printing',
  },
  {
    format: 'OBJ' as const,
    title: 'OBJ',
    desc: 'Universal mesh format with normals. Ideal for Blender, Maya, Cinema 4D, Unity and Unreal.',
    tag: 'DCC / Game Engines',
  },
]

export default function Export() {
  const navigate = useNavigate()
  const { heightmap, heightScale, polygonDetail, colorScheme, meshRef, model3D } = useModel()

  const [stats, setStats] = useState<ModelStats | null>(null)
  const hasContent = !!(heightmap || model3D)

  // The export geometry comes from a ref populated once the 3D canvas mounts,
  // so poll briefly until it's available, then compute mesh statistics.
  useEffect(() => {
    if (!hasContent) return
    let attempts = 0
    const id = window.setInterval(() => {
      const geo = getExportGeometry(meshRef, model3D)
      if (geo) {
        setStats(computeStats(geo))
        window.clearInterval(id)
      } else if (++attempts > 20) {
        window.clearInterval(id)
      }
    }, 150)
    return () => window.clearInterval(id)
  }, [hasContent, meshRef, model3D])

  const handleExport = useCallback((fmt: 'stl' | 'obj') => {
    const target: THREE.Object3D | null = meshRef.current ?? model3D
    if (!target) return
    if (fmt === 'stl') exportSTL(target)
    else               exportOBJ(target)
  }, [meshRef, model3D])

  if (!hasContent) {
    return (
      <div className="export">
        <div className="export__empty">
          <div className="export__empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 21 8v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" />
            </svg>
          </div>
          <h1>Nothing to export yet</h1>
          <p>Head back to the editor and import a heightmap or 3D model first. Your model will appear here ready to download.</p>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/editor')}>
            Open the Editor
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="export">
      <header className="export__header">
        <div>
          <span className="export__eyebrow">Finish</span>
          <h1>Export &amp; Download</h1>
          <p>Your model is ready. Preview it below and download in a production-ready format.</p>
        </div>
        <button type="button" className="btn btn--ghost export__back" onClick={() => navigate('/editor')}>
          ← Back to Editor
        </button>
      </header>

      <div className="export__layout">
        {/* ── Preview ── */}
        <div className="export__preview-card">
          <div className="export__preview-canvas">
            {heightmap ? (
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
            ) : (
              <TerrainScene
                heightmapData={null}
                mapWidth={0}
                mapHeight={0}
                heightScale={1}
                colorScheme="terrain"
                polygonDetail={3}
                meshRef={meshRef}
                model3D={model3D}
                autoRotate={true}
                showGrid={false}
              />
            )}
            <span className="export__preview-badge">Live preview</span>
          </div>
        </div>

        {/* ── Sidebar: stats + downloads ── */}
        <aside className="export__sidebar">
          <section className="export__stats-card">
            <h2 className="export__card-title">Model Details</h2>
            <dl className="export__stats">
              <div className="export__stat">
                <dt>Source</dt>
                <dd>{heightmap ? 'Heightmap' : '3D Model'}</dd>
              </div>
              <div className="export__stat">
                <dt>Vertices</dt>
                <dd>{stats ? formatNumber(stats.vertices) : '—'}</dd>
              </div>
              <div className="export__stat">
                <dt>Triangles</dt>
                <dd>{stats ? formatNumber(stats.triangles) : '—'}</dd>
              </div>
              <div className="export__stat">
                <dt>Build volume</dt>
                <dd>Auto-fit 220×220×250mm</dd>
              </div>
            </dl>
          </section>

          <section className="export__downloads">
            <h2 className="export__card-title">Download</h2>
            <div className="export__download-list">
              {FORMATS.map(f => (
                <div key={f.format} className="export__download-card">
                  <div className="export__format-head">
                    <span className="export__format-ext">.{f.format.toLowerCase()}</span>
                    <span className="export__format-tag">{f.tag}</span>
                  </div>
                  <p className="export__format-desc">{f.desc}</p>
                  <button
                    type="button"
                    className="btn btn--primary export__dl-btn"
                    onClick={() => handleExport(f.format.toLowerCase() as 'stl' | 'obj')}
                  >
                    Download {f.title}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* ── Guidance ── */}
      <section className="export__guide">
        <h2 className="export__card-title">From file to print</h2>
        <div className="export__steps">
          <div className="export__step">
            <span className="export__step-num">1</span>
            <div>
              <strong>Download the STL</strong>
              <p>It's already centered and scaled to fit a standard 220×220×250mm build plate.</p>
            </div>
          </div>
          <div className="export__step">
            <span className="export__step-num">2</span>
            <div>
              <strong>Slice it</strong>
              <p>Open the file in Cura, PrusaSlicer or Bambu Studio to set infill, supports and material.</p>
            </div>
          </div>
          <div className="export__step">
            <span className="export__step-num">3</span>
            <div>
              <strong>Print</strong>
              <p>Send the sliced job to your printer via USB, SD card or network and start the print.</p>
            </div>
          </div>
        </div>
        <p className="export__guide-note">
          Working in 3D software instead? Choose <strong>OBJ</strong> for full compatibility with Blender, Maya and game engines.
        </p>
      </section>
    </div>
  )
}
