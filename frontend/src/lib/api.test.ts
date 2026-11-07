import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withRetry } from './api.ts'

test('reintenta tras un corte de red y acaba bien', async () => {
  let calls = 0
  const out = await withRetry(async () => {
    if (++calls < 3) throw new TypeError('Failed to fetch')
    return 'ok'
  }, 5, 1)
  assert.equal(out, 'ok')
  assert.equal(calls, 3)
})

test('no reintenta errores HTTP del servidor', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(async () => {
      calls++
      throw new Error('422 imagen no válida')
    }, 5, 1),
    /422/,
  )
  assert.equal(calls, 1)
})

test('tras agotar reintentos da un mensaje claro', async () => {
  await assert.rejects(
    withRetry(async () => {
      throw new TypeError('Failed to fetch')
    }, 2, 1),
    /Se cortó la conexión/,
  )
})
