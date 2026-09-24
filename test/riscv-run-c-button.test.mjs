// The ▶ Run C on RISC-V button wiring in the Code tab. Source-text gates (the
// button, the handler, and that it reuses the shared riscv-image event) so the
// path a build compiles cannot silently lose a hop — the same discipline
// i8086-chips-wiring applies to the 8086 route.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');

test('the Code tab offers a ▶ Run C on RISC-V button, shown for the riscv32 device', () => {
    assert.match(src, /data-testid="bw-run-c-riscv"/, 'the C tab has a ▶ for RISC-V');
    assert.match(src, /asmTargetForDevice\(this\.currentDevice\(\)\) === 'riscv32'/,
        'the button appears only for the riscv32 target');
    assert.match(src, /onClick=\{this\.runCOnRiscv\}/, 'it is wired to the handler');
});

test('the handler posts to the HOSTED compiler and boots the shared riscv image path', () => {
    assert.match(src, /async runCOnRiscv \(\)/, 'the handler exists');
    assert.match(src, /out = await requestRiscvCBuild\(\{source\}\);/,
        'it calls the hosted C route (which reads BW_RISCV_CC_ENDPOINT), no injected seam');
    // the image travels the SAME bw-asm-rom-ready event as an assembled program
    assert.match(src, /format: 'riscv'/, 'the detail is a riscv image, not a flat ROM');
    assert.match(src, /image: out\.image/, 'the loadable image is carried');
    assert.match(src, /new CustomEvent\('bw-asm-rom-ready', \{detail\}\)/,
        'it dispatches the shared boot event debug-panel already routes');
    assert.match(src, /this\.runCOnRiscv = this\.runCOnRiscv\.bind\(this\)/, 'the handler is bound');
});

test('refusal and compile-error are told apart in the status', () => {
    assert.match(src, /e\.reason === 'source'\s*\n?\s*\?\s*this\.L\.runCRiscvRefused/,
        'a compile error (reason source) is the program\'s');
    assert.match(src, /runCRiscvUnavailable/, 'a missing/unreachable service (reason transport) is the service\'s');
});

test('the button\'s strings exist in both locales', () => {
    for (const key of ['runCRiscv', 'runCRiscvTitle', 'runCRiscvBuilding', 'runCRiscvBuilt',
        'runCRiscvRefused', 'runCRiscvUnavailable', 'runCRiscvEmpty']) {
        assert.equal(src.split(`${key}:`).length - 1 >= 2, true, `${key} is missing from a locale`);
    }
});
