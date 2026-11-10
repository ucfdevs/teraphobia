import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth.
      userId?: string
    }
  }
}

// Checks `Authorization: Bearer <access token>` and sets req.userId.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = req.get('authorization')?.split(' ') ?? []
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Sign in required' })
    return
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] })
    if (typeof payload === 'string' || !payload.sub) throw new Error('No subject')
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
