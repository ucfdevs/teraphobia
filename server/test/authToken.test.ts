import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { AuthToken, consumeToken, createToken, hashToken } from '../src/models/authToken.js'

describe('AuthToken model', () => {
  it('has a TTL index on expiresAt and a unique index on tokenHash', async () => {
    const indexes = await AuthToken.collection.indexes()
    expect(indexes).toContainEqual(expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }))
    expect(indexes).toContainEqual(expect.objectContaining({ key: { tokenHash: 1 }, unique: true }))
  })

  it('rejects a type outside the enum', async () => {
    const token = new AuthToken({ userId: new Types.ObjectId(), type: 'magic', tokenHash: 'x', expiresAt: new Date() })
    await expect(token.validate()).rejects.toThrow(/type/)
  })

  it('createToken returns a raw token and stores only its hash', async () => {
    const userId = new Types.ObjectId()
    const raw = await createToken(userId, 'verify', 60_000)
    const docs = await AuthToken.find({ userId }).lean()

    expect(docs).toHaveLength(1)
    expect(docs[0].tokenHash).toBe(hashToken(raw))
    expect(JSON.stringify(docs[0])).not.toContain(raw)
    expect(docs[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('consumeToken works once and only for the right type', async () => {
    const raw = await createToken(new Types.ObjectId(), 'reset', 60_000)
    expect(await consumeToken(raw, 'verify')).toBeNull()
    expect(await consumeToken(raw, 'reset')).not.toBeNull()
    expect(await consumeToken(raw, 'reset')).toBeNull()
  })

  it('consumeToken rejects an expired token', async () => {
    const raw = await createToken(new Types.ObjectId(), 'reset', -1)
    expect(await consumeToken(raw, 'reset')).toBeNull()
  })
})
