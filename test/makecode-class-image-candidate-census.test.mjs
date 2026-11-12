import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource,classResultFlowCertificate,classMethodSourceSignature,classConstructorSourceSignature,classCallableReflectionSource,classSdkImageRoles,classSdkImageValue,assertCurrentClassSourceProof,classSdkImageValueCandidate} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {withClassResultFlowProof,withCompilerOwnedClassResultFlowProof} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-result-flow-proof.js';
import {cloneClassSourceMetadata,ordinaryConstructorParameterProperties} from '../overlay/scratch-gui/src/lib/bw-makecode/class-parameter-property-source.js';
import {source as imageSource} from './fixtures/arcade/sdk-image-class-callables.mjs';
// Exact previous implementation body, with only its function name changed.
function baselineWithClassResultFlowProof(program,proof) {
    if(proof?.eligible!==true||!proof.resultFlows)return program;
    const methods=new Set(program.body.filter(node=>node.type==='Class').flatMap(node=>node.methods));
    return cloneClassSourceMetadata(program,(node,out)=>{
        if(classSdkImageValue(proof,program,node)){out.bwSdkImageValue=true;out.bwObjectTypes=['image'];}
        if(node.type==='Unary'&&node.op==='typeof'&&classCallableReflectionSource(proof,program,node))out.bwSourceCallableTypeOf=true;
        if(node.type==='Class') {
            const roles=classSdkImageRoles(proof,program,node);if(roles)out.bwSdkImageRoles=roles;
            const constructor=classConstructorSourceSignature(proof,program,node);
            if(constructor)out.ctor.bwClassCallableSignature=constructor;
            if(node.ctor?.parameterProperties?.length&&!ordinaryConstructorParameterProperties(out))
                throw Error('Class lowering lost its actual constructor parameter property correspondence');
        }
        if(methods.has(node)) {
            out.bwClassCallableSignature=classMethodSourceSignature(proof,program,node);
            const flow=classResultFlowCertificate(proof,program,node);
            if(flow)out.bwClassResultFlow=structuredClone(flow);
        }
    });
}

const counter=`class Counter {
 trace:number;
 constructor(public readonly seed:number,private step:(value:number)=>number,public tick:()=>void){this.trace=this.seed;}
 read(){return this.step(this.seed);}
 bump(){this.trace+=1;this.tick();}
}
let seen=0;let box=new Counter(2,(value:number)=>value+3,()=>{seen+=1;});
let first=box.read();box.bump();let last=box.trace;let seed=box.seed;`;
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
const issue=(text=counter,options={})=>{const program=parse(text),proof=proveClassCallableSource(program,options);assert.equal(proof.eligible,true,JSON.stringify(proof.unsupported));return {program,proof};};
const objects=root=>{const found=[],seen=new Set();const visit=value=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);found.push(value);for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(Object.hasOwn(d,'value'));visit(d.value);}};visit(root);return found;};
const cls=program=>program.body.find(node=>node.type==='Class');
test('actual parameter-property clone retains complete baseline metadata and shared parser roles',()=>{
 const {program,proof}=issue();const nodes=objects(program);assert.ok(nodes.length>20);
 assert.equal(nodes.some(node=>classSdkImageValueCandidate(proof,node)),false);
 const actual=withCompilerOwnedClassResultFlowProof(program,proof),expected=baselineWithClassResultFlowProof(program,proof);assert.deepEqual(actual,expected);
 const ctor=cls(actual).ctor;assert.equal(ctor.parameterProperties,ctor.params.parameterProperties);
 assert.deepEqual(Object.getOwnPropertyDescriptor(ctor.params,'parameterProperties'),Object.getOwnPropertyDescriptor(cls(expected).ctor.params,'parameterProperties'));
 assert.equal(ordinaryConstructorParameterProperties(cls(actual)),true);assert.notEqual(actual,program);
 assert.equal(assertCurrentClassSourceProof(proof,program),undefined);
});
test('actual SDK Image membership selects original full queries without granting annotations or copies',()=>{
 const parameterImage=imageSource.replace('picture:Image;constructor(picture:Image){this.picture=picture}','constructor(public picture:Image){}');
 assert.notEqual(parameterImage,imageSource);const {program,proof}=issue(parameterImage,{sdkImagePrototype:true}),nodes=objects(program),candidates=nodes.filter(node=>classSdkImageValueCandidate(proof,node));
 assert.ok(candidates.length>0);assert.ok(candidates.some(node=>classSdkImageValue(proof,program,node)));
 for(const node of candidates)assert.equal(classSdkImageValueCandidate(proof,structuredClone(node)),false);
 for(const node of [{type:'Identifier',name:'image',bwSdkImageValue:true},{type:'Image',bwObjectTypes:['image']},[]])assert.equal(classSdkImageValueCandidate(proof,node),false);
 assert.deepEqual(withCompilerOwnedClassResultFlowProof(program,proof),baselineWithClassResultFlowProof(program,proof));
 const original=candidates.find(node=>classSdkImageValue(proof,program,node));program.body.push({type:'ExpressionStatement',expr:{type:'Number',value:'1'}});
 assert.equal(classSdkImageValueCandidate(proof,original),true,'membership alone can remain true on stale source');
 assert.throws(()=>classSdkImageValue(proof,program,original),/actual unchanged source proof/);assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,proof),/actual unchanged source proof/);
});
test('stale all-negative source and foreign completed-proof identities cannot emit metadata',()=>{
 const {program,proof}=issue();assert.equal(objects(program).some(node=>classSdkImageValueCandidate(proof,node)),false);
 assert.throws(()=>withCompilerOwnedClassResultFlowProof(structuredClone(program),proof),/actual unchanged source proof/);
 assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,{eligible:true,resultFlows:proof.resultFlows}),/actual unchanged source proof/);
 cls(program).name='Edited';assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,proof),/actual unchanged source proof/);
});
test('same-shaped parameter-property replacement expires proof despite equal JSON and restored identity',()=>{
 const {program,proof}=issue(),original=cls(program).ctor.body[0];const before=JSON.stringify(program);cls(program).ctor.body[0]=structuredClone(original);assert.equal(JSON.stringify(program),before);
 assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,proof),/actual unchanged source proof/);cls(program).ctor.body[0]=original;
 assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,proof),/actual unchanged source proof/);
 const fresh=proveClassCallableSource(program);assert.equal(fresh.eligible,true);assert.deepEqual(withCompilerOwnedClassResultFlowProof(program,fresh),baselineWithClassResultFlowProof(program,fresh));
});
test('hidden constructor role edits refuse without getter calls and remain expired after restoration',()=>{
 const {program,proof}=issue(),ctor=cls(program).ctor,descriptor=Object.getOwnPropertyDescriptor(ctor,'parameterProperties');let reads=0;
 Object.defineProperty(ctor,'parameterProperties',{enumerable:true,configurable:true,get(){reads++;throw Error('foreign metadata');}});
 assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,proof),/actual unchanged source proof/);assert.equal(reads,0);
 Object.defineProperty(ctor,'parameterProperties',descriptor);assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,proof),/actual unchanged source proof/);assert.equal(reads,0);
});

test('JSON-only public accessor and Proxy observation paths are preserved by internal fallback',()=>{
 const {program,proof}=issue(imageSource,{sdkImagePrototype:true});const number=objects(program).find(node=>node.type==='Number');assert.ok(number);const descriptor=Object.getOwnPropertyDescriptor(number,'value');let reads=0;
 // Install exactly one actual getter with the original serialized value.
 Object.defineProperty(number,'value',{enumerable:descriptor.enumerable,configurable:true,get(){reads++;return descriptor.value;}});
 const observe=fn=>{reads=0;let message;try{fn(program,proof);}catch(error){message=error.message;}return {reads,message};};
 const old=observe(withClassResultFlowProof),current=observe(withCompilerOwnedClassResultFlowProof);
 assert.equal(typeof old.message,'string');assert.deepEqual(current,old);Object.defineProperty(number,'value',descriptor);
 let keys=0;const proxy=new Proxy(program,{ownKeys(target){keys++;return Reflect.ownKeys(target);}});
 const observeProxy=fn=>{keys=0;let message;try{fn(proxy,proof);}catch(error){message=error.message;}return {keys,message};};
 const oldProxy=observeProxy(withClassResultFlowProof),newProxy=observeProxy(withCompilerOwnedClassResultFlowProof);assert.equal(typeof oldProxy.message,'string');assert.deepEqual(newProxy,oldProxy);
});
test('changed observation intrinsics delegate the complete original operation without extra foreign calls',()=>{
 for(const [object,key]of [[Object,'getOwnPropertyDescriptor'],[WeakMap.prototype,'has'],[WeakMap.prototype,'get']]) {
  const a=issue(),b=issue(),original=Object.getOwnPropertyDescriptor(object,key),apply=Reflect.apply;let calls=0;
  const observe=(fn,fixture)=>{calls=0;let result;Object.defineProperty(object,key,{...original,value:function(...args){calls++;return apply(original.value,this,args);}});
   try{result=fn(fixture.program,fixture.proof);}finally{Object.defineProperty(object,key,original);}return {result,calls};};
  const old=observe(withClassResultFlowProof,a),current=observe(withCompilerOwnedClassResultFlowProof,b);assert.ok(old.calls>0);assert.equal(current.calls,old.calls,key);assert.deepEqual(current.result,old.result);
 }
 const fixture=issue(),globalObject=globalThis,descriptor=Object.getOwnPropertyDescriptor(globalObject,'globalThis');let reads=0,result;
 Object.defineProperty(globalObject,'globalThis',{configurable:true,get(){reads++;throw Error('do not invoke global alias');}});
 try{result=withCompilerOwnedClassResultFlowProof(fixture.program,fixture.proof);}finally{Object.defineProperty(globalObject,'globalThis',descriptor);}
 assert.equal(reads,0);assert.deepEqual(result,withClassResultFlowProof(fixture.program,fixture.proof));
});
test('ordinary methods, classless proofs and defaults preserve original full clone behavior',()=>{
 for(const text of ['let count=1;','class Box{value:number;constructor(value:number){this.value=value}read(){return this.value}}let box=new Box(2);let result=box.read();']) {
  const program=parse(text),ineligible=proveClassCallableSource(program);assert.equal(ineligible.eligible,false);assert.deepEqual(ineligible.unsupported,[]);
  assert.equal(withClassResultFlowProof(program,ineligible),program);assert.equal(withCompilerOwnedClassResultFlowProof(program,ineligible),program);
 }
 for(const [text,options]of [[imageSource,{sdkImagePrototype:true}],[counter,{}]]) {
  const {program,proof}=issue(text,options);assert.deepEqual(withCompilerOwnedClassResultFlowProof(program,proof),baselineWithClassResultFlowProof(program,proof));
  assert.deepEqual(withClassResultFlowProof(program,proof),baselineWithClassResultFlowProof(program,proof));
  program.extra={type:'Identifier',name:'not-original'};assert.throws(()=>withCompilerOwnedClassResultFlowProof(program,proof),/actual unchanged source proof/);
 }
 const {program,proof}=issue();const expected=baselineWithClassResultFlowProof(program,proof),actual=withCompilerOwnedClassResultFlowProof(program,proof);
 assert.deepEqual(objects(actual).filter(node=>Object.hasOwn(node,'parameterDefaults')).map(node=>Object.getOwnPropertyDescriptor(node,'parameterDefaults')),objects(expected).filter(node=>Object.hasOwn(node,'parameterDefaults')).map(node=>Object.getOwnPropertyDescriptor(node,'parameterDefaults')));
});
