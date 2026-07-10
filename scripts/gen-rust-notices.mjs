#!/usr/bin/env node
// Regenerates the Rust crate table in THIRD-PARTY-NOTICES.md from
// `cargo metadata` against apps/tauri/src-tauri/Cargo.lock. The JS/Scratch-
// stack section above it is pinned to a frozen upstream snapshot and is
// maintained by hand -- only the "## Rust" section is auto-generated.
import {execFileSync} from 'child_process';
import {readFileSync, writeFileSync} from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoDir = path.join(rootDir, 'apps/tauri/src-tauri');
const noticesPath = path.join(rootDir, 'THIRD-PARTY-NOTICES.md');

const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--format-version=1'], {
    cwd: cargoDir,
    maxBuffer: 1024 * 1024 * 64
}));

const pkgs = metadata.packages
    .filter(p => p.name !== 'brickwright-tauri')
    .map(p => ({
        name: p.name,
        version: p.version,
        license: p.license || (p.license_file ? `see ${p.license_file}` : 'UNKNOWN'),
        repository: p.repository || p.homepage || null
    }));

const seen = new Set();
const unique = [];
for (const p of pkgs) {
    const key = `${p.name}@${p.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
}
unique.sort((a, b) => a.name.localeCompare(b.name));

const body = unique.map(p => {
    const repo = p.repository ? ` -- ${p.repository}` : '';
    return `- ${p.name} ${p.version} (${p.license})${repo}`;
}).join('\n');

const existing = readFileSync(noticesPath, 'utf8');
const marker = '<!-- BEGIN GENERATED RUST CRATE LIST: run `node scripts/gen-rust-notices.mjs` to refresh, do not hand-edit below this line -->';
const markerIndex = existing.indexOf(marker);
if (markerIndex === -1) {
    throw new Error(`Couldn't find the generated-list marker in ${noticesPath}`);
}
const before = existing.slice(0, markerIndex + marker.length);
writeFileSync(noticesPath, `${before}\n\n${body}\n`);

console.log(`gen-rust-notices: wrote ${unique.length} crates to ${path.relative(rootDir, noticesPath)}`);
