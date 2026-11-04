import exifr from 'exifr'
import type { PanoData } from '@photo-sphere-viewer/core'

export interface PhotoMeta {
  lat: number | null
  lon: number | null
  alt: number | null
  /** 'YYYY:MM:DD HH:MM:SS' tal cual viene (sin zona), se interpreta luego con la zona del lugar. */
  dateRaw: string | null
  dateOffset: string | null
  /** Rumbo del centro según el móvil (GPano:PoseHeadingDegrees), poco fiable. */
  poseHeading: number | null
  /** Recorte si la panorámica es parcial (GPano). Null si es completa o no hay datos. */
  panoData: PanoData | null
  isGPano: boolean
  width: number
  height: number
}

type Raw = Record<string, unknown>

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v
  return null
}

/** Lee los campos GPano estén en `raw.GPano` (segmentos XMP separados) o fusionados en la raíz. */
function gpano(raw: Raw, key: string): unknown {
  const ns = raw.GPano as Raw | undefined
  return ns?.[key] ?? raw[key]
}

export function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = url
  })
}

export function panoDataFromRaw(raw: Raw): PanoData | null {
  const fullWidth = num(gpano(raw, 'FullPanoWidthPixels'))
  const fullHeight = num(gpano(raw, 'FullPanoHeightPixels'))
  const croppedWidth = num(gpano(raw, 'CroppedAreaImageWidthPixels'))
  const croppedHeight = num(gpano(raw, 'CroppedAreaImageHeightPixels'))
  const croppedX = num(gpano(raw, 'CroppedAreaLeftPixels')) ?? 0
  const croppedY = num(gpano(raw, 'CroppedAreaTopPixels')) ?? 0
  if (!fullWidth || !fullHeight || !croppedWidth || !croppedHeight) return null
  if (croppedWidth === fullWidth && croppedHeight === fullHeight) return null
  return { isEquirectangular: true, fullWidth, fullHeight, croppedWidth, croppedHeight, croppedX, croppedY }
}

export async function readPhotoMeta(file: File, url: string): Promise<PhotoMeta> {
  let raw: Raw = {}
  try {
    // reviveValues: false → fechas como texto, para interpretarlas en la zona del lugar.
    raw = ((await exifr.parse(file, { xmp: true, gps: true, reviveValues: false, translateValues: false })) ??
      {}) as Raw
  } catch {
    raw = {}
  }
  let gps: { latitude: number; longitude: number } | null = null
  try {
    gps = (await exifr.gps(file)) ?? null
  } catch {
    gps = null
  }
  const { width, height } = await imageSize(url)
  return {
    lat: gps && Number.isFinite(gps.latitude) ? gps.latitude : null,
    lon: gps && Number.isFinite(gps.longitude) ? gps.longitude : null,
    alt: num(raw.GPSAltitude),
    dateRaw: str(raw.DateTimeOriginal) ?? str(raw.CreateDate) ?? str(raw.DateTime),
    dateOffset: str(raw.OffsetTimeOriginal) ?? str(raw.OffsetTime),
    poseHeading: num(gpano(raw, 'PoseHeadingDegrees')),
    panoData: panoDataFromRaw(raw),
    isGPano: gpano(raw, 'ProjectionType') === 'equirectangular',
    width,
    height,
  }
}

/** Una panorámica válida: 2:1 completa, o parcial con datos GPano. */
export function looksEquirectangular(meta: PhotoMeta): boolean {
  if (meta.panoData) return true
  return Math.abs(meta.width / meta.height - 2) < 0.05
}
