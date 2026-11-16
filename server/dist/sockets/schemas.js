// Validates every socket event payload against the JSON Schemas in shared/schemas.
// The same schemas generate the TypeScript and Swift types, so the server, web and iOS apps all agree on one contract.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
// Same depth from src/sockets and dist/sockets, so this works under tsx and after tsc.
const SCHEMAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'schemas');
// Absolute ids let refs like ../common.schema.json resolve. Nothing is fetched from this URL.
const ID_BASE = 'https://teraphobia.com/schemas/';
export const CLIENT_EVENTS = [
    'day:submit',
    'night:submit',
    'power:use',
    'room:join',
    'room:kick',
    'room:start',
    'vote:submit',
];
export const SERVER_EVENTS = [
    'error',
    'game:over',
    'morning:reveal',
    'phase:start',
    'room:state',
    'vote:reveal',
    'you:rejoined',
    'you:result',
    'you:role',
];
// room-join.schema.json -> room:join, error.schema.json -> error
export function eventNameForFile(file) {
    return file.replace(/\.schema\.json$/, '').replace('-', ':');
}
function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
function loadSchemas() {
    // No coercion, defaults or property removal: a payload is checked exactly as it arrived.
    // strictRequired is off because `then: { required: [...] }` names properties declared on the parent, which is valid.
    const ajv = new Ajv({ strict: true, strictRequired: false });
    ajv.addSchema({ ...readJson(join(SCHEMAS_DIR, 'common.schema.json')), $id: `${ID_BASE}common.schema.json` });
    const ids = new Map();
    for (const dir of ['client', 'server']) {
        for (const file of readdirSync(join(SCHEMAS_DIR, dir)).filter((f) => f.endsWith('.schema.json'))) {
            const id = `${ID_BASE}${dir}/${file}`;
            ajv.addSchema({ ...readJson(join(SCHEMAS_DIR, dir, file)), $id: id });
            ids.set(`${dir}/${eventNameForFile(file)}`, id);
        }
    }
    // Compile every schema now, so a broken or missing schema fails at startup rather than mid-game.
    function compileAll(dir, events) {
        const validators = new Map();
        for (const event of events) {
            const id = ids.get(`${dir}/${event}`);
            if (!id)
                throw new Error(`No schema for ${dir} event ${event} in shared/schemas/${dir}`);
            validators.set(event, ajv.getSchema(id));
            ids.delete(`${dir}/${event}`);
        }
        return validators;
    }
    const client = compileAll('client', CLIENT_EVENTS);
    const server = compileAll('server', SERVER_EVENTS);
    if (ids.size > 0)
        throw new Error(`Schemas with no event listed in schemas.ts: ${[...ids.keys()].join(', ')}`);
    return { ajv, client, server };
}
const { ajv, client, server } = loadSchemas();
function check(validate, payload) {
    if (!validate)
        return { ok: false, message: 'Unknown event' };
    if (validate(payload))
        return { ok: true };
    return { ok: false, message: ajv.errorsText(validate.errors, { dataVar: 'payload' }) };
}
export function isClientEvent(event) {
    return client.has(event);
}
export function validateClientEvent(event, payload) {
    return check(client.get(event), payload);
}
export function validateServerEvent(event, payload) {
    return check(server.get(event), payload);
}
