import { createHash, randomBytes } from 'node:crypto';
import { model, Schema } from 'mongoose';
export const AUTH_TOKEN_TYPES = ['verify', 'reset', 'refresh'];
const authTokenSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    // MongoDB deletes the document once this time passes.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: Date,
});
export const AuthToken = model('AuthToken', authTokenSchema);
export function hashToken(raw) {
    return createHash('sha256').update(raw).digest('hex');
}
// Saves only the hash; the raw token goes to the user and is never stored.
export async function createToken(userId, type, ttlMs) {
    const raw = randomBytes(32).toString('base64url');
    await AuthToken.create({ userId, type, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) });
    return raw;
}
// Marks a live (unused, unexpired) token used and returns it, or null. Atomic, so a token works once.
export function consumeToken(raw, type) {
    if (typeof raw !== 'string' || !raw)
        return Promise.resolve(null);
    const now = new Date();
    return AuthToken.findOneAndUpdate({ tokenHash: hashToken(raw), type, usedAt: null, expiresAt: { $gt: now } }, { usedAt: now });
}
// True if a token of this type was made for the user in the last minute, so emails can't be spammed.
// A token made at time t expires at t + ttlMs, so "made after now - 1 min" means "expires after now + ttlMs - 1 min".
export async function createdRecently(userId, type, ttlMs) {
    const found = await AuthToken.exists({ userId, type, expiresAt: { $gt: new Date(Date.now() + ttlMs - 60_000) } });
    return found !== null;
}
// Ends sessions by marking refresh tokens used.
export function revokeRefreshTokens(userId) {
    return AuthToken.updateMany({ userId, type: 'refresh', usedAt: null }, { usedAt: new Date() });
}
