import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const script = new URL('../scripts/check-system-load.mjs', import.meta.url);

test('load preflight can reject a saturated build host', () => {
    const result = spawnSync(process.execPath, [script.pathname], {
        encoding: 'utf8',
        env: {...process.env, BW_MAX_LOAD_PER_CPU: '0.000001'}
    });
    assert.equal(result.status, 75);
    assert.match(result.stderr, /build deferred/i);
});

test('load preflight threshold can be deliberately raised', () => {
    const result = spawnSync(process.execPath, [script.pathname], {
        encoding: 'utf8',
        env: {...process.env, BW_MAX_LOAD_PER_CPU: '1000000'}
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /preflight passed/i);
});
