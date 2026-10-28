import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {parsePushPaths} from '../scripts/lib/doc-triggers.mjs';
import {isDocsOnly, pushWouldBuild} from '../scripts/ci-docs-only.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(path.join(ROOT, '.github/workflows/build.yml'), 'utf8');
const {entries} = parsePushPaths(yml);

test('docs-only is the push trigger filter applied to the PR, failing closed', () => {
    assert.equal(isDocsOnly(['LANES.md'], entries), true);
    assert.equal(isDocsOnly(['LANES.md', 'docs/SOME-UNREAD-NOTE.md'], entries), true);
    // Docs that code reads are build triggers, so they are code changes here.
    for (const f of ['docs/FETCH-PINNING.md', 'docs/generated/x.md', 'THIRD-PARTY-NOTICES.md',
        'overlay/scratch-gui/examples/a/EXPECTED.md', 'scripts/list-tests.mjs', '.github/workflows/build.yml'])
        assert.equal(isDocsOnly(['LANES.md', f], entries), false, f);
    assert.equal(isDocsOnly([], entries), false, 'an empty file list is not evidence of docs-only');
    assert.equal(pushWouldBuild('package.json', entries), true);
    assert.throws(() => pushWouldBuild('x', ['**', '!docs/**/*.md']), /unsupported trigger pattern/);
    assert.throws(() => isDocsOnly(['LANES.md'], ['!LANES.md']), /must start with \*\*/);
});

test('the CLI prints a GITHUB_OUTPUT line', () => {
    const run = input => spawnSync(process.execPath, ['scripts/ci-docs-only.mjs'], {cwd: ROOT, input, encoding: 'utf8'});
    assert.equal(run('LANES.md\nREADME.md\n').stdout.trim(), 'docs_only=true');
    assert.equal(run('LANES.md\nsrc/x.js\n').stdout.trim(), 'docs_only=false');
});

test('build.yml wires the tiers: scope, gate, fast and thorough conditions', () => {
    const jobs = new Map([...yml.matchAll(/^  ([a-z][\w-]*):\n([\s\S]*?)(?=^  [a-z][\w-]*:\n|(?![\s\S]))/gm)].map(m => [m[1], m[2]]));
    const scope = jobs.get('scope'), gate = jobs.get('full-ci-gate');
    assert.ok(scope && gate, 'scope and full-ci-gate jobs exist');
    assert.match(scope, /node scripts\/ci-docs-only\.mjs/);
    assert.match(gate, /name: full CI requested/);
    assert.match(gate, /add the ci:full label so the thorough tier runs before merge/);
    for (const fast of ['unit', 'build', 'corpus']) assert.match(jobs.get(fast), /needs\.scope\.outputs\.fast == 'true'/, fast);
    for (const heavy of ['browser', 'fpga-surface']) assert.match(jobs.get(heavy), /needs\.scope\.outputs\.thorough == 'true'/, heavy);
    assert.match(yml, /pull_request:\n    types: \[opened, synchronize, reopened, labeled, unlabeled, ready_for_review\]/);
});
