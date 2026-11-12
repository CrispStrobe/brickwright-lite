import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const base='class Base{constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}';
const child='class Child extends Base{read():number{return this.n+10}}';
const tail='let box=new Child(2);box.value=5;let result=box.read();';
const original=base+child+tail;
const parse=source=>parseMakeCodeTs(source,profile);
const nodes=(value,out=[])=>{
    if(!value||typeof value!=='object')return out;
    if(Array.isArray(value)){for(const child of value)nodes(child,out);return out;}
    out.push(value);
    for(const [name,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(name))nodes(child,out);
    return out;
};
const receiverCarriers=view=>nodes(view.program).filter(node=>node.type==='Conditional'&&
    node.test?.type==='Member'&&node.test.object?.name==='this'&&view.hasOwnedReceiverResult?.(node));
function inspect(source,edit=()=>{}){
    const program=parse(source);edit(program);
    return {program,view:nativeClassScalarView(program,profile)};
}
function closed(source){
    const result=inspect(source),carriers=receiverCarriers(result.view);
    assert.ok(carriers.length>0,'actual accessor-containing class issues owned receiver result: '+source);
    const method=result.view.program.body.find(node=>node.type==='Class'&&node.name==='Child')?.methods.find(node=>node.name==='read');
    const operand=method?.body[0]?.value?.left;
    assert.equal(result.view.hasOwnedReceiverResult?.(operand),true,'the actual read addition receiver is admitted');
    assert.equal(result.view.current(),true);
    return {...result,carriers};
}
const refused=source=>assert.equal(receiverCarriers(inspect(source).view).length,0,source);

test('inherited accessor effects close the actual this-field addition without changing original source',()=>{
    const program=parse(original),before=structuredClone(program),view=nativeClassScalarView(program,profile);
    assert.deepEqual(program,before);
    const method=view.program.body.find(node=>node.type==='Class'&&node.name==='Child').methods.find(node=>node.name==='read');
    const carrier=method.body[0].value.left;
    assert.equal(carrier.type,'Conditional');assert.equal(carrier.test.name,'n');
    assert.equal(carrier.test,program.body.find(node=>node.type==='Class'&&node.name==='Child').methods[0].body[0].value.left);
    assert.equal(view.hasNormalPrimitiveResult(carrier),true);
    assert.equal(view.hasOwnedReceiverResult(carrier),true,'the previously missing receiver-readiness certificate');
    assert.equal(view.hasOwnedReceiverResult(structuredClone(carrier)),false);
    const other=closed(original).view;assert.equal(other.hasOwnedReceiverResult(carrier),false);
    assert.equal(carrier.consequent.type,'Number');assert.equal(carrier.alternate.type,'Number');
});

test('implicit getter and setter edges retain inherited halves, overrides, compound writes and updates',()=>{
    for(const source of [
        original,
        original.replace('box.value=5','box.value+=5;box.value++'),
        base+'class Child extends Base{set value(v:number){this.n=v}read(){return this.value+10}}'+tail,
        base+'class Child extends Base{get value(){return this.n}read(){return this.value+10}}'+tail,
        base+'class Child extends Base{get value(){return this.n+1}set value(v:number){this.n=v+1}read(){return this.value+10}}'+tail
    ])closed(source);
});

test('actual setter arguments and dormant writers cannot borrow another populated formal',()=>{
    for(const source of [
        original.replace('box.value=5','box.value=[]'),
        original.replace('box.value=5','box.value={}'),
        base+child+'let box=new Child(2);box.value=5;function dormant(v){box.value=v}let result=box.read();',
        base+child+'let box=new Child(2);box.value=5;function dormant(item){item.value=3}let result=box.read();',
        original.replace('read():number{return this.n+10}','read():number{return this.n+10}dirty(){this.n=[]}'),
        original.replace('read():number{return this.n+10}','read():number{return this.n+10}dirty(){this.n={}}')
    ])refused(source);
    closed(original);
});

test('actual primitive setter domains retain String writers instead of borrowing the Number annotation',()=>{
    const {view}=closed(original.replace('box.value=5','box.value="text"'));
    const method=view.program.body.find(node=>node.type==='Class'&&node.name==='Child').methods.find(node=>node.name==='read');
    const types=nodes(method.body[0].value.left).filter(node=>['Number','String'].includes(node.type)).map(node=>node.type);
    assert.ok(types.includes('String'),'actual setter writer remains in the result domain');
});

test('unknown accessor effects, escaped instances and unsupported super accessor dispatch remain refused',()=>{
    for(const source of [
        original.replace('return this.n}','foreign();return this.n}'),
        original.replace('this.n=v}','foreign(v);this.n=v}'),
        original+'consume(box);',
        base+'class Child extends Base{get other(){return super.value}read(){return this.n+10}}'+tail
    ])refused(source);
});

test('malformed accessor declarations cannot open the closed receiver slice',()=>{
    for(const mutate of [
        get=>{get.params.push('unexpected');},
        (_get,set)=>{set.params=[];},
        get=>{get.optionalParams=['unexpected'];},
        (_get,set)=>{set.restParam='v';},
        get=>{get.isAsync=true;},
        (_get,set)=>{set.isGenerator=true;},
        get=>{get.isStatic=true;},
        (_get,set)=>{set.typeParameters=['T'];}
    ]){
        const result=inspect(original,program=>{
            const methods=program.body.find(node=>node.type==='Class'&&node.name==='Base').methods;
            mutate(methods.find(method=>method.kind==='get'),methods.find(method=>method.kind==='set'));
        });
        assert.equal(receiverCarriers(result.view).length,0,String(mutate));
    }
    assert.throws(()=>inspect(original,program=>{
        const setter=program.body.find(node=>node.type==='Class'&&node.name==='Base').methods.find(method=>method.kind==='set');
        setter.params.restParam='v';
    }),/Generated helper normalization requires the actual parser parameter metadata/,
    'corrupt physical parameter-array metadata retains the existing normalization refusal');
    closed(original);
});

test('used accessor result source and carrier changes remain revoked after restoration',()=>{
    const {program,view,carriers}=closed(original),carrier=carriers[0];
    assert.equal(view.hasNormalPrimitiveResult(carrier),true);
    const setter=program.body.find(node=>node.type==='Class'&&node.name==='Base').methods.find(method=>method.kind==='set');
    const saved=setter.body;setter.body=[];assert.equal(view.current(),false);
    setter.body=saved;assert.equal(view.current(),false,'restored accessor body cannot revive a used proof');
    closed(original);
    const fresh=closed(original),entry=fresh.carriers[0],actual=entry.test;
    entry.test={...actual};assert.equal(fresh.view.hasOwnedReceiverResult(entry),false);
    entry.test=actual;assert.equal(fresh.view.hasOwnedReceiverResult(entry),false,'restored carrier identity remains revoked');
});
