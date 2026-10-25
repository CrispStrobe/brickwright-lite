import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerCallableValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-callable-values.js';
import {validateCallableLexicalPlan} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-lexical-plan.js';
const source = 'function makeCounter(start:number):()=>number {let n=start;return()=>{n+=1;return n}} let first=makeCounter(2); let alias=first; let second=makeCounter(2);';
const planFor = source => {
    const result = lowerCallableValues(parseMakeCodeTs(source, {retainCallableMetadata: true}));
    assert.deepEqual(result.unsupported, []);
    return result.program.bwCallableLexicalPlan;
};
test('source lexical plan binds a real nested arrow and shared mutable capture without storing bodies', () => {
    const plan = planFor(source), site = plan.sites[0];
    const arrow = plan.owners.find(owner => owner.id === site.owner);
    const factory = plan.owners.find(owner => owner.id === arrow.parent);
    const capture = plan.bindings.find(binding => binding.id === site.captures[0].binding);
    assert.equal(arrow.kind, 'arrow');
    assert.equal(arrow.sourceName, null);
    assert.equal(factory.sourceName, 'makeCounter');
    assert.equal(site.createdIn, factory.id);
    assert.equal(capture.owner, factory.id);
    assert.equal(capture.sourceName, 'n');
    assert.equal(capture.written, true);
    assert.equal(site.captures[0].mode, 'cell');
    assert.notEqual(site.id, arrow.procedure, 'Source site identity is distinct from native procedure spelling');
    assert.deepEqual(plan.bindings.filter(binding => ['first','alias','second'].includes(binding.sourceName)).map(binding => binding.type.kind), ['callable','callable','callable']);
    assert.equal(JSON.stringify(plan).includes('"body"'), false);
    assert.deepEqual(validateCallableLexicalPlan(JSON.parse(JSON.stringify(plan))), plan);
});
test('readonly captures and ordinary function syntax retain their actual separate provenance', () => {
    const plan = planFor('function make(n:number):()=>number { return function(){ return n } } let f=make(2);');
    const owner = plan.owners.find(owner => owner.id === plan.sites[0].owner);
    assert.equal(owner.kind, 'function');
    assert.equal(plan.sites[0].captures[0].mode, 'value');
    assert.equal(plan.bindings.find(binding => binding.id === plan.sites[0].captures[0].binding).kind, 'parameter');
});
test('lexical plan refuses forged schema, body, identities, owner and capture modes', () => {
    const mutations = [
        plan => {plan.version = 2;},
        plan => {plan.body = 'return 42';},
        plan => {plan.owners.push({...plan.owners[1]});},
        plan => {plan.bindings.push({...plan.bindings[0]});},
        plan => {plan.sites.push({...plan.sites[0]});},
        plan => {plan.owners[1].parent = plan.owners[1].id;},
        plan => {plan.sites[0].createdIn = plan.module;},
        plan => {plan.sites[0].captures[0].mode = 'value';},
        plan => {plan.sites[0].captures[0].binding = 'missing';},
        plan => {plan.bindings.find(binding => binding.sourceName === 'n').owner = plan.module;},
        plan => {plan.bindings[0].type = {kind:'named',name:'any'};},
        plan => {plan.bindings[2].nativeName = plan.bindings[1].nativeName;},
        plan => {plan.owners[1].parameters = [];}
    ];
    for (const mutate of mutations) {
        const plan = planFor(source); mutate(plan);
        assert.throws(() => validateCallableLexicalPlan(plan), /Callable lexical plan:/);
    }
});
test('schema validation uses type structure rather than JSON property order', () => {
    const plan = planFor(source);
    const binding = plan.bindings.find(binding => binding.kind === 'parameter');
    binding.type = {name: 'number', kind: 'named'};
    assert.equal(validateCallableLexicalPlan(plan), plan);
});

test('ancestor factory defaults retain actual absence-slot provenance and signed-zero stays refused', () => {
    const plan = planFor('function make(n:number=2):()=>number {return()=>n} let f=make();');
    assert.deepEqual(plan.owners.find(owner=>owner.sourceName==='make').defaults, [{name:'n',value:2}]);
    const result = lowerCallableValues(parseMakeCodeTs('function make(n:number=-0):()=>number {return()=>n} let f=make();', {retainCallableMetadata:true}));
    assert.match(result.unsupported.join(';'), /unqualified literal default/);
});
