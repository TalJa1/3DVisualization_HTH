import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw'

// leaflet's default marker icons break with bundlers — fix icon paths
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

const GRID = 32

type Resolution = '30m' | '10m'

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: '30m', label: '30m (global SRTM)' },
  { value: '10m', label: '10m (US only)' },
]

function resolutionDataset(r: Resolution) {
  return r === '10m' ? 'ned10m' : 'srtm30m'
}

export interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
}

interface Props {
  onTerrainCapture: (heightmap: Float32Array, bbox: BoundingBox) => void
}

export default function MapTerrainTab({ onTerrainCapture }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const drawnLayersRef = useRef<L.FeatureGroup | null>(null)
  const currentRectRef = useRef<L.Rectangle | null>(null)

  const [bbox, setBbox] = useState<BoundingBox | null>(null)
  const [resolution, setResolution] = useState<Resolution>('30m')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    const map = L.map(mapDivRef.current, { center: [20, 0], zoom: 3 })
    mapRef.current = map
    // Force Leaflet to recalculate container size after CSS layout settles
    setTimeout(() => map.invalidateSize(), 0)

    // Patch leaflet-draw bug: readableArea references an undefined `type` variable
    // in some versions, causing a crash on every mouse-move during rectangle draw.
    const geomUtil = (L as unknown as Record<string, Record<string, unknown>>).GeometryUtil
    if (geomUtil?.readableArea) {
      const original = geomUtil.readableArea as (...args: unknown[]) => string
      geomUtil.readableArea = (...args: unknown[]) => {
        try { return original(...args) } catch { return '' }
      }
    }

    // Hillshade base (DEM-style grey relief)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Hillshade © <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 16,
      },
    ).addTo(map)

    // Place-name / road labels on top
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Labels © <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 16,
        opacity: 0.7,
      },
    ).addTo(map)

    const drawnItems = new L.FeatureGroup()
    drawnLayersRef.current = drawnItems
    map.addLayer(drawnItems)

    const drawControl = new (L.Control as unknown as {
      Draw: new (opts: unknown) => L.Control
    }).Draw({
      position: 'topleft',
      draw: {
        rectangle: { shapeOptions: { color: '#4f8ef7', weight: 2 }, showArea: false },
        polyline: false,
        polygon: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: drawnItems },
    })
    map.addControl(drawControl)

    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created
      // Remove previous rectangle
      drawnItems.clearLayers()
      currentRectRef.current = null

      const layer = event.layer as L.Rectangle
      drawnItems.addLayer(layer)
      currentRectRef.current = layer

      const bounds = layer.getBounds()
      // Normalise longitudes to [-180, 180]: panning past the antimeridian
      // makes Leaflet return values like 468°, which the elevation API rejects.
      const wrapLng = (lng: number) => (((((lng + 180) % 360) + 360) % 360) - 180)
      setBbox({
        north: +bounds.getNorth().toFixed(6),
        south: +bounds.getSouth().toFixed(6),
        east: +wrapLng(bounds.getEast()).toFixed(6),
        west: +wrapLng(bounds.getWest()).toFixed(6),
      })
      setError(null)
    })

    map.on(L.Draw.Event.DELETED, () => {
      currentRectRef.current = null
      setBbox(null)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  async function handleCapture() {
    if (!bbox) return

    setLoading(true)
    setError(null)

    try {
      // Build 32×32 grid of [lat, lng] samples
      const points: [number, number][] = []
      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          const lat = bbox.south + (bbox.north - bbox.south) * (row / (GRID - 1))
          const lng = bbox.west + (bbox.east - bbox.west) * (col / (GRID - 1))
          points.push([lat, lng])
        }
      }

      // Open Topo Data allows up to 100 locations per request — batch accordingly
      const BATCH = 100
      const dataset = resolutionDataset(resolution)
      const elevations: number[] = []

      for (let i = 0; i < points.length; i += BATCH) {
        // Respect the free API's per-second rate limit
        if (i > 0) await new Promise(r => setTimeout(r, 1100))

        const batch = points.slice(i, i + BATCH)
        const locationStr = batch.map(([lat, lng]) => `${lat},${lng}`).join('|')
        const url = `/api/topo/${dataset}?locations=${locationStr}`

        const res = await fetch(url)
        if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
        const json = await res.json()

        if (json.status !== 'OK') throw new Error(`API status: ${json.status}`)
        for (const result of json.results as { elevation: number | null }[]) {
          elevations.push(result.elevation ?? 0)
        }
      }

      const heightmap = new Float32Array(elevations)
      onTerrainCapture(heightmap, bbox)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const coord = (n: number) => n.toFixed(5)

  return (
    <div style={styles.root}>
      {/* Map */}
      <div ref={mapDivRef} style={styles.map} />

      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <h2 style={styles.heading}>Map Terrain</h2>
        <p style={styles.hint}>
          Use the rectangle tool on the map to select a zone, then capture its
          elevation data into the 3D editor.
        </p>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Selected Area</h3>
          {bbox ? (
            <table style={styles.coordTable}>
              <tbody>
                {(
                  [
                    ['North', bbox.north],
                    ['South', bbox.south],
                    ['East', bbox.east],
                    ['West', bbox.west],
                  ] as [string, number][]
                ).map(([label, val]) => (
                  <tr key={label}>
                    <td style={styles.coordLabel}>{label}</td>
                    <td style={styles.coordValue}>{coord(val)}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={styles.emptyHint}>No area selected yet.</p>
          )}
        </section>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>DEM Resolution</h3>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as Resolution)}
            style={styles.select}
            disabled={loading}
          >
            {RESOLUTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </section>

        <button
          style={{
            ...styles.captureBtn,
            ...((!bbox || loading) ? styles.captureBtnDisabled : {}),
          }}
          disabled={!bbox || loading}
          onClick={handleCapture}
        >
          {loading ? 'Fetching elevation…' : 'Capture Terrain → 3D Editor'}
        </button>

        {loading && (
          <p style={styles.loadingNote}>
            Sampling {GRID}×{GRID} = {GRID * GRID} points across{' '}
            {Math.ceil((GRID * GRID) / 100)} batches — pacing requests to
            stay within the free API rate limit (~{Math.ceil((GRID * GRID) / 100) * 1.1 | 0}–{Math.ceil((GRID * GRID) / 100) * 1.2 | 0}s).
          </p>
        )}

        {error && <p style={styles.errorMsg}>Error: {error}</p>}
      </aside>
    </div>
  )
}

// ── inline styles ─────────────────────────────────────────────────────────────
const styles = {
  root: {
    display: 'flex',
    width: '100%',
    height: 'calc(100vh - 68px)',
    minHeight: 0,
    fontFamily: 'inherit',
  } as React.CSSProperties,

  map: {
    flex: 1,
    minWidth: 0,
    height: 'calc(100vh - 68px)',
  } as React.CSSProperties,

  sidebar: {
    width: 280,
    flexShrink: 0,
    background: '#1a1a2e',
    color: '#e0e0e0',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto',
  } as React.CSSProperties,

  heading: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#ffffff',
  } as React.CSSProperties,

  hint: {
    margin: 0,
    fontSize: 13,
    color: '#9090b0',
    lineHeight: 1.5,
  } as React.CSSProperties,

  section: {
    marginTop: 16,
  } as React.CSSProperties,

  sectionTitle: {
    margin: '0 0 8px',
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    color: '#7878a8',
  } as React.CSSProperties,

  coordTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 14,
  } as React.CSSProperties,

  coordLabel: {
    padding: '3px 0',
    color: '#9090b0',
    width: 50,
  } as React.CSSProperties,

  coordValue: {
    padding: '3px 0',
    fontFamily: 'monospace',
    color: '#d0d0f0',
  } as React.CSSProperties,

  emptyHint: {
    margin: 0,
    fontSize: 13,
    color: '#555575',
    fontStyle: 'italic',
  } as React.CSSProperties,

  select: {
    width: '100%',
    padding: '8px 10px',
    background: '#12122a',
    border: '1px solid #333360',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 13,
    cursor: 'pointer',
  } as React.CSSProperties,

  captureBtn: {
    marginTop: 20,
    width: '100%',
    padding: '11px 0',
    background: '#4f8ef7',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  } as React.CSSProperties,

  captureBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  } as React.CSSProperties,

  loadingNote: {
    margin: 0,
    fontSize: 12,
    color: '#7878a8',
    lineHeight: 1.4,
  } as React.CSSProperties,

  errorMsg: {
    margin: 0,
    fontSize: 13,
    color: '#f07070',
    lineHeight: 1.4,
  } as React.CSSProperties,
} as const
