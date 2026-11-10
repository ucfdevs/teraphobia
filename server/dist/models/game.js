import { model, Schema } from 'mongoose';
export const PRESETS = ['quick', 'normal', 'relaxed'];
export const MONSTER_TYPES = ['vampire', 'witch', 'werewolf'];
const gameSchema = new Schema({
    roomCode: { type: String, required: true },
    hostUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    preset: { type: String, enum: PRESETS, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    playerCount: { type: Number, required: true, min: 4, max: 8 },
    monsterType: { type: String, enum: MONSTER_TYPES, required: true },
    winner: { type: String, enum: ['villagers', 'monster'], required: true },
    endReason: { type: String, enum: ['banished', 'outnumbered', 'forfeit'], required: true },
    rounds: { type: Number, required: true, min: 0 },
});
export const Game = model('Game', gameSchema);
