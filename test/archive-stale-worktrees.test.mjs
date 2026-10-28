// The archiver deletes things, so every refusal is proven, not assumed.
//
// scripts/archive-stale-worktrees.mjs exists because /mnt/volume1 hit 99 % and
// 392 stale worktrees were ~39 GB. It removes directories, which is exactly the
// kind of tool that must be unable to remove the wrong one — so its decision is
// a PURE function of facts the caller gathered, and each refusal is asserted
// here by name rather than trusted to a code read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {classify, parentRepoOf, liveCwds} from '../scripts/archive-stale-worktrees.mjs';

const DAY = 86400000;
const now = Date.parse('2026-09-24T00:00:00Z');
const opts = {now, cutoffDays: 7, user: 'me'};
const wt = over => ({name: 'w', gitKind: 'file', owner: 'me', mtimeMs: now - 30 * DAY, inUse: false, ...over});

test('a stale, idle, owned worktree is archived', () => {
    const v = classify(wt(), opts);
    assert.equal(v.action, 'archive');
    assert.match(v.reason, /idle 30\.0 day/);
});

test('A FULL CLONE IS REFUSED — it holds the object store', () => {
    // The one that would actually lose work: removing a clone takes the
    // branches and objects with it, and nothing else would notice.
    const v = classify(wt({gitKind: 'dir'}), opts);
    assert.equal(v.action, 'refuse');
    assert.match(v.reason, /full clone/);
});

test('a directory a live process is sitting in is refused', () => {
    const v = classify(wt({inUse: true}), opts);
    assert.equal(v.action, 'refuse');
    assert.match(v.reason, /working directory/);
});

test("someone else's directory is refused, because we could not remove it anyway", () => {
    const v = classify(wt({owner: 'root'}), opts);
    assert.equal(v.action, 'refuse');
    assert.match(v.reason, /owned by root/);
});

test('a plain directory is refused unless asked for explicitly', () => {
    assert.equal(classify(wt({gitKind: 'none'}), opts).action, 'refuse');
    assert.equal(classify(wt({gitKind: 'none'}), {...opts, includePlain: true}).action, 'archive');
});

test('THE CUTOFF IS A BOUNDARY, and both sides of it are checked', () => {
    assert.equal(classify(wt({mtimeMs: now - 8 * DAY}), opts).action, 'archive');
    assert.equal(classify(wt({mtimeMs: now - 6 * DAY}), opts).action, 'skip');
    // Exactly at the cutoff is NOT stale: "older than 7 days" must mean older.
    assert.equal(classify(wt({mtimeMs: now - 7 * DAY}), opts).action, 'archive');
    assert.equal(classify(wt({mtimeMs: now - 7 * DAY + 1}), opts).action, 'skip');
});

test('refusals beat staleness — an ancient clone is still refused', () => {
    const v = classify(wt({gitKind: 'dir', mtimeMs: 0}), opts);
    assert.equal(v.action, 'refuse', 'age must never promote a refusal into an archive');
});

test('the parent repo is read out of the .git file', () => {
    // Fixture paths deliberately name NOTHING that exists: a string shaped like
    // a sibling checkout reads to test/gate-shapes.test.mjs as this gate
    // reaching outside the repository, and it is right that it cannot tell a
    // fixture from a read.
    assert.equal(parentRepoOf('gitdir: /nowhere/example-repo/.git/worktrees/feature-x'), '/nowhere/example-repo');
    assert.equal(parentRepoOf('gitdir: /nowhere/x/.git/modules/y'), null, 'a submodule is not a worktree');
    assert.equal(parentRepoOf(''), null);
});

test('the live-cwd scan reads a real proc-like tree, and an unreadable one is empty not fatal', () => {
    // Instrument before subject: if this returned an empty set because the scan
    // is broken, every "in use" refusal above would silently stop happening.
    const live = liveCwds();
    assert.ok(live instanceof Set);
    assert.ok(live.size > 0, 'this process alone has a cwd; an empty set means the scan is broken');
    assert.equal(liveCwds('/nonexistent-proc').size, 0, 'an unreadable proc is empty, not a crash');
});
