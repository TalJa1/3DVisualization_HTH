import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TerrainScene from '../components/TerrainScene'
import { useModel } from '../context/ModelContext'
import './Editor.css'

// ── heightmap parser ──────────────────────────────────────────────────────────
async function parseHeightmap(
  file: File,
): Promise<{ data: Float32Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas 2D not supported'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, img.width, img.height)
      const data = new Float32Array(img.width * img.height)
      for (let i = 0; i < img.width * img.height; i++) {
        const r = imgData.data[i * 4]
        const g = imgData.data[i * 4 + 1]
        const b = imgData.data[i * 4 + 2]
        data[i] = (r + g + b) / (3 * 255)
      }
      URL.revokeObjectURL(url)
      resolve({ data, width: img.width, height: img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

// ── constants ─────────────────────────────────────────────────────────────────
const DETAIL_LABELS: Record<number, string> = {
  1: 'Very Low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Ultra',
}
const ACCEPTED = ['png', 'jpg', 'jpeg', 'webp', 'glb', 'gltf', 'obj', 'stl', 'fbx']
const MAX_BYTES = 20 * 1024 * 1024

// ── component ─────────────────────────────────────────────────────────────────
export default function Editor() {
  const navigate = useNavigate()
  const {
    heightmap, setHeightmap,
    heightScale, setHeightScale,
    polygonDetail, setPolygonDetail,
    colorScheme, setColorScheme,
    meshRef,
  } = useModel()

  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [isDragOver,    setIsDragOver]    = useState(false)
  const [wireframe,     setWireframe]     = useState(false)
  const [autoRotate,    setAutoRotate]    = useState(false)
  const [showGrid,      setShowGrid]      = useState(true)
  const [lightIntensity, setLightIntensity] = useState(1.6)

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (file.size > MAX_BYTES) { setError('File too large — maximum 20 MB.'); return }
    if (!ACCEPTED.includes(ext)) {
      setError('Unsupported format. Upload a PNG/JPG/WebP heightmap or a GLB, GLTF, OBJ, STL, FBX model.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { data, width, height } = await parseHeightmap(file)
      setHeightmap({ data, width, height, fileName: file.name })
    } catch {
      setError('Could not parse the file. Make sure it is a valid image.')
    } finally {
      setLoading(false)
    }
  }, [setHeightmap])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="editor">
      <header className="editor__header">
        <h1>3D Map Editor</h1>
        <p>Upload a PNG/JPG heightmap — each pixel's brightness becomes terrain elevation.</p>
      </header>

      <div className="editor__workspace">
        {/* ── 3D canvas ── */}
        <div
          className={`editor__canvas-wrap${isDragOver ? ' editor__canvas-wrap--dragover' : ''}`}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
        >
          <TerrainScene
            heightmapData={heightmap?.data ?? null}
            mapWidth={heightmap?.width  ?? 0}
            mapHeight={heightmap?.height ?? 0}
            heightScale={heightScale}
            colorScheme={colorScheme}
            polygonDetail={polygonDetail}
            meshRef={meshRef}
            wireframe={wireframe}
            autoRotate={autoRotate}
            showGrid={showGrid}
            lightIntensity={lightIntensity}
          />

          {!heightmap && !loading && !isDragOver && (
            <div className="editor__overlay">
              <span className="editor__overlay-icon">🗺️</span>
              <p>Drop a heightmap image here</p>
              <p className="editor__overlay-hint">PNG · JPG · WebP · GLB · GLTF · OBJ · STL · FBX · max 20 MB</p>
            </div>
          )}

          {loading && (
            <div className="editor__overlay">
              <div className="editor__spinner" />
              <p>Processing heightmap…</p>
            </div>
          )}

          {isDragOver && (
            <div className="editor__overlay editor__overlay--drag">
              <span className="editor__overlay-icon">📂</span>
              <p>Drop to load terrain</p>
            </div>
          )}
        </div>

        {/* ── control panel ── */}
        <aside className="editor__panel">
          <h2 className="editor__panel-title">Controls</h2>

          <div className="editor__field">
            <span className="editor__label">Heightmap File</span>
            <label className="editor__upload-btn" htmlFor="dem-upload">
              ⬆ Choose file
              <input
                id="dem-upload"
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.glb,.gltf,.obj,.stl,.fbx"
                className="editor__file-hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </label>
            {heightmap && (
              <span className="editor__file-name">
                📄 {heightmap.fileName}
                <span className="editor__file-dim"> ({heightmap.width}×{heightmap.height})</span>
              </span>
            )}
            {error && <span className="editor__error" role="alert">{error}</span>}
          </div>

          <div className="editor__field">
            <label htmlFor="height-scale" className="editor__label">
              Height Scale
              <span className="editor__value">{heightScale.toFixed(1)}×</span>
            </label>
            <input
              id="height-scale"
              type="range" min="0.1" max="5" step="0.1"
              value={heightScale}
              onChange={e => setHeightScale(Number(e.target.value))}
              className="editor__slider"
            />
            <div className="editor__slider-ticks"><span>0.1×</span><span>5×</span></div>
          </div>

          <div className="editor__field">
            <label htmlFor="poly-detail" className="editor__label">
              Polygon Detail
              <span className="editor__value">{DETAIL_LABELS[polygonDetail]}</span>
            </label>
            <input
              id="poly-detail"
              type="range" min="1" max="5" step="1"
              value={polygonDetail}
              onChange={e => setPolygonDetail(Number(e.target.value))}
              className="editor__slider"
            />
          </div>

          <div className="editor__field">
            <label htmlFor="color-scheme" className="editor__label">Color Scheme</label>
            <select
              id="color-scheme"
              value={colorScheme}
              onChange={e => setColorScheme(e.target.value)}
              className="editor__select"
            >
              <option value="terrain">Terrain (default)</option>
              <option value="greyscale">Greyscale</option>
              <option value="heatmap">Heatmap</option>
              <option value="ocean">Ocean / Topo</option>
            </select>
          </div>

          <div className="editor__field">
            <label htmlFor="light-intensity" className="editor__label">
              Light Intensity
              <span className="editor__value">{lightIntensity.toFixed(1)}</span>
            </label>
            <input
              id="light-intensity"
              type="range" min="0" max="3" step="0.1"
              value={lightIntensity}
              onChange={e => setLightIntensity(Number(e.target.value))}
              className="editor__slider"
            />
            <div className="editor__slider-ticks"><span>0</span><span>3</span></div>
          </div>

          <div className="editor__field">
            <span className="editor__label">View Options</span>
            <div className="editor__toggles">
              <label className="editor__toggle">
                <input
                  type="checkbox"
                  checked={wireframe}
                  onChange={e => setWireframe(e.target.checked)}
                />
                <span>Wireframe</span>
              </label>
              <label className="editor__toggle">
                <input
                  type="checkbox"
                  checked={autoRotate}
                  onChange={e => setAutoRotate(e.target.checked)}
                />
                <span>Auto-rotate</span>
              </label>
              <label className="editor__toggle">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={e => setShowGrid(e.target.checked)}
                />
                <span>Show Grid</span>
              </label>
            </div>
          </div>

          <div className="editor__divider" />

          <div className="editor__actions">
            <button
              type="button"
              className="btn btn--primary editor__export-btn"
              onClick={() => navigate('/export')}
              disabled={!heightmap}
            >
              Go to Export →
            </button>
          </div>

          <p className="editor__tip">
            Orbit: drag · Zoom: scroll · Pan: right-click drag
          </p>
        </aside>
      </div>
    </div>
  )
}
