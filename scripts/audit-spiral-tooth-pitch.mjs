// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {repeatedToothPitch} from './lib/spiral-tooth-pitch.mjs';
const root = new URL('../overlay/scratch-gui/static/ldraw/parts/', import.meta.url);
const references = [['64781.dat','s/64781s02.dat'],['32132.dat','toothr.dat'],['32185.dat','toothr.dat'],['18942.dat','toothr.dat']];
const parts = references.map(([part,subpart]) => {
 const data=readFileSync(new URL(part,root));
 const rows=repeatedToothPitch(data.toString('utf8'),subpart);
 if (!rows.length) throw new Error('no repeated tooth group for '+part);
 return {part,subpart,sha256:createHash('sha256').update(data).digest('hex'),groups:rows};
});
console.log(JSON.stringify({parts,limitations:'LDraw repeated-subpart placements only; not calibrated real-part pitch, contact geometry, collision clearance, or buildability.'},null,2));
