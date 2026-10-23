// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyResonance} from './helpers/resonance/qualify.mjs';

test('Resonance Lab: current native compiler/VM, both cold starts and all six fixed-gate finite responses', async t => {
  const report = await qualifyResonance({evidenceDirectory: process.env.BW_RESONANCE_EVIDENCE_DIR,
    diagnostic: value => t.diagnostic(JSON.stringify(value))});
  t.diagnostic(JSON.stringify({passed: report.passed, sourceRevision: report.source.revision,
    nativeTreeSha256: report.source.nativeTreeSha256, metadataSha256: report.source.metadataSha256,
    compilerPin: report.source.compilerPin, jolt: report.source.jolt, inputsAndSourceUnchanged: report.inputsAndSourceUnchanged,
    comparisons: report.comparisons, crossMode: report.crossMode}));
  assert.equal(report.passed, true, report.error || 'A fixed physical gate or source-identity check failed.');
});
