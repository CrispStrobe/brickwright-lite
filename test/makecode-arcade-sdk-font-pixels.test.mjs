import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
const require=createRequire(import.meta.url),values=require(VM_SRC+'/util/bw-values.js');
const expected=JSON.parse(readFileSync(new URL('./fixtures/arcade/live-font-pixels.json',import.meta.url),'utf8'));
const Arcade=loadExtensionClass('arcade');
test('owned native Font words and actual image adapters match all selected-original pixels',()=>{
    const runtime=createArcadeRuntimeMock(),native=new Arcade(runtime)._inst;
    const fonts=native._sdkFontValues;
    const small=native.fontValue({FONT:'font5'}),normal=native.fontValue({FONT:'font8'}),large=native.fontForText({TEXT:'一'}),double=native.scaleFont({FONT:normal,SIZE:2.9});
    const make=()=>native.createImage({WIDTH:32,HEIGHT:24});
    try{
        const picture=make();
        // This is the actual index method, including its color adapter.
        native.printImageText({IMAGE:picture,TEXT:'A',X:0,Y:0,COLOR:17,FONT:'small'});
        native.printImageFont({IMAGE:picture,TEXT:'A',X:8,Y:0,COLOR:3,FONT:double});native.printImageFontCenter({IMAGE:picture,TEXT:'一',Y:12,COLOR:5,FONT:large});
        const data=fonts.resolve(normal).data,offset=(65-32)*8+2,before=data.getNumber('UInt8LE',offset);
        data.setNumber('UInt8LE',offset,before^255);
        const mutated=make();native.printImageFont({IMAGE:mutated,TEXT:'A',X:0,Y:0,COLOR:7,FONT:normal});native.printImageFont({IMAGE:mutated,TEXT:'A',X:8,Y:0,COLOR:9,FONT:double});
        data.setNumber('UInt8LE',offset,before);
        const missing=make();native.printImageFont({IMAGE:missing,TEXT:'😀',X:0,Y:0,COLOR:11,FONT:large});
        for(const [name,ref]of [['fontPicture',picture],['fontMutatedPicture',mutated],['fontMissingPicture',missing]]){
            const body=native._image(ref);
            assert.deepEqual({width:body.width,height:body.height,pixels:Array.from(body.pixels)},expected[name],name);
        }
        assert.equal(fonts.read(small,'charWidth'),6);
    }finally{runtime.emit('RUNTIME_DISPOSED');}
});
