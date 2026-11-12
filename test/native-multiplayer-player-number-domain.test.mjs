import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeAdditionExportDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const profile=GENERATED_HELPER_PROFILES.ordinary;
const source='let text="";function describe(player){return __bwBinaryAdd("Player ",mp.getPlayerProperty(player,mp.PlayerProperty.Number))}mp.onControllerEvent(ControllerEvent.Connected,function(actual){let pending=null;pending=undefined;pending=actual;text=describe(pending)});controller.player2.connected=true;';
const parse=s=>parseMakeCodeTs(nativeArrayAddHelperSource('__bwBinaryAdd',true,true)+';'+s,profile);
const walk=(n,out=[])=>{if(!n||typeof n!=='object')return out;if(Array.isArray(n)){for(const v of n)walk(v,out);return out;}out.push(n);for(const [k,v]of Object.entries(n))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','calls'].includes(k))walk(v,out);return out;};
const inspect=p=>inspectNativeAdditionExportDomains(p,profile);

test('native addition consumes actual Player Number normal results through registered aliases and helpers',()=>{
 const p=parse(source),before=JSON.stringify(p),proof=inspect(p);
 assert.equal(proof.reason,null);assert.equal(proof.helpers.size,1);assert.equal(proof.current(),true);assert.equal(JSON.stringify(p),before);
 const call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='getPlayerProperty');call.args[1].name='Index';assert.equal(proof.current(),false);call.args[1].name='Number';assert.equal(proof.current(),false);
});

test('supplied Player Number tags and unrelated receiver writers cannot enroll the normal receipt',()=>{
 for(const tag of ['nativePlayerNumberSourceCall','nativePlayerNumberNormalCall']){
  const p=parse(source),call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='getPlayerProperty');call[tag]=Symbol('copy');assert.equal(inspect(p).helpers.size,0);
 }
 for(const s of [source.replace('pending=actual','pending="foreign"'),source.replace('mp.PlayerProperty.Number','mp.PlayerProperty.Index'),source.replace('pending=actual','pending=actual;pending._index="bad"'),source+'unknown();',source+'describe("foreign");']){
  const proof=inspect(parse(s));assert.equal(proof.helpers.size,0);assert.equal(typeof proof.reason,'string');
 }
});
