import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    RP2040_LOCKED_SOURCE,
    seedLockedSources
} from '../scripts/build-makecode-arcade-bases.mjs';

test('RP2040 acquisition starts at the locked library commit, before submodules', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-rp2040-source-'));
    const calls = [];
    const exec = (command, args, options = {}) => {
        calls.push([command, ...args]);
        if (args.includes('rev-parse')) {
            return options.cwd?.endsWith('pico-sdk') || args[1]?.endsWith('pico-sdk')
                ? RP2040_LOCKED_SOURCE.submoduleCommit
                : RP2040_LOCKED_SOURCE.commit;
        }
        return '';
    };
    const seeded = seedLockedSources(root, {
        target: {name: 'codal-pi-pico', branch: 'v0.0.13'}
    }, exec);
    const rendered = calls.map(call => call.join(' '));
    const fetch = rendered.findIndex(line => line.includes(`fetch --quiet --depth 1 origin ${RP2040_LOCKED_SOURCE.commit}`));
    const submodule = rendered.findIndex(line => line.includes('submodule update --init --depth 1 -- pico-sdk'));
    assert.ok(fetch >= 0, 'the exact locked library commit is fetched');
    assert.ok(submodule > fetch, 'the locked library is checked out before its submodule is initialized');
    assert.deepEqual(seeded.map(source => source.commit), [
        RP2040_LOCKED_SOURCE.commit,
        RP2040_LOCKED_SOURCE.submoduleCommit
    ]);
});

test('an unreviewed RP2040 target lock fails closed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-rp2040-drift-'));
    assert.throws(() => seedLockedSources(root, {
        target: {name: 'codal-pi-pico', branch: 'moving-target'}
    }, () => ''), /unreviewed target lock/);
});

test('unrelated CODAL targets are untouched', () => {
    assert.deepEqual(seedLockedSources('/unused', {
        target: {name: 'codal-samd51', branch: 'v1'}
    }, () => assert.fail('git must not run')), []);
});
