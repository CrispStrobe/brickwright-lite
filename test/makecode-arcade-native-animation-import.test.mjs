import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {parseAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {encodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
const entry=(id='walk-left',name='Walk')=>encodeAnimationJres({id,name,width:3,height:1,intervalMs:100,
    frames:[{pixels:[2,3,4]},{pixels:[5,6,7]}]});
const gallery=(entries={'myAnimations.walk-left':entry()})=>JSON.stringify({
    '*':{namespace:'myImages',mimeType:'image/x-mkcd-f4',dataEncoding:'base64'},...entries});
const files=(main,entries)=>({'main.ts':main,'images.g.jres':gallery(entries)});
const vars=vm=>Object.fromEntries(vm.runtime.targets.flatMap(target=>Object.values(target.variables))
    .map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));

test('native animation gallery normalization retains explicit IDs, wildcard defaults, Unicode and aliases',()=>{
    const defaulted=entry();delete defaulted.namespace;delete defaulted.id;
    const unicode=entry('走る','走る');unicode.namespace='動き';
    const result=parseAnimationJres(gallery({'myAnimations.walk-left':entry(),walk:defaulted,'動き.走る':unicode}));
    assert.deepEqual(result.unsupported,[]);
    assert.deepEqual(result.animations.map(resource=>resource.id),['myAnimations.walk-left','myImages.walk','動き.走る']);
    assert.deepEqual(result.animations[0].aliases,['myAnimations.walk-left','walk-left','Walk']);
    assert.deepEqual(result.animations[0].frames.map(frame=>[...frame.pixels]),[[2,3,4],[5,6,7]]);
    assert.equal(result.animations[0].intervalMs,100);
    const inherited=entry();delete inherited.mimeType;delete inherited.dataEncoding;
    assert.equal(parseAnimationJres(JSON.stringify({'*':{mimeType:'application/mkcd-animation',
        dataEncoding:'base64',namespace:'myAnimations'},walk:inherited})).animations.length,1);
    const noId=entry();delete noId.id;
    assert.equal(parseAnimationJres(gallery({'myAnimations.walk-left':noId})).animations[0].id,
        'myAnimations.myAnimations.walk-left','raw gallery follows actual Package missing-ID normalization');
});

test('raw gallery defaults and explicit IDs match actual original Package normalization and animation decoder',()=>{
    const dir=path.join(INTEGRATED,'static/makecode/arcade');
    const oracle=vm.createContext({console:{log(){},warn(){},error(){},debug(){}},
        setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,atob,btoa});
    oracle.global=oracle;oracle.self=oracle;
    vm.runInContext(fs.readFileSync(path.join(dir,'pxtworker.js'),'utf8'),oracle,{timeout:10000});
    const inherited=entry('walk-left','Walk');delete inherited.id;delete inherited.namespace;
    const explicit=entry('走る','走る');explicit.namespace='動き';
    const unnamespaced=entry('plain','Plain');unnamespaced.namespace='';
    const raw=gallery({'myAnimations.walk-left':entry(),'walk-left':inherited,'動き.走る':explicit,plain:unnamespaced});
    oracle.galleryText=raw;
    const original=JSON.parse(vm.runInContext(`JSON.stringify(Object.values(pxt.Package.prototype.parseJRes.call({
        getFiles:()=>['images.g.jres'],readFile:()=>galleryText})).map(entry=>{
            const [animation]=new pxt.TilemapProject().generateAnimation(entry);
            return {id:animation.id,name:animation.meta.displayName,intervalMs:animation.interval,
                frames:animation.frames.map(frame=>{
                    const bitmap=pxt.sprite.Bitmap.fromData(frame);
                    return Array.from({length:frame.width*frame.height},(_,i)=>bitmap.get(i%frame.width,Math.floor(i/frame.width)));
                })};
        }))`,oracle,{timeout:1000}));
    const ours=parseAnimationJres(raw);assert.deepEqual(ours.unsupported,[]);
    assert.deepEqual(ours.animations.map(animation=>({id:animation.id,name:animation.name,intervalMs:animation.intervalMs,
        frames:animation.frames.map(frame=>[...frame.pixels])})),original);
});

test('missing native gallery namespace preserves unqualified IDs instead of inventing one',()=>{
    const raw=entry('walk-left','Walk');delete raw.namespace;delete raw.id;
    const parsed=parseAnimationJres(JSON.stringify({'walk-left':raw}));
    assert.deepEqual(parsed.unsupported,[]);
    assert.equal(parsed.animations[0].id,'walk-left');
    assert.deepEqual(arcadeToPseudocode({'main.ts':'let frames=assets.animation`Walk`',
        'images.g.jres':JSON.stringify({'walk-left':raw})}).unsupported,[]);
});

test('native animation references execute as typed Image arrays with aliasing and fresh factory results',async()=>{
    const main=`let first=assets.animation\`Walk\`
let alias=first
let second=assets.animation\`walk-left\`
let qualified=assets.animation\`myAnimations.walk-left\`
let original=first[0].getPixel(0,0)
first[0].setPixel(0,0,9)
let changed=alias[0].getPixel(0,0)
let independent=second[0].getPixel(0,0)
let last=qualified[1].getPixel(2,0)
let count=first.length
let same=first===alias
let distinct=first!==second
let hero=sprites.create(img\`1\`,SpriteKind.Player)
animation.runImageAnimation(hero,first,100,false)
animation.stopAnimation(animation.AnimationTypes.All,hero)`;
    const imported=arcadeToPseudocode(files(main));
    assert.deepEqual(imported.unsupported,[]);
    const execute=async code=>{
        const run=await runProgram(code,{storage:true,uploads:imported.costumes,frames:3});
        try {
            assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
            const values=vars(run.vm);
            for(const [name,expected] of Object.entries({original:2,changed:9,independent:2,last:7,count:2,same:true,distinct:true})){
                assert.equal(values[name],expected,name);
            }
            return run.creator.decompile();
        }finally{run.vm.quit();}
    };
    await execute(await execute(imported.code));
});

test('Unicode and custom namespace aliases import directly in animation call arguments',async()=>{
    const unicode=entry('走る','走る');unicode.namespace='動き';
    const imported=arcadeToPseudocode(files(`let frames=assets.animation\`動き.走る\`
let colour=frames[1].getPixel(1,0)
let hero=sprites.create(img\`1\`,SpriteKind.Player)
animation.runImageAnimation(hero,assets.animation\`走る\`,100,true)`,{'動き.走る':unicode}));
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{storage:true,uploads:imported.costumes,frames:2});
    try{assert.deepEqual(run.errors,[]);assert.equal(vars(run.vm).colour,6);}finally{run.vm.quit();}
});

test('malformed native assets, missing galleries and ambiguous aliases remain named import diagnostics',()=>{
    const missing=arcadeToPseudocode('let frames=assets.animation`Walk`');
    assert.ok(missing.unsupported.some(message=>message.includes('Missing animation asset reference: "Walk"')));
    const malformed=entry();malformed.data='!!!!';
    const bad=arcadeToPseudocode(files('let n=1',{'myAnimations.bad':malformed}));
    assert.ok(bad.unsupported.some(message=>message.includes('ENCODING')),'unused malformed resources still diagnosed');
    const duplicate=arcadeToPseudocode(files('let frames=assets.animation`Walk`',{
        'myAnimations.walk-left':entry(),'myAnimations.other':entry('other','Walk')}));
    assert.ok(duplicate.unsupported.some(message=>message.includes('Ambiguous animation asset alias: "Walk"')));
    assert.ok(duplicate.unsupported.some(message=>message.includes('Ambiguous animation asset reference: "Walk"')));
    const acrossFiles=files('let a=assets.animation`Walk`;let b=assets.animation`Other`');
    acrossFiles['second.g.jres']=gallery({second:entry('walk-left','Other')});
    const conflict=arcadeToPseudocode(acrossFiles);
    assert.ok(conflict.unsupported.some(message=>message.includes('Duplicate animation asset ID')));
    for(const alias of ['Walk','Other'])assert.ok(conflict.unsupported.some(message=>message.includes(`Ambiguous animation asset reference: "${alias}"`)));
    const invalidTiming=entry();const bytes=Buffer.from(atob(invalidTiming.data),'hex');bytes[0]=0;
    invalidTiming.data=btoa(bytes.toString('hex'));
    assert.ok(parseAnimationJres(gallery({bad:invalidTiming})).unsupported.some(message=>message.includes('INTERVAL')));
});
