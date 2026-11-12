import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {createOrdinaryFrameDeltaNumberSource} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-frame-delta-number-source.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeAdditionExportDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const profile=GENERATED_HELPER_PROFILES.ordinary;
const parse=s=>parseMakeCodeTs(s,profile);
const walk=(n,out=[])=>{if(!n||typeof n!=='object')return out;if(Array.isArray(n)){for(const v of n)walk(v,out);return out;}out.push(n);for(const [k,v]of Object.entries(n))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','calls'].includes(k))walk(v,out);return out;};
const source='let total=0;let frames=0;game.onUpdate(function(){total+=game.eventContext().deltaTime;frames+=1});let n=parseInt("7")+parseInt("10",8);';
const nativeSource='let total=0;let frames=0;game.onUpdate(function(){total=__bwBinaryAdd(total,game.eventContext().deltaTime);frames=__bwBinaryAdd(frames,1)});let n=__bwBinaryAdd(parseInt("7"),parseInt("10",8));';
const native=s=>parse(nativeArrayAddHelperSource('__bwBinaryAdd',true,true)+';'+s);

test('parse integer normal results precede ordinary Call fallback and coexist with frame time',()=>{
 const p=parse(source),nodes=walk(p),calls=nodes.filter(n=>n.type==='Call'&&n.callee?.name==='parseInt');
 const graph=analyseSourceValueProducers(p,{ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true,unboundIsOpaque:true});
 for(const call of calls)assert.deepEqual([...graph.typesAt(call)],['Number']);
 const delta=nodes.find(n=>n.type==='Member'&&n.name==='deltaTime');
 assert.equal(createOrdinaryFrameDeltaNumberSource(p).isNumberRead(delta),true);
 assert.deepEqual([...graph.typesAt(delta)],['Number']);
 assert.equal(createOrdinaryFrameDeltaNumberSource(p,()=>false,()=>false,false).isNumberRead(delta),false,'a refused original census cannot recover frame authority after projection');
 p.body.push({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'unknown'},args:[]}});
 for(const call of calls)assert.equal(graph.typesAt(call).has('Number'),false);
 const fresh=createOrdinaryFrameDeltaNumberSource(p);assert.equal(fresh.isNumberRead(delta),false);
});

test('native addition retains original parse integer calls while projecting only proved normal returns',()=>{
 const p=native(nativeSource),before=JSON.stringify(p),result=inspectNativeAdditionExportDomains(p,profile);
 assert.equal(result.reason,null);assert.equal(result.helpers.size,1);assert.equal(result.current(),true);assert.equal(JSON.stringify(p),before);
 const call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='parseInt'),old=call.args[0].value;
 call.args[0].value='8';assert.equal(result.current(),false);call.args[0].value=old;assert.equal(result.current(),false);
});

test('native parse results refuse copied authority hidden effects and nonliteral conversion inputs',()=>{
 for(const tag of ['nativeParseIntegerSourceCall','nativeParseIntegerNormalCall']){
  const p=native(nativeSource),call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='parseInt');call[tag]=Symbol('copy');
  assert.equal(inspectNativeAdditionExportDomains(p,profile).helpers.size,0);
 }
 for(const s of [nativeSource+'unknown();',nativeSource+'function poison(){parseInt=unknown;}',nativeSource.replace('parseInt("7")','parseInt(total)'),nativeSource.replace('parseInt("10",8)','parseInt("10",unknown())')]){
  const result=inspectNativeAdditionExportDomains(native(s),profile);assert.equal(result.helpers.size,0);assert.equal(typeof result.reason,'string');
 }
});
