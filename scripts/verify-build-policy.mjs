#!/usr/bin/env node
/** Verify the policy identity carried by a compiled Brickwright frontend. */
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'packages/scratch-gui/build');
const umbrellaExpected = process.env.BW_EXPECT_REMOTE_CODE_POLICY || process.argv[3] || null;
const allowed = new Set(['allow', 'deny']);

if (umbrellaExpected && !allowed.has(umbrellaExpected)) {
    throw new Error(`expected policy must be allow or deny, got ${JSON.stringify(umbrellaExpected)}`);
}

const manifestPath = path.join(root, 'brickwright-build.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const policies = manifest?.distributionPolicy || {};
const expected = {
    remoteExtensions: process.env.BW_EXPECT_REMOTE_EXTENSIONS_POLICY || umbrellaExpected,
    executableToolchains: process.env.BW_EXPECT_REMOTE_TOOLCHAINS_POLICY || umbrellaExpected,
    machineImages: process.env.BW_EXPECT_REMOTE_MACHINE_IMAGES_POLICY || umbrellaExpected
};

if (manifest.schema !== 2) throw new Error(`unsupported build-manifest schema ${manifest.schema}`);
if (manifest.product !== 'Brickwright') throw new Error(`unexpected product ${JSON.stringify(manifest.product)}`);
if (!/^(unknown|[0-9a-f]{7})$/.test(manifest.commit || '')) {
    throw new Error(`invalid build commit ${JSON.stringify(manifest.commit)}`);
}
if (!Number.isFinite(Date.parse(manifest.builtAt))) {
    throw new Error(`invalid build time ${JSON.stringify(manifest.builtAt)}`);
}
for (const [name, value] of Object.entries(policies)) {
    if (!allowed.has(value)) throw new Error(`invalid emitted ${name} policy ${JSON.stringify(value)}`);
}
for (const name of Object.keys(expected)) {
    if (!allowed.has(policies[name])) throw new Error(`missing emitted ${name} policy`);
    if (expected[name] && policies[name] !== expected[name]) {
        throw new Error(`compiled ${name} policy is ${policies[name]}, expected ${expected[name]}`);
    }
}

const jsFiles = [];
const walk = async directory => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(file);
    }
};
await walk(root);
const emitted = (await Promise.all(jsFiles.map(file => readFile(file, 'utf8')))).join('\n');
const aboutTokens = {
    remoteExtensions: `remote-extensions=${policies.remoteExtensions}`,
    executableToolchains: `toolchains=${policies.executableToolchains}`,
    machineImages: `machine-images=${policies.machineImages}`
};
for (const token of Object.values(aboutTokens)) {
    if (!emitted.includes(token)) throw new Error(`emitted UI does not expose ${token}`);
}

const refusal = 'This distribution can load only bundled extensions';
if (policies.remoteExtensions === 'allow') {
    if (!emitted.includes('extensions-v0.json')) throw new Error('allow build has no remote extension gallery');
    if (emitted.includes(refusal)) throw new Error('allow build retained the deny-only VM refusal');
} else if (!emitted.includes(refusal)) {
    throw new Error('deny build has no VM-boundary refusal');
}

if (policies.executableToolchains === 'allow') {
    if (!emitted.includes('crispstrobe.github.io/sdcc-wasm')) throw new Error('allow build has no optional toolchain origin');
} else if (!emitted.includes('distribution cannot download executable toolchains')) {
    throw new Error('deny build has no executable-toolchain refusal');
}

if (policies.machineImages === 'allow') {
    if (!emitted.includes('brickwright-media-lab')) throw new Error('allow build has no pinned machine-image lesson');
} else if (!emitted.includes('restricted build does not download executable machine images')) {
    throw new Error('deny build has no machine-image refusal');
}

console.log(JSON.stringify({manifest: manifestPath, policies, commit: manifest.commit, jsFiles: jsFiles.length}));
