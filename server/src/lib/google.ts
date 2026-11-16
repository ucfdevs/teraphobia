import { OAuth2Client } from 'google-auth-library'

export interface GoogleIdentity {
  googleId: string
  email: string
  emailVerified: boolean
  name?: string
}

const client = new OAuth2Client()

function clientIds() {
  return [process.env.GOOGLE_WEB_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter((id): id is string => !!id)
}

// Verifies a Google ID token from the web or iOS app. Throws if it is invalid, expired, or for another app.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audience = clientIds()
  if (audience.length === 0) throw new Error('GOOGLE_WEB_CLIENT_ID or GOOGLE_IOS_CLIENT_ID must be set')

  const payload = (await client.verifyIdToken({ idToken, audience })).getPayload()
  if (!payload?.sub || !payload.email) throw new Error('Google token has no subject or email')
  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
  }
}
