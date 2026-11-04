import { describe, expect, it } from 'vitest'
import { sunPath, sunPosition, sunTimes, visibleSegments } from './sun'
import { dateToZoned } from './time'

const MADRID = { lat: 40.4168, lon: -3.7038, tz: 'Europe/Madrid' }

describe('sol', () => {
  it('mediodía solar en el solsticio de verano en Madrid', () => {
    const { noon } = sunTimes('2026-06-21', MADRID.tz, MADRID.lat, MADRID.lon)
    const p = sunPosition(noon!, MADRID.lat, MADRID.lon)
    expect(p.azimuth).toBeCloseTo(180, 0)
    // 90 − 40.42 + 23.44 ≈ 73.0
    expect(p.altitude).toBeGreaterThan(72.5)
    expect(p.altitude).toBeLessThan(73.5)
  })

  it('amanecer y ocaso en hora local (referencia: 06:45 y 21:48)', () => {
    const t = sunTimes('2026-06-21', MADRID.tz, MADRID.lat, MADRID.lon)
    const rise = dateToZoned(t.sunrise!, MADRID.tz)
    const set = dateToZoned(t.sunset!, MADRID.tz)
    expect(rise.day).toBe('2026-06-21')
    expect(Math.abs(rise.minutes - (6 * 60 + 45))).toBeLessThanOrEqual(3)
    expect(Math.abs(set.minutes - (21 * 60 + 48))).toBeLessThanOrEqual(3)
  })

  it('al amanecer de verano sale por el noreste', () => {
    const t = sunTimes('2026-06-21', MADRID.tz, MADRID.lat, MADRID.lon)
    const az = sunPosition(t.sunrise!, MADRID.lat, MADRID.lon).azimuth
    expect(az).toBeGreaterThan(55)
    expect(az).toBeLessThan(65)
  })

  it('la trayectoria del día tiene un único tramo diurno', () => {
    const segs = visibleSegments(sunPath('2026-03-20', MADRID.tz, MADRID.lat, MADRID.lon))
    expect(segs).toHaveLength(1)
  })
})
