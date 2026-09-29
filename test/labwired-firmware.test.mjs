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

test('micro:bit HEX retains flash at zero without allocating its UICR address', () => {
    const text = [
        ihex(0, 4, [0, 0]), ihex(0, 0, [0x00, 0x00, 0x04, 0x20, 0x09, 0x01, 0x00, 0x00]),
        ihex(0, 4, [0x10, 0x00]), ihex(0x1014, 0, [0x44, 0x55, 0x66, 0x77]), ihex(0, 1, [])
    ].join('\n');
    const out = labwiredFirmwareImage({name: 'microbit.hex', text}, 'microbit_v2');
    assert.equal(out.address, 0);
    assert.equal(out.image.length, 8);
    assert.equal(out.omitted, 4);
});

test('ELF is passed through and a corrupt UF2 is refused', () => {
    const elf = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 1]);
    assert.strictEqual(labwiredFirmwareImage({bytes: elf}, 'microbit_v2').image, elf);
    const bad = uf2Block(0x4000, Uint8Array.of(1));
    bad[508] = 0;
    assert.throws(() => labwiredFirmwareImage({bytes: bad}, 'pybadge'), /bad magic/);
});

