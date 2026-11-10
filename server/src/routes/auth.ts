import bcrypt from 'bcrypt'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { sendVerificationEmail } from '../lib/email.js'
import { signAccessToken } from '../lib/session.js'
import { EMAIL_PATTERN, normalizeEmail, passwordError, validDisplayName } from '../lib/validation.js'
import { consumeToken, createToken } from '../models/authToken.js'
import { User } from '../models/user.js'

const BCRYPT_ROUNDS = 12
const MONGO_DUPLICATE_KEY = 11000
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const RESEND_VERIFICATION_MESSAGE = 'If that account needs verifying, a new link is on its way'

// Compared against when the account doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('teraphobia-dummy-password', BCRYPT_ROUNDS)

type UserDoc = InstanceType<typeof User>

function createLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again later' },
  })
}

// Email failures are logged, never surfaced: the user can ask for a new link.
async function emailVerificationLink(user: UserDoc) {
  try {
    const token = await createToken(user._id, 'verify', VERIFY_TOKEN_TTL_MS)
    await sendVerificationEmail(user.email, token)
  } catch (err) {
    console.error('Could not send verification email', err)
  }
}

function sendSession(res: Response, status: number, user: UserDoc) {
  const accessToken = signAccessToken(user.id)
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


//register function
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
  const name = validDisplayName(displayName === undefined ? email.split('@')[0] : displayName)
  if (!name) {
    res.status(400).json({ error: 'Display name must be 1 to 32 characters' })
    return
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  try {
    const user = await User.create({ email, passwordHash, displayName: name })
    await emailVerificationLink(user)
    sendSession(res, 201, user)
  } catch (err) {
    if ((err as { code?: number }).code === MONGO_DUPLICATE_KEY) {
      res.status(409).json({ error: 'Email is already registered' })
      return
    }
    throw err
  }
}

//login
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

async function verify(req: Request, res: Response) {
  const token = await consumeToken(req.body?.token, 'verify')
  if (!token) {
    res.status(400).json({ error: 'This link is invalid or has expired' })
    return
  }
  await User.updateOne({ _id: token.userId }, { emailVerified: true })
  res.json({ message: 'Email verified' })
}

// Same answer whether or not the email is registered.
async function resendVerification(req: Request, res: Response) {
  const user = await User.findOne({ email: normalizeEmail(req.body?.email) })
  if (user && !user.emailVerified) await emailVerificationLink(user)
  res.json({ message: RESEND_VERIFICATION_MESSAGE })
}

// A factory so every app (and every test) gets its own rate limiter.
export function createAuthRouter() {
  const router = Router()
  const limiter = createLimiter()

  router.post('/register', limiter, register)
  router.post('/login', limiter, login)
  router.post('/verify', limiter, verify)
  router.post('/resend-verification', limiter, resendVerification)

  return router
}
