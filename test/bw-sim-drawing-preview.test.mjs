// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawingPaths} from '../overlay/scratch-gui/src/lib/bw-sim/view/drawing-preview.js';
test('live preview preserves measured disconnected strokes, aspect and relative positions', () => {
 const ink=[[[0,0],[.036,0],[.036,.036],[0,.036],[0,0]],[[.01,.03],[.03,.01]]];
 const saved=JSON.stringify(ink), paths=drawingPaths(ink);
 assert.equal(paths.length,2);assert.equal((paths[0].match(/M/g)||[]).length,1);
 assert.equal((paths[0].match(/L/g)||[]).length,4);assert.equal((paths[1].match(/L/g)||[]).length,1);
 assert.match(paths[0],/^M12.00,12.00 L168.00,12.00 L168.00,168.00 L12.00,168.00 L12.00,12.00$/);
 assert.deepEqual(drawingPaths(ink.map(s=>s.map(([x,y])=>[x+.5,y-.7]))),paths,'world translation leaves drawing shape intact');
 assert.equal(JSON.stringify(ink),saved,'preview never edits the physical trace');
 assert.deepEqual(drawingPaths([]),[]);assert.deepEqual(drawingPaths([[[1,2]]]),['M90.00,90.00']);
});
