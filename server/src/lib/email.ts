// Sends mail through the Resend HTTP API. Tests mock this module.

interface Email {
  to: string
  subject: string
  text: string
  html: string
}

const DEFAULT_FROM = 'Teraphobia <noreply@teraphobia.com>'

export async function sendEmail({ to, subject, text, html }: Email) {
  const { RESEND_API_KEY, EMAIL_FROM = DEFAULT_FROM } = process.env
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text, html }),
    // Register waits on this call, so a slow Resend can't hang sign up for long.
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`)
}

function appLink(path: string, token: string) {
  const url = new URL(path, process.env.APP_URL)
  url.searchParams.set('token', token)
  return url.toString()
}

export function sendVerificationEmail(to: string, token: string) {
  const link = appLink('/verify', token)
  return sendEmail({
    to,
    subject: 'Verify your Teraphobia email',
    text: `Confirm your email to host Teraphobia games:\n\n${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Confirm your email to host Teraphobia games:</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  })
}

export function sendPasswordResetEmail(to: string, token: string) {
  const link = appLink('/reset-password', token)
  return sendEmail({
    to,
    subject: 'Reset your Teraphobia password',
    text: `Set a new Teraphobia password:\n\n${link}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`,
    html: `<p>Set a new Teraphobia password:</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour. If you didn't ask for this, ignore this email.</p>`,
  })
}
