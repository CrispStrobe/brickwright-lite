#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Generates docs/generated/spike-linux-crate-inventory.json: the crates linked into the
// Linux `brickwright-tauri` binary built by scripts/build-spike-linux-desktop.mjs
// (features `custom-protocol`, target x86_64-unknown-linux-gnu). Read-only:
// `cargo metadata --locked --offline`; no build, no network. Inventory, not clearance.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoDir = path.join(rootDir, 'apps/tauri/src-tauri');
export const LOCK_PATH = path.join(cargoDir, 'Cargo.lock');
export const INVENTORY_PATH = path.join(rootDir, 'docs/generated/spike-linux-crate-inventory.json');
export const TARGET = 'x86_64-unknown-linux-gnu';
export const FEATURES = ['custom-protocol'];
export const METADATA_ARGS = ['metadata', '--locked', '--offline', '--format-version=1',
    '--filter-platform', TARGET, '--features', FEATURES.join(',')];

/** Minimal Cargo.lock reader: every [[package]] name/version/source. */
export const lockPackages = text => text.split(/^\[\[package\]\]$/m).slice(1).map(block => {
    const field = key => new RegExp(`^${key} = "([^"]*)"$`, 'm').exec(block)?.[1] ?? null;
    return {name: field('name'), version: field('version'), source: field('source')};
});

const sourceKind = source => !source ? 'path' : source.startsWith('registry+') ? 'crates.io'
    : source.startsWith('git+') ? `git ${/#([0-9a-f]{40})$/.exec(source)?.[1] ?? 'unpinned'}` : 'other';

/** Classify the lock against a cargo metadata resolve. */
export const buildInventory = (metadata, lockText) => {
    const byId = new Map(metadata.packages.map(p => [p.id, p]));
    const nodes = new Map(metadata.resolve.nodes.map(n => [n.id, n]));
    const isProcMacro = p => p.targets.some(t => t.kind.includes('proc-macro'));
    const linked = new Set(), host = new Set();
    const walk = (id, set, normalOnly) => {
        for (const dep of nodes.get(id).deps) {
            const kinds = dep.dep_kinds.map(k => k.kind);
            const viaNormal = kinds.includes(null), viaBuild = kinds.includes('build');
            const pkg = byId.get(dep.pkg);
            if (normalOnly && viaNormal && !isProcMacro(pkg)) {
                if (!linked.has(dep.pkg)) { linked.add(dep.pkg); walk(dep.pkg, linked, true); }
            }
            if ((normalOnly && viaNormal && isProcMacro(pkg)) || (normalOnly && viaBuild) || (!normalOnly && (viaNormal || viaBuild))) {
                if (!host.has(dep.pkg)) { host.add(dep.pkg); walk(dep.pkg, host, false); }
            }
        }
    };
    walk(metadata.resolve.root, linked, true);
    // A dependency used both linked and at build time is listed as linked only.
    for (const id of linked) host.delete(id);
    const row = id => {
        const p = byId.get(id);
        return {name: p.name, version: p.version, source: sourceKind(p.source),
            license: p.license || (p.license_file ? `see ${path.basename(p.license_file)}` : 'UNKNOWN')};
    };
    const sort = rows => rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
    const rootName = byId.get(metadata.resolve.root).name;
    const classified = new Set([...linked, ...host].map(id => `${byId.get(id).name}@${byId.get(id).version}`));
    const notOnTarget = sort(lockPackages(lockText).filter(p => p.name !== rootName && !classified.has(`${p.name}@${p.version}`))
        .map(p => ({name: p.name, version: p.version, source: sourceKind(p.source)})));
    return {schemaVersion: 1, scope: 'inventory-not-clearance', binary: 'brickwright-tauri', target: TARGET,
        features: FEATURES, cargoLockSha256: createHash('sha256').update(lockText).digest('hex'),
        counts: {linked: linked.size, buildTimeOnly: host.size, notLinkedOnTarget: notOnTarget.length},
        linked: sort([...linked].map(row)), buildTimeOnly: sort([...host].map(row)), notLinkedOnTarget: notOnTarget};
};

export const render = inventory => JSON.stringify(inventory, null, 1) + '\n';

export const main = (argv = process.argv.slice(2)) => {
    if (argv.some(a => a !== '--check') || argv.length > 1) { console.error('usage: gen-spike-linux-crate-inventory.mjs [--check]'); return 2; }
    const metadata = JSON.parse(execFileSync('cargo', METADATA_ARGS, {cwd: cargoDir, encoding: 'utf8', maxBuffer: 1 << 26}));
    const expected = render(buildInventory(metadata, readFileSync(LOCK_PATH, 'utf8')));
    if (argv[0] === '--check') {
        if (readFileSync(INVENTORY_PATH, 'utf8') !== expected) { console.error('Linux crate inventory is stale; rerun the generator'); return 1; }
        console.log('Linux crate inventory is current'); return 0;
    }
    writeFileSync(INVENTORY_PATH, expected);
    console.log(`wrote ${path.relative(rootDir, INVENTORY_PATH)}`); return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
