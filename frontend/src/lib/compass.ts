// Lectura de la brújula del móvil desde el navegador.
//
// - iOS Safari: evento `deviceorientation` con `webkitCompassHeading` (norte magnético) y
//   `webkitCompassAccuracy` (± grados, negativo = no fiable). Requiere pedir permiso con un gesto.
// - Android Chrome: evento `deviceorientationabsolute` (alpha/beta/gamma respecto al norte).
//   No da precisión, así que la calibración se fuerza con el gesto del ocho y se valida con la
//   consistencia de varias referencias (ver heading.ts).
//
// El rumbo que nos interesa es hacia donde mira la cámara trasera (eje -Z del dispositivo),
// con el móvil en vertical, como al hacer una foto.
import * as geomagnetism from 'geomagnetism'
import { circularStd, norm360 } from './heading'

export type CompassPlatform = 'ios' | 'android'

export interface CompassReading {
  /** Rumbo de la cámara respecto al norte magnético. */
  magnetic: number
  /** Rumbo respecto al norte geográfico (con declinación). */
  heading: number
  /** ± grados (solo iOS). */
  accuracy: number | null
  /** El móvil está demasiado plano para saber hacia dónde mira la cámara. */
  flat: boolean
  beta: number
  t: number
}

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

const RAD = Math.PI / 180

export function declination(lat: number, lon: number, date = new Date()): number {
  try {
    return geomagnetism.model(date, { allowOutOfBoundsModel: true }).point([lat, lon]).decl
  } catch {
    return 0
  }
}

/** Rumbo del eje -Z (cámara trasera) a partir de los ángulos W3C. */
export function cameraHeading(alpha: number, beta: number, gamma: number): { heading: number; horizontal: number } {
  const [a, b, g] = [alpha * RAD, beta * RAD, gamma * RAD]
  const east = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g)
  const north = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g)
  return { heading: norm360(Math.atan2(east, north) / RAD), horizontal: Math.hypot(east, north) }
}

export function isIOS(): boolean {
  return typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function'
}

/** En iOS hay que llamarlo desde un gesto del usuario (click). */
export async function requestCompassPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  if (typeof DOE.requestPermission !== 'function') return true
  try {
    return (await DOE.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/**
 * Empieza a leer la brújula. Devuelve la función para pararla.
 * `onReading` no se llama nunca si el dispositivo no tiene brújula utilizable.
 */
export function startCompass(lat: number, lon: number, onReading: (r: CompassReading) => void): () => void {
  const decl = declination(lat, lon)
  const ios = isIOS()

  const handler = (ev: Event) => {
    const e = ev as IOSOrientationEvent
    if (e.beta == null) return
    let magnetic: number
    let flat: boolean
    let accuracy: number | null = null
    if (ios) {
      if (e.webkitCompassHeading == null) return
      magnetic = e.webkitCompassHeading
      accuracy = e.webkitCompassAccuracy ?? null
      flat = Math.abs(e.beta) < 45
    } else {
      if (e.alpha == null || e.gamma == null || !e.absolute) return
      const cam = cameraHeading(e.alpha, e.beta, e.gamma)
      magnetic = cam.heading
      flat = cam.horizontal < 0.5
    }
    onReading({ magnetic, heading: norm360(magnetic + decl), accuracy, flat, beta: e.beta, t: performance.now() })
  }

  const type = ios ? 'deviceorientation' : 'deviceorientationabsolute'
  window.addEventListener(type, handler)
  return () => window.removeEventListener(type, handler)
}

/** Espera la primera lectura válida; null si no llega (escritorio, Firefox, sin sensor). */
export function detectCompass(lat: number, lon: number, timeoutMs = 2000): Promise<CompassPlatform | null> {
  return new Promise((resolve) => {
    const stop = startCompass(lat, lon, () => {
      clearTimeout(timer)
      stop()
      resolve(isIOS() ? 'ios' : 'android')
    })
    const timer = setTimeout(() => {
      stop()
      resolve(null)
    }, timeoutMs)
  })
}

/** Precisión máxima aceptada en iOS (grados). */
export const IOS_MAX_ACCURACY = 15
/** Desviación máxima del rumbo con el móvil quieto (grados). */
export const MAX_JITTER = 3

/**
 * Sigue el gesto de calibración (ocho): hay que barrer casi todas las direcciones y
 * inclinar bastante el móvil, que es lo que necesitan los algoritmos de calibración del SO.
 */
export class CalibrationTracker {
  private bins = new Set<number>()
  private minBeta = Infinity
  private maxBeta = -Infinity

  add(r: CompassReading) {
    this.bins.add(Math.floor(r.magnetic / 30))
    this.minBeta = Math.min(this.minBeta, r.beta)
    this.maxBeta = Math.max(this.maxBeta, r.beta)
  }

  get progress(): number {
    const dirs = Math.min(1, this.bins.size / 10)
    const tilt = Math.min(1, Math.max(0, this.maxBeta - this.minBeta) / 90)
    return (dirs + tilt) / 2
  }

  get done(): boolean {
    return this.progress >= 1
  }
}

/** Ventana deslizante para saber si el móvil está quieto y el rumbo es estable. */
export class StabilityWindow {
  private readings: CompassReading[] = []
  constructor(private windowMs = 1200) {}

  add(r: CompassReading) {
    this.readings.push(r)
    const from = r.t - this.windowMs
    while (this.readings.length && this.readings[0].t < from) this.readings.shift()
  }

  /** Desviación del rumbo en la ventana (Infinity si hay pocas lecturas). */
  get jitter(): number {
    if (this.readings.length < 5) return Infinity
    return circularStd(this.readings.map((r) => r.heading))
  }

  get stable(): boolean {
    return this.jitter <= MAX_JITTER
  }

  get last(): CompassReading | null {
    return this.readings.at(-1) ?? null
  }
}
