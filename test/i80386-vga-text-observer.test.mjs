import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMode} from '../node_modules/bw-board/src/i8086-cga.js';
import {decodeTextPixels,fixedTextGlyphs} from '../scripts/lib/i80386-vga-text.mjs';
test('pixel observer recognizes guest probe messages in a real fixed-font render',()=>{
    const text='PS2 READY PS2 PACKET 09 00 00 PS2 DONE CMOUNTOK TXT MOUSE COM';
    const bytes=new Uint8Array(4000);
    for(let i=0;i<2000;i++){bytes[i*2]=32;bytes[i*2+1]=0x1f;}
    for(let i=0;i<text.length;i++)bytes[i*2]=text.charCodeAt(i);
    const frame=renderMode(3,a=>bytes[a-0xb8000],{cellW:9,cellH:16});
    assert.ok(decodeTextPixels({...frame,mode:3},fixedTextGlyphs()).startsWith(text));
    assert.throws(()=>decodeTextPixels({...frame,mode:13},fixedTextGlyphs()),/complete fixed-font/);
    assert.throws(()=>decodeTextPixels({...frame,mode:3,rgba:frame.rgba.subarray(4)},fixedTextGlyphs()),/complete fixed-font/);
});
