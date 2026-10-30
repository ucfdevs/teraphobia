import mongoose from 'mongoose'
import { createApp } from './app.js'
import { User } from './models/user.js'

const { MONGODB_URI, JWT_SECRET, PORT = '4000' } = process.env

if (!MONGODB_URI || !JWT_SECRET) {
  throw new Error('MONGODB_URI and JWT_SECRET must be set')
}

await mongoose.connect(MONGODB_URI)
await User.init()

// Nginx is the only public entry point, so the API stays on localhost.
createApp().listen(Number(PORT), '127.0.0.1', () => {
  console.log(`API listening on 127.0.0.1:${PORT}`)
})
