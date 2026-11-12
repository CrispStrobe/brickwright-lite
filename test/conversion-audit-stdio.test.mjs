import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createAuditStdioTransport} from '../scripts/lib/audit-stdio-transport.mjs';
import {createAuditProgressSink, writeProgressBytes} from '../scripts/lib/conversion-progress.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = JSON.stringify({value: '雪\u0000😀', originalFailure: {message: 'retained'}}, null, 2) + '\n';
const markdown = '# Exact report\n雪\u0000😀\n';
const line = (sequence, phase) => Buffer.from(JSON.stringify({schema: 'brickwright/compat-progress/v1', sequence, phase}) + '\n');
function capture (operation) {
    let threw = false, value;
    try {operation();} catch (error) {threw = true;value = error;}
    assert.equal(threw, true, 'operation must actually throw');return value;
}
function fixture (operation) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-audit-stdio-'));
    const filename = path.join(directory, 'stdout.bin');
    const fd = fs.openSync(filename, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR, 0o600);
    try {return operation({directory, filename, fd, read: () => fs.readFileSync(filename)});}
    finally {try {fs.closeSync(fd);} catch (error) {if (error.code !== 'EBADF') throw error;}fs.rmSync(directory, {recursive: true, force: true});}
}
// A small test observer, not the independent admission parser. It reads every
// header/payload and allows assertions against actual emitted bytes.
function frames (bytes) {
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from('BWAS001\n'));
    const rows = [];let offset = 8;
    while (offset < bytes.length) {
        assert.ok(offset + 12 <= bytes.length);
        const type = bytes[offset], flags = bytes[offset + 1], reserved = bytes.readUInt16BE(offset + 2);
        assert.equal(flags, 0);assert.equal(reserved, 0);assert.equal(bytes.readUInt32BE(offset + 4), rows.length);
        const length = bytes.readUInt32BE(offset + 8);offset += 12;assert.ok(offset + length <= bytes.length);
        rows.push({type, payload: bytes.subarray(offset, offset + length)});offset += length;
    }
    assert.equal(offset, bytes.length);return rows;
}
function prefix (transport) {
    transport.writeProgressLine(line(0, 'CLI_PROGRESS_BEGIN'));
    transport.writeProgressLine(line(1, 'REPORT_GZIP_WRITE_BEGIN'));
}
function body (transport) {
    prefix(transport);transport.writeReportJson(report);
    transport.writeProgressLine(line(2, 'REPORT_GZIP_WRITE_END'));
    transport.writeProgressLine(line(3, 'MARKDOWN_BEGIN'));transport.writeMarkdown(markdown);
    transport.writeProgressLine(line(4, 'MARKDOWN_END'));
    transport.writeProgressLine(line(5, 'CLI_REPORTS_FINISHED'));
}

test('actual FD transport preserves complete Unicode NUL report Markdown journal and exact terminal for both exit policies', () => {
    for (const exitCode of [0, 1]) fixture(f => {
        const transport = createAuditStdioTransport(f.fd);
        const progress = createAuditProgressSink({writeLine: transport.writeProgressLine, close: transport.closeProgress});
        progress.mark('CLI_PROGRESS_BEGIN');progress.mark('REPORT_JSON_BEGIN');progress.mark('REPORT_JSON_END');
        progress.mark('REPORT_GZIP_WRITE_BEGIN');transport.writeReportJson(report);progress.mark('REPORT_GZIP_WRITE_END');
        progress.mark('MARKDOWN_BEGIN');transport.writeMarkdown(markdown);progress.mark('MARKDOWN_END');
        progress.mark('CLI_REPORTS_FINISHED');progress.close();progress.close();transport.finish(exitCode);
        const all = frames(f.read()), terminal = JSON.parse(all.at(-1).payload.toString('utf8'));
        assert.equal(all.at(-1).type, 4);assert.equal(all.filter(r => r.type === 2).length, 1);assert.equal(all.filter(r => r.type === 3).length, 1);
        assert.deepEqual(Object.keys(terminal), ['schema','frameCount','intendedExitCode','progress','report','markdown']);
        assert.equal(terminal.schema, 'brickwright/compat-stdio-terminal/v1');assert.equal(terminal.frameCount, all.length);assert.equal(terminal.intendedExitCode, exitCode);
        assert.equal(JSON.stringify(terminal), all.at(-1).payload.toString('utf8'));
        const journal = Buffer.concat(all.filter(r => r.type === 1).map(r => r.payload));
        const events = journal.toString('utf8').trimEnd().split('\n').map(row => JSON.parse(row));
        assert.equal(events.length, 8);assert.deepEqual(events.map(row => row.sequence), [0,1,2,3,4,5,6,7]);
        assert.equal(events[0].phase, 'CLI_PROGRESS_BEGIN');assert.equal(events.at(-1).phase, 'CLI_REPORTS_FINISHED');
        assert.deepEqual(terminal.progress, {bytes: journal.length, sha256: digest(journal)});
        const compressed = all.find(r => r.type === 2).payload, decoded = gunzipSync(compressed);
        assert.equal(decoded.toString('utf8'), report);assert.deepEqual(JSON.parse(decoded), JSON.parse(report));
        assert.deepEqual(terminal.report, {gzipBytes: compressed.length, gzipSha256: digest(compressed), jsonBytes: decoded.length, jsonSha256: digest(decoded)});
        const md = all.find(r => r.type === 3).payload;assert.deepEqual(md, Buffer.from(markdown));
        assert.deepEqual(terminal.markdown, {bytes: md.length, sha256: digest(md)});
        assert.ok(fs.fstatSync(f.fd).isFile(), 'transport must not own or close the supplied FD');
    });
});

test('actual partial FD writes complete while zero impossible and exact falsy write errors refuse', () => fixture(f => {
    const bytes = Buffer.from('A\u0000雪😀Z');let calls = 0;
    writeProgressBytes(f.fd, bytes, (fd, value, offset, length) => {calls++;return fs.writeSync(fd, value, offset, Math.min(3, length));});
    assert.ok(calls > 1);assert.deepEqual(f.read(), bytes);
    for (const count of [0,-1,NaN,Infinity,bytes.length+1]) assert.match(capture(() => writeProgressBytes(f.fd, bytes, () => count)).message, /bounded progress/);
    for (const value of [new Error('original sink'),undefined,null,false,'',0,-0,NaN]) {
        assert.ok(Object.is(capture(() => writeProgressBytes(f.fd, bytes, () => {throw value;})), value));
    }
}));

test('factored journal preserves the first falsy write or close exception and closes an owned sink once', () => {
    for (const value of [new Error('first'),undefined,null,false,'',0,-0,NaN]) {
        let writes = 0, closes = 0;
        const p = createAuditProgressSink({writeLine () {writes++;throw value;},close () {closes++;throw new Error('cleanup');}});
        for (const action of [() => p.mark('CLI_PROGRESS_BEGIN'),() => p.mark('CLI_REPORTS_FINISHED'),() => p.close(),() => p.throwIfFailed()]) assert.ok(Object.is(capture(action), value));
        assert.equal(writes, 1);assert.equal(closes, 1);
        const q = createAuditProgressSink({writeLine () {},close () {throw value;}});q.mark('CLI_PROGRESS_BEGIN');
        assert.ok(Object.is(capture(() => q.close()), value));assert.ok(Object.is(capture(() => q.close()), value));
    }
});

test('report Markdown final journal close and terminal state cannot be reordered or revived', () => {
    const invalid = [t => t.writeReportJson(report), t => t.writeMarkdown(markdown), t => t.closeProgress(), t => t.finish(0),
        t => {prefix(t);t.writeReportJson(report);t.writeReportJson(report);},
        t => {body(t);t.finish(0);}, t => {body(t);t.closeProgress();t.finish(2);}];
    for (const action of invalid) fixture(f => {
        const t = createAuditStdioTransport(f.fd), first = capture(() => action(t)), prefixBytes = f.read();
        assert.ok(Object.is(capture(() => t.finish(0)), first));assert.deepEqual(f.read(), prefixBytes);
        assert.equal(frames(prefixBytes).some(r => r.type === 4), false);
    });
    fixture(f => {
        const t = createAuditStdioTransport(f.fd);body(t);t.closeProgress();t.finish(1);const original = f.read();
        capture(() => t.finish(1));assert.deepEqual(f.read(), original);
    });
});

test('whole payload event and line caps refuse before frame emission with reserved terminal capacity', () => {
    for (const limits of [{maxBytes:16384},{maxBytes:Infinity},{maxEvents:65537},{unknown:1}]) fixture(f => {
        capture(() => createAuditStdioTransport(f.fd, limits));assert.equal(f.read().length, 0);
    });
    for (const [limits,prepare,action] of [
        [{maxEvents:1}, t => t.writeProgressLine(line(0,'CLI_PROGRESS_BEGIN')),t => t.writeProgressLine(line(1,'REPORT_GZIP_WRITE_BEGIN'))],
        [{maxLineBytes:16}, () => {}, t => t.writeProgressLine(line(0,'CLI_PROGRESS_BEGIN'))],
        [{maxProgressBytes:1}, () => {},t => t.writeProgressLine(line(0,'CLI_PROGRESS_BEGIN'))],
        [{maxReportBytes:1}, prefix,t => t.writeReportJson(report)],
        [{maxPayloadBytes:512},prefix,t => t.writeReportJson(JSON.stringify(Array.from({length:2048},(_,i) => (i * 2654435761) >>> 0),null,2)+'\n')],
        [{maxBytes:16384+1024},t => {prefix(t);t.writeReportJson(report);t.writeProgressLine(line(2,'REPORT_GZIP_WRITE_END'));t.writeProgressLine(line(3,'MARKDOWN_BEGIN'));},t => t.writeMarkdown('x'.repeat(2048))]
    ]) fixture(f => {
        const t = createAuditStdioTransport(f.fd, limits);prepare(t);const before = f.read();capture(() => action(t));
        assert.deepEqual(f.read(), before, 'bound must be checked before writing even a frame header');
        assert.ok(f.read().length < 8*1024**2);assert.equal(frames(f.read()).some(r => r.type === 4), false);
    });
});

test('invalid UTF8 unpaired text and noncanonical or duplicate journal records cannot enter transport', () => {
    const badLines = [Buffer.from([255,10]),Buffer.from('not JSON\n'),Buffer.concat([line(0,'CLI_PROGRESS_BEGIN'),line(1,'REPORT_JSON_BEGIN')]),
        Buffer.from(JSON.stringify({schema:'brickwright/compat-progress/v1',sequence:1,phase:'CLI_PROGRESS_BEGIN'})+'\n'),
        Buffer.from('{"schema":"brickwright/compat-progress/v1","sequence":0,"sequence":0,"phase":"CLI_PROGRESS_BEGIN"}\n'),
        line(0,'SUBJECT_BEGIN')];
    for (const bytes of badLines) fixture(f => {
        const t=createAuditStdioTransport(f.fd);const before=f.read();capture(() => t.writeProgressLine(bytes));assert.deepEqual(f.read(),before);
    });
    fixture(f => {const t=createAuditStdioTransport(f.fd);t.writeProgressLine(line(0,'CLI_PROGRESS_BEGIN'));const before=f.read();capture(() => t.writeProgressLine(line(1,'CLI_PROGRESS_BEGIN')));assert.deepEqual(f.read(),before);});
    fixture(f => {const t=createAuditStdioTransport(f.fd);prefix(t);const before=f.read();capture(() => t.writeReportJson('\ud800'));assert.deepEqual(f.read(),before);});
    fixture(f => {const t=createAuditStdioTransport(f.fd);prefix(t);t.writeReportJson(report);t.writeProgressLine(line(2,'MARKDOWN_BEGIN'));const before=f.read();capture(() => t.writeMarkdown('\ud800'));assert.deepEqual(f.read(),before);});
});

test('transport preserves an actual native descriptor failure without emitting a terminal or owning another file', () => fixture(f => {
    const t = createAuditStdioTransport(f.fd);fs.closeSync(f.fd);
    const original = capture(() => t.writeProgressLine(line(0,'CLI_PROGRESS_BEGIN')));assert.equal(original.code,'EBADF');
    assert.ok(Object.is(capture(() => t.finish(0)),original));assert.deepEqual(f.read(),Buffer.from('BWAS001\n'));
    assert.deepEqual(fs.readdirSync(f.directory),['stdout.bin']);
}));

test('factored progress validates original phase subject and observer fields before calling a sink', () => {
    const rows=[];let closed=0;
    const p=createAuditProgressSink({writeLine: bytes => rows.push(Buffer.from(bytes)),close: () => {closed++;}});
    const subject={ordinal:0,id:'same',kind:'RAW_BASELINE',target:'arcade'};
    p.mark('CLI_PROGRESS_BEGIN');p.mark('SUBJECT_BEGIN',subject);p.onObservation({phase:'import',status:'throw'},subject);p.close();p.close();
    assert.equal(closed,1);const events=rows.map(b=>JSON.parse(b));assert.equal(events[2].corePhase,'import');assert.equal(events[2].coreStatus,'throw');
    for(const event of events){assert.match(event.monotonicNanoseconds,/^\d+$/);assert.equal(typeof event.userMicroseconds,'number');assert.equal(typeof event.systemMicroseconds,'number');assert.match(event.costBoundary,/residual unmeasured/);}
    for(const operation of [q=>q.mark('NOT_A_PHASE'),q=>q.mark('SUBJECT_BEGIN',{ordinal:-1}),q=>q.onObservation({phase:'import',status:'not-return'})]){
        let writes=0;const q=createAuditProgressSink({writeLine:()=>{writes++;},close:()=>{}});capture(()=>operation(q));assert.equal(writes,0);
    }
});
