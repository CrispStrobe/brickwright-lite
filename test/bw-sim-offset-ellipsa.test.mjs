// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODELS, catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import { buildSteps } from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import { adaptAddonProgram } from '../scripts/lib/physics-addon-program.mjs';
import { judgeOffsetEllipsa } from '../scripts/lib/sim-lab-offset-ellipsa-judge.mjs';
import { loadModelLesson } from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
import { runRobotLabProgram } from './helpers/robot-lab-direct-vm.mjs';
const C = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
test('offset-orbit: shipped title and both lessons', async () => {
  const entry = MODELS.find(model => model.file === 'offset-orbit.ldr');
  assert.ok(entry, 'offset-orbit: gallery entry');
  assert.deepEqual(entry.title, {en: 'Offset Orbit — one turn, two orbits', de: 'Offset Orbit — eine Umdrehung, zwei Bahnen'});
  const read = path => readFileSync(new URL(path, import.meta.url));
  const fetcher = async path => ({ok: true, json: async () => JSON.parse(read(`../overlay/scratch-gui/${path}`))});
  for (const language of ['en', 'de']) {
    const lesson = await loadModelLesson(entry, language, {fetcher});
    assert.equal(lesson.id, 'offset-orbit');
    assert.equal(lesson.language, language);
    assert.ok(lesson.answer.length > 200, `${language}: substantive explanation`);
    assert.ok(lesson.try.length >= 3 && lesson.further.length >= 3, `${language}: practical steps`);
  }
});
for (const [id, n, limit] of [['offset-orbit', 191, 100000], ['ellipsa', 187, 190000]]) for (const autoPorts of [undefined, false]) test(`${id} (${autoPorts === false ? 'strict' : 'ordinary'}): original geometry, connected manual, actual VM and frozen output controls`, async t => {
  const base = new URL('./fixtures/model-files/' + id + '-source/', import.meta.url),
    shipped = new URL('../overlay/scratch-gui/static/sim-lab/', import.meta.url),
    original = readFileSync(new URL(id + '.ldr', base), 'utf8'),
    modelText = readFileSync(new URL('models/' + id + '.ldr', shipped), 'utf8'),
    program = readFileSync(new URL('programs/' + id + '.bw', shipped), 'utf8');
  assert.equal(program, adaptAddonProgram(id, readFileSync(new URL(id + '.bw', base))));
  const p = prepareModel(modelText, C),
    raw = prepareModel(original, C);
  assert.deepEqual(p.model.parts, raw.model.parts);
  assert.deepEqual(p.issues, []);
  for (const part of p.model.parts) assert.deepEqual(solidOverlaps(p.model, C, part), [], part.id);
  if (id === 'ellipsa') {
    const plan = buildSteps(p.model, C);
    assert.equal(plan.steps.flatMap(s => s.parts).length, n);
    assert.ok(plan.steps.every(s => !s.loose && s.parts.length <= 6));
  } else {
    // The delivered Offset Orbit revision keeps its own eleven assembly groups, so
    // its instruction pages are as coarse as the model says they are; every piece
    // must still be placed exactly once and no page may be loose.
    const plan = buildSteps(p.model, C);
    assert.equal(plan.steps.flatMap(s => s.parts).length, n);
    assert.equal(new Set(plan.steps.flatMap(s => s.parts)).size, n);
    assert.ok(plan.steps.every(s => !s.loose && s.parts.length > 0));
  }
  const r = await runRobotLabProgram(program, {
    modelText,
    timeLimitMs: limit,
    autoPorts
  });
  assert.equal(r.runModel.parts.length, n);
  assert.deepEqual(r.issues, []);
  assert.ok(r.finishedAt && r.finishedAt < limit);
  for (const f of r.track) for (const p of Object.values(f.bodies)) assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
  t.diagnostic(JSON.stringify(judgeOffsetEllipsa(id, r)));
  const outputs = id === 'offset-orbit' ? ['output_shaft', 'cross_input_keyed_bridge'] : ['trammel_bar', 'carriage_b_keyed'];
  for (const part of outputs) {
    const frozen = structuredClone(r),
      body = r.mechanism.bodies.find(b => b.parts.includes(part));
    for (const f of frozen.track) f.bodies[body.id] = structuredClone(frozen.track[0].bodies[body.id]);
    assert.throws(() => judgeOffsetEllipsa(id, frozen), 'frozen ' + part + ' must fail');
  }
  t.diagnostic(`${n} pieces, native completion ${r.finishedAt} ms`);
});
test('Ellipsa supports its saved pose for one unpowered native second', async () => {
  const modelText = readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/ellipsa.ldr', import.meta.url), 'utf8');
  const r = await runRobotLabProgram('DEVICE SPIKE\nWHEN flag clicked:\n  wait 1 seconds\n', {
    modelText,
    timeLimitMs: 2000
  });
  assert.ok(r.finishedAt >= 1000 && r.finishedAt < 1200);
  assert.deepEqual(r.issues, []);
  for (const b of r.mechanism.bodies.filter(b => b.motion === 'dynamic')) {
    const start = r.track[0].bodies[b.id].position;
    const drift = Math.max(...r.track.map(f => Math.hypot(...f.bodies[b.id].position.map((v, i) => v - start[i])) * 1000));
    assert.ok(drift < .5, b.id + ' stays supported without a motor or hold command: ' + drift + ' mm');
  }
});
