export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function passwordError(value: unknown) {
  if (typeof value !== 'string') return 'Password is required'
  if (value.length < 8) return 'Password must be at least 8 characters'
  // bcrypt ignores everything past 72 bytes.
  if (Buffer.byteLength(value) > 72) return 'Password must be at most 72 bytes'
  return null
}

// Returns the trimmed name, or null if it isn't 1 to 32 characters.
export function validDisplayName(value: unknown) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length >= 1 && name.length <= 32 ? name : null
}
