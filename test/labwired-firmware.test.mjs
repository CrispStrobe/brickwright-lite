import test from 'node:test';
import assert from 'node:assert/strict';
import {labwiredFirmwareImage} from '../overlay/scratch-gui/src/lib/bw-debug/labwired-firmware.js';

const put32 = (a, at, n) => new DataView(a.buffer).setUint32(at, n, true);

function uf2Block (address, payload) {
    const b = new Uint8Array(512);
    put32(b, 0, 0x0a324655); put32(b, 4, 0x9e5d5157);
    put32(b, 12, address); put32(b, 16, payload.length);
    put32(b, 20, 0); put32(b, 24, 1); b.set(payload, 32);
    put32(b, 508, 0x0ab16f30);
    return b;
}

const ihex = (address, type, data) => {
    const body = [data.length, address >> 8, address & 0xff, type, ...data];
    const checksum = (-body.reduce((a, b) => a + b, 0)) & 0xff;
    return `:${[...body, checksum].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

test('PyBadge UF2 preserves its bootloader application address', () => {
    const payload = Uint8Array.from([0x00, 0x20, 0x00, 0x20, 0x09, 0x40, 0x00, 0x00]);
    const out = labwiredFirmwareImage({name: 'game.uf2', bytes: uf2Block(0x4000, payload)}, 'pybadge');
    assert.equal(out.address, 0x4000);
    assert.equal(out.format, 'uf2');
    assert.deepEqual(out.image, payload);
});

test('micro:bit HEX keeps flash at zero and carries its UICR words as their own segment', () => {
    const text = [
        ihex(0, 4, [0, 0]), ihex(0, 0, [0x00, 0x00, 0x04, 0x20, 0x09, 0x01, 0x00, 0x00]),
        ihex(0, 4, [0x10, 0x00]), ihex(0x1014, 0, [0x44, 0x55, 0x66, 0x77]), ihex(0, 1, [])
    ].join('\n');
    const out = labwiredFirmwareImage({name: 'microbit.hex', text}, 'microbit_v2');
    assert.equal(out.address, 0);
    assert.equal(out.image.length, 8, 'the flash image does not grow to the UICR address');
    assert.equal(out.omitted, 0, 'UICR is loaded, not dropped');
    // The MBR reads NRFFW[0] at reset; dropped, a real MakeCode V2 program
    // hard-faulted at boot (CODAL's flash storage at 0xFFFFFFFF - 3 * 4096).
    assert.equal(out.extraSegments.length, 1);
    assert.equal(out.extraSegments[0].address, 0x10001014);
    assert.deepEqual([...out.extraSegments[0].bytes], [0x44, 0x55, 0x66, 0x77]);
});

test('a micro:bit UNIVERSAL hex loads the V2 section on the V2, never the V1 one', () => {
    // Block Start (0x0A) names each section's board: 0x9900 = V1, 0x9903 = V2.
    // V1 data is type 0x00, V2 data type 0x0D.
    const text = [
        ihex(0, 4, [0, 0]), ihex(0, 0x0a, [0x99, 0x00, 0xc0, 0xde]),
        ihex(0, 0, [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]),
        ihex(0, 0x0b, []),
        ihex(0, 4, [0, 0]), ihex(0, 0x0a, [0x99, 0x03, 0xc0, 0xde]),
        ihex(0, 0x0d, [0x00, 0x00, 0x04, 0x20, 0x09, 0x01, 0x00, 0x00]),
        ihex(0, 4, [0x10, 0x00]), ihex(0x1014, 0x0d, [0x00, 0x70, 0x07, 0x00]),
        ihex(0, 0x0b, []), ihex(0, 1, []),
    ].join('\n');
    const out = labwiredFirmwareImage({name: 'universal.hex', text}, 'microbit_v2');
    assert.deepEqual([...out.image], [0x00, 0x00, 0x04, 0x20, 0x09, 0x01, 0x00, 0x00], 'the V2 image');
    assert.deepEqual([...out.extraSegments[0].bytes], [0x00, 0x70, 0x07, 0x00], 'the V2 UICR');
    // A universal hex with no V2 section has nothing for this chip.
    const v1Only = [ihex(0, 4, [0, 0]), ihex(0, 0x0a, [0x99, 0x00, 0xc0, 0xde]),
        ihex(0, 0, [0x11, 0x11, 0x11, 0x11]), ihex(0, 1, [])].join('\n');
    assert.throws(() => labwiredFirmwareImage({name: 'v1.hex', text: v1Only}, 'microbit_v2'),
        /no executable flash records/);
});

test('ELF is passed through and a corrupt UF2 is refused', () => {
    const elf = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 1]);
    assert.strictEqual(labwiredFirmwareImage({bytes: elf}, 'microbit_v2').image, elf);
    const bad = uf2Block(0x4000, Uint8Array.of(1));
    bad[508] = 0;
    assert.throws(() => labwiredFirmwareImage({bytes: bad}, 'pybadge'), /bad magic/);
});

