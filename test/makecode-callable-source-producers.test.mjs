import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {callableSourceGate} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-source-gate.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const parse=source=>parseMakeCodeTs(source,{retainCallableMetadata:true,parameterDefaults:true});
const gate=source=>callableSourceGate(parse(source));
const factory='function make(seed:number):()=>number{let value=seed;return()=>{value+=4;return value}}';
const tail='let callback=make(input);let result=callback();';
const nodes=(program,predicate)=>{const found=[];const visit=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(predicate(node))found.push(node);for(const [key,value]of Object.entries(node))if(key!=='originalBody')visit(value);};visit(program);return found;};

test('shared producer analysis is read-only and occurrence facts cannot change another consumer',()=>{
    const program=parse('let input:number=2;let text=input.toString()'),before=JSON.stringify(program);
    const proof=analyseSourceValueProducers(program),read=nodes(program,n=>n.type==='Identifier'&&n.name==='input')[0];
    assert.deepEqual([...proof.typesAt(read)],['Number']);
    proof.typesAt(read).add('Font');proof.bindingTypesAt(read).clear();
    assert.deepEqual([...proof.typesAt(read)],['Number']);
    assert.deepEqual([...proof.bindingTypesAt(read)],['Number']);
    assert.deepEqual([...proof.typesAt({type:'Number',value:2})],[]);
    assert.equal(JSON.stringify(program),before);
});

test('shared actual producer facts include absent arguments and fallthrough without annotation seeding',()=>{
    for(const source of ['function pass(value:number){return value}let good=pass(2);let bad=pass()',
        'function maybe(flag:boolean):number{if(flag)return 2}let bad=maybe(false)']) {
        const program=parse(source),proof=analyseSourceValueProducers(program);
        const decl=program.body.find(n=>n.type==='Declaration'&&n.decls.some(d=>d.name==='bad'));
        assert.ok(proof.typesAt(decl.decls[0].init).has('Undefined'));
    }
    const program=parse('let input:number;let before=input;input=2;let after=input'),proof=analyseSourceValueProducers(program);
    const reads=nodes(program,n=>n.type==='Identifier'&&n.name==='input');
    assert.deepEqual([...proof.typesAt(reads[0])].sort(),['Number','Undefined']);
    assert.deepEqual([...proof.typesAt(reads.at(-1))],['Number']);
});

test('numeric factory arguments require actual Number producers across every writer and call',()=>{
    for(const input of ['let input:number=2;input=image.create(1,1) as any;',
        'let input=2;input=image.create(1,1) as any;',
        'let input:number=image.create(1,1) as any;',
        'let input:number;',
        'let input:number=2;if(true){input=image.create(1,1) as any;}',
        'let input:number=2;input=undefined as any;']) {
        const source=factory+input+tail;
        assert.equal(gate(source).eligible,false,source);
        assert.ok(arcadeToPseudocode(source).unsupported.length,source);
    }
    for(const source of [factory+'let input:number;'+tail+'input=2;',
        factory+'let good=make(2);let bad=make(undefined);let result=good();'])
        assert.equal(gate(source).eligible,false,source);
});

test('factory identity requires one unchanged declaration and direct calls at every use',()=>{
    for(const change of ['make=unknownFactory;',
        'function make(seed:number):()=>number{let value=seed;return()=>{value+=4;return value}}',
        'let make:any=unknownFactory;',
        'class make{constructor(){}}',
        'let alias=make;']) {
        const source=factory+change+'let callback=make(2);let result=callback();';
        assert.equal(gate(source).eligible,false,source);
    }
    assert.equal(gate(factory+'let alias=make;let callback=alias(2);let result=callback();').eligible,false);
    assert.equal(gate(factory+'unknownConsumer(make);let callback=make(2);let result=callback();').eligible,false);
});

test('actual lexical shadows do not poison a distinct numeric factory argument',()=>{
    for(const input of ['let input=2;', 'let input:number=2;',
        'let input=2;if(true){let input=image.create(1,1)}'])
        assert.equal(gate(factory+input+tail).eligible,true,input);
});

test('capture authority combines complete writers with initialization before Arrow creation',()=>{
    const initialized=factory.replace('let value=seed','let value:number=undefined;value=seed');
    assert.equal(gate(initialized+'let input=2;'+tail).eligible,true);
    for(const bad of [initialized.replace('value=seed;',''),
        initialized.replace('value=seed;','value=value;'),
        initialized.replace('value+=4;','value=undefined as any;'),
        initialized.replace('value+=4;','value=image.create(1,1) as any;')])
        assert.equal(gate(bad+'let input=2;'+tail).eligible,false,bad);
});

test('unproved global initialization is not discharged by the capture witness',()=>{
    for(const global of ['let extra:number=1;', 'let extra:number;']) {
        const source=global+factory.replace('return value}','return value+extra}')+'let input=2;'+tail;
        assert.equal(gate(source).eligible,false);
    }
});

test('numeric producer prerequisite does not add compound operator vocabulary',()=>{
    assert.equal(gate(factory.replace('value+=4','value|=4')+'let input=2;'+tail).eligible,false);
});


test('actual numeric callback result certificates reject changed aliases and early invocations',()=>{
    for(const source of [
        factory+'let callback=make(2);callback=unknownCallback as any;let result=callback();',
        factory+'let callback=make(2);let alias=callback;alias=unknownCallback as any;let result=alias();',
        factory+'let callback:()=>number;let result=callback();callback=make(2);',
        factory+'let callback=make(2);let alias:()=>number;let result=alias();alias=callback;',
        factory+'let callback=make(2);if(true){callback=unknownCallback as any}let result=callback();'
    ])assert.equal(gate(source).eligible,false,source);
    const source=factory+'let callback=make(2);let alias=callback;let result=alias();';
    assert.equal(gate(source).eligible,true);
});

test('ordinary producer analysis never seeds a callable result from a Number annotation',()=>{
    const program=parse(factory+'let callback=make(2);let result=callback();');
    const proof=analyseSourceValueProducers(program),call=program.body.at(-1).decls[0].init;
    assert.deepEqual([...proof.typesAt(call)],['Opaque']);
});


test('numeric proof does not coalesce competing local or parameter declarations',()=>{
    for(const source of [
        factory.replace('let value=seed','let value=seed;let value=2')+'let callback=make(2);let result=callback();',
        factory.replace('seed:number','seed:number,seed:number')+'let callback=make(2,3);let result=callback();',
        'function sum(left:any,left:any):any{return left+left}'+factory.replace('value+=4','value=sum(value,4)')+'let callback=make(2);let result=callback();'
    ])assert.equal(gate(source).eligible,false,source);
});


test('helper normalization refuses constructor and generic call descriptors at every actual use',()=>{
    const helper='function sum(left:any,right:any):any{return left+right}';
    const source=helper+factory.replace('value+=4','value=sum(value,4)')+'let callback=make(2);let result=callback();';
    for(const changed of [source+'let extra=new sum(1,2);',
        source+'let extra=sum(new sum(1,2),3);',
        source.replace('make(2)','make(new sum(1,2))'),
        source+'let extra=sum<number>(1,2);',
        source.replace('make(2)','make<number>(2)'),
        source.replace('callback()','callback<number>()')]) {
        const result=callableSourceGate(parse(changed),{normalize:true});
        assert.equal(result.eligible,false,changed);
        assert.equal(Object.hasOwn(result,'program'),false,'refused descriptors must not be normalized away');
        assert.ok(arcadeToPseudocode(changed).unsupported.length,changed);
    }
    // The parser has no optional-call or spread-argument representation.
    // These syntaxes refuse at parsing rather than becoming a plain helper call.
    for(const suffix of ['let extra=sum?.(1,2);','let extra=sum(...items);'])
        assert.throws(()=>parse(source+suffix));
});
