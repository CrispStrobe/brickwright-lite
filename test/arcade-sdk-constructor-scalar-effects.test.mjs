import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {SDK_SPRITE_CLASS_NODES} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-class-descriptors.js';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {sdkSpriteConstructorScalarEffects} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-constructor-scalar-effects.js';
const source="let trace=\"\";function mark(){trace=trace+\"F\";return 4}\nclass Child extends Sprite {field=mark();constructor(public value:number,img:Image){super(img);trace=trace+\"C\"}setImage(img:Image){trace=trace+\"I\"+this.value+this.field;super.setImage(img)}setKind(kind:number){trace=trace+\"K\";super.setKind(kind)}read(){return this.x+this.value+this.field}}\nlet child=new Child(3,img`1`);let result=child.read();let x=child.x;let width=child.width;let field=child.field;let value=child.value;trace=trace+\"\";result+=0;";
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const child of value)walk(child,out);return out;}out.push(value);for(const [key,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType'].includes(key))walk(child,out);return out;};
test('unchanged SDK constructor virtual source issues actual initialized captured primitive occurrences',()=>{const p=parse(source),proof=sdkSpriteConstructorScalarEffects(p),reads=walk(p).filter(n=>n.type==='Identifier'&&n.name==='trace'&&proof.typesAt(n));assert.ok(reads.length>0);for(const n of reads){assert.deepEqual(proof.typesAt(n),['String']);assert.equal(proof.initialized(n),true);}});

const clean=result=>{assert.deepEqual(result.unsupported||[],[]);assert.deepEqual(result.warnings||[],[]);assert.deepEqual(result.errors||[],[]);};
const build=text=>{const imported=arcadeToPseudocode(text);clean(imported);const creator=new Creator();creator.parse(imported.code);clean(creator);for(const asset of imported.costumes||[])assert.equal(asset.mode==='add'?creator.addCustomSVGCostume(asset.sprite,asset.svg,asset.name):creator.applyCustomSVG(asset.sprite,asset.svg),true);return creator;};
const emit=creator=>{const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});clean(exported);return exported;};
test('unchanged constructor virtual fixture retains source, Code and own saved-project exports',async()=>{
 const c=build(source),before=JSON.stringify(c.project),first=emit(c);assert.equal(JSON.stringify(c.project),before);assert.match(first.ts,/class Child extends Sprite/);assert.match(first.ts,/Game_mark/);const imported=build(first.files);emit(imported);
 const code=new Creator();code.parse(c.decompile());clean(code);for(const asset of arcadeToPseudocode(source).costumes)assert.equal(code.applyCustomSVG(asset.sprite,asset.svg),true);emit(code);
 const lines=c.decompile().split('\n'),at=lines.findIndex(line=>line.includes('arcade new object class')&&line.includes('Child'));assert.ok(at>=0);
 const beforeLine=lines[at];lines[at]=lines[at].replace(/\b3\b/,'5');assert.notEqual(lines[at],beforeLine);
 const edited=new Creator();edited.parse(lines.join('\n'));clean(edited);
 for(const asset of arcadeToPseudocode(source).costumes){assert.match(asset.svg,/#ffffff/i);assert.equal(edited.applyCustomSVG(asset.sprite,asset.svg.replace(/#ffffff/gi,'#ff2121')),true);}
 const editedOut=emit(edited);assert.match(editedOut.ts,/new Child\(\(0 \+ 5\)/);assert.match(editedOut.ts,/img`\s*2\s*`/);emit(build(editedOut.files));
 const zip=await JSZip.loadAsync(await(await c.generateSB3()).arrayBuffer()),p=JSON.parse(await zip.file('project.json').async('string'));
 const saved=projectJsonToArcade(JSON.stringify(p),{costumeSvg:(_target,costume)=>c.assets.get(costume.assetId)?.data});clean(saved);
});

const hasTrace=program=>{const proof=sdkSpriteConstructorScalarEffects(program);return walk(program).some(node=>node.type==='Identifier'&&node.name==='trace'&&proof.typesAt(node));};
const refuses=text=>assert.equal(hasTrace(parse(text)),false,text);
test('canonical SDK ownership, actual image arguments and direct super completion remain required',()=>{
 for(const text of [
  'let Sprite=foreign;'+source,
  'Sprite.prototype.setImage=foreign;'+source,
  'let game=0;'+source,
  'let Fx=0;'+source,
  'let screen=0;'+source,
  'function Fx8(n:number){return n}'+source+'Fx8(1);',
  'game.currentScene=foreign;'+source,
  source.replace('super(img)','super(foreign())'),
  source.replace('super.setImage(img)','super.setImage("foreign")'),
  source.replace('super.setImage(img)',''),
  source.replace('super.setKind(kind)','super.setImage(img)'),
  source.replace('super.setKind(kind)','super.setKind(0)'),
  source.replace('new Child(3,img`1`)','new Child(foreign(),img`1`)'),
  source.replace('img`1`','foreign()'),
  source.replace('read(){return this.x','read(){return foreign()+this.x'),
  source+'\nchild.setImage=foreign;',
 ])refuses(text);
});

test('captured declarations, every writer and synchronous callers cannot borrow eventual initialization',()=>{
 for(const text of [
  source.replace('let trace="";','')+'let trace="";',
  source.replace('trace=trace+"F"','trace=trace+foreign()'),
  source+'trace=child;',
  source+'game.onUpdate(function(){trace="later"});',
  source+'pause(1);',
  source+'sprites.allOfKind(SpriteKind.Player);',
  source+'game.currentScene().allSprites;',
  source+'scene.Scene.initializers.push(function(){trace="observer"});',
  'let saved:Sprite;'+source.replace('trace=trace+"I"','saved=this;trace=trace+"I"'),
  source.replace('return 4','mark();return 4'),
  source+'function unused(){foreign()}',
  source.replace('let child=new Child','let invoke=mark;invoke();let child=new Child'),
 ])refuses(text);
});

test('parameter properties and initialized fields precede actual virtual calls while unsupported initializers refuse',()=>{
 const p=parse(source),proof=sdkSpriteConstructorScalarEffects(p);
 for(const name of ['value','field']){const read=walk(p).find(node=>node.type==='Member'&&node.name===name&&node.object?.name==='this'&&proof.typesAt(node));assert.ok(read);assert.deepEqual(proof.typesAt(read),['Number']);}
 refuses(source.replace('field=mark()','field=this.value+mark()'));
 refuses(source.replace('field=mark()','field=this.x+mark()'));
 refuses('let trace="";class Child extends Sprite {field:number;constructor(img:Image){super(img)}setImage(img:Image){trace=trace+"I"+this.field;super.setImage(img)}setKind(kind:number){super.setKind(kind)}}let child=new Child(img`1`);trace=trace+"";');
 const changed=parse(source+'child.value="changed";let later=child.read();'),joined=sdkSpriteConstructorScalarEffects(changed);
 const reads=walk(changed).filter(node=>node.type==='Member'&&node.name==='value'&&joined.typesAt(node));assert.ok(reads.some(node=>joined.typesAt(node).includes('String')));
});

test('owned Image collections permit actual Image transport and refuse unknown mutations or escapes',()=>{
 const text=source.replace('let child=new Child(3,img`1`)','let frames=[img`1`];let copied=[];copied.push(frames[0].clone());let child=new Child(3,copied[0])');
 assert.equal(hasTrace(parse(text)),true);
 for(const suffix of ['copied.push(1);','copied.reverse();','copied.push=foreign;','foreign(copied);','Array.prototype.push=foreign;'])refuses(text+suffix);
 const p=parse(text);p.body.find(st=>st.type==='Class').sdkIntrinsic='Sprite';p.body.find(st=>st.type==='Class').base='Ordinary';assert.equal(hasTrace(p),false);
});

test('used actual-source occurrences expire through restoration without enrolling clones or caller roles',()=>{
 const p=parse(source),proof=sdkSpriteConstructorScalarEffects(p),node=walk(p).find(n=>n.type==='Identifier'&&n.name==='trace'&&proof.typesAt(n));assert.ok(node);
 assert.equal(proof.typesAt(structuredClone(node)),null);assert.equal(proof.initialized({type:'Identifier',name:'trace',initialized:true,role:'String'}),false);
 const forged=parse('let trace="";class Child extends Sprite {field=foreign();constructor(img:Image){super(img);trace=trace+"C"}setImage(img:Image){trace=trace+"I";super.setImage(img)}setKind(kind:number){super.setKind(kind)}}let child=new Child(img`1`);trace=trace+"";');
 forged.body.find(node=>node.type==='Class').fields[0].parameterProperty=true;assert.equal(hasTrace(forged),false);
 const literal=p.body[0].decls[0].init,old=literal.value;literal.value='"edited"';assert.equal(proof.typesAt(node),null);literal.value=old;assert.equal(proof.current(),false);assert.equal(hasTrace(p),true);
 const current=sdkSpriteConstructorScalarEffects(p),cls=p.body.find(st=>st.type==='Class'),before=[...cls.ctor.body];cls.ctor.body.reverse();assert.equal(current.current(),false);cls.ctor.body.splice(0,cls.ctor.body.length,...before);assert.equal(current.current(),false);assert.equal(hasTrace(p),true);
});

test('actual argument order transfers scalar effects before owned frame selection',()=>{
 const text='let index=-1;function pick(){index=0;return 3}'+source.replace('let child=new Child(3,img`1`)','let frames=[img`1`];let child=new Child(pick(),frames[index])');
 const p=parse(text),proof=sdkSpriteConstructorScalarEffects(p);assert.equal(hasTrace(p),true);
 for(const node of walk(p).filter(node=>node.type==='Array'||node.type==='Template'))assert.equal(proof.typesAt(node),null);
 refuses(text.replace('index=0;return 3','index=2;return 3'));
});

test('inert Symbol identity is watched without admitting it as a primitive expression',()=>{
 const p=parse(source);p.consumerMarker=Symbol('inert');assert.equal(hasTrace(p),true);
 const proof=sdkSpriteConstructorScalarEffects(p);p.consumerMarker=Symbol('inert');assert.equal(proof.current(),false);
 for(const type of ['Number','String','Boolean']){const changed=parse(source),literal=walk(changed).find(node=>node.type==='Number');literal.type=type;literal.value=Symbol('not a primitive producer');assert.equal(hasTrace(changed),false);}
});

test('selection and source snapshots decline accessors without executing them',()=>{
 let calls=0;const root={type:'Program'};Object.defineProperty(root,'body',{enumerable:true,get(){calls++;return [];}});assert.equal(sdkSpriteConstructorScalarEffects(root).typesAt({}),null);assert.equal(calls,0);
 const p=parse(source),literal=walk(p).find(node=>node.type==='Number');Object.defineProperty(literal,'value',{enumerable:true,get(){calls++;return '3';}});assert.equal(sdkSpriteConstructorScalarEffects(p).typesAt(literal),null);assert.equal(calls,0);
});

test('all canonical ancestor and internal SDK storage or method collisions retain refusal',()=>{
 for(const name of ['z','id','flags','layer','lifespan','_x','_image','_kind','sx','sy','rotation','recalcSize','resetHitbox','setHitbox','calcDimensionalHash']){
  refuses(source.replace('field=mark();',`field=mark();${name}="foreign";`));
 }
 // A later manual invocation cannot justify an unmodeled earlier SDK call.
 refuses(source.replace('read(){', 'calcDimensionalHash(){trace=trace+"hidden";return 1}read(){')+'child.calcDimensionalHash();');
});

test('old scalar projection cannot bypass reserved SDK storage rejection without audited overrides',()=>{
 for(const name of ['_overlappers','_image','layer','z','id']){
  const text=nativeArrayAddHelperSource('__bwBinaryAdd',true,true)+`;class Child extends Sprite {${name}=0;constructor(img:Image){super(img)}}let child=new Child(img\`1\`);let value=__bwBinaryAdd(child.${name},1);`;
  const proof=inspectNativeArrayBinaryDomains(parseMakeCodeTs(text,GENERATED_HELPER_PROFILES.ordinary),GENERATED_HELPER_PROFILES.ordinary);assert.equal(typeof proof.reason,'string',name);assert.equal(proof.helpers.size,0,name);
 }
});

test('unclosed Scene registry observations cannot bypass the old scalar projection',()=>{
 const text=nativeArrayAddHelperSource('__bwBinaryAdd',true,true)+';class D extends Sprite {value=4;constructor(img:Image){super(img)}}let d=new D(img`1`);game.currentScene().allSprites[0].value="bad";let r=__bwBinaryAdd(d.value,1);';
 const proof=inspectNativeArrayBinaryDomains(parseMakeCodeTs(text,GENERATED_HELPER_PROFILES.ordinary),GENERATED_HELPER_PROFILES.ordinary);assert.equal(typeof proof.reason,'string');assert.equal(proof.helpers.size,0);
});

test('three direct and owned JSON export generations retain the same complete fixture',()=>{
 let input=source;
 for(let generation=1;generation<=3;generation++){
  const creator=build(input),before=JSON.stringify(creator.project),options={costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data};
  const live=projectToArcade(creator.project,options),owned=projectJsonToArcade(before,options);clean(owned);
  assert.equal(JSON.stringify(creator.project),before);
  clean(live);assert.deepEqual(live.files,owned.files,'direct own-data and owned JSON retain identical complete files in generation '+generation);
  input=owned.files;
 }
 build(input);
});

test('observed canonical SDK descriptor changes expire both old and fresh operations in this loaded module',()=>{
 const p=parse(source),proof=sdkSpriteConstructorScalarEffects(p);assert.equal(hasTrace(p),true);
 const method=SDK_SPRITE_CLASS_NODES.find(node=>node.name==='Sprite').methods.find(method=>method.name==='setImage'),name=method.name;
 try{method.name='foreign';assert.equal(proof.current(),false);}finally{method.name=name;}
 assert.equal(proof.current(),false);assert.equal(hasTrace(p),false);
});
