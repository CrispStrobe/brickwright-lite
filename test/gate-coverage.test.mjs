/**
 * A browser gate that CI never runs decays into decoration.
 *
 * THE EVIDENCE THIS RESTS ON (swept 2026-08-27, against a current build, with
 * the servers and PROOF_URL each script expects — so these are not setup
 * failures):
 *
 *   17 scripts/verify-*.mjs are referenced by no workflow. FOUR still pass.
 *   THIRTEEN do not. Two more had already rotted and were repaired that day:
 *   verify-debugger-solo could not get past its first click (a starter overlay
 *   it never dismissed, a textarea the editor stopped being, and two button
 *   titles from a UI model that no longer exists), and verify-labwired-engine
 *   was written and simply never wired in.
 *
 * The failures are not interesting individually — they are stale selectors and
 * expired assumptions, exactly what happens to any check nothing exercises. The
 * structural point is that NOTHING NOTICED. Each one was written to catch a
 * regression its author had just been bitten by, and each stopped being able to.
 *
 * So: a new gate must be wired into a workflow, or listed below as knowingly
 * unwired. The list is a ratchet, not a blessing — it should only ever shrink.
 * Adding to it is a deliberate act that shows up in review; forgetting to wire
 * a gate in is not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Gates that no workflow runs, with their state when this list was made.
 * REMOVE an entry by wiring the gate into .github/workflows/build.yml — after
 * making it pass, which for most of these means bringing it up to the current
 * UI rather than tweaking a selector.
 */
const KNOWN_UNWIRED = {
    // Inventoried 2026-09-03 by widening this file past `verify-*`. Both render a VERDICT and
    // neither is run by any workflow, which is the decay this file exists to prevent — it was
    // invisible here only because of how they are named.
    'smoke-debugger.mjs':
        'Runs nowhere. Needs a runnable sdcc and a sibling stc-compiler checkout, and exits 2 by ' +
        'name when either is missing, so it fails closed rather than lying. Whether it ships (wire ' +
        'it into a workflow that installs sdcc) or is deleted is a decision for the lane owner, ' +
        'not a thing to leave undecided and unnoticed.',
    'oracle-simavr.mjs':
        'Runs nowhere and no test references it. An oracle nothing consults is not an oracle. Same ' +
        'decision as above; it also binds `simavr` by bare name, so its verdict depends on whatever ' +
        'that resolves to.'
};

const workflowTexts = readdirSync(path.join(ROOT, '.github/workflows'))
    .filter(f => f.endsWith('.yml'))
    .map(f => readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'));

// Only shell in a step's `run:` value executes. A gate name in a comment,
// step name, environment value, or `echo` must not make an orphaned gate look
// protected. This intentionally supports the small YAML subset GitHub Actions
// uses for run scalars without adding a production YAML dependency to the test.
const workflowRunScalars = text => {
    const lines = text.split('\n');
    const scalars = [];
    for (let index = 0; index < lines.length; index++) {
        const match = lines[index].match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
        if (!match) continue;
        const [, indent, value] = match;
        if (value && !/^[|>][-+]?\s*(?:#.*)?$/.test(value)) {
            scalars.push(value);
            continue;
        }
        const block = [];
        while (index + 1 < lines.length) {
            const next = lines[index + 1];
            if (!next.trim()) {
                block.push('');
                index++;
                continue;
            }
            const nextIndent = next.match(/^\s*/)[0].length;
            if (nextIndent <= indent.length) break;
            block.push(next.slice(indent.length + 1));
            index++;
        }
        scalars.push(block.join('\n'));
    }
    return scalars;
};

const shellQuote = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Exec wrappers count as running the gate. `xvfb-run -a dbus-run-session -- node scripts/x.mjs`
// runs x.mjs; without this the e2e harness read as orphaned for seven hours while CI was
// executing it on every push that touched its paths. The list is a WHITELIST, not a free prefix:
// the strictness exists so a gate named in an `echo` cannot look protected, and `echo` is not a
// wrapper. Each token must be a wrapper name, a flag, `--`, or a timeout duration.
const WRAPPERS = '(?:xvfb-run|dbus-run-session|timeout|env|nice|stdbuf|setsid|--|-{1,2}[A-Za-z0-9-]+|\\d+[smh]?)';
const runInvokesGate = (run, gate) => new RegExp(
    `(?:^|[;&|]\\s*)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\\s]+)\\s+)*` +
    `(?:${WRAPPERS}\\s+)*` +
    `node\\s+(?:\\./)?scripts/${shellQuote(gate)}(?=\\s|$)`,
    'm'
).test(run);
const workflowRuns = workflowTexts.flatMap(workflowRunScalars);
// A gate is exercised either by a workflow `run:` OR by a test file, because CI runs the whole
// Node suite. Widening the inventory past `verify-*` surfaced `oracle-trace` and
// `oracle-differential`, which ARE exercised — through tests — and calling them "unwired" would
// have been false. The distinction that matters is exercised-by-something versus run-by-nothing:
// `smoke-debugger` and `oracle-simavr` are referenced by no test and no workflow at all.
//
// Comment-stripped, so a gate NAMED in a comment does not look covered. That is the same trap as
// a `doesNotMatch` reading its own documentation, one direction over.
// Excluding THIS file, because KNOWN_UNWIRED names its entries as string literals — so reading
// every test would make each documented-orphan look exercised by the very list that documents it
// as an orphan. Caught by the paired assertion below firing in the opposite direction, which is
// the argument for having both.
const testSources = readdirSync(path.join(ROOT, 'test'))
    .filter(f => f.endsWith('.test.mjs') && f !== 'gate-coverage.test.mjs')
    .map(f => readFileSync(path.join(ROOT, 'test', f), 'utf8')
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''));
const gateIsWired = gate => workflowRuns.some(run => runInvokesGate(run, gate)) ||
    testSources.some(source => source.includes(gate));

// Every script that renders a VERDICT, not only those named `verify-`. This file's own opening
// line is "a browser gate that CI never runs decays into decoration" — which was true of
// `smoke-*` and `oracle-*` too, and they were escaping the inventory purely by naming. The same
// convention the gate-shape sweep keys on, for the same reason.
const gates = readdirSync(path.join(ROOT, 'scripts'))
    .filter(f => /^(?:verify|smoke|oracle)-/.test(f) && f.endsWith('.mjs'));

test('a wrapper runs a gate; a mention of one does not', () => {
    // The whitelist that lets `xvfb-run -a dbus-run-session -- node …` count must not also let a
    // gate named in an echo or a comment look protected — that strictness is the whole reason
    // this file reads `run:` scalars rather than grepping the workflow.
    const gate = 'verify-example.mjs';
    for (const run of [
        `node scripts/${gate}`,
        `xvfb-run -a dbus-run-session -- node scripts/${gate}`,
        `PROOF_URL=http://localhost:8617/ node scripts/${gate}`,
        `timeout 600 node scripts/${gate}`,
        `set -e; xvfb-run -a node scripts/${gate}`
    ]) {
        assert.ok(runInvokesGate(run, gate), `should count as running the gate: ${run}`);
    }
    for (const run of [
        `echo node scripts/${gate}`,
        `echo "remember to run node scripts/${gate}"`,
        `# node scripts/${gate}`
    ]) {
        assert.equal(runInvokesGate(run, gate), false, `must NOT count as running it: ${run}`);
    }
});

test('every browser gate is either run by CI or knowingly listed as not', () => {
    const unwired = gates.filter(g => !gateIsWired(g));
    const undeclared = unwired.filter(g => !(g in KNOWN_UNWIRED));
    assert.deepEqual(undeclared, [],
        `these gates are run by nothing and are not in KNOWN_UNWIRED: ${undeclared.join(', ')}. ` +
        'Wire them into .github/workflows/build.yml, or add them to that list with their state. ' +
        'A gate nothing runs stops working and nobody finds out — 13 of 17 already had.');
});

test('the unwired list only shrinks — entries that are now wired must be removed', () => {
    // Without this the list rots too: a gate could be wired into CI and still
    // sit here claiming to be unwatched, which is exactly the kind of stale
    // bookkeeping that made the sweep necessary.
    const wrongly = Object.keys(KNOWN_UNWIRED).filter(g => gateIsWired(g));
    assert.deepEqual(wrongly, [],
        `these are in KNOWN_UNWIRED but ARE run by a workflow — delete them from the list: ${wrongly.join(', ')}`);
});

test('only executable run commands count as wired browser gates', () => {
    const gate = 'verify-fixture.mjs';
    const falsePositives = [
        '# node scripts/verify-fixture.mjs',
        'name: node scripts/verify-fixture.mjs',
        'env:\n  GATE: verify-fixture.mjs',
        'run: echo node scripts/verify-fixture.mjs',
    ];
    for (const yaml of falsePositives) {
        assert.ok(!workflowRunScalars(yaml).some(run => runInvokesGate(run, gate)),
            `non-executable YAML must not wire a gate: ${yaml}`);
    }

    const truePositives = [
        'run: node scripts/verify-fixture.mjs',
        'run: PROOF_URL=http://localhost:8617/ node scripts/verify-fixture.mjs --flag',
        'run: |\n  npm run build\n  node ./scripts/verify-fixture.mjs',
    ];
    for (const yaml of truePositives) {
        assert.ok(workflowRunScalars(yaml).some(run => runInvokesGate(run, gate)),
            `an executable run command must wire a gate: ${yaml}`);
    }
});

test('every listed gate still exists', () => {
    const missing = Object.keys(KNOWN_UNWIRED).filter(g => !gates.includes(g));
    assert.deepEqual(missing, [],
        `KNOWN_UNWIRED names gates that no longer exist: ${missing.join(', ')}`);
});

/**
 * The runtime twin of the invariant above.
 *
 * A gate wired into CI can still produce no verdict on any run, and the tests
 * above cannot see it, because they read `run:` and never `if:`.
 *
 * MEASURED 2026-09-02. GitHub folds an implicit `success()` into any `if:` that
 * names no status function, so `if: steps.playwright.outcome == 'success'` on a
 * gate step really means "playwright installed AND nothing has failed yet".
 * `scripts/verify-project-bundle-integrity.mjs` — step 41 of 61 — was the sole
 * failure on every one of the 17 consecutive `main` builds from `f15fd3e6c`
 * (06:26 UTC 09-01) to `62385f4c5`, and it SKIPPED the 17 gate steps after it,
 * covering 23 distinct verify scripts, on all 17 runs. For 23 hours About,
 * intro, interaction, schematic, Code chrome, Controller, faceplates,
 * Instruments, Aurora-65, the debugger dock, both labwired tiers, the offline
 * 8051 pair, the AVR bench, the pinned worker, Web Bluetooth, MakeCode and both
 * micro:bit gates produced NOTHING, and each run reported only "build failed".
 *
 * Wiring a gate in is therefore not enough; it must also be unskippable by an
 * unrelated gate's failure. `!cancelled()` is the whole fix, and this asserts it
 * so the next hand that adds a gate by copying its neighbour cannot lose it.
 */
const buildYml = readFileSync(path.join(ROOT, '.github/workflows/build.yml'), 'utf8');

/** The build job's steps, in order, each as {name, ifs, run}. */
const buildJobSteps = text => {
    const lines = text.split('\n');
    const start = lines.findIndex(l => /^  build:$/.test(l));
    const end = lines.findIndex((l, i) => i > start && /^  [a-z][a-z-]*:$/.test(l));
    const body = lines.slice(start, end === -1 ? lines.length : end);
    const steps = [];
    let current = null;
    for (let i = 0; i < body.length; i++) {
        const line = body[i];
        if (/^      - /.test(line)) {
            if (current) steps.push(current);
            current = {name: '', ifs: '', run: '', lines: []};
        }
        if (!current) continue;
        current.lines.push(line);
        const name = line.match(/^      (?:- )?name:\s*(.*)$/);
        if (name) current.name = name[1];
        const cond = line.match(/^        if:\s*(.*)$/);
        if (cond) current.ifs = cond[1];
    }
    if (current) steps.push(current);
    for (const step of steps) step.run = workflowRunScalars(step.lines.join('\n')).join('\n');
    return steps;
};

test('a browser gate cannot be skipped by an unrelated gate failing before it', () => {
    const steps = buildJobSteps(buildYml);
    const serve = steps.findIndex(s => /id:\s*serve/.test(s.lines.join('\n')));
    assert.ok(serve > 0, 'the build job has no step with `id: serve` to hang the gates off');

    const skippable = steps
        .slice(serve + 1)
        .filter(s => gates.some(g => runInvokesGate(s.run, g)))
        .filter(s => !/!cancelled\(\)/.test(s.ifs))
        .map(s => s.name || s.run.split('\n')[0]);

    assert.deepEqual(skippable, [],
        'these steps run a browser gate but are skipped the moment any earlier step fails, so ' +
        `they report nothing on exactly the runs that need them most: ${skippable.join(' | ')}. ` +
        "Guard them with `if: ${{ !cancelled() && steps.serve.outcome == 'success' }}` like their " +
        'neighbours. Measured cost of getting this wrong: 23 distinct gates silent for 23 hours.');
});

test('the gates stay keyed on the served app, not on the playwright install', () => {
    // `serve` is itself skipped when playwright fails, so keying on it covers
    // that case AND stops 30 gates being fired at a dead server, each burning a
    // navigation timeout, when the server never came up. A gate that reverts to
    // `steps.playwright.outcome` loses the second half silently.
    const steps = buildJobSteps(buildYml);
    const serve = steps.findIndex(s => /id:\s*serve/.test(s.lines.join('\n')));
    const misKeyed = steps
        .slice(serve + 1)
        .filter(s => gates.some(g => runInvokesGate(s.run, g)))
        .filter(s => !/steps\.serve\.outcome == 'success'/.test(s.ifs))
        .map(s => s.name);
    assert.deepEqual(misKeyed, [],
        `these browser gates are not keyed on the served app: ${misKeyed.join(' | ')}`);
});
