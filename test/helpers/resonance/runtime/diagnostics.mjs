// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Verify the exact four native warnings from the two deliberately rigid,
// retained two-shaft rocker stacks. Preserve every native diagnostic.
import assert from 'node:assert/strict';

const EPS = 1e-7;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = v => Math.hypot(...v);
const near = (a, b, label) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS, label);
const signature = values => [...values].sort().join('|');

export const EXPECTED_PREPARATION_DIAGNOSTICS = Object.freeze(['input', 'output'].flatMap(role => [
  Object.freeze({role, layer: 'key-and-bridge', parts: Object.freeze([
    `${role}_anchor_axle_neg`, `${role}_anchor_axle_pos`, `${role}_anchor_bridge`, `${role}_axle`, `${role}_key`])}),
  Object.freeze({role, layer: 'beam', parts: Object.freeze([
    `${role}_anchor_axle_neg`, `${role}_anchor_axle_pos`, `${role}_beam`])})
]));

/** Read source connectors and original placements, never alter inferred
 * islands/constraints or replace a warning with an empty issue list.
 */
export function verifyPreparationDiagnostics({model, mechanism, issues}, catalog) {
  assert.ok(Array.isArray(issues));
  assert.equal(issues.length, EXPECTED_PREPARATION_DIAGNOSTICS.length,
    'Exactly the four declared two-shaft rocker warnings are expected.');
  const expected = new Map(EXPECTED_PREPARATION_DIAGNOSTICS.map(row => [signature(row.parts), row]));
  const seen = new Set();
  for (const diagnostic of issues) {
    assert.equal(diagnostic.severity, 'warning');
    assert.equal(diagnostic.code, 'locked-hinges');
    assert.match(diagnostic.message, /^Hinges between b\d+ and b\d+ lock, merging islands$/);
    assert.equal(new Set(diagnostic.parts).size, diagnostic.parts.length);
    const key = signature(diagnostic.parts);
    assert.ok(expected.has(key) && !seen.has(key), 'No unrelated or repeated diagnostic is accepted.');
    seen.add(key);
  }
  const parts = new Map(model.parts.map(p => [p.id, p]));
  assert.equal(parts.size, model.parts.length, 'The original part IDs must be unique.');
  const part = (id, type) => {
    const p = parts.get(id); assert.ok(p, `${id}: actual authored part`);
    if (type) assert.equal(p.part, type, `${id}: the declared real standard part`);
    return p;
  };
  const owner = id => {
    const found = mechanism.bodies.filter(b => b.parts?.includes(id));
    assert.equal(found.length, 1, `${id}: one actual body owner`); return found[0];
  };
  const connector = (id, cid, type) => {
    const p = part(id), meta = catalog.get(p.part); assert.ok(meta);
    const c = meta.connectors.find(c => c.id === cid); assert.ok(c, `${id}/${cid}`);
    if (type) assert.equal(c.type, type, `${id}/${cid}: source connector type`);
    assert.ok(c.length > 0);
    const rotate = v => [0, 1, 2].map(row => dot(p.rotation.slice(row * 3, row * 3 + 3), v));
    const axis = rotate(c.axis); near(norm(axis), 1, 'Source connector has a unit axis.');
    return {part: id, partType: p.part, connector: cid, type: c.type,
      lengthLdu: c.length, positionLdu: rotate(c.position).map((v, i) => v + p.position[i]), axis};
  };
  const interval = (shaft, member) => {
    near(Math.abs(dot(shaft.axis, member.axis)), 1, `${member.part}: parallel shaft and bore`);
    const d = sub(member.positionLdu, shaft.positionLdu), center = dot(d, shaft.axis);
    near(norm(d.map((v, i) => v - center * shaft.axis[i])), 0, `${member.part}: actual coaxial engagement`);
    const extent = [center - member.lengthLdu / 2, center + member.lengthLdu / 2];
    assert.ok(extent[0] >= -shaft.lengthLdu / 2 - EPS && extent[1] <= shaft.lengthLdu / 2 + EPS,
      `${member.part}: complete finite source-depth engagement`);
    return extent;
  };
  const roleEvidence = Object.fromEntries(['input', 'output'].map(role => {
    const body = owner(`${role}_key`);
    assert.notEqual(body.id, 'ground');
    const owned = (id, type) => {
      const p = part(id, type); assert.equal(owner(id).id, body.id, `${id}: same intended physical rocker`); return p;
    };
    owned(`${role}_key`, '7229.dat');
    owned(`${role}_anchor_bridge`, '6632.dat');
    owned(`${role}_beam`, role === 'input' ? '32316.dat' : '32278.dat');
    owned(`${role}_axle`, role === 'input' ? '3707.dat' : '60485.dat');
    const centralShaft = connector(`${role}_axle`, role === 'input' ? 'a' : 'a0', 'axle');
    const centralKey = connector(`${role}_key`, 'x0', 'axlehole');
    const centralBridge = connector(`${role}_anchor_bridge`, 'h1', 'pinhole');
    const centralBeam = connector(`${role}_beam`, role === 'input' ? 'h2' : 'h7', 'pinhole');
    const centralIntervals = {
      key: interval(centralShaft, centralKey), bridge: interval(centralShaft, centralBridge),
      beam: interval(centralShaft, centralBeam)};
    near(centralIntervals.bridge[1], centralIntervals.key[0], 'The bridge backs the actual keyed layer.');
    near(centralIntervals.key[1], centralIntervals.beam[0], 'The keyed layer backs the actual beam.');
    const mounts = ['neg', 'pos'].map(side => {
      const positive = side === 'pos';
      owned(`${role}_anchor_axle_${side}`, '3706.dat');
      const shaft = connector(`${role}_anchor_axle_${side}`, 'a', 'axle');
      near(shaft.lengthLdu, 120, 'Each actual retained anchor shaft is 6L.');
      near(Math.abs(dot(shaft.axis, centralShaft.axis)), 1, 'The anchor and main shaft axes are parallel.');
      const bridge = connector(`${role}_anchor_bridge`, positive ? 'h2' : 'h0', 'axlehole');
      const key = connector(`${role}_key`, positive ? 'h0' : 'h1', 'pinhole');
      const beam = connector(`${role}_beam`, role === 'input' ? (positive ? 'h3' : 'h1') : (positive ? 'h8' : 'h6'), 'pinhole');
      const members = [
        [`${role}_band_${side}`, '3713.dat', 20],
        [`${role}_anchor_full_spacer_${side}`, '3713.dat', 20],
        [`${role}_anchor_upper_spacer_${side}`, '4265c.dat', 10],
        [`${role}_anchor_lower_retainer_${side}`, '4265c.dat', 10]
      ].map(([id, type, length]) => {
        owned(id, type); const c = connector(id, 'c', 'axlehole');
        near(c.lengthLdu, length, `${id}: actual bush thickness`);
        return {...c, intervalLdu: interval(shaft, c)};
      });
      const [band, fullSpacer, upperRetainer, lowerRetainer] = members;
      const bridgeInterval = interval(shaft, bridge), keyInterval = interval(shaft, key), beamInterval = interval(shaft, beam);
      near(band.intervalLdu[1], fullSpacer.intervalLdu[0], 'The band bush backs the full spacer.');
      near(fullSpacer.intervalLdu[1], upperRetainer.intervalLdu[0], 'The full spacer backs the upper half-bush.');
      near(upperRetainer.intervalLdu[1], bridgeInterval[0], 'The upper keyed retainer contacts the real bridge face.');
      near(bridgeInterval[1], keyInterval[0], 'The bridge and keyed layer meet without an invented spacer.');
      near(keyInterval[1], beamInterval[0], 'Both round-bore layers meet at their actual faces.');
      near(beamInterval[1], lowerRetainer.intervalLdu[0], 'The lower retainer contacts the real beam face.');
      const radial = sub(key.positionLdu, centralKey.positionLdu);
      near(dot(radial, centralShaft.axis), 0, 'The two anchor axes cross the same actual rocker layer.');
      near(norm(radial), 20, 'Each retained anchor axis is 20 LDU from the real main shaft.');
      return {side, shaft, bridge, key, beam, bridgeIntervalLdu: bridgeInterval,
        keyIntervalLdu: keyInterval, beamIntervalLdu: beamInterval,
        band, fullSpacer, upperRetainer, lowerRetainer, completeStackRetainedOnBothFaces: true};
    });
    const separation = sub(mounts[1].key.positionLdu, mounts[0].key.positionLdu);
    near(dot(separation, centralShaft.axis), 0, 'The two axes are separated across the layers.');
    const axisSeparationLdu = norm(separation); near(axisSeparationLdu, 40, 'The two actual anchor axes are 40 LDU apart.');
    return [role, {role, finalBodyId: body.id, axisSeparationLdu, centralShaft, centralKey,
      centralBridge, centralBeam, centralIntervalsLdu: centralIntervals, mounts}];
  }));
  assert.notEqual(roleEvidence.input.finalBodyId, roleEvidence.output.finalBodyId,
    'The elastic connection must not weld input and passive output together.');
  return issues.map(diagnostic => {
    const declaration = expected.get(signature(diagnostic.parts));
    return {diagnostic, role: declaration.role, layer: declaration.layer,
      physicalEvidence: roleEvidence[declaration.role],
      physicalJustification: 'Two parallel retained 6L shafts 40 LDU apart are keyed into the same real 6632 bridge. Both pass through actual round bores in the 7229 layer and rocker beam; contiguous real bushes retain the stack on both faces. The layers cannot rotate relative to that bridge. The central keyed main shaft belongs to the same locked rocker assembly.',
      otherDiagnosticsAccepted: false};
  });
}
