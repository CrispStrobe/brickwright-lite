#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Generates docs/generated/spike-macos-crate-inventory-<triple>.json: the crates that
// would be linked into `brickwright-tauri` for the two macOS targets (features
// `custom-protocol`), using the Linux generator's classifier. Read-only:
// `cargo metadata --locked --offline --filter-platform <triple>`; no build, no network.
// Inventory, not clearance.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LOCK_PATH, FEATURES, buildInventory, render} from './gen-spike-linux-crate-inventory.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoDir = path.join(rootDir, 'apps/tauri/src-tauri');
export const TARGETS = ['aarch64-apple-darwin', 'x86_64-apple-darwin'];
export const inventoryPath = target => path.join(rootDir, `docs/generated/spike-macos-crate-inventory-${target}.json`);

export const generate = target => {
    const args = ['metadata', '--locked', '--offline', '--format-version=1', '--filter-platform', target,
        '--features', FEATURES.join(',')];
    const metadata = JSON.parse(execFileSync('cargo', args, {cwd: cargoDir, encoding: 'utf8', maxBuffer: 1 << 26}));
    return render({...buildInventory(metadata, readFileSync(LOCK_PATH, 'utf8')), target});
};

export const main = (argv = process.argv.slice(2)) => {
    if (argv.some(a => a !== '--check') || argv.length > 1) { console.error('usage: gen-spike-macos-crate-inventory.mjs [--check]'); return 2; }
    let stale = 0;
    for (const target of TARGETS) {
        const expected = generate(target);
        if (argv[0] === '--check') {
            if (readFileSync(inventoryPath(target), 'utf8') !== expected) { console.error(`${target} crate inventory is stale`); stale = 1; }
        } else {
            writeFileSync(inventoryPath(target), expected);
            console.log(`wrote ${path.relative(rootDir, inventoryPath(target))}`);
        }
    }
    return stale;
};

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
