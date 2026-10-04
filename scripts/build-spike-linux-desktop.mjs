#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Offline local assembly. No firmware downloads, uploads or system installation.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile, cp, mkdir, readdir, readFile, realpath, lstat, writeFile, chmod} from 'node:fs/promises';
import {dirname, join, resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const [supportArg, runtimeArg, frontendArg, outputArg, mode] = process.argv.slice(2);
const prepareOnly = mode === '--prepare-only';
if (!([6, 7].includes(process.argv.length)) || (mode && !prepareOnly) || process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Usage on Linux x64: build-spike-linux-desktop.mjs SUPPORT_DIRECTORY RENODE_DIRECTORY FRONTEND_DIRECTORY NEW_OUTPUT_DIRECTORY [--prepare-only]');
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const support = await realpath(supportArg), runtime = await realpath(runtimeArg), frontend = await realpath(frontendArg);
const output = resolve(outputArg);
if ([repo, support, runtime, frontend].some(root => output === root || output.startsWith(root + sep))) {
    throw new Error('Keep generated packages outside source and input directories');
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const libraries = ['libMono.Unix.so', 'libSystem.Globalization.Native.so', 'libSystem.IO.Compression.Native.so',
    'libSystem.Native.so', 'libSystem.Net.Security.Native.so', 'libSystem.Security.Cryptography.Native.OpenSsl.so',
    'libclrjit.so', 'libcoreclr.so', 'libcoreclrtraceptprovider.so', 'libhostfxr.so', 'libhostpolicy.so',
    'libllvm-disas.so', 'libmscordaccore.so', 'libmscordbi.so'];
const regular = async (root, name, limit) => {
    const path = join(root, name), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > limit || info.size === 0) throw new Error('Invalid bounded package input');
    const actual = await realpath(path);
    if (!actual.startsWith(root + sep)) throw new Error('Package input escaped its root');
    return {path, bytes: await readFile(path)};
};
const nativeFiles = [];
for (const name of ['renode', ...libraries]) {
    const item = await regular(runtime, name, 512 * 1024 * 1024);
    if (!item.bytes.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70]))) throw new Error('Runtime input must be ELF');
    nativeFiles.push({name, ...item});
}
// Renode discovers its monitor startup helpers through this runtime root marker.
// The state service uses the upstream monitor's documented external accessor.
for (const name of ['.renode-root', 'scripts/monitor.py']) {
    const item = await regular(runtime, name, 1024 * 1024);
    nativeFiles.push({name, ...item});
}
const notices = await readdir(join(runtime, 'licenses'));
if (!notices.includes('renode-license') || notices.length > 128 ||
    notices.some(name => !/^[A-Za-z0-9_.-]+-license$/.test(name))) throw new Error('Unexpected runtime notice closure');
for (const name of notices.sort()) {
    const item = await regular(runtime, `licenses/${name}`, 1024 * 1024);
    nativeFiles.push({name: `licenses/${name}`, ...item});
}
// Reject links throughout the frontend and record exactly what gets embedded.
const frontendInventory = {};
let frontendBytes = 0;
async function inventory (root, directory = root) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Frontend links are unsupported');
        if (entry.isDirectory()) await inventory(root, path);
        else {
            if (!entry.isFile()) throw new Error('Frontend contains a nonregular file');
            const metadata = await lstat(path);
            if (metadata.size > 512 * 1024 * 1024) throw new Error('Frontend file exceeds package bounds');
            const data = await readFile(path); frontendBytes += data.length;
            if (frontendBytes > 512 * 1024 * 1024) throw new Error('Frontend exceeds package bounds');
            frontendInventory[relative(root, path).split(sep).join('/')] = digest(data);
        }
    }
}
await inventory(frontend);
if (!frontendInventory['index.html'] || !frontendInventory['capability-broker.html']) throw new Error('Frontend lacks desktop broker assets');
await mkdir(output, {mode: 0o700}); // Every existing output is preserved, including partial builds.
const targetDirectory = resolve(process.env.BW_LINUX_BUILD_TARGET_DIR || join(output, 'target'));
// Tauri uses productName as PackageInfo.name when resolving Linux resources.
const appConfig = JSON.parse(await readFile(join(repo, 'apps/tauri/src-tauri/tauri.conf.json'), 'utf8'));
const resourceName = appConfig.productName;
if (typeof resourceName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(resourceName)) throw new Error('Invalid Linux resource directory name');
await writeFile(join(output, 'install-layout.json'), JSON.stringify({resourceDirectory: `usr/lib/${resourceName}`, executable: 'usr/bin/brickwright-tauri'}) + '\n');
const resources = join(output, 'resources'); await mkdir(resources);
const runtimeOutput = join(resources, 'renode'); await mkdir(runtimeOutput);
const resourceMap = {};
for (const item of nativeFiles) {
    const destination = join(runtimeOutput, item.name); await mkdir(dirname(destination), {recursive: true});
    await writeFile(destination, item.bytes, {mode: item.name === 'renode' ? 0o755 : 0o644});
    resourceMap[destination] = `renode/${item.name}`;
}
const profile = join(resources, 'micropython');
execFileSync(process.execPath, [join(repo, 'scripts/prepare-spike-micropython-pins.mjs'), support,
    join(runtimeOutput, 'renode'), profile, '--resource-root', resources], {stdio: 'inherit'});
const pins = JSON.parse(await readFile(join(profile, 'pins.json'), 'utf8'));
const config = JSON.parse(await readFile(join(profile, 'tauri-support-resources.json'), 'utf8'));
Object.assign(config.bundle.resources, resourceMap);config.build = {frontendDist: frontend};
await writeFile(join(output, 'tauri-config.json'), JSON.stringify(config, null, 2) + '\n');
await writeFile(join(output, 'compile-pins.json'), JSON.stringify(pins, null, 2) + '\n');
const manifest = {schemaVersion: 1, scope: 'local-offline-assembly', redistributionValidated: false,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
    frontend: frontendInventory, runtime: Object.fromEntries(nativeFiles.map(item => [item.name, digest(item.bytes)])), pins};
await writeFile(join(output, 'build-inputs.json'), JSON.stringify(manifest, null, 2) + '\n');
// Keep mobile targets intact in the repository; compile an isolated desktop profile.
const desktopSource = join(output, 'desktop-source'), crateRelative = 'apps/tauri/src-tauri';
for (const name of ['src', 'vendor', 'plugins', 'icons', 'capabilities', 'runtime-capabilities',
    'build.rs', 'tauri.conf.json', 'Cargo.toml', 'Cargo.lock']) {
    const source = join(repo, crateRelative, name), destination = join(desktopSource, crateRelative, name);
    await mkdir(dirname(destination), {recursive: true});await cp(source, destination, {recursive: true});
}
for (const name of ['overlay/scratch-vm/src/extension-support/native-broker-protocol.js',
    'overlay/scratch-gui/static/native-broker/native-broker-host.js']) {
    const destination = join(desktopSource, name);await mkdir(dirname(destination), {recursive: true});
    await copyFile(join(repo, name), destination);
}
const sourceFiles = {};
async function recordSources (directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) await recordSources(file);
        else if (entry.isFile()) sourceFiles[relative(desktopSource, file).split(sep).join('/')] = digest(await readFile(file));
        else throw new Error('Native source closure contains a nonregular file');
    }
}
await recordSources(desktopSource);
await writeFile(join(output, 'native-source-inputs.json'), JSON.stringify({schemaVersion: 1,
    sourceCommit: manifest.sourceCommit, files: sourceFiles}, null, 2) + '\n');
const desktopManifest = join(desktopSource, crateRelative, 'Cargo.toml');
const originalManifest = await readFile(desktopManifest, 'utf8');
const mobileTargets = 'crate-type = ["staticlib", "cdylib", "rlib"]';
if (originalManifest.split(mobileTargets).length !== 2) throw new Error('Unexpected native library targets');
await writeFile(desktopManifest, originalManifest.replace(mobileTargets, 'crate-type = ["rlib"]'));
await writeFile(join(output, 'desktop-profile.json'), JSON.stringify({schemaVersion: 1,
    sourceCommit: manifest.sourceCommit, originalManifestSha256: digest(Buffer.from(originalManifest)),
    desktopManifestSha256: digest(await readFile(desktopManifest)), nativeLibraryTargets: ['rlib']}, null, 2) + '\n');
if (prepareOnly) {
    console.log('Verified local resource closure prepared; no compiler, firmware or installer was run.');
    process.exit(0);
}
execFileSync('cargo', ['build', '--locked', '--offline', '--manifest-path', desktopManifest,
    '--features', 'custom-protocol', '--bin', 'brickwright-tauri'], {cwd: repo, stdio: 'inherit',
    env: {...process.env, ...pins, TAURI_CONFIG: JSON.stringify(config), CARGO_TARGET_DIR: targetDirectory,
        CARGO_PROFILE_DEV_DEBUG: '0', CARGO_INCREMENTAL: '0', CARGO_BUILD_JOBS: '2'}});
// A debug-symbol-free development build is intentional. No reproducible release-byte claim.
const binary = join(targetDirectory, 'debug/brickwright-tauri');
const packageRoot = join(output, 'package'), installedResources = join(packageRoot, 'usr/lib', resourceName);
await mkdir(installedResources, {recursive: true});await mkdir(join(packageRoot, 'usr/bin'), {recursive: true});
await copyFile(binary, join(packageRoot, 'usr/bin/brickwright-tauri'));await chmod(join(packageRoot, 'usr/bin/brickwright-tauri'), 0o755);
for (const [source, destination] of Object.entries(config.bundle.resources)) {
    const file = join(installedResources, destination);await mkdir(dirname(file), {recursive: true});await copyFile(source, file);
}
await chmod(join(installedResources, 'renode/renode'), 0o755);
await mkdir(join(packageRoot, 'usr/share/applications'), {recursive: true});
await writeFile(join(packageRoot, 'usr/share/applications/brickwright.desktop'),
    '[Desktop Entry]\nType=Application\nName=Brickwright\nExec=brickwright-tauri\nTerminal=false\nCategories=Education;\n');
await mkdir(join(packageRoot, 'DEBIAN'));
const cargo = await readFile(join(repo, 'apps/tauri/src-tauri/Cargo.toml'), 'utf8');
const version = /^version = "([0-9]+\.[0-9]+\.[0-9]+)"$/m.exec(cargo)?.[1];if (!version) throw new Error('Invalid app package version');
await writeFile(join(packageRoot, 'DEBIAN/control'), `Package: brickwright\nVersion: ${version}\nArchitecture: amd64\nMaintainer: Brickwright contributors\nDepends: libgtk-3-0, libwebkit2gtk-4.1-0, libstdc++6, zlib1g\nDescription: Brickwright local SPIKE simulation desktop\n`);
const deb = join(output, `brickwright_${version}_amd64.deb`);
execFileSync('dpkg-deb', ['--build', '--root-owner-group', '--threads-max=2', packageRoot, deb], {stdio: 'inherit'});
await writeFile(join(output, 'package-receipt.json'), JSON.stringify({schemaVersion: 1,
    sha256: digest(await readFile(deb)), binarySha256: digest(await readFile(binary)),
    runtimeSha256: pins.BW_RENODE_SHA256, firmwareBundled: false, redistributionValidated: false}, null, 2) + '\n');
console.log(`Local package assembled at ${deb}. Firmware is supplied separately through the native chooser.`);
