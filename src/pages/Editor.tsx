import { useState, useCallback } from 'react'
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
  } = useModel()

  const [fileName,      setFileName]      = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [isDragOver,    setIsDragOver]    = useState(false)
  const [wireframe,     setWireframe]     = useState(false)
  const [autoRotate,    setAutoRotate]    = useState(false)
  const [showGrid,      setShowGrid]      = useState(true)
  const [lightIntensity, setLightIntensity] = useState(1.6)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file.')
    } finally {
      setLoading(false)
    }
  }, [setHeightmap, setModel3D])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const hasContent = !!(heightmap || model3D)

  return (
    <div className="editor">
      <header className="editor__header">
        <h1>3D Map Editor</h1>
        <p>Upload a heightmap image or a 3D model to view and edit it.</p>
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
          />

          {!hasContent && !loading && !isDragOver && (
            <div className="editor__overlay">
              <span className="editor__overlay-icon">🗺️</span>
              <p>Drop a file here to get started</p>
              <p className="editor__overlay-hint">
                Heightmap: PNG · JPG · WebP
              </p>
              <p className="editor__overlay-hint">
                3D Model: GLB · GLTF · OBJ · FBX · STL · PLY · DAE · 3DS
              </p>
            </div>
          )}

          {loading && (
            <div className="editor__overlay">
              <div className="editor__spinner" />
              <p>Loading…</p>
            </div>
          )}

          {isDragOver && (
            <div className="editor__overlay editor__overlay--drag">
              <span className="editor__overlay-icon">📂</span>
              <p>Drop to load</p>
            </div>
          )}
        </div>

        {/* ── control panel ── */}
        <aside className="editor__panel">
          <h2 className="editor__panel-title">Controls</h2>

          <div className="editor__field">
            <span className="editor__label">File</span>
            <label className="editor__upload-btn" htmlFor="dem-upload">
              ⬆ Choose file
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
                📄 {fileName}
                {heightmap && (
                  <span className="editor__file-dim"> ({heightmap.width}×{heightmap.height})</span>
                )}
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
              disabled={!hasContent}
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
