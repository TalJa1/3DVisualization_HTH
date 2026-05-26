import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import TerrainScene from '../components/TerrainScene'
import { useModel } from '../context/ModelContext'
import { exportSTL, exportOBJ } from '../utils/exportModel'
import { generateGcode } from '../utils/exportGcode'
import './Export.css'

interface GcodeSettings {
  feedRate: number
  plungeRate: number
  safeZ: number
  toolDiameter: number
  stepover: number
  maxDepth: number
  scaleXY: number
}

const DEFAULT_GCODE: GcodeSettings = {
  feedRate: 1000,
  plungeRate: 300,
  safeZ: 5,
  toolDiameter: 3.175,
  stepover: 0.5,
  maxDepth: 10,
  scaleXY: 100,
}

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

export default function Export() {
  const navigate = useNavigate()
  const { heightmap, heightScale, polygonDetail, colorScheme, meshRef, model3D } = useModel()

  const [gcodeSettings, setGcodeSettings] = useState<GcodeSettings>(DEFAULT_GCODE)
  const [showGcode, setShowGcode] = useState(false)

  const hasContent = !!(heightmap || model3D)

  const handleExport = useCallback((fmt: 'stl' | 'obj') => {
    // Prefer the live heightmap mesh; fall back to the imported/terrain model3D group
    const target: THREE.Object3D | null = meshRef.current ?? model3D
    if (!target) return
    if (fmt === 'stl') exportSTL(target)
    else               exportOBJ(target)
  }, [meshRef, model3D])

  const handleGcodeExport = useCallback(() => {
    const geo = getExportGeometry(meshRef, model3D)
    if (!geo) return
    const gcode = generateGcode(geo, gcodeSettings)
    const blob = new Blob([gcode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'terrain.nc'
    a.click()
    URL.revokeObjectURL(url)
  }, [meshRef, model3D, gcodeSettings])

  function setField<K extends keyof GcodeSettings>(key: K, value: GcodeSettings[K]) {
    setGcodeSettings(prev => ({ ...prev, [key]: value }))
  }

  if (!hasContent) {
    return (
      <div className="export">
        <header className="export__header">
          <h1>Export / Download</h1>
          <p>No model loaded yet. Go back to the editor and upload a heightmap or capture terrain first.</p>
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

      {/* Live terrain preview — only available for heightmap */}
      {heightmap && (
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
      )}

      {/* 3D model preview */}
      {model3D && !heightmap && (
        <div className="export__preview-card">
          <div className="export__preview-canvas" style={{ padding: 0 }}>
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
          </div>
        </div>
      )}

      {/* Download options */}
      <section className="export__downloads">
        <h2>Download</h2>
        <div className="export__download-list">
          {([
            { format: 'STL' as const, desc: 'Best for 3D printing (Cura, PrusaSlicer)', icon: '🖨️' },
            { format: 'OBJ' as const, desc: 'Best for Blender, Maya, Unity, Unreal',    icon: '🎨' },
          ] as const).map(f => (
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
                disabled={!hasContent}
              >
                Download .{f.format.toLowerCase()}
              </button>
            </div>
          ))}

          {/* G-code export card */}
          <div className="export__download-card export__download-card--gcode">
            <span className="export__format-icon">⚙️</span>
            <div className="export__format-info">
              <strong>G-code (.nc)</strong>
              <p>CNC milling toolpath — raster scan, compatible with Grbl / Mach3</p>
            </div>
            <button
              type="button"
              className="btn btn--secondary export__dl-btn"
              onClick={() => setShowGcode(v => !v)}
            >
              {showGcode ? 'Hide settings' : 'Configure…'}
            </button>
          </div>

          {showGcode && (
            <div className="export__gcode-panel">
              <div className="export__gcode-grid">
                <SliderField
                  label="Feed rate"
                  unit="mm/min"
                  min={100} max={5000} step={50}
                  value={gcodeSettings.feedRate}
                  onChange={v => setField('feedRate', v)}
                />
                <SliderField
                  label="Plunge rate"
                  unit="mm/min"
                  min={50} max={1000} step={25}
                  value={gcodeSettings.plungeRate}
                  onChange={v => setField('plungeRate', v)}
                />
                <SliderField
                  label="Safe Z"
                  unit="mm"
                  min={1} max={20} step={0.5}
                  value={gcodeSettings.safeZ}
                  onChange={v => setField('safeZ', v)}
                />
                <SliderField
                  label="Tool diameter"
                  unit="mm"
                  min={0.5} max={12} step={0.125}
                  value={gcodeSettings.toolDiameter}
                  onChange={v => setField('toolDiameter', v)}
                />
                <SliderField
                  label="Stepover"
                  unit="× diameter"
                  min={0.1} max={1.0} step={0.05}
                  value={gcodeSettings.stepover}
                  onChange={v => setField('stepover', v)}
                  decimals={2}
                />
                <SliderField
                  label="Max depth"
                  unit="mm"
                  min={1} max={50} step={0.5}
                  value={gcodeSettings.maxDepth}
                  onChange={v => setField('maxDepth', v)}
                />
                <SliderField
                  label="Output size"
                  unit="mm"
                  min={10} max={500} step={5}
                  value={gcodeSettings.scaleXY}
                  onChange={v => setField('scaleXY', v)}
                  decimals={0}
                />
              </div>
              <div className="export__gcode-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleGcodeExport}
                >
                  Download terrain.nc
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/editor')}>
          ← Back to Editor
        </button>
      </div>

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

// ── small reusable slider ─────────────────────────────────────────────────────
interface SliderFieldProps {
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  decimals?: number
  onChange: (v: number) => void
}

function SliderField({ label, unit, min, max, step, value, decimals = 1, onChange }: SliderFieldProps) {
  return (
    <div className="export__gcode-field">
      <div className="export__gcode-label">
        <span>{label}</span>
        <span className="export__gcode-value">{value.toFixed(decimals)} {unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="editor__slider"
      />
    </div>
  )
}
