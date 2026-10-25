/**
 * THE THREE-WAY BASE IS A QUESTION ABOUT A FILE, NOT ABOUT THE SET.
 *
 * `vendor-pins.json` records one sha per upstream repo. A scoped sync
 * (`--only`) moves a SUBSET of the vendored files. So after a scoped bump the
 * pin claims a sha that most vendored files are not at, and a base read as
 * `git show <pin>:<file>` is the wrong version for every one of them: upstream's
 * own edits read as lite-only work about to be deleted, and the sync refuses
 * everything it is asked to do.
 *
 * brickwright-lite-ea hit exactly that. The owner advanced the pin for one
 * rp2040 file, and the remaining twenty-two could not be synced without first
 * hand-editing the pin backwards — which is the hand edit the ordering guard
 * exists to prevent. The guard was right about the state; the state should not
 * have been reachable.
 *
 * `baseForFile` asks the file's own question: walking back from the sha being
 * synced, along that file's history, the newest commit whose blob IS the
 * vendored copy is the commit that copy came from — whatever the pin says.
 *
 * Every test here builds a REAL git repository in a temp dir. A fixture that
 * stubbed `git` would prove the mock agrees with itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { baseForFile } from '../scripts/lib-pin.mjs';

const run = promisify(execFile);

/** A two-commit upstream: v1 then v2 of one file. */
async function upstream() {
    const dir = await mkdtemp(join(tmpdir(), 'bw-pinbase-'));
    const git = (...a) => run('git', ['-C', dir, ...a]);
    await git('init', '-q', '-b', 'main');
    await git('config', 'user.email', 'test@example.invalid');
    await git('config', 'user.name', 'test');
    await git('config', 'commit.gpgsign', 'false');

    const v1 = 'export const a = 1;\nexport const shared = 2;\n';
    await writeFile(join(dir, 'thing.js'), v1);
    await git('add', 'thing.js');
    await git('commit', '-qm', 'v1');
    const { stdout: older } = await git('rev-parse', 'HEAD');

    const v2 = 'export const a = 1;\nexport const shared = 2;\nexport const b = 3;\n';
    await writeFile(join(dir, 'thing.js'), v2);
    await git('add', 'thing.js');
    await git('commit', '-qm', 'v2');
    const { stdout: newer } = await git('rev-parse', 'HEAD');

    return { dir, v1, v2, older: older.trim(), newer: newer.trim() };
}

test('a vendored copy at the OLDER commit finds its base while the pin is at the NEWER', async () => {
    // The mixed tree, which is the whole defect. The pin has moved ahead for
    // an unrelated scoped sync; this file is still at the previous sha. Read
    // through the pin, its base would be the incoming file. Read by content,
    // its base is the commit it actually came from.
    const u = await upstream();
    try {
        const found = await baseForFile(u.dir, u.newer, 'thing.js', u.v1);
        assert.ok(found, 'no base found for a copy that is verbatim an upstream commit');
        assert.equal(found.sha, u.older,
            'the base must be the commit whose blob IS this copy, not the pin');
        assert.equal(found.text, u.v1);
    } finally { await rm(u.dir, { recursive: true, force: true }); }
});

test('the base is found from the newer sha even though the pin was never consulted', async () => {
    // The point stated as a property: the answer does not depend on
    // vendor-pins.json at all. Nothing in this call has seen the pin file.
    const u = await upstream();
    try {
        const fromNewer = await baseForFile(u.dir, u.newer, 'thing.js', u.v1);
        const fromOlder = await baseForFile(u.dir, u.older, 'thing.js', u.v1);
        assert.equal(fromNewer.sha, fromOlder.sha,
            'walking from either sha reaches the same commit, because the question '
            + 'is about the file and not about where the walk started');
    } finally { await rm(u.dir, { recursive: true, force: true }); }
});

test('a copy carrying lite-only edits matches no upstream blob, and says null', async () => {
    // The honest answer, and the case where the ordering guard still applies.
    // Inventing a base here would be worse than having none: it would silently
    // treat forward-ported work as though upstream had written it.
    const u = await upstream();
    try {
        const edited = u.v1 + 'export const liteOnly = 4;\n';
        assert.equal(await baseForFile(u.dir, u.newer, 'thing.js', edited), null);
    } finally { await rm(u.dir, { recursive: true, force: true }); }
});

test('the current upstream version is its own base', async () => {
    const u = await upstream();
    try {
        const found = await baseForFile(u.dir, u.newer, 'thing.js', u.v2);
        assert.equal(found.sha, u.newer);
    } finally { await rm(u.dir, { recursive: true, force: true }); }
});

test('a base that exists means the sync loses nothing, which is why this matters', async () => {
    // The consequence, asserted rather than argued. `linesLostBy` is the rule
    // the sync refuses on: liteOnly = lines in current that are not in base.
    // With a content base, base IS current, so that set is empty and the file
    // syncs with no --force and no hand-edited pin. Through the moved pin the
    // base would be v2 and v1's absent lines would read as losses.
    const u = await upstream();
    try {
        const norm = t => t.split('\n').map(l => l.trim());
        const linesLostBy = (current, next, base) => {
            const trivial = l => !l || l === '}' || l === '};' || l === '{';
            const incoming = new Set(norm(next));
            const liteOnly = base === null
                ? norm(current)
                : (() => { const b = new Set(norm(base)); return norm(current).filter(l => !b.has(l)); })();
            return liteOnly.filter(l => !trivial(l) && !incoming.has(l));
        };
        const found = await baseForFile(u.dir, u.newer, 'thing.js', u.v1);
        assert.deepEqual(linesLostBy(u.v1, u.v2, found.text), [],
            'a pristine vendored copy has no lite-only lines to lose, so the sync writes');

        // And the two-way fallback, which is what a null base gets: conservative,
        // never silently permissive.
        const edited = u.v1 + 'export const liteOnly = 4;\n';
        assert.deepEqual(linesLostBy(edited, u.v2, null),
            ['export const liteOnly = 4;'],
            'with no base the rule keeps its conservative reading and names the line');
    } finally { await rm(u.dir, { recursive: true, force: true }); }
});

test('a file with no history at that sha, and a missing checkout, return null rather than throwing', async () => {
    // A sync must not die because a file is new upstream or the dir is remote.
    const u = await upstream();
    try {
        assert.equal(await baseForFile(u.dir, u.newer, 'no-such-file.js', 'x'), null);
        assert.equal(await baseForFile(null, u.newer, 'thing.js', u.v1), null);
        assert.equal(await baseForFile(u.dir, null, 'thing.js', u.v1), null);
        assert.equal(await baseForFile(u.dir, u.newer, 'thing.js', null), null);
    } finally { await rm(u.dir, { recursive: true, force: true }); }
});

test('the walk is bounded, and the bound is not silent about what it did not reach', async () => {
    // maxWalk exists so a file with thousands of commits cannot make a sync
    // hang. A bound that quietly returns "no base" would turn into a refusal
    // the caller reads as a lite-only edit -- so the test pins the behaviour
    // rather than leaving it to be discovered.
    const u = await upstream();
    try {
        assert.equal(await baseForFile(u.dir, u.newer, 'thing.js', u.v1, { maxWalk: 1 }), null,
            'v1 is two commits back; a one-commit walk cannot see it and must not pretend to');
        assert.ok(await baseForFile(u.dir, u.newer, 'thing.js', u.v1, { maxWalk: 2 }),
            'and two is enough');
    } finally { await rm(u.dir, { recursive: true, force: true }); }
});
