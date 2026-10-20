/** Optional audit observation journal. It never reads conversion values/errors. */
import fs from 'node:fs';
import path from 'node:path';
const open = fs.openSync.bind(fs), write = fs.writeSync.bind(fs), close = fs.closeSync.bind(fs);
const realpath = fs.realpathSync.bind(fs), exists = fs.existsSync.bind(fs), stat = fs.statSync.bind(fs);
const descriptor = Object.getOwnPropertyDescriptor, own = Object.hasOwn;
const stringify = JSON.stringify.bind(JSON), from = Buffer.from.bind(Buffer);
const clock = process.hrtime.bigint.bind(process.hrtime), cpu = process.cpuUsage.bind(process);
const phases = new Set(['CLI_PROGRESS_BEGIN','CATALOGUE_OPEN_BEGIN','CATALOGUE_OPEN_END',
    'PROVENANCE_BEGIN','PROVENANCE_END','SUBJECT_BEGIN','LOAD_SUBJECT_BEGIN','LOAD_SUBJECT_END',
    'CONVERSION_BEGIN','CONVERSION_END','CORE_OBSERVATION','ROW_WIRE_CAPTURE_BEGIN','ROW_WIRE_CAPTURE_END',
    'OPTIONAL_GATES_BEGIN','OPTIONAL_GATES_END','ROW_GRAPH_CAPTURED_IN_MEMORY',
    'FINAL_PROVENANCE_BEGIN','FINAL_PROVENANCE_END','REPORT_JSON_BEGIN','REPORT_JSON_END',
    'REPORT_GZIP_WRITE_BEGIN','REPORT_GZIP_WRITE_END','REPORT_WRITE_BEGIN','REPORT_WRITE_END',
    'MARKDOWN_BEGIN','MARKDOWN_END','CLI_REPORTS_FINISHED']);
const has = Function.prototype.call.bind(Set.prototype.has);
const hard = {maxBytes: 8 * 1024 ** 2, maxEvents: 65536, maxLineBytes: 16384};

// Exported separately so controls can exercise actual partial writes to an owned
// FD. The CLI never supplies a writer callback or replaces its held native write.
export function writeProgressBytes (fd, bytes, writePart = write) {
    let offset = 0;
    while (offset < bytes.length) {
        const count = writePart(fd, bytes, offset, bytes.length - offset);
        if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) {
            throw new Error('Progress journal partial write made no bounded progress');
        }
        offset += count;
    }
}
function canonical (filename) {
    const absolute = path.resolve(filename);
    return exists(absolute) ? realpath(absolute) : path.join(realpath(path.dirname(absolute)), path.basename(absolute));
}
export function createAuditProgress (filename, {protectedPaths = [], ...limits} = {}) {
    if (typeof filename !== 'string' || !filename) throw new Error('--progress-jsonl requires a fresh file');
    const admitted = {...hard, ...limits};
    for (const key of Object.keys(admitted)) {
        if (!own(hard, key) || !Number.isInteger(admitted[key]) || admitted[key] <= 0 || admitted[key] > hard[key]) {
            throw new Error('Progress journal limit must be a positive bounded integer');
        }
    }
    const output = canonical(filename);
    for (const input of protectedPaths) {
        if (!input) continue;
        const original = canonical(input), relative = path.relative(original, output);
        if (output === original || (exists(input) && stat(input).isDirectory() &&
            relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
            throw new Error('Progress journal collides with input or report');
        }
    }
    const fd = open(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    let failed = false, failure, closed = false, events = 0, bytes = 0;
    let observerWall = 0n, observerUser = 0, observerSystem = 0;
    const fail = error => {
        if (!failed) {
            failed = true; failure = error;
            try {write(2, 'CLI_PROGRESS_OBSERVATION_FAILURE\n');} catch { /* Original observer failure stays primary. */ }
            if (!closed) {closed = true; try {close(fd);} catch { /* No cleanup can replace the first failure. */ }}
        }
        throw failure;
    };
    const throwIfFailed = () => {if (failed) throw failure;};
    const mark = (phase, subject = null, core = null) => {
        throwIfFailed();
        const begin = clock(), before = cpu();
        try {
            if (closed || !has(phases, phase)) throw new Error('Progress journal phase or lifetime differs');
            const row = {schema: 'brickwright/compat-progress/v1', sequence: events, phase,
                monotonicNanoseconds: begin.toString(), userMicroseconds: before.user, systemMicroseconds: before.system,
                observerBeforeThisEvent: {wallNanoseconds: observerWall.toString(), userMicroseconds: observerUser,
                    systemMicroseconds: observerSystem},
                costBoundary: 'Cumulative observer cost before this event; final event write/close residual unmeasured.'};
            if (subject) {
                if (!Number.isInteger(subject.ordinal) || subject.ordinal < 0 ||
                    !['id','kind','target'].every(key => typeof subject[key] === 'string' && subject[key].length <= 4096)) {
                    throw new Error('Progress journal subject identity differs');
                }
                row.subject = {ordinal: subject.ordinal, id: subject.id, kind: subject.kind, target: subject.target};
            }
            if (core) {row.corePhase = core.phase; row.coreStatus = core.status;}
            const line = from(stringify(row) + '\n', 'utf8');
            if (events >= admitted.maxEvents || line.length > admitted.maxLineBytes || bytes + line.length > admitted.maxBytes) {
                throw new Error('Progress journal bound exceeded');
            }
            writeProgressBytes(fd, line); events++; bytes += line.length;
        } catch (error) {return fail(error);}
        finally {
            const after = cpu(); observerWall += clock() - begin;
            observerUser += after.user - before.user; observerSystem += after.system - before.system;
        }
    };
    return Object.freeze({mark, throwIfFailed,
        onObservation (event, subject) {
            throwIfFailed();
            try {
                const p = descriptor(event, 'phase'), s = descriptor(event, 'status');
                if (!p || !own(p, 'value') || !['dependency-callback','import','creator'].includes(p.value)) {
                    throw new Error('Progress core observation phase differs');
                }
                const status = p.value === 'dependency-callback' ? 'observed-before-validation' :
                    s && own(s, 'value') && ['return','throw'].includes(s.value) ? s.value : null;
                if (status === null) throw new Error('Progress core observation status differs');
                mark('CORE_OBSERVATION', subject, {phase: p.value, status});
            } catch (error) {return fail(error);}
        },
        close () {
            throwIfFailed(); if (closed) return;
            closed = true;
            try {close(fd);} catch (error) {return fail(error);}
        }
    });
}
