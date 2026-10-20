// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicMaterial, Scene } from 'three';
import { createSurfaceDrawing } from '../overlay/scratch-gui/src/lib/bw-sim/view/surface-drawing.js';
import {sampleDrawingSnapshot} from '../overlay/scratch-gui/src/lib/bw-sim/view/drawing-sampler.js';
import { parseModel, serializeModel } from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import { validatePlacedModel } from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const drawing = {
  surface: 'paper',
  pen: 'holder',
  tip: [0, 0, 0],
  center: [0, 0, 0],
  radiusLdu: 150
};
const model = () => ({
  version: 1,
  parts: ['paper', 'holder'].map(id => ({
    id,
    part: '32523.dat',
    position: [0, 0, 0],
    rotation: I
  })),
  drawings: [drawing]
});
test('DRAW bindings round trip, validate local coordinates and refuse malformed or missing part references', () => {
  const source = serializeModel(model());
  const parsed = parseModel(source);
  assert.deepEqual(parsed.refusals, []);
  assert.deepEqual(parsed.model.drawings, [drawing]);
  assert.deepEqual(validatePlacedModel(parsed.model), []);
  const credited = {
    ...model(),
    attribution: {
      author: 'Example designer',
      license: 'Licensed under CC BY 4.0'
    }
  };
  assert.deepEqual(parseModel(serializeModel(credited)).model.attribution, credited.attribution, 'editing retains authorship and licence');
  for (const bad of [source.replace('DRAW paper holder', 'DRAW missing holder'), source.replace(' 150\r\n', ' -1\r\n'), source.replace('DRAW paper holder 0', 'DRAW paper holder NaN')]) {
    assert.ok(parseModel(bad).refusals.some(r => r.code === 'bad-drawing'));
  }
  assert.ok(validatePlacedModel({
    ...model(),
    drawings: [{
      ...drawing,
      radiusLdu: Infinity
    }]
  }).length);
});
test('ink uses real pen coordinates in the moving paper frame; lifting, leaving paper and reset do not draw', () => {
  const scene = new Scene();
  const paper = new Mesh(new BoxGeometry(.01, .001, .01), new MeshBasicMaterial());
  const holder = new Mesh(new BoxGeometry(.001, .001, .001), new MeshBasicMaterial());
  holder.position.set(.03, 0, 0);
  scene.add(paper, holder);
  paper.visible = false;
  holder.visible = false; // instanced source proxies
  const built = {
    scene,
    partMeshes: new Map([['paper', paper], ['holder', holder]])
  };
  const layer = createSurfaceDrawing({
    model: model(),
    built
  });
  built.bodyGroups = new Map();
  const sample = () => sampleDrawingSnapshot({built, pens: layer, snapshot: {bodyIds: [], bodies: new Float32Array()}});
  try {
    assert.equal(sample(), true, 'a physics sample adds ink without rendering');
    assert.equal(sample(), false, 'an unchanged nib does not force an idle WebGL redraw');
    assert.deepEqual(layer.strokes(), []);
    paper.rotation.y = Math.PI / 2;
    layer.update();
    const stroke = layer.strokes()[0];
    assert.equal(stroke.length, 2);
    assert.ok(Math.abs(stroke[0][0] - .03) < 1e-9 && Math.abs(stroke[1][0]) < 1e-9 && Math.abs(stroke[1][1] - .03) < 1e-9);
    // Translating the complete rig leaves the paper-relative drawing unchanged.
    paper.position.x += .5;
    holder.position.x += .5;
    layer.update();
    assert.equal(layer.strokes()[0].length, 2);
    holder.position.y = .01;
    holder.position.z = .02;
    layer.update();
    assert.equal(layer.strokes()[0].length, 2);
    holder.position.y = -.01;
    layer.update();
    assert.equal(layer.strokes()[0].length, 2, 'below the paper is not contact');
    holder.position.y = 0;
    holder.position.z = .2;
    layer.update();
    assert.equal(layer.strokes()[0].length, 2, 'outside disk is not contact');
    holder.position.z = .01;
    layer.update();
    holder.position.z = .02;
    layer.update();
    assert.equal(layer.strokes().length, 2, 'a lifted pen starts a separate stroke');
  } finally {
    layer.dispose();
  }
  assert.equal(paper.children.length, 0);
  assert.equal(holder.children.length, 0);
  const fresh = createSurfaceDrawing({
    model: model(),
    built
  });
  assert.deepEqual(fresh.strokes(), []);
  fresh.dispose();
  for (const mesh of [paper, holder]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
