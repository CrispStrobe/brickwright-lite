import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeAdditionExportDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const profile=GENERATED_HELPER_PROFILES.ordinary,header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const source='let hero=sprites.create(img`1`,SpriteKind.Player);let frames=[img`2 3`,img`4 5`];let alias=frames;let one=frames[0];let other=[img`2 3`,img`4 5`];alias[0].setPixel(0,0,7);hero.setImage(frames[0]);let first=one.getPixel(0,0);let prior=other[0].getPixel(0,0);first=__bwBinaryAdd(first,0);prior=__bwBinaryAdd(prior,0);';
const parse=text=>parseMakeCodeTs(header+';'+text,profile);
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const n of value)walk(n,out);return out;}out.push(value);for(const [key,n]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType'].includes(key))walk(n,out);return out;};
const inspect=p=>inspectNativeAdditionExportDomains(p,profile);
test('native addition uses original mutable Image pixel results across Sprite retention and aliases',()=>{
 const p=parse(source),before=JSON.stringify(p),result=inspect(p);assert.equal(result.reason,null);assert.equal(result.helpers.size,1);assert.equal(result.current(),true);assert.equal(JSON.stringify(p),before);
 const pixel=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='getPixel'),value=pixel.args[0].value;pixel.args[0].value='1';assert.equal(result.current(),false);pixel.args[0].value=value;assert.equal(result.current(),false);
});
test('mutable pixel normal facts cannot be supplied by private tags or incompatible source writers',()=>{
 for(const tag of ['nativeMutablePixelSourceCall','nativeMutablePixelNormalCall']){
  const p=parse(source),pixel=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='getPixel');pixel[tag]=Symbol('copied');const result=inspect(p);assert.equal(result.helpers.size,0);assert.equal(typeof result.reason,'string');
 }
 for(const text of [source+'one.getPixel=foreign;',source.replace('let one=frames[0]','let one=frames[99]'),source+'foreign(one);']){
  const result=inspect(parse(text));assert.equal(result.helpers.size,0);assert.equal(typeof result.reason,'string');
 }
});
