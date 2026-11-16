// Checks docs/openapi.yaml against the real server: every documented operation is called, and each response
// must use a documented status code and match that status code's schema. If the API changes, this fails until
// the spec is updated.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv } from 'ajv'
import request from 'supertest'
import type { Response } from 'supertest'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { createApp } from '../src/app.js'
import { saveFinishedGame } from '../src/games/results.js'
import { verifyGoogleIdToken } from '../src/lib/google.js'
import { createToken } from '../src/models/authToken.js'
import { bearer, createUser } from './helpers.js'

vi.mock('../src/lib/email.js')
vi.mock('../src/lib/google.js')

type Method = 'get' | 'post' | 'patch'

const spec = parse(readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'openapi.yaml'), 'utf8'))
// Not built yet (see the spec's description).
const PLANNED = new Set(['get /health'])

// OpenAPI 3.0 marks optional nulls with `nullable`; JSON Schema uses a type union.
function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toJsonSchema)
  if (!node || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) if (key !== 'nullable') out[key] = toJsonSchema(value)
  if ((node as { nullable?: boolean }).nullable && typeof out.type === 'string') out.type = [out.type, 'null']
  return out
}

const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true })
ajv.addSchema(toJsonSchema(spec) as object, 'openapi')

const pointer = (...parts: string[]) => parts.map((p) => encodeURIComponent(p.replace(/~/g, '~0').replace(/\//g, '~1'))).join('/')

const called = new Set<string>()

// Asserts the response is documented for this operation and matches its schema.
function expectDocumented(method: Method, path: string, res: Response) {
  const op = spec.paths[path]?.[method]
  expect(op, `${method.toUpperCase()} ${path} is in the spec`).toBeDefined()
  called.add(`${method} ${path}`)

  const status = String(res.status)
  let response = op.responses[status]
  expect(response, `${method.toUpperCase()} ${path} documents ${status}`).toBeDefined()
  let base = pointer('paths', path, method, 'responses', status)
  if (response.$ref) {
    const name = response.$ref.split('/').at(-1)
    response = spec.components.responses[name]
    base = pointer('components', 'responses', name)
  }

  if (!response.content) {
    expect(res.text, `${method.toUpperCase()} ${path} ${status} has no body`).toBe('')
    return
  }
  const validate = ajv.getSchema(`openapi#/${base}/${pointer('content', 'application/json', 'schema')}`)!
  const valid = validate(res.body)
  expect(valid, `${method.toUpperCase()} ${path} ${status}: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(res.body)}`).toBe(true)
}

const app = createApp()
const call = (method: Method, url: string) => request(app)[method](`/api${url}`)

describe('docs/openapi.yaml', () => {
  it('describes register and login exactly', async () => {
    const body = { email: 'spec@example.com', password: 'correct-horse', displayName: 'Spec' }
    expectDocumented('post', '/auth/register', await call('post', '/auth/register').send(body))
    expectDocumented('post', '/auth/register', await call('post', '/auth/register').send({ ...body, email: 'nope' }))
    expectDocumented('post', '/auth/register', await call('post', '/auth/register').send(body))

    expectDocumented('post', '/auth/login', await call('post', '/auth/login').send(body))
    expectDocumented('post', '/auth/login', await call('post', '/auth/login').send({}))
    expectDocumented('post', '/auth/login', await call('post', '/auth/login').send({ ...body, password: 'wrong-password' }))
  })

  it('answers 429 in the documented shape', async () => {
    const limited = createApp()
    let res: Response | undefined
    for (let i = 0; i < 6; i += 1) res = await request(limited).post('/api/auth/forgot-password').send({ email: 'x@example.com' })
    expect(res!.status).toBe(429)
    expectDocumented('post', '/auth/forgot-password', res!)
  })

  it('describes verification, Google, refresh, logout, and passwords', async () => {
    const user = await createUser()
    expectDocumented('post', '/auth/verify', await call('post', '/auth/verify').send({ token: await createToken(user._id, 'verify', 60_000) }))
    expectDocumented('post', '/auth/verify', await call('post', '/auth/verify').send({ token: 'nope' }))
    expectDocumented('post', '/auth/resend-verification', await call('post', '/auth/resend-verification').send({ email: user.email }))

    vi.mocked(verifyGoogleIdToken).mockResolvedValueOnce({ googleId: 'g-spec', email: 'g@example.com', emailVerified: true, name: 'G' })
    expectDocumented('post', '/auth/google', await call('post', '/auth/google').send({ idToken: 'ok' }))
    vi.mocked(verifyGoogleIdToken).mockRejectedValueOnce(new Error('bad'))
    expectDocumented('post', '/auth/google', await call('post', '/auth/google').send({ idToken: 'bad' }))
    expectDocumented('post', '/auth/google', await call('post', '/auth/google').send({}))

    const refreshToken = await createToken(user._id, 'refresh', 60_000)
    const refreshed = await call('post', '/auth/refresh').send({ refreshToken })
    expectDocumented('post', '/auth/refresh', refreshed)
    expectDocumented('post', '/auth/refresh', await call('post', '/auth/refresh').send({ refreshToken }))
    expectDocumented('post', '/auth/logout', await call('post', '/auth/logout').send({ refreshToken: refreshed.body.refreshToken }))
    expectDocumented('post', '/auth/logout', await call('post', '/auth/logout').send({}))

    expectDocumented('post', '/auth/forgot-password', await call('post', '/auth/forgot-password').send({ email: user.email }))
    const resetToken = await createToken(user._id, 'reset', 60_000)
    expectDocumented('post', '/auth/reset-password', await call('post', '/auth/reset-password').send({ token: resetToken, password: 'brand-new-pass' }))
    expectDocumented('post', '/auth/reset-password', await call('post', '/auth/reset-password').send({ token: resetToken, password: 'brand-new-pass' }))

    const changes = (currentPassword: string) =>
      call('post', '/auth/change-password').set('Authorization', bearer(user)).send({ currentPassword, newPassword: 'another-pass' })
    expectDocumented('post', '/auth/change-password', await changes('wrong'))
    expectDocumented('post', '/auth/change-password', await changes('brand-new-pass'))
    expectDocumented('post', '/auth/change-password', await call('post', '/auth/change-password').send({}))
  })

  it('describes profiles, rooms, and history', async () => {
    const host = await createUser({ emailVerified: true, avatarId: 'bat' })
    const auth = bearer(host)
    expectDocumented('get', '/users/me', await call('get', '/users/me').set('Authorization', auth))
    expectDocumented('get', '/users/me', await call('get', '/users/me'))
    expectDocumented('patch', '/users/me', await call('patch', '/users/me').set('Authorization', auth).send({ displayName: 'Host' }))
    expectDocumented('patch', '/users/me', await call('patch', '/users/me').set('Authorization', auth).send({ displayName: '' }))

    const created = await call('post', '/rooms').set('Authorization', auth).send({ preset: 'quick' })
    expectDocumented('post', '/rooms', created)
    expectDocumented('post', '/rooms', await call('post', '/rooms').set('Authorization', auth).send({ preset: 'turbo' }))
    expectDocumented('post', '/rooms', await call('post', '/rooms').set('Authorization', bearer(await createUser())).send({}))
    expectDocumented('get', '/rooms/{code}', await call('get', `/rooms/${created.body.code}`))
    expectDocumented('get', '/rooms/{code}', await call('get', '/rooms/ZZZZ'))

    await saveFinishedGame({
      roomCode: 'SPEC',
      hostUserId: host.id,
      preset: 'normal',
      startedAt: new Date('2026-11-01T20:00:00Z'),
      endedAt: new Date('2026-11-01T20:20:00Z'),
      seats: ['a', 'b', 'c', 'd'].map((seatId, i) => ({
        seatId,
        displayName: `P${i}`,
        costume: { hat: 'hat1', mask: `mask${i + 1}`, item: 'item1' },
        userId: i === 1 ? host.id : undefined,
        diedRound: i === 2 ? 1 : undefined,
      })),
      result: { winner: 'villagers', endReason: 'banished', rounds: 2, monster: { seatId: 'a', monsterType: 'witch' }, hunches: [{ seatId: 'b', round: 1, suspectId: 'a' }] },
    })
    const history = await call('get', '/users/me/games').set('Authorization', auth)
    expectDocumented('get', '/users/me/games', history)
    expect(history.body.games).toHaveLength(1)
    expectDocumented('get', '/users/me/games', await call('get', '/users/me/games?page=0').set('Authorization', auth))
    expectDocumented('get', '/games/{id}', await call('get', `/games/${history.body.games[0].id}`).set('Authorization', auth))
    expectDocumented('get', '/games/{id}', await call('get', '/games/6740f0c2a1b2c3d4e5f60718').set('Authorization', auth))
    expectDocumented('get', '/games/{id}', await call('get', '/games/6740f0c2a1b2c3d4e5f60718'))
  })

  afterAll(() => {
    // Every documented operation was exercised, so none of them can drift unnoticed.
    const documented = Object.entries(spec.paths).flatMap(([path, ops]) =>
      Object.keys(ops as object).filter((m) => ['get', 'post', 'patch', 'put', 'delete'].includes(m)).map((m) => `${m} ${path}`),
    )
    expect(documented.filter((op) => !called.has(op) && !PLANNED.has(op))).toEqual([])
    expect(documented).toHaveLength(17)
  })
})
