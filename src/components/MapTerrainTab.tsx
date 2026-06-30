import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import './MapTerrainTab.css'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import { useModel, CAPTURE_GRID } from '../context/ModelContext'
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

const GRID = CAPTURE_GRID
const RECT_COLOR = '#aa3bff'

type Resolution = '30m' | '10m'

const RESOLUTION_OPTIONS: { value: Resolution; label: string; sub: string }[] = [
  { value: '30m', label: '30m', sub: 'Global · SRTM' },
  { value: '10m', label: '10m', sub: 'US only · NED' },
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

    const map = L.map(mapDivRef.current, { center: mapCenter, zoom: mapZoom, zoomControl: false })
    mapRef.current = map
    L.control.zoom({ position: 'bottomright' }).addTo(map)
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
        { color: RECT_COLOR, weight: 2 },
      )
      drawnItems.addLayer(rect)
    }

    const drawControl = new (L.Control as unknown as {
      Draw: new (opts: unknown) => L.Control
    }).Draw({
      position: 'topleft',
      draw: {
        rectangle: { shapeOptions: { color: RECT_COLOR, weight: 2 }, showArea: false },
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
  const batches = Math.ceil((GRID * GRID) / 100)

  return (
    <div className="mapterrain">
      <div className="mapterrain__map-wrap">
        <div ref={mapDivRef} className="mapterrain__map" />
        {!savedBbox && (
          <div className="mapterrain__map-hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 3" />
            </svg>
            Use the rectangle tool (top-left) to select a region
          </div>
        )}
      </div>

      <aside className="mapterrain__sidebar">
        <header className="mapterrain__head">
          <span className="mapterrain__eyebrow">Source · Live world map</span>
          <h2 className="mapterrain__title">Map Terrain</h2>
          <p className="mapterrain__intro">
            Draw a box over any region, then capture its real elevation data into the 3D editor.
          </p>
        </header>

        {/* Search */}
        <section className="mapterrain__section">
          <h3 className="mapterrain__section-title">Search location</h3>
          <form onSubmit={handleSearch} className="mapterrain__search">
            <input
              type="text"
              placeholder="e.g. Ho Chi Minh City"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="mapterrain__search-input"
              disabled={searchLoading}
            />
            <button
              type="submit"
              className="mapterrain__search-btn"
              disabled={searchLoading || !searchQuery.trim()}
              aria-label="Search"
            >
              {searchLoading ? (
                <span className="mapterrain__spinner mapterrain__spinner--sm" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                </svg>
              )}
            </button>
          </form>
          {searchError && <p className="mapterrain__error">{searchError}</p>}
        </section>

        {/* Selected area */}
        <section className="mapterrain__section">
          <h3 className="mapterrain__section-title">
            Selected area
            {savedBbox && <span className="mapterrain__badge">Ready</span>}
          </h3>
          {savedBbox ? (
            <div className="mapterrain__coords">
              {(
                [
                  ['N', savedBbox.north],
                  ['S', savedBbox.south],
                  ['E', savedBbox.east],
                  ['W', savedBbox.west],
                ] as [string, number][]
              ).map(([label, val]) => (
                <div key={label} className="mapterrain__coord">
                  <span className="mapterrain__coord-label">{label}</span>
                  <span className="mapterrain__coord-value">{coord(val)}°</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mapterrain__empty">No area selected yet — draw a rectangle on the map.</p>
          )}
        </section>

        {/* DEM resolution */}
        <section className="mapterrain__section">
          <h3 className="mapterrain__section-title">DEM resolution</h3>
          <div className="mapterrain__seg" role="group" aria-label="DEM resolution">
            {RESOLUTION_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`mapterrain__seg-btn${resolution === o.value ? ' mapterrain__seg-btn--active' : ''}`}
                onClick={() => setResolution(o.value)}
                disabled={loading}
              >
                <strong>{o.label}</strong>
                <span>{o.sub}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="mapterrain__footer">
          <button
            className="mapterrain__capture"
            disabled={!savedBbox || loading}
            onClick={handleCapture}
          >
            {loading ? (
              <>
                <span className="mapterrain__spinner" />
                Fetching elevation…
              </>
            ) : (
              'Capture Terrain → 3D Editor'
            )}
          </button>

          {loading && (
            <p className="mapterrain__note">
              Sampling {GRID}×{GRID} = {GRID * GRID} points across {batches} batches,
              paced to respect the free API rate limit (~{Math.round(batches * 1.1)}–{Math.round(batches * 1.2)}s).
            </p>
          )}

          {error && <p className="mapterrain__error">Error: {error}</p>}
        </div>
      </aside>
    </div>
  )
}
