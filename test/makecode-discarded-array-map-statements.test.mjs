import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveArrayMapValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-array-map-values.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainWhenUsed:true,retainClassHeritage:true,retainOrdinaryDefaultProvenance:true,retainPrimitiveProcedureDefaults:true});
const nodes=root=>{const out=[];const visit=value=>{if(!value||typeof value!=='object')return;if(!Array.isArray(value))out.push(value);Object.values(value).forEach(visit);};visit(root);return out;};
const mapCall=program=>{const calls=nodes(program).filter(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='map');assert.equal(calls.length,1);return calls[0];};
const lower=source=>{const program=parse(source),proof=proveArrayMapValues(program,source);return {program,proof,staged:lowerPxtStagedValues(program,{lowerArrayMap:proof.lower})};};
const clean=source=>{const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[],JSON.stringify(result.unsupported));return result;};
const commandSource='let frames=[img`3 1`,img`1 3`];frames.map(frame=>frame.replace(3,10));';

test('discarded Image command map retains its complete current callback without a result producer grant',()=>{
    const {proof,staged}=lower(commandSource);assert.deepEqual(proof.unsupported,[]);
    const rows=nodes(staged);assert.equal(rows.filter(n=>n.type==='Call'&&n.callee?.name==='replace').length,1);
    assert.equal(rows.filter(n=>n.type==='Call'&&n.callee?.name==='map').length,0);
    assert.equal(rows.filter(n=>n.type==='For'&&n.bwMapOrdered).length,1);
    clean(commandSource);
});
test('discarded map caches receiver and initial length before the ordered current-index loop',()=>{
    const {staged}=lower('let input=[1,2];input.map((value,index)=>{input[index]=value+1;input.push(9)});');
    const loop=nodes(staged).find(n=>n.type==='For'&&n.bwMapOrdered);assert.ok(loop);
    const declarations=staged.body.filter(n=>n.type==='Declaration').flatMap(n=>n.decls);
    const length=declarations.find(d=>d.init?.type==='Member'&&d.init.name==='length');assert.ok(length);
    const receiver=declarations.find(d=>d.name===length.init.object.name);assert.equal(receiver.init.name,'input');
    assert.equal(loop.test.right.name,length.name);
    const indexed=loop.body.filter(n=>n.type==='Declaration').flatMap(n=>n.decls).find(d=>d.init?.type==='Index');
    assert.equal(indexed.init.object.name,receiver.name);assert.equal(indexed.init.index.name,loop.init.decls[0].name);
    assert.equal(nodes(loop.body).filter(n=>n.type==='Call'&&n.callee?.name==='push').length,1,'only actual callback push, no fabricated mapped-result push');
});
test('zero-return discarded callbacks retain all effects without a synthetic result Array',()=>{
    const source='let input=[1,2];let count=0;input.map((value,index)=>{count+=value+index;input.pop()});';
    const {proof,staged}=lower(source);assert.deepEqual(proof.unsupported,[]);clean(source);
    assert.equal(nodes(staged).filter(n=>n.type==='Array').length,1,'only original input allocation');
    assert.equal(nodes(staged).filter(n=>n.type==='Assignment'&&n.op==='+=').length,1);
});
test('complete returned expressions and neighbor order survive discarded staging',()=>{
    const source='let input=[1];let calls=0;function effect(){calls++;return 7}calls+=10;input.map(value=>effect()+value);calls+=100;';
    const {staged}=lower(source),loop=staged.body.findIndex(n=>n.type==='For'&&n.bwMapOrdered);assert.ok(loop>0);
    const effects=nodes(staged.body[loop]).filter(n=>n.type==='Call'&&n.callee?.name==='effect');assert.equal(effects.length,1);
    assert.ok(staged.body.slice(0,loop).some(n=>n.expr?.right?.value==='10'));
    assert.ok(staged.body.slice(loop+1).some(n=>n.expr?.right?.value==='100'));clean(source);
});
test('unknown callback commands remain explicit ordinary translation diagnostics',()=>{
    const source='let input=[1];input.map(value=>unknownCommand(value));';
    const {proof,staged}=lower(source);assert.deepEqual(proof.unsupported,[]);
    assert.equal(nodes(staged).filter(n=>n.type==='Call'&&n.callee?.name==='unknownCommand').length,1);
    assert.ok(arcadeToPseudocode(source).unsupported.length>0,'discarded context does not grant unknown command support');
});
test('missing foreign escaped and incompatible receiver writers remain refused',()=>{
    for(const source of [
        'let input;input.map(value=>value);',
        'let input=foreign();input.map(value=>value);',
        'let input=[1];foreign(input);input.map(value=>value);',
        'let input=[1];input="bad";input.map(value=>value);',
        'let input=[1];input.map=foreign;input.map(value=>value);',
        'function visit(input:any[]){input.map(value=>value)}visit();'
    ])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
test('unsupported callback control flow and parameter constraints remain refused',()=>{
    for(const source of [
        'let input=[1];input.map(value=>{if(value)return 1;return 2});',
        'let input=[1];input.map((value,value)=>value);',
        'let input=[1];input.map((value=1)=>value);',
        'let input=[1];input.map((value:string)=>value);',
        'let input=[1];input.map(function(value):number{return "bad"});'
    ])assert.ok(arcadeToPseudocode(source).unsupported.some(s=>s.startsWith('Array.map:')),source);
});
test('value-used reference maps retain primitive-result refusal while primitive value maps are unchanged',()=>{
    for(const source of [
        'let input=[1];let result=input.map(value=>image.create(1,1));',
        'let input=[1];let result=input.map(value=>[value]);',
        'let frames=[img`1`];let result=frames.map(frame=>frame.replace(1,2));'
    ])assert.ok(arcadeToPseudocode(source).unsupported.some(s=>s.includes('callback result requires actual primitive producers')),source);
    clean('let input=[1,2];let result=input.map((value,index)=>value+index);let first=result[0];');
});
test('discarded lowering refuses observed callback or receiver-writer changes and cannot revive after restoration',()=>{
    for(const change of [
        program=>{const fn=mapCall(program).args[0];const old=fn.body;fn.body=[];return ()=>{fn.body=old;};},
        program=>{const decl=program.body[0].decls[0],old=decl.init;decl.init={type:'String',value:'bad'};return ()=>{decl.init=old;};}
    ]){
        const program=parse(commandSource),call=mapCall(program),proof=proveArrayMapValues(program,commandSource),restore=change(program);
        const invoke=()=>proof.lower(call,{expression:value=>({prefix:[],value}),body:value=>value});
        assert.equal(invoke(),null);restore();assert.equal(invoke(),null);
    }
});
test('discarded callback result has no value-use replacement or extra callback invocation',()=>{
    const program=parse(commandSource),call=mapCall(program),proof=proveArrayMapValues(program,commandSource);let receivers=0,bodies=0;
    const result=proof.lower(call,{expression:value=>{receivers++;return {prefix:[],value};},body:value=>{bodies++;return value;}});
    assert.ok(result);assert.equal(receivers,1);assert.equal(bodies,1);assert.equal(result.value,call,'unused value is still the original unsupported map, never a fabricated primitive');
    assert.equal(result.discardableMap,true);assert.equal(nodes(result.prefix).filter(n=>n.type==='Call'&&n.callee?.name==='replace').length,1);
});


test('unsafe direct proof AST accessors and cycles refuse before source graph traversal',()=>{
    const getter=parse(commandSource);let reads=0;
    Object.defineProperty(getter,'extra',{get(){reads++;throw Error('must not read');},configurable:true});
    const accessorProof=proveArrayMapValues(getter);assert.equal(reads,0);assert.ok(accessorProof.unsupported.length);assert.equal(accessorProof.lower(null,{}),null);
    const ordinary=parse('let value=1;');ordinary.bwProcedureConstraintSource={prefix:()=> 'actual protocol metadata'};
    assert.deepEqual(proveArrayMapValues(ordinary).unsupported,[],'non-Array opaque protocol metadata does not become a map refusal');
    const valueOnly=parse('let input=[1];let result=input.map(value=>value+1);');valueOnly.opaqueMetadata=new WeakMap();
    assert.deepEqual(proveArrayMapValues(valueOnly).unsupported,[],'value-used-only maps retain existing metadata acceptance without discarded snapshot policy');
    const methods=parse(commandSource);methods.body.forEach=()=>{reads++;throw Error('must not invoke');};
    const methodProof=proveArrayMapValues(methods);assert.equal(reads,0);assert.ok(methodProof.unsupported.length);
    const cyclic=parse(commandSource);cyclic.extra=cyclic;
    const cycleProof=proveArrayMapValues(cyclic);assert.ok(cycleProof.unsupported.length);assert.equal(cycleProof.lower(null,{}),null);
});


test('discarded returned unary conditional literal and bound reads use ordinary value staging',()=>{
    for(const expression of ['-value','!value','value?value+1:value+2','"retained"','7','value']){
        const source='let input=[1,2];input.map(value=>'+expression+');',r=clean(source);assert.ok(r.code);
        const {staged}=lower(source),loop=nodes(staged).find(n=>n.type==='For'&&n.bwMapOrdered);assert.ok(loop);
        assert.ok(nodes(loop.body).some(n=>n.type==='Declaration'&&n.decls.some(d=>d.temporary&&d.valuePreserving)));
    }
    const source='let input=[1];let calls=0;let __bwMapValue1=99;function left(){calls+=1;return 2}function right(){calls+=10;return 3}input.map(value=>value?left():right());';
    clean(source);const {staged}=lower(source),loop=nodes(staged).find(n=>n.type==='For'&&n.bwMapOrdered);
    const branch=nodes(loop.body).find(n=>n.type==='If');assert.ok(branch);
    assert.equal(nodes(branch.consequent).filter(n=>n.type==='Call'&&n.callee?.name==='left').length,1);
    assert.equal(nodes(branch.alternate).filter(n=>n.type==='Call'&&n.callee?.name==='right').length,1);
    assert.equal(nodes(loop.body).filter(n=>n.type==='Declaration').flatMap(n=>n.decls).filter(d=>d.temporary&&d.name==='__bwMapValue1').length,0,'fresh ephemeral sink does not collide with user binding');
});
test('discarded returned procedure call retains one genuine call and surrounding effects',()=>{
    const source='let input=[1];let calls=0;function effect(value:number){calls++;return value}calls+=10;input.map(value=>effect(value));calls+=100;';
    clean(source);const {staged}=lower(source),loop=nodes(staged).find(n=>n.type==='For'&&n.bwMapOrdered);assert.ok(loop);
    assert.equal(nodes(loop.body).filter(n=>n.type==='Call'&&n.callee?.name==='effect').length,1);
    assert.equal(nodes(loop.body).filter(n=>n.type==='ExpressionStatement'&&n.expr?.type==='Call'&&n.expr.callee?.name==='effect').length,1,'actual call command remains, no fabricated void result');
});
test('discarded complete value sinks retain unknown operands and unsupported operator diagnostics',()=>{
    for(const expression of ['unknownValue+value','-unknownValue','value?unknownValue:value','value+unknownCommand(value)','unknownValue.constructor']){
        const source='let input=[1];input.map(value=>'+expression+');',r=arcadeToPseudocode(source);
        assert.ok(r.unsupported.length,expression);
        const {staged}=lower(source);assert.ok(nodes(staged).some(n=>n.type==='Identifier'&&['unknownValue','unknownCommand'].includes(n.name)),expression+' retained actual unknown operand');
    }
});
