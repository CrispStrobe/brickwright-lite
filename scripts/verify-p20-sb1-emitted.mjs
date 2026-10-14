#!/usr/bin/env node
/** Measure the P20 candidate's emitted chunk and enforce its 75 KiB floor. */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {REVIEWED_P20_RECEIPT} from './lib/p20-sb1-receipt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.resolve(process.env.BW_BUILD || path.join(root, 'packages', 'scratch-gui', 'build'));
const output = path.resolve(process.env.P20_RECEIPT ||
    path.join(root, 'artifacts', 'p20-sb1-converter', 'emitted-receipt.json'));
const packageJsonPath = path.resolve(process.env.P20_PACKAGE_JSON ||
    path.join(root, 'packages', 'scratch-gui', 'node_modules', 'scratch-sb1-converter', 'package.json'));
const packageLockPath = path.resolve(process.env.P20_PACKAGE_LOCK ||
    path.join(root, 'packages', 'scratch-gui', 'package-lock.json'));
const floorBytes = 75 * 1024;
const chunks = path.join(build, 'chunks');
const candidates = existsSync(chunks) ? readdirSync(chunks)
    .filter(name => /^sb1-converter(?:\.|\.js$)/.test(name) && name.endsWith('.js')) : [];
const errors = [];
if (candidates.length !== 1) errors.push(`expected one sb1-converter chunk, found ${candidates.length}`);

let packageIdentity = null;
try {
    const pkg = JSON.parse(readFileSync(packageJsonPath));
    const lock = JSON.parse(readFileSync(packageLockPath));
    const pinned = lock.packages?.['node_modules/scratch-sb1-converter'];
    packageIdentity = {name: pkg.name, version: pkg.version, integrity: pinned?.integrity};
    if (pkg.name !== 'scratch-sb1-converter' || pkg.version !== '1.0.317' || pinned?.version !== pkg.version ||
        pinned?.integrity !== REVIEWED_P20_RECEIPT.package.integrity) {
        errors.push('scratch-sb1-converter package identity differs from the reviewed pin');
    }
} catch (error) {
    errors.push(`cannot read scratch-sb1-converter package identity: ${error.message}`);
}

let emittedBytes = 0;
let gzipBytes = 0;
let sha256 = null;
if (candidates.length === 1) {
    const content = readFileSync(path.join(chunks, candidates[0]));
    emittedBytes = statSync(path.join(chunks, candidates[0])).size;
    gzipBytes = gzipSync(content, {level: 9}).length;
    sha256 = createHash('sha256').update(content).digest('hex');
    if (!Number.isFinite(emittedBytes) || emittedBytes <= 0) errors.push(`invalid emitted size ${emittedBytes}`);
}

const index = existsSync(path.join(build, 'index.html')) ? readFileSync(path.join(build, 'index.html'), 'utf8') : '';
if (!index) errors.push('build/index.html is missing');
if (index.includes('sb1-converter')) errors.push('index.html eagerly references sb1-converter');
const clearsFloor = errors.length === 0 && emittedBytes >= floorBytes;
const receipt = {
    schema: 'brickwright/p20-sb1-converter-emitted/v1',
    hostedRun: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
    commit: process.env.GITHUB_SHA || null,
    package: packageIdentity,
    chunk: candidates.length === 1 ? candidates[0] : null,
    emittedBytes,
    gzipBytes,
    sha256,
    floorBytes,
    clearsFloor,
    errors
};
mkdirSync(path.dirname(output), {recursive: true});
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
if (errors.length) process.exitCode = 1;
else if (!clearsFloor) process.exitCode = 2;
