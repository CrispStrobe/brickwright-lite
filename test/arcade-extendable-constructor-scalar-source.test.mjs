import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {sdkSpriteConstructorScalarEffects,EXTENDABLE_SPRITE_SOURCE_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-constructor-scalar-effects.js';

// The authored created-partial-fields fixture, without an invented SDK body.
const fixture=readFileSync(new URL('./makecode-arcade-sdk-sprite-class.test.mjs',import.meta.url),'utf8')
 .match(/"created-partial-fields": ("(?:[^"\\]|\\.)*")/);
assert.ok(fixture,'the existing complete runtime fixture is present');
const source=JSON.parse(fixture[1]);
const replaceOne=(text,before,after)=>{assert.equal(text.split(before).length,2);return text.replace(before,after);};
const postSetKind=replaceOne(replaceOne(replaceOne(source,'public value:number','public value:any'),
 'trace=trace+"H";','(sprite as Easy).value=9;trace=trace+"H";'),
 'read(){','setKind(kind:number){super.setKind(kind);this.value="after"}read(){');
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const child of value)walk(child,out);return out;}out.push(value);for(const [key,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType'].includes(key))walk(child,out);return out;};
const methodCall=p=>walk(p).find(n=>n.type==='Call'&&n.callee?.type==='Member'&&n.callee.name==='read');
const types=text=>{const p=parse(text);return sdkSpriteConstructorScalarEffects(p).typesAt(methodCall(p));};
const clean=value=>{for(const name of ['unsupported','warnings','errors'])if(Array.isArray(value[name]))assert.deepEqual(value[name],[],name);};
const build=text=>{const imported=arcadeToPseudocode(text);clean(imported);const creator=new Creator();creator.parse(imported.code);clean(creator);for(const asset of imported.costumes||[])assert.equal(asset.mode==='add'?creator.addCustomSVGCostume(asset.sprite,asset.svg,asset.name):creator.applyCustomSVG(asset.sprite,asset.svg),true);return creator;};
const emit=creator=>projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});

test('original SDK: ExtendableSprite constructor source identity matches the pinned target',()=>{
 const bytes=readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/target.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'6f35aadf1456436b3318d2f2339cc3d1add6e6c3b0bf8566f86d7f7bb4f7722e');
 const target=JSON.parse(bytes),original=target.bundledpkgs.game['extendableSprite.ts'];
 assert.equal(createHash('sha256').update(original).digest('hex'),EXTENDABLE_SPRITE_SOURCE_SHA256);
});

test('actual ExtendableSprite callback and registry source preserve normal scalar method results through export',()=>{
 assert.deepEqual(types(source),['Number']);
 const creator=build(source),before=JSON.stringify(creator.project),exported=emit(creator);clean(exported);
 assert.equal(JSON.stringify(creator.project),before);assert.match(exported.ts,/extends sprites.ExtendableSprite/);
 assert.match(exported.ts,/sprites.onCreated/);assert.match(exported.ts,/sprites.allOfKind/);
 clean(emit(build(exported.files)));
});

test('the actual callback field writer changes the normal method result domain',()=>{
 assert.deepEqual(types(source.replace('trace=trace+"H";','trace=trace+"H";sprite.value="changed";')),['String']);
 assert.equal(types(source.replace('trace=trace+"H";','trace=trace+"H";sprite.value=img`2`;')),null);
 // Reading a field initialized only after super cannot borrow the parameter's fact.
 assert.equal(types(source.replace('public value:number','value:number').replace('super(img,SpriteKind.Player);','super(img,SpriteKind.Player);this.value=value;').replace('read(){','value:number;read(){')),null);
});

test('creation observers retain partial instance reads and actual snapshot indexing',()=>{
 assert.deepEqual(types(source.replace('seen=(sprite as Easy).value===3;','seen=sprite.read()===3;')),['Number']);
 assert.equal(types(source.replace('refs[0]===sprite','refs[99]===sprite')),null);
 assert.equal(types(source.replace('let refs=sprites.allOfKind(SpriteKind.Player)','let refs=sprites.allOfKind(SpriteKind.Enemy)')),null);
});

test('fixed-kind constructor dispatch executes source overrides rather than ignoring them',()=>{
 const override=source.replace('read(){','setKind(kind:number){this.value="changed";super.setKind(kind)}read(){');
 assert.deepEqual(types(override),['String']);
 assert.equal(types(override.replace('super.setKind(kind)','foreign(this)')),null);
});

test('creation notification follows the complete virtual setKind override suffix',()=>{
 assert.deepEqual(types(postSetKind),['Number'],'the handler writes 9 after the override writes String');
});

test('kind matching preserves identities without guessing SDK numeric constants or distinctness',()=>{
 assert.deepEqual(types(source.replaceAll('SpriteKind.Player','7')),['Number']);
 assert.deepEqual(types('let chosen=SpriteKind.Player;'+source.replaceAll('SpriteKind.Player','chosen')),['Number']);
 assert.equal(types(source.replace('sprites.onCreated(SpriteKind.Player','sprites.onCreated(0')),null);
 assert.equal(types(source.replace('super(img,SpriteKind.Player)','super(img,SpriteKind.Enemy)')),null);
 assert.equal(types(source.replace('sprites.onCreated(SpriteKind.Player','sprites.onCreated(SpriteKind.Player+0')),null);
 const mixed=source.replace('img:Image){super(img,SpriteKind.Player)','img:Image,chosen:number){super(img,chosen)')
  .replace('new Easy(3,img`1`)','new Easy(3,img`1`,SpriteKind.Player)')+'let later=new Easy(4,img`2`,0);';
 assert.equal(types(mixed),null,'a later uncertain allocation invalidates earlier scalar observations too');
});

test('yielding, scene changes, namespace replacement, partial escape and reentrant creation decline',()=>{
 for(const action of ['pause(1);','game.pushScene();','saved=sprite;','saved=sprites.allOfKind(SpriteKind.Player);','let nested=new Easy(4,img`2`);']){
  const text=(action.startsWith('saved=')?'let saved:any=null;':'')+source.replace('trace=trace+"H";',action+'trace=trace+"H";');
  assert.equal(types(text),null,action);
 }
 assert.equal(types(source.replace('trace=trace+"C"','pause(1);trace=trace+"C"')),null);
 assert.equal(types('sprites.onCreated=foreign;'+source),null);
 assert.equal(types(source.replace('super(img,SpriteKind.Player)','super(img,unknown())')),null);
});

test('source changes expire the occurrence receipt permanently without issuing reference facts',()=>{
 const p=parse(source),proof=sdkSpriteConstructorScalarEffects(p),call=methodCall(p);
 assert.deepEqual(proof.typesAt(call),['Number']);
 for(const n of walk(p))if(n.type==='Call'&&n.callee?.name==='allOfKind')assert.equal(proof.typesAt(n),null);
 const literal=walk(p).find(n=>n.type==='Number'&&String(n.value)==='3'),before=literal.value;
 literal.value='4';assert.equal(proof.current(),false);literal.value=before;assert.equal(proof.current(),false);assert.equal(proof.typesAt(call),null);
});

// Default-on external acceptance; bounded source probes select source test
// names and must not execute this browser/SDK/native case on the shared host.
test('original PXT/native: creation notification follows the complete virtual setKind return',async()=>{
 const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
 const {runProgram,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
 const {default:BW}=await import('../overlay/scratch-vm/src/util/bw-values.js');
 const originalValue=globals=>{
  const matches=Object.entries(globals).filter(([name])=>['result','Game_result'].includes(name));
  assert.equal(matches.length,1);assert.equal(matches[0][1],9);return matches[0][1];
 };
 const expected=originalValue(await runPxtArcade(postSetKind,{fakeClock:true}));
 const imported=arcadeToPseudocode(postSetKind);clean(imported);let run;
 try{
  run=await runProgram(imported.code,{frames:8,storage:true,uploads:imported.costumes});
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables))
   .filter(variable=>['result','Game_result'].includes(variable.name));
  assert.equal(variables.length,1);assert.equal(BW.decode(variables[0].value),expected);
  const exported=emit(run.creator);clean(exported);
  assert.equal(originalValue(await runPxtArcade(exported.files,{fakeClock:true})),expected);
 }finally{run?.vm.quit();clearStrayTimers();}
});
