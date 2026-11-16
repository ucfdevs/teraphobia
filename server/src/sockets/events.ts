// Every socket listener and emit goes through here, so no payload skips its schema in either direction.
//   onEvent             validates a client event before its handler runs; a bad payload gets an `error` event back
//   rejectUnknownEvents answers events with no schema (call once per connection)
//   emitEvent           validates a server event before it is sent

import { isClientEvent, validateClientEvent, validateServerEvent } from './schemas.js'
import type { ClientEvent, ServerEvent } from './schemas.js'

// The parts of a socket.io Socket used here. Rooms (io.to(code)) only need emit.
export interface EventTarget {
  emit(event: string, ...args: any[]): unknown
}

export interface EventSocket extends EventTarget {
  on(event: string, listener: (...args: any[]) => void): unknown
  onAny(listener: (event: string, ...args: any[]) => void): unknown
}

// Sends a server event. A payload that breaks its schema is a server bug: it throws in development and tests,
// and in production it is logged and not sent, because the iOS decoder can't read it either.
export function emitEvent(target: EventTarget, event: ServerEvent, payload: unknown) {
  const result = validateServerEvent(event, payload)
  if (!result.ok) {
    const message = `Server event ${event} does not match its schema: ${result.message}`
    if (process.env.NODE_ENV !== 'production') throw new Error(message)
    console.error(message)
    return false
  }
  target.emit(event, payload)
  return true
}

export function sendError(target: EventTarget, code: string, message: string, event?: string) {
  emitEvent(target, 'error', event === undefined ? { code, message } : { code, message, event })
}

// Runs the handler only when the first argument matches the event's schema. Any extra arguments, such as an
// acknowledgement callback, are ignored. A handler that throws or rejects gets an `internal` error back.
export function onEvent<T>(socket: EventSocket, event: ClientEvent, handler: (payload: T) => unknown) {
  socket.on(event, async (payload: unknown) => {
    const result = validateClientEvent(event, payload)
    if (!result.ok) {
      sendError(socket, 'invalid_payload', result.message, event)
      return
    }
    try {
      await handler(payload as T)
    } catch (err) {
      console.error(`Socket handler for ${event} failed`, err)
      sendError(socket, 'internal', 'Something went wrong', event)
    }
  })
}

export function rejectUnknownEvents(socket: EventSocket) {
  socket.onAny((event: string) => {
    if (!isClientEvent(event)) sendError(socket, 'invalid_payload', `Unknown event ${event}`, event)
  })
}
