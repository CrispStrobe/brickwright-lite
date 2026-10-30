import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const profile=profiles.ordinary,header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const box='class Box {next:Box;constructor(public n:any){this.next=this}get value():any{return this.n}set value(v:any){this.n=v}read(){return this.n}set(v:any){this.n=v;return this}identity(){return this}}';
const inspect=source=>{const program=parseMakeCodeTs(header+';'+source,profile);return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};};
const good=source=>{const result=inspect(source);assert.equal(result.proof.reason,null,source);assert.equal(result.proof.helpers.size,1);assert.equal(result.proof.current(),true);assert.equal(result.proof.arrayHelpers.size,0,'class-containing Arrays are not native flat-Array body authority');return result;};
const bad=source=>{const {proof}=inspect(source);assert.equal(proof.helpers.size,0,source);assert.ok(!proof.current()||typeof proof.reason==='string',source);};

test('actual local class Arrays retain aliases, setter writes, self fields and owned method normal results',()=>{
 for(const source of [
  box+';let object=new Box(2);let rows=[object];let alias=rows;let held=alias[0];held.value=5;let n=__bwBinaryAdd(held.read(),1);',
  box+';let object=new Box(2);let rows=[];rows.push(object);let held=rows[0];let returned=held.set(7);let n=__bwBinaryAdd(returned.read(),1);',
  box+';let object=new Box(2);let rows=[object];let held=rows[0];let self=held.next;let n=__bwBinaryAdd(self.value,1);',
  box+';function identity(rows:any){return rows}let object=new Box(2);let rows=identity([object]);let held=rows[0];let n=__bwBinaryAdd(held.value,1);',
  box+';let object=new Box(2);let rows=[object];let size=rows.length;let held=rows[0];let n=__bwBinaryAdd(held.value,size);'
 ])good(source);
});

test('owned class fields and cyclic local aggregate aliases retain values until an actual escape',()=>{
 const holder='class Holder {next:Holder;constructor(public items:any){this.next=this}get child(){return this.items[0]}}';
 good(box+';'+holder+';let child=new Box(2);let rows=[child];rows.push(rows);let holder=new Holder(rows);let n=__bwBinaryAdd(child.value,1);');
 good(box+';'+holder+';let child=new Box(2);let rows=[child];let holder=new Holder(rows);let held=holder.child;held.value=9;let n=__bwBinaryAdd(child.value,1);');
 for(const escape of ['let external={holder:holder}', 'let external={nested:{rows:rows}}','foreign(holder)','foreign(rows)']){
  bad(box+';'+holder+';let child=new Box(2);let rows=[child];rows.push(rows);let holder=new Holder(rows);'+escape+';let n=__bwBinaryAdd(child.value,1);');
 }
});

test('complete aggregate writers, unknown getters and alias publication invalidate reachable class facts',()=>{
 const prefix=box+';let object=new Box(2);let rows=[object];let alias=rows;';
 for(const effect of [
  'alias.push(new Box({}))','alias[0]={}','alias.length=0','alias.push=foreign','let push=alias.push',
  'foreign(alias)','let store={rows:alias}','let callbacks=[function(value:any){object.n=value}]',
  'let held=alias[0];held.value={}','let held=alias[0];held.set({})',
  'let index=foreignIndex;let held=alias[index]','let ignored=foreignObject.value',
  'Object.setPrototypeOf(alias,foreignPrototype)','let held=alias["constructor"]',
  'object.read=foreign'
 ])bad(prefix+effect+';let n=__bwBinaryAdd(object.value,1);');
 bad(box+';let object=new Box(2);let rows=[object];rows.push(rows);let external={cycle:rows};let n=__bwBinaryAdd(object.value,1);');
 // The aggregate may be private, but its value is not a primitive/helper
 // operand or a body loan merely because its elements are known instances.
 bad(prefix+'let n=__bwBinaryAdd(alias,"!");');
 // Local inheritance retains actual parent constructor values. An unresolved
 // parent and a real constructor write still refuse the additional facts.
 good(prefix+'class Child extends Box {}let other=new Child(2);let n=__bwBinaryAdd(object.value,1);');
 good(prefix+'class Child extends Box {}let other=new Child(2);let n=__bwBinaryAdd(other.value,1);');
 bad(prefix+'class Child extends Missing {}let other=new Child(2);let n=__bwBinaryAdd(other.value,1);');
 bad(prefix+'class Child extends Box {constructor(){super(2);object.n={}}}let other=new Child();let n=__bwBinaryAdd(object.value,1);');
});

test('method scalar projection preserves original call and distinguishes returned references and stale source',()=>{
 const classSource=box+';let object=new Box(2);let rows=[object];let held=rows[0];let alias=held.identity();let observed=held.read();';
 const {program,proof}=good(classSource+'let n=__bwBinaryAdd(held.read(),1);');
 // The raw private view consumes classes after the separate complete helper
 // proof; it does not independently erase an undeclared/native helper body.
 const original=parseMakeCodeTs(classSource,profile),before=structuredClone(original),view=nativeClassScalarView(original,profile);
 assert.deepEqual(original,before,'actual parsed source is never rewritten');
 const declaration=name=>view.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name===name).decls[0].init;
 const observed=declaration('observed');assert.equal(observed.type,'Conditional');assert.equal(observed.test.type,'Call');
 assert.equal(observed.test.callee.type,'Member');assert.equal(observed.test.callee.name,'read');assert.equal(observed.test.callee.object.name,'held');assert.deepEqual(observed.test.args,[]);
 assert.equal(declaration('alias').type,'Call','reference-returning methods never acquire a primitive result');
 const unbound=parseMakeCodeTs(classSource+'let unknown=__bwBinaryAdd(1,2);',profile);
 const unboundView=nativeClassScalarView(unbound,profile);
 assert.equal(unboundView.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init.type,'Call','unbound helper remains an unknown effect, not an exemption');
 original.body.find(node=>node.type==='Class').methods.find(method=>method.name==='read').body[0].value={type:'Object',props:[]};
 assert.equal(view.current(),false);
 program.body.find(node=>node.type==='Class').methods.find(method=>method.name==='read').body[0].value={type:'Object',props:[]};
 assert.equal(proof.current(),false);
 bad(box+';let object=new Box(2);let method=object.read;let n=__bwBinaryAdd(method(),1);');
});
