import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import TerrainScene from '../components/TerrainScene'
import { useModel } from '../context/ModelContext'
import { exportSTL, exportOBJ } from '../utils/exportModel'
import {
  generateGcode,
  clampToPrinter,
  DEFAULT_GCODE_SETTINGS,
  FILAMENT_PRESETS,
  type GcodeSettings,
  type FilamentType,
} from '../utils/exportGcode'
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

const FILAMENT_OPTIONS: FilamentType[] = ['PLA', 'PETG', 'ABS', 'TPU', 'SilkPLA']
const NOZZLE_OPTIONS = [0.25, 0.4, 0.6, 0.8]
const LAYER_OPTIONS = [0.1, 0.2, 0.3]

export default function Export() {
  const navigate = useNavigate()
  const { heightmap, heightScale, polygonDetail, colorScheme, meshRef, model3D } = useModel()

  const [gcodeSettings, setGcodeSettings] = useState<GcodeSettings>(DEFAULT_GCODE_SETTINGS)
  const [showGcode, setShowGcode] = useState(false)

  const hasContent = !!(heightmap || model3D)
  const preset = FILAMENT_PRESETS[gcodeSettings.filament]

  const handleExport = useCallback((fmt: 'stl' | 'obj') => {
    const target: THREE.Object3D | null = meshRef.current ?? model3D
    if (!target) return
    if (fmt === 'stl') exportSTL(target)
    else               exportOBJ(target)
  }, [meshRef, model3D])

  const handleGcodeExport = useCallback(() => {
    const geo = getExportGeometry(meshRef, model3D)
    if (!geo) return
    const clamped = clampToPrinter(gcodeSettings)
    const gcode = generateGcode(geo, clamped)
    const blob = new Blob([gcode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'terrain.gcode'
    a.click()
    URL.revokeObjectURL(url)
  }, [meshRef, model3D, gcodeSettings])

  function setField<K extends keyof GcodeSettings>(key: K, value: GcodeSettings[K]) {
    setGcodeSettings(prev => ({ ...prev, [key]: value }))
  }

  function applyFilamentPreset(filament: FilamentType) {
    const p = FILAMENT_PRESETS[filament]
    setGcodeSettings(prev => ({
      ...prev,
      filament,
      printSpeed: p.printSpeed,
    }))
  }

  if (!hasContent) {
    return (
      <div className="export">
        <header className="export__header">
          <h1>Export / Download</h1>
          <p>No model loaded yet. Go back to the editor and upload a heightmap or capture terrain first.</p>
        </header>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/editor')}>
          &larr; Back to Editor
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
              <strong>G-code (.gcode)</strong>
              <p>Anycubic Kobra X — Marlin FDM, direct print ready (max 220x220x250mm)</p>
            </div>
            <button
              type="button"
              className="btn btn--secondary export__dl-btn"
              onClick={() => setShowGcode(v => !v)}
            >
              {showGcode ? 'Hide settings' : 'Configure...'}
            </button>
          </div>

          {showGcode && (
            <div className="export__gcode-panel">
              <div className="export__gcode-grid">
                {/* Filament type */}
                <div className="export__gcode-field">
                  <div className="export__gcode-label">
                    <span>Filament</span>
                    <span className="export__gcode-value">{preset.label}</span>
                  </div>
                  <div className="export__gcode-options">
                    {FILAMENT_OPTIONS.map(ft => (
                      <button
                        key={ft}
                        type="button"
                        className={`btn btn--sm ${gcodeSettings.filament === ft ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => applyFilamentPreset(ft)}
                      >
                        {FILAMENT_PRESETS[ft].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nozzle size */}
                <div className="export__gcode-field">
                  <div className="export__gcode-label">
                    <span>Nozzle</span>
                    <span className="export__gcode-value">{gcodeSettings.nozzleDiameter} mm</span>
                  </div>
                  <div className="export__gcode-options">
                    {NOZZLE_OPTIONS.map(n => (
                      <button
                        key={n}
                        type="button"
                        className={`btn btn--sm ${gcodeSettings.nozzleDiameter === n ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => setField('nozzleDiameter', n)}
                      >
                        {n} mm
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layer height */}
                <div className="export__gcode-field">
                  <div className="export__gcode-label">
                    <span>Layer height</span>
                    <span className="export__gcode-value">{gcodeSettings.layerHeight} mm</span>
                  </div>
                  <div className="export__gcode-options">
                    {LAYER_OPTIONS.map(lh => (
                      <button
                        key={lh}
                        type="button"
                        className={`btn btn--sm ${gcodeSettings.layerHeight === lh ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => {
                          setField('layerHeight', lh)
                          setField('firstLayerHeight', lh)
                        }}
                      >
                        {lh} mm {lh === 0.1 ? '(Fine)' : lh === 0.3 ? '(Draft)' : '(Std)'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Temps (read-only from preset) */}
                <div className="export__gcode-field">
                  <div className="export__gcode-label">
                    <span>Temperatures</span>
                    <span className="export__gcode-value">Nozzle {preset.nozzleTemp}&deg;C / Bed {preset.bedTemp}&deg;C</span>
                  </div>
                </div>

                {/* Output size */}
                <SliderField
                  label="Output X"
                  unit="mm"
                  min={10} max={220} step={5}
                  value={gcodeSettings.outputSizeX}
                  onChange={v => setField('outputSizeX', v)}
                  decimals={0}
                />
                <SliderField
                  label="Output Y"
                  unit="mm"
                  min={10} max={220} step={5}
                  value={gcodeSettings.outputSizeY}
                  onChange={v => setField('outputSizeY', v)}
                  decimals={0}
                />
                <SliderField
                  label="Output Z (height)"
                  unit="mm"
                  min={5} max={250} step={5}
                  value={gcodeSettings.outputSizeZ}
                  onChange={v => setField('outputSizeZ', v)}
                  decimals={0}
                />

                {/* Print settings */}
                <SliderField
                  label="Print speed"
                  unit="mm/s"
                  min={10} max={300} step={5}
                  value={gcodeSettings.printSpeed}
                  onChange={v => setField('printSpeed', v)}
                  decimals={0}
                />
                <SliderField
                  label="Infill"
                  unit="%"
                  min={0} max={100} step={5}
                  value={gcodeSettings.infillPercent}
                  onChange={v => setField('infillPercent', v)}
                  decimals={0}
                />

                {/* Infill pattern */}
                <div className="export__gcode-field">
                  <div className="export__gcode-label">
                    <span>Infill pattern</span>
                    <span className="export__gcode-value">{gcodeSettings.infillPattern}</span>
                  </div>
                  <div className="export__gcode-options">
                    {(['lines', 'grid'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        className={`btn btn--sm ${gcodeSettings.infillPattern === p ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => setField('infillPattern', p)}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <SliderField
                  label="Walls"
                  unit=""
                  min={1} max={5} step={1}
                  value={gcodeSettings.wallCount}
                  onChange={v => setField('wallCount', v)}
                  decimals={0}
                />
                <SliderField
                  label="Top/Bottom layers"
                  unit=""
                  min={2} max={8} step={1}
                  value={gcodeSettings.topBottomLayers}
                  onChange={v => setField('topBottomLayers', v)}
                  decimals={0}
                />

                {/* Brim */}
                <div className="export__gcode-field">
                  <div className="export__gcode-label">
                    <span>Brim</span>
                    <span className="export__gcode-value">{gcodeSettings.brim ? `${gcodeSettings.brimWidth} mm` : 'Off'}</span>
                  </div>
                  <div className="export__gcode-options">
                    <button
                      type="button"
                      className={`btn btn--sm ${!gcodeSettings.brim ? 'btn--primary' : 'btn--ghost'}`}
                      onClick={() => setField('brim', false)}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${gcodeSettings.brim ? 'btn--primary' : 'btn--ghost'}`}
                      onClick={() => setField('brim', true)}
                    >
                      On
                    </button>
                  </div>
                  {gcodeSettings.brim && (
                    <input
                      type="range"
                      min={2} max={15} step={1}
                      value={gcodeSettings.brimWidth}
                      onChange={e => setField('brimWidth', Number(e.target.value))}
                      className="editor__slider"
                      style={{ marginTop: 4 }}
                    />
                  )}
                </div>
              </div>

              {/* Size warning */}
              {(gcodeSettings.outputSizeX > 220 || gcodeSettings.outputSizeY > 220 || gcodeSettings.outputSizeZ > 250) && (
                <div className="export__gcode-warning">
                  Model exceeds Kobra X build volume and will be clamped to 220x220x250mm.
                </div>
              )}

              <div className="export__gcode-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleGcodeExport}
                >
                  Download terrain.gcode
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/editor')}>
          &larr; Back to Editor
        </button>
      </div>

      <section className="export__instructions">
        <h2>Printing on Anycubic Kobra X</h2>
        <ol>
          <li>Download the .gcode file above (pre-configured for your Kobra X).</li>
          <li>Copy the .gcode file to a USB drive or SD card.</li>
          <li>Insert into Kobra X and select the file to print.</li>
          <li>The printer will auto-level (LeviQ 3.0), heat up, and start printing.</li>
        </ol>
        <p><strong>Alternatively:</strong> Download STL and import into Cura / PrusaSlicer for more control over supports, infill patterns, and multi-color printing.</p>
      </section>
    </div>
  )
}

// ── Slider component ─────────────────────────────────────────────────────────
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
