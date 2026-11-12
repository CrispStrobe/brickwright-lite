import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {registeredArraysSource} from '../../scripts/lib/arrays-carrier.mjs';
export const CALLABLE_CODEC_PIN='035ab22a4d946fe5b8e367013caf898cd763e5f4';
export const CALLABLE_CODEC_SHA256='7024089285a820105aea02fa187232991e566adf9bf8baa05cf9f63f54be5349';
const checkout=fileURLToPath(new URL('../../',import.meta.url));

// Bind the actual qualified supplier bytes, never an arbitrary installed copy.
export function qualifiedCallableCodecSource({root=checkout,explicitSource=process.env.BW_CALLABLE_ARRAYS_SOURCE,read=readFileSync}={}) {
    let source;
    if(explicitSource)source=read(explicitSource,'utf8');
    else {
        const pins=JSON.parse(read(path.join(root,'vendor-pins.json'),'utf8'));
        if(pins['arrays-values']!==CALLABLE_CODEC_PIN)throw new Error('Callable codec requires its selected qualified supplier pin');
        const wrapper=read(path.join(root,'overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js'),'utf8');
        source=registeredArraysSource(wrapper);
        if(typeof source!=='string')throw new Error('Callable codec requires the literal canonical registered Arrays wrapper');
    }
    if(createHash('sha256').update(source).digest('hex')!==CALLABLE_CODEC_SHA256)
        throw new Error('Callable codec source differs from the qualified supplier bytes');
    return source;
}
