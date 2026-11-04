import { describe, expect, it } from 'vitest'
import {
  angleDiff,
  azimuthForYaw,
  circularMean,
  compassSolutionOk,
  headingFromReference,
  normSigned,
  solveCompass,
  yawForAzimuth,
} from './heading'

describe('ángulos', () => {
  it('normaliza y resta con wrap', () => {
    expect(normSigned(190)).toBe(-170)
    expect(normSigned(-190)).toBe(170)
    expect(angleDiff(350, 10)).toBe(20)
    expect(angleDiff(10, 350)).toBe(-20)
  })

  it('media circular alrededor de 0', () => {
    expect(circularMean([350, 10])).toBeCloseTo(0, 6)
    expect(circularMean([355, 5, 0])).toBeCloseTo(0, 6)
  })

  it('yaw y azimut son inversos', () => {
    const heading = 300
    expect(yawForAzimuth(30, heading)).toBe(90)
    expect(azimuthForYaw(90, heading)).toBe(30)
    expect(headingFromReference(30, 90)).toBe(300)
  })
})

describe('solveCompass', () => {
  it('referencias coherentes y separadas', () => {
    const heading = 355
    const refs = [0, 120, 240].map((yaw, i) => ({ yaw, azimuth: (heading + yaw + [1, -1, 0.5][i] + 360) % 360 }))
    const s = solveCompass(refs)!
    expect(Math.abs(angleDiff(heading, s.heading))).toBeLessThan(1)
    expect(s.residual).toBeLessThan(1.5)
    expect(s.minSeparation).toBeGreaterThan(115)
    expect(compassSolutionOk(s, refs.length)).toBe(true)
  })

  it('detecta brújula mal calibrada (error que depende de la dirección)', () => {
    const refs = [0, 120, 240].map((yaw) => ({ yaw, azimuth: (100 + yaw + 25 * Math.sin((yaw * Math.PI) / 180)) % 360 }))
    const s = solveCompass(refs)!
    expect(s.residual).toBeGreaterThan(10)
    expect(compassSolutionOk(s, refs.length)).toBe(false)
  })

  it('exige direcciones separadas', () => {
    const refs = [0, 20, 40].map((yaw) => ({ yaw, azimuth: yaw + 50 }))
    expect(compassSolutionOk(solveCompass(refs), 3)).toBe(false)
  })
})
