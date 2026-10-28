// Read-only text observation from rendered mode-3 pixels, using the installed
// board's fixed public-domain font. Does not read VGA memory or alter latches.
import {buildFont} from '../../node_modules/bw-board/src/i8086-cga.js';
export function fixedTextGlyphs() {
    const font=buildFont(9,16), glyphs=[];
    for(let code=32;code<127;code++)glyphs.push([String.fromCharCode(code),Array.from(font.subarray(code*16,code*16+16))]);
    return glyphs;
}
// Self-contained so Playwright can serialize it into the browser.
export function decodeTextPixels(frame,glyphs) {
    if(frame?.mode!==3 || frame.width!==720 || frame.height!==400 || frame.rgba?.length!==720*400*4)throw new Error('expected complete fixed-font 80x25 VGA text frame');
    const lookup=new Map(glyphs.map(([char,rows])=>[rows.join(','),char]));
    const {rgba}=frame, lines=[];
    for(let row=0;row<25;row++) {
        let line='';
        for(let col=0;col<80;col++) {
            const bg=((row*16)*720+col*9+8)*4, bits=[];
            for(let y=0;y<16;y++) {
                let value=0;
                for(let x=0;x<8;x++) {
                    const i=((row*16+y)*720+col*9+x)*4;
                    if(rgba[i]!==rgba[bg]||rgba[i+1]!==rgba[bg+1]||rgba[i+2]!==rgba[bg+2])value|=1<<x;
                }
                bits.push(value);
            }
            line+=lookup.get(bits.join(','))??'?';
        }
        lines.push(line);
    }
    return lines.join('\n');
}
