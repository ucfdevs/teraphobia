import bcrypt from 'bcrypt'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { sendPasswordResetEmail } from '../src/lib/email.js'
import { AuthToken, createToken, hashToken } from '../src/models/authToken.js'
import { User } from '../src/models/user.js'
import { bearer, createUser } from './helpers.js'

vi.mock('../src/lib/email.js')

const sendMock = vi.mocked(sendPasswordResetEmail)

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue(undefined)
})

async function passwordMatches(userId: string, password: string) {
  const user = await User.findById(userId)
  return bcrypt.compare(password, user!.passwordHash!)
}

describe('POST /api/auth/forgot-password', () => {
  const app = createApp()

  it('emails a 1-hour reset link to a password account', async () => {
    const user = await createUser()
    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email })

    expect(res.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [to, token] = sendMock.mock.calls[0]
    expect(to).toBe(user.email)
    const doc = await AuthToken.findOne({ tokenHash: hashToken(token) })
    expect(doc).toMatchObject({ type: 'reset' })
    const minutes = (doc!.expiresAt.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(59)
    expect(minutes).toBeLessThanOrEqual(60)
  })

  it('answers the same for unknown emails and Google-only accounts, and sends nothing', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email: (await createUser()).email })
    sendMock.mockClear()

    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' })
    const google = await createUser({ passwordHash: undefined, googleId: 'g-only' })
    const googleOnly = await request(app).post('/api/auth/forgot-password').send({ email: google.email })

    expect(unknown.status).toBe(200)
    expect(unknown.body).toEqual(known.body)
    expect(googleOnly.body).toEqual(known.body)
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/reset-password', () => {
  const app = createApp()

  it('sets the new password once and revokes refresh tokens', async () => {
    const user = await createUser()
    const refreshToken = await createToken(user._id, 'refresh', 60_000)
    const token = await createToken(user._id, 'reset', 60 * 60_000)

    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' })
    expect(res.status).toBe(200)
    expect(await passwordMatches(user.id, 'brand-new-pass')).toBe(true)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(401)

    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass' })
    expect(again.status).toBe(400)
    expect(await passwordMatches(user.id, 'brand-new-pass')).toBe(true)
  })

  it('rejects an expired token', async () => {
    const user = await createUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    const token = await createToken(user._id, 'reset', 60 * 60_000)
    vi.setSystemTime(Date.now() + 61 * 60_000)
    try {
      const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' })
      expect(res.status).toBe(400)
    } finally {
      vi.useRealTimers()
    }
    expect(await passwordMatches(user.id, 'correct-horse')).toBe(true)
  })

  it('rejects an unknown token and a weak password with 400', async () => {
    const user = await createUser()
    const token = await createToken(user._id, 'reset', 60_000)
    expect((await request(app).post('/api/auth/reset-password').send({ token: 'nope', password: 'brand-new-pass' })).status).toBe(400)
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'short' })).status).toBe(400)
    // The weak-password attempt doesn't use up the token.
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' })).status).toBe(200)
  })
})

describe('POST /api/auth/change-password', () => {
  const app = createApp()

  it('changes the password, ends other sessions, and returns a new session', async () => {
    const user = await createUser()
    const otherSession = await createToken(user._id, 'refresh', 60_000)

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', bearer(user))
      .send({ currentPassword: 'correct-horse', newPassword: 'brand-new-pass' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) })
    expect(await passwordMatches(user.id, 'brand-new-pass')).toBe(true)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: otherSession })).status).toBe(401)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: res.body.refreshToken })).status).toBe(200)
  })

  it('rejects a wrong current password with 401', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', bearer(user))
      .send({ currentPassword: 'wrong-password', newPassword: 'brand-new-pass' })
    expect(res.status).toBe(401)
    expect(await passwordMatches(user.id, 'correct-horse')).toBe(true)
  })

  it('rejects a weak new password with 400 and no token with 401', async () => {
    const user = await createUser()
    const weak = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', bearer(user))
      .send({ currentPassword: 'correct-horse', newPassword: 'short' })
    expect(weak.status).toBe(400)

    const anonymous = await request(app).post('/api/auth/change-password').send({ currentPassword: 'a', newPassword: 'brand-new-pass' })
    expect(anonymous.status).toBe(401)
  })
})

describe('reset link limits', () => {
  const app = createApp()

  it('sends at most one reset email a minute', async () => {
    const user = await createUser()
    await request(app).post('/api/auth/forgot-password').send({ email: user.email })
    const second = await request(app).post('/api/auth/forgot-password').send({ email: user.email })

    expect(second.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('stops older reset links once one is used', async () => {
    const user = await createUser()
    const older = await createToken(user._id, 'reset', 60 * 60_000)
    const newer = await createToken(user._id, 'reset', 60 * 60_000)

    expect((await request(app).post('/api/auth/reset-password').send({ token: newer, password: 'brand-new-pass' })).status).toBe(200)
    expect((await request(app).post('/api/auth/reset-password').send({ token: older, password: 'another-pass' })).status).toBe(400)
  })
})
