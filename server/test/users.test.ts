import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { User } from '../src/models/user.js'
import { bearer, createUser, expiredBearer } from './helpers.js'

const app = createApp()

describe.each([
  ['GET', () => request(app).get('/api/users/me')],
  ['PATCH', () => request(app).patch('/api/users/me').send({ displayName: 'X' })],
])('%s /api/users/me auth', (_method, call) => {
  it('returns 401 with no token', async () => {
    const res = await call()
    expect(res.status).toBe(401)
    expect(res.body.error).toEqual(expect.any(String))
  })

  it('returns 401 with a bad token', async () => {
    expect((await call().set('Authorization', 'Bearer not-a-jwt')).status).toBe(401)
  })

  it('returns 401 with an expired token', async () => {
    const user = await createUser()
    expect((await call().set('Authorization', expiredBearer(user))).status).toBe(401)
  })
})

describe('GET /api/users/me', () => {
  it('returns the profile and stats without secrets', async () => {
    const user = await createUser({ googleId: 'google-123', avatarId: 'bat' })
    const res = await request(app).get('/api/users/me').set('Authorization', bearer(user))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarId: 'bat',
      emailVerified: false,
      signInMethods: ['password', 'google'],
      stats: { gamesPlayed: 0, villagerWins: 0, monsterWins: { vampire: 0, witch: 0, werewolf: 0 } },
    })
    expect(res.body.createdAt).toEqual(expect.any(String))
    expect(res.body).not.toHaveProperty('passwordHash')
    expect(res.body).not.toHaveProperty('googleId')
  })
})

describe('PATCH /api/users/me', () => {
  it('updates displayName and avatarId and ignores other fields', async () => {
    const user = await createUser()
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', bearer(user))
      .send({ displayName: '  Night Owl  ', avatarId: 'owl', email: 'hacker@example.com', emailVerified: true })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ displayName: 'Night Owl', avatarId: 'owl', email: user.email, emailVerified: false })
    const saved = await User.findById(user.id)
    expect(saved).toMatchObject({ displayName: 'Night Owl', avatarId: 'owl', email: user.email, emailVerified: false })
  })

  it.each([[''], ['   '], ['x'.repeat(33)], [42]])('rejects displayName %j with 400', async (displayName) => {
    const user = await createUser()
    const res = await request(app).patch('/api/users/me').set('Authorization', bearer(user)).send({ displayName })
    expect(res.status).toBe(400)
    expect((await User.findById(user.id))!.displayName).toBe(user.displayName)
  })

  it('rejects an invalid avatarId with 400', async () => {
    const user = await createUser()
    const res = await request(app).patch('/api/users/me').set('Authorization', bearer(user)).send({ avatarId: '' })
    expect(res.status).toBe(400)
  })
})
