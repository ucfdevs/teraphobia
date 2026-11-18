import { model, Schema } from 'mongoose'

// strength 2 compares letters without case, so "Gui" and "gui" count as the same username.
export const NAME_COLLATION = { locale: 'en', strength: 2 }

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: String,
    googleId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, required: true, default: false },
    displayName: { type: String, required: true },
    // The real name from Register. Optional: Google and web sign ups don't send it.
    name: String,
    avatarId: String,
    stats: {
      gamesPlayed: { type: Number, default: 0 },
      villagerWins: { type: Number, default: 0 },
      monsterWins: {
        vampire: { type: Number, default: 0 },
        witch: { type: Number, default: 0 },
        werewolf: { type: Number, default: 0 },
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// The display name is also the username, so it's unique and you can sign in with it.
userSchema.index({ displayName: 1 }, { unique: true, collation: NAME_COLLATION })

export const User = model('User', userSchema)
