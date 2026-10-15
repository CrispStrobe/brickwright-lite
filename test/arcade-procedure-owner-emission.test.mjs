import test from 'node:test';
import assert from 'node:assert/strict';
import {createProcedureOwnerEmission} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-owner-emission.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

test('a declaration reached through multiple roots emits once on its actual owner', () => {
    const mark = createProcedureOwnerEmission(), owner = {}, declaration = {};
    assert.equal(mark(owner, declaration), true);
    assert.equal(mark(owner, declaration), false);
    assert.equal(mark(owner, declaration), false);
});

test('distinct owners and declarations never acquire identity through matching names or source', () => {
    const mark = createProcedureOwnerEmission();
    const one = {name: 'same'}, two = {name: 'same'};
    const left = {name: 'helper', body: 'same'}, right = {name: 'helper', body: 'same'};
    assert.equal(mark(one, left), true);
    assert.equal(mark(two, left), true);
    assert.equal(mark(one, right), true);
    assert.equal(mark(two, right), true);
    assert.equal(mark(one, left), false);
    assert.equal(mark(two, right), false);
});

test('emission bookkeeping belongs to one translation rather than a process-wide declaration cache', () => {
    const owner = {}, declaration = {}, first = createProcedureOwnerEmission(), second = createProcedureOwnerEmission();
    assert.equal(first(owner, declaration), true);
    assert.equal(first(owner, declaration), false);
    assert.equal(second(owner, declaration), true);
});

const definitions = output => [...output.code.matchAll(/^DEFINE ([\w$]+)(?:\s|:)/gm)].map(match => match[1]);
const translate = source => {
    const output = arcadeToPseudocode(source);
    assert.deepEqual(output.unsupported, [], JSON.stringify(output.unsupported));
    // The public importer normalizes both route headers. Assert actual
    // declaration/body/call behavior below; the header is not a route oracle.
    return output;
};

test('an unused retained helper does not re-emit an already called dependency', () => {
    const output = translate(`function shared(){console.log(1)}
function unused(){shared()}
shared();`);
    const names = definitions(output);
    assert.equal(names.filter(name => name === 'shared').length, 1);
    assert.equal(names.filter(name => name === 'unused').length, 1);
    assert.match(output.code, /DEFINE unused:[\s\S]*CALL: \(shared\)/);
    assert.equal((output.code.match(/^  arcade log /gm) || []).length, 1, 'the real effect body is retained once');
});

test('diamond dependencies retain deterministic first-emission order across called and unused roots', () => {
    const output = translate(`function leaf(){console.log(1)}
function left(){leaf()}
function right(){leaf()}
left();`);
    const names = definitions(output);
    assert.deepEqual(names.filter(name => ['leaf', 'left', 'right'].includes(name)), ['left', 'leaf', 'right']);
    assert.equal((output.code.match(/CALL: \(leaf\)/g) || []).length, 2, 'both real call sites remain');
});

test('cyclic dependencies finish once per declaration while preserving an uncalled root', () => {
    const output = translate(`function first(){if(false){second()}}
function second(){if(false){first()}}
function unused(){first()}
first();`);
    const names = definitions(output);
    for (const name of ['first', 'second', 'unused']) assert.equal(names.filter(value => value === name).length, 1);
    assert.equal((output.code.match(/CALL: \(first\)/g) || []).length, 3, 'startup, cyclic and unused calls remain');
    assert.match(output.code, /CALL: \(second\)/);
});
