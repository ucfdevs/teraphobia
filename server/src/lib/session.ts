import jwt from 'jsonwebtoken'

export const ACCESS_TOKEN_TTL = '15m'

export function signAccessToken(userId: string) {
  return jwt.sign({}, process.env.JWT_SECRET!, { subject: userId, expiresIn: ACCESS_TOKEN_TTL })
}

// The user id in a valid access token, or null if it is invalid or expired.
export function verifyAccessToken(token: string) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] })
    if (typeof payload === 'string' || !payload.sub) return null
    return payload.sub
  } catch {
    return null
  }
}
