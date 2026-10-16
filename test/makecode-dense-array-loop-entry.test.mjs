import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';

// Independently authored guest's genuine current export structure. The source
// keeps its full helper bodies and uses no generated-name or marker authority.
const SOURCE=`function add(a:any,b:any):any{return a+b}
function less(a:any,b:any):boolean{return a<b}
function unary(a:any):number{return +a}
function effect(value:number):number{calls=add(unary(calls),(0+1));return value}
function startup(){
 let backing:number[]=null;let receiver:number[]=null;let bound:number=0;let index:number=0;let item:number=0;
 backing=[];backing.push((0+1));input=backing;calls=(0+0);calls=add(calls,(0+10));
 receiver=input;bound=receiver.length;index=(0+0);
 while(less(index,bound)){item=receiver[index];effect(item);index=add(unary(index),(0+1))}
 calls=add(calls,(0+100));
}
let input:number[];let calls:number;startup();`;
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true});
const nodes=root=>{const out=[];const visit=value=>{if(!value||typeof value!=='object')return;if(!Array.isArray(value))out.push(value);for(const child of Object.values(value))visit(child);};visit(root);return out;};
const indexOf=program=>nodes(program).find(n=>n.type==='Index');
const valid=source=>validateProcedureConstraintSource(parse(source),{onlyFunctions:new Set(['effect'])});
const graph=program=>analyseSourceValueProducers(program,{unboundIsOpaque:true,opaqueDeclarationValues:true,arrayLoopEntries:true});
const refuses=source=>assert.ok(valid(source).some(s=>s.includes('effect.value requires Number')),source);

test('current dense initialization and dominating cached range prove the actual Number element read',()=>{
    assert.deepEqual(valid(SOURCE),[]);
    const program=parse(SOURCE),read=indexOf(program);assert.ok(read);
    const proved=graph(program).typesAt(read),ordinaryTypes=analyseSourceValueProducers(program).typesAt(read);
    const generic=analyseSourceValueProducers(program,{arrayValues:true}).typesAt(read);
    const ordinary=parse('let xs=[1];let idx=0;let value=xs[idx];'),ordinaryRead=indexOf(ordinary),knownGeneric=analyseSourceValueProducers(ordinary,{arrayValues:true}).typesAt(ordinaryRead);
    if(process.env.BW_DENSE_LOOP_PROFILE_EVIDENCE)appendFileSync(process.env.BW_DENSE_LOOP_PROFILE_EVIDENCE,JSON.stringify({stage:'actual-profile-sets',constrained:[...proved],ordinary:[...ordinaryTypes],genericTyped:[...generic],genericKnownLiteral:[...knownGeneric]})+'\n');
    assert.deepEqual([...proved],['Number']);
    assert.ok(ordinaryTypes.has('Opaque'),'default index policy is unchanged');
    assert.ok(generic.size!==1||!generic.has('Number'),'typed null/Array all-writers cannot supply a pure Number index fact');
    assert.ok([...generic].every(type=>['Number','Null','Undefined','Opaque'].includes(type)),'generic profile receives no private reference or callable authority');
    assert.ok(knownGeneric.has('Undefined'),'genuine generic Array reads retain missing-element domain');
    assert.ok(knownGeneric.has('Number'),'actual literal1 remains a generic element producer alongside missing Undefined');
});
test('actual complete helper bodies and lexical aliases work independently of generated spellings',()=>{
    const renamed=SOURCE.replaceAll('backing','storage').replaceAll('receiver','currentArray').replaceAll('bound','limit').replaceAll('index','cursor').replaceAll('add','sum').replaceAll('less','before').replaceAll('unary','numberValue');
    assert.deepEqual(valid(renamed),[]);
    assert.deepEqual(valid(SOURCE.replace('backing.push((0+1));','backing.push((0+1));backing.push(2);')),[]);
});
test('step bound domination and callback interference cannot manufacture a Number entry',()=>{
    for(const source of [
        SOURCE.replace('index=(0+0);','index=(0+1);'),SOURCE.replace('return a<b','return a<=b'),
        SOURCE.replace('index=add(unary(index),(0+1))','index=add(unary(index),(0+2))'),
        SOURCE.replace('index=add(unary(index),(0+1))','index=index'),
        SOURCE.replace('effect(item);','bound=99;effect(item);'),
        SOURCE.replace('effect(item);','receiver=[];effect(item);'),
        SOURCE.replace('effect(item);','index=3;effect(item);'),
        SOURCE.replace('while(less(index,bound)){item=receiver[index];','item=receiver[index];while(less(index,bound)){'),
        SOURCE.replace('effect(item);','if(index)effect(item);'),
        SOURCE.replace('effect(item);','index&&effect(item);'),
        SOURCE.replace('effect(item);','index?effect(item):effect(item);')
    ])refuses(source);
});
test('dense presence initialization aliases and all mutation paths stay mandatory',()=>{
    for(const source of [
        SOURCE.replace('backing.push((0+1));',''),SOURCE.replace('backing=[];','backing=foreign();'),
        SOURCE.replace('backing.push((0+1));','backing.push("bad");'),
        SOURCE.replace('backing.push((0+1));','backing.push(1);backing.push("bad");'),
        SOURCE.replace('receiver=input;','receiver=[];'),
        SOURCE.replace('effect(item);','receiver.pop();effect(item);'),
        SOURCE.replace('effect(item);','receiver.length=0;effect(item);'),
        SOURCE.replace('effect(item);','delete receiver[0];effect(item);'),
        SOURCE.replace('effect(item);','receiver[0]="bad";effect(item);'),
        SOURCE.replace('effect(item);','external();effect(item);'),
        SOURCE.replace('receiver=input;','Array.prototype.push=other;receiver=input;'),
        SOURCE.replace('backing.push((0+1));','if(calls)backing.push(1);')
    ])refuses(source);
});
test('helper escapes effects shadowed bindings and default prologues stay visible',()=>{
    for(const source of [
        SOURCE.replace('return a<b','external();return a<b'),
        SOURCE.replace('return a+b','receiver.pop();return a+b'),
        SOURCE.replace('function less(a:any,b:any)','function less(a:any,b:any=1)'),
        SOURCE.replace('receiver=input;','let escaped=less;receiver=input;'),
        SOURCE.replace('receiver=input;','function less(a:any,b:any){return true}receiver=input;'),
        SOURCE.replace('effect(item);','effect("bad");'),
        SOURCE.replace('function less(a:any,b:any)','function less(a:any,b:any,ignored:any)').replace('less(index,bound)','less(index,bound,effect(1))'),
        SOURCE.replace('return value}','receiver.pop();return value}')
    ])refuses(source);
});
test('loop entry facts expire on actual source drift and cannot transfer to copied nodes',()=>{
    const program=parse(SOURCE),read=indexOf(program),proved=graph(program);assert.deepEqual([...proved.typesAt(read)],['Number']);
    assert.deepEqual([...proved.typesAt(structuredClone(read))],[]);
    const less=nodes(program).find(n=>n.type==='FunctionDeclaration'&&n.name==='less'),comparison=nodes(less).find(n=>n.type==='Binary');
    comparison.op='<=';assert.deepEqual([...proved.typesAt(read)],[]);comparison.op='<';assert.deepEqual([...proved.typesAt(read)],[],'observed expiry is sticky');
    assert.deepEqual([...graph(program).typesAt(read)],['Number'],'a fresh complete source analysis may prove restored current source');
});

test('cached length is the actual value at its read and zero-trip loops cannot fabricate later Number flow',()=>{
    const source='function effect(value:number){return value}let input=[];let bound=input.length;input.push(1);let out="bad";let index=0;while(index<bound){out=input[index];index=index+1}let next=[out];let secondBound=next.length;let secondIndex=0;while(secondIndex<secondBound){effect(next[secondIndex]);secondIndex=secondIndex+1}';
    refuses(source);
    refuses(source.replace('input.push(1);','input.push(1);input.push("bad");'));
    refuses(SOURCE.replace('backing.push((0+1));','let saved=backing.length;backing.push(1);').replace('bound=receiver.length;','bound=saved;'));
});

test('the same physical loop read unions every actual invocation rather than the last producer',()=>{
    const prefix='function effect(value:number){return value}let input:any[];function visit(){let bound=input.length;let index=0;while(index<bound){effect(input[index]);index=index+1}}';
    for(const tail of ['input=["bad"];visit();input=[1];visit();','input=[1];visit();input=["bad"];visit();']){
        const source=prefix+tail;refuses(source);const program=parse(source);assert.deepEqual(new Set(graph(program).typesAt(indexOf(program))),new Set(['String','Number']));
    }
});

test('multiple iterations cannot publish first-iteration scalar or Array kinds as final flow',()=>{
    const prefix='function effect(value:number){return value}let input=[1,2];let bound=input.length;let index=0;';
    const suffix='let nextBound=out.length;let secondIndex=0;while(secondIndex<nextBound){effect(out[secondIndex]);secondIndex=secondIndex+1}';
    refuses(prefix+'let out;let last=1;while(index<bound){out=[last];last="bad";index=index+1}'+suffix);
    refuses(prefix+'let out;let last=1;while(index<bound){out=last;last="bad";index=index+1}let next=[out];'+suffix.replaceAll('out','next'));
    refuses(prefix+'let last=1;let temp=0;while(index<bound){temp=last;last="bad";index=index+1}let out=[temp];'+suffix);
    refuses(prefix+'let last=1;let out;while(index<bound){out=last;index=index+1}let next=[out];'+suffix.replaceAll('out','next'));
});
