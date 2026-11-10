import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { sendVerificationEmail } from '../src/lib/email.js'
import { AuthToken, createToken, hashToken } from '../src/models/authToken.js'
import { User } from '../src/models/user.js'
import { createUser } from './helpers.js'

vi.mock('../src/lib/email.js')

const app = createApp()
const sendMock = vi.mocked(sendVerificationEmail)

function sentToken() {
  const [, token] = sendMock.mock.calls.at(-1)!
  return token
}

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue(undefined)
})

describe('verification on register', () => {
  it('sends exactly one email and stores only the token hash', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'verify-me@example.com', password: 'correct-horse' })

    expect(res.status).toBe(201)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('verify-me@example.com', expect.any(String))

    const token = sentToken()
    const docs = await AuthToken.find({ userId: res.body.user.id, type: 'verify' }).lean()
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ type: 'verify', tokenHash: hashToken(token) })
    expect(JSON.stringify(docs)).not.toContain(token)
    const hours = (docs[0].expiresAt.getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.9)
    expect(hours).toBeLessThanOrEqual(24)
  })

  it('still registers when the email fails to send', async () => {
    sendMock.mockRejectedValue(new Error('Resend is down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).post('/api/auth/register').send({ email: 'resend-down@example.com', password: 'correct-horse' })
    expect(res.status).toBe(201)
  })
})

describe('POST /api/auth/verify', () => {
  it('verifies the email with a valid token, once', async () => {
    const user = await createUser()
    const token = await createToken(user._id, 'verify', 60_000)

    const res = await request(app).post('/api/auth/verify').send({ token })
    expect(res.status).toBe(200)
    expect((await User.findById(user.id))!.emailVerified).toBe(true)
    expect((await AuthToken.findOne({ tokenHash: hashToken(token) }))!.usedAt).toBeInstanceOf(Date)

    const reused = await request(app).post('/api/auth/verify').send({ token })
    expect(reused.status).toBe(400)
    expect(reused.body.error).toEqual(expect.any(String))
  })

  it('rejects an expired token with 400', async () => {
    const user = await createUser()
    const token = await createToken(user._id, 'verify', -1000)
    expect((await request(app).post('/api/auth/verify').send({ token })).status).toBe(400)
    expect((await User.findById(user.id))!.emailVerified).toBe(false)
  })

  it('rejects an unknown or missing token with 400', async () => {
    expect((await request(app).post('/api/auth/verify').send({ token: 'nope' })).status).toBe(400)
    expect((await request(app).post('/api/auth/verify').send({})).status).toBe(400)
  })

  it('rejects a token of another type with 400', async () => {
    const user = await createUser()
    const token = await createToken(user._id, 'reset', 60_000)
    expect((await request(app).post('/api/auth/verify').send({ token })).status).toBe(400)
  })
})

describe('POST /api/auth/resend-verification', () => {
  it('sends a new link to an unverified account', async () => {
    const user = await createUser()
    const res = await request(app).post('/api/auth/resend-verification').send({ email: user.email.toUpperCase() })
    expect(res.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)

    expect((await request(app).post('/api/auth/verify').send({ token: sentToken() })).status).toBe(200)
  })

  it('answers the same and sends nothing for an unknown email or a verified account', async () => {
    const known = await request(app).post('/api/auth/resend-verification').send({ email: (await createUser()).email })
    sendMock.mockClear()

    const unknown = await request(app).post('/api/auth/resend-verification').send({ email: 'ghost@example.com' })
    const verified = await createUser({ emailVerified: true })
    const already = await request(app).post('/api/auth/resend-verification').send({ email: verified.email })

    expect(unknown.status).toBe(200)
    expect(already.status).toBe(200)
    expect(unknown.body).toEqual(known.body)
    expect(already.body).toEqual(known.body)
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('verification email limits', () => {
  it('sends at most one verification email a minute', async () => {
    const limited = createApp()
    const user = await createUser()
    await request(limited).post('/api/auth/resend-verification').send({ email: user.email })
    const second = await request(limited).post('/api/auth/resend-verification').send({ email: user.email })

    expect(second.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
