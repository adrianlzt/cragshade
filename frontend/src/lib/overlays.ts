// Marcadores para el visor: puntos cardinales, sol y trayectoria del día.
import type { MarkerConfig } from '@photo-sphere-viewer/markers-plugin'
import { yawForAzimuth } from './heading'
import { visibleSegments, type PathPoint, type SunPosition } from './sun'
import { formatMinutes } from './time'

const RAD = Math.PI / 180

function pos(azimuth: number, altitude: number, heading: number) {
  return { yaw: yawForAzimuth(azimuth, heading) * RAD, pitch: altitude * RAD }
}

export function cardinalMarkers(heading: number): MarkerConfig[] {
  const names: [string, number][] = [
    ['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315],
  ]
  return names.map(([name, az]) => ({
    id: `card-${name}`,
    position: pos(az, 0, heading),
    html: `<span class="cs-cardinal${name.length === 1 ? ' main' : ''}">${name}</span>`,
    anchor: 'center center',
    data: { generated: true },
  }))
}

export function sunMarker(sun: SunPosition, heading: number): MarkerConfig[] {
  if (sun.altitude < -1) return []
  return [
    {
      id: 'sun',
      position: pos(sun.azimuth, sun.altitude, heading),
      html: '<div class="cs-sun"></div>',
      anchor: 'center center',
      tooltip: `Sol · azimut ${sun.azimuth.toFixed(0)}° · altura ${sun.altitude.toFixed(0)}°`,
    },
  ]
}

export function sunPathMarkers(path: PathPoint[], heading: number): MarkerConfig[] {
  const out: MarkerConfig[] = []
  visibleSegments(path).forEach((seg, i) => {
    out.push({
      id: `path-${i}`,
      polyline: seg.map((p) => {
        const q = pos(p.azimuth, p.altitude, heading)
        return [q.yaw, q.pitch] as [number, number]
      }),
      svgStyle: { stroke: 'rgba(255, 200, 60, 0.85)', strokeWidth: '3px', strokeDasharray: '6 5', fill: 'none' },
    })
  })
  for (const p of path) {
    if (p.minutes % 60 !== 0 || p.altitude < 0 || p.minutes >= 1440) continue
    out.push({
      id: `hour-${p.minutes}`,
      position: pos(p.azimuth, p.altitude, heading),
      html: `<span class="cs-hour">${formatMinutes(p.minutes).slice(0, 2)}h</span>`,
      anchor: 'center center',
    })
  }
  return out
}
