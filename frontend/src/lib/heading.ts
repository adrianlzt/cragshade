// Matemáticas de ángulos y orientación. Todo en grados.
//
// Convenciones:
// - Azimut/rumbo: desde el norte geográfico, en sentido horario (0 = N, 90 = E).
// - yaw: ángulo horizontal en la panorámica, 0 = centro de la imagen, positivo a la derecha
//   (igual que Photo Sphere Viewer).
// - heading (de la foto): azimut al que apunta el centro de la panorámica.
//   Por tanto: azimut = heading + yaw.

const RAD = Math.PI / 180

export function norm360(deg: number): number {
  const r = deg % 360
  const n = r < 0 ? r + 360 : r
  return n >= 360 ? 0 : n
}

/** Normaliza a (-180, 180]. */
export function normSigned(deg: number): number {
  const r = norm360(deg)
  return r > 180 ? r - 360 : r
}

/** Diferencia angular con signo b − a, en (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  return normSigned(b - a)
}

export function circularMean(degs: number[]): number {
  let x = 0
  let y = 0
  for (const d of degs) {
    x += Math.cos(d * RAD)
    y += Math.sin(d * RAD)
  }
  return norm360(Math.atan2(y, x) / RAD)
}

/** Desviación estándar circular (grados). */
export function circularStd(degs: number[]): number {
  if (degs.length < 2) return 0
  let x = 0
  let y = 0
  for (const d of degs) {
    x += Math.cos(d * RAD)
    y += Math.sin(d * RAD)
  }
  const r = Math.min(1, Math.hypot(x, y) / degs.length)
  return Math.sqrt(-2 * Math.log(r)) / RAD
}

/** yaw en la panorámica de algo que está en el azimut dado. */
export function yawForAzimuth(azimuth: number, heading: number): number {
  return normSigned(azimuth - heading)
}

export function azimuthForYaw(yaw: number, heading: number): number {
  return norm360(heading + yaw)
}

/**
 * Heading de la foto a partir de una referencia: algo que en la realidad está en `azimuth`
 * (sol calculado o brújula) y en la panorámica aparece en `yaw`.
 */
export function headingFromReference(azimuth: number, yaw: number): number {
  return norm360(azimuth - yaw)
}

export interface CompassReference {
  /** Rumbo geográfico (ya corregida la declinación) medido con la brújula. */
  azimuth: number
  /** yaw de la panorámica en el que el usuario centró el mismo elemento. */
  yaw: number
}

export interface CompassSolution {
  heading: number
  /** Máxima desviación de una referencia respecto a la media. */
  residual: number
  /** Menor separación angular entre referencias. */
  minSeparation: number
}

export function solveCompass(refs: CompassReference[]): CompassSolution | null {
  if (!refs.length) return null
  const headings = refs.map((r) => headingFromReference(r.azimuth, r.yaw))
  const heading = circularMean(headings)
  const residual = Math.max(...headings.map((h) => Math.abs(angleDiff(heading, h))))
  let minSeparation = 360
  for (let i = 0; i < refs.length; i++)
    for (let j = i + 1; j < refs.length; j++)
      minSeparation = Math.min(minSeparation, Math.abs(angleDiff(refs[i].azimuth, refs[j].azimuth)))
  return { heading, residual, minSeparation }
}

export const COMPASS_MIN_REFS = 3
export const COMPASS_MIN_SEPARATION = 60
export const MAX_RESIDUAL = 10

export function compassSolutionOk(s: CompassSolution | null, nRefs: number): boolean {
  return (
    !!s && nRefs >= COMPASS_MIN_REFS && s.minSeparation >= COMPASS_MIN_SEPARATION && s.residual <= MAX_RESIDUAL
  )
}

export function cardinal(az: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return names[Math.round(norm360(az) / 45) % 8]
}
