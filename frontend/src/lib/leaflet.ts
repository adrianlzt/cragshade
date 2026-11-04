import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// leaflet.markercluster se engancha al `L` global.
;(window as unknown as { L: typeof L }).L = L
await import('leaflet.markercluster')

export { L }

export function baseMap(el: HTMLElement, center: L.LatLngExpression, zoom: number): L.Map {
  const map = L.map(el, { zoomControl: false }).setView(center, zoom)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map)
  return map
}

export function dotIcon(className = ''): L.DivIcon {
  return L.divIcon({ className: `cs-dot ${className}`, iconSize: [22, 22], iconAnchor: [11, 11] })
}
