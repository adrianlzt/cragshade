import { describe, expect, it } from 'vitest'
import { withRetry } from './api'

describe('withRetry', () => {
  it('reintenta tras un corte de red y acaba bien', async () => {
    let calls = 0
    const out = await withRetry(
      async () => {
        if (++calls < 3) throw new TypeError('Failed to fetch')
        return 'ok'
      },
      5,
      1,
    )
    expect(out).toBe('ok')
    expect(calls).toBe(3)
  })

  it('no reintenta errores HTTP del servidor', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('422 imagen no válida')
        },
        5,
        1,
      ),
    ).rejects.toThrow(/422/)
    expect(calls).toBe(1)
  })

  it('tras agotar reintentos da un mensaje claro', async () => {
    await expect(
      withRetry(
        async () => {
          throw new TypeError('Failed to fetch')
        },
        2,
        1,
      ),
    ).rejects.toThrow(/Se cortó la conexión/)
  })
})
