import type { PanoData } from '@photo-sphere-viewer/core'

export type OrientationMethod = 'sun' | 'compass' | 'exif' | 'manual'

export interface PhotoSummary {
  id: string
  alias: string
  wall_name: string
  lat: number
  lon: number
  heading_true: number
  orientation_method: OrientationMethod
  thumb_url: string
  captured_at: string | null
}

export interface Photo extends PhotoSummary {
  alt: number | null
  tz: string | null
  orientation_residual_deg: number | null
  compass_accuracy_deg: number | null
  pano_data: PanoData | null
  file_url: string | null
  web_url: string
  created_at: string
}

export interface NewPhoto {
  image: File
  alias: string
  wall_name: string
  lat: number
  lon: number
  alt?: number | null
  captured_at?: string | null
  tz?: string | null
  heading_true: number
  orientation_method: OrientationMethod
  orientation_residual_deg?: number | null
  compass_accuracy_deg?: number | null
  pano_data?: PanoData | null
}

async function check<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(msg)
  }
  return res.json()
}

export async function listPhotos(): Promise<PhotoSummary[]> {
  return check(await fetch('/api/photos'))
}

export async function getPhoto(id: string): Promise<Photo> {
  return check(await fetch(`/api/photos/${encodeURIComponent(id)}`))
}

const CHUNK_BYTES = 1024 * 1024
const RETRIES = 6

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Reintenta solo si la petición no llegó a completarse (red caída o cortada: fetch lanza TypeError);
// un error HTTP del servidor es definitivo.
export async function withRetry<T>(fn: () => Promise<T>, retries = RETRIES, delayMs = 1000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!(err instanceof TypeError) || attempt >= retries) {
        if (err instanceof TypeError) {
          throw new Error('Se cortó la conexión al subir la foto. Comprueba la cobertura y vuelve a intentarlo.')
        }
        throw err
      }
      await sleep(delayMs * 2 ** Math.min(attempt, 4))
    }
  }
}

// Una sola petición con 8 MB tarda más de 60 s en una red móvil lenta y Traefik la corta (502 o
// "Failed to fetch"); por eso se sube por trozos pequeños, cada uno reintentable, y luego se crea la foto.
export async function uploadFile(file: File, onProgress?: (sent: number, total: number) => void): Promise<string> {
  const { upload_id } = await withRetry(async () => check<{ upload_id: string }>(await fetch('/api/uploads', { method: 'POST' })))
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    const chunk = file.slice(offset, offset + CHUNK_BYTES)
    await withRetry(async () =>
      check(await fetch(`/api/uploads/${upload_id}?offset=${offset}`, { method: 'PUT', body: chunk })),
    )
    onProgress?.(Math.min(offset + CHUNK_BYTES, file.size), file.size)
  }
  return upload_id
}

export async function createPhoto(p: NewPhoto, onProgress?: (sent: number, total: number) => void): Promise<Photo> {
  const form = new FormData()
  for (const [k, v] of Object.entries(p)) {
    if (v == null) continue
    if (k === 'image') continue
    else if (k === 'pano_data') form.append(k, JSON.stringify(v))
    else form.append(k, String(v))
  }
  form.append('upload_id', await uploadFile(p.image, onProgress))
  return withRetry(async () => check(await fetch('/api/photos', { method: 'POST', body: form })))
}
