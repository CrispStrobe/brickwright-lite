import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {encodeAnimationJres, decodeAnimationJres, AnimationJresError,
    ANIMATION_JRES_MIME, ANIMATION_JRES_LIMITS} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';

// Actual retained Microsoft PXT worker; this test does not reimplement its oracle.
const dir = path.join(INTEGRATED, 'static/makecode/arcade');
const oracle = vm.createContext({console: {log(){},warn(){},error(){},debug(){}},
    setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, TextDecoder, atob, btoa,
    pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))});
oracle.global = oracle; oracle.self = oracle;
vm.runInContext(fs.readFileSync(path.join(dir, 'pxtworker.js'), 'utf8'), oracle, {timeout: 10000});
const originalEncode = animation => {
    oracle.input = animation;
    return vm.runInContext(`pxt.sprite.encodeAnimationString(input.frames.map(frame => {
        const bitmap = new pxt.sprite.Bitmap(input.width, input.height);
        frame.pixels.forEach((pixel,i) => bitmap.set(i%input.width, Math.floor(i/input.width),pixel));
        return bitmap.data();
    }), input.intervalMs)`, oracle, {timeout: 5000});
};
const originalDecode = entry => {
    oracle.entry = entry;
    return JSON.parse(vm.runInContext(`JSON.stringify((() => {
        const [asset] = new pxt.TilemapProject().generateAnimation(entry);
        return {id:asset.id,name:asset.meta.displayName,width:asset.frames[0].width,
            height:asset.frames[0].height,intervalMs:asset.interval,
            frames:asset.frames.map(frame => {
                const bitmap=pxt.sprite.Bitmap.fromData(frame);
                return {pixels:Array.from({length:frame.width*frame.height},(_,i)=>bitmap.get(i%frame.width,Math.floor(i/frame.width)))};
            })};
    })())`, oracle, {timeout: 5000}));
};
const sample = (width=3,height=3,count=3,intervalMs=100) => ({
    id:'myAnimations.walk',name:'Walk',width,height,intervalMs,
    frames:Array.from({length:count},(_,f)=>({pixels:Array.from({length:width*height},(_,i)=>(i*3+f*5)%16)}))
});
const plain = value => ({...value,frames:value.frames.map(frame=>({pixels:[...frame.pixels]}))});
const rejects = (fn, code) => assert.throws(fn,error=>error instanceof AnimationJresError && error.code===code);
const altered = (entry, mutate) => {
    const bytes=Buffer.from(atob(entry.data),'hex');mutate(bytes);
    return {...entry,data:btoa(bytes.toString('hex'))};
};

test('codec matches actual PXT encoder and decoder for asymmetric odd/even frame layouts',()=>{
    for(const [w,h,n,ms] of [[1,1,1,1],[3,3,3,100],[2,5,4,65535],[7,2,2,257],[160,120,2,100],[160,160,2,100],[3,3,64,100]]){
        const source=sample(w,h,n,ms),entry=encodeAnimationJres(source),golden=originalEncode(source);
        assert.equal(entry.data,golden,`PXT golden bytes ${w}x${h}/${n}`);
        assert.deepEqual(originalDecode(entry),source,`PXT decodes our bytes ${w}x${h}/${n}`);
        assert.deepEqual(plain(decodeAnimationJres({...entry,data:golden})),source,
            'our decoder consumes actual original encoder output');
    }
});

test('maximum supported resource is exact and independent from caller-owned pixels',()=>{
    const source=sample(160,160,64,65535),entry=encodeAnimationJres(source);
    const decoded=decodeAnimationJres(entry);
    assert.deepEqual(plain(decoded),source);
    source.frames[0].pixels[1]=15;
    assert.equal(decoded.frames[0].pixels[1],3);
    assert.equal(Buffer.from(atob(entry.data),'hex').length,8+12800*64);
});

test('native key/default namespace lookup retains asset identity independently from display name',()=>{
    const entry=encodeAnimationJres(sample());delete entry.id;delete entry.namespace;
    assert.equal(decodeAnimationJres(entry,{key:'walk',namespace:'myAnimations.'}).id,'myAnimations.walk');
    assert.equal(decodeAnimationJres({...entry,displayName:'Renamed'},{key:'myAnimations.walk'}).name,'Renamed');
    rejects(()=>decodeAnimationJres(entry),'IDENTITY');
    assert.equal(decodeAnimationJres(encodeAnimationJres({...sample(),id:'myAnimations.bad.name',name:'Valid'})).id,'myAnimations.bad.name');
    rejects(()=>encodeAnimationJres({...sample(),name:''}),'NAME');
    rejects(()=>encodeAnimationJres({...sample(),name:'a'.repeat(81)}),'NAME');
});

test('hyphen and Unicode identities agree with original package normalization, decoder and factory aliases',()=>{
    for(const [namespace,id,name,key,alias] of [
        ['myAnimations','walk-left','Walk left','myAnimations.walk-left','walk-left'],
        ['myAnimations','走る','走る','myAnimations.走る','走る'],
        ['custom-ns','walk-left','Walk','custom-ns.walk-left','custom-ns.walk-left'],
        ['動き','走る','走る','動き.走る','動き.走る'],
        ['','walk-left','Walk','walk-left','walk-left']
    ]){
        const entry=encodeAnimationJres({...sample(),id,namespace,name});
        oracle.jres={'*':{mimeType:'image/x-mkcd-f4',dataEncoding:'base64',namespace:namespace===''?'':'myImages'},[key]:entry};
        const normalized=JSON.parse(vm.runInContext(`JSON.stringify(pxt.Package.prototype.parseJRes.call({
            getFiles:()=>['images.g.jres'],readFile:()=>JSON.stringify(jres)}))`,oracle,{timeout:1000}));
        const native=Object.values(normalized)[0];
        const qualified=namespace?`${namespace}.${id}`:id;
        assert.equal(decodeAnimationJres(entry).id,qualified);
        assert.equal(decodeAnimationJres(native).id,originalDecode(native).id);
        assert.equal(originalDecode(native).id,qualified);
        const emitted=vm.runInContext('pxt.emitProjectImages(jres)',oracle,{timeout:1000});
        assert.ok(emitted.includes(`case "${alias}":`),emitted);
        assert.deepEqual(plain(decodeAnimationJres(native)).frames,sample().frames);
    }
    // Explicit contract for raw-gallery convenience: the app canonicalizes a
    // fully-qualified fallback key once, unlike original Package.parseJRes.
    const raw=encodeAnimationJres({...sample(),id:'walk-left'});delete raw.id;
    assert.equal(decodeAnimationJres(raw,{key:'myAnimations.walk-left'}).id,'myAnimations.walk-left');
    oracle.jres={'*':{namespace:'myAnimations'},'myAnimations.walk-left':raw};
    const normalized=JSON.parse(vm.runInContext(`JSON.stringify(pxt.Package.prototype.parseJRes.call({
        getFiles:()=>['images.g.jres'],readFile:()=>JSON.stringify(jres)}))`,oracle,{timeout:1000}));
    assert.equal(Object.values(normalized)[0].id,'myAnimations.myAnimations.walk-left');
});

test('identity strings are bounded printable references, not JavaScript identifiers',()=>{
    for(const field of ['id','namespace'])for(const invalid of ['', ' ', '\n','x\u007f', 'x'.repeat(161)]){
        if(field==='namespace' && invalid==='')continue;
        rejects(()=>encodeAnimationJres({...sample(),[field]:invalid}),'IDENTITY');
    }
    rejects(()=>encodeAnimationJres({...sample(),namespace:'x'.repeat(155),id:'too-long'}),'IDENTITY');
});

test('native names agree with actual original PXT validator including Unicode and punctuation',()=>{
    for(const name of ['Walk','walk cycle-2','under_score','Über','走る','🐾',
        'bad`name','bad"name',"bad'name",'bad.name','bad:name','bad/name','bad\\name',
        'bad$name','bad!name','bad[name]','bad@name','bad\nname','bad\u007fname']){
        oracle.nameToValidate=name;
        const accepted=vm.runInContext('pxt.validateAssetName(nameToValidate)',oracle,{timeout:1000});
        if(accepted) {
            const entry=encodeAnimationJres({...sample(),name});
            assert.equal(decodeAnimationJres(entry).name,name);
        } else {
            rejects(()=>encodeAnimationJres({...sample(),name}),'NAME');
            rejects(()=>decodeAnimationJres({...encodeAnimationJres(sample()),displayName:name}),'NAME');
        }
    }
});

test('encoder refuses invalid dimensions/count/timing and pixels without coercion or truncation',()=>{
    for(const width of [0,-1,1.5,161,65536,NaN]) rejects(()=>encodeAnimationJres({...sample(),width}),'DIMENSIONS');
    for(const intervalMs of [0,-1,.5,65536,Infinity]) rejects(()=>encodeAnimationJres({...sample(),intervalMs}),'INTERVAL');
    for(const frames of [[],Array.from({length:65},()=>({pixels:[0]}))]) rejects(()=>encodeAnimationJres({...sample(),frames}),'FRAME_COUNT');
    rejects(()=>encodeAnimationJres({...sample(),frames:[{pixels:[1,2]}]}),'FRAME_PIXELS');
    for(const pixel of [-1,16,.5,NaN,'2']){
        const a=sample();a.frames[1].pixels[4]=pixel;rejects(()=>encodeAnimationJres(a),'PALETTE_INDEX');
    }
    const a=sample();a.frames[1].durationMs=101;rejects(()=>encodeAnimationJres(a),'UNEQUAL_TIMING');
    a.frames[1].durationMs=100;assert.doesNotThrow(()=>encodeAnimationJres(a));
});

test('decoder rejects malformed, truncated, oversized and noncanonical resources before allocating frames',()=>{
    const entry=encodeAnimationJres(sample());
    rejects(()=>decodeAnimationJres({...entry,data:'!'.repeat(ANIMATION_JRES_LIMITS.packedBytes*3)}),'RESOURCE_LIMIT');
    rejects(()=>decodeAnimationJres({...entry,mimeType:'image/x-mkcd-f4'}),'MIME');
    rejects(()=>decodeAnimationJres({...entry,dataEncoding:'json'}),'ENCODING');
    for(const data of ['', '!!!!',entry.data+'\n',btoa('zz'),btoa('abc')]) rejects(()=>decodeAnimationJres({...entry,data}),'ENCODING');
    rejects(()=>decodeAnimationJres({...entry,data:btoa('0000')}),'LENGTH');
    rejects(()=>decodeAnimationJres({...entry,data:btoa('00'.repeat(ANIMATION_JRES_LIMITS.packedBytes+1))}),'RESOURCE_LIMIT');
    rejects(()=>decodeAnimationJres(altered(entry,b=>b[2]=0)),'DIMENSIONS');
    rejects(()=>decodeAnimationJres(altered(entry,b=>b[0]=0)),'INTERVAL');
    rejects(()=>decodeAnimationJres(altered(entry,b=>b[6]=0)),'FRAME_COUNT');
    rejects(()=>decodeAnimationJres(altered(entry,b=>b[6]=65)),'FRAME_COUNT');
    rejects(()=>decodeAnimationJres({...entry,data:btoa(atob(entry.data).slice(0,-2))}),'LENGTH');
    rejects(()=>decodeAnimationJres({...entry,data:btoa(atob(entry.data)+'00')}),'LENGTH');
    rejects(()=>decodeAnimationJres(altered(entry,b=>b[12]|=0xf0)),'PADDING');
    assert.equal(ANIMATION_JRES_MIME,'application/mkcd-animation');
});
