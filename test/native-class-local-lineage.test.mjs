import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const profile=profiles.ordinary,header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const base='class Base {constructor(public n:any){}get value():any{return this.n}set value(v:any){this.n=v}read():any{return this.n}write(v:any){this.n=v}}';
const inspect=source=>{const program=parseMakeCodeTs(header+';'+source,profile);return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};};
const good=source=>{const result=inspect(source);assert.equal(result.proof.reason,null,source);assert.equal(result.proof.helpers.size,1,source);assert.equal(result.proof.arrayHelpers.size,0);assert.equal(result.proof.current(),true);return result;};
const bad=source=>{const {proof}=inspect(source);assert.equal(proof.helpers.size,0,source);assert.ok(!proof.current()||typeof proof.reason==='string',source);};

test('closed local lineage forwards real constructor arguments and inherited member receivers',()=>{
 for(const source of [
  base+'class Child extends Base {}let child=new Child(3);let n=__bwBinaryAdd(child.value,1);',
  base+'class Middle extends Base {}class Child extends Middle {}let child=new Child(3);let alias=child;alias.value=7;let n=__bwBinaryAdd(child.read(),1);',
  base+'class Child extends Base {constructor(v:any){super(v)}read():any{return super.read()}}let child=new Child(3);let n=__bwBinaryAdd(child.read(),1);',
  'class Base {constructor(public n:any=4){}get value():any{return this.n}}class Child extends Base {}let child=new Child();let n=__bwBinaryAdd(child.value,1);',
  base+'class Child extends Base {}let child=new Child();let n=__bwBinaryAdd(child.value,1);'
 ])good(source);
 // A primitive-only success would also accept a mistaken Undefined seed.
 // Inspect the private result alternatives to prove actual default flow.
 for(const argument of ['', 'undefined']){
  const source='class Base {constructor(public n:any=false){}get value():any{return this.n}}class Child extends Base {}let child=new Child('+argument+');let observed=child.value;';
  good(source+'let n=__bwBinaryAdd(child.value,1);');
  const view=nativeClassScalarView(parseMakeCodeTs(source,profile),profile);
  const init=view.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init;
  assert.equal(init.type,'Conditional');const types=new Set();
  const alternatives=node=>{if(node.type==='Conditional'){alternatives(node.consequent);alternatives(node.alternate);}else types.add(node.type);};alternatives(init);
  assert.ok(types.has('Boolean'),'missing/explicit Undefined actual argument retains Boolean fallback');
 }
 // These defaults are outside the selected structural literal profile. Do
 // not erase an opaque/default call or invent additional default syntax.
 for(const fallback of ['"text"','{}','foreign()'])bad('class Base {constructor(public n:any='+fallback+'){}get value():any{return this.n}}class Child extends Base {}let child=new Child();let n=__bwBinaryAdd(child.value,1);');
});

test('getter and setter halves inherit independently while every inherited writer contributes',()=>{
 good(base+'class Child extends Base {get value():any{return this.n}}let child=new Child(2);child.value=8;let n=__bwBinaryAdd(child.value,1);');
 good(base+'class Child extends Base {set value(v:any){this.n=v}}let child=new Child(2);child.value=8;let n=__bwBinaryAdd(child.value,1);');
 for(const effect of ['child.value={}','child.write({})','let alias=child;alias.n={}'])bad(base+'class Child extends Base {}let child=new Child(2);let n=__bwBinaryAdd(child.value,1);'+effect+';');
 bad('class Base {n:any=2;get value():any{return this.n}poison(){this.n={}}}class Child extends Base {}let child=new Child();let n=__bwBinaryAdd(child.value,1);');
 bad(base+'class Child extends Base {poison(){this.n={}}}let child=new Child(2);let n=__bwBinaryAdd(child.value,1);');
});

test('base construction dispatches virtually to the actual child before child field initialization',()=>{
 const source='class Base {seen:any;constructor(){this.seen=this.read()}read():any{return 2}get value():any{return this.seen}}class Child extends Base {later:any=7;read():any{return this.later}}let child=new Child();let observed=child.read();';
 good(source+'let n=__bwBinaryAdd(child.value,1);');
 const original=parseMakeCodeTs(source,profile),before=structuredClone(original),view=nativeClassScalarView(original,profile);
 assert.deepEqual(original,before);const init=view.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init;
 assert.equal(init.type,'Conditional');assert.equal(init.test.type,'Call');
 const kinds=new Set();const branches=node=>{if(node.type==='Conditional'){branches(node.consequent);branches(node.alternate);}else kinds.add(node.type);};branches(init);
 assert.ok(kinds.has('Undefined'),'earlier virtual read cannot borrow only the later numeric initializer');assert.ok(kinds.has('Number'));
 const parameterSource='class Base {constructor(){this.read()}read():any{return 2}}class Child extends Base {constructor(public later:any){super()}read():any{return this.later}}let child=new Child(7);let observed=child.read();';
 const parameterView=nativeClassScalarView(parseMakeCodeTs(parameterSource,profile),profile);
 const parameterInit=parameterView.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init;
 assert.equal(parameterInit.type,'Conditional');kinds.clear();branches(parameterInit);assert.ok(kinds.has('Undefined'),'a constructor parameter-property prologue cannot erase pre-super absence');
 bad('class Base {seen:any;constructor(){this.seen=this.read()}read():any{return 2}get value():any{return this.seen}}class Child extends Base {later:any=[2];read():any{return this.later}}let child=new Child();let n=__bwBinaryAdd(child.value,1);');
 bad('class Base {n:any=2;constructor(){this.change()}change(){}get value():any{return this.n}}class Child extends Base {change(){this.n={}}}let child=new Child();let n=__bwBinaryAdd(child.value,1);');
});

test('unresolved replaced cyclic reordered and escaped parents never issue local lineage authority',()=>{
 for(const source of [
  'class Child extends Missing {n=2;get value():any{return this.n}}let child=new Child();',
  'class Child extends Base {}'+base+'let child=new Child(2);',
  'class Base extends Child {}class Child extends Base {}let child=new Child();',
  base+'Base=foreign;class Child extends Base {}let child=new Child(2);',
  base+'let Alias=Base;class Child extends Alias {}let child=new Child(2);',
  base+'class Child extends Base {}let child=new Child(2);foreign(child);',
  base+'class Child extends Base {}let child=new Child(2);foreign(Base);',
  'class Child extends sprites.ExtendableSprite {get value():any{return this.x}}let child=new Child(foreignImage);'
 ])bad(source+'let n=__bwBinaryAdd(child.value,1);');
});

test('selected structural conflicts super accessors and constructor escapes stay refused',()=>{
 for(const definition of [
  'class Child extends Base {n:any=4}',
  'class Child extends Base {value(){return 4}}',
  'class Child extends Base {constructor(){super(2);return {} as any}}',
  'class Child extends Base {constructor(){super(2);foreign(this)}}',
  'class Child extends Base {read():any{return super.value}}',
  'class Child extends Base {write(v:any){super.value=v}}'
 ])bad(base+definition+'let child=new Child(2);child.write(3);let n=__bwBinaryAdd(child.read(),1);');
 bad(base+'class Child extends Base {constructor(){super(2);foreign(this)}}let child=new Child();let n=__bwBinaryAdd(child.value,1);');
});

test('lineage projections retain the actual inherited read and full virtual call once with source currentness',()=>{
 const source=base+'class Child extends Base {read():any{return super.read()}}let child=new Child(3);let observed=child.read();let inherited=child.value;';
 good(source+'let n=__bwBinaryAdd(child.read(),1);');
 const original=parseMakeCodeTs(source,profile),before=structuredClone(original),view=nativeClassScalarView(original,profile);
 assert.deepEqual(original,before,'no actual source/body/argument changes');
 const decl=name=>view.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name===name).decls[0].init;
 assert.equal(decl('observed').type,'Conditional');assert.deepEqual(decl('observed').test,before.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init);
 assert.equal(decl('inherited').type,'Conditional');assert.equal(decl('inherited').test.name,'value');
 original.body.find(node=>node.type==='Class'&&node.name==='Child').base='Missing';assert.equal(view.current(),false);
 const {program,proof}=good(source+'let n=__bwBinaryAdd(child.value,1);');
 program.body.find(node=>node.type==='Class'&&node.name==='Base').methods.find(method=>method.kind==='get').body[0].value={type:'Object',props:[]};assert.equal(proof.current(),false);
});
