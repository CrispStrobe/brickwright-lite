#!/usr/bin/env node
// Verify the emitted payload, not merely the pre-build copy input.
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateProofPackage} from './package-native-broker-proof-pins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function verifyEmittedNativeBrokerProof({rootDir = ROOT, buildDir = path.join(rootDir, 'packages/scratch-gui/build')} = {}) {
    const pins = JSON.parse(await readFile(path.join(rootDir, 'overlay/scratch-vm/src/extension-support/gallery-proof-pins.json'), 'utf8'));
    const source = await readFile(path.join(rootDir, 'overlay/scratch-gui/static/test-fixtures/capability-probe.js'));
    // Reuse the reviewed exact digest/size/alias/capability authority, not output's claims.
    const expected = generateProofPackage(pins, source);
    const output = path.join(buildDir, 'static/native-broker/proof-pins');
    const manifest = await readFile(path.join(output, 'manifest.json'), 'utf8').catch(() => null);
    if (manifest !== expected.manifestText) throw new Error('emitted native broker proof manifest missing or differs from reviewed pins/aliases');
    const names = await readdir(path.join(output, 'sources')).catch(() => []);
    if (names.length !== 1 || names[0] !== path.basename(expected.asset)) throw new Error('emitted native broker proof source set missing or unexpected');
    const bytes = await readFile(path.join(output, expected.asset));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== source.length || digest !== expected.digest || !bytes.equals(source)) {
        throw new Error(`emitted native broker proof source changed: ${bytes.length} bytes/${digest}; expected ${source.length} bytes/${expected.digest}`);
    }
    return Object.freeze({aliases: Object.keys(expected.manifest.aliases).length, bytes: bytes.length, digest});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length > 3) { console.error('usage: verify-emitted-native-broker-proof.mjs [build-directory]'); process.exitCode = 1; }
    else verifyEmittedNativeBrokerProof(process.argv[2] ? {buildDir: path.resolve(process.argv[2])} : {}).then(
        result => console.log(`emitted native broker proof verified: ${result.aliases} aliases, ${result.bytes} bytes, ${result.digest}`),
        error => {console.error(error.message); process.exitCode = 1;}
    );
}
