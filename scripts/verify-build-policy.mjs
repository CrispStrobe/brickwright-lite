#!/usr/bin/env node
/** Verify the policy identity carried by a compiled Brickwright frontend. */
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'packages/scratch-gui/build');
const expected = process.env.BW_EXPECT_REMOTE_CODE_POLICY || process.argv[3] || null;
const allowed = new Set(['allow', 'deny']);

if (expected && !allowed.has(expected)) {
    throw new Error(`expected policy must be allow or deny, got ${JSON.stringify(expected)}`);
}

const manifestPath = path.join(root, 'brickwright-build.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const policy = manifest?.distributionPolicy?.remoteCode;

if (manifest.schema !== 1) throw new Error(`unsupported build-manifest schema ${manifest.schema}`);
if (manifest.product !== 'Brickwright') throw new Error(`unexpected product ${JSON.stringify(manifest.product)}`);
if (!/^(unknown|[0-9a-f]{7})$/.test(manifest.commit || '')) {
    throw new Error(`invalid build commit ${JSON.stringify(manifest.commit)}`);
}
if (!Number.isFinite(Date.parse(manifest.builtAt))) {
    throw new Error(`invalid build time ${JSON.stringify(manifest.builtAt)}`);
}
if (!allowed.has(policy)) throw new Error(`invalid emitted remote-code policy ${JSON.stringify(policy)}`);
if (expected && policy !== expected) {
    throw new Error(`compiled policy is ${policy}, expected ${expected}`);
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
const aboutToken = `remote-code=${policy}`;
if (!emitted.includes(aboutToken)) throw new Error(`emitted UI does not expose ${aboutToken}`);

const refusal = 'This distribution can load only bundled extensions';
if (policy === 'allow') {
    if (!emitted.includes('extensions-v0.json')) throw new Error('allow build has no remote extension gallery');
    if (emitted.includes(refusal)) throw new Error('allow build retained the deny-only VM refusal');
} else if (!emitted.includes(refusal)) {
    throw new Error('deny build has no VM-boundary refusal');
}

console.log(JSON.stringify({manifest: manifestPath, policy, commit: manifest.commit, jsFiles: jsFiles.length}));
