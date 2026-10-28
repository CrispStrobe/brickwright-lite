import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('Pico probe refuses missing GUI packages without root or copied-source fallback', t => {
    const gui = mkdtempSync(path.join(tmpdir(), 'pico-probe-scope-'));
    t.after(() => rmSync(gui, {recursive: true, force: true}));
    const probe = new URL('../scripts/probe-pico-micropython.mjs', import.meta.url).href;
    const run = () => spawnSync(process.execPath, ['--input-type=module', '-e',
        `import {createPicoMachine} from ${JSON.stringify(probe)}; await createPicoMachine(new Uint8Array());`], {
        env: {...process.env, BW_INTEGRATED_ROOT: gui}, encoding: 'utf8', timeout: 10000
    });
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no rp2040js under/);
    // A fixture registry entry gets past the first explicit check only; no
    // emulator is loaded and no firmware fetch occurs in either refusal case.
    mkdirSync(path.join(gui, 'node_modules/rp2040js'), {recursive: true});
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no bw-board adapter under/);
    assert.match(result.stderr, /does not substitute root packages/);
});
