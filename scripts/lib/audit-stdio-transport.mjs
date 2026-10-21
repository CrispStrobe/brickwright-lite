/** Optional finite private stdout transport. It grants no run or report authority. */
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {writeProgressBytes} from './conversion-progress.mjs';

const hard = Object.freeze({maxBytes: 8 * 1024 ** 2, maxPayloadBytes: 8 * 1024 ** 2,
    maxReportBytes: 64 * 1024 ** 2, maxProgressBytes: 8 * 1024 ** 2,
    maxEvents: 65536, maxLineBytes: 16384});
const terminalReserve = 16384, headerBytes = 12;
const magic = Buffer.from('BWAS001\n', 'ascii');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const from = Buffer.from.bind(Buffer), byteLength = Buffer.byteLength.bind(Buffer);
const stringify = JSON.stringify.bind(JSON), parse = JSON.parse.bind(JSON);
const failFact = (ok, message) => {if (!ok) throw new Error('Audit stdio transport: ' + message);};
function textBytes (text, maximum) {
    failFact(typeof text === 'string', 'text input differs');
    failFact(byteLength(text, 'utf8') <= maximum, 'text bound exceeded');
    const bytes = from(text, 'utf8');
    failFact(bytes.toString('utf8') === text, 'text is not strict UTF8');
    return bytes;
}

/** Only the CLI's opt-in calls the default FD. There is no CLI FD/limit option.
 * Lower limits and owned descriptors support complete finite source controls.
 * This object never owns or closes the supplied descriptor.
 */
export function createAuditStdioTransport (fd = 1, lowerLimits = {}) {
    failFact(Number.isInteger(fd) && fd >= 0, 'descriptor differs');
    const limits = {...hard, ...lowerLimits};
    for (const key of Object.keys(limits)) failFact(Object.hasOwn(hard, key) &&
        Number.isSafeInteger(limits[key]) && limits[key] > 0 && limits[key] <= hard[key], 'limit differs');
    failFact(magic.length + terminalReserve <= limits.maxBytes, 'terminal reserve does not fit');
    let failed = false, failure, finished = false, progressClosed = false;
    let total = 0, sequence = 0, events = 0, progressBytes = 0, lastPhase = null, stage = 0;
    let report = null, markdown = null;
    const progressHash = createHash('sha256');
    const fail = error => {if (!failed) {failed = true; failure = error;} throw failure;};
    const current = () => {if (failed) throw failure; failFact(!finished, 'already finished');};
    const guarded = operation => {
        try {current(); return operation();} catch (error) {return fail(error);}
    };
    const frame = (type, payload, terminal = false) => {
        failFact(payload.length <= limits.maxPayloadBytes, 'payload bound exceeded');
        const remainingReserve = terminal ? 0 : terminalReserve;
        failFact(total + headerBytes + payload.length + remainingReserve <= limits.maxBytes, 'whole stream bound exceeded');
        failFact(sequence < 2 ** 32, 'frame sequence bound exceeded');
        const header = Buffer.alloc(headerBytes);
        header.writeUInt8(type, 0);header.writeUInt32BE(sequence, 4);header.writeUInt32BE(payload.length, 8);
        // No emission occurs before the complete frame/reserve admission above.
        writeProgressBytes(fd, header);writeProgressBytes(fd, payload);
        total += headerBytes + payload.length;sequence++;
    };
    // Magic is also bounded; a failing factory has no returned object to revive.
    try {writeProgressBytes(fd, magic);total = magic.length;} catch (error) {return fail(error);}
    return Object.freeze({
        writeProgressLine (line) {return guarded(() => {
            failFact(!progressClosed && lastPhase !== 'CLI_REPORTS_FINISHED', 'journal lifetime differs');
            failFact(Buffer.isBuffer(line) && line.length > 0 && line.length <= limits.maxLineBytes &&
                line[line.length - 1] === 10 && line.indexOf(10) === line.length - 1, 'journal row differs');
            failFact(events < limits.maxEvents && progressBytes + line.length <= limits.maxProgressBytes, 'journal bound exceeded');
            const text = line.toString('utf8');
            failFact(from(text, 'utf8').equals(line), 'journal is not strict UTF8');
            const row = parse(text);
            failFact(row !== null && typeof row === 'object' && !Array.isArray(row) &&
                row.schema === 'brickwright/compat-progress/v1' && row.sequence === events &&
                typeof row.phase === 'string' && stringify(row) + '\n' === text, 'journal encoding differs');
            failFact(events === 0 ? row.phase === 'CLI_PROGRESS_BEGIN' : row.phase !== 'CLI_PROGRESS_BEGIN', 'journal begin differs');
            failFact(row.phase !== 'CLI_REPORTS_FINISHED' || stage === 2, 'reports are not complete');
            frame(1, line);progressHash.update(line);progressBytes += line.length;events++;lastPhase = row.phase;
        });},
        writeReportJson (json) {return guarded(() => {
            failFact(!progressClosed && stage === 0 && lastPhase === 'REPORT_GZIP_WRITE_BEGIN', 'report order differs');
            const bytes = textBytes(json, limits.maxReportBytes);
            const remaining = Math.min(limits.maxPayloadBytes, limits.maxBytes - total - headerBytes - terminalReserve);
            failFact(remaining > 0, 'report bound exceeded');
            // zlib itself bounds output allocation, including incompressible input.
            const compressed = gzipSync(bytes, {maxOutputLength: remaining});
            frame(2, compressed);
            report = {gzipBytes: compressed.length, gzipSha256: hash(compressed), jsonBytes: bytes.length, jsonSha256: hash(bytes)};
            stage = 1;
        });},
        writeMarkdown (text) {return guarded(() => {
            failFact(!progressClosed && stage === 1 && lastPhase === 'MARKDOWN_BEGIN', 'Markdown order differs');
            const remaining = Math.min(limits.maxPayloadBytes, limits.maxBytes - total - headerBytes - terminalReserve);
            failFact(remaining >= 0, 'Markdown bound exceeded');
            const bytes = textBytes(text, remaining);frame(3, bytes);
            markdown = {bytes: bytes.length, sha256: hash(bytes)};stage = 2;
        });},
        closeProgress () {return guarded(() => {
            if (progressClosed) return;
            failFact(events > 0 && stage === 2 && lastPhase === 'CLI_REPORTS_FINISHED', 'journal is incomplete');
            progressClosed = true;
        });},
        finish (intendedExitCode) {return guarded(() => {
            failFact(progressClosed && stage === 2 && (intendedExitCode === 0 || intendedExitCode === 1), 'terminal state differs');
            const terminal = {schema: 'brickwright/compat-stdio-terminal/v1', frameCount: sequence + 1, intendedExitCode,
                progress: {bytes: progressBytes, sha256: progressHash.digest('hex')}, report, markdown};
            const bytes = textBytes(stringify(terminal), terminalReserve - headerBytes);
            frame(4, bytes, true);finished = true;
        });}
    });
}
