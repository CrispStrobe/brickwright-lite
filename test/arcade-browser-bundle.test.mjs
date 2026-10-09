// Exercise the real GUI Babel rules on the native extension, without rebuilding
// the unrelated GUI graph. This catches out-of-scope helpers in embedded code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';
const require = createRequire(join(INTEGRATED,'package.json'));

for (const mode of ['development','production']) test(`the GUI ${mode} bundle preserves Arcade engine dependencies`, async () => {
    // A stale installed extension cannot qualify current overlay source.
    for(const relative of ['extensions/crispstrobe/adapter.js',
        ...['index.js','speech.js','speech-pxt.js','speech-fonts.json','image.js','image-pxt.js','rotation-pxt.js'].map(file=>'extensions/crispstrobe/arcade/'+file),
        'util/bw-animation-resource-menu.js','util/bw-values.js']) {
        assert.equal(readFileSync(join(INTEGRATED,'node_modules/scratch-vm/src',relative),'utf8'),
            readFileSync(join(REPO,'overlay/scratch-vm/src',relative),'utf8'),relative+' must be fresh');
    }
    const webpack = require('webpack');
    const gui = require('./webpack.config.js');
    const directory = mkdtempSync(join(tmpdir(),'bw-arcade-bundle-'));
    const compiler=webpack({mode,target:'web',context:INTEGRATED,
        entry:join(INTEGRATED,'node_modules/scratch-vm/src/extensions/crispstrobe/arcade/index.js'),
        output:{path:directory,filename:'arcade.cjs',library:{type:'commonjs2'}},
        module:{rules:gui.module.rules.filter(r=>r.loader==='babel-loader').map(rule=>({...rule,options:{...rule.options,cwd:INTEGRATED}}))},
        resolve:gui.resolve,resolveLoader:{modules:[join(INTEGRATED,'node_modules'),'node_modules']},
        devtool:false,cache:false});
    try {
        const stats=await new Promise((resolve,reject)=>compiler.run((err,stats)=>err?reject(err):resolve(stats)));
        assert.equal(stats.hasErrors(),false,stats.toString({all:false,errors:true}));
        const Arcade=require(join(directory,'arcade.cjs'));
        const rt=new EventEmitter();rt.startHats=()=>[];
        const extension=new Arcade(rt);
        const blocks=extension.getInfo().blocks;
        assert.ok(blocks.some(b=>b.opcode==='spriteImage'));
        assert.ok(blocks.some(b=>b.opcode==='frameImage'));
        assert.equal(extension.spritePixel({ID:'missing',X:0,Y:0}),0);
        assert.equal(extension.backgroundColor(),0);
        extension.setBackgroundColor({COLOR:7});
        const sceneRaster=extension._inst._composeSceneFrame();
        assert.equal(sceneRaster.pixels.length,160*120);
        assert.equal(sceneRaster.pixels[0],7);
        assert.deepEqual(Array.from(sceneRaster.coverage),['background','tilemap','sprites','modernSpeech']);
        assert.ok(blocks.some(b=>b.opcode==='copyImageFrom'));
        const copiedImage=extension.createImage({WIDTH:3,HEIGHT:1});
        const copiedSource=extension.createImage({WIDTH:3,HEIGHT:1});
        extension.setImagePixel({IMAGE:copiedImage,X:1,Y:0,COLOR:7});
        extension.setImagePixel({IMAGE:copiedSource,X:0,Y:0,COLOR:2});
        extension.copyImageFrom({IMAGE:copiedImage,SOURCE:copiedSource});
        assert.equal(extension.imagePixel({IMAGE:copiedImage,X:0,Y:0}),2);
        assert.equal(extension.imagePixel({IMAGE:copiedImage,X:1,Y:0}),0);
        assert.ok(blocks.some(b=>b.opcode==='scrollImage'));
        const scrollImage=extension.createImage({WIDTH:3,HEIGHT:1});
        extension.setImagePixel({IMAGE:scrollImage,X:0,Y:0,COLOR:5});
        extension.scrollImage({IMAGE:scrollImage,X:1,Y:0});
        assert.equal(extension.imagePixel({IMAGE:scrollImage,X:1,Y:0}),5);
        assert.equal(extension.imagePixel({IMAGE:scrollImage,X:0,Y:0}),0);
        assert.ok(blocks.some(b=>b.opcode==='signNumber'));
        assert.equal(extension.signNumber({NUM:-3.75}),-1);
        assert.ok(Object.is(extension.signNumber({NUM:-0}),0));
        assert.equal(extension.signNumber({NUM:NaN}),-1);
        assert.equal(extension.signNumber({NUM:Infinity}),1);
        assert.ok(blocks.some(b=>b.opcode==='truncateNumber'));
        assert.equal(extension.truncateNumber({NUM:-3.75}),-3);
        assert.ok(Object.is(extension.truncateNumber({NUM:-0.5}),-0));
        assert.ok(Number.isNaN(extension.truncateNumber({NUM:NaN})));
        assert.equal(extension.truncateNumber({NUM:Infinity}),Infinity);
        assert.ok(blocks.some(b=>b.opcode==='cameraShake'));
        extension.cameraShake({AMPLITUDE:8,DURATION:100});
        assert.equal(extension._camera().shakeAmplitude,8);
        extension._advance(.11);
        assert.equal(extension._camera().shakeStartTime,undefined);
        assert.equal(extension._camera().drawOffsetX,0);
        const svg='<svg width="8" height="4" viewBox="0 0 8 4" shape-rendering="crispEdges" data-bw-pixel-scale="4" data-bw-palette="'+
            ['#123456','#123456',...Array(13).fill('#000000')].join(',')+'">'+
            '<rect x="0" y="0" width="4" height="4" fill="#123456" data-bw-color-index="1"/>'+
            '<rect x="4" y="0" width="4" height="4" fill="#123456" data-bw-color-index="2"/></svg>';
        rt.getSpriteTargetByName=()=>({getCostumes:()=>[{asset:{data:svg},dataFormat:'svg',rotationCenterX:4,rotationCenterY:2}]});
        const errors=[];rt.on('BLOCKS_ERROR',message=>errors.push(message));
        const frame=extension.frameImage({KEY:'palette',TEMPLATE:'art',START:0,COUNT:1,INDEX:0});
        assert.deepEqual(errors,[]);
        const image=extension._inst._image(frame);
        assert.equal(image.width,2);assert.equal(image.height,1);
        assert.deepEqual(Array.from(image.pixels),[1,2]);
        assert.equal(image.palette[1],'#123456');assert.equal(image.palette[2],'#123456');
        extension.drawImage({IMAGE:frame,OP:'fillRect',X:1,Y:0,W:1,H:1,COLOR:3});
        assert.equal(extension.imagePixel({IMAGE:frame,X:1,Y:0}),3,'generated PXT operation retains its dependencies');
        const hero=extension.createImageSprite({IMAGE:frame,KIND:'Player'});
        extension.setSpriteProperty({ID:hero,PROPERTY:'rotationDegrees',VALUE:90});
        assert.equal(extension.spriteProperty({ID:hero,PROPERTY:'width'}),1);
        assert.equal(extension.spriteProperty({ID:hero,PROPERTY:'height'}),2);
        extension.controlSpriteByController({CONTROLLER:'4',ID:hero,VX:80,VY:0});
        rt.bwArcadeDeviceState.controllerButtons={4:{right:true}};
        const controlled=rt.bwArcadeDeviceState.sprites[hero];
        extension._inst._moveControlledSprites([controlled]);assert.equal(controlled.vx,80);
        extension.stopControllingSprite({CONTROLLER:'4',ID:hero});
        rt.bwArcadeDeviceState.controllerButtons[4]={};
        extension._inst._moveControlledSprites([controlled]);assert.equal(controlled.vx,80,'bundled stop retains velocity');
        assert.ok(blocks.some(block=>block.opcode==='followSprite'));
        assert.ok(blocks.some(block=>block.opcode==='unfollowSprite'));
        const goal=extension.createImageSprite({IMAGE:frame,TEMPLATE:'',KIND:'Enemy'});
        extension.setSpritePosition({ID:hero,X:40,Y:30});extension.setSpritePosition({ID:goal,X:120,Y:30});
        extension.setSpriteProperty({ID:hero,PROPERTY:'vx',VALUE:0});
        extension.setSpriteProperty({ID:hero,PROPERTY:'vy',VALUE:0});
        extension.followSprite({ID:hero,TARGET:goal,SPEED:25,TURN:400});
        extension._inst._globalElapsedMs+=10;extension._moveFollowingSprites();
        assert.equal(extension.spriteProperty({ID:hero,PROPERTY:'vx'}),2);
        extension.unfollowSprite({ID:hero});assert.equal(extension.spriteProperty({ID:hero,PROPERTY:'vx'}),0);
        extension.spriteSay({ID:hero,TEXT:'A',DURATION:100,ANIMATED:false,FOREGROUND:2,BACKGROUND:9,MODE:'text'});
        assert.equal(extension._inst._speech.get(hero).text,'A','generated PXT speech renders through the bundled bridge');
        rt.bwArcadeAnimationResources=new Map([['first',{name:'Run',source:{targetName:'art'}}],['second',{name:'Run',source:{targetName:'art'}}]]);
        const menu=extension.getAnimationAssets();assert.equal(menu.length,2);
        assert.equal(new Set(menu.map(item=>item.text)).size,2,'compiled resource labels retain unique ownership');
        assert.deepEqual(menu.map(item=>item.value),['first','second']);
        assert.deepEqual(errors,[]);
        rt.getSpriteTargetByName=()=>({getCostumes:()=>[{dataFormat:'svg',asset:{data:svg.replace('data-bw-color-index="2"','data-bw-color-index="3"')},rotationCenterX:4,rotationCenterY:2}]});
        assert.equal(extension.frameImage({KEY:'malformed',TEMPLATE:'art',START:0,COUNT:1,INDEX:0}),'');
        assert.deepEqual(errors,['Arcade cannot read this frame image artwork.'],'contradictory metadata stays rejected');

    } finally {
        await new Promise((resolve,reject)=>compiler.close(err=>err?reject(err):resolve()));
        rmSync(directory,{recursive:true,force:true});
    }
});
