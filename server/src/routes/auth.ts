import bcrypt from 'bcrypt'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { User } from '../models/user.js'

const BCRYPT_ROUNDS = 12
const ACCESS_TOKEN_TTL = '15m'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MONGO_DUPLICATE_KEY = 11000

// Compared against when the account doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('teraphobia-dummy-password', BCRYPT_ROUNDS)

type UserDoc = InstanceType<typeof User>

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
})

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function passwordError(value: unknown) {
  if (typeof value !== 'string') return 'Password is required'
  if (value.length < 8) return 'Password must be at least 8 characters'
  // bcrypt ignores everything past 72 bytes.
  if (Buffer.byteLength(value) > 72) return 'Password must be at most 72 bytes'
  return null
}

function sendSession(res: Response, status: number, user: UserDoc) {
  const accessToken = jwt.sign({}, process.env.JWT_SECRET!, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL,
  })
  res.status(status).json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
    },
  })
}

async function register(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email)
  const { password, displayName } = req.body ?? {}

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'A valid email is required' })
    return
  }
  const invalidPassword = passwordError(password)
  if (invalidPassword) {
    res.status(400).json({ error: invalidPassword })
    return
  }
  const name = displayName === undefined ? email.split('@')[0] : displayName
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 32) {
    res.status(400).json({ error: 'Display name must be 1 to 32 characters' })
    return
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  try {
    const user = await User.create({ email, passwordHash, displayName: name.trim() })
    sendSession(res, 201, user)
  } catch (err) {
    if ((err as { code?: number }).code === MONGO_DUPLICATE_KEY) {
      res.status(409).json({ error: 'Email is already registered' })
      return
    }
    throw err
  }
}

async function login(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email)
  const { password } = req.body ?? {}

  if (!email || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  const user = await User.findOne({ email })
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user?.passwordHash || !matches) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  sendSession(res, 200, user)
}

export const authRouter = Router()

authRouter.post('/register', limiter, register)
authRouter.post('/login', limiter, login)
