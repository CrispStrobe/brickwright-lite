// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementPicker} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/picking.js';
const fixture = () => {
    const handlers = new Map(), picked = [], pulses = [];
    const canvas = {style: {}, focus () {}, addEventListener: (k,v) => handlers.set(k,v), removeEventListener: k => handlers.delete(k)};
    let hit = 'axle';
    const picker = createMeasurementPicker({canvas, pick: () => hit, highlight: ids => pulses.push(ids)});
    const send = (name, extra = {}) => handlers.get(name)?.({button: 0, pointerId: 1, clientX: 40, clientY: 60,
        preventDefault () {}, stopPropagation () {}, ...extra});
    return {picker, picked, pulses, canvas, handlers, send, hit: id => {hit=id;}};
};
test('an explicit single click selects once and disarms; idle camera interaction never selects', () => {
    const f=fixture(); f.send('pointerdown');f.send('pointerup');assert.deepEqual(f.picked,[]);
    f.picker.set(id=>f.picked.push(id));assert.equal(f.canvas.style.cursor,'crosshair');
    f.send('pointerdown');f.send('pointerup');f.send('pointerdown');f.send('pointerup');
    assert.deepEqual(f.picked,['axle']);assert.deepEqual(f.pulses,[['axle']]);assert.equal(f.canvas.style.cursor,'');
});
test('camera drags, secondary buttons, mismatched pointers and cancelled gestures cannot select', () => {
    const f=fixture();f.picker.set(id=>f.picked.push(id));
    f.send('pointerdown');f.send('pointermove',{clientX:70});f.send('pointermove');f.send('pointerup');
    f.send('pointerdown',{button:2});f.send('pointerup',{button:2});
    f.send('pointerdown');f.send('pointerup',{pointerId:2});f.send('pointercancel');f.send('pointerup');
    f.send('pointerdown');f.send('pointerdown',{pointerId:2});f.send('pointerup');f.send('pointerup',{pointerId:2});
    f.send('pointerdown');f.send('pointerleave');f.send('pointerup');
    assert.deepEqual(f.picked,[]);
    f.send('pointerdown');f.send('pointerup');assert.deepEqual(f.picked,['axle'],'valid retry still works');
});
test('empty scene clicks preserve the request; Escape, replacement and disposal cancel without selecting', () => {
    const f=fixture();f.picker.set(id=>f.picked.push(id));f.hit(null);f.send('pointerdown');f.send('pointerup');
    assert.deepEqual(f.picked,[]);f.send('keydown',{key:'Escape'});assert.deepEqual(f.picked,[null]);
    f.picker.set(id=>f.picked.push(id));f.picker.set(id=>f.picked.push(id));assert.deepEqual(f.picked,[null,null]);
    f.picker.dispose();assert.deepEqual(f.picked,[null,null,null]);assert.equal(f.handlers.size,0);
});
