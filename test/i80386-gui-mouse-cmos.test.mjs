import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PCAT80386_EXPERIMENTAL_4M_HDD_FREEDOS_VGA as base} from 'bw-board/experimental/i80386-at-machine.js';
import {createI80386Adapter} from 'bw-board/i80386-adapter.js';
import {withI80386MouseCmos} from '../overlay/scratch-gui/src/lib/bw-machines/i80386-cmos.js';

const image = entries => {
    const cmos = new Uint8Array(0x40);
    for (const [index, value] of entries) cmos[index] = value;
    return cmos;
};
const validChecksum = cmos => {
    let sum = 0;
    for (let index = 0x10; index <= 0x2d; index++) sum = (sum + cmos[index]) & 0xffff;
    return (cmos[0x2e] << 8 | cmos[0x2f]) === sum;
};

test('local DOSBox 386 advertises the enabled PS/2 mouse through valid CMOS', () => {
    const baseRtc = base.chips.find(chip => chip.kind === 'rtc');
    const before = image(baseRtc.initialCmos);
    const chips = withI80386MouseCmos(base.chips, [
        [0x3d, 0x21], [0x12, 0xf0], [0x19, 47],
        [0x1b, 0xe8], [0x1c, 0x03], [0x1d, 4], [0x23, 17]
    ]);
    const rtc = image(chips.find(chip => chip.kind === 'rtc').initialCmos);
    assert.equal(rtc[0x14], 0x05);
    assert.equal(rtc[0x19], 47);
    assert.equal(rtc[0x1b] | rtc[0x1c] << 8, 1000);
    assert.equal(rtc[0x3d], 0x21);
    assert.ok(validChecksum(rtc));
    assert.equal(image(baseRtc.initialCmos)[0x14], before[0x14], 'board base stays untouched');
    const adapter = createI80386Adapter({config: {...base, a20: {...base.a20, mouse: true}, chips}});
    assert.equal(adapter.machine.canTakeMouse(), true);
    assert.equal(adapter.machine.chips.rtc1.ram[0x14], 0x05);
    const runner = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.match(runner, /chips: withI80386MouseCmos\(base\.chips,/);
});

test('local floppy boot advertises mouse without changing board defaults', () => {
    const before = image(base.chips.find(chip => chip.kind === 'rtc').initialCmos);
    const chips = withI80386MouseCmos(base.chips);
    const rtc = image(chips.find(chip => chip.kind === 'rtc').initialCmos);
    assert.equal(rtc[0x14], 0x05);
    assert.equal(rtc[0x3d], before[0x3d]);
    assert.ok(validChecksum(rtc));
    assert.equal(image(base.chips.find(chip => chip.kind === 'rtc').initialCmos)[0x14], before[0x14]);
});

test('named FreeDOS VGA adapter independently advertises its mouse', () => {
    const adapter = createI80386Adapter({profile: 'freedos-vga'});
    assert.equal(adapter.machine.canTakeMouse(), true);
    const cmos = adapter.machine.chips.rtc1.ram;
    assert.equal(cmos[0x14] & 0x04, 0x04);
    assert.ok(validChecksum(cmos));
});
