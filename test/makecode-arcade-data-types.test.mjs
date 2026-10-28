import test from 'node:test';
import assert from 'node:assert/strict';
import {ValueTypeGraph} from '../overlay/scratch-gui/src/lib/bw-makecode/value-type-graph.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

test('property type cells follow receiver aliases without mixing separate Sprite data', () => {
    const graph = new ValueTypeGraph();
    graph.add(graph.property('hero', 'data'), 'Image');
    graph.add(graph.property('other', 'data'), 'array');
    graph.add(graph.element(graph.property('other', 'data')), 'number');
    graph.merge('heroAlias', 'hero');
    assert.equal(graph.arrayType(graph.property('heroAlias', 'data')), 'Image');
    assert.equal(graph.arrayType(graph.property('other', 'data')), 'number[]');
    graph.add(graph.property('lateAlias', 'data'), 'Image');
    graph.merge('heroAlias', 'lateAlias');
    assert.equal(graph.node(graph.property('hero', 'data')), graph.node(graph.property('lateAlias', 'data')));
});

test('data payload aliases retain array, Image and Sprite methods on import', () => {
    const source=`let a=sprites.create(image.create(2,2),SpriteKind.Player)
let b=sprites.create(image.create(2,2),SpriteKind.Player)
let c=sprites.create(image.create(2,2),SpriteKind.Player)
let numbers=[1,2]
a.data=numbers
let arrayAlias=a.data
arrayAlias.push(3)
let heroAlias=b
heroAlias.data=image.create(2,1)
let imageAlias=b.data
imageAlias.setPixel(0,0,7)
c.data=b
let spriteAlias=c.data
spriteAlias.vx=13`;
    const imported=arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code,/mutate array reference \(arrayAlias\) op "push"/);
    assert.match(imported.code,/arcade set image pixel \(imageAlias\)/);
    assert.match(imported.code,/arcade set vx of spriteAlias to 13/);
});
