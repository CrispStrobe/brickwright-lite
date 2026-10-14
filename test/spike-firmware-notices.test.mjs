// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {firmwareExtraNotices} from '../scripts/lib/spike-firmware-notices.mjs';
const paths = ['licenses/Apache-2.0.txt', 'licenses/NuttX-NOTICE.txt', 'licenses/NuttX-Apps-NOTICE.txt',
    'licenses/Brickwright-BSD-3-Clause.txt', 'licenses/NuttX-Tickless-BSD-3-Clause.txt'];
const root = '/private-test-fw';
const reader = files => async path => {
    const relative = path.slice(root.length + 1);
    if (!files.has(relative)) throw Object.assign(new Error('missing'), {code: 'ENOENT'});
    return files.get(relative);
};
function fixtures () {
    const files = new Map(paths.map(path => [path, Buffer.from(`synthetic complete grant ${path}\n`)]));
    const policy = {schema: 1, required_notices: Object.fromEntries(paths.map(path =>
        [path, createHash('sha256').update(files.get(path)).digest('hex')]))};
    files.set('policy/nuttx-backports.json', Buffer.from(JSON.stringify(policy)));
    files.set('licenses/Simulation-Firmware-NOTICES.txt', Buffer.from('synthetic MIT Apache BSD notice bundle'));
    return {files, policy};
}
test('backport package copies complete policy-pinned grants and full notices without publishing policy', async () => {
    const {files} = fixtures(), copies = await firmwareExtraNotices(root, reader(files));
    assert.equal(copies.length, 6);
    for (const path of paths) assert.ok(copies.some(([source]) => source === path));
    assert.ok(copies.some(([source]) => source === 'licenses/Simulation-Firmware-NOTICES.txt'));
    assert.deepEqual(copies.find(([source]) => source === 'licenses/NuttX-NOTICE.txt'),
        ['licenses/NuttX-NOTICE.txt', 'licenses/firmware-NuttX-NOTICE.txt']);
    assert.equal(copies.some(([source]) => source.startsWith('policy/')), false);
});
test('missing/altered required grants and malformed or widened policy fail closed', async () => {
    for (const path of [...paths, 'licenses/Simulation-Firmware-NOTICES.txt']) {
        const {files} = fixtures();files.delete(path);
        await assert.rejects(firmwareExtraNotices(root, reader(files)));
    }
    const changed = fixtures();changed.files.set(paths[4], Buffer.from('edited grant'));
    await assert.rejects(firmwareExtraNotices(root, reader(changed.files)), /changed required/);
    for (const mutate of [p => {p.schema = 2;}, p => {delete p.required_notices[paths[4]];},
        p => {p.required_notices['../escape'] = '0'.repeat(64);}]) {
        const {files, policy} = fixtures();mutate(policy);files.set('policy/nuttx-backports.json', Buffer.from(JSON.stringify(policy)));
        await assert.rejects(firmwareExtraNotices(root, reader(files)), /Unsupported/);
    }
});
test('old baseline remains supported only without backport dependencies', async () => {
    assert.deepEqual(await firmwareExtraNotices(root, reader(new Map())), []);
    const old = new Map([['licenses/Simulation-Firmware-NOTICES.txt', Buffer.from('old complete grants')]]);
    assert.equal((await firmwareExtraNotices(root, reader(old))).length, 1);
    for (const path of ['patches/nuttx-hardening/nuttx.patch', 'patches/nuttx-hardening/nuttx-apps.patch', 'tools/apply_nuttx_backports.py']) {
        await assert.rejects(firmwareExtraNotices(root, reader(new Map([[path, Buffer.from('dependency')]]))), /requires/);
    }
    await assert.rejects(firmwareExtraNotices(root, reader(new Map([
        ['nuttx/arch/arm/src/stm32/stm32_tickless.c', Buffer.from('Modified; scope policy/nuttx-backports.json')]]))), /requires/);
});
