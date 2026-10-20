import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const CALLABLE_CODEC_PIN='4db2813d366af8a110fc79599afb55d1cd42d8df';
export const CALLABLE_CODEC_SHA256='60b19f17ecf96d9084cd0c53622474601c444f60116c1c4f13ea96664e04156e';
const checkout=fileURLToPath(new URL('../../',import.meta.url));

// Bind the actual qualified supplier bytes, never an arbitrary installed copy.
export function qualifiedCallableCodecSource({root=checkout,explicitSource=process.env.BW_CALLABLE_ARRAYS_SOURCE,read=readFileSync}={}) {
    let source;
    if(explicitSource)source=read(explicitSource,'utf8');
    else {
        const pins=JSON.parse(read(path.join(root,'vendor-pins.json'),'utf8'));
        if(pins['arrays-values']!==CALLABLE_CODEC_PIN)throw new Error('Callable codec requires its selected qualified supplier pin');
        const wrapper=read(path.join(root,'overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js'),'utf8');
        const match=/^const makeExt = require\(['"]\.\.\/adapter['"]\);\s*module\.exports = makeExt\(([\s\S]*)\);\s*$/.exec(wrapper);
        if(!match)throw new Error('Callable codec requires the literal canonical Arrays wrapper');
        source=JSON.parse(match[1]);
        if(typeof source!=='string')throw new Error('Callable codec wrapper source must be literal text');
    }
    if(createHash('sha256').update(source).digest('hex')!==CALLABLE_CODEC_SHA256)
        throw new Error('Callable codec source differs from the qualified supplier bytes');
    return source;
}
