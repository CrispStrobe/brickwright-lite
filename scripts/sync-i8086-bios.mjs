#!/usr/bin/env node
// Give overlay/scratch-gui/static/roms/i8086-bios.bin a provenance route.
//
// THE STATE THIS REPLACES
// -----------------------
// The 8086 BIOS is 64K of committed binary that debug-runner.js fetches at
// runtime. Nothing in this repo said where it came from. vendor-pins.json
// pins bw-board to a sha, and the ROM is not a file the sync touches --
// sync-bw-board.mjs copies `src/` and the ROM's source is `rom/bios.asm` --
// so the pin could move under the ROM, for weeks, and every gate stayed green.
// The binary is not diffable, so review could not see it either. A 64K opaque
// blob with no recorded origin is the one artefact in the tree where "it has
// always been like that" is indistinguishable from "somebody replaced it".
//
// Measured 2026-09-06, which is why this exists: the committed ROM assembles
// from `rom/bios.asm` at bw-board 5584c3f -- the FIRST BIOS commit. Seven
// further commits to bios.asm have landed since, all of them already inside
// the pinned sha, including the entire uPD765 floppy stack and CGA graphics
// modes 4/5/6. Lite ships a BIOS from before the floppy existed. That was not
// a decision anyone recorded; it is what happens when a built artefact has no
// route.
//
// WHY IT ASSEMBLES WITH LITE'S OWN ASSEMBLER
// ------------------------------------------
// There is no external assembler in this chain. bw-board's ROM is built by
// `src/i8086-asm.js`, its own MASM-subset assembler, and lite VENDORS that
// file at overlay/scratch-gui/src/lib/bw-board/i8086-asm.js -- byte-identical
// to bw-board at the pin and at master, checked. So this script assembles with
// lite's copy, not bw-board's.
//
// That is the stronger invariant and it is the point. The ROM lite ships is
// then provably the output of the assembler lite ships, from a named source
// sha. If the vendored assembler is ever re-synced and its output moves, the
// gate goes red and names the ROM -- which the alternative (shelling out to
// bw-board's scripts/build-bios.mjs) could never do, because it would be
// asserting a different program's output about our file.
//
// It also means the only thing needed from a bw-board checkout is `rom/bios.asm`.
//
// USAGE
//   node scripts/sync-i8086-bios.mjs --dir <bw-board>              # check
//   node scripts/sync-i8086-bios.mjs --dir <bw-board> --identify   # which sha built the committed ROM
//   node scripts/sync-i8086-bios.mjs --dir <bw-board> --record     # manifest for the CURRENT rom, no rebuild
//   node scripts/sync-i8086-bios.mjs --dir <bw-board> --write      # rebuild the ROM and the manifest
//
// --record is the mode that does not change a byte of the ROM. It identifies
// where the committed binary actually came from, VERIFIES that by assembling
// there and comparing, and writes the manifest. A manifest is never written on
// trust: if no reachable commit reproduces the committed bytes, it refuses and
// says so, because "we do not know where this came from" is a finding and not
// a thing to paper over with a plausible sha.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

export const ASSEMBLER = join(repo, 'overlay/scratch-gui/src/lib/bw-board/i8086-asm.js');
export const ROM = join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.bin');
export const MANIFEST = join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.provenance.json');
export const PINS = join(repo, 'vendor-pins.json');
export const SOURCE_IN_BW_BOARD = 'rom/bios.asm';

// The ROM occupies the whole F000 segment: F0000h-FFFFFh. Not a size chosen
// for comfort -- the reset fetch is at FFFF0h and the image has to reach it.
export const ROM_SEG = 0xf000;
export const ROM_SIZE = 0x10000;
export const RESET_OFFSET = 0xfff0;   // FFFF0h - F0000h
const JMP_FAR = 0xea;

const hex = (n, w = 4) => n.toString(16).toUpperCase().padStart(w, '0') + 'h';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** A refusal that names what is missing. Never a stack trace at the user. */
class Refusal extends Error {
    constructor (message) { super(message); this.name = 'Refusal'; }
}

const git = (dir, args) =>
    execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

/**
 * Everything assembling cannot check, ported from bw-board's build-bios.mjs
 * with its reasoning intact.
 *
 * If the image is not exactly 64K, or the bytes at FFF0h are not a far jump
 * into this ROM's own segment, the machine executes whatever is there --
 * usually 00h, `ADD [BX+SI],AL`, over and over, in silence. A builder that
 * skips this hands you a file that looks fine and a machine that does nothing,
 * and the distance between those two facts is the whole debugging session.
 */
export function verifyRom (bytes, symbols) {
    if (bytes.length !== ROM_SIZE) {
        throw new Refusal(`the image is ${bytes.length} bytes and must be exactly ${ROM_SIZE} `
            + '(the F000 segment). The source pads to the reset vector with ORG; if that ORG '
            + 'moved, this is what it broke.');
    }
    const op = bytes[RESET_OFFSET];
    if (op !== JMP_FAR) {
        throw new Refusal(`offset ${hex(RESET_OFFSET)} holds ${hex(op, 2)} where the reset `
            + `vector's far jump (${hex(JMP_FAR, 2)}) must be. The 8086 fetches its first `
            + 'instruction from FFFF0h and executes whatever is there.');
    }
    const entry = bytes[RESET_OFFSET + 1] | (bytes[RESET_OFFSET + 2] << 8);
    const segment = bytes[RESET_OFFSET + 3] | (bytes[RESET_OFFSET + 4] << 8);
    if (segment !== ROM_SEG) {
        throw new Refusal(`the reset vector jumps to segment ${hex(segment)}, not ${hex(ROM_SEG)}. `
            + 'Only F000 is this ROM; any other segment is RAM that has never been written.');
    }
    // "Inside the image" would pass a vector aimed at the middle of a string.
    const post = symbols.get('post');
    if (!post || typeof post.value !== 'number') {
        throw new Refusal('the source defines no `post` label, so there is no entry point to verify against');
    }
    if (entry !== post.value) {
        throw new Refusal(`the reset vector enters at ${hex(entry)} but POST is at ${hex(post.value)}. `
            + 'The far jump is hand-encoded; its offset word and the label have drifted apart.');
    }
    // POST sets up the interrupt vector table. Taking an interrupt while that
    // table is half-written jumps through a vector one word new and one word old.
    if (bytes[post.value] !== 0xfa) {
        throw new Refusal(`POST at ${hex(post.value)} does not begin with CLI (FAh) but with `
            + `${hex(bytes[post.value], 2)}. Interrupts must be off until the vector table exists.`);
    }
    return {entry, segment};
}

/** Assemble one bios.asm source with LITE's vendored assembler. */
export async function assembleBios (source) {
    if (!existsSync(ASSEMBLER)) {
        throw new Refusal(`the assembler is not here: ${ASSEMBLER}\n`
            + 'This ROM is built by bw-board\'s own MASM-subset assembler, which lite vendors. '
            + 'Without it there is nothing to build with, and shelling out to bw-board\'s copy '
            + 'would assert a different program\'s output about our file. Restore the vendored '
            + 'assembler (scripts/sync-bw-board.mjs) and re-run.');
    }
    const {assemble} = await import(`file://${ASSEMBLER}`);
    // 'com', not 'auto': a flat image at a chosen ORG is exactly what a ROM is,
    // and inferring the format would produce an MZ header the moment somebody
    // added a .MODEL line.
    const r = assemble(source, {format: 'com'});
    if (r.org !== 0) {
        throw new Refusal(`the image starts at ORG ${hex(r.org)} and must start at 0. `
            + "A BIOS's offsets ARE its segment's offsets: F000:0000 is the first byte.");
    }
    const {entry, segment} = verifyRom(r.bytes, r.symbols);
    return {bytes: Buffer.from(r.bytes), entry, segment, passes: r.passes, warnings: r.warnings};
}

/** Read bios.asm out of a bw-board checkout at a given sha (or its worktree). */
function readSourceAt (dir, sha) {
    if (sha === null) return readFileSync(join(dir, SOURCE_IN_BW_BOARD), 'utf8');
    return execFileSync('git', ['-C', dir, 'show', `${sha}:${SOURCE_IN_BW_BOARD}`],
        {encoding: 'utf8', maxBuffer: 64 << 20});
}

/**
 * Which commit's bios.asm reproduces `want`?
 *
 * Walks the commits that touched bios.asm, newest first, assembling each. The
 * search is bounded by that list (eight commits as of 2026-09-06), not by
 * history. Returns null rather than a guess: an unidentified ROM is a finding.
 */
async function identify (dir, want, {log = console.log} = {}) {
    const commits = git(dir, ['log', '--format=%H', '--all', '--', SOURCE_IN_BW_BOARD])
        .split('\n').filter(Boolean);
    if (!commits.length) {
        throw new Refusal(`no commit in ${dir} touches ${SOURCE_IN_BW_BOARD}. `
            + 'Either this is not a bw-board checkout, or it is a shallow clone whose '
            + 'history does not reach the ROM source.');
    }
    log(`  searching ${commits.length} commit${commits.length > 1 ? 's' : ''} that touched ${SOURCE_IN_BW_BOARD}`);
    for (const sha of commits) {
        let built;
        try {
            built = await assembleBios(readSourceAt(dir, sha));
        } catch {
            continue;   // a source that does not assemble cannot be the one that did
        }
        if (sha256(built.bytes) === want) return {sha, built};
    }
    return null;
}

const usage = `usage: node scripts/sync-i8086-bios.mjs --dir <bw-board> [--identify|--record|--write]

  (no mode)   assemble bios.asm at the checkout's HEAD and compare with the
              committed ROM. Writes nothing. Exit 1 if they differ.
  --identify  find which bw-board commit's bios.asm reproduces the committed
              ROM. Writes nothing.
  --record    write the manifest for the CURRENT committed ROM, identifying and
              verifying its source first. Does NOT touch the ROM.
  --write     rebuild the ROM from the checkout's HEAD and write both.
`;

async function main (argv) {
    // --src is REJECTED, not ignored. sync-bw-board.mjs accepts --src silently,
    // ignores it, and fetches from the remote instead; a run that looked local
    // was not, and the summary printed a sha rather than a path. That cost a
    // measurement on 2026-09-06. An unknown flag here is an error.
    let dir = null, mode = 'check';
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dir') dir = argv[++i];
        else if (a === '--identify' || a === '--record' || a === '--write') mode = a.slice(2);
        else if (a === '--help' || a === '-h') { console.log(usage); return 0; }
        else if (a === '--src') {
            throw new Refusal('--src is not a flag here. You mean --dir. '
                + '(sync-bw-board.mjs accepts --src and ignores it in silence, which is how a '
                + 'run that looked local turned out to have gone to the remote. Not repeating that.)');
        } else throw new Refusal(`unknown argument ${a}\n\n${usage}`);
    }
    if (!dir) throw new Refusal(`--dir <bw-board checkout> is required.\n\n${usage}`);
    dir = resolve(dir);
    if (!existsSync(join(dir, SOURCE_IN_BW_BOARD))) {
        throw new Refusal(`${join(dir, SOURCE_IN_BW_BOARD)} does not exist. `
            + `--dir must name a bw-board checkout; ${dir} does not look like one.`);
    }
    try { git(dir, ['rev-parse', '--git-dir']); } catch {
        throw new Refusal(`${dir} is not a git checkout, so there is no sha to record. `
            + 'A manifest whose source sha is unknown records nothing.');
    }

    if (!existsSync(ROM)) throw new Refusal(`the ROM is not here: ${ROM}`);
    const committed = readFileSync(ROM);
    const committedSha = sha256(committed);
    const assemblerSha = sha256(readFileSync(ASSEMBLER));
    const pins = JSON.parse(readFileSync(PINS, 'utf8'));
    const pin = pins['bw-board'];
    const headSha = git(dir, ['rev-parse', 'HEAD']);

    console.log('8086 BIOS provenance');
    console.log(`  rom        ${ROM}`);
    console.log(`  sha256     ${committedSha}`);
    console.log(`  assembler  ${ASSEMBLER}`);
    console.log(`  bw-board   ${dir} @ ${headSha.slice(0, 7)}`);
    console.log(`  pin        ${pin.slice(0, 7)} (vendor-pins.json)`);

    if (mode === 'check' || mode === 'write') {
        const built = await assembleBios(readSourceAt(dir, null));
        const builtSha = sha256(built.bytes);
        console.log(`  built      ${builtSha}  from the working tree at ${SOURCE_IN_BW_BOARD}`);
        console.log(`  reset      FFFF:0000 -> ${hex(built.segment)}:${hex(built.entry)}  (jmp far, verified)`);
        if (mode === 'check') {
            if (builtSha === committedSha) { console.log('\nthe committed ROM is this source. Nothing to do.'); return 0; }
            console.error('\nthe committed ROM is NOT what this source assembles to.');
            console.error('  --identify says where the committed one came from; --write replaces it.');
            return 1;
        }
        writeFileSync(ROM, built.bytes);
        writeManifest({sourceSha: headSha, romSha: builtSha, bytes: built.bytes.length,
            entry: built.entry, segment: built.segment, assemblerSha, pin, dir});
        console.log('\nROM and manifest written.');
        return 0;
    }

    const found = await identify(dir, committedSha);
    if (!found) {
        console.error(`\nNo commit reachable in ${dir} has a ${SOURCE_IN_BW_BOARD} that assembles`);
        console.error(`to the committed ROM (${committedSha.slice(0, 16)}...).`);
        console.error('Refusing to write a manifest. An unidentified 64K binary in the tree is');
        console.error('the finding, and a plausible-looking sha in a manifest would hide it.');
        return 1;
    }
    const behind = git(dir, ['log', '--format=%H', `${found.sha}..${pin}`, '--', SOURCE_IN_BW_BOARD])
        .split('\n').filter(Boolean);
    let ancestor = false;
    try { git(dir, ['merge-base', '--is-ancestor', found.sha, pin]); ancestor = true; } catch { /* not an ancestor */ }

    console.log(`  source     ${found.sha}  (${git(dir, ['log', '-1', '--format=%ad %s', '--date=short', found.sha])})`);
    console.log(`  ancestor of the pin? ${ancestor ? 'yes' : 'NO'}`);
    console.log(`  bios.asm commits between it and the pin: ${behind.length}`);
    for (const c of behind) console.log(`    ${git(dir, ['log', '-1', '--format=%h %ad %s', '--date=short', c])}`);

    if (!ancestor) {
        console.error('\nThe ROM was built from a commit that is NOT an ancestor of the pin.');
        console.error('That means the shipped binary is ahead of, or off to the side of, what');
        console.error('vendor-pins.json says this repo vendors. Refusing to record it as normal.');
        return 1;
    }
    if (mode === 'identify') { console.log('\nIdentified. Nothing written (--record writes the manifest).'); return 0; }

    writeManifest({sourceSha: found.sha, romSha: committedSha, bytes: committed.length,
        entry: found.built.entry, segment: found.built.segment, assemblerSha, pin, dir,
        behindPinBy: behind.length});
    console.log(`\nManifest written: ${MANIFEST}`);
    console.log('The ROM was not touched.');
    return 0;
}

function writeManifest ({sourceSha, romSha, bytes, entry, segment, assemblerSha, pin, dir, behindPinBy = 0}) {
    // pinAtBuild is the load-bearing field. The gate has no network and no
    // bw-board checkout, so it cannot re-run the ancestry test; what it CAN do
    // is notice that the pin has moved since this manifest was written, which
    // is the moment the ancestry answer stops being current. Recording the
    // answer without recording what it was an answer ABOUT is how a manifest
    // becomes a green light for a question nobody re-asked.
    const manifest = {
        _: 'Written by scripts/sync-i8086-bios.mjs. Gated by test/i8086-bios-provenance.test.mjs. Do not hand-edit.',
        rom: 'i8086-bios.bin',
        sha256: romSha,
        bytes,
        resetVector: `${hex(segment)}:${hex(entry)}`,
        source: {
            repo: 'bw-board',
            path: SOURCE_IN_BW_BOARD,
            // The sha whose bios.asm was assembled. In --write that is the
            // checkout's HEAD, which is usually a commit that did not touch the
            // ROM at all -- so its subject line describes something else
            // entirely, and a reader would take it for the change that produced
            // these bytes. `lastTouchedBy` is the commit that actually moved the
            // source, and it is the one worth reading.
            sha: sourceSha,
            date: git(dir, ['log', '-1', '--format=%ad', '--date=short', sourceSha]),
            lastTouchedBy: (() => {
                const c = git(dir, ['log', '-1', '--format=%H', sourceSha, '--', SOURCE_IN_BW_BOARD]);
                return c ? {
                    sha: c,
                    subject: git(dir, ['log', '-1', '--format=%s', c]),
                    date: git(dir, ['log', '-1', '--format=%ad', '--date=short', c])
                } : null;
            })()
        },
        assembler: {
            path: 'overlay/scratch-gui/src/lib/bw-board/i8086-asm.js',
            sha256: assemblerSha
        },
        pinAtBuild: pin,
        ancestorOfPinAtBuild: true,
        behindPinBy
    };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main(process.argv.slice(2))
        .then((code) => process.exit(code))
        .catch((e) => {
            console.error(e instanceof Refusal ? `\nsync-i8086-bios: ${e.message}` : e);
            process.exit(2);
        });
}
