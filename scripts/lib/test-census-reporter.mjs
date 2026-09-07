/**
 * A node --test reporter that answers one question the TAP stream cannot:
 * WHICH FILES reported tests, and how many each.
 *
 * node's built-in reporters flatten a multi-file run — TAP shows every test at
 * column 0 with no file, and junit emits one flat list of <testcase>s — so a
 * file that vanished from the glob, or that threw before defining a single
 * test, leaves no trace except a smaller total. This reporter keys every
 * test:pass / test:fail event on `event.data.file` and writes
 *
 *   {"files": {"<path>": {"tests": n, "passed": n, "failed": n, "stdoutBytes": n,
 *                          "skipped": [{"name": "...", "reason": "..."}]}}, "events": n}
 *
 * skipped (2026-09-07, plan T13): every test the file SKIPPED, with the reason
 * the test gave (`{skip: 'why'}`, `t.skip('why')`; a bare `skip: true` is
 * recorded as "(no reason)"). The TAP shows `# SKIP why` with no file; this is
 * the only place a skip is tied to the file that owns it, and
 * scripts/check-test-run.mjs holds every skip in CI to a pointer at the one
 * place the test does execute (LANES.md, "Skips that execute elsewhere").
 *
 * stdoutBytes (2026-09-07): bytes a file's child wrote RAW to fd 1 — console
 * output from the test or from code it loaded. Under node --test that fd is
 * the runner's own transport (v8-serialized frames); raw bytes on it move the
 * pipe's chunk boundaries and, when one lands inside a frame header, the
 * parent fails the file with "Unable to deserialize cloned data" at 1:1. The
 * virtual-SPIKE e2e tests did this twice in CI; scripts/check-test-run.mjs
 * reports the writers so the next one is named, not called a flake.
 *
 * to its --test-reporter-destination. scripts/check-test-run.mjs compares that
 * against scripts/list-tests.mjs. Used alongside the tap reporter, never
 * instead of it:
 *
 *   node --test --test-reporter=tap --test-reporter-destination=stdout \
 *        --test-reporter=./scripts/lib/test-census-reporter.mjs \
 *        --test-reporter-destination=test-results/fast.census.json <files>
 */
export default async function* testCensusReporter (source) {
    const files = {};
    let events = 0;
    const bucket = file => (files[file] ||= {tests: 0, passed: 0, failed: 0, stdoutBytes: 0, skipped: []});
    for await (const event of source) {
        if (event.type === 'test:stdout') {
            bucket(event.data.file || '(unknown)').stdoutBytes += Buffer.byteLength(String(event.data.message || ''));
            continue;
        }
        if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
        events++;
        const file = event.data.file || '(unknown)';
        const b = bucket(file);
        b.tests++;
        if (event.type === 'test:pass') b.passed++; else b.failed++;
        if (event.data.skip) b.skipped.push({name: event.data.name, reason: typeof event.data.skip === 'string' ? event.data.skip : '(no reason)'});
    }
    yield `${JSON.stringify({files, events}, null, 1)}\n`;
}
