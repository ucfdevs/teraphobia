import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { signAccessToken } from '../src/lib/session.js'
import { User } from '../src/models/user.js'

let counter = 0

// Creates a user straight in the database, skipping the rate-limited register route.
export async function createUser(overrides: Record<string, unknown> = {}, password = 'correct-horse') {
  counter += 1
  return User.create({
    email: `user${counter}-${Date.now()}@example.com`,
    passwordHash: await bcrypt.hash(password, 4),
    displayName: `Player ${counter}`,
    ...overrides,
  })
}

export function bearer(user: { id: string }) {
  return `Bearer ${signAccessToken(user.id)}`
}

export function expiredBearer(user: { id: string }) {
  return `Bearer ${jwt.sign({}, process.env.JWT_SECRET!, { subject: user.id, expiresIn: -10 })}`
}
