import jwt from 'jsonwebtoken'

// A guest's proof of their seat, sent back in room:join after a drop. Signed, so it can't be forged or moved
// to another room or seat.
const REJOIN_TOKEN_TTL = '12h'

export function signRejoinToken(code: string, seatId: string) {
  return jwt.sign({ typ: 'rejoin', code, seatId }, process.env.JWT_SECRET!, { expiresIn: REJOIN_TOKEN_TTL })
}

export function verifyRejoinToken(token: string): { code: string; seatId: string } | null {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] })
    if (typeof payload === 'string' || payload.typ !== 'rejoin') return null
    if (typeof payload.code !== 'string' || typeof payload.seatId !== 'string') return null
    return { code: payload.code, seatId: payload.seatId }
  } catch {
    return null
  }
}
