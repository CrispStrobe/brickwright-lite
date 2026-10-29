import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

test('actual creation-handler field block exports after the complete virtual kind override suffix',()=>{
 const source='sprites.onCreated(SpriteKind.Player,function(sprite){(sprite as Easy).value=9});class Easy extends sprites.ExtendableSprite {constructor(art:Image,public value:any){super(art,SpriteKind.Player)}setKind(kind:number){super.setKind(kind);this.value="after"}}let easy=new Easy(img`1`,3)';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const creator=new Creator();creator.parse(imported.code);
 assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);
 for(const asset of imported.costumes||[])assert.equal(asset.mode==='add'?creator.addCustomSVGCostume(asset.sprite,asset.svg,asset.name):creator.applyCustomSVG(asset.sprite,asset.svg),true);
 assert.ok(creator.project.targets.some(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_setObjectField')));
 const before=JSON.stringify(creator.project);
 const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});
 assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
 assert.equal(JSON.stringify(creator.project),before);
 assert.match(exported.ts,/sprites\.onCreated/);
 assert.match(exported.ts,/\.value = \(0 \+ 9\)/);
 assert.match(exported.ts,/\.value = "after"/);
});
