// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Separate integration identity. This never updates the original release freeze.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {supportsWasmSimd} from '../../../overlay/scratch-gui/src/lib/bw-sim/physics/wasm-simd.js';
import {checkedIntegratedRoot, ownedModuleClosure} from './provenance.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const digest = value => createHash('sha256').update(value).digest('hex');
export const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
export const MODEL_BASE = 'overlay/scratch-gui/static/sim-lab/';

function filesUnder(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const p = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(p));
    else if (entry.isFile()) out.push(p);
    else throw new Error(`Unexpected source entry: ${p}`);
  }
  return out;
}
const fileMap = (files, relativeTo = ROOT) => Object.fromEntries(files.sort().map(p => [
  path.relative(relativeTo, p).replaceAll('\\', '/'), digest(fs.readFileSync(p))]));

function revision() {
  let directory = path.join(ROOT, '.git');
  if (fs.statSync(directory).isFile()) directory = path.resolve(ROOT,
    fs.readFileSync(directory, 'utf8').trim().replace(/^gitdir:\s*/, ''));
  const head = fs.readFileSync(path.join(directory, 'HEAD'), 'utf8').trim();
  if (/^[a-f0-9]{40}$/.test(head)) return head;
  const ref = head.replace(/^ref:\s*/, ''), commonFile = path.join(directory, 'commondir');
  const common = fs.existsSync(commonFile) ? path.resolve(directory, fs.readFileSync(commonFile, 'utf8').trim()) : directory;
  for (const dir of new Set([directory, common])) {
    if (fs.existsSync(path.join(dir, ref))) return fs.readFileSync(path.join(dir, ref), 'utf8').trim();
    const packed = path.join(dir, 'packed-refs');
    if (fs.existsSync(packed)) {
      const line = fs.readFileSync(packed, 'utf8').split(/\r?\n/).find(s => s.endsWith(` ${ref}`));
      if (line) return line.split(' ')[0];
    }
  }
  throw new Error('Cannot resolve this integration checkout revision.');
}

export function checkOriginalInputs() {
  const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'original-inputs.json'), 'utf8'));
  for (const [file, row] of Object.entries(manifest.files)) {
    assert.equal(digest(fs.readFileSync(path.resolve(HERE, file))), row.sha256,
      `${row.sourceFile}: the original model, program, physical gate or independent inertia must remain exact`);
  }
  return manifest;
}

export function sourceEvidence() {
  // The registered loader and real-VM helper both honor BW_INTEGRATED_ROOT.
  // Refuse a different dependency tree before recording or running anything.
  const integratedRoot = checkedIntegratedRoot();
  const nativeFiles = fileMap(filesUnder(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim')));
  const entrypoints = ['overlay/scratch-gui/parts-subset-loader.js', 'vendor-pins.json',
    'overlay/scratch-gui/src/lib/sb3-creator-register-art.js',
    'overlay/scratch-vm/src/extensions/crispstrobe/robotlab/index.js',
    'scripts/lib/register-gui-scope.mjs', 'scripts/lib/gui-scope-hooks.mjs',
    'test/helpers/spike-arena-vm.mjs', 'test/helpers/bw-extensions.mjs', 'test/helpers/bw-integrated.mjs'];
  // These exact files are imported through computed paths by spike-arena-vm,
  // or its extension loader, when obtaining the actual VM and FakeClock.
  const computedEntrypoints = [
    'overlay/scratch-gui/src/lib/virtual-hub/web-bluetooth-shim.js',
    'overlay/scratch-gui/src/lib/virtual-hub/spike-prime-peripheral.js',
    'overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js',
    'overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js',
    'overlay/scratch-gui/src/lib/spike-arena/arena-clock.js',
    'overlay/scratch-vm/src/extensions/crispstrobe/spikeprime/index.js'
  ];
  const closure = ownedModuleClosure([...entrypoints, ...computedEntrypoints], integratedRoot);
  // bundledExtensionIds reads all entry files to select the SPIKE class. Bind
  // those registry inputs even though other extension classes are not executed.
  const extensionRoot = path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe');
  const extensionRegistry = fs.readdirSync(extensionRoot, {withFileTypes: true})
    .filter(entry => entry.isDirectory()).map(entry => path.join(extensionRoot, entry.name, 'index.js'))
    .filter(filename => fs.existsSync(filename));
  const modules = fileMap([...new Set([...closure.files, ...extensionRegistry])]);
  const dependencyRoot = path.join(integratedRoot, 'node_modules');
  const joltRoot = path.join(dependencyRoot, 'jolt-physics');
  const selectedEntry = supportsWasmSimd() ? 'dist/jolt-physics.simd.wasm-compat.js' : 'dist/jolt-physics.wasm-compat.js';
  const jolt = {version: JSON.parse(fs.readFileSync(path.join(joltRoot, 'package.json'), 'utf8')).version,
    selectedEntry, simdSupported: supportsWasmSimd(),
    files: fileMap(['package.json', 'dist/jolt-physics.wasm-compat.js', 'dist/jolt-physics.simd.wasm-compat.js']
      .map(p => path.join(joltRoot, p)), joltRoot)};
  const vmRoot = path.join(dependencyRoot, 'scratch-vm');
  const vmFiles = fileMap(filesUnder(path.join(vmRoot, 'src')), vmRoot);
  return {revision: revision(), compilerPin: JSON.parse(read('vendor-pins.json'))['sb3-creator'],
    nativeTreeSha256: digest(JSON.stringify(nativeFiles)), nativeFiles,
    metadataSha256: nativeFiles['overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'], modules,
    dependencyScope: {integratedRoot: path.relative(ROOT, integratedRoot).replaceAll('\\', '/'),
      resolvedIntegratedRoot: fs.realpathSync(integratedRoot), externalOverrideAllowed: false},
    moduleClosure: {entrypoints, computedEntrypoints,
      scope: 'Conservative owned relative-import closure; includes conditional literal imports. Computed helper entrypoints are explicit. Bare imports are listed, not claimed to be vendored here.',
      relativeImports: closure.relativeImports, bareImports: closure.bareImports,
      computedImports: closure.computedImports, installedVmImports: closure.installedVmImports,
      extensionRegistry: extensionRegistry.map(p => path.relative(ROOT, p).replaceAll('\\', '/')).sort(),
      parser: {name: closure.parser.name, version: closure.parser.version,
        files: fileMap(closure.parser.files, integratedRoot)}},
    jolt, scratchVm: {version: JSON.parse(fs.readFileSync(path.join(vmRoot, 'package.json'), 'utf8')).version,
      sourceTreeSha256: digest(JSON.stringify(vmFiles)), checkedFiles: Object.keys(vmFiles).length}};
}

export function inputEvidence() {
  return fileMap([...filesUnder(HERE), path.join(ROOT, 'test/bw-sim-resonance-program.test.mjs'),
    path.join(ROOT, 'test/bw-sim-resonance-provenance.test.mjs'),
    ...['models/resonance-lab.ldr', 'models/resonance-lab.mpd',
      'programs/resonance-lab.bw', 'programs/resonance-lab-slow.bw', 'programs/resonance-lab-fast.bw']
      .map(p => path.join(ROOT, MODEL_BASE, p))]);
}

/** Evidence destinations are new directories. Existing receipts are never replaced. */
export function evidenceWriter(directory) {
  if (!directory) return {write() {return null;}, archiveInputs() {return null;}};
  const destination = path.resolve(directory);
  if (fs.existsSync(destination)) assert.equal(fs.readdirSync(destination).length, 0,
    'Use an empty evidence directory; never overwrite an earlier success or failure.');
  fs.mkdirSync(destination, {recursive: true});
  return {
    write(name, value) {
      assert.match(name, /^[a-z0-9-]+\.json$/);
      const text = JSON.stringify(value, null, 2) + '\n';
      fs.writeFileSync(path.join(destination, name), text, {flag: 'wx'});
      return {file: name, sha256: digest(text)};
    },
    archiveInputs(inputs, source) {
      const all = {...source.nativeFiles, ...source.modules, ...inputs};
      for (const [name, expected] of Object.entries(all)) {
        const bytes = fs.readFileSync(path.join(ROOT, name));
        assert.equal(digest(bytes), expected, `${name}: exact predeclared input`);
        const to = path.join(destination, 'frozen-inputs', name);
        fs.mkdirSync(path.dirname(to), {recursive: true}); fs.writeFileSync(to, bytes, {flag: 'wx'});
      }
      return {path: 'frozen-inputs', files: all};
    }
  };
}
