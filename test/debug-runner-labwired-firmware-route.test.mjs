// A user firmware file on the LabWired tier takes one of two routes, and both
// must survive: a chip or board picked in the Debug panel runs the image with
// no circuit (attachLabwiredFirmwareOnly: ELF / UF2, or a .hex on an S110
// board), while the project's own device keeps its bench route, whose parser
// preserves each container's load address (labwired-firmware.js). The two
// landed separately and met in one `if (kind === 'labwired')` block; this
// pins the split so neither can silently swallow the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

function labwiredFirmwareBlock() {
    const at = source.indexOf("if (kind === 'labwired') {");
    assert.ok(at >= 0, "the labwired firmware block exists");
    const end = source.indexOf('arbitrary firmware is not wired for', at);
    assert.ok(end > at, 'the labwired block ends before the fallthrough refusal');
    return source.slice(at, end);
}

test('a picked chip or board takes the firmware-only route first', () => {
    const block = labwiredFirmwareBlock();
    const picked = block.indexOf('if (labwiredChip) {');
    const device = block.indexOf('projectStc(null)?.device');
    assert.ok(picked >= 0, 'the picked-chip branch is present');
    assert.ok(device > picked, 'the project-device route comes after the picked-chip branch');
    const pickedBody = block.slice(picked, device);
    assert.match(pickedBody, /format: isElf \? 'elf' : 'uf2'/, 'ELF / UF2 on a picked chip');
    assert.match(pickedBody, /startsWith\('board:'\)/, 'a .hex only on a picked board');
    assert.doesNotMatch(pickedBody, /labwiredFirmwareImage/, 'the picked route does not reparse by device');
});

test('without a picked chip the project device keeps its address-preserving parser', () => {
    const block = labwiredFirmwareBlock();
    const device = block.slice(block.indexOf('projectStc(null)?.device'));
    assert.match(device, /labwiredFirmwareImage\(fw, chipKind\)/);
    assert.match(device, /firmwareAddress: parsed\.address/);
});

test('the packages twin carries the same routing', () => {
    const twin = readFileSync(new URL(
        '../packages/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.equal(twin, source, 'overlay and packages debug-runner.js differ');
});
