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
        if (!/uses:\s*actions\/upload-artifact/.test(lines[i])) continue;
        const indent = lines[i].match(/^\s*/)[0].length;
        let hasPath = false;
        for (let j = i + 1; j < lines.length; j++) {
            const line = lines[j];
            if (line.trim() === '') continue;
            const lead = line.match(/^\s*/)[0].length;
            // A new step starts at or below the `uses:` indentation.
            if (lead < indent || /^\s*- /.test(line)) break;
            if (/^\s*path:/.test(line)) { hasPath = true; break; }
        }
        if (!hasPath) out.push(i + 1);
    }
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

test('the parse found the steps it is about to reason over', () => {
    const build = readFileSync(path.join(DIR, 'build.yml'), 'utf8');
    const uploads = (build.match(/uses:\s*actions\/upload-artifact/g) || []).length;
    assert.ok(uploads >= 15, `only ${uploads} upload-artifact steps parsed in build.yml — the parse ` +
        'is wrong before anything is concluded');
    assert.ok((build.match(/^\s*run: [|>]/gm) || []).length >= 20, 'run: blocks not found');
});
