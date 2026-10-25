import {importPackageSource} from './helpers/package-source.mjs';
/**
 * P7: the i8086-blink gallery circuit decodes a REAL 8086 machine — the ROM's
 * chip select is bound, not floating.
 *
 * The example's circuit is the reseat fixture adapted to the gallery shape. The
 * two memory chips carry DIFFERENT select pins on purpose — the 62256 SRAM's is
 * `csb`, the 28c256 EEPROM's is `ceb` (bw-board's bus-memory model and all three
 * extractors say so) — so a "normalise them to one name" edit points a wire at a
 * pin the silicon does not have. That passes the gallery's terminal check for the
 * wrong reason and leaves the ROM select FLOATING; a single ROM still fetches
 * unselected, so a run-only gate cannot tell. This asserts the thing that can:
 * extract8086Machine reports the ROM as a decoded region only when its select is
 * driven, and names the floating select otherwise.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {SOURCE, REPO} from './helpers/bw-integrated.mjs';

const {extract8086Machine} = await importPackageSource('bw-board/i8086-extract.js');
const CIRCUIT = JSON.parse(readFileSync(
    path.join(REPO, 'overlay/scratch-gui/examples/i8086-blink/circuit.json'), 'utf8'));

const romRegion = cfg => (cfg.regions || []).find(r => r.kind === 'rom');
const ramRegion = cfg => (cfg.regions || []).find(r => r.kind === 'ram');

test('P7: i8086-blink extracts an 8086 machine with a bound ROM and RAM select', () => {
    const cfg = extract8086Machine(CIRCUIT);
    assert.equal(cfg.ok, true, `extraction failed: ${JSON.stringify(cfg.reasons)}`);
    // The EEPROM (28c256, select ceb) decodes at the top of the 8086's 1 MB space
    // — the reset vector lives there. Its presence means its select is driven.
    assert.deepEqual(romRegion(cfg), {kind: 'rom', start: 917504, end: 1048575},
        `the ROM did not decode as a bound region — its select is not driven: ${JSON.stringify(cfg.regions)}`);
    // The SRAM (62256, select csb) decodes at the bottom.
    assert.equal(ramRegion(cfg)?.start, 0, 'the SRAM did not decode at 0');
    // The 8255 PPI is on the bus for the LEDs.
    assert.ok((cfg.chips || []).some(c => c.kind === 'ppi'), 'no 8255 PPI on the bus');
});

test('P7 mutation: unbinding the ROM select (drop rom86.ceb) reddens by name', () => {
    const mutated = JSON.parse(JSON.stringify(CIRCUIT));
    mutated.wires = mutated.wires.filter(w => !(w.to === 'rom86' && w.toTerminal === 'ceb'));
    assert.equal(mutated.wires.length, CIRCUIT.wires.length - 1, 'the ceb select wire was not the one removed');
    const cfg = extract8086Machine(mutated);
    assert.equal(cfg.ok, false, 'a floating ROM select still extracted a valid machine — the select is not actually decoded');
    assert.ok((cfg.reasons || []).some(r => /rom86\.ceb.*undriven|floating chip select/i.test(r)),
        `the failure did not name the floating ROM select: ${JSON.stringify(cfg.reasons)}`);
    // And the ROM no longer decodes.
    assert.equal(romRegion(cfg), undefined, 'the ROM still decoded with a floating select');
});
