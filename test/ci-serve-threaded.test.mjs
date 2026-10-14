// THE GATE SERVER SERVES IN PARALLEL — asserted, not assumed.
//
// ~30 browser gates drive a Chromium against `python3 -m http.server`. Loading
// the editor opens several connections at once for the chunked bundle, so if
// that server were single-threaded the requests behind the head of the queue
// would time out, Chromium would report ERR_ABORTED, and the page would come up
// with NO TABS AT ALL — which from a gate's side is indistinguishable from a
// render crash in the app itself.
//
// It is NOT single-threaded, and this file is here because that is easy to get
// wrong in both directions. `http.server`'s CLI has used ThreadingHTTPServer
// since Python 3.7 (http.server.test() takes ServerClass=ThreadingHTTPServer by
// default) — it is only the bare `HTTPServer` CLASS that serves one connection
// at a time. This session started out to "fix" the CI line on the strength of
// the class's reputation, measured it, and found nothing to fix. What was
// missing was never the threading; it was the measurement.
//
// So the property is pinned here, with its own control:
//
//   1. the workflow still serves with the module form, which is the threaded one;
//   2. the runner's Python is new enough for that to be true;
//   3. BEHAVIOUR: with one connection stalled mid-request, a second is served
//      promptly by the exact command CI runs;
//   4. CONTROL: the same experiment against a real single-threaded HTTPServer
//      blocks until it times out. Without (4), (3) would pass against anything
//      and prove nothing — it is the answer to "what would be absent from this
//      output if the thing it tests were dead?"
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {connect} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(path.join(ROOT, '.github/workflows/build.yml'), 'utf8');

const serveLines = yml.split('\n')
    .map((line, i) => ({line: line.trim(), n: i + 1}))
    .filter(({line}) => !line.startsWith('#') && /python3?\s+-m\s+http\.server/.test(line));

test('the built app is served by the http.server MODULE — the threaded form', () => {
    assert.ok(serveLines.length >= 2,
        `expected the gate server and the profile server, found ${serveLines.length}`);
    for (const {line, n} of serveLines) {
        assert.match(line, /python3 -m http\.server \d+ --directory \S+/,
            `line ${n} is not the module form: ${line}`);
    }
});

test('the Python running the gates is new enough for its CLI to be threaded', () => {
    const v = execFileSync('python3', ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'])
        .toString().trim();
    const [maj, min] = v.split('.').map(Number);
    assert.ok(maj > 3 || (maj === 3 && min >= 7),
        `python ${v}: ThreadingHTTPServer became the CLI default in 3.7; below that the gates would queue`);
    // And say it from the module rather than from the version number alone.
    const cls = execFileSync('python3',
        ['-c', 'import http.server, inspect; print(inspect.signature(http.server.test).parameters["ServerClass"].default.__name__)'])
        .toString().trim();
    assert.equal(cls, 'ThreadingHTTPServer',
        `http.server's CLI would serve with ${cls} — one connection at a time`);
});

/** Serve `dir` with the given argv, and wait until it actually answers. */
const startServer = async (args, port) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bw-serve-'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>ok');
    const proc = spawn('python3', args(port, dir), {stdio: 'ignore'});
    for (let i = 0; i < 80; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(500)});
            if (res.ok) { await res.text(); return proc; }
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 100));
    }
    proc.kill('SIGKILL');
    throw new Error(`server never answered on :${port}`);
};

/**
 * Stall one connection mid-request, then time a second request.
 * @returns {Promise<{ms: number, ok: boolean}>}
 */
const timeSecondRequest = async (args, port) => {
    const proc = await startServer(args, port);
    const stalled = connect(port, '127.0.0.1');
    try {
        await new Promise((res, rej) => { stalled.once('connect', res); stalled.once('error', rej); });
        // A request line and one header, then nothing: no blank line, so the
        // server is left waiting for the rest of it.
        stalled.write('GET / HTTP/1.1\r\nHost: localhost\r\n');
        await new Promise(r => setTimeout(r, 300));
        const started = Date.now();
        try {
            const res = await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(5000)});
            await res.text();
            return {ms: Date.now() - started, ok: res.status === 200};
        } catch {
            return {ms: Date.now() - started, ok: false};
        }
    } finally {
        stalled.destroy();
        proc.kill('SIGKILL');
    }
};

const MODULE_ARGS = (port, dir) => ['-m', 'http.server', String(port), '--directory', dir];

test('THE test that matters: a stalled connection does not block the next request', async () => {
    const {ms, ok} = await timeSecondRequest(MODULE_ARGS, 8791);
    assert.ok(ok, `the second request was not served while the first was stalled (after ${ms}ms)`);
    assert.ok(ms < 3000, `served in ${ms}ms — that is queueing behind the stalled connection`);
});

test('CONTROL: the same experiment DOES catch a truly single-threaded server', async () => {
    // Without this, the test above would pass against a server that queues,
    // and the whole file would be decoration.
    const dir = mkdtempSync(path.join(tmpdir(), 'bw-single-'));
    const script = path.join(dir, 'single.py');
    writeFileSync(script,
        'import functools, http.server, sys\n'
        + 'h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=sys.argv[2])\n'
        + 'http.server.HTTPServer(("", int(sys.argv[1])), h).serve_forever()\n');
    const {ms, ok} = await timeSecondRequest((port, d) => [script, String(port), d], 8792);
    assert.equal(ok, false, `a single-threaded server answered in ${ms}ms — the experiment does not discriminate`);
    assert.ok(ms >= 3000, `it should have blocked until the 5s timeout, not ${ms}ms`);
});

test('a burst of concurrent requests is answered, as a browser makes them', async () => {
    const proc = await startServer(MODULE_ARGS, 8793);
    try {
        const codes = await Promise.all(Array.from({length: 12}, () =>
            fetch('http://127.0.0.1:8793/', {signal: AbortSignal.timeout(8000)}).then(r => r.status)));
        assert.deepEqual(codes, Array(12).fill(200), 'every concurrent request is answered');
    } finally {
        proc.kill('SIGKILL');
    }
});
