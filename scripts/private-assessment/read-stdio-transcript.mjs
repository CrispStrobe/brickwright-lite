import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';

// RFC 1952 sections 2.3.1/2.3.1.1: https://www.rfc-editor.org/rfc/rfc1952
// Node's documented info/maxOutputLength and engine.bytesWritten expose the
// consumed raw-deflate bytes: https://nodejs.org/docs/latest-v22.x/api/zlib.html
// This independent reader imports no writer, CLI, journal or converter code.
const WIRE = 8 * 1024 ** 2, JSON_LIMIT = 64 * 1024 ** 2;
const RESERVE = 16384, LINE = 16384, EVENTS = 65536;
const MAGIC = Buffer.from('BWAS001\n');
const fail = code => {const error = new Error('Assessment transcript: ' + code); error.code = code; throw error;};
const requireFact = (condition, code) => {if (!condition) fail(code);};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => object(value) && Object.keys(value).join('|') === expected.join('|');
const count = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const text = bytes => {
    const value = bytes.toString('utf8');
    requireFact(Buffer.from(value, 'utf8').equals(bytes), 'UTF8');
    return value;
};
const parse = value => {
    try {return JSON.parse(value);} catch {fail('JSON');}
};
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    crcTable[i] = value >>> 0;
}
function crc32(bytes) {
    let value = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) value = crcTable[(value ^ bytes[i]) & 255] ^ value >>> 8;
    return (value ^ 0xffffffff) >>> 0;
}
function reportBytes(gzip) {
    requireFact(gzip.length >= 18 && gzip[0] === 31 && gzip[1] === 139 && gzip[2] === 8, 'GZIP_HEADER');
    const flags = gzip[3];
    requireFact((flags & 0xe0) === 0, 'GZIP_FLAGS');
    let start = 10;
    if (flags & 4) {
        requireFact(start + 2 <= gzip.length - 8, 'GZIP_HEADER');
        const length = gzip.readUInt16LE(start); start += 2;
        requireFact(length <= gzip.length - 8 - start, 'GZIP_HEADER'); start += length;
    }
    for (const flag of [8, 16]) if (flags & flag) {
        while (start < gzip.length - 8 && gzip[start] !== 0) start++;
        requireFact(start < gzip.length - 8 && gzip[start] === 0, 'GZIP_HEADER'); start++;
    }
    if (flags & 2) {
        requireFact(start + 2 <= gzip.length - 8, 'GZIP_HEADER');
        requireFact(gzip.readUInt16LE(start) === (crc32(gzip.subarray(0, start)) & 65535), 'GZIP_FHCRC'); start += 2;
    }
    requireFact(start < gzip.length - 8, 'GZIP_DEFLATE');
    let result;
    try {result = inflateRawSync(gzip.subarray(start), {info: true, maxOutputLength: JSON_LIMIT});}
    catch {fail('GZIP_INFLATE');}
    const consumed = result.engine.bytesWritten;
    requireFact(Number.isSafeInteger(consumed) && consumed > 0 && start + consumed + 8 === gzip.length, 'GZIP_TRAILING');
    requireFact(result.buffer.length <= JSON_LIMIT, 'JSON_BOUND');
    requireFact(gzip.readUInt32LE(start + consumed) === crc32(result.buffer), 'GZIP_CRC');
    requireFact(gzip.readUInt32LE(start + consumed + 4) === result.buffer.length, 'GZIP_SIZE');
    return result.buffer;
}

/** Bounded wire DATA only. Actual process exit and report/input/run admission
 * remain external obligations. Never extracts files, logs or performs I/O. */
export function readAssessmentTranscript(options) {
    requireFact(keys(options, ['transcript']), 'OPTIONS');
    const descriptor = Object.getOwnPropertyDescriptor(options, 'transcript');
    requireFact(descriptor && Object.hasOwn(descriptor, 'value') && Buffer.isBuffer(descriptor.value), 'BUFFER');
    requireFact(descriptor.value.length <= WIRE, 'WIRE_BOUND');
    const wire = Buffer.from(descriptor.value);
    requireFact(wire.length >= MAGIC.length && wire.subarray(0, MAGIC.length).equals(MAGIC), 'MAGIC');
    const progress = [];
    let offset = MAGIC.length, sequence = 0, progressBytes = 0, progressEnded = false;
    let report = null, json = null, markdown = null, terminal = null;
    while (offset < wire.length) {
        const headerStart = offset;
        requireFact(offset + 12 <= wire.length, 'HEADER');
        const type = wire[offset], flags = wire[offset + 1], reserved = wire.readUInt16BE(offset + 2);
        const ordinal = wire.readUInt32BE(offset + 4), length = wire.readUInt32BE(offset + 8); offset += 12;
        requireFact(type >= 1 && type <= 4 && flags === 0 && reserved === 0, 'FRAME_TYPE');
        requireFact(ordinal === sequence++ && sequence <= EVENTS + 3, 'SEQUENCE');
        requireFact(length <= WIRE && length <= wire.length - offset, 'PAYLOAD');
        if (type !== 4) requireFact(offset + length <= WIRE - RESERVE, 'TERMINAL_RESERVE');
        const bytes = wire.subarray(offset, offset + length); offset += length;
        if (type === 1) {
            requireFact(!progressEnded && progress.length < EVENTS && length > 1 && length <= LINE, 'PROGRESS_BOUND');
            requireFact(bytes[length - 1] === 10 && !bytes.subarray(0, length - 1).includes(10), 'PROGRESS_LINE');
            const line = text(bytes), row = parse(line);
            requireFact(object(row) && JSON.stringify(row) + '\n' === line && row.schema === 'brickwright/compat-progress/v1' &&
                row.sequence === progress.length && typeof row.phase === 'string', 'PROGRESS_ROW');
            if (progress.length === 0) requireFact(row.phase === 'CLI_PROGRESS_BEGIN', 'PROGRESS_BEGIN');
            else requireFact(row.phase !== 'CLI_PROGRESS_BEGIN', 'PROGRESS_BEGIN');
            progressEnded = row.phase === 'CLI_REPORTS_FINISHED';
            progressBytes += length; requireFact(progressBytes <= WIRE, 'PROGRESS_BOUND');
            progress.push(bytes);
        } else if (type === 2) {
            requireFact(report === null && markdown === null && progress.length > 0 && !progressEnded, 'REPORT_ORDER');
            report = bytes; json = reportBytes(bytes);
            const value = text(json), decoded = parse(value);
            requireFact(JSON.stringify(decoded, null, 2) + '\n' === value, 'REPORT_JSON');
        } else if (type === 3) {
            requireFact(report !== null && markdown === null && !progressEnded, 'MARKDOWN_ORDER');
            text(bytes); markdown = bytes;
        } else {
            requireFact(report !== null && markdown !== null && progressEnded && progress.length > 0, 'TERMINAL_ORDER');
            requireFact(offset === wire.length && offset - headerStart <= RESERVE, 'TERMINAL_BOUND');
            const value = text(bytes); terminal = parse(value);
            requireFact(keys(terminal, ['schema','frameCount','intendedExitCode','progress','report','markdown']) &&
                keys(terminal.progress, ['bytes','sha256']) && keys(terminal.report, ['gzipBytes','gzipSha256','jsonBytes','jsonSha256']) &&
                keys(terminal.markdown, ['bytes','sha256']) && JSON.stringify(terminal) === value, 'TERMINAL_SCHEMA');
            requireFact(terminal.schema === 'brickwright/compat-stdio-terminal/v1' && terminal.frameCount === sequence &&
                [0, 1].includes(terminal.intendedExitCode), 'TERMINAL_METADATA');
            for (const [record, names] of [[terminal.progress,['bytes']], [terminal.report,['gzipBytes','jsonBytes']], [terminal.markdown,['bytes']]])
                requireFact(names.every(name => count(record[name])), 'TERMINAL_COUNT');
            requireFact([terminal.progress.sha256,terminal.report.gzipSha256,terminal.report.jsonSha256,terminal.markdown.sha256].every(digest), 'TERMINAL_HASH');
            const journal = Buffer.concat(progress, progressBytes);
            requireFact(terminal.progress.bytes === journal.length && terminal.progress.sha256 === sha(journal) &&
                terminal.report.gzipBytes === report.length && terminal.report.gzipSha256 === sha(report) &&
                terminal.report.jsonBytes === json.length && terminal.report.jsonSha256 === sha(json) &&
                terminal.markdown.bytes === markdown.length && terminal.markdown.sha256 === sha(markdown), 'TERMINAL_CONTENT');
            Object.freeze(terminal.progress); Object.freeze(terminal.report); Object.freeze(terminal.markdown); Object.freeze(terminal);
            return {reportJson: text(json), progressJsonl: text(journal), markdown: Buffer.from(markdown), terminal};
        }
    }
    fail('MISSING_TERMINAL');
}
