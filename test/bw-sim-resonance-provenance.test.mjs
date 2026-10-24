// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, sourceEvidence, digest, inputEvidence} from './helpers/resonance/source.mjs';
import {checkedIntegratedRoot, ownedModuleClosure} from './helpers/resonance/provenance.mjs';
import {runNativeProgram} from './helpers/resonance/runtime/program-vm.mjs';

test('Resonance provenance rejects an external VM dependency root before qualification', async () => {
  assert.equal(checkedIntegratedRoot(''), path.join(ROOT, 'packages/scratch-gui'));
  assert.equal(checkedIntegratedRoot(path.join(ROOT, 'packages/scratch-gui')), path.join(ROOT, 'packages/scratch-gui'));
  assert.throws(() => checkedIntegratedRoot(ROOT), /refuses an external BW_INTEGRATED_ROOT/);
  const previous = process.env.BW_INTEGRATED_ROOT;
  process.env.BW_INTEGRATED_ROOT = ROOT;
  try {
    assert.throws(() => sourceEvidence(), /refuses an external BW_INTEGRATED_ROOT/);
    await assert.rejects(() => runNativeProgram({source: 'DEVICE ROBOTLAB',
      rig: {api: {}, session: {}, tick() {assert.fail('No native step may run before dependency-root validation.');}}}),
    /refuses an external BW_INTEGRATED_ROOT/);
  } finally {
    if (previous === undefined) delete process.env.BW_INTEGRATED_ROOT;
    else process.env.BW_INTEGRATED_ROOT = previous;
  }
});

test('Resonance provenance follows real relative imports and ignores source-shaped strings', () => {
  const fixtureRoot = path.join(ROOT, 'artifacts'); fs.mkdirSync(fixtureRoot, {recursive: true});
  const directory = fs.mkdtempSync(path.join(fixtureRoot, 'resonance-provenance-'));
  try {
    fs.writeFileSync(path.join(directory, 'entry.mjs'), [
      "import './direct.mjs';", "export {value} from './reexport.mjs';",
      "const lazy = () => import('./dynamic.mjs');", "const cjs = () => require('./common.js');",
      "const prose = \"require('./not-an-import.js')\";", "// import './not-a-comment.js';"
    ].join('\n'));
    for (const filename of ['direct.mjs', 'reexport.mjs', 'dynamic.mjs', 'common.js']) {
      fs.writeFileSync(path.join(directory, filename), 'export const value = 1;\n');
    }
    const closure = ownedModuleClosure([path.join(directory, 'entry.mjs')]);
    assert.equal(closure.files.length, 5);
    assert.equal(closure.relativeImports.length, 4);
    fs.writeFileSync(path.join(directory, 'entry.mjs'), "import './missing.mjs';\n");
    assert.throws(() => ownedModuleClosure([path.join(directory, 'entry.mjs')]), /Unresolved relative source import/);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});

test('Resonance freeze includes hub/backend and compiler registration/menu transitive source', () => {
  const evidence = sourceEvidence();
  const required = [
    'overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js',
    'overlay/scratch-gui/src/lib/virtual-hub/spike-motor-model.js',
    'overlay/scratch-gui/src/lib/spike-sim/independent-backend.js',
    'overlay/scratch-gui/src/lib/spike-sim/speed-envelope.mjs',
    'overlay/scratch-gui/src/lib/sb3-creator-register-art.js',
    'overlay/scratch-gui/src/lib/sb3-creator.js',
    'overlay/scratch-gui/src/lib/sb3-creator-vector-art.js',
    'overlay/scratch-gui/src/lib/spike-runtime-ops.js',
    'overlay/scratch-gui/src/lib/spike-legacy-migration.js',
    'overlay/scratch-gui/src/lib/robot-lab-pseudocode.js',
    'overlay/scratch-gui/src/lib/extension-menu-args.js',
    'overlay/scratch-gui/src/lib/extension-menu-table.js',
    'scripts/lib/register-gui-scope.mjs', 'scripts/lib/gui-scope-hooks.mjs'
  ];
  for (const filename of required) assert.equal(evidence.modules[filename], digest(fs.readFileSync(path.join(ROOT, filename))), filename);
  assert.equal(evidence.dependencyScope.externalOverrideAllowed, false);
  assert.equal(evidence.dependencyScope.resolvedIntegratedRoot, fs.realpathSync(checkedIntegratedRoot()));
  assert.ok(evidence.moduleClosure.relativeImports.length > required.length);
  assert.ok(evidence.moduleClosure.installedVmImports.length > 0);
  assert.ok(inputEvidence()['test/bw-sim-resonance-provenance.test.mjs']);
});
