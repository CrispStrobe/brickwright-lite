/**
 * A STEP THAT SAYS "NEVER ON workflow_dispatch" MUST CHECK THE EVENT.
 *
 * `startsWith(github.ref, 'refs/tags/')` is a claim about the REF SHAPE. A
 * `workflow_dispatch` run against a tag satisfies it — the ref is a tag either
 * way. So a guard written that way does not exclude manual runs, however
 * plainly the comment above it says it does.
 *
 * MEASURED, run 34031659129: mobile.yml's App Store upload step carried the
 * comment
 *
 *     only on real version tags, never on workflow_dispatch test runs
 *
 * and the predicate `startsWith(github.ref, 'refs/tags/')`. Someone dispatched
 * the workflow on v0.1.15 to test it, the step ran for real, and Apple refused:
 *
 *     status 409  ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE
 *     The bundle version must be higher than the previously uploaded version
 *
 * Build, signing and validation had all succeeded. The job reported as
 * `ios-signed: failure`, which reads as a signing problem — two steps after
 * signing demonstrably worked. A correct refusal, wearing the name of the wrong
 * component.
 *
 * THIS IS THE SAME SHAPE AS EVERYTHING ELSE FOUND TODAY: the rule survives as
 * prose while the predicate implements something narrower. The remedy is the
 * same too — make the prose checkable. If a step's own comment says it must not
 * run on a manual dispatch, its `if:` has to say so as well.
 *
 * NOT EVERY TAG-GUARDED STEP IS IN SCOPE, and that distinction is the whole
 * reason this reads the comment rather than banning the pattern. The TestFlight
 * distribution step below the upload is deliberately idempotent — its comment
 * says "a re-run after a partial failure is the recovery" — so a dispatch over
 * a tag SHOULD reach it. Only the steps that disclaim manual runs are held to
 * it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '.github/workflows');

/** Says, in prose, that it must not run on a manual dispatch. */
const DISCLAIMS_DISPATCH = /never on workflow_dispatch|not on workflow_dispatch|never on a manual|only on (?:a )?real (?:version )?tags?\b/i;

/**
 * Every `- name:` step with the comment block immediately above it.
 *
 * Comment-to-step association is the load-bearing part: a file-wide search for
 * the phrase would attribute one step's disclaimer to its neighbours.
 */
const stepsWithComments = text => {
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(\s*)- name:\s*(.+?)\s*$/);
        if (!m) continue;
        const comment = [];
        for (let j = i - 1; j >= 0 && /^\s*#/.test(lines[j]); j--) comment.unshift(lines[j]);
        // The step's own `if:` is the first one at deeper indent before the next `- name:`.
        let cond = null;
        for (let j = i + 1; j < lines.length && !/^\s*- name:/.test(lines[j]); j++) {
            const c = lines[j].match(/^\s*if:\s*(.+?)\s*$/);
            if (c) { cond = c[1]; break; }
        }
        out.push({name: m[2], line: i + 1, comment: comment.join('\n'), cond});
    }
    return out;
};

const workflows = () => fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f));

test('the workflow scan finds steps and comments at all', () => {
    // Species 1: a parser that matches nothing approves every workflow.
    const files = workflows();
    assert.ok(files.length >= 5, `only ${files.length} workflow file(s) found in ${DIR}`);
    const all = files.flatMap(f => stepsWithComments(fs.readFileSync(path.join(DIR, f), 'utf8')));
    assert.ok(all.length > 50,
        `only ${all.length} steps parsed across ${files.length} workflows — the step matcher `
        + 'stopped matching, and a scan that finds nothing finds no violation either');
    assert.ok(all.some(s => s.comment.length > 0),
        'no step has a comment block above it, so the comment-to-step association is broken '
        + 'and every prose check below reads an empty string');
    assert.ok(all.some(s => s.cond),
        'no step has an `if:` — the condition matcher is broken');
});

test('the disclaimer phrase matches the real comment, and not everything', () => {
    // The predicate this gate turns on, fired at an example and a counter-example
    // rather than trusted. A phrase regex that matches nothing passes every
    // workflow; one that matches everything reds the recovery steps that are
    // meant to run on a dispatch.
    assert.match('only on real version tags, never on workflow_dispatch test runs',
        DISCLAIMS_DISPATCH, 'the disclaimer phrase does not match the comment it was written for');
    assert.doesNotMatch('Idempotent, so a re-run after a partial failure is the recovery.',
        DISCLAIMS_DISPATCH,
        'the phrase matches a step that DELIBERATELY supports re-dispatch — gating that one '
        + 'would break the documented recovery path');
});

test('a step that disclaims workflow_dispatch actually checks the event', () => {
    const offenders = [];
    for (const file of workflows()) {
        const text = fs.readFileSync(path.join(DIR, file), 'utf8');
        for (const step of stepsWithComments(text)) {
            if (!DISCLAIMS_DISPATCH.test(step.comment)) continue;
            if (!step.cond) {
                offenders.push(`${file}:${step.line} "${step.name}" — says it, no \`if:\` at all`);
                continue;
            }
            if (!/event_name/.test(step.cond)) {
                offenders.push(`${file}:${step.line} "${step.name}" — if: ${step.cond}`);
            }
        }
    }
    assert.deepEqual(offenders, [],
        '\n  THESE STEPS SAY THEY DO NOT RUN ON A MANUAL DISPATCH, AND DO NOT CHECK:\n    '
        + offenders.join('\n    ')
        + '\n\n  `startsWith(github.ref, \'refs/tags/\')` is a claim about the REF, and a\n'
        + '  workflow_dispatch against a tag satisfies it. Add `github.event_name == \'push\' &&`\n'
        + '  or change the comment — but they must agree, because one of them is what runs.\n');
});
