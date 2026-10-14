import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
const require=createRequire(import.meta.url),values=require(VM_SRC+'/util/bw-values.js');
const {create}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-font-values.js');
const expected=JSON.parse(readFileSync(new URL('./fixtures/arcade/live-font-pixels.json',import.meta.url),'utf8'));
const Arcade=loadExtensionClass('arcade');
test('unattached live Font service and actual native image adapters match all selected-original pixels',()=>{
    const runtime=createArcadeRuntimeMock(),native=new Arcade(runtime)._inst;
    const fonts=create(runtime,values,{reference:body=>native._bufferReference(body),resolve:ref=>native._buffer(ref)});
    // Internal integration boundary only: future source attachment must use
    // this same generation's actual text module for fixed and live clients.
    native._textModule=fonts.textModule();
    const small=fonts.constant('font5'),normal=fonts.constant('font8'),large=fonts.forText('一'),double=fonts.scale(normal,2.9);
    const make=()=>native.createImage({WIDTH:32,HEIGHT:24});
    const adapter=ref=>{
        const image=native._image(ref),module=fonts.textModule();
        const target={_width:image.width,_height:image.height,data:image.pixels,makeWritable(){},color:c=>Number(c)&255};
        return {width:image.width,height:image.height,
            drawIcon:(icon,x,y,color)=>module.drawIcon(target,{data:icon},x,y,color),
            fillRect:(x,y,w,h,color)=>native.drawImage({IMAGE:ref,OP:'fillRect',X:x,Y:y,W:w,H:h,COLOR:color})};
    };
    try{
        const picture=make();
        // This is the actual index method, including its color adapter.
        native.printImageText({IMAGE:picture,TEXT:'A',X:0,Y:0,COLOR:17,FONT:'small'});
        fonts.print(adapter(picture),'A',8,0,3,double);fonts.printCenter(adapter(picture),'一',12,5,large);
        const data=fonts.resolve(normal).data,offset=(65-32)*8+2,before=data.getNumber('UInt8LE',offset);
        data.setNumber('UInt8LE',offset,before^255);
        const mutated=make();fonts.print(adapter(mutated),'A',0,0,7,normal);fonts.print(adapter(mutated),'A',8,0,9,double);
        data.setNumber('UInt8LE',offset,before);
        const missing=make();fonts.print(adapter(missing),'😀',0,0,11,large);
        for(const [name,ref]of [['fontPicture',picture],['fontMutatedPicture',mutated],['fontMissingPicture',missing]]){
            const body=native._image(ref);
            assert.deepEqual({width:body.width,height:body.height,pixels:Array.from(body.pixels)},expected[name],name);
        }
        assert.equal(fonts.read(small,'charWidth'),6);
    }finally{fonts.dispose();runtime.emit('RUNTIME_DISPOSED');}
});
