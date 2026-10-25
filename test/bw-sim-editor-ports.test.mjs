// Tests for M12 portsForCopies
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEditor, portsForCopies} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';

const I3 = [1,0,0, 0,1,0, 0,0,1];
const CATALOG = new Map([
    ['motor.dat', {part: 'motor.dat', motor: {output: ['out']}}],
    ['sensor.dat', {part: 'sensor.dat', category: 'sensor'}],
    ['beam.dat', {part: 'beam.dat', category: 'beam'}],
]);

test('copy of motor whose port is free keeps it', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'p1', part: 'motor.dat', position: [0,0,0], rotation: I3.slice(), port: 'A'},
            {id: 'p2', part: 'beam.dat', position: [0,0,20], rotation: I3.slice()},
        ]
    };
    const parts = [model.parts[0]];
    const ports = portsForCopies(model, CATALOG, parts);
    assert.deepEqual(ports, ['A']);
    // Also test via editor cloneMany
    const ed = createEditor({model, catalog: CATALOG});
    ed.apply({type: 'cloneMany', ids: ['p1'], offset: [20,0,0]});
    const after = ed.model;
    assert.equal(after.parts.length, 3);
    const clone = after.parts.find(p => p.id !== 'p1' && p.id !== 'p2');
    assert.equal(clone.port, 'A');
});

test('whose port is taken gets first free', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'p1', part: 'motor.dat', position: [0,0,0], rotation: I3.slice(), port: 'A'},
            {id: 'p2', part: 'motor.dat', position: [0,0,20], rotation: I3.slice(), port: 'A'},
        ]
    };
    const parts = [model.parts[1]]; // p2 on A, taken by p1
    const ports = portsForCopies(model, CATALOG, parts);
    assert.deepEqual(ports, ['B']);
    const ed = createEditor({model, catalog: CATALOG});
    ed.apply({type: 'cloneMany', ids: ['p2'], offset: [20,0,0]});
    const clone = ed.model.parts.find(p => !['p1','p2'].includes(p.id));
    assert.equal(clone.port, 'B');
});

test('six ports full -> none', () => {
    const model = {
        version: 1,
        parts: ['A','B','C','D','E','F'].map((port,i)=>({id:`p${i}`, part:'motor.dat', position:[0,0,i*20], rotation:I3.slice(), port}))
    };
    // Add a 7th motor on A (duplicate) and copy it, all ports full so none
    const extra = {id:'p6', part:'motor.dat', position:[0,0,120], rotation:I3.slice(), port:'A'};
    model.parts.push(extra);
    const parts = [extra];
    const ports = portsForCopies(model, CATALOG, parts);
    assert.deepEqual(ports, [undefined]);
    const ed = createEditor({model, catalog: CATALOG});
    ed.apply({type: 'cloneMany', ids: ['p6'], offset: [20,0,0]});
    const clone = ed.model.parts.find(p => p.id !== 'p6' && !['p0','p1','p2','p3','p4','p5'].includes(p.id));
    assert.equal(clone.port, undefined);
});

test('three motors copied at once get distinct ports', () => {
    const model = {
        version: 1,
        parts: [
            {id:'p1', part:'motor.dat', position:[0,0,0], rotation:I3.slice(), port:'A'},
            {id:'p2', part:'motor.dat', position:[0,0,20], rotation:I3.slice(), port:'A'},
            {id:'p3', part:'motor.dat', position:[0,0,40], rotation:I3.slice(), port:'A'},
            {id:'p4', part:'beam.dat', position:[0,0,60], rotation:I3.slice()},
        ]
    };
    // Copy p1,p2,p3 at once (all on A, but A is taken, so they should get B,C,D distinct)
    const parts = [model.parts[0], model.parts[1], model.parts[2]];
    const ports = portsForCopies(model, CATALOG, parts);
    assert.equal(ports.length, 3);
    // They should be distinct and not undefined (since free are B-F)
    assert.equal(new Set(ports).size, 3);
    for (const p of ports) assert.ok(['B','C','D','E','F'].includes(p));
    // Via editor
    const ed = createEditor({model, catalog: CATALOG});
    ed.apply({type: 'cloneMany', ids: ['p1','p2','p3'], offset: [20,0,0]});
    const clones = ed.model.parts.filter(p => !['p1','p2','p3','p4'].includes(p.id));
    assert.equal(clones.length, 3);
    assert.equal(new Set(clones.map(c=>c.port)).size, 3);
});

test('beam copy has none', () => {
    const model = {
        version: 1,
        parts: [
            {id:'p1', part:'beam.dat', position:[0,0,0], rotation:I3.slice()},
        ]
    };
    const parts = [model.parts[0]];
    const ports = portsForCopies(model, CATALOG, parts);
    assert.deepEqual(ports, [undefined]);
    const ed = createEditor({model, catalog: CATALOG});
    ed.apply({type: 'cloneMany', ids: ['p1'], offset: [20,0,0]});
    const clone = ed.model.parts.find(p => p.id !== 'p1');
    assert.equal(clone.port, undefined);
});

test('undo of paste restores ports exactly', () => {
    const model = {
        version: 1,
        parts: [
            {id:'p1', part:'motor.dat', position:[0,0,0], rotation:I3.slice(), port:'A'},
            {id:'p2', part:'motor.dat', position:[0,0,20], rotation:I3.slice(), port:'B'},
        ]
    };
    const ed = createEditor({model, catalog: CATALOG});
    const before = ed.model;
    // Simulate paste via batch of place commands with ports
    const partsToPaste = [model.parts[0], model.parts[1]];
    const ports = portsForCopies(model, CATALOG, partsToPaste);
    const offset = [20,0,0];
    const cmds = partsToPaste.map((p,i)=>({type:'place', part:p.part, position:[p.position[0]+offset[0], p.position[1]+offset[1], p.position[2]+offset[2]], rotation:p.rotation.slice(), port: ports[i]}));
    ed.apply({type:'batch', commands: cmds});
    assert.equal(ed.model.parts.length, 4);
    ed.undo();
    assert.deepEqual(ed.model, before);
});
