/**
 * A FILE SYNC NEVER MOVES THE PIN; A PIN MOVES ONLY WITH --pin (plan T9b).
 *
 * 2026-09-07, lego-be: `scripts/sync-bw-board.mjs --only <file> --dir <tip>`
 * silently rewrote vendor-pins.json to the tip — a stealth pin bump inside a
 * one-file sync commit, caught only by reading `git status` before committing.
 * Every other vendored file was still at the old pin, so the pin then lied
 * about all of them, and there was no flag to say "do not".
 *
 * Now: scripts/lib-pin.mjs refuses a pin move unless --pin is on the command
 * line, BEFORE any sync writes (each sync calls assertPinMoveAllowed as soon
 * as it knows its source sha) and again inside recordPin as the backstop.
 *
 * The list of syncs is DERIVED — every scripts/sync-*.mjs that calls
 * recordPin — never typed here. Today only sync-bw-board takes --only; the
 * others are whole-tree syncs, and the rule is the same for them: without
 * --pin, a source at a different sha is a refusal naming old and new.
 *
 * The live half runs each sync in a THROWAWAY git worktree of this repo (so a
 * refusal that came too late could not touch the tree we are in) against a
 * checkout named by BW_BOARD_DIR / SB3_CREATOR_DIR / BW_CIRCUIT_UI_DIR whose
 * HEAD is not the pin, and asserts vendor-pins.json is byte-identical
 * afterwards and the process refused by name. Unset → skipped by name.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assertPinMoveAllowed, recordPin, PinMoveRefused} from '../scripts/lib-pin.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const A = 'a'.repeat(40), B = 'b'.repeat(40);

// `git` from PATH is the AMBIENT-BINDING shape audit-gate-shapes flags, kept and
// DEFUSED the way i8086-bios-provenance does: the first thing the live half
// does with it is assert a 40-hex HEAD, so an absent or broken git fails by
// name instead of agreeing that nothing moved. The syncs under test shell out
// to git themselves; a test of them without git would be a test of nothing.
// gate-shapes-allow
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'});

// ---- the helper -------------------------------------------------------------

const tmpPins = pins => { const d = mkdtempSync(path.join(tmpdir(), 'pins-')); const f = path.join(d, 'vendor-pins.json'); writeFileSync(f, JSON.stringify(pins, null, 1) + '\n'); return f; };

test('an unchanged pin is nothing to decide; a moved pin without --pin is a refusal naming old and new; with --pin it moves', async () => {
    const f = tmpPins({'bw-board': A});
    assert.deepEqual(await assertPinMoveAllowed('bw-board', A, {pinsFile: f, explicit: false}), {moves: false, old: A});
    await assert.rejects(assertPinMoveAllowed('bw-board', B, {pinsFile: f, explicit: false, scoped: true}), err => {
        assert.ok(err instanceof PinMoveRefused);
        assert.match(err.message, /refusing to move the bw-board pin aaaaaaaaa -> bbbbbbbbb/);
        assert.match(err.message, /scoped --only run/);
        assert.match(err.message, /Nothing was written/);
        return true;
    });
    assert.deepEqual(await assertPinMoveAllowed('bw-board', B, {pinsFile: f, explicit: true}), {moves: true, old: A});
    assert.equal(JSON.parse(readFileSync(f, 'utf8'))['bw-board'], A, 'assert never writes');
});

test('recordPin is the backstop: it refuses the same move, keeps the file byte-identical, and records with --pin', async () => {
    const f = tmpPins({'bw-board': A, 'sb3-creator': B});
    const before = readFileSync(f, 'utf8');
    await assert.rejects(recordPin('bw-board', B, {pinsFile: f, explicit: false, log: () => {}}), /pin was NOT recorded/);
    assert.equal(readFileSync(f, 'utf8'), before, 'byte-identical after the refusal');
    await recordPin('bw-board', A, {pinsFile: f, explicit: false, log: () => {}});
    assert.equal(readFileSync(f, 'utf8'), before, 'the no-op path still writes nothing new');
    await recordPin('bw-board', B, {pinsFile: f, explicit: true, log: () => {}});
    assert.equal(JSON.parse(readFileSync(f, 'utf8'))['bw-board'], B);
});

// ---- the syncs, derived -----------------------------------------------------

const syncs = readdirSync(path.join(ROOT, 'scripts')).filter(f => /^sync-.*\.mjs$/.test(f))
    .filter(f => /\brecordPin\(/.test(readFileSync(path.join(ROOT, 'scripts', f), 'utf8')));

test('every sync that records a pin pre-checks the move before it writes, and says the rule where its usage lives', () => {
    assert.ok(syncs.length >= 4, `only ${syncs.length} pin-recording syncs found — the derivation stopped matching`);
    for (const f of syncs) {
        const text = readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
        const pre = text.indexOf('assertPinMoveAllowed(');
        const firstWrite = text.search(/\bawait writeFile\(|\bwriteFileSync\(/);
        assert.ok(pre > 0, `${f} never calls assertPinMoveAllowed — a moved pin would only be refused after the files were written`);
        assert.ok(firstWrite < 0 || pre < firstWrite, `${f} pre-checks the pin move at ${pre} but its first write is at ${firstWrite}`);
        assert.match(text, /A FILE SYNC NEVER MOVES THE\n\/\/\s+PIN; a pin moves only with --pin/, `${f}: the rule is not written in its usage header`);
    }
});

test('the tool that exists to move the pins passes --pin to every pin-recording sync it runs', t => {
    const fwd = readFileSync(path.join(ROOT, 'scripts', 'vendor-forward.mjs'), 'utf8');
    let ran = 0;
    for (const f of syncs) {
        const calls = [...fwd.matchAll(new RegExp(`node scripts/${f.replace('.', '\\.')}[^\`\\n]*`, 'g'))].map(m => m[0]);
        if (calls.length === 0) { t.diagnostic(`vendor-forward does not run ${f}; its pin moves only by hand, with --pin`); continue; }
        ran++;
        for (const c of calls) assert.match(c, /--pin\b/, `vendor-forward runs ${f} without --pin: ${c}`);
    }
    assert.ok(ran >= 4, `vendor-forward runs only ${ran} of the pin-recording syncs — the derivation or the tool changed`);
});

// ---- live: a scoped sync against a checkout at another sha leaves the pin alone --

const CHECKOUT = {'sync-bw-board.mjs': ['bw-board', 'BW_BOARD_DIR', '--only mna.js'], 'sync-sb3creator.mjs': ['sb3-creator', 'SB3_CREATOR_DIR', ''], 'sync-bw-circuit-ui.mjs': ['bw-circuit-ui', 'BW_CIRCUIT_UI_DIR', ''], 'sync-examples.mjs': ['sb3-creator', 'SB3_CREATOR_DIR', ''], 'sync-flasher.mjs': ['stc-compiler-flasher', 'STC_COMPILER_DIR', '']};

for (const f of syncs) {
    const [repo, envVar, scope] = CHECKOUT[f] || [null, null, ''];
    const dir = envVar && process.env[envVar];
    test(`${f}${scope ? ` ${scope}` : ''} --dir <checkout at another sha> refuses by name and leaves vendor-pins.json byte-identical`,
        {skip: !repo ? `${f} records a pin but this test does not know its checkout variable — add it` : !dir ? `${envVar} unset` : false}, () => {
            const head = git('-C', dir, 'rev-parse', 'HEAD').trim();
            assert.match(head, /^[0-9a-f]{40}$/, `${envVar}=${dir} is set, but git could not read a HEAD sha there — refusing to report on a checkout it never saw`);
            const pins = JSON.parse(readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));
            if (head === pins[repo]) { assert.ok(true, `${envVar} is AT the pin; nothing to refuse`); }
            // throwaway worktree: the sync's writes and any refusal land there, never here
            const wt = mkdtempSync(path.join(tmpdir(), 'pin-wt-'));
            git('-C', ROOT, 'worktree', 'add', '--detach', '-q', wt, 'HEAD');
            // the WORKING tree's scripts, not HEAD's: this test must judge the edit in hand
            for (const s of ['lib-pin.mjs', f]) writeFileSync(path.join(wt, 'scripts', s), readFileSync(path.join(ROOT, 'scripts', s)));
            let ahead = false;
            try { git('-C', dir, 'merge-base', '--is-ancestor', pins[repo], head); ahead = true; } catch { /* behind or divergent */ }
            try {
                const before = readFileSync(path.join(wt, 'vendor-pins.json'), 'utf8');
                const r = spawnSync(process.execPath, [`scripts/${f}`, ...scope.split(' ').filter(Boolean), '--dir', dir], {cwd: wt, encoding: 'utf8', timeout: 180000});
                assert.equal(readFileSync(path.join(wt, 'vendor-pins.json'), 'utf8'), before, `${f} moved the pin without --pin`);
                if (head !== pins[repo]) {
                    assert.notEqual(r.status, 0, `${f} exited 0 against a checkout at ${head.slice(0, 9)} (pin ${pins[repo].slice(0, 9)}) without --pin:\n${r.stdout}\n${r.stderr}`);
                    if (ahead) {
                        assert.match(r.stdout + r.stderr, new RegExp(`refusing to move the ${repo} pin ${pins[repo].slice(0, 9)} -> ${head.slice(0, 9)}`), r.stdout + r.stderr);
                        assert.match(r.stdout + r.stderr, /Nothing was written/);
                    } else {
                        // a checkout BEHIND or beside the pin is refused by the sync's own stale-source guard first; the pin still may not move
                        assert.match(r.stdout + r.stderr, /refusing|Refusing|BACKWARD|stale/i, r.stdout + r.stderr);
                    }
                    // everything but the two scripts this test copied in must be untouched
                    const dirty = git('-C', wt, 'status', '--porcelain', '--', '.', ':!scripts/lib-pin.mjs', `:!scripts/${f}`).trim();
                    assert.equal(dirty, '', `${f} wrote before refusing:\n${dirty}`);
                }
            } finally {
                git('-C', ROOT, 'worktree', 'remove', '--force', wt);
                rmSync(wt, {recursive: true, force: true});
            }
        });
}

// ---- T9b follow-up (root audit, 2026-09-07): the flasher sync's --dir path ---------
//
// `sync-flasher.mjs --dir` never derived `sha` (only the HTTP path did), so the
// pin preflight AND recordPin were skipped: a changed local checkout wrote
// flasher.js without --pin, and `--pin --dir` could not advance the pin. The
// live case above skipped whenever STC_COMPILER_DIR was unset, so nothing
// exercised it. These tests build their OWN fixture checkout, so they cannot
// skip, and they fire the two mutations the audit asked for: a checkout at a
// different sha with DIFFERENT content, and one at a different sha with EQUAL
// content (the pin would still move; nothing may be written either way).

const VENDORED_FLASHER = path.join(ROOT, 'overlay', 'scratch-gui', 'src', 'lib', 'flasher.js');
const stripBanner = text => text.split('\n').filter(l => !/^\/\/ (VENDORED from|Change it there)/.test(l)).join('\n');

/** A throwaway stc-compiler checkout whose docs/flash.js is `body`, committed, HEAD sha returned. */
function fixtureCheckout (body) {
    const dir = mkdtempSync(path.join(tmpdir(), 'stc-fixture-'));
    git('-C', dir, 'init', '-q');
    git('-C', dir, 'config', 'user.email', 'fixture@test');
    git('-C', dir, 'config', 'user.name', 'fixture');
    mkdirSync(path.join(dir, 'docs'), {recursive: true});
    writeFileSync(path.join(dir, 'docs', 'flash.js'), body);
    git('-C', dir, 'add', '-A');
    git('-C', dir, 'commit', '-q', '-m', 'fixture');
    return {dir, sha: git('-C', dir, 'rev-parse', 'HEAD').trim()};
}

/** Run scripts/sync-flasher.mjs (the WORKING tree's copy) in a throwaway worktree; return the result and the worktree's state. */
function runFlasherSync (args, {pins} = {}) {
    const wt = mkdtempSync(path.join(tmpdir(), 'pin-wt-'));
    git('-C', ROOT, 'worktree', 'add', '--detach', '-q', wt, 'HEAD');
    try {
        for (const s of ['lib-pin.mjs', 'sync-flasher.mjs']) writeFileSync(path.join(wt, 'scripts', s), readFileSync(path.join(ROOT, 'scripts', s)));
        if (pins) writeFileSync(path.join(wt, 'vendor-pins.json'), JSON.stringify(pins, null, 1) + '\n');
        const before = readFileSync(path.join(wt, 'vendor-pins.json'), 'utf8');
        const flasherBefore = readFileSync(path.join(wt, 'overlay', 'scratch-gui', 'src', 'lib', 'flasher.js'), 'utf8');
        const r = spawnSync(process.execPath, ['scripts/sync-flasher.mjs', ...args], {cwd: wt, encoding: 'utf8', timeout: 120000});
        return {
            status: r.status, out: r.stdout + r.stderr,
            pinsBefore: before, pinsAfter: readFileSync(path.join(wt, 'vendor-pins.json'), 'utf8'),
            flasherBefore, flasherAfter: readFileSync(path.join(wt, 'overlay', 'scratch-gui', 'src', 'lib', 'flasher.js'), 'utf8')
        };
    } finally {
        git('-C', ROOT, 'worktree', 'remove', '--force', wt);
        rmSync(wt, {recursive: true, force: true});
    }
}

const PINNED = 'f'.repeat(40);   // a recorded flasher pin that is NOT the fixture's sha

test('sync-flasher --dir derives the checkout sha: DIFFERENT content at another sha is refused by name, nothing written', () => {
    const body = stripBanner(readFileSync(VENDORED_FLASHER, 'utf8')) + '\n// fixture: a line upstream added\n';
    const {dir, sha} = fixtureCheckout(body);
    try {
        const r = runFlasherSync(['--dir', dir], {pins: {'stc-compiler-flasher': PINNED}});
        assert.notEqual(r.status, 0, `exited 0 without --pin against a checkout at ${sha.slice(0, 9)}:\n${r.out}`);
        assert.match(r.out, new RegExp(`refusing to move the stc-compiler-flasher pin ${PINNED.slice(0, 9)} -> ${sha.slice(0, 9)}`), r.out);
        assert.match(r.out, /Nothing was written/, r.out);
        assert.equal(r.pinsAfter, r.pinsBefore, 'the pin moved without --pin');
        assert.equal(r.flasherAfter, r.flasherBefore, 'flasher.js was written before the refusal');
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('sync-flasher --dir --pin advances the pin to the checkout sha and writes the file', () => {
    const body = stripBanner(readFileSync(VENDORED_FLASHER, 'utf8')) + '\n// fixture: a line upstream added\n';
    const {dir, sha} = fixtureCheckout(body);
    try {
        const r = runFlasherSync(['--dir', dir, '--pin'], {pins: {'stc-compiler-flasher': PINNED}});
        assert.equal(r.status, 0, r.out);
        assert.equal(JSON.parse(r.pinsAfter)['stc-compiler-flasher'], sha, `--pin --dir did not record the checkout sha:\n${r.out}`);
        assert.match(r.flasherAfter, /fixture: a line upstream added/, 'the file was not written');
        assert.match(r.flasherAfter, /^\/\/ VENDORED from CrispStrobe\/stc-compiler/, 'the banner is missing');
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('mutation: EQUAL content at a different sha still refuses the pin move without --pin (a pin is a claim about a sha, not a byte set)', () => {
    const body = stripBanner(readFileSync(VENDORED_FLASHER, 'utf8'));
    const {dir, sha} = fixtureCheckout(body);
    try {
        const r = runFlasherSync(['--dir', dir], {pins: {'stc-compiler-flasher': PINNED}});
        assert.notEqual(r.status, 0, `equal content hid a pin move ${PINNED.slice(0, 9)} -> ${sha.slice(0, 9)}:\n${r.out}`);
        assert.match(r.out, /refusing to move the stc-compiler-flasher pin/, r.out);
        assert.equal(r.pinsAfter, r.pinsBefore);
        assert.equal(r.flasherAfter, r.flasherBefore);
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('an ABSENT pin fails closed: recording the first pin is a pin move and needs --pin', async () => {
    const f = tmpPins({});
    await assert.rejects(() => assertPinMoveAllowed('fresh', A, {pinsFile: f, explicit: false}),
        e => e instanceof PinMoveRefused && /refusing to record a first fresh pin/.test(e.message) && /Nothing was written/.test(e.message));
    await assert.rejects(() => recordPin('fresh', A, {pinsFile: f, explicit: false, log: () => {}}), PinMoveRefused);
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), {}, 'a refused first record wrote the pin anyway');
    assert.deepEqual(await assertPinMoveAllowed('fresh', A, {pinsFile: f, explicit: true}), {moves: true, old: undefined});
    assert.equal(await recordPin('fresh', A, {pinsFile: f, explicit: true, log: () => {}}), A);
    assert.equal(JSON.parse(readFileSync(f, 'utf8')).fresh, A);
});

test('sync-flasher --dir against a tree with NO flasher pin refuses to create one without --pin', () => {
    const body = stripBanner(readFileSync(VENDORED_FLASHER, 'utf8')) + '\n// fixture\n';
    const {dir, sha} = fixtureCheckout(body);
    try {
        const pins = JSON.parse(readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));
        delete pins['stc-compiler-flasher'];
        const r = runFlasherSync(['--dir', dir], {pins});
        assert.notEqual(r.status, 0, `created a first pin silently (${sha.slice(0, 9)}):\n${r.out}`);
        assert.match(r.out, /refusing to record a first stc-compiler-flasher pin/, r.out);
        assert.equal(r.pinsAfter, r.pinsBefore);
        assert.equal(r.flasherAfter, r.flasherBefore);
    } finally { rmSync(dir, {recursive: true, force: true}); }
});
