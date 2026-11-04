import { describe, expect, it } from 'vitest'
import { dateToZoned, dayFromOrdinal, dayOfYear, parseExifDate, tzFor, zonedToDate } from './time'

describe('zonas horarias', () => {
  it('busca la zona del punto', () => {
    expect(tzFor(40.42, -3.7)).toBe('Europe/Madrid')
    expect(tzFor(28.1, -15.4)).toBe('Atlantic/Canary')
  })

  it('hora local ↔ UTC con horario de verano', () => {
    expect(zonedToDate('2026-07-01', 12 * 60, 'Europe/Madrid').toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(zonedToDate('2026-01-15', 12 * 60, 'Europe/Madrid').toISOString()).toBe('2026-01-15T11:00:00.000Z')
    expect(dateToZoned(new Date('2026-07-01T22:30:00Z'), 'Europe/Madrid')).toEqual({ day: '2026-07-02', minutes: 30 })
  })

  it('día del año', () => {
    expect(dayOfYear('2026-01-01')).toBe(1)
    expect(dayOfYear('2026-12-31')).toBe(365)
    expect(dayFromOrdinal(2026, 172)).toBe('2026-06-21')
  })

  it('fecha EXIF con y sin offset', () => {
    expect(parseExifDate('2026:07:01 12:00:05', '+02:00', 'UTC')!.toISOString()).toBe('2026-07-01T10:00:05.000Z')
    expect(parseExifDate('2026:07:01 12:00:00', undefined, 'Europe/Madrid')!.toISOString()).toBe(
      '2026-07-01T10:00:00.000Z',
    )
    expect(parseExifDate('basura', undefined, 'UTC')).toBeNull()
  })
})
