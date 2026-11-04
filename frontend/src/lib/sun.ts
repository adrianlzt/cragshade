import * as SunCalc from 'suncalc'
import { tzOffsetMinutes, zonedToDate } from './time'

export interface SunPosition {
  /** Desde el norte, horario. */
  azimuth: number
  /** Elevación aparente (con refracción). */
  altitude: number
}

export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
  // suncalc 2.x ya devuelve grados, con el azimut desde el norte en sentido horario.
  const p = SunCalc.getPosition(date, lat, lon)
  return { azimuth: p.azimuth, altitude: p.altitude }
}

export interface PathPoint extends SunPosition {
  minutes: number
}

/** Posiciones del sol a lo largo de un día local (`day` en `tz`), cada `step` minutos. */
export function sunPath(day: string, tz: string, lat: number, lon: number, step = 10): PathPoint[] {
  const out: PathPoint[] = []
  for (let minutes = 0; minutes <= 1440; minutes += step) {
    out.push({ minutes, ...sunPosition(zonedToDate(day, minutes, tz), lat, lon) })
  }
  return out
}

/** Tramos continuos de la trayectoria con el sol por encima de `minAlt`. */
export function visibleSegments(path: PathPoint[], minAlt = -1): PathPoint[][] {
  const segs: PathPoint[][] = []
  let cur: PathPoint[] = []
  for (const p of path) {
    if (p.altitude >= minAlt) cur.push(p)
    else if (cur.length) {
      segs.push(cur)
      cur = []
    }
  }
  if (cur.length) segs.push(cur)
  return segs.filter((s) => s.length > 1)
}

export function sunTimes(day: string, tz: string, lat: number, lon: number) {
  const noon = zonedToDate(day, 720, tz)
  const t = SunCalc.getTimes(noon, lat, lon, 0, tzOffsetMinutes(noon, tz))
  return { sunrise: t.sunrise ?? null, sunset: t.sunset ?? null, noon: t.solarNoon ?? null }
}
