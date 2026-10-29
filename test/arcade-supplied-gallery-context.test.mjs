import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';

test('actual fixed-instance image declarations and supplied resources enable Sprite authoring',()=>{
 const data=Buffer.from([0x87,4,2,0,2,0,0,0,0x31,0,0,0,0x42,0,0,0]).toString('base64');
 const source='scene.setBackgroundImage(gallery.background);let hero=sprites.create(gallery.hero,SpriteKind.Player);hero.setVelocity(50,0);hero.setStayInScreen(true);';
 const declaration=['namespace gallery {','//% fixedInstance jres','export const background = image.ofBuffer(hex``);','//% fixedInstance jres','export const hero = image.ofBuffer(hex``);','}'].join('\n');
 const original={'pxt.json':JSON.stringify({files:['main.ts'],dependencies:{device:'*',art:'github:example/art#v1'}}),'main.ts':source};
 const resource=name=>({id:`gallery.${name}`,namespace:'gallery.',mimeType:'image/x-mkcd-f4',dataEncoding:'base64',data});
 const resolved={packages:{art:{files:{'art.ts':declaration},resourceIds:['gallery.background','gallery.hero']}},
  sourceOrder:[{id:'art',file:'art.ts'}],jres:{'gallery.background':resource('background'),'gallery.hero':resource('hero')},
  runtimeConfig:{palette:['#000000',...ARCADE_PALETTE.slice(1)]},rootResourceIds:[]};
 const prepared=prepareArcadeDependencyInputs(original,resolved),result=arcadeToPseudocode(prepared.files);
 assert.deepEqual(result.unsupported,[]);assert.ok(result.costumes.length);
 assert.match(result.code,/arcade set background image/);assert.match(result.code,/arcade set vx/);
 assert.match(result.code,/arcade set vy/);assert.match(result.code,/arcade keep .* in screen/);
 assert.equal(original['main.ts'],source);
 const missing=structuredClone(resolved);delete missing.jres['gallery.hero'];
 assert.throws(()=>prepareArcadeDependencyInputs(original,missing),/Fixed-instance JRES image/);
});
