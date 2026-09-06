// The 8086 BIOS binary is the OUTPUT of an assembler run. This proves it,
// offline, on every CI runner — closing GATES species 24 for this ROM.
//
// WHAT WAS OPEN. test/i8086-bios-provenance.test.mjs checks the committed
// i8086-bios.bin against its manifest (sha256, size, the pin has not moved) and
// re-verifies the ancestry claim against real history — but ONLY when
// BW_BOARD_DIR names a bw-board checkout, which CI does not have, because the
// ROM's source `rom/bios.asm` was not vendored. So the one check that matters
// most — "this binary is what our assembler makes from this source" — never ran
// where it counts. A binary asserted only against a hash of ITSELF, and against
// a checkout that is never present, is the species-24 shape: a gate whose real
// question is skipped and whose green means "the file equals itself".
//
// WHAT THIS ADDS. The source is now vendored beside the ROM
// (static/roms/i8086-bios.asm, synced by scripts/sync-i8086-bios.mjs at the pin,
// MIT like the assembler). This test re-assembles it with lite's OWN vendored
// assembler and asserts byte-equality with the committed .bin — no checkout, no
// network. It does NOT re-implement verifyRom (the reset-vector / POST-CLI
// checks): byte-equality with a .bin that the boot test already runs inherits
// every one of them. The single call is `assemble(source, {format: 'com'})`,
// the same one the sync script and the ROM build use.
//
// THE SPECIES-24 TRAP, AVOIDED. The assembler must run into a TEMPORARY buffer
// and be compared with the committed file — never assembled back INTO
// static/roms. A gate that regenerates its own subject and then compares the
// two is comparing a thing with itself; it cannot fail. Nothing here writes.
//
// WHY BOTH INPUT SHAS ARE CHECKED FIRST. The failure this must name precisely is
// PARTIAL re-vendoring: the source moves but the assembler does not, or the
// reverse, and the .bin is left behind. A bare "bytes differ" sends the reader
// to the ROM, which is the one file that is correct. So the source and the
// assembler are each checked against their manifest-recorded sha256 first — a
// one-byte change to either reddens THAT input by name — and only then is the
// assembled output compared, with a message that names both inputs and their
// hashes so the reader knows which pair produced the mismatch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const ROM = join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.bin');
const SOURCE = join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.asm');
const ASSEMBLER = join(repo, 'overlay/scratch-gui/src/lib/bw-board/i8086-asm.js');
const MANIFEST = join(repo, 'overlay/scratch-gui/static/roms/i8086-bios.provenance.json');

const REL_SOURCE = 'overlay/scratch-gui/static/roms/i8086-bios.asm  (bw-board rom/bios.asm)';
const REL_ASSEMBLER = 'overlay/scratch-gui/src/lib/bw-board/i8086-asm.js';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

test('the ROM source is vendored and the manifest re-derives its sha256', () => {
    // The instrument before the subject: a missing source or a manifest without
    // a source hash must FAIL, not read as "nothing to re-derive".
    assert.ok(existsSync(SOURCE),
        `${SOURCE} is missing. The 8086 BIOS source must be vendored beside the ROM so this `
        + 'gate can rebuild it offline. Run: node scripts/sync-i8086-bios.mjs --dir <bw-board> --record');
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    assert.ok(m.source && typeof m.source.sha256 === 'string',
        'the manifest has no source.sha256. It was written before the source was vendored; '
        + 're-run scripts/sync-i8086-bios.mjs --dir <bw-board> --record.');
    assert.match(m.source.sha256, /^[0-9a-f]{64}$/, 'manifest source.sha256 is not a sha256');
    // Re-derive from the bytes on disk — never compare the manifest with itself.
    const onDisk = sha256(readFileSync(SOURCE));
    assert.equal(onDisk, m.source.sha256,
        `the vendored 8086 BIOS SOURCE has changed since the manifest was recorded.\n`
        + `  ${REL_SOURCE}\n`
        + `    on disk:  ${onDisk}\n`
        + `    manifest: ${m.source.sha256}\n`
        + 'If this was a deliberate re-vendor, re-run scripts/sync-i8086-bios.mjs --record so the '
        + 'ROM and both hashes move together. If it was not, the source was edited in place — '
        + 'which the ROM does not reflect.');
    // Vendored terms travel with the file (DoD): bw-board is MIT, like the assembler.
    assert.equal(m.source.license, 'MIT', 'the vendored source licence in the manifest is not MIT');
});

test('the vendored assembler matches the manifest (so a mismatch names the assembler, not the ROM)', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    assert.match(m.assembler.sha256, /^[0-9a-f]{64}$/, 'manifest assembler.sha256 is not a sha256');
    const onDisk = sha256(readFileSync(ASSEMBLER));
    assert.equal(onDisk, m.assembler.sha256,
        `the vendored 8086 ASSEMBLER has changed since the ROM was recorded.\n`
        + `  ${REL_ASSEMBLER}\n`
        + `    on disk:  ${onDisk}\n`
        + `    manifest: ${m.assembler.sha256}\n`
        + 'A new assembler can turn the same source into different bytes, so the shipped ROM is '
        + 'no longer known to be this tree\'s output. Re-run scripts/sync-i8086-bios.mjs --dir '
        + '<bw-board> to see whether the output actually moved.');
});

test('the committed ROM is exactly what lite\'s assembler makes from the vendored source', async () => {
    const source = readFileSync(SOURCE, 'utf8');
    const rom = readFileSync(ROM);
    // EXACTLY the one call the sync script and the build use. No verifyRom port:
    // equality with the .bin the boot test runs inherits the reset-vector and
    // POST-CLI checks. Assemble into a TEMPORARY buffer — never back into
    // static/roms, which would be comparing the subject with itself (species 24).
    const {assemble} = await import(`file://${ASSEMBLER}`);
    const built = Buffer.from(assemble(source, {format: 'com'}).bytes);

    if (!built.equals(rom)) {
        // Name BOTH inputs with their hashes: partial re-vendoring (source or
        // assembler moved, .bin left behind) is the failure to catch, and a bare
        // "bytes differ" points at the ROM, which is the correct file.
        const srcSha = sha256(readFileSync(SOURCE));
        const asmSha = sha256(readFileSync(ASSEMBLER));
        assert.fail(
            'the committed i8086-bios.bin is NOT what its vendored source assembles to.\n'
            + `  source    ${REL_SOURCE}\n            sha256 ${srcSha}\n`
            + `  assembler ${REL_ASSEMBLER}\n            sha256 ${asmSha}\n`
            + `  built ${built.length} bytes (sha256 ${sha256(built)})\n`
            + `  committed ${rom.length} bytes (sha256 ${sha256(rom)})\n`
            + 'This is a PARTIAL re-vendor: one of the two inputs above moved and the ROM was not '
            + 'rebuilt (or the ROM was replaced without either). The two inputs are named so you '
            + 'do not go looking in the .bin, which is the file that is correct until proven wrong. '
            + 'Rebuild with scripts/sync-i8086-bios.mjs --dir <bw-board> --write, or restore whichever '
            + 'input regressed.');
    }
});
