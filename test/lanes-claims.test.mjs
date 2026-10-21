// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * One file per lane claim (lanes/<YYYY-MM-DD>-<slug>.md). LANES.md is a stable
 * header that new claims never edit, so two PRs claiming in parallel never
 * conflict. These tests hold the readers to that layout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {listClaims, lanesProblems, claimProblems, lanesIndex, NON_CLAIMS} from '../scripts/lib/lanes.mjs';
import {parsePointers, parseStepPointers, POINTERS_FILE} from '../scripts/lib/skip-pointers.mjs';
import {parsePushPaths} from '../scripts/lib/doc-triggers.mjs';
import {isDocsOnly} from '../scripts/ci-docs-only.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('the reader finds the claims, and every claim file is well formed', () => {
    const claims = listClaims(ROOT);
    assert.ok(claims.length >= 700, `expected the migrated history, found ${claims.length} claim(s)`);
    assert.deepEqual(lanesProblems(ROOT), []);
    for (const c of claims) assert.match(c.date, /^\d{4}-\d\d-\d\d$/, c.file);
    assert.ok(claims.some(c => /Robot Lab rubber bands/.test(c.title)), 'a known migrated claim is found by its title');
    const index = lanesIndex(claims);
    assert.equal(index, lanesIndex(listClaims(ROOT)), 'the index is deterministic');
    assert.match(index, new RegExp(`${claims.length} claim\\(s\\)`));
});

test('the migration map names only files that exist, and LANES.md stays a short header', () => {
    const tsv = readFileSync(path.join(ROOT, 'lanes/MIGRATION-2026-10-20.tsv'), 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
    assert.ok(tsv.length > 700);
    for (const row of tsv) {
        const [start, end, dest] = row.split('\t');
        assert.ok(+start <= +end, row);
        assert.ok(existsSync(path.join(ROOT, dest)), `${dest} (from LANES.md:${start}-${end}) is missing`);
    }
    const header = readFileSync(path.join(ROOT, 'LANES.md'), 'utf8');
    assert.ok(header.length < 4096, 'LANES.md is a header, not a ledger');
    assert.doesNotMatch(header, /^\| /m, 'no claim rows in LANES.md');
    assert.match(header, /lanes\/<YYYY-MM-DD>-<slug>\.md/);
    for (const f of NON_CLAIMS) assert.ok(existsSync(path.join(ROOT, 'lanes', f)), f);
});

test('the CI pointers moved with their headings and still parse', () => {
    const text = readFileSync(path.join(ROOT, POINTERS_FILE), 'utf8');
    assert.ok(parsePointers(text).length > 0, 'skip pointers');
    assert.ok(parseStepPointers(text).length > 0, 'step pointers');
    assert.equal(parsePointers(readFileSync(path.join(ROOT, 'LANES.md'), 'utf8')).length, 0);
});

test('claim shape: name, date, emptiness and local paths are refused by name', () => {
    assert.deepEqual(claimProblems('2026-10-20-a-claim.md', '## A claim\n\nOwner: someone; paths: `scripts/x.mjs`.\n'), []);
    assert.match(claimProblems('2026-10-20-Bad_Name.md', 'x')[0], /named <YYYY-MM-DD>-<lower-case-slug>\.md/);
    assert.match(claimProblems('2026-02-30-x.md', 'x')[0], /is not a date/);
    assert.match(claimProblems('2026-10-20-x.md', '  \n')[0], /empty claim/);
    assert.match(claimProblems('2026-10-20-x.md', `worktree /${'home'}/someone/wt`)[0], /local machine path/);
    assert.match(claimProblems('2026-10-20-x.md', `at \`/${'mnt'}/volume/x\``)[0], /local machine path/);
});

test('a claim-only PR is docs-only, like a LANES.md-only PR was', () => {
    const {entries} = parsePushPaths(readFileSync(path.join(ROOT, '.github/workflows/build.yml'), 'utf8'));
    assert.equal(isDocsOnly(['lanes/2026-10-20-some-claim.md'], entries), true);
    assert.equal(isDocsOnly([POINTERS_FILE], entries), true);
    assert.equal(isDocsOnly(['lanes/2026-10-20-some-claim.md', 'scripts/x.mjs'], entries), false);
    assert.equal(isDocsOnly(['lanes/sub/x.mjs'], entries), false, 'only files directly in lanes/ are claims');
});

// A clean environment: a runner or hook may export GIT_DIR / GIT_INDEX_FILE etc.,
// which would point the scratch repo at the real checkout.
const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const git = (cwd, ...args) => {
    // gate-shapes-allow: the subject is git's own merge of two claim files in a scratch repo; a missing git fails red.
    const r = spawnSync('git', [  // gate-shapes-allow'-c', 'gc.auto=0', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid',
        '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], {cwd, encoding: 'utf8', env: GIT_ENV});
    return r;
};

test('two claims added in parallel, in different files, merge without a conflict', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'bw-lanes-'));
    try {
        const init = git(repo, 'init', '-q');
        assert.equal(init.status, 0, `git init: ${init.stderr}`);
        writeFileSync(path.join(repo, 'LANES.md'), readFileSync(path.join(ROOT, 'LANES.md')));
        mkdirSync(path.join(repo, 'lanes'));
        writeFileSync(path.join(repo, 'lanes/2026-10-19-older.md'), '## Older — 2026-10-19\n\nDONE.\n');
        git(repo, 'add', '-A'); assert.equal(git(repo, 'commit', '-qm', 'base').status, 0);
        for (const [branch, slug] of [['a', 'first-lane'], ['b', 'second-lane']]) {
            git(repo, 'checkout', '-qb', branch, 'main');
            writeFileSync(path.join(repo, `lanes/2026-10-20-${slug}.md`), `## ${slug} — 2026-10-20\n\nCLAIMED — owner ${branch}; paths: \`scripts/${slug}.mjs\`.\n`);
            git(repo, 'add', '-A'); assert.equal(git(repo, 'commit', '-qm', slug).status, 0);
        }
        git(repo, 'checkout', '-q', 'main');
        assert.equal(git(repo, 'merge', '-q', '--no-edit', 'a').status, 0);
        const second = git(repo, 'merge', '--no-edit', 'b');
        assert.equal(second.status, 0, `the second claim conflicted:\n${second.stdout}${second.stderr}`);
        assert.equal(git(repo, 'diff', '--name-only', 'HEAD~2', 'HEAD', '--', 'LANES.md').stdout, '', 'neither claim touched LANES.md');
        const claims = listClaims(repo).map(c => c.slug);
        assert.deepEqual(claims, ['older', 'first-lane', 'second-lane']);
        assert.deepEqual(lanesProblems(repo), []);
    } finally { rmSync(repo, {recursive: true, force: true}); }
});
