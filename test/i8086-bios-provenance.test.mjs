// The 8086 BIOS is 64K of committed binary. This is what keeps it honest.
//
// WHY THIS EXISTS. `overlay/scratch-gui/static/roms/i8086-bios.bin` is fetched
// by debug-runner.js at runtime and is the difference between an 8086 that
// boots and one that executes open bus. It is not diffable, so review cannot
// see a change to it. It is not touched by sync-bw-board.mjs, because that
// script copies `src/` and the ROM's source is bw-board's `rom/bios.asm`, so
// the pin could move under the ROM for weeks with every gate green. Until
// 2026-09-06 nothing in this repo recorded where the file came from.
//
// It came from bw-board 5584c3f, the FIRST BIOS commit, seven bios.asm commits
// before the pinned sha -- which is to say lite ships a BIOS from before the
// uPD765 floppy stack and the CGA graphics modes existed. That is a real gap
// and it is NOT what this file asserts against: the ROM being OLDER than the
// pin is a decision somebody has to make deliberately, and a red gate on main
// is not how you ask for that decision. What this file makes impossible is the
// ROM being older than the pin WITHOUT ANYONE KNOWING, and the ROM getting
// ahead of the pin at all.
//
// WHAT WOULD MAKE THIS A GATE THAT CANNOT FAIL, and is therefore guarded:
//   - a missing manifest reading as "nothing to check" (it fails instead)
//   - a manifest that parses but describes a different file (sha256 is compared
//     against bytes actually read from disk, not against itself)
//   - trusting `ancestorOfPinAtBuild` forever (pinAtBuild is compared with the
//     LIVE pin, so the recorded answer expires the moment its question changes)
//   - the staleness silently growing on a re-record (BEHIND_PIN_BY is pinned here)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const ROM = join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.bin');
const MANIFEST = join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.provenance.json');
const ASSEMBLER = join(repo, 'overlay/scratch-gui/src/lib/bw-board/i8086-asm.js');
const PINS = join(repo, 'vendor-pins.json');

// The ROM is behind the pin by this many bios.asm commits. It is asserted
// EXACTLY, not as "some number >= 0", because the failure it catches is somebody
// re-running --record after the pin moved: pinAtBuild would be updated, ancestry
// would still hold, and the gap would have grown with nothing to show for it.
//
// It was 7 for one day. The ROM landed on 2026-09-04 built from bw-board 5584c3f,
// the first BIOS commit, and by the time anything measured it the pin had moved
// seven bios.asm commits further on -- the whole uPD765 floppy stack and CGA
// graphics modes 4/5/6. It is 0 now because the pin move rebuilt it, which is the
// number this constant should read whenever a pin move has been finished rather
// than merely done.
const BEHIND_PIN_BY = 0;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

test('the 8086 BIOS carries a provenance manifest at all', () => {
    assert.ok(existsSync(ROM), `${ROM} is missing`);
    assert.ok(existsSync(MANIFEST),
        'overlay/scratch-gui/static/roms/i8086-bios.provenance.json is missing.\n'
        + 'A 64K binary with no recorded origin is the state this gate exists to end. '
        + 'Write it with: node scripts/sync-i8086-bios.mjs --dir <bw-board> --record');
});

test('the committed ROM is the file the manifest describes', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const bytes = readFileSync(ROM);
    // Read from disk on both sides. A manifest checked against itself is the
    // shape of check that passed for three weeks in this repo's history.
    assert.match(m.sha256, /^[0-9a-f]{64}$/, 'manifest sha256 is not a sha256');
    assert.equal(sha256(bytes), m.sha256,
        'the committed i8086-bios.bin is NOT the binary the manifest describes.\n'
        + 'Either the ROM was replaced without re-recording provenance, or the manifest '
        + 'was hand-edited. Re-run scripts/sync-i8086-bios.mjs --record and read what it says '
        + 'about where the current bytes came from.');
    assert.equal(bytes.length, m.bytes);
    assert.equal(bytes.length, 0x10000,
        'the ROM must be exactly 64K: it is loaded at 0x100000 - length so that the reset '
        + 'vector at FFFF0h lands inside it. A different size loads at the wrong address '
        + 'and executes open bus, which on screen is a machine that never started.');
});

test('the manifest names the assembler that is actually vendored here', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    assert.equal(m.assembler.path, 'overlay/scratch-gui/src/lib/bw-board/i8086-asm.js');
    assert.equal(sha256(readFileSync(ASSEMBLER)), m.assembler.sha256,
        'the vendored i8086 assembler has changed since the ROM was recorded.\n'
        + 'The ROM is that assembler\'s output. A new assembler may assemble the same source '
        + 'to different bytes, so the shipped binary is no longer known to be what this tree '
        + 'would produce. Re-run scripts/sync-i8086-bios.mjs --dir <bw-board> to see whether '
        + 'the output actually moved.');
});

test('the pin has not moved out from under the ROM', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const pins = JSON.parse(readFileSync(PINS, 'utf8'));
    assert.match(m.pinAtBuild, /^[0-9a-f]{40}$/);
    assert.equal(m.pinAtBuild, pins['bw-board'],
        'vendor-pins.json now pins bw-board to a different sha than the one this ROM\'s '
        + 'provenance was checked against.\n'
        + 'The manifest\'s `ancestorOfPinAtBuild` was an answer about the OLD pin and says '
        + 'nothing about the new one. This is the exact silence the manifest exists to break: '
        + 'a pin move that leaves a stale binary behind, with every other gate green. '
        + 'Re-run scripts/sync-i8086-bios.mjs --dir <bw-board> --record, and read the list of '
        + 'bios.asm commits it prints before deciding not to rebuild.');
});

test('the ROM is not NEWER than the pin, and its staleness is stated out loud', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    assert.equal(m.ancestorOfPinAtBuild, true,
        'the ROM was built from a bw-board commit that is not an ancestor of the pinned sha. '
        + 'The shipped binary is ahead of, or off to the side of, what this repo says it '
        + 'vendors -- code nobody reviewed as part of a pin move.');
    assert.equal(m.behindPinBy, BEHIND_PIN_BY,
        `the ROM's distance behind the pin changed from ${BEHIND_PIN_BY} to ${m.behindPinBy}.\n`
        + 'That number is pinned in this test on purpose. If it GREW, somebody re-recorded '
        + 'provenance after a pin move instead of rebuilding, and the gap got bigger in silence. '
        + 'If it SHRANK to 0, the ROM was rebuilt at the pin -- good, and this constant moves '
        + 'to 0 in the same commit as the new binary.');
});

test('the ancestry claim is re-checked live when a bw-board checkout is available', {
    skip: process.env.BW_BOARD_DIR ? false : 'set BW_BOARD_DIR to re-verify against real history'
}, () => {
    const dir = process.env.BW_BOARD_DIR;
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    // `git` is resolved from PATH, which audit-gate-shapes flags as AMBIENT-BINDING
    // and is right to: a gate that shells out to a tool the build does not ship can
    // stop biting the moment the tool is missing. The shape is kept because the
    // alternative -- not re-checking the manifest's ancestry claim against real
    // history at all -- is worse, and it is DEFUSED rather than excused: the next
    // line proves git actually ran before anything is asserted, so an absent or
    // broken git fails this test instead of quietly agreeing with the manifest.
    // gate-shapes-allow
    const git = (...a) => execFileSync('git', ['-C', dir, ...a], {encoding: 'utf8'}).trim();
    assert.match(git('rev-parse', 'HEAD'), /^[0-9a-f]{40}$/,
        `BW_BOARD_DIR=${dir} is set, so this check is meant to run, but git could not read a `
        + 'HEAD sha there. Refusing to report a green ancestry check that never reached history.');
    let ancestor = true;
    try { git('merge-base', '--is-ancestor', m.source.sha, m.pinAtBuild); } catch { ancestor = false; }
    assert.equal(ancestor, true, `${m.source.sha} is not an ancestor of ${m.pinAtBuild} in ${dir}`);
    const behind = git('log', '--format=%H', `${m.source.sha}..${m.pinAtBuild}`, '--', 'rom/bios.asm')
        .split('\n').filter(Boolean).length;
    assert.equal(behind, m.behindPinBy,
        `real history says ${behind} bios.asm commits between the ROM's source and the pin; `
        + `the manifest says ${m.behindPinBy}. The recorded number is wrong.`);
});
