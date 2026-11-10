import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { User } from '../src/models/user.js'

vi.mock('../src/lib/email.js')

const app = createApp()

describe('POST /api/auth/register', () => {
  it('creates an unverified account and returns a session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'New@Example.com', password: 'correct-horse', displayName: 'Newbie' })

    expect(res.status).toBe(201)
    expect(res.body.accessToken).toEqual(expect.any(String))
    expect(res.body.user).toMatchObject({ email: 'new@example.com', displayName: 'Newbie', emailVerified: false })
    expect(res.body.user).not.toHaveProperty('passwordHash')
    expect(await User.countDocuments({ email: 'new@example.com' })).toBe(1)
  })

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'correct-horse' })
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual(expect.any(String))
  })

  it('rejects a short password with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'short@example.com', password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/at least 8/)
  })

  it('rejects a duplicate email with 409', async () => {
    const body = { email: 'dupe@example.com', password: 'correct-horse' }
    expect((await request(app).post('/api/auth/register').send(body)).status).toBe(201)
    const res = await request(app).post('/api/auth/register').send(body)
    expect(res.status).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  const email = 'login@example.com'
  const password = 'correct-horse'

  it('signs in with the right password', async () => {
    await request(app).post('/api/auth/register').send({ email, password })
    const res = await request(app).post('/api/auth/login').send({ email, password })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toEqual(expect.any(String))
    expect(res.body.user.email).toBe(email)
  })

  it('rejects a wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.body).not.toHaveProperty('accessToken')
  })

  it('rejects an unknown email with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password })
    expect(res.status).toBe(401)
  })

  it('rejects missing fields with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })
})

describe('default display name', () => {
  it('cuts a long email name to 32 characters', async () => {
    const local = 'a'.repeat(40)
    const res = await request(createApp()).post('/api/auth/register').send({ email: `${local}@example.com`, password: 'correct-horse' })
    expect(res.status).toBe(201)
    expect(res.body.user.displayName).toBe('a'.repeat(32))
  })
})

describe('rate limits', () => {
  it('gives each route its own limit', async () => {
    const limited = createApp()
    for (let i = 0; i < 20; i += 1) await request(limited).post('/api/auth/login').send({})
    expect((await request(limited).post('/api/auth/login').send({})).status).toBe(429)

    const res = await request(limited).post('/api/auth/register').send({ email: 'limits@example.com', password: 'correct-horse' })
    expect(res.status).toBe(201)
  })
})
