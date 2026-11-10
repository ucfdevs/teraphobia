import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { AuthToken, createToken, hashToken } from '../src/models/authToken.js'
import { bearer, createUser } from './helpers.js'

vi.mock('../src/lib/email.js')

const app = createApp()

describe('refresh tokens on sign in', () => {
  it('register and login both return a stored refresh token', async () => {
    const body = { email: 'pair@example.com', password: 'correct-horse' }
    const registered = await request(app).post('/api/auth/register').send(body)
    const loggedIn = await request(app).post('/api/auth/login').send(body)

    for (const res of [registered, loggedIn]) {
      expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), user: { email: body.email } })
      const doc = await AuthToken.findOne({ tokenHash: hashToken(res.body.refreshToken) })
      expect(doc).toMatchObject({ type: 'refresh' })
      expect(doc!.userId.toString()).toBe(res.body.user.id)
      const days = (doc!.expiresAt.getTime() - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(29.9)
    }
  })
})

describe('POST /api/auth/refresh', () => {
  it('returns a new pair and retires the old refresh token', async () => {
    const user = await createUser()
    const refreshToken = await createToken(user._id, 'refresh', 60_000)

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), user: { id: user.id } })
    expect(res.body.refreshToken).not.toBe(refreshToken)

    expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(401)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: res.body.refreshToken })).status).toBe(200)
  })

  it('rejects unknown, missing, expired, and non-refresh tokens with 401', async () => {
    const user = await createUser()
    const expired = await createToken(user._id, 'refresh', -1000)
    const verify = await createToken(user._id, 'verify', 60_000)

    for (const refreshToken of ['unknown', undefined, expired, verify]) {
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken })
      expect(res.status).toBe(401)
      expect(res.body.error).toEqual(expect.any(String))
    }
  })

  it('new access token works on protected routes', async () => {
    const user = await createUser()
    const refreshToken = await createToken(user._id, 'refresh', 60_000)
    const { body } = await request(app).post('/api/auth/refresh').send({ refreshToken })
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${body.accessToken}`)
    expect(me.status).toBe(200)
  })
})

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and returns 204', async () => {
    const user = await createUser()
    const refreshToken = await createToken(user._id, 'refresh', 60_000)

    const res = await request(app).post('/api/auth/logout').set('Authorization', bearer(user)).send({ refreshToken })
    expect(res.status).toBe(204)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(401)
  })

  it('works without an access token', async () => {
    const user = await createUser()
    const refreshToken = await createToken(user._id, 'refresh', 60_000)

    expect((await request(app).post('/api/auth/logout').send({ refreshToken })).status).toBe(204)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(401)
  })

  it('requires a refreshToken', async () => {
    expect((await request(app).post('/api/auth/logout').send({})).status).toBe(400)
  })
})
