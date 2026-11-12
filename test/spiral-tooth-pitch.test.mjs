// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {repeatedToothPitch} from '../scripts/lib/spiral-tooth-pitch.mjs';
const place = (x, name='toothr.dat') => `1 16 ${x} 0 0 1 0 0 0 1 0 0 0 1 ${name}`;
test('repeated subpart pitch is measured from exact, ordered placement coordinates', () => {
 const source = [place(16),place(0),place(8),place(7,'other.dat')].join('\r\n');
 assert.deepEqual(repeatedToothPitch(source, 'toothr.dat'), [{count:3,minX:0,maxX:16,pitchLdu:8}]);
 assert.deepEqual(repeatedToothPitch(source, 'missing.dat'), []);
 assert.throws(() => repeatedToothPitch([place(0),place(8),place(17)].join('\n'),'toothr.dat'), /uneven/);
 assert.throws(() => repeatedToothPitch([place(0),place(0),place(8)].join('\n'),'toothr.dat'), /duplicate/);
});
