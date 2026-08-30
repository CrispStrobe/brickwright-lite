import assert from 'node:assert/strict';
import test from 'node:test';

import {createCompilerFetch} from '../overlay/scratch-gui/src/lib/sdcc-wasm/intercept.js';

const request = target => ['https://stc-compiler.vercel.app/compile', {
    method: 'POST',
    body: JSON.stringify({language: 'c', code: 'void main(void) {}', target, symbols: true})
}];

test('supported 8051 requests stay local even when compilation fails', async () => {
    let hosted = 0;
    let local = 0;
    const fetch = createCompilerFetch(async () => { hosted++; return new Response('{}'); }, async () => {
        local++;
        return {success: false, error: 'deliberate local failure'};
    });

    const response = await fetch(...request('stc12c5a60s2'));
    assert.deepEqual(await response.json(), {success: false, error: 'deliberate local failure'});
    assert.equal(local, 1);
    assert.equal(hosted, 0, 'a local failure must not escape to the hosted compiler');
});

test('unsupported processor families retain the explicit hosted route', async () => {
    const hostedTargets = [];
    let local = 0;
    const fetch = createCompilerFetch(async (_url, init) => {
        hostedTargets.push(JSON.parse(init.body).target);
        return new Response(JSON.stringify({success: true}));
    }, async () => { local++; return {success: true}; });

    for (const target of ['atmega328p', 'rp2040', 'stm32f030', 'eater6502']) {
        assert.equal((await (await fetch(...request(target))).json()).success, true);
    }
    assert.deepEqual(hostedTargets, ['atmega328p', 'rp2040', 'stm32f030', 'eater6502']);
    assert.equal(local, 0);
});

test('non-C and malformed requests are not captured', async () => {
    let hosted = 0;
    const fetch = createCompilerFetch(async () => { hosted++; return new Response('{}'); },
        async () => assert.fail('local compiler should not run'));
    const [url, init] = request('stc12c5a60s2');
    await fetch(url, {...init, body: '{bad json'});
    await fetch(url, {...init, body: JSON.stringify({language: 'asm', code: 'nop', target: 'stc12c5a60s2'})});
    assert.equal(hosted, 2);
});
