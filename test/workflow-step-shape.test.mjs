/**
 * Two static shapes that a workflow file can lose without failing to parse.
 *
 * Both come from a real defect: splitting the browser gates into their own job
 * moved an `upload-artifact` step's `path:` block INTO the `run: |` literal of a
 * different step in a different job. The YAML stayed valid — a `run:` block is
 * opaque text, so `path: |` inside it is just three lines of shell — and the
 * only symptom was a runtime "Input required and not supplied: path" on one job,
 * masked on the other because its unit tests failed first. Reviewers on two
 * lanes read that diff and neither saw it.
 *
 *   1. Every `upload-artifact` step declares `path`. Without it the step fails
 *      at RUN time, after the work it exists to preserve has already happened —
 *      which is the worst moment to discover a typo in an artifact declaration.
 *   2. No `run:` block contains a line shaped like a step key. A misplaced
 *      `path:`/`with:`/`uses:` is silently shell, and shell that does nothing:
 *      `path: |` is not a command, so it fails or no-ops depending on the line,
 *      and the step it was moved OUT of loses its declaration entirely.
 *
 * Keyed on unambiguous keys only. `name:` and `if:` are omitted on purpose:
 * both occur legitimately inside shell (`if [ ... ]`, `name=…`), and a rule that
 * fires on correct code is one people learn to ignore.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, '..', '.github', 'workflows');
const FILES = readdirSync(DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

// Keys that cannot plausibly begin a line of shell.
const STEP_KEYS = /^(path|with|uses|if-no-files-found|timeout-minutes|continue-on-error|retention-days):/;

const runBlockViolations = text => {
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const open = lines[i].match(/^(\s*)run: [|>]/);
        if (!open) continue;
        const indent = open[1].length;
        for (let j = i + 1; j < lines.length; j++) {
            const line = lines[j];
            if (line.trim() === '') continue;
            const lead = line.match(/^\s*/)[0].length;
            if (lead <= indent) break;            // block ended
            if (STEP_KEYS.test(line.trim())) out.push({line: j + 1, text: line.trim().slice(0, 60)});
        }
    }
    return out;
};

const uploadStepsMissingPath = text => {
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        // EVERY upload action, not just `upload-artifact`. The first version of
        // this gate matched `actions/upload-artifact` and so skipped
        // `actions/upload-pages-artifact` — the ONE upload whose loss stops
        // every deploy. It covered 23 steps and missed the one that mattered.
        if (!/uses:\s*actions\/upload-[a-z-]*artifact/.test(lines[i])) continue;
        const indent = lines[i].match(/^\s*/)[0].length;
        let hasPath = false;
        for (let j = i + 1; j < lines.length; j++) {
            const line = lines[j];
            if (line.trim() === '') continue;
            const lead = line.match(/^\s*/)[0].length;
            if (lead < indent || /^\s*- /.test(line)) break;
            // Both spellings: a `path:` key, or the inline `with: { path: … }`
            // flow-mapping form. Checking only the first reports the Pages
            // upload as missing a path it plainly has — a false red on the
            // step nobody can afford one on.
            if (/^\s*path:/.test(line) || /with:\s*\{[^}]*\bpath:/.test(line)) { hasPath = true; break; }
        }
        if (!hasPath) out.push(i + 1);
    }
    return out;
};

// A step is a `- ` entry inside a job's `steps:` block. Anchoring on `steps:`
// matters: `on: push: paths-ignore:` entries are `- ` lines at the same
// indentation, and treating `- 'BLOCKED.md'` as a step reports a filename for
// having neither `uses` nor `run`, which is true and meaningless.
const stepsWithoutExactlyOneAction = text => {
    const lines = text.split('\n');
    const out = [];
    let inSteps = false, stepsIndent = 0;
    let cur = null;
    const finish = () => {
        if (cur && (cur.uses + cur.run) !== 1) out.push(cur);
        cur = null;
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;
        const lead = line.match(/^\s*/)[0].length;
        const m = line.match(/^(\s*)steps:\s*$/);
        if (m) { finish(); inSteps = true; stepsIndent = m[1].length; continue; }
        if (inSteps && lead <= stepsIndent && !/^\s*- /.test(line)) { finish(); inSteps = false; continue; }
        if (!inSteps) continue;
        if (/^\s*- /.test(line) && lead === stepsIndent + 2) {
            finish();
            cur = {line: i + 1, uses: 0, run: 0, name: (line.match(/name:\s*(.*)$/) || [])[1] || line.trim().slice(0, 44)};
        }
        if (!cur) continue;
        if (/^\s*-?\s*uses:/.test(line)) cur.uses++;
        if (/^\s*-?\s*run:/.test(line)) cur.run++;
    }
    finish();
    return out;
};

test('every upload-artifact step declares a path', () => {
    for (const f of FILES) {
        const missing = uploadStepsMissingPath(readFileSync(path.join(DIR, f), 'utf8'));
        assert.deepEqual(missing, [], `${f}: upload-artifact step(s) with no \`path:\` at line(s) ` +
            `${missing.join(', ')}. The step fails at RUN time, after the work it exists to preserve.`);
    }
});

test('no run: block contains a line shaped like a step key', () => {
    for (const f of FILES) {
        const bad = runBlockViolations(readFileSync(path.join(DIR, f), 'utf8'));
        assert.deepEqual(bad, [], `${f}: step key(s) buried inside a \`run:\` literal — valid YAML, ` +
            `silently shell, and the step they belong to has lost them:\n  ` +
            bad.map(b => `line ${b.line}: ${b.text}`).join('\n  '));
    }
});

test('every step has exactly one of uses or run', () => {
    for (const f of FILES) {
        const bad = stepsWithoutExactlyOneAction(readFileSync(path.join(DIR, f), 'utf8'));
        assert.deepEqual(bad.map(b => `line ${b.line}: ${b.name}`), [],
            `${f}: step(s) with neither or both of \`uses\`/\`run\` — a step that does nothing, or ` +
            `one whose action was severed from it and landed elsewhere.`);
    }
});

test('the parse found the steps it is about to reason over', () => {
    const build = readFileSync(path.join(DIR, 'build.yml'), 'utf8');
    const uploads = (build.match(/uses:\s*actions\/upload-artifact/g) || []).length;
    assert.ok(uploads >= 15, `only ${uploads} upload-artifact steps parsed in build.yml — the parse ` +
        'is wrong before anything is concluded');
    assert.ok((build.match(/^\s*run: [|>]/gm) || []).length >= 20, 'run: blocks not found');
});
