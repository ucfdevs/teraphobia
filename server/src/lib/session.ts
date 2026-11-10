import jwt from 'jsonwebtoken'

export const ACCESS_TOKEN_TTL = '15m'

export function signAccessToken(userId: string) {
  return jwt.sign({}, process.env.JWT_SECRET!, { subject: userId, expiresIn: ACCESS_TOKEN_TTL })
}
