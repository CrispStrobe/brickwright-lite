// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkRenodeLayout, stage, REQUIRED_LAYOUT} from '../scripts/stage-spike-macos-resources.mjs';

const machO = () => { const b = Buffer.alloc(64); b.writeUInt32LE(0xfeedfacf, 0); return b; };

async function layout (mutate = () => {}) {
    const root = await mkdtemp(join(tmpdir(), 'bw-macos-layout-'));
    for (const name of REQUIRED_LAYOUT) {
        await mkdir(join(root, name, '..'), {recursive: true});
        await writeFile(join(root, name), name === 'renode' ? machO() : 'x');
    }
    await mutate(root);
    return root;
}

test('accepts a complete multi-file SPIKE layout', async () => {
    const root = await layout();
    assert.deepEqual(await checkRenodeLayout(root), []);
    await rm(root, {recursive: true});
});

test('refuses missing shipped tlib and .NET notices', async () => {
    const root = await layout(async r => {
        await rm(join(r, 'tlib/translate-arm-m-le.so'));
        await rm(join(r, 'licenses/dotnet-runtime-1-license'));
    });
    assert.deepEqual(await checkRenodeLayout(root), ['missing tlib/translate-arm-m-le.so', 'missing licenses/dotnet-runtime-1-license']);
    await rm(root, {recursive: true});
});

test('refuses Packet.Net and ensurepip in the SPIKE layout', async () => {
    const root = await layout(async r => {
        await writeFile(join(r, 'PacketDotNet.dll'), 'x');
        await mkdir(join(r, 'Lib/ensurepip'), {recursive: true});
    });
    assert.deepEqual(await checkRenodeLayout(root), ['unexpected PacketDotNet.dll', 'unexpected Lib/ensurepip']);
    await rm(root, {recursive: true});
});

test('refuses a single-file or non-Mach-O host', async () => {
    const big = await layout(async r => { const b = Buffer.alloc(5 * 1024 * 1024); b.writeUInt32LE(0xfeedfacf, 0); await writeFile(join(r, 'renode'), b); });
    assert.deepEqual(await checkRenodeLayout(big), ['renode host looks like a single-file bundle']);
    const elf = await layout(async r => { await writeFile(join(r, 'renode'), Buffer.from('7f454c46020101000000000000000000', 'hex')); });
    assert.deepEqual(await checkRenodeLayout(elf), ['renode host is not Mach-O']);
    await rm(big, {recursive: true}); await rm(elf, {recursive: true});
});

test('stage refuses an invalid layout before writing output', async () => {
    const root = await layout(async r => { await writeFile(join(r, 'PacketDotNet.dll'), 'x'); });
    const out = join(tmpdir(), `bw-macos-stage-${process.pid}-${Date.now()}`);
    await assert.rejects(stage(root, root, out), /Invalid SPIKE Renode layout: unexpected PacketDotNet.dll/);
    await rm(root, {recursive: true});
});
