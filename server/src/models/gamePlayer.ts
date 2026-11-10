import { model, Schema } from 'mongoose'

const gamePlayerSchema = new Schema({
  gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  // Guests are saved with no userId.
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  displayName: { type: String, required: true },
  costume: {
    hat: { type: String, required: true },
    mask: { type: String, required: true },
    item: { type: String, required: true },
  },
  role: { type: String, enum: ['villager', 'monster'], required: true },
  outcome: { type: String, enum: ['won', 'lost'], required: true },
  diedRound: Number,
  // Ids of the gamePlayers this player suspected at night.
  nightHunches: [{ type: Schema.Types.ObjectId, ref: 'GamePlayer' }],
})

export const GamePlayer = model('GamePlayer', gamePlayerSchema)
