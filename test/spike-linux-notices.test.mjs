// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// G05: the linked-crate inventory follows Cargo.lock, the licence review names only linked
// crates, and the builder's notice gates refuse missing or unreviewed notice gaps.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {lockPackages, LOCK_PATH, INVENTORY_PATH} from '../scripts/gen-spike-linux-crate-inventory.mjs';
import {REQUIRED_RUNTIME_NOTICES, requireRuntimeNotices, requireInventoryForLock, collectCrateNotices, lockDigest}
    from '../scripts/lib/spike-linux-notices.mjs';

const lockText = readFileSync(LOCK_PATH, 'utf8');
const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
const review = JSON.parse(readFileSync(new URL('../docs/spike-linux-licence-review.json', import.meta.url), 'utf8'));
const key = row => `${row.name}@${row.version}`;

test('inventory is bound to the current Cargo.lock and partitions every locked crate', () => {
    assert.equal(inventory.cargoLockSha256, lockDigest(lockText), 'Cargo.lock changed: rerun scripts/gen-spike-linux-crate-inventory.mjs');
    assert.equal(inventory.target, 'x86_64-unknown-linux-gnu');
    assert.deepEqual(inventory.features, ['custom-protocol']);
    const locked = lockPackages(lockText).filter(p => p.name !== 'brickwright-tauri').map(key).sort();
    const listed = [...inventory.linked, ...inventory.buildTimeOnly, ...inventory.notLinkedOnTarget].map(key).sort();
    assert.deepEqual(listed, locked);
    assert.equal(new Set(listed).size, listed.length);
    assert.equal(inventory.counts.linked, inventory.linked.length);
    for (const row of inventory.linked) assert.match(row.license, /\S/, key(row));
    assert.ok(!JSON.stringify(inventory).includes('/home/') && !JSON.stringify(inventory).includes('/mnt/'));
});

test('a crate added to Cargo.lock without an inventory update is detected', () => {
    const added = `${lockText}\n[[package]]\nname = "unreviewed-crate"\nversion = "1.0.0"\n`;
    assert.throws(() => requireInventoryForLock(inventory, added), /does not match Cargo.lock/);
    requireInventoryForLock(inventory, lockText);
});

test('licence review names only linked or build-time crates and records MPL sources', () => {
    const linked = new Set(inventory.linked.map(key)), build = new Set(inventory.buildTimeOnly.map(key));
    for (const crate of review.crateLicenceFilesAbsentReviewed) assert.ok(linked.has(crate), crate);
    const mpl = review.flaggedLicences['MPL-2.0'];
    assert.deepEqual(mpl.linked.map(e => e.crate).sort(), inventory.linked.filter(r => /MPL/.test(r.license)).map(key).sort());
    for (const entry of mpl.linked) assert.match(entry.cargoLockChecksum, /^[0-9a-f]{64}$/);
    for (const crate of mpl.buildTimeOnly) assert.ok(build.has(crate), crate);
    for (const [id, item] of Object.entries(review.flaggedLicences)) assert.equal(typeof item.policyCompatible, 'boolean', id);
    // Any linked crate whose expression has no accepted alternative must be reviewed explicitly.
    const accepted = /\b(MIT|MIT-0|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|MPL-2\.0|ISC|Zlib|Unicode-3\.0|CDLA-Permissive-2\.0|Unlicense)\b/;
    for (const row of inventory.linked) assert.match(row.license, accepted, key(row));
});

test('required Renode/.NET/LLVM notices are enforced', () => {
    requireRuntimeNotices(Object.keys(REQUIRED_RUNTIME_NOTICES));
    for (const name of Object.keys(REQUIRED_RUNTIME_NOTICES)) {
        assert.throws(() => requireRuntimeNotices(Object.keys(REQUIRED_RUNTIME_NOTICES).filter(n => n !== name)), new RegExp(name));
    }
});

async function crates () {
    const root = await mkdtemp(join(tmpdir(), 'bw-crate-notices-'));
    const make = async (name, files) => {
        const dir = join(root, 'src', `${name}-1.0.0`);await mkdir(dir, {recursive: true});
        await writeFile(join(dir, 'Cargo.toml'), '[package]\n');
        for (const [file, body] of Object.entries(files)) await writeFile(join(dir, file), body);
        return {name, version: '1.0.0', manifest_path: join(dir, 'Cargo.toml')};
    };
    const packages = [await make('a', {'LICENSE-MIT': 'mit a', 'LICENSE-APACHE': 'apache a', 'README.md': 'no'}),
        await make('b', {'COPYING': 'isc b'}), await make('c', {})];
    const inv = {linked: packages.map(p => ({name: p.name, version: p.version}))};
    return {root, packages, inv};
}

test('crate notices are copied, and unreviewed licence-file gaps refuse the package', async () => {
    const {root, packages, inv} = await crates();
    try {
        const destination = join(root, 'out');
        const result = await collectCrateNotices({packages, inventory: inv, destination, reviewedAbsent: ['c@1.0.0']});
        assert.deepEqual(result.copied.sort(), ['a-1.0.0/LICENSE-APACHE', 'a-1.0.0/LICENSE-MIT', 'b-1.0.0/COPYING']);
        assert.deepEqual(result.absent, ['c@1.0.0']);
        assert.equal(await readFile(join(destination, 'b-1.0.0/COPYING'), 'utf8'), 'isc b');
        assert.deepEqual((await readdir(destination)).sort(), ['a-1.0.0', 'b-1.0.0']);
        await assert.rejects(collectCrateNotices({packages, inventory: inv, destination: join(root, 'o2'), reviewedAbsent: []}), /c@1.0.0/);
        await assert.rejects(collectCrateNotices({packages, inventory: inv, destination: join(root, 'o3'), reviewedAbsent: ['c@1.0.0', 'a@1.0.0']}), /a@1.0.0/);
        await assert.rejects(collectCrateNotices({packages: packages.slice(1), inventory: inv, destination: join(root, 'o4'), reviewedAbsent: ['c@1.0.0']}), /no local source/);
        await writeFile(join(root, 'outside'), 'foreign');
        await symlink(join(root, 'outside'), join(root, 'src/c-1.0.0/LICENSE'));
        // A link is not a regular licence file: c stays absent, so the reviewed list still holds.
        const linked = await collectCrateNotices({packages, inventory: inv, destination: join(root, 'o5'), reviewedAbsent: ['c@1.0.0']});
        assert.deepEqual(linked.absent, ['c@1.0.0']);
    } finally { await rm(root, {recursive: true, force: true}); }
});
