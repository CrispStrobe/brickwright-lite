import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {createClosedOrdinarySourceEntry,closedOrdinarySourceEntryFor} from '../overlay/scratch-gui/src/lib/bw-makecode/closed-ordinary-source-entry.js';
import {analyseSourceValueProducers,validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const parse=s=>parseMakeCodeTs(s,{retainParentheses:true});
function nodes(n,out=[]){if(!n||typeof n!=='object')return out;if(Array.isArray(n)){n.forEach(x=>nodes(x,out));return out;}out.push(n);for(const [k,v]of Object.entries(n))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(k))nodes(v,out);return out;}
const source=`let values=[1,2];
function swap(i:number,j:number){values[i]=values[j]}
function live(){swap(0,1)}
function dormant(hi){swap(0,hi)}
live();`;
const callIn=(p,name)=>p.body.find(n=>n.type==='FunctionDeclaration'&&n.name===name).body.find(n=>n.type==='ExpressionStatement').expr;
test('closed lexical roots omit only dormant ordinary caller edges without Number or initialization facts',()=>{
 const p=parse(source),before=JSON.stringify(p),proof=createClosedOrdinarySourceEntry(p),dead=callIn(p,'dormant'),live=callIn(p,'live');
 assert.equal(proof.current(),true);assert.equal(proof.isUnreachable(dead),true);assert.equal(proof.isUnreachable(live),false);
 assert.equal(closedOrdinarySourceEntryFor(p,proof),proof);assert.equal(closedOrdinarySourceEntryFor(p,{...proof}),null);
 const g=analyseSourceValueProducers(p,{closedOrdinaryEntries:true,unboundIsOpaque:true});
 assert.deepEqual([...g.typesAt(live.args[1])],['Number']);
 const formalRead=nodes(p.body.find(n=>n.name==='swap')).find(n=>n.type==='Identifier'&&n.name==='j');
 assert.deepEqual([...g.typesAt(formalRead)],['Number']);assert.equal(g.typesAt(dead.args[1]).has('Number'),false);
 assert.deepEqual(validateProcedureConstraintSource(p,{closedOrdinaryEntries:true}),[]);
 assert.ok(validateProcedureConstraintSource(p).some(x=>x.includes('swap.j')));
 const explicit=parse(source.replace('function dormant(hi){swap(0,hi)}','function dormant(){swap(0,"bad" as any)}'));
 const exact=analyseSourceValueProducers(explicit,{closedOrdinaryEntries:true,unboundIsOpaque:true});
 const destination=nodes(explicit.body.find(n=>n.name==='swap')).find(n=>n.type==='Identifier'&&n.name==='j');
 assert.deepEqual([...exact.typesAt(destination)],['Number']);
 assert.equal(JSON.stringify(p),before);
});
test('activation propagates through recursive components and bad current callers retain constraints',()=>{
 const p=parse(source+'dormant("bad");'),proof=createClosedOrdinarySourceEntry(p);
 assert.equal(proof.isUnreachable(callIn(p,'dormant')),false);
 assert.ok(validateProcedureConstraintSource(p,{closedOrdinaryEntries:true}).some(x=>x.includes('swap.j')));
 const q=parse('function a(){b()}function b(){a()}function live(){}live()');
 const e=createClosedOrdinarySourceEntry(q);assert.equal(e.isUnreachable(callIn(q,'a')),true);
 const r=parse('function a(){b()}function b(){a()}a()');assert.equal(createClosedOrdinarySourceEntry(r).isUnreachable(callIn(r,'b')),false);
});
test('aliases callbacks exports nested declarations and foreign callable roots conservatively deny omission',()=>{
 for(const suffix of ['let alias=dormant;','unknown();','screen.other();','let cb=()=>dormant(0);','function outer(){function inner(){}}','namespace N {}','class C {}','export function exposed(){}','let dormant=0;']){
  const p=parse(source+suffix);assert.equal(createClosedOrdinarySourceEntry(p).isUnreachable(callIn(p,'dormant')),false,suffix);
 }
});
test('same-value identity replacement and observed mutation permanently expire issued proof',()=>{
 const p=parse(source),e=createClosedOrdinarySourceEntry(p),call=callIn(p,'dormant');assert.equal(e.isUnreachable(call),true);
 const old=call.args[0];call.args[0]={...old};assert.equal(e.current(),false);call.args[0]=old;assert.equal(e.current(),false);
 const q=parse(source);assert.equal(closedOrdinarySourceEntryFor(q,e),null);
});
test('entry-neutral SDK calls require actual unshadowed immutable binding paths',()=>{
 const text=source+'screen.fill(0);screen.fillRect(1,2,3,4,5);pause(1);randint(0,1);';
 const p=parse(text);assert.equal(createClosedOrdinarySourceEntry(p).isUnreachable(callIn(p,'dormant')),true);
 for(const edit of ['let screen=0;','screen.fill=0;','let pause=0;','pause=0;']){
  const q=parse(edit+text);assert.equal(createClosedOrdinarySourceEntry(q).isUnreachable(callIn(q,'dormant')),false,edit);
 }
});
test('supported importer preserves dormant procedure declaration and body rather than replacing values',async()=>{
 const result=await arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[]);
 assert.match(result.code,/dormant/);assert.match(result.code,/swap/);assert.match(result.code,/hi/);
 const bad=await arcadeToPseudocode(source+'dormant("bad");');assert.ok(bad.unsupported.some(x=>String(x).includes('swap.j')));
});

test('inactive bodies retain formal-writer constraints and current local producers',()=>{
 const p=parse('function consume(n:number){n="bad" as any}function unused(x){consume(x)}');
 assert.ok(validateProcedureConstraintSource(p,{closedOrdinaryEntries:true}).some(x=>x.includes('writer')));
 const q=parse(source+'let later=0;later="bad" as any;swap(0,later)');
 assert.ok(validateProcedureConstraintSource(q,{closedOrdinaryEntries:true}).some(x=>x.includes('swap.j')));
});
test('sorting-shaped closed roots retain dormant recursive procedures and all source arithmetic',()=>{
 const text=`let data=[4,1,3];
 function exchange(i:number,j:number){let t=data[i];data[i]=data[j];data[j]=t}
 function order(){for(let i=0;i<2;i++){exchange(i,i+1)}screen.fill(0);pause(1)}
 function split(lo,hi){exchange(lo,hi);return hi}
 function divide(lo,hi){if(lo<hi){let pivot=split(lo,hi);divide(lo,pivot-1);divide(pivot+1,hi)}}
 order();`;
 const result=arcadeToPseudocode(text);assert.deepEqual(result.unsupported,[]);
 for(const name of ['exchange','order','split','divide'])assert.match(result.code,new RegExp(name));
 const p=parse(text),proof=createClosedOrdinarySourceEntry(p);
 const recursive=nodes(p).filter(n=>n.type==='Call'&&n.callee?.name==='divide');
 assert.equal(recursive.length,2);assert.ok(recursive.every(n=>proof.isUnreachable(n)));
});
