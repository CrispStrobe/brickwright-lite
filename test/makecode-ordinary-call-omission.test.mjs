import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {prepareOrdinaryCallOmissions} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-call-omission.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const parse = source => parseMakeCodeTs(source, {parameterDefaults:true});
const calls = program => program.body.filter(node => node.type === 'ExpressionStatement').map(node => node.expr).filter(node => node.type === 'Call');
const neighbor = 'class Unsupported { static read(): number { return 7; } }\n';

test('missing slot proof belongs to one exact call and formal, retaining provided arguments and helper body', () => {
    const program = parse('function choose(n:number, effect?:effects.BackgroundEffect){console.log(effect)} choose(1); choose(2, undefined); choose(3, unknown);');
    const [missing, suppliedUndefined, provided] = calls(program), declaration = program.body[0], body = declaration.body;
    const result = prepareOrdinaryCallOmissions(program), [first, second, third] = calls(result.program);
    assert.deepEqual(result.unsupported, []);
    assert.equal(result.omissions.length, 1);
    assert.equal(result.omissions[0].declaration, declaration);
    assert.equal(result.omissions[0].call, missing);
    assert.equal(result.omissions[0].name, 'effect'); assert.equal(result.omissions[0].index, 1);
    assert.deepEqual(first.args[1], {type:'Undefined'});
    assert.equal(first.args[0], missing.args[0]);
    assert.equal(second, suppliedUndefined); assert.equal(third, provided);
    assert.equal(result.program.body[0].body, body);
    assert.equal(program.body[0], declaration); assert.equal(missing.args.length, 1);
});

test('generic source serializes actual missing and supplied Undefined canonically, preserving unsupported neighbor and unused helper', () => {
    const result = arcadeToPseudocode(neighbor + 'function begin(n:number, effect?:effects.BackgroundEffect){console.log(effect)} begin(3); begin(4,undefined); function retained(){console.log("body retained")}');
    assert.ok(result.unsupported.some(message => /class Unsupported|Class Unsupported/.test(message)));
    assert.match(result.code, /DEFINE begin \(n\) \(effect\):/);
    const actual = result.code.split('\n').filter(line => /CALL: \(begin /.test(line));
    assert.equal(actual.length, 2);
    for (const line of actual) assert.match(line, /\(undefined value\)\)$/);
    assert.match(result.code, /DEFINE retained/); assert.match(result.code, /body retained/);
});

test('provided opaque reference remains opaque, never an Effect or Melody from annotation', () => {
    const program = parse('function observe(effect?:effects.BackgroundEffect, sound?:music.Melody){console.log(effect);console.log(sound)} observe(); observe(unknown, other);');
    const result = prepareOrdinaryCallOmissions(program), fn = result.program.body[0];
    assert.equal(result.omissions.length, 2);
    assert.equal(calls(result.program)[1], calls(program)[1]);
    const facts = analyseSourceValueProducers(result.program, {unboundIsOpaque:true, opaqueDeclarationValues:true});
    for (const index of [0,1]) {
        const types = facts.functionParameterTypes(fn,index);
        assert.ok(types.has('Undefined')); assert.ok(types.has('Opaque'));
        assert.ok(!types.has('Image') && !types.has('Effect') && !types.has('Melody'));
    }
});

test('no incoming caller cannot manufacture an Undefined producer', () => {
    const program = parse('function unused(effect?:effects.BackgroundEffect){console.log(effect)}');
    const result = prepareOrdinaryCallOmissions(program);
    assert.equal(result.program, program); assert.equal(result.omissions.length, 0);
});

test('escaped or replaced ordinary callee cannot acquire missing-slot proof', () => {
    for (const source of [
        'function target(value?:any){console.log(value)} let saved=target; target();',
        'function target(value?:any){console.log(value)} target=other; target();',
        'function target(value?:any){console.log(value)} function target(value?:any){console.log(value)} target();'
    ]) {
        const program = parse(source), result = prepareOrdinaryCallOmissions(program);
        assert.equal(result.omissions.length, 0, source);
        assert.equal(calls(result.program).at(-1).args.length, 0, source);
    }
});

test('signature defaults remain the existing omission-bit protocol and are never normalized here', () => {
    const program = parse('function choose(value:any=3){console.log(value)} choose(); choose(undefined);');
    const result = prepareOrdinaryCallOmissions(program);
    assert.equal(result.program, program); assert.equal(result.omissions.length, 0);
    assert.equal(calls(program)[0].args.length, 0); assert.equal(calls(program)[1].args[0].type, 'Undefined');
    assert.ok(program.body[0].parameterDefaults.length);
});

test('missing required and excess actual arguments remain named refusals without padding', () => {
    const program = parse('function choose(required:number, extra?:string){console.log(required)} choose(); choose(1,2,3);');
    const result = prepareOrdinaryCallOmissions(program);
    assert.ok(result.unsupported.some(message => /missing required or excess/.test(message)));
    assert.equal(result.program, program); assert.equal(result.omissions.length, 0);
});

test('nested declarations and generic signatures remain outside this ordinary module domain', () => {
    for (const source of [
        'function outer(){function inside(value?:any){console.log(value)} inside();} outer();',
        'function generic<T>(value?:T){console.log(value)} generic();'
    ]) {
        const program = parse(source), result = prepareOrdinaryCallOmissions(program);
        assert.equal(result.program, program); assert.equal(result.omissions.length, 0);
    }
});
