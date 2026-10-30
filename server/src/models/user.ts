import { model, Schema } from 'mongoose'

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: String,
    googleId: String,
    emailVerified: { type: Boolean, required: true, default: false },
    displayName: { type: String, required: true },
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

export const User = model('User', userSchema)
