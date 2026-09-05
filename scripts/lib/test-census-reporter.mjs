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
 *   {"files": {"<path>": {"tests": n, "passed": n, "failed": n}}, "events": n}
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
    const bucket = file => (files[file] ||= {tests: 0, passed: 0, failed: 0});
    for await (const event of source) {
        if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
        events++;
        const file = event.data.file || '(unknown)';
        const b = bucket(file);
        b.tests++;
        if (event.type === 'test:pass') b.passed++; else b.failed++;
    }
    yield `${JSON.stringify({files, events}, null, 1)}\n`;
}
