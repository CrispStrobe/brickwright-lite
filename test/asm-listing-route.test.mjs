import assert from 'node:assert/strict';
import test from 'node:test';

import {
    compileTargetForDevice,
    requestGeneratedListing
} from '../overlay/scratch-gui/src/lib/sdcc-wasm/listing-route.js';

const sentinel = {
    success: true,
    listing: {asm: '0000 02 00 08 ljmp 0008', lineMap: [{addr: 0, file: 'main.c', line: 1}],
        format: 'sdcc', v: 1}
};

test('all five bundled 8051 targets request their listing locally with no hosted escape', async () => {
    for (const deviceId of [
        'stc12c5a60s2', 'stc12c2052ad', 'stc12c5202ad', 'stc89c52rc', 'stc15f2k60s2'
    ]) {
        let local = 0;
        let hosted = 0;
        const out = await requestGeneratedListing({code: 'void main(void){}', deviceId, fosc: 12000000}, {
            compileLocal: async (code, options) => {
                local++;
                assert.equal(code, 'void main(void){}');
                assert.deepEqual(options, {target: deviceId, fosc: 12000000, disassemble: true});
                return sentinel;
            },
            hostedFetch: async () => { hosted++; throw new Error('network escape'); }
        });
        assert.equal(out, sentinel);
        assert.equal(local, 1, `${deviceId} did not use the local compiler`);
        assert.equal(hosted, 0, `${deviceId} escaped to the hosted compiler`);
    }
});

test('a supported local refusal stays local and keeps the compiler diagnosis', async () => {
    let hosted = 0;
    await assert.rejects(() => requestGeneratedListing({code: 'broken', deviceId: 'stc12c5a60s2'}, {
        compileLocal: async () => ({success: false, error: 'error 20: Undefined identifier'}),
        hostedFetch: async () => { hosted++; }
    }), /error 20: Undefined identifier/);
    assert.equal(hosted, 0);
});

test('unsupported families retain one explicit hosted listing request', async () => {
    for (const [deviceId, target, format] of [
        ['arduino-uno', 'atmega328p', 'ihx'],
        ['pico', 'rp2040', 'bin'],
        ['stm32f030', 'stm32f030', 'bin'],
        ['eater6502', 'eater6502', 'ihx']
    ]) {
        let local = 0;
        let request;
        const out = await requestGeneratedListing({code: 'int main(void){}', deviceId}, {
            compileLocal: async () => { local++; return sentinel; },
            hostedFetch: async (url, init) => {
                request = {url, init, body: JSON.parse(init.body)};
                return {json: async () => sentinel};
            }
        });
        assert.equal(out, sentinel);
        assert.equal(local, 0, `${deviceId} was incorrectly admitted to the local 8051 toolchain`);
        assert.equal(request.url, 'https://stc-compiler.vercel.app/compile');
        assert.equal(request.init.method, 'POST');
        assert.deepEqual(request.body, {
            code: 'int main(void){}', language: 'c', target, format, disassemble: true
        });
    }
});

test('device aliases map to the same compile targets as the debug runner', () => {
    assert.equal(compileTargetForDevice('arduino-nano'), 'atmega328p');
    assert.equal(compileTargetForDevice('arduino-mega'), 'atmega2560');
    assert.equal(compileTargetForDevice('STC89C52RC'), 'stc89c52rc');
});
