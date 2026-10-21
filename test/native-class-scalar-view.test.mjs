import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const profile=GENERATED_HELPER_PROFILES.ordinary,helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const box='class Box {constructor(public n:any){} get value():any{return this.n} set value(v:any){this.n=v} bump(v:any){this.n=v;return this.n}}';
const inspect=source=>{const program=parseMakeCodeTs(helper+';'+source,profile);return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};};
const good=source=>{const result=inspect(source);assert.equal(result.proof.reason,null,source);assert.equal(result.proof.helpers.size,1,source);assert.equal(result.proof.current(),true);return result;};
const bad=source=>{const result=inspect(source);assert.equal(result.proof.helpers.size,0,source);if(result.proof.current())assert.equal(typeof result.proof.reason,'string',source);else assert.equal(result.proof.reason,null,'existing earlier physical/binding refusal is retained');};

test('private class scalar facts follow actual constructor setter getter alias and method producers',()=>{
    for(const source of [
        box+';let object=new Box(2);let alias=object;alias.value=5;let n=__bwBinaryAdd(object.value,1)',
        box+';let object:any;let alias:any;function start(){let temporary:any=0;temporary=new Box(2);object=temporary;alias=object;alias.value=5;let n=__bwBinaryAdd(object.value,1)}start()',
        box+';function identity(value:any){return value}let object=identity(new Box("n"));object.bump("x");let n=__bwBinaryAdd(object.value,"!")',
        'class Named {constructor(public readonly renamed:number){} get result():any{return this.renamed}};let object=new Named(4);let n=__bwBinaryAdd(object.result,1)',
        'class Default {n:any;get value():any{return this.n}};let object=new Default();let n=__bwBinaryAdd(object.value,1)'
    ])good(source);
});

test('class annotations do not grant scalar facts and all actual later field writers poison them',()=>{
    for(const value of ['{}','[5]','foreign()','sprites.create(img`1`,0)','img`1`','assets.image`named`','foreignTag`x`']){
        bad(box+';let object=new Box('+value+');let n=__bwBinaryAdd(object.value,1)');
        bad(box+';let object=new Box(2);let alias=object;let n=__bwBinaryAdd(object.value,1);alias.value='+value);
        bad(box+';let object=new Box(2);let n=__bwBinaryAdd(object.value,1);object.n='+value);
        bad(box+';let object=new Box(2);let n=__bwBinaryAdd(object.value,1);object.bump('+value+')');
    }
    bad('class Lie {n:number={} as any;get value():number{return this.n}};let object=new Lie();let n=__bwBinaryAdd(object.value,1)');
    bad(box+';let object=new Box(2);let other=new Box({});let n=__bwBinaryAdd(object.value,1)');
});

test('unknown computed prototype extracted-method and callback escapes never become class certificates',()=>{
    const start=box+';let object=new Box(2);';
    for(const effect of [
        'foreign(object)', 'let store={object:object}', 'let store=[object];foreign(store)',
        'let store={nested:{object:object}}', 'let store=[{nested:[object]}]',
        'let store={callback:function(value:any){object.n=value}}',
        'let store=[function(value:any){object.n=value}]',
        'let shadow=3;let store={callback:function(shadow:any){object.n=shadow}}',
        'object["n"]={}', 'Object.defineProperty(object,"n",{value:{}})',
        'let method=object.bump;method(3)', 'let Constructor=Box',
        'delete object.n', 'foreign(function(value:any){object.n=value})',
        'Box=foreign', 'let next=new Foreign()', 'object.unknown=3',
        'foreignTag`x`', 'assets.image`named`', 'img`1`'
    ])bad(start+effect+';let n=__bwBinaryAdd(object.value,1)');
    good('class Base {n=2}class Child extends Base {get value():any{return this.n}};let object=new Child();let n=__bwBinaryAdd(object.value,1)');
    bad('class Child extends Missing {get value():any{return this.n}};let object=new Child();let n=__bwBinaryAdd(object.value,1)');
    bad('class Replace {n=2;constructor(){return {} as any}get value():any{return this.n}};let object=new Replace();let n=__bwBinaryAdd(object.value,1)');
    const overwritten='let object:any;';
    for(const body of [
        'let temporary:any=0;if(foreignCondition){temporary=new Box(2)}object=temporary',
        'let temporary:any=0;temporary=new Box(2);temporary={};object=temporary',
        'let temporary:any=0;function captured(){return temporary}temporary=new Box(2);object=temporary',
        'let temporary:any=0;temporary=new Box(2);foreign(temporary);object=temporary',
        'let temporary:any=0;let observed=temporary;temporary=new Box(2);object=temporary'
    ])bad(box+';'+overwritten+'function start(){'+body+';object.value=5;let n=__bwBinaryAdd(object.value,1)}start()');

    // Future value producers are deliberately unmodeled. Their primitive
    // children cannot erase an actual opaque writer or unknown callback.
    for(const type of ['FutureValue','Unknown']){
        const program=parseMakeCodeTs(helper+';'+start+'object.n=3;let n=__bwBinaryAdd(object.value,1)',profile);
        const assignment=program.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Assignment'&&node.expr.left?.name==='n');
        assert.ok(assignment,'actual field writer is present');
        assignment.expr.right={type,value:{type:'Number',value:'3'}};
        const admitted=inspectGeneratedHelperBindings(program,profile).isCurrent();
        assert.equal(admitted,type!=='Unknown','preexisting Unknown guard stays closed; FutureValue reaches domain fallback');
        const proof=inspectNativeArrayBinaryDomains(program,profile);
        assert.equal(proof.helpers.size,0,type+' cannot silently lose its writer');
        if(admitted)assert.equal(typeof proof.reason,'string');
    }
});

test('class analysis preserves original getter execution and physical source currentness without Array admission',()=>{
    const {program,proof}=good(box+';let object=new Box(2);let n=__bwBinaryAdd(object.value,1)');
    const direct=parseMakeCodeTs(box+';let object=new Box(2);let observed=object.value',profile);
    const before=structuredClone(direct),view=nativeClassScalarView(direct,profile);
    assert.deepEqual(direct,before,'actual source is never changed');
    const declaration=view.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed');
    const operand=declaration.decls[0].init;
    assert.equal(operand.type,'Conditional');assert.equal(operand.test.type,'Member');
    assert.equal(operand.test.object.name,'object');assert.equal(operand.test.name,'value','actual getter read remains once in private test position');
    const original=program.body.find(node=>node.type==='Class');original.methods.find(method=>method.kind==='get').body[0].value={type:'Object',props:[]};
    direct.body.find(node=>node.type==='Class').methods.find(method=>method.kind==='get').body[0].value={type:'Object',props:[]};
    assert.equal(proof.current(),false);assert.equal(view.current(),false);
    assert.equal(inspectNativeArrayBinaryDomains(program,profile).helpers.size,0);
    bad('class Images {n:any[]=[5];get value():any{return this.n}};let object=new Images();let n=__bwBinaryAdd(object.value,"!")');
    bad('let rows=[5];class Change {n=1;get value():any{foreign();return this.n}};let object=new Change();let n=__bwBinaryAdd(rows,object.value)');
});
