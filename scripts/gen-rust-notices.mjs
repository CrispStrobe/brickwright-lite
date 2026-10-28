#!/usr/bin/env node
// Regenerates the bounded Rust crate table in THIRD-PARTY-NOTICES.md from
// `cargo metadata --locked` against apps/tauri/src-tauri/Cargo.lock. The
// sections on either side are maintained separately and must survive byte for
// byte; the two markers below are the writer's safety boundary.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoDir = path.join(rootDir, 'apps/tauri/src-tauri');
const noticesPath = path.join(rootDir, 'THIRD-PARTY-NOTICES.md');

export const BEGIN_MARKER = '<!-- BEGIN GENERATED RUST CRATE LIST: run `node scripts/gen-rust-notices.mjs` to refresh, do not hand-edit below this line -->';
export const END_MARKER = '<!-- END GENERATED RUST CRATE LIST -->';
export const CARGO_METADATA_ARGS = ['metadata', '--locked', '--format-version=1'];

const exactlyOne = (text, marker, name) => {
    const first = text.indexOf(marker);
    if (first < 0) throw new Error(`Couldn't find the generated-list ${name} marker`);
    if (text.indexOf(marker, first + marker.length) >= 0) {
        throw new Error(`Generated-list ${name} marker is duplicated`);
    }
    return first;
};

/** Convert cargo metadata packages to the exact lines stored in the table. */
export const rustCrateBody = packages => {
    const seen = new Set();
    const unique = [];
    for (const p of packages.filter(p => p.name !== 'brickwright-tauri')) {
        const row = {
            name: p.name,
            version: p.version,
            license: p.license || (p.license_file ? `see ${p.license_file}` : 'UNKNOWN'),
            repository: p.repository || p.homepage || null
        };
        const key = `${row.name}@${row.version}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
    }
    // Preserve the old generator's stable ordering for equal names. Changing
    // table content belongs to N2, not this writer-safety lane.
    unique.sort((a, b) => a.name.localeCompare(b.name));
    return unique.map(p => {
        const repo = p.repository ? ` -- ${p.repository}` : '';
        return `- ${p.name} ${p.version} (${p.license})${repo}`;
    }).join('\n');
};

/** Replace only the bytes between the two markers. */
export const renderRustNotices = (existing, packages) => {
    const begin = exactlyOne(existing, BEGIN_MARKER, 'BEGIN');
    const end = exactlyOne(existing, END_MARKER, 'END');
    const bodyStart = begin + BEGIN_MARKER.length;
    if (end <= bodyStart) throw new Error('Generated-list END marker precedes its BEGIN marker');
    const before = existing.slice(0, bodyStart);
    const after = existing.slice(end);
    return `${before}\n\n${rustCrateBody(packages)}\n\n${after}`;
};

export const noticesAreCurrent = (existing, packages) =>
    renderRustNotices(existing, packages) === existing;

export const readCargoMetadata = (exec = execFileSync) => JSON.parse(exec(
    'cargo', CARGO_METADATA_ARGS, {
        cwd: cargoDir,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 64
    }
));

export const main = (argv = process.argv.slice(2), io = {}) => {
    const unknown = argv.filter(a => a !== '--check');
    if (unknown.length || argv.filter(a => a === '--check').length > 1) {
        console.error('usage: node scripts/gen-rust-notices.mjs [--check]');
        return 2;
    }
    const read = io.readFileSync || readFileSync;
    const write = io.writeFileSync || writeFileSync;
    const metadata = (io.readCargoMetadata || readCargoMetadata)();
    const existing = read(noticesPath, 'utf8');
    const expected = renderRustNotices(existing, metadata.packages);
    if (argv.includes('--check')) {
        if (expected !== existing) {
            console.error('THIRD-PARTY-NOTICES.md Rust crate table is stale; run npm run gen:notices');
            return 1;
        }
        console.log('gen-rust-notices: Rust crate table is current');
        return 0;
    }
    write(noticesPath, expected);
    const count = rustCrateBody(metadata.packages).split('\n').filter(Boolean).length;
    console.log(`gen-rust-notices: wrote ${count} crates to ${path.relative(rootDir, noticesPath)}`);
    return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        process.exitCode = main();
    } catch (error) {
        console.error(`gen-rust-notices: ${error.message}`);
        process.exitCode = 2;
    }
}
