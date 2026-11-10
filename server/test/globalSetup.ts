import { MongoMemoryServer } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}

// One in-memory MongoDB for the whole run; each test file gets its own database in setup.ts.
export default async function setup(project: TestProject) {
  const mongo = await MongoMemoryServer.create()
  project.provide('mongoUri', mongo.getUri())
  return async () => {
    await mongo.stop()
  }
}
