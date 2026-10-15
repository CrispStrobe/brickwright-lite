import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url);
const create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-image-owner');
const values=require('../overlay/scratch-vm/src/util/bw-values');
function fixture(){
    const runtime=new EventEmitter(),extension={_runtime:runtime};
    let images=new Map(),identities=new WeakMap(),selected=true,next=0;
    const resolve=function(value){return images.get(values.referenceId(runtime,value,'image'));};
    const service=create(runtime,values,()=>({extension,images,identities,resolve,current:selected}));
    const image=(width=2,height=2)=>{
        const body={width,height,pixels:new Uint8Array(width*height)},id='image-owner:'+ ++next;
        images.set(id,body);identities.set(body,id);return {ref:values.reference(runtime,'image',id),body,id};
    };
    return {runtime,extension,service,image,resolve,get images(){return images;},get identities(){return identities;},
        replaceMap(){images=new Map();},restart(){images.clear();identities=new WeakMap();},replaceService(){selected=false;}};
}
test('Image owner construction is inert and needs an actual start binding',()=>{
    let reads=0;const service=create(undefined,values,()=>{reads++;throw Error('must not read during construction');});
    assert.equal(reads,0);assert.throws(()=>service.body({}),/inactive native owner/);assert.equal(reads,0);
    const f=fixture(),image=f.image();assert.throws(()=>f.service.assert(image.ref),/inactive native owner/);
    f.service.start();assert.equal(f.service.assert(image.ref),image.ref);assert.equal(f.service.body(image.ref),image.body);
});
test('zero-size bodies and clone bodies preserve exact live identity and pixels',()=>{
    const f=fixture();f.service.start();const empty=f.image(0,0),image=f.image();
    assert.equal(f.service.body(empty.ref),empty.body);assert.equal(empty.body.pixels.length,0);
    image.body.pixels[0]=7;const alias=image.ref;assert.equal(f.service.body(alias).pixels[0],7);
    const clone=f.image();clone.body.pixels.set(image.body.pixels);
    assert.notEqual(f.service.body(clone.ref),image.body);clone.body.pixels[0]=2;assert.equal(f.service.body(alias).pixels[0],7);
});
test('codec transport alone, foreign runtime, wrong kinds and missing bodies cannot establish Image ownership',()=>{
    const f=fixture(),other=fixture();f.service.start();other.service.start();
    const image=f.image(),foreign=other.image();
    for(const value of [foreign.ref,values.reference(f.runtime,'image','bodyless'),values.reference(f.runtime,'object',image.id),
        image.body,{},'image-owner:1',{bwReference:{kind:'image',id:image.id,scope:'invented'}}])assert.throws(()=>f.service.body(value));
    f.identities.delete(image.body);assert.throws(()=>f.service.body(image.ref),/actual current Image body/);
});
test('reference and body getters do not become reflection authority',()=>{
    const f=fixture();f.service.start();let reads=0;
    assert.throws(()=>f.service.body({get bwReference(){reads++;return {};}}));
    assert.throws(()=>f.service.body({bwReference:{kind:'image',id:'x',get scope(){reads++;return 'x';}}}));
    assert.equal(reads,0);
    const image=f.image();Object.defineProperty(image.body,'width',{get(){reads++;return 2;}});
    assert.throws(()=>f.service.body(image.ref),/dimensions/);assert.equal(reads,0);
});
test('malformed actual bodies refuse without coercing dimensions or inventing pixels',()=>{
    for(const change of [body=>{body.width='2';},body=>{body.height=-1;},body=>{body.width=2001;},
        body=>{body.width=1.5;},body=>{body.pixels=new Uint8Array(3);},body=>{body.pixels=[0,0,0,0];}]){
        const f=fixture();f.service.start();const image=f.image();change(image.body);assert.throws(()=>f.service.body(image.ref),/dimensions/);
    }
});
test('Stop preserves Image body lifetime while restart, replacement and dispose revoke old owner facts',()=>{
    const f=fixture();f.service.start();const image=f.image();f.runtime.emit('PROJECT_STOP_ALL');assert.equal(f.service.body(image.ref),image.body);
    f.restart();assert.throws(()=>f.service.body(image.ref),/epoch/);f.service.start();assert.throws(()=>f.service.body(image.ref),/body is missing/);
    const fresh=f.image();assert.equal(f.service.body(fresh.ref),fresh.body);
    f.replaceService();assert.throws(()=>f.service.body(fresh.ref),/current extension/);
    const g=fixture();g.service.start();const retained=g.image();g.service.dispose();assert.throws(()=>g.service.start(),/disposed/);assert.throws(()=>g.service.body(retained.ref),/inactive/);
});
test('actual Arcade-created and cloned Images use the real map, reverse identity and reset lifetime',async()=>{
    const {loadExtensionClass,bundledExtensionIds}=await import('./helpers/bw-extensions.mjs');
    const {createArcadeRuntimeMock}=await import('./helpers/arcade-runtime-mock.mjs');
    const {importGuiDependency}=await import('./helpers/bw-integrated.mjs');
    const actualValues=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
    const Arcade=loadExtensionClass(bundledExtensionIds().get('arcade')),runtime=createArcadeRuntimeMock(),extension=new Arcade(runtime)._inst;
    let selected=true;
    const owner=create(runtime,actualValues,()=>({extension,images:extension._images,identities:extension._imageIds,resolve:extension._image,current:selected}));
    try{
        runtime.emit('PROJECT_START');owner.start();
        const empty=extension.createImage({WIDTH:0,HEIGHT:0}),image=extension.createImage({WIDTH:2,HEIGHT:2});
        assert.equal(owner.body(empty).pixels.length,0);
        extension.setImagePixel({IMAGE:image,X:0,Y:0,COLOR:7});assert.equal(owner.body(image).pixels[0],7);
        const clone=extension.cloneImage({IMAGE:image});assert.notEqual(owner.body(clone),owner.body(image));assert.deepEqual([...owner.body(clone).pixels],[7,0,0,0]);
        runtime.emit('PROJECT_STOP_ALL');assert.equal(owner.body(image).pixels[0],7);
        runtime.emit('PROJECT_START');assert.throws(()=>owner.body(image),/epoch/);owner.start();assert.throws(()=>owner.body(image));
        const current=extension.createImage({WIDTH:1,HEIGHT:1});assert.equal(owner.body(current).width,1);
        // Existing _image lookup still retains a body after dispose. The new
        // typed domain must close independently rather than infer a live owner.
        runtime.emit('RUNTIME_DISPOSED');owner.dispose();assert.throws(()=>owner.body(current),/inactive/);
        selected=false;
    }finally{owner.dispose();runtime.emit('RUNTIME_DISPOSED');}
});
