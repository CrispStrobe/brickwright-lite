/**
 * AN OPTIONAL TARGET METHOD IS REFUSED BY NAME, BY EVERY CONSUMER.
 *
 * `replayToInputBoundary` exists on exactly one of the five debug targets lite
 * ships. That is a CAPABILITY, not a gap: the 6502 can stop at the exact tick a
 * recorded input was delivered and the others cannot, and the replay machinery
 * is built to work either way.
 *
 * What makes that true rather than merely intended is that every consumer
 * refuses BY NAME when the method is absent — a coded refusal a caller can act
 * on, not a TypeError from calling undefined.
 *
 * THE LEDGER ENTRY THAT OUTLIVED ITS OWN PREMISE. When `m6502-debug-replay-
 * boundary` was filed as `stays`, its reason was that the two consumers
 * DISAGREED about the absence — one raised a named replay error, the other threw
 * a raw TypeError — and that this needed "a design decision and its own lane".
 *
 * Both refuse by name now, and both refusals are tested
 * (debug-instruction-replay-host.test.mjs:141,
 * debug-timed-replay-io.test.mjs:121). The design decision was taken by whoever
 * fixed the TypeError; nothing recorded that the entry's premise had expired, so
 * the entry outlived it and kept a capability out of upstream for weeks.
 *
 * SO THIS ASSERTS THE PROPERTY, NOT THE TWO INSTANCES. A third consumer added
 * tomorrow that calls the method without checking would restore exactly the
 * state the ledger described, and neither existing test would notice: each is
 * about its own consumer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEBUG = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug');
const BOARD = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board');

/** Methods a target MAY implement, which a consumer must therefore check for. */
const OPTIONAL = ['replayToInputBoundary'];

const jsFiles = dir => fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(dir, f));

/**
 * Plain string tests, deliberately. An earlier version built these with RegExp
 * over a template literal and spent three attempts on backslash escaping — for
 * a check whose subject is a fixed identifier and a fixed guard idiom. The
 * legibility is the point: anyone can see what this looks for.
 */
const callsIt = (text, method) => text.includes('.' + method + '(');
const guardsIt = (text, method) =>
    text.includes("typeof target." + method + " !== 'function'");

test('the optional method really is optional — implemented by some targets, not all', () => {
    // The premise. If every target implemented it, "optional" would describe
    // nothing and the guards below would be protecting a case that cannot arise.
    for (const method of OPTIONAL) {
        const targets = jsFiles(BOARD).filter(f => f.endsWith('-debug.js'));
        assert.ok(targets.length >= 3,
            `only ${targets.length} debug target(s) found — the scan stopped matching, and `
            + 'every conclusion below is drawn from almost nothing');
        const have = targets.filter(f => fs.readFileSync(f, 'utf8').includes(method + '(boundary)'));
        assert.ok(have.length >= 1,
            `no target implements ${method}: it is not optional, it is absent, and the guards `
            + 'have nothing to be optional about');
        assert.ok(have.length < targets.length,
            `EVERY target now implements ${method}. Good news, and it makes this file wrong — `
            + 'the guards are dead code and the consumers should be simplified.');
    }
});

test('every consumer GUARDS the optional method before calling it', () => {
    // ENUMERATED FROM SOURCE. Naming today's two consumers would walk past the
    // third, which is the only case this file exists for.
    for (const method of OPTIONAL) {
        const consumers = jsFiles(DEBUG)
            .map(f => [f, fs.readFileSync(f, 'utf8')])
            .filter(([, text]) => callsIt(text, method));
        assert.ok(consumers.length >= 2,
            `only ${consumers.length} consumer(s) of ${method} found under bw-debug/ — the `
            + 'matcher stopped matching, and a scan that finds nothing approves everything');

        const unguarded = consumers
            .filter(([, text]) => !guardsIt(text, method))
            .map(([f]) => path.relative(ROOT, f));
        assert.deepEqual(unguarded, [],
            `these consumers call ${method} without checking the target implements it, so on `
            + 'four of the five targets they raise a TypeError from calling undefined instead '
            + `of refusing: ${unguarded.join(', ')}. That is precisely the state the divergence `
            + "ledger recorded as needing 'a design decision and its own lane'.");
    }
});

test('the refusal NAMES the missing capability', () => {
    // "Unsupported" without saying WHAT is unsupported sends the reader to the
    // target's source. Both of today's refusals name it; this keeps that true.
    for (const method of OPTIONAL) {
        const guards = jsFiles(DEBUG)
            .map(f => [f, fs.readFileSync(f, 'utf8')])
            .filter(([, text]) => guardsIt(text, method));
        assert.ok(guards.length >= 2, `only ${guards.length} guard(s) found for ${method}`);

        const silent = guards
            .filter(([, text]) => !(text.includes("'" + method) || text.includes(method + ',')
                || text.includes('implement ' + method)
                || text.includes('reverse-input-boundary-unsupported')))
            .map(([f]) => path.relative(ROOT, f));
        assert.deepEqual(silent, [],
            `these guards refuse without naming ${method}, so a caller is told something is `
            + `unsupported and has to read the target to find out what: ${silent.join(', ')}`);
    }
});
