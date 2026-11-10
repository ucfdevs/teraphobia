import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { afterAll, beforeAll, inject } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret'
process.env.APP_URL = 'https://app.test'

// A fresh, empty database per test file.
beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: `test-${randomUUID()}` })
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()))
})

afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})
