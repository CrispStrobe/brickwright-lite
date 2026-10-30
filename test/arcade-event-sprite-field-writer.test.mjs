import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// A creation-handler write through `(sprite as Easy).field` has an event
// Sprite receiver with no producer type. The class constraint checks the
// writer against the unique ordinary Sprite subclass declaring that field.
const fixture=readFileSync(new URL('./makecode-arcade-sdk-sprite-class.test.mjs',import.meta.url),'utf8')
 .match(/"created-partial-fields": ("(?:[^"\\]|\\.)*")/);
assert.ok(fixture,'the existing complete runtime fixture is present');
const source=JSON.parse(fixture[1]);
const replaceOne=(text,before,after)=>{assert.equal(text.split(before).length,2);return text.replace(before,after);};
const handlerWrite=(text,value)=>replaceOne(text,'trace=trace+"H";','(sprite as Easy).value='+value+';trace=trace+"H";');
const exported=text=>{
 const imported=arcadeToPseudocode(text);assert.deepEqual(imported.unsupported,[]);
 const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.errors||[],[]);
 for(const asset of imported.costumes||[])assert.equal(asset.mode==='add'?creator.addCustomSVGCostume(asset.sprite,asset.svg,asset.name):creator.applyCustomSVG(asset.sprite,asset.svg),true);
 return projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});
};

test('a compatible event Sprite field write exports through the unique declaring subclass',()=>{
 const out=exported(handlerWrite(source,'9'));
 assert.deepEqual(out.unsupported,[]);assert.match(out.ts,/as Easy\)\.value = /);
});

test('an incompatible, ambiguous or readonly event Sprite field write keeps its refusal',()=>{
 const conflict=exported(handlerWrite(source,'"x"'));
 assert.ok(conflict.unsupported.some(reason=>/field Easy\.value writer conflicts with declared number/.test(reason)),JSON.stringify(conflict.unsupported));
 const second='class Other extends sprites.ExtendableSprite {constructor(public value:number,img:Image){super(img,SpriteKind.Enemy)}}\n';
 const ambiguous=exported(handlerWrite(source,'9')+'\n'+second);
 assert.ok(ambiguous.unsupported.includes('Class primitive export: field writer requires an actual declared receiver and fixed property'),JSON.stringify(ambiguous.unsupported));
 const readonly=exported(handlerWrite(replaceOne(source,'public value:number','public readonly value:number'),'9'));
 assert.notDeepEqual(readonly.unsupported,[]);
});
