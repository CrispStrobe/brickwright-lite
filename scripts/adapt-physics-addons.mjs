#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import { reviseCounterturnSnapgate } from './lib/counterturn-snapgate-model.mjs';
import { adaptAddonProgram } from './lib/physics-addon-program.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseModel } from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import { catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [id, source, output, programSource, programOutput] = process.argv.slice(2),
  spec = {
    counterturn: ["656ce4e343712bf6edfd9fb2501e9847334234ce486d39d270cd350fabd04fa8",120,"Counterturn — a free carrier and flywheel"],
    snapgate: ["4796bf3f379c6110574435a9cf0eab57698b199491f96706bf3ff9dda5fea525",205,"Snapgate — a spring memory switch"],
    "bit-keeper": ["0f7d21432b23a4e51af3993af77e37706ff568dcf799c46b305cdd02a862d7a2", 133, "Bit Keeper \u2014 a mechanical memory"],
    "crossline": ["1fc3d0868344fe581bde48d17fbda1a279356b991a9495689b9036b1f0d75041", 147, "Crossline \u2014 geared straight-line pair"],
    "linger": ["78c9a9e9da8fe94ec34beae8e742ec80582f7a649baf3a2ead20f28bb9489169", 158, "Linger \u2014 six-bar dwell machine"],
    "echo-bridge": ["80a49a442dba7175cbec0040d9cb36a38b6e040bd076ae9c1744a431d59f6a4e", 108, "Echo Bridge \u2014 motion passed between pendulums"],
    'offset-orbit': ["d432f7b2c179e1a287bed0e085666dc5b83cdb4f5e2725ddccc41bc8eb24b709", 141, "Offset Orbit \u2014 Oldham coupling"],
    'ellipsa': ["98616c6f460c930522d122a6d15bc1814d758e7a21db8f854fdd71ed5cc3cd3f", 187, "Ellipsa \u2014 one-motor ellipsograph"],
    'pantograph-doubler': ['1704386e0b6531fd45fe1179c5264da0e6ff0b6716fe94ba2423c29c3c62600a', 83, 'Pantograph Doubler — one motor, double scale'],
    'scale-studio': ['c5f6a2b7cde3168ce88586d2c1bbd20937b1efa3c293393dd5917b642164ea51', 101, 'Scale Studio — circles at twice the size'],
    'ripple-relay': ['0a39a2fc4ba72900da845ff25a0b79fc12bfdcd2c727fc7aca87cebeec227f23', 191, 'Ripple Relay — universal-joint cancellation'],
    "momentum-twins": ["8d87d88aeb2d7f93e6835d867272230fc2760b27409788305a22194cf00eaa90", 125, "Momentum Twins — reaction wheels"],
    "bloom-gate": ["926f200d1cc0e564e29f01e9352f8f57774807270e65dc906d531620985ea69d", 170, "Bloom Gate — a mechanical iris"],
    "amplify": ["54dafff4443b5d59a7e4627f86bb1be82ab37673ec75557d8463a6ecc84a8ab0", 155, "Amplify — a path at twice the scale"],
    crossglide: ['87551074033b15ff1e6df399c9093d4bddf06e60fc5076069e8471b70da0e013', 216, 'Crossglide — offset shafts and twice-round orbit']
  }[id];
if (!spec || !source || !output) throw Error('Usage: adapt-physics-addons.mjs model-id source.ldr output.ldr');
const bytes = readFileSync(source);
if (createHash('sha256').update(bytes).digest('hex') !== spec[0]) throw Error('Source differs from reviewed model');
const C = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url)))),
  {
    model,
    refusals
  } = parseModel(bytes.toString('utf8'), {
    catalog: C
  });
if (refusals.length || model.decor?.length) throw Error(JSON.stringify(refusals));
const text = reviseCounterturnSnapgate(id,bytes.toString('utf8')).replace(/^0[^\n]*\n/, `0 ${spec[2]}\n`).replace(/^0 Name:.*$/m, `0 Name: ${id}.ldr`).replace(/^0 !LICENSE.*$/m, `0 !LICENSE BSD-3-Clause : see ../licenses/${id}.txt`).split(/\r?\n/).filter(line => !/^0 (?:STEP|ROTSTEP)\b/.test(line)).join('\n'),
  p = prepareModel(text, C);
const unexpectedIssues = id === 'counterturn' ? p.issues.filter(i=>i.code!=='gear-not-on-hinge'||i.parts.length!==1||!/^ballast_[xz]_-?1_[01]$/.test(i.parts[0])) : id === 'snapgate' ? p.issues.filter(i=>i.code!=='locked-hinges'||!['stop_upper_bearing|stop_upper_bearing_pin_-60|stop_upper_bearing_pin_60','worm_wheel_bearing_-65|worm_wheel_bearing_pin_-120_-70|worm_wheel_bearing_pin_-80_-70'].includes(i.parts.slice().sort().join('|'))) : id === 'bit-keeper' ? p.issues.filter(i => i.code !== 'gear-not-on-hinge' || i.parts.length !== 1 || i.parts[0] !== 'bob_gear') : p.issues;
if (unexpectedIssues.length || p.model.parts.length !== spec[1]) throw Error(JSON.stringify(p.issues));
for (const part of p.model.parts) if (solidOverlaps(p.model, C, part).length) throw Error('Solid overlap ' + part.id);
writeFileSync(output, text);
console.log(`${id}: ${spec[1]} placements, no solid overlaps`);
if (programSource && programOutput) writeFileSync(programOutput, adaptAddonProgram(id, readFileSync(programSource)));
