import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { verifyGoogleIdToken } from '../src/lib/google.js'
import { User } from '../src/models/user.js'
import { createUser } from './helpers.js'

vi.mock('../src/lib/google.js')
vi.mock('../src/lib/email.js')

const app = createApp()
const verifyMock = vi.mocked(verifyGoogleIdToken)

function googleReturns(identity: Partial<Awaited<ReturnType<typeof verifyGoogleIdToken>>>) {
  verifyMock.mockResolvedValue({ googleId: 'g-1', email: 'g@example.com', emailVerified: true, name: 'Goo Gal', ...identity })
}

beforeEach(() => {
  verifyMock.mockReset()
})

describe('POST /api/auth/google', () => {
  it('creates a verified user for a new email', async () => {
    googleReturns({ googleId: 'g-new', email: 'New.Google@Example.com', name: 'New Googler' })
    const res = await request(app).post('/api/auth/google').send({ idToken: 'token' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { email: 'new.google@example.com', displayName: 'New Googler', emailVerified: true },
    })
    const user = await User.findById(res.body.user.id)
    expect(user).toMatchObject({ googleId: 'g-new', emailVerified: true })
    expect(user!.passwordHash).toBeUndefined()
    expect(verifyMock).toHaveBeenCalledWith('token')
  })

  it('returns the same user on a second sign in', async () => {
    googleReturns({ googleId: 'g-repeat', email: 'repeat@example.com' })
    const first = await request(app).post('/api/auth/google').send({ idToken: 'token' })
    const second = await request(app).post('/api/auth/google').send({ idToken: 'token' })

    expect(second.status).toBe(200)
    expect(second.body.user.id).toBe(first.body.user.id)
    expect(await User.countDocuments({ email: 'repeat@example.com' })).toBe(1)
  })

  it('links a password account with the same email instead of duplicating it', async () => {
    const existing = await createUser({ email: 'linked@example.com', emailVerified: true })
    googleReturns({ googleId: 'g-link', email: 'linked@example.com' })

    const res = await request(app).post('/api/auth/google').send({ idToken: 'token' })
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(existing.id)
    expect(await User.countDocuments({ email: 'linked@example.com' })).toBe(1)
    const user = await User.findById(existing.id)
    expect(user).toMatchObject({ googleId: 'g-link', emailVerified: true })
    expect(user!.passwordHash).toBe(existing.passwordHash)
  })

  it('ends the password and sessions of an unverified account it links', async () => {
    const reg = await request(app).post('/api/auth/register').send({ email: 'squatted@example.com', password: 'squatter-pass' })
    googleReturns({ googleId: 'g-owner', email: 'squatted@example.com' })

    const res = await request(app).post('/api/auth/google').send({ idToken: 'token' })
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(reg.body.user.id)
    expect((await User.findById(reg.body.user.id))!.passwordHash).toBeUndefined()
    expect((await request(app).post('/api/auth/login').send({ email: 'squatted@example.com', password: 'squatter-pass' })).status).toBe(401)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: reg.body.refreshToken })).status).toBe(401)
  })

  it('rejects an invalid or expired token with 401', async () => {
    verifyMock.mockRejectedValue(new Error('Token used too late'))
    const res = await request(app).post('/api/auth/google').send({ idToken: 'bad' })
    expect(res.status).toBe(401)
    expect(res.body.error).toEqual(expect.any(String))
  })

  it('rejects a Google account whose email is not verified', async () => {
    await createUser({ email: 'victim@example.com' })
    googleReturns({ googleId: 'g-attacker', email: 'victim@example.com', emailVerified: false })
    const res = await request(app).post('/api/auth/google').send({ idToken: 'token' })
    expect(res.status).toBe(401)
    expect((await User.findOne({ email: 'victim@example.com' }))!.googleId).toBeUndefined()
  })

  it('returns 400 with no idToken', async () => {
    expect((await request(app).post('/api/auth/google').send({})).status).toBe(400)
    expect(verifyMock).not.toHaveBeenCalled()
  })
})
