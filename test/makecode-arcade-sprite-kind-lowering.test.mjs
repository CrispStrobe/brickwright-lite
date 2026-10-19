import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {TEXT_SPRITE_SOURCE_TEXT} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
const lowered=source=>lowerNamespaceBindings(parseMakeCodeTs(source),{spriteKinds:true});
test('SpriteKind forwards preserve undefined reads, initialization order, unused allocations and numeric globals',()=>{
 const result=lowered('let before=SpriteKind.Later;namespace SpriteKind {export const First=SpriteKind.create();}let between=SpriteKind.create();namespace SpriteKind {export const Later=SpriteKind.create();export const Alias=Later;}let after=SpriteKind.Later;');
 assert.deepEqual(result.unsupported,[]);const body=result.program.body;
 assert.deepEqual(body.slice(0,3).map(st=>st.type),['SpriteKindReset','SpriteKindReset','SpriteKindReset']);
 const declarations=body.filter(st=>st.type==='Declaration').flatMap(st=>st.decls);
 assert.deepEqual(declarations.map(d=>d.assetPath||d.name),['before','SpriteKind.First','between','SpriteKind.Later','SpriteKind.Alias','after']);
 assert.equal(declarations[0].init.name,declarations[3].name);
 for(const decl of declarations.filter(d=>d.spriteKindName))assert.equal(decl.typeName,'number');
 const code=arcadeToPseudocode('let before=SpriteKind.Later;namespace SpriteKind {export const First=SpriteKind.create();}let between=SpriteKind.create();namespace SpriteKind {export const Later=SpriteKind.create();}let after=SpriteKind.Later;');
 assert.deepEqual(code.unsupported,[]);assert.equal((code.code.match(/arcade create sprite kind/g)||[]).length,3);
 assert.ok(code.code.indexOf('set before')<code.code.indexOf('arcade bind sprite kind name "First"'));
 assert.ok(code.code.indexOf('set between')<code.code.indexOf('arcade bind sprite kind name "Later"'));
 assert.match(code.code,/set __bwNamespace_SpriteKind_Later to \(undefined value\)/);
});
test('ordinary namespace forward reads and SpriteKind object escape remain diagnosed',()=>{
 assert.ok(lowered('let before=Other.Later;namespace Other {export const Later=1;}').unsupported.some(message=>message.includes('before initialization')));
 assert.ok(lowered('namespace SpriteKind {export const Later=SpriteKind.create();}let object=SpriteKind;').unsupported.some(message=>message.includes('runtime object')));
});
test('builtin numeric lookups, dynamic kind values, omitted/null creation and kind method use handle words',()=>{
 for(const source of ['let observed=SpriteKind.Player;','let hero=sprites.create(img`1`);let observed=hero.kind();','let kind=-1.5;let hero=sprites.create(img`1`,kind);hero.setKind(null);let observed=hero.kind();','let hero=sprites.create(img`1`,null);let observed=hero.kind();']){
  const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[],source);assert.doesNotMatch(result.code,/kind "Player"/);
 }
 assert.match(arcadeToPseudocode('let observed=SpriteKind.Player;').code,/arcade sprite kind value "Player"/);
 assert.match(arcadeToPseudocode('let hero=sprites.create(img`1`);').code,/kind \(undefined value\)/);
});
test('exact Text source initializer retains dependency phase and avoids a second create',()=>{
 const files={'main.ts':'namespace SpriteKind {export const Custom=SpriteKind.create();}let observed=SpriteKind.Text;','pxt.json':JSON.stringify({dependencies:{device:'*','arcade-text':'github:microsoft/arcade-text#v1.3.0'},files:['main.ts']})};
 const prepared=prepareArcadeDependencyInputs(files,{packages:{'arcade-text':{files:{'text.ts':TEXT_SPRITE_SOURCE_TEXT}}},sourceOrder:[{id:'arcade-text',file:'text.ts'}],jres:{}});
 const result=arcadeToPseudocode(prepared.files);assert.deepEqual(result.unsupported,[]);assert.match(result.code,/arcade initialize sprite kind library "textsprite" version "v1.3.0"/);assert.equal((result.code.match(/arcade create sprite kind/g)||[]).length,1);
 assert.ok(result.code.indexOf('arcade initialize sprite kind library')<result.code.indexOf('arcade bind sprite kind name "Custom"'));
});
test('discarded SpriteKind.create executes at its source position and kind objects are refused',()=>{
 const result=arcadeToPseudocode('SpriteKind.create();let after=SpriteKind.create();');assert.deepEqual(result.unsupported,[]);assert.equal((result.code.match(/arcade create sprite kind/g)||[]).length,2);assert.ok(result.code.indexOf('__bwNamespace_SpriteKind_discard to')<result.code.indexOf('set after'));
 assert.ok(arcadeToPseudocode('let hero=sprites.create(img`1`,[1,2]);').unsupported.some(message=>message.includes('SpriteKind argument')));
});
test('creation and overlap registrations capture numeric custom kinds at original registration points',()=>{
 const result=arcadeToPseudocode('namespace SpriteKind {export const Custom=SpriteKind.create();}let count=0;sprites.onCreated(SpriteKind.Custom,function(sprite){count+=1;});sprites.onOverlap(SpriteKind.Custom,SpriteKind.Player,function(left,right){count+=1;});let hero=sprites.create(img`1`,SpriteKind.Custom);let observed=sprites.allOfKind(SpriteKind.Custom).length;');
 assert.deepEqual(result.unsupported,[]);assert.match(result.code,/arcade register creation kind \(__bwNamespace_SpriteKind_Custom\)/);assert.match(result.code,/arcade register overlap kind \(__bwNamespace_SpriteKind_Custom\) with kind \(arcade sprite kind value "Player"\)/);assert.match(result.code,/arcade sprite array kind \(__bwNamespace_SpriteKind_Custom\)/);
});
test('exported let kind declarations remain undefined without binding until explicit assignments run',()=>{
 const result=arcadeToPseudocode('namespace SpriteKind {export let Custom:number;}let before=SpriteKind.Custom;SpriteKind.Custom=42.5;let after=SpriteKind.Custom;');assert.deepEqual(result.unsupported,[]);
 assert.equal((result.code.match(/arcade bind sprite kind name "Custom"/g)||[]).length,1);assert.match(result.code,/set __bwNamespace_SpriteKind_Custom to \(undefined value\)/);assert.ok(result.code.indexOf('set before')<result.code.indexOf('arcade bind sprite kind name "Custom"'));assert.ok(result.code.indexOf('set __bwNamespace_SpriteKind_Custom to 42.5')<result.code.indexOf('arcade bind sprite kind name "Custom"'));
});
test('valid creation callbacks need no parameter use or locally created sprite to register',()=>{
 for(const callback of ['function(sprite){counter++;}','function(){counter++;}'])for(const main of ['', 'let hero=sprites.create(img`1`,-1);']){
  const result=arcadeToPseudocode(`let counter=0;sprites.onCreated(-1,${callback});${main}`);assert.deepEqual(result.unsupported,[]);assert.match(result.code,/arcade register creation kind/);assert.match(result.code,/WHEN arcade creation handler/);assert.match(result.code,/set counter to/);
 }
});
