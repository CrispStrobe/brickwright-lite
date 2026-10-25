// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareInitialFlash, initialFlashScenario} from '../scripts/lib/spike-initial-flash.mjs';
const root = '/private/source-fw', output = '/private/new-package';
const missing = () => {throw Object.assign(new Error('missing'), {code: 'ENOENT'});};
test('old baseline has no seed; backported firmware requires source formatter', async () => {
    assert.equal(await prepareInitialFlash(root, output, {read: missing}), false);
    await assert.rejects(prepareInitialFlash(root, output, {required: true, read: missing}), /requires/);
});
test('trusted formatter creates only fixed exact prefix with private temporary files', async () => {
    let ran = false;
    const result = await prepareInitialFlash(root, output, {required: true,
        read: async path => {
            if (path === root + '/tools/make_simulation_littlefs_seed.py') return Buffer.from('trusted formatter source');
            assert.equal(path, output + '/initial-flash.bin');assert.equal(ran, true);return Buffer.alloc(8192);
        },
        run: (command, args, options) => {
            assert.equal(command, 'python3');assert.deepEqual(args, [root + '/tools/make_simulation_littlefs_seed.py', output + '/initial-flash.bin']);
            assert.equal(options.env.TMPDIR, output);ran = true;return {status: 0};
        }});
    assert.equal(result, true);
    const scenario = initialFlashScenario(output);
    assert.match(scenario, /assert len\(seed\)==8192/);
    assert.match(scenario, /self\.Machine\['sysbus\.spi2\.primeStorageMux\.primeStorage'\]/);
    assert.match(scenario, /WriteBytes\(0x100000,seed\)/);
    assert.match(scenario, /\/private\/new-package\/initial-flash\.bin/);
    for (const path of ['/bad;path', '/bad\npath', '/bad"path', "/bad'path"]) assert.throws(() => initialFlashScenario(path));
});
test('formatter failure and wrong seed sizes fail before package can launch', async () => {
    const read = async path => Buffer.from(path.endsWith('.py') ? 'formatter' : 'wrong seed');
    await assert.rejects(prepareInitialFlash(root, output, {read, run: () => ({status: 1})}), /failed/);
    for (const length of [0, 8191, 8193, 65536]) {
        await assert.rejects(prepareInitialFlash(root, output, {run: () => ({status: 0}),
            read: async path => path.endsWith('.py') ? Buffer.from('formatter') : Buffer.alloc(length)}), /exactly 8192/);
    }
});
