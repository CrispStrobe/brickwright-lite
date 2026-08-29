#!/usr/bin/env node
/**
 * Prove test/fetch-pinning.test.mjs can fail — one mutation per claim it makes.
 *
 * A gate that has never been seen red is indistinguishable from a gate that
 * cannot go red. This repo has produced five of those, and the sharpest one was
 * a prover whose own edits had stopped matching: every "mutation" was a no-op,
 * the gate was asked to go red over an unchanged tree, and it reported green
 * truthfully about nothing. So every mutation here is checked for having
 * CHANGED THE FILE before the gate is run — a mutation that does not mutate is
 * a prover failure, not a gate success.
 *
 *   node scripts/prove-fetch-pinning.mjs          run all
 *   node scripts/prove-fetch-pinning.mjs --only 3 run one, and print its output
 *
 * Every mutation is reverted in a finally block; a crash mid-run leaves the
 * tree dirty and `git diff` says exactly where.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const GATE = 'test/fetch-pinning.test.mjs';

// THIS FILE IS SCANNED BY THE GATE IT PROVES, and it necessarily contains the
// text of the fetch sites it edits. The gate excludes itself by exact path and
// nothing else — deliberately, so that widening the exclusion is a visible
// diff — which leaves this file inside the census.
//
// It caught exactly that the moment this script was first committed: four
// mutation targets were reported as undeclared fetch sites. That is the gate
// working, and the fix is not to add a second exclusion. URL literals here are
// ASSEMBLED, so what this file contains is a recipe for a URL and not a URL.
// A new mutation that pastes a whole URL in will turn the gate red and say so.
const raw = (p) => `https://raw.${'githubusercontent'}.com/${p}`;
const codeload = (p) => `codeload.${'github'}.com/${p}`;

/**
 * Each mutation: the file, an edit, and the SUBTEST it must turn red.
 * `expect` is matched against the runner's output, so a mutation that reddens
 * some OTHER test — which is a different fact than the one being proved — is
 * reported as a failure of this prover.
 */
const MUTATIONS = [
    {
        name: 'an action tag is un-pinned back to @v4',
        file: '.github/workflows/build.yml',
        edit: (s) => s.replace(
            'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0',
            'uses: actions/checkout@v4'),
        expect: 'names a 40-hex action sha'
    },
    {
        name: 'a NEW mutable fetch appears in a script nobody declared',
        file: 'scripts/integrate.mjs',
        edit: (s) => `${s}\n// eslint-disable-next-line no-unused-vars\nconst SNEAK = '${raw('CrispStrobe/bw-board/master/src/index.js')}';\n`,
        expect: 'UNDECLARED FETCH SITE'
    },
    {
        name: 'a declared fetch site is removed but its census row stays',
        file: 'scripts/vendor.mjs',
        edit: (s) => s.replace(codeload('scratchfoundation/scratch-gui/tar.gz/${GUI_COMMIT}'),
            'example.invalid/scratch-gui.tgz'),
        expect: 'these census rows match nothing in the tree'
    },
    {
        name: 'the WASM pin is abbreviated back to seven characters',
        file: 'scripts/sync-emu8051-wasm.mjs',
        // Derived from whatever the PIN currently is, not hard-coded to one
        // sha. The literal form was `'2f1855a26…'` and it silently stopped
        // mutating the moment the pin moved — the prover's own "changed
        // nothing" check caught it, which is the only reason this mutation
        // did not go on proving nothing indefinitely. A gate that names a
        // value it does not own has an expiry date.
        edit: (s) => s.replace(/const PIN = '([0-9a-f]{40})';/,
            (_, sha) => `const PIN = '${sha.slice(0, 7)}';`),
        expect: 'is not a 40-hex sha'
    },
    {
        name: "CI's ancestry FLOOR is abbreviated",
        file: '.github/workflows/build.yml',
        edit: (s) => s.replace('FLOOR=85ed23d94a1fbf8a15c2ddff068d438a832913cc', 'FLOOR=85ed23d'),
        expect: 'is not a 40-hex sha'
    },
    {
        name: 'a vendor pin is recorded as a short sha',
        file: 'vendor-pins.json',
        // FIRST pin, matched by shape rather than by value: the original
        // edit named a literal sha, and the next ordinary pin bump made
        // the mutation a no-op — which the prover loudly reported as its
        // own failure ('the edit changed nothing'), exactly the
        // self-staleness check working. Shape-matching survives churn.
        edit: (s) => s.replace(/"([0-9a-f]{40})"/, (m, sha) => `"${sha.slice(0, 7)}"`),
        expect: 'these pins are not 40-hex shas'
    },
    {
        name: 'a sync script falls back to the mutable ref when resolution fails',
        file: 'scripts/sync-bw-board.mjs',
        edit: (s) => s.replace(`const RAW = \`${raw('${REPO}/${remoteSha}')}\`;`,
            `const RAW = \`${raw('${REPO}/${remoteSha ?? REF}')}\`;`),
        expect: 'falls back to the mutable REF'
    },
    {
        name: 'a sync script stops resolving the ref at all',
        file: 'scripts/sync-sb3creator.mjs',
        edit: (s) => s.replace('(await resolveRef(REPO, REF)).sha', '(await noLongerResolving(REPO, REF)).sha'),
        expect: 'never calls resolveRef()'
    },
    {
        name: 'the raw-CDN detector is edited into uselessness',
        file: GATE,
        edit: (s) => s.replace(
            "['raw', /raw\\.githubusercontent\\.com\\/[^\\s'\"`)\\\\]+/g],",
            "['raw', /raw\\.githubusercontent\\.com\\/THIS-WILL-NEVER-MATCH/g],"),
        expect: 'a detector matched nothing in a string built to contain one of each'
    },
    {
        name: 'the self-exclusion is widened to hide another file',
        file: GATE,
        edit: (s) => s.replace(
            "    .filter((f) => f !== THIS_GATE)",
            "    .filter((f) => f !== THIS_GATE && f !== 'scripts/vendor.mjs')"),
        expect: 'the self-exclusion is meant to be exactly one path'
    },
    {
        name: 'a waived fetch site loses its stated reason',
        file: GATE,
        // Replace the WHOLE multi-line `why` — replacing only its first line
        // leaves a dangling string concatenation, and a mutation that makes the
        // file unparseable proves the gate crashes, not that it checks.
        edit: (s) => s.replace(/        why: 'ANCESTRY, not content\.[\s\S]*?commits are the argument\.'/,
            "        why: 'waived.'"),
        expect: 'needs a stated reason'
    }
];

const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;
const runGate = () => {
    try {
        return {red: false, out: execFileSync('node', ['--test', GATE], {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})};
    } catch (e) {
        return {red: true, out: `${e.stdout || ''}${e.stderr || ''}`};
    }
};

// The gate must be GREEN before anything is mutated, or "red after" proves
// nothing about the mutation.
const baseline = runGate();
if (baseline.red) {
    console.error('BASELINE IS RED. Every result below would be meaningless.\n');
    console.error(baseline.out.split('\n').slice(-40).join('\n'));
    process.exit(2);
}
console.log('baseline: GREEN\n');

let failures = 0;
// What each mutated file held before anything touched it, so restoration can be
// checked at BYTE level. `git diff` cannot answer this question in CI: by the
// time this runs, `npm install` / vendor / integrate have already modified
// thousands of tracked files, so a dirty tree says nothing about the prover —
// and a check that reports "the prover left the tree dirty" about that is the
// same well-formed, wrong statement this whole branch is about. (It said
// exactly that, in run 32762117022, after reporting 11/11 caught.)
const originals = new Map();
for (const [i, m] of MUTATIONS.entries()) {
    const n = i + 1;
    if (only !== null && only !== n) continue;
    const abs = path.join(ROOT, m.file);
    const before = readFileSync(abs, 'utf8');
    if (!originals.has(abs)) originals.set(abs, before);
    const after = m.edit(before);
    // THE NO-OP GUARD. A mutation that hardcodes a value silently dies when the
    // value moves, and the gate then goes green over an unchanged tree — which
    // reads exactly like a gate that cannot fail.
    if (after === before) {
        console.log(`${n}. ${m.name}\n   PROVER FAILURE: the edit changed nothing in ${m.file}. `
            + 'Its target has moved; this mutation has been proving nothing.\n');
        failures++;
        continue;
    }
    let result;
    try {
        writeFileSync(abs, after);
        result = runGate();
    } finally {
        writeFileSync(abs, before);
    }
    const ok = result.red && result.out.includes(m.expect);
    if (!ok) failures++;
    console.log(`${n}. ${m.name}\n   ${m.file}: ${ok ? 'RED, for the stated reason' : result.red ? `RED, but NOT for "${m.expect}"` : 'GREEN — THE GATE DID NOT NOTICE'}\n`);
    if (only !== null) {
        console.log(result.out.split('\n').filter((l) => /^\s*(not ok|ok|#|\s+(error|\+|-))/.test(l) || l.includes(m.expect)).join('\n'));
    }
}

// Every mutated file back to the exact bytes it started with, and the gate green
// again: a prover that leaves the tree damaged has invalidated every run after
// it. Both halves are needed — byte equality catches a failed revert even where
// the gate would not notice, and a green gate catches damage to a file this run
// did not itself mutate.
const damaged = [...originals].filter(([abs, before]) => readFileSync(abs, 'utf8') !== before)
    .map(([abs]) => path.relative(ROOT, abs));
if (damaged.length) {
    console.error('A REVERT FAILED — these files do not match the bytes they started with:\n  '
        + damaged.join('\n  '));
    process.exit(2);
}
const restored = runGate();
if (restored.red) {
    console.error('THE TREE DID NOT COME BACK GREEN, though every mutated file was restored '
        + 'byte-for-byte. Something outside this prover changed underneath it.');
    process.exit(2);
}
console.log(`${originals.size} mutated file(s) restored byte-for-byte.`);

const ran = only !== null ? 1 : MUTATIONS.length;
console.log(`${ran - failures}/${ran} mutations caught; tree restored, gate green.`);
process.exit(failures ? 1 : 0);
