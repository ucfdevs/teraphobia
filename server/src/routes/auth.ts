import bcrypt from 'bcrypt'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/email.js'
import { verifyGoogleIdToken } from '../lib/google.js'
import type { GoogleIdentity } from '../lib/google.js'
import { signAccessToken } from '../lib/session.js'
import { EMAIL_PATTERN, normalizeEmail, passwordError, validDisplayName } from '../lib/validation.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { AuthToken, consumeToken, createToken, hashToken, revokeRefreshTokens } from '../models/authToken.js'
import { User } from '../models/user.js'

const BCRYPT_ROUNDS = 12
const MONGO_DUPLICATE_KEY = 11000
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000
const FORGOT_PASSWORD_MESSAGE = 'If that email has a password account, a reset link is on its way'
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

// The session response for register, login, refresh, and Google sign in.
async function sendSession(res: Response, status: number, user: UserDoc) {
  const accessToken = signAccessToken(user.id)
  const refreshToken = await createToken(user._id, 'refresh', REFRESH_TOKEN_TTL_MS)
  res.status(status).json({
    accessToken,
    refreshToken,
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
    await sendSession(res, 201, user)
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

  await sendSession(res, 200, user)
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

// Finds the user for a Google identity: by googleId, else links the account with the same email, else creates one.
async function findOrCreateGoogleUser(identity: GoogleIdentity): Promise<UserDoc | null> {
  const email = normalizeEmail(identity.email)
  const linked = await User.findOne({ googleId: identity.googleId })
  if (linked) return linked

  const existing = await User.findOne({ email })
  if (existing) {
    // Already linked to a different Google account.
    if (existing.googleId) return null
    existing.googleId = identity.googleId
    existing.emailVerified = true
    return existing.save()
  }

  const displayName = validDisplayName(identity.name?.slice(0, 32)) ?? validDisplayName(email.split('@')[0].slice(0, 32)) ?? 'Player'
  try {
    return await User.create({ email, googleId: identity.googleId, emailVerified: true, displayName })
  } catch (err) {
    // Another request created the account first; link to it instead.
    if ((err as { code?: number }).code === MONGO_DUPLICATE_KEY) return findOrCreateGoogleUser(identity)
    throw err
  }
}

async function googleSignIn(req: Request, res: Response) {
  const { idToken } = req.body ?? {}
  if (typeof idToken !== 'string' || !idToken) {
    res.status(400).json({ error: 'idToken is required' })
    return
  }

  let identity: GoogleIdentity
  try {
    identity = await verifyGoogleIdToken(idToken)
  } catch {
    res.status(401).json({ error: 'Invalid or expired Google token' })
    return
  }
  // An unverified Google email must never take over a password account.
  if (!identity.emailVerified) {
    res.status(401).json({ error: 'Google account email is not verified' })
    return
  }

  const user = await findOrCreateGoogleUser(identity)
  if (!user) {
    res.status(409).json({ error: 'This email is linked to a different Google account' })
    return
  }
  await sendSession(res, 200, user)
}

// Rotates the refresh token: the old one is used up and a new pair comes back.
async function refresh(req: Request, res: Response) {
  const token = await consumeToken(req.body?.refreshToken, 'refresh')
  const user = token && (await User.findById(token.userId))
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired refresh token' })
    return
  }
  await sendSession(res, 200, user)
}

async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body ?? {}
  if (typeof refreshToken !== 'string' || !refreshToken) {
    res.status(400).json({ error: 'refreshToken is required' })
    return
  }
  // Only the caller's own token can be revoked.
  await AuthToken.updateOne(
    { tokenHash: hashToken(refreshToken), type: 'refresh', userId: req.userId, usedAt: null },
    { usedAt: new Date() },
  )
  res.status(204).end()
}

// Same answer whether or not the email is registered.
async function forgotPassword(req: Request, res: Response) {
  const user = await User.findOne({ email: normalizeEmail(req.body?.email) })
  if (user?.passwordHash) {
    try {
      const token = await createToken(user._id, 'reset', RESET_TOKEN_TTL_MS)
      await sendPasswordResetEmail(user.email, token)
    } catch (err) {
      console.error('Could not send password reset email', err)
    }
  }
  res.json({ message: FORGOT_PASSWORD_MESSAGE })
}

async function resetPassword(req: Request, res: Response) {
  const { token: rawToken, password } = req.body ?? {}
  const invalidPassword = passwordError(password)
  if (invalidPassword) {
    res.status(400).json({ error: invalidPassword })
    return
  }
  const token = await consumeToken(rawToken, 'reset')
  if (!token) {
    res.status(400).json({ error: 'This link is invalid or has expired' })
    return
  }
  await User.updateOne({ _id: token.userId }, { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) })
  await revokeRefreshTokens(token.userId)
  res.json({ message: 'Password updated, sign in again' })
}

// Ends every other session and returns a fresh one, so only this client stays signed in.
async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body ?? {}
  if (typeof currentPassword !== 'string') {
    res.status(400).json({ error: 'currentPassword is required' })
    return
  }
  const invalidPassword = passwordError(newPassword)
  if (invalidPassword) {
    res.status(400).json({ error: invalidPassword })
    return
  }

  const user = await User.findById(req.userId)
  const matches = await bcrypt.compare(currentPassword, user?.passwordHash ?? DUMMY_HASH)
  if (!user?.passwordHash || !matches) {
    res.status(401).json({ error: 'Current password is incorrect' })
    return
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await user.save()
  await revokeRefreshTokens(user._id)
  await sendSession(res, 200, user)
}

// A factory so every app (and every test) gets its own rate limiter.
export function createAuthRouter() {
  const router = Router()
  const limiter = createLimiter()

  router.post('/register', limiter, register)
  router.post('/login', limiter, login)
  router.post('/verify', limiter, verify)
  router.post('/resend-verification', limiter, resendVerification)
  router.post('/google', limiter, googleSignIn)
  router.post('/refresh', refresh)
  router.post('/logout', requireAuth, logout)
  router.post('/forgot-password', limiter, forgotPassword)
  router.post('/reset-password', limiter, resetPassword)
  router.post('/change-password', requireAuth, limiter, changePassword)

  return router
}
