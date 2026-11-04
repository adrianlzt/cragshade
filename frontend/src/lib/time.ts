// Fechas y horas en la zona horaria del punto (no la del navegador): quien consulta una pared
// desde otro país quiere ver la hora local de la pared.
import tzlookup from 'tz-lookup'

export function tzFor(lat: number, lon: number): string {
  try {
    return tzlookup(lat, lon)
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }
}

/** Offset de la zona respecto a UTC en minutos (positivo al este) en ese instante. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/** Fecha local 'YYYY-MM-DD' + minutos desde medianoche en `tz` → instante UTC. */
export function zonedToDate(day: string, minutes: number, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d, 0, minutes)
  // Dos pasadas para acertar en los cambios de hora.
  let t = naive - tzOffsetMinutes(new Date(naive), tz) * 60000
  t = naive - tzOffsetMinutes(new Date(t), tz) * 60000
  return new Date(t)
}

/** Instante → { day: 'YYYY-MM-DD', minutes } en `tz`. */
export function dateToZoned(date: Date, tz: string): { day: string; minutes: number } {
  const local = new Date(date.getTime() + tzOffsetMinutes(date, tz) * 60000)
  return {
    day: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  }
}

export function formatMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function formatTime(date: Date | null | undefined, tz: string): string {
  if (!date || isNaN(date.getTime())) return '—'
  return formatMinutes(dateToZoned(date, tz).minutes)
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  })
}

/** Día del año (1..366) ↔ 'YYYY-MM-DD'. */
export function dayOfYear(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1
}

export function dayFromOrdinal(year: number, ordinal: number): string {
  return new Date(Date.UTC(year, 0, ordinal)).toISOString().slice(0, 10)
}

/**
 * Fecha EXIF 'YYYY:MM:DD HH:MM:SS' (+ offset '+02:00' opcional). Sin offset, se interpreta en `tz`
 * (la del lugar de la foto), que es lo que marca el reloj del móvil allí.
 */
export function parseExifDate(value: string, offset: string | undefined, tz: string): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi, s = '0'] = m
  const off = offset && /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim())
  if (off) {
    const sign = off[1] === '-' ? -1 : 1
    const offMin = sign * (Number(off[2]) * 60 + Number(off[3]))
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offMin * 60000)
  }
  const date = zonedToDate(`${y}-${mo}-${d}`, +h * 60 + +mi, tz)
  return new Date(date.getTime() + +s * 1000)
}
