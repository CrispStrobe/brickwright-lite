import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// The unchanged source from the maintained value-arithmetic roundtrip. This
// focused test reaches the real importer, Creator and exporter; the existing
// test still owns VM, Code, SB3 and selected-original execution assertions.
const SOURCE=`let force:any=undefined
let text:any="5"
text+=2
let counter:any="5"
counter++
let rows:any[]=["5",undefined]
rows[0]+=2
rows[1]-=2
function compute(value:any){pause(20);return value+2}
let returned=compute(undefined)
let minusZero=-0
function echo(value:any){return value}
let copiedZero=echo(minusZero)
let values=[text,counter,rows[0],rows[1],returned,minusZero,copiedZero]`;

test('exact value-arithmetic source exports its initialized indexed addition',()=>{
    const maintained=readFileSync(new URL('./makecode-arcade-value-arithmetic.test.mjs',import.meta.url),'utf8');
    const match=maintained.match(/test\('compound stores, numeric increments and paused calls retain actual value types',async (?:t|\(\))=>\{\s*await roundtrip\(`([\s\S]*?)`,async run=>\{/);
    assert.ok(match,'maintained fixture remains located by its exact test name');
    assert.equal(SOURCE,match[1],'source-only fixture must match the maintained VM/PXT roundtrip');
    const imported=arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported,[]);
    const creator=new SB3Creator();creator.parse(imported.code);
    assert.deepEqual(creator.warnings,[]);
    const output=projectToArcade(creator.project,{costumeSvg:()=>null});
    assert.deepEqual(output.unsupported,[]);
    assert.match(output.ts,/rows\[0\] = __bwBinaryAdd\(rows\[0\], \(0 \+ 2\)\)/);
    assert.match(output.ts,/function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
});
