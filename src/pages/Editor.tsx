import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js'
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js'
import TerrainScene from '../components/TerrainScene'
import { useModel, CAPTURE_GRID } from '../context/ModelContext'
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

// ── 3D model loader ───────────────────────────────────────────────────────────
function normalizeGroup(group: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(group)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = 8 / maxDim
  group.position.sub(center.multiplyScalar(scale))
  group.scale.setScalar(scale)
  const wrapper = new THREE.Group()
  wrapper.add(group)
  return wrapper
}

async function load3DModel(file: File): Promise<THREE.Group> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const url = URL.createObjectURL(file)
  try {
    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(url)
      return normalizeGroup(gltf.scene)
    }
    if (ext === 'obj') {
      const loader = new OBJLoader()
      const group = await loader.loadAsync(url)
      return normalizeGroup(group)
    }
    if (ext === 'fbx') {
      const loader = new FBXLoader()
      const group = await loader.loadAsync(url)
      return normalizeGroup(group)
    }
    if (ext === 'stl') {
      const loader = new STLLoader()
      const geometry = await loader.loadAsync(url)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#8888aa', roughness: 0.6, metalness: 0.2 }))
      return normalizeGroup(mesh)
    }
    if (ext === 'ply') {
      const loader = new PLYLoader()
      const geometry = await loader.loadAsync(url)
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#8888aa', roughness: 0.6, metalness: 0.2, vertexColors: geometry.hasAttribute('color') }))
      return normalizeGroup(mesh)
    }
    if (ext === 'dae') {
      const loader = new ColladaLoader()
      const collada = await loader.loadAsync(url)
      const scene = collada?.scene
      if (!scene) throw new Error('Collada file has no scene.')
      return normalizeGroup(scene)
    }
    if (ext === '3ds') {
      const loader = new TDSLoader()
      const group = await loader.loadAsync(url)
      return normalizeGroup(group)
    }
    throw new Error(`Unsupported format: .${ext}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── constants ─────────────────────────────────────────────────────────────────
const DETAIL_LABELS: Record<number, string> = {
  1: 'Very Low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Ultra',
}
const HEIGHTMAP_EXTS = ['png', 'jpg', 'jpeg', 'webp']
const MODEL_EXTS     = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply', 'dae', '3ds']
const ACCEPTED       = [...HEIGHTMAP_EXTS, ...MODEL_EXTS]
const MAX_BYTES      = 100 * 1024 * 1024

// ── inline icons ────────────────────────────────────────────────────────────
const Icon = {
  wireframe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 3 21 8v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  ),
  rotate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v5h-5" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" /><path d="M3 3v5h5" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </svg>
  ),
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Editor() {
  const navigate = useNavigate()
  const {
    heightmap, setHeightmap,
    model3D, setModel3D,
    heightScale, setHeightScale,
    polygonDetail, setPolygonDetail,
    colorScheme, setColorScheme,
    meshRef,
    terrainData, setTerrainData,
  } = useModel()

  const [fileName,      setFileName]      = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [isDragOver,    setIsDragOver]    = useState(false)
  const [wireframe,     setWireframe]     = useState(false)
  const [autoRotate,    setAutoRotate]    = useState(false)
  const [showGrid,      setShowGrid]      = useState(true)
  const [lightIntensity, setLightIntensity] = useState(1.6)
  const [posX, setPosX] = useState(0)
  const [posY, setPosY] = useState(0)
  const [posZ, setPosZ] = useState(0)

  // Every new file/capture starts from the same default view config — settings
  // tuned for the previous model should never silently carry over to the next one.
  const resetViewConfig = useCallback(() => {
    setHeightScale(1)
    setPolygonDetail(1)
    setColorScheme('terrain')
    setWireframe(false)
    setAutoRotate(false)
    setShowGrid(true)
    setLightIntensity(1.6)
    setPosX(0)
    setPosY(0)
    setPosZ(0)
  }, [setHeightScale, setPolygonDetail, setColorScheme])

  // Route captured map terrain through the same reactive heightmap pipeline as
  // PNG uploads, so Height Scale / Color Scheme / Polygon Detail all apply live —
  // previously this baked a static mesh at a fixed scale, disconnected from the controls.
  useEffect(() => {
    if (!terrainData) return
    const { data, bbox } = terrainData
    const label = `Map capture — ${bbox.north.toFixed(3)}°N, ${bbox.west.toFixed(3)}°E`
    setModel3D(null)
    setHeightmap({ data, width: CAPTURE_GRID, height: CAPTURE_GRID, fileName: label })
    setFileName(label)
    resetViewConfig()
    setTerrainData(null)
  }, [terrainData, setHeightmap, setModel3D, setTerrainData, resetViewConfig])

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (file.size > MAX_BYTES) { setError('File too large — maximum 100 MB.'); return }
    if (!ACCEPTED.includes(ext)) {
      setError(`Unsupported format ".${ext}". Accepted: ${ACCEPTED.join(', ')}`)
      return
    }
    setError(null)
    setLoading(true)
    try {
      if (HEIGHTMAP_EXTS.includes(ext)) {
        const { data, width, height } = await parseHeightmap(file)
        setHeightmap({ data, width, height, fileName: file.name })
        setModel3D(null)
      } else {
        const group = await load3DModel(file)
        setModel3D(group)
        setHeightmap(null)
      }
      setFileName(file.name)
      resetViewConfig()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file.')
    } finally {
      setLoading(false)
    }
  }, [setHeightmap, setModel3D, resetViewConfig])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const resetTransform = useCallback(() => {
    setPosX(0); setPosY(0); setPosZ(0)
  }, [])

  const hasContent = !!(heightmap || model3D)
  const sourceType = heightmap ? 'Heightmap' : model3D ? '3D Model' : null

  return (
    <div className="editor">
      <header className="editor__header">
        <div className="editor__heading">
          <span className="editor__eyebrow">Workspace</span>
          <h1>3D Map Editor</h1>
          <p>Import a heightmap or 3D model, then fine-tune its geometry, materials, and lighting.</p>
        </div>
        <div className="editor__status">
          <span className={`editor__status-dot${hasContent ? ' editor__status-dot--live' : ''}`} />
          {hasContent ? `${sourceType} loaded` : 'No model loaded'}
        </div>
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
            model3D={model3D}
            wireframe={wireframe}
            autoRotate={autoRotate}
            showGrid={showGrid}
            lightIntensity={lightIntensity}
            offsetX={posX}
            offsetY={posY}
            offsetZ={posZ}
          />

          {/* Floating viewport toolbar */}
          {hasContent && (
            <div className="editor__viewbar">
              <button
                type="button"
                className={`editor__viewbtn${wireframe ? ' editor__viewbtn--on' : ''}`}
                onClick={() => setWireframe(v => !v)}
                title="Wireframe"
                aria-pressed={wireframe}
              >
                {Icon.wireframe}
              </button>
              <button
                type="button"
                className={`editor__viewbtn${autoRotate ? ' editor__viewbtn--on' : ''}`}
                onClick={() => setAutoRotate(v => !v)}
                title="Auto-rotate"
                aria-pressed={autoRotate}
              >
                {Icon.rotate}
              </button>
              <button
                type="button"
                className={`editor__viewbtn${showGrid ? ' editor__viewbtn--on' : ''}`}
                onClick={() => setShowGrid(v => !v)}
                title="Show grid"
                aria-pressed={showGrid}
              >
                {Icon.grid}
              </button>
            </div>
          )}

          {/* Bottom-left info HUD */}
          {hasContent && fileName && (
            <div className="editor__hud">
              <span className="editor__hud-type">{sourceType}</span>
              <span className="editor__hud-name">{fileName}</span>
              {heightmap && (
                <span className="editor__hud-dim">{heightmap.width}×{heightmap.height}px</span>
              )}
            </div>
          )}

          {!hasContent && !loading && !isDragOver && (
            <div className="editor__overlay">
              <div className="editor__overlay-card">
                <span className="editor__overlay-icon">{Icon.upload}</span>
                <p className="editor__overlay-title">Drop a file to get started</p>
                <p className="editor__overlay-hint">Heightmap — PNG · JPG · WebP</p>
                <p className="editor__overlay-hint">3D Model — GLB · GLTF · OBJ · FBX · STL · PLY · DAE · 3DS</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="editor__overlay">
              <div className="editor__spinner" />
              <p>Loading model…</p>
            </div>
          )}

          {isDragOver && (
            <div className="editor__overlay editor__overlay--drag">
              <span className="editor__overlay-icon">{Icon.upload}</span>
              <p className="editor__overlay-title">Release to load</p>
            </div>
          )}
        </div>

        {/* ── control panel ── */}
        <aside className="editor__panel">
          {/* Source */}
          <section className="editor__section">
            <h3 className="editor__section-title">Source</h3>
            <label className="editor__upload-btn" htmlFor="dem-upload">
              {Icon.upload}
              <span>Choose file</span>
              <input
                id="dem-upload"
                type="file"
                accept={ACCEPTED.map(e => `.${e}`).join(',')}
                className="editor__file-hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </label>
            {fileName && (
              <span className="editor__file-name">
                {fileName}
                {heightmap && (
                  <span className="editor__file-dim"> · {heightmap.width}×{heightmap.height}</span>
                )}
              </span>
            )}
            {error && <span className="editor__error" role="alert">{error}</span>}
          </section>

          <div className="editor__divider" />

          {/* Geometry */}
          <section className="editor__section">
            <h3 className="editor__section-title">Geometry</h3>
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
          </section>

          <div className="editor__divider" />

          {/* Appearance */}
          <section className="editor__section">
            <h3 className="editor__section-title">Appearance</h3>
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
          </section>

          <div className="editor__divider" />

          {/* Transform */}
          <section className="editor__section">
            <div className="editor__section-head">
              <h3 className="editor__section-title">Transform</h3>
              <button type="button" className="editor__reset" onClick={resetTransform} title="Reset position">
                {Icon.reset}
                <span>Reset</span>
              </button>
            </div>

            <div className="editor__field">
              <label htmlFor="pos-x" className="editor__label">
                Position X<span className="editor__value">{posX.toFixed(1)}</span>
              </label>
              <input id="pos-x" type="range" min="-10" max="10" step="0.1"
                value={posX} onChange={e => setPosX(Number(e.target.value))} className="editor__slider" />
            </div>
            <div className="editor__field">
              <label htmlFor="pos-y" className="editor__label">
                Position Y<span className="editor__value">{posY.toFixed(1)}</span>
              </label>
              <input id="pos-y" type="range" min="-10" max="10" step="0.1"
                value={posY} onChange={e => setPosY(Number(e.target.value))} className="editor__slider" />
            </div>
            <div className="editor__field">
              <label htmlFor="pos-z" className="editor__label">
                Position Z<span className="editor__value">{posZ.toFixed(1)}</span>
              </label>
              <input id="pos-z" type="range" min="-10" max="10" step="0.1"
                value={posZ} onChange={e => setPosZ(Number(e.target.value))} className="editor__slider" />
            </div>
          </section>

          <div className="editor__panel-footer">
            <button
              type="button"
              className="btn btn--primary editor__export-btn"
              onClick={() => navigate('/export')}
              disabled={!hasContent}
            >
              Continue to Export →
            </button>
            <p className="editor__tip">Orbit: drag · Zoom: scroll · Pan: right-click drag</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
