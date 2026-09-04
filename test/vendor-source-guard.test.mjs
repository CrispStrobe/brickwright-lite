// The vendor guard decides whether a --dir source may be synced into the
// overlay. It exists because a stale checkout once synced lite BACKWARD and
// deleted components. What it enforced, though, was EQUALITY with the origin
// default branch — and that refuses the ordinary case of a feature branch
// strictly ahead, which is how unreleased work is vendored at all.
//
// The refusal is not harmless: the escape hatch is --allow-stale, and it skips
// the check ENTIRELY. A guard that refuses safe syncs does not produce care, it
// produces a habit of passing the flag that also disables the real protection.
//
// Three cases, driven against real repositories rather than mocked, because
// the thing under test is git's ancestry answer and a mock would just be this
// file's opinion of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GUARD = path.resolve('scripts/lib-source-guard.mjs');

/**
 * AMBIENT-BINDING triage (gate-shapes): `git` is resolved from PATH here, three
 * times, and that is deliberate rather than an oversight.
 *
 * The subject under test IS git's ancestry answer -- whether `merge-base
 * --is-ancestor` says a source branch contains the default branch. A stub
 * would assert this file's opinion of git rather than git's behaviour, which
 * is precisely the failure the rule elsewhere calls "the test supplied the
 * precondition production does not".
 *
 * It FAILS CLOSED, which is what the rule actually protects. `execFileSync`
 * throws ENOENT when the binary is absent, `rig()` does not catch, so a box
 * without git turns every test in this file red rather than green. Verified
 * rather than assumed: a call to a nonexistent binary throws ENOENT.
 *
 * What this does NOT pin is git's VERSION, and `--is-ancestor` has been stable
 * since 1.8. Recorded as the known limit rather than left implied.
 */
/** An origin with one commit on `main`, plus a clone to mutate. */
function rig() {
    const root = mkdtempSync(path.join(tmpdir(), 'vguard-'));
    const origin = path.join(root, 'origin');
    const work = path.join(root, 'work');
    const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' }).toString();
    execFileSync('git', ['init', '-q', '-b', 'main', origin], { stdio: 'pipe' });
    git(origin, 'config', 'user.email', 't@t'); git(origin, 'config', 'user.name', 't');
    writeFileSync(path.join(origin, 'a.txt'), 'base\n');
    git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'base');
    execFileSync('git', ['clone', '-q', origin, work], { stdio: 'pipe' });
    git(work, 'config', 'user.email', 't@t'); git(work, 'config', 'user.name', 't');
    const commit = (dir, name, body) => {
        writeFileSync(path.join(dir, name), body);
        git(dir, 'add', '-A'); git(dir, 'commit', '-qm', name);
    };
    return { root, origin, work, git, commit };
}

/** Run the guard in-process against `dir`; return null if it allowed the sync. */
function verdict(dir) {
    const src =
        `import {guardSource} from ${JSON.stringify(GUARD)};\n` +
        `guardSource(${JSON.stringify(dir)}, []);\n` +
        `console.log('ALLOWED');\n`;
    try {
        return { ok: true, out: execFileSync(process.execPath, ['--input-type=module', '-e', src],
            { stdio: 'pipe' }).toString() };
    } catch (e) {
        return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
    }
}

test('a source EQUAL to the origin default is allowed', () => {
    const r = rig();
    try {
        assert.ok(verdict(r.work).ok, 'the case that always worked still works');
    } finally { rmSync(r.root, { recursive: true, force: true }); }
});

test('a source strictly AHEAD is allowed — this is the case equality refused', () => {
    const r = rig();
    try {
        r.commit(r.work, 'feature.txt', 'unreleased work\n');
        const v = verdict(r.work);
        assert.ok(v.ok,
            'a feature branch containing everything the default has can only move lite '
            + `FORWARD, so refusing it protects nothing. Guard said: ${v.out}`);
    } finally { rmSync(r.root, { recursive: true, force: true }); }
});

test('a source BEHIND is refused, and the message says behind', () => {
    const r = rig();
    try {
        // origin gains a commit the source does not have.
        r.commit(r.origin, 'newer.txt', 'component added later\n');
        r.git(r.work, 'fetch', '-q', 'origin');
        const v = verdict(r.work);
        assert.ok(!v.ok, 'this is the original incident: syncing would delete newer.txt');
        assert.match(v.out, /BEHIND/,
            'and it must say WHICH way, because behind and diverged need different fixes');
    } finally { rmSync(r.root, { recursive: true, force: true }); }
});

test('a source DIVERGED is refused and told to merge, not to pull', () => {
    const r = rig();
    try {
        r.commit(r.origin, 'theirs.txt', 'their work\n');
        r.commit(r.work, 'mine.txt', 'my work\n');   // both moved: neither is an ancestor
        r.git(r.work, 'fetch', '-q', 'origin');
        const v = verdict(r.work);
        assert.ok(!v.ok, 'diverged means the source is missing work, ahead or not');
        assert.match(v.out, /DIVERGED/);
        assert.match(v.out, /Merge the default branch/,
            'a diverged branch is not fixed by pulling into a dirty vendor sync — '
            + 'it is fixed by merging first, and the message should say the thing to do');
    } finally { rmSync(r.root, { recursive: true, force: true }); }
});
