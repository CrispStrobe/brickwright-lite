import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {parseImageAssets,parseJres} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {parseTileAssets,encodeTileImage} from '../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';
import {createAssetKindLookup,lookupAssetTemplate} from '../overlay/scratch-gui/src/lib/bw-makecode/asset-kind-lookup.js';
import {getTutorialTilemapGenerator} from '../scripts/lib/pxt-node.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const entry=(pixel,name)=>({data:encodeTileImage({width:1,height:1,pixels:Uint8Array.from([pixel])}),mimeType:'image/x-mkcd-f4',dataEncoding:'base64',displayName:name});
const imageGallery={'*':{namespace:'myImages'},spriteImage:entry(3,'hero'),sharedImage:entry(7,'shared')};
const tileGallery={'*':{namespace:'myTiles'},tile1:{...entry(5,'winCloud'),tilemapTile:true},sharedTile:{...entry(9,'shared'),tilemapTile:true}};
const files={'images.g.jres':JSON.stringify(imageGallery),'tilemap.g.jres':JSON.stringify(tileGallery)};

test('image and tile factories resolve names within their kind while all tile member aliases retain pixels',()=>{
    const lookup=createAssetKindLookup(files);
    assert.equal(lookup.lookup('image','winCloud'),null);
    assert.equal(lookup.lookup('tile','hero'),null);
    assert.equal(lookup.lookup('constructor','prototype'),null);
    assert.equal(lookup.lookup('image','hero').pixels[0],3);
    assert.equal(lookup.lookup('tile','winCloud').pixels[0],5);
    assert.equal(lookup.lookup('image','shared').pixels[0],7);
    assert.equal(lookup.lookup('tile','shared').pixels[0],9);
    assert.equal(lookup.lookup('tile','myTiles.tile1'),null,'member qualification is not a factory name');
    assert.equal(lookup.lookup('image','myImages.spriteImage'),null);
    assert.equal(lookupAssetTemplate(lookup,'assets.image',' winCloud '),null);
    assert.equal(lookupAssetTemplate(lookup,'assets.tile',' winCloud '),lookup.tiles['myTiles.tile1']);
    assert.equal(lookupAssetTemplate(lookup,'assets.animation','hero'),undefined,'other resolvers remain distinct');
    const legacyTiles=parseTileAssets(files['tilemap.g.jres']);
    for(const name of ['myTiles.tile1','tile1','winCloud'])assert.deepEqual(lookup.tiles[name],legacyTiles[name]);
    assert.equal(Object.keys(parseImageAssets(files['tilemap.g.jres'])).length,0);
    assert.equal(parseJres(files['tilemap.g.jres']).winCloud.pixels[0],5,'legacy unscoped rasterization remains available');
});

test('factory ordering is first match, independent of ambiguous member aliases and prototype names',()=>{
    const first={hero:entry(2,'hero'),second:entry(4,'hero')};
    const last={third:entry(6,'hero')};
    const lookup=createAssetKindLookup({'one.jres':JSON.stringify(first),'two.jres':JSON.stringify(last)});
    assert.equal(lookup.images.hero,null,'member alias ambiguity is retained');
    assert.equal(lookup.lookup('image','hero').pixels[0],2,'ambiguous aliases cannot discard the first factory entry');
    const reverse=createAssetKindLookup({'one.jres':JSON.stringify(first),'two.jres':JSON.stringify(last)},{fileOrder:['two.jres','one.jres']});
    assert.equal(reverse.lookup('image','hero').pixels[0],6);
    const prototypeGallery=JSON.stringify({image:entry(10,'__proto__')});
    assert.equal(createAssetKindLookup({'images.jres':prototypeGallery}).lookup('image','__proto__').pixels[0],10);
    assert.equal(Object.getPrototypeOf(parseImageAssets(prototypeGallery)),null);
    const short={short:entry(12).data};assert.equal(createAssetKindLookup({'images.jres':JSON.stringify(short)}).lookup('image','short').pixels[0],12);
});

test('kind-scoped product lookup and native pixel images match original generated factories and null results',async()=>{
    const generate=await getTutorialTilemapGenerator('arcade');
    const main=`let missingImage=assets.image\`winCloud\`===null
let imagePixel=assets.image\`hero\`.getPixel(0,0)
let tilePixel=assets.tile\`winCloud\`.getPixel(0,0)
let imageShared=assets.image\`shared\`.getPixel(0,0)
let tileShared=assets.tile\`shared\`.getPixel(0,0)
let missingTile=assets.tile\`hero\`===null
let missingQualified=assets.tile\`myTiles.tile1\`===null
let trimmed=assets.tile\` winCloud \`.getPixel(0,0)
scene.onOverlapTile(SpriteKind.Player,assets.image\`winCloud\`,function(actor:Sprite,location:tiles.Location){})
let registered=game.currentScene().tileOverlapHandlers.length
registered+=0`;
    const original=await runPxtArcade({...files,'tilemap.g.ts':generate(files['tilemap.g.jres']),'main.ts':main,
        'pxt.json':JSON.stringify({name:'asset-kind-control',dependencies:{device:'*'},files:['tilemap.g.ts','images.g.jres','tilemap.g.jres','main.ts']})});
    assert.equal(original.registered,0);assert.equal(original.missingImage,true);assert.equal(original.missingTile,true);assert.equal(original.missingQualified,true);
    const lookup=createAssetKindLookup(files),runtime=new EventEmitter(),errors=[];runtime.startHats=()=>[];runtime.on('BLOCKS_ERROR',e=>errors.push(e));
    const native=new(loadExtensionClass('arcade'))(runtime);
    for(const [name,kind,key]of [['imagePixel','image','hero'],['tilePixel','tile','winCloud'],['imageShared','image','shared'],['tileShared','tile','shared'],['trimmed','tile',' winCloud ']]) {
        const decoded=lookup.lookup(kind,key),ref=native._inst._imageHandle(decoded);
        assert.equal(native.imagePixel({IMAGE:ref,X:0,Y:0}),original[name],name);
    }
    assert.equal(lookup.lookup('image','winCloud')===null,original.missingImage);assert.deepEqual(errors,[]);
    // This proves lookup/pixel behavior. Source importer integration and the
    // native tile-overlap null guard are separate controls owned by their caller.
});


test('lookup preserves first original factory result even when display names collide',async()=>{
    const gallery={hero:entry(2,'hero'),second:entry(4,'hero')};
    const main='let pixel=assets.image`hero`.getPixel(0,0);pixel+=0;';
    const original=await runPxtArcade({'images.g.jres':JSON.stringify(gallery),'main.ts':main,
        'pxt.json':JSON.stringify({name:'asset-order-control',dependencies:{device:'*'},files:['images.g.jres','main.ts']})});
    assert.equal(original.pixel,2);assert.equal(createAssetKindLookup({'images.g.jres':JSON.stringify(gallery)}).lookup('image','hero').pixels[0],original.pixel);
});
