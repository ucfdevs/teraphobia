import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { clearRooms, createRoom, getRoom, MAX_PLAYERS } from '../src/rooms/store.js'
import { bearer, createUser } from './helpers.js'

const app = createApp()

beforeEach(() => {
  clearRooms()
})

describe('POST /api/rooms', () => {
  it('gives a verified user a 4-letter code with the Normal preset by default', async () => {
    const host = await createUser({ emailVerified: true })
    const res = await request(app).post('/api/rooms').set('Authorization', bearer(host)).send({})

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ code: expect.stringMatching(/^[A-Z]{4}$/), preset: 'normal' })
    expect(getRoom(res.body.code)?.hostUserId).toBe(host.id)
  })

  it('accepts each preset', async () => {
    const host = await createUser({ emailVerified: true })
    for (const preset of ['quick', 'normal', 'relaxed']) {
      const res = await request(app).post('/api/rooms').set('Authorization', bearer(host)).send({ preset })
      expect(res.status).toBe(201)
      expect(res.body.preset).toBe(preset)
    }
  })

  it('gives 100 rooms 100 different codes', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i += 1) codes.add(createRoom(`host-${i}`, 'normal').code)
    expect(codes.size).toBe(100)
  })

  it("replaces the host's old room", async () => {
    const host = await createUser({ emailVerified: true })
    const first = await request(app).post('/api/rooms').set('Authorization', bearer(host)).send({})
    const second = await request(app).post('/api/rooms').set('Authorization', bearer(host)).send({})

    expect(getRoom(first.body.code)).toBeUndefined()
    expect(getRoom(second.body.code)?.hostUserId).toBe(host.id)
  })

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/rooms').send({})
    expect(res.status).toBe(401)
    expect(res.body.error).toEqual(expect.any(String))
  })

  it('returns 403 for an unverified user', async () => {
    const host = await createUser()
    const res = await request(app).post('/api/rooms').set('Authorization', bearer(host)).send({})
    expect(res.status).toBe(403)
    expect(res.body.error).toEqual(expect.any(String))
  })

  it('returns 400 for a bad preset', async () => {
    const host = await createUser({ emailVerified: true })
    const res = await request(app).post('/api/rooms').set('Authorization', bearer(host)).send({ preset: 'turbo' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/rooms/:code', () => {
  async function newRoom() {
    const host = await createUser({ emailVerified: true })
    const res = await request(app).post('/api/rooms').set('Authorization', bearer(host)).send({})
    return res.body.code as string
  }

  it('returns open for a new room, without signing in', async () => {
    const code = await newRoom()
    const res = await request(app).get(`/api/rooms/${code}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ code, status: 'open' })
  })

  it('accepts a lowercase code', async () => {
    const code = await newRoom()
    const res = await request(app).get(`/api/rooms/${code.toLowerCase()}`)
    expect(res.body).toEqual({ code, status: 'open' })
  })

  it('reports full and started rooms', async () => {
    const code = await newRoom()
    const room = getRoom(code)!
    room.seats = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ seatId: `s${i}`, displayName: `P${i}`, connected: true }))
    expect((await request(app).get(`/api/rooms/${code}`)).body.status).toBe('full')

    room.startedAt = new Date()
    expect((await request(app).get(`/api/rooms/${code}`)).body.status).toBe('started')
  })

  it('returns 404 for an unknown code', async () => {
    const res = await request(app).get('/api/rooms/ZZZZ')
    expect(res.status).toBe(404)
    expect(res.body.error).toEqual(expect.any(String))
  })
})
