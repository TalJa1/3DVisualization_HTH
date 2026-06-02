import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import { useModel } from '../context/ModelContext'
import type { BoundingBox } from '../context/ModelContext'

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

export type { BoundingBox }

const GRID = 32

type Resolution = '30m' | '10m'

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: '30m', label: '30m (global SRTM)' },
  { value: '10m', label: '10m (US only)' },
]

function resolutionDataset(r: Resolution) {
  return r === '10m' ? 'ned10m' : 'srtm30m'
}

interface Props {
  onTerrainCapture: (heightmap: Float32Array, bbox: BoundingBox) => void
}

export default function MapTerrainTab({ onTerrainCapture }: Props) {
  const {
    mapCenter, setMapCenter,
    mapZoom, setMapZoom,
    savedBbox, setSavedBbox,
  } = useModel()

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const drawnLayersRef = useRef<L.FeatureGroup | null>(null)

  const [resolution, setResolution] = useState<Resolution>('30m')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    const map = L.map(mapDivRef.current, { center: mapCenter, zoom: mapZoom })
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 0)

    // Patch leaflet-draw bug: readableArea references an undefined `type` variable
    const geomUtil = (L as unknown as Record<string, Record<string, unknown>>).GeometryUtil
    if (geomUtil?.readableArea) {
      const original = geomUtil.readableArea as (...args: unknown[]) => string
      geomUtil.readableArea = (...args: unknown[]) => {
        try { return original(...args) } catch { return '' }
      }
    }

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Hillshade © <a href="https://www.esri.com/">Esri</a>', maxZoom: 16 },
    ).addTo(map)

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Labels © <a href="https://www.esri.com/">Esri</a>', maxZoom: 16, opacity: 0.7 },
    ).addTo(map)

    const drawnItems = new L.FeatureGroup()
    drawnLayersRef.current = drawnItems
    map.addLayer(drawnItems)

    // Restore previously drawn rectangle if one was saved
    if (savedBbox) {
      const rect = L.rectangle(
        [[savedBbox.south, savedBbox.west], [savedBbox.north, savedBbox.east]],
        { color: '#4f8ef7', weight: 2 },
      )
      drawnItems.addLayer(rect)
    }

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
      drawnItems.clearLayers()
      const layer = event.layer as L.Rectangle
      drawnItems.addLayer(layer)

      const bounds = layer.getBounds()
      const wrapLng = (lng: number) => (((((lng + 180) % 360) + 360) % 360) - 180)
      const bbox: BoundingBox = {
        north: +bounds.getNorth().toFixed(6),
        south: +bounds.getSouth().toFixed(6),
        east: +wrapLng(bounds.getEast()).toFixed(6),
        west: +wrapLng(bounds.getWest()).toFixed(6),
      }
      setSavedBbox(bbox)
      setError(null)
    })

    map.on(L.Draw.Event.DELETED, () => {
      setSavedBbox(null)
    })

    // Persist map position so it survives navigation
    map.on('moveend', () => {
      const c = map.getCenter()
      setMapCenter([c.lat, c.lng])
    })
    map.on('zoomend', () => {
      setMapZoom(map.getZoom())
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(e: React.SyntheticEvent) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q || !mapRef.current) return

    setSearchLoading(true)
    setSearchError(null)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } },
      )
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const data = await res.json() as { lat: string; lon: string; display_name: string }[]
      if (!data.length) throw new Error(`No results found for "${q}"`)
      const { lat, lon } = data[0]
      mapRef.current.flyTo([parseFloat(lat), parseFloat(lon)], 10, { duration: 1.2 })
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleCapture() {
    if (!savedBbox) return

    setLoading(true)
    setError(null)

    try {
      const points: [number, number][] = []
      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          const lat = savedBbox.south + (savedBbox.north - savedBbox.south) * (row / (GRID - 1))
          const lng = savedBbox.west + (savedBbox.east - savedBbox.west) * (col / (GRID - 1))
          points.push([lat, lng])
        }
      }

      const BATCH = 100
      const dataset = resolutionDataset(resolution)
      const elevations: number[] = []

      for (let i = 0; i < points.length; i += BATCH) {
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
      onTerrainCapture(heightmap, savedBbox)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const coord = (n: number) => n.toFixed(5)

  return (
    <div style={styles.root}>
      <div ref={mapDivRef} style={styles.map} />

      <aside style={styles.sidebar}>
        <h2 style={styles.heading}>Map Terrain</h2>
        <p style={styles.hint}>
          Use the rectangle tool on the map to select a zone, then capture its
          elevation data into the 3D editor.
        </p>

        {/* Search */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Search Location</h3>
          <form onSubmit={handleSearch} style={styles.searchForm}>
            <input
              type="text"
              placeholder="e.g. Ho Chi Minh City"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={styles.searchInput}
              disabled={searchLoading}
            />
            <button type="submit" style={styles.searchBtn} disabled={searchLoading || !searchQuery.trim()}>
              {searchLoading ? '…' : '→'}
            </button>
          </form>
          {searchError && <p style={styles.errorMsg}>{searchError}</p>}
        </section>

        {/* Selected area */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Selected Area</h3>
          {savedBbox ? (
            <table style={styles.coordTable}>
              <tbody>
                {(
                  [
                    ['North', savedBbox.north],
                    ['South', savedBbox.south],
                    ['East',  savedBbox.east],
                    ['West',  savedBbox.west],
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

        {/* DEM resolution */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>DEM Resolution</h3>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as Resolution)}
            style={styles.select}
            disabled={loading}
          >
            {RESOLUTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </section>

        <button
          style={{
            ...styles.captureBtn,
            ...((!savedBbox || loading) ? styles.captureBtnDisabled : {}),
          }}
          disabled={!savedBbox || loading}
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

  searchForm: {
    display: 'flex',
    gap: 6,
  } as React.CSSProperties,

  searchInput: {
    flex: 1,
    padding: '7px 10px',
    background: '#12122a',
    border: '1px solid #333360',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 13,
    outline: 'none',
  } as React.CSSProperties,

  searchBtn: {
    padding: '7px 12px',
    background: '#4f8ef7',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
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
