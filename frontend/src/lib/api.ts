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

export async function createPhoto(p: NewPhoto): Promise<Photo> {
  const form = new FormData()
  for (const [k, v] of Object.entries(p)) {
    if (v == null) continue
    if (k === 'image') form.append(k, v as File)
    else if (k === 'pano_data') form.append(k, JSON.stringify(v))
    else form.append(k, String(v))
  }
  return check(await fetch('/api/photos', { method: 'POST', body: form }))
}
