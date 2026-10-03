// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Autonomous NuttX program ABI. No emulator, GUI or transport dependencies.
export const PROGRAM_OP = Object.freeze({BEGIN: 0, CHUNK: 1, COMMIT: 2, START: 3,
    STOP: 4, STATUS: 5, ABORT: 6, BEGIN_PYTHON: 7, SAVE: 8, LOAD: 9});
export const PROGRAM_STATE = Object.freeze({EMPTY: 0, READY: 1, RUNNING: 2,
    COMPLETE: 3, STOPPED: 4, FAULT: 5});
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const requireInteger = (value, min, max, name) => {
    if (!integer(value, min, max)) throw new RangeError(`Invalid ${name}`);
};
const bytes = value => {
    if (!(value instanceof Uint8Array)) throw new TypeError('Expected Uint8Array');
    return value;
};
const view = value => new DataView(value.buffer, value.byteOffset, value.byteLength);
export function crc32 (value) {
    let crc = 0xffffffff;
    for (const byte of bytes(value)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
export function encodeInstructions (program, {topology = 'default'} = {}) {
    if (!['default', 'six-motors'].includes(topology)) throw new TypeError('Unknown firmware topology');
    const six = topology === 'six-motors';
    if (!program || Object.getPrototypeOf(program) !== Object.prototype ||
        Object.keys(program).length !== 2 || program.version !== 1 ||
        !Array.isArray(program.instructions)) throw new TypeError('Expected compiled firmware program v1');
    const rows = program.instructions, count = rows.length;
    requireInteger(count, 1, 256, 'instruction count');
    for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 4 ||
            ![0, 1, 2, 3].every(i => integer(row[i], -2147483648, 2147483647))) {
            throw new TypeError('Instructions need four signed 32-bit integers');
        }
        const [op, a, b, c] = row;
        const valid = (op === 0 && a === 0 && b === 0 && c === 0) ||
            (op === 1 && integer(a, 0, six ? 5 : 1) && integer(b, -1110, 1110) && c === 0) ||
            (op === 2 && integer(a, 0, 120000) && b === 0 && c === 0) ||
            (!six && [3, 5].includes(op) && integer(a, 1, 6) &&
                integer(b, 0, a <= 2 ? 65535 : a === 3 ? 1 : a === 4 ? 255 : 100) &&
                (op === 3 ? c === 0 : integer(c, 0, count - 1))) ||
            (op === 4 && integer(a, 0, count - 1) && b === 0 && c === 0) ||
            (op === 6 && integer(a, 0, six ? 5 : 1) && integer(b, -36000, 36000) && integer(c, 1, 1110));
        if (!valid) throw new RangeError('Instruction exceeds firmware ABI bounds');
    }
    if (rows[count - 1].some(word => word !== 0)) throw new Error('Firmware program must end with END');
    const data = new Uint8Array(count * 16), output = view(data);
    rows.forEach((row, i) => row.forEach((word, j) => output.setInt32(i * 16 + j * 4, word, true)));
    return data;
}
export function encodePython (source) {
    if (typeof source !== 'string' || source.includes('\0')) throw new TypeError('Python source must be text without NUL');
    // Check characters before encoding to avoid allocating an oversized source.
    requireInteger(source.length, 1, 4095, 'Python source length');
    const data = new TextEncoder().encode(source);
    requireInteger(data.length, 1, 4095, 'Python UTF-8 byte length');
    return data;
}
function header (op, id, length = 8) {
    requireInteger(op, 0, 9, 'operation');
    requireInteger(id, op === PROGRAM_OP.STATUS ? 0 : 1, 0xffffffff, 'program id');
    const data = new Uint8Array(length);
    data.set([0x70, 1, op, 0]);view(data).setUint32(4, id, true);return data;
}
export function encodeBegin (id, count, checksum, python = false) {
    if (typeof python !== 'boolean') throw new TypeError('Invalid source kind');
    requireInteger(count, 1, python ? 4095 : 256, 'upload length');
    requireInteger(checksum, 0, 0xffffffff, 'CRC32');
    const data = header(python ? 7 : 0, id, 16), output = view(data);
    output.setUint32(8, count, true);output.setUint32(12, checksum, true);return data;
}
export function encodeChunk (id, offset, payload) {
    bytes(payload);requireInteger(payload.length, 1, 10, 'chunk size');
    requireInteger(offset, 0, 4095, 'chunk offset');
    if (offset + payload.length > 4096) throw new RangeError('Chunk exceeds upload bounds');
    const data = header(1, id, 10 + payload.length);
    view(data).setUint16(8, offset, true);data.set(payload, 10);return data;
}
export function encodeCommand (op, id) {
    if (![2, 3, 4, 5, 6, 8, 9].includes(op)) throw new RangeError('Expected program command');
    return header(op, id);
}
export function decodeReply (data, expected) {
    bytes(data);
    if (!expected || !integer(expected.op, 0, 9) ||
        !integer(expected.id, expected.op === 5 ? 0 : 1, 0xffffffff)) throw new TypeError('Expected request operation and id');
    if (data.length !== 20 || data[0] !== 0x71 || data[1] !== 1 || data[2] !== expected.op || data[3] > 5) {
        throw new Error('Malformed or mismatched NuttX program reply');
    }
    const input = view(data), id = input.getUint32(4, true);
    if (!(expected.op === 5 && expected.id === 0) && id !== expected.id) throw new Error('Mismatched NuttX program id');
    const reply = {op: data[2], state: data[3], id, result: input.getInt32(8, true),
        pc: input.getUint16(12, true), count: input.getUint16(14, true),
        received: input.getUint16(16, true), runtimeError: input.getInt16(18, true)};
    // Count is source bytes for Python, instructions for bytecode.
    if (reply.count > 4095 || reply.pc > 256 || reply.pc > reply.count || reply.received > 4096) throw new Error('Invalid NuttX program status bounds');
    return reply;
}
const cancellation = () => Object.assign(new Error('NuttX program upload cancelled'), {name: 'AbortError'});

/** exchange(Uint8Array) -> Promise<Uint8Array> must return one complete reply
 * and bound its own I/O timeout. Cancellation waits for the current exchange
 * before cleanup so packets/replies never overlap. Keep one client per device. */
export class NuttXProgramClient {
    constructor (exchange, id, {topology = 'default'} = {}) {
        if (!['default', 'six-motors'].includes(topology)) throw new TypeError('Unknown firmware topology');
        this.topology = topology;
        if (typeof exchange !== 'function') throw new TypeError('Expected packet exchange function');
        requireInteger(id, 1, 0xffffffff, 'program id');
        this.exchange = exchange;this.id = id;this.tail = Promise.resolve();this.stopEpoch = 0;
    }
    enqueue (action) {
        const result = this.tail.then(action);
        this.tail = result.catch(() => {});return result;
    }
    async request (packet) {
        const reply = decodeReply(await this.exchange(packet), {op: packet[2], id: view(packet).getUint32(4, true)});
        if (reply.result !== 0) {
            throw Object.assign(new Error(`NuttX program request failed (${reply.result})`), {result: reply.result, reply});
        }
        return reply;
    }
    upload (program, {python = false, signal, start = true} = {}) {
        // Complete validation and copy the payload before any transport call.
        const payload = python ? encodePython(program) : encodeInstructions(program, {topology: this.topology});
        if (typeof start !== 'boolean' || typeof python !== 'boolean') throw new TypeError('Invalid upload options');
        const begin = encodeBegin(this.id, python ? payload.length : payload.length / 16, crc32(payload), python);
        const epoch = this.stopEpoch;
        const check = () => {if (signal?.aborted || epoch !== this.stopEpoch) throw cancellation();};
        return this.enqueue(async () => {
            check();let attempted = false, starting = false;
            try {
                attempted = true;await this.request(begin);check();
                for (let offset = 0; offset < payload.length; offset += 10) {
                    await this.request(encodeChunk(this.id, offset, payload.subarray(offset, offset + 10)));check();
                }
                const committed = await this.request(encodeCommand(2, this.id));check();
                if (!start) return committed;
                starting = true;
                const running = await this.request(encodeCommand(3, this.id));check();return running;
            } catch (error) {
                // START may have succeeded even if its response was lost.
                if (starting) {try {await this.request(encodeCommand(4, this.id));} catch (_) { /* preserve original */ }}
                if (attempted) {try {await this.request(encodeCommand(6, this.id));} catch (_) { /* preserve original */ }}
                throw error;
            }
        });
    }
    command (op) {return this.enqueue(() => this.request(encodeCommand(op, this.id)));}
    save () {return this.command(8);}
    load () {return this.command(9);}
    start () {return this.command(3);}
    status () {return this.command(5);}
    abort () {this.stopEpoch++;return this.command(6);}
    stop () {this.stopEpoch++;return this.command(4);}
}
export async function uploadProgram (exchange, {id, program, source, signal, start = true, topology = 'default'}) {
    if ((program === undefined) === (source === undefined)) throw new TypeError('Supply one compiled program or Python source');
    return new NuttXProgramClient(exchange, id, {topology}).upload(source === undefined ? program : source,
        {python: source !== undefined, signal, start});
}
