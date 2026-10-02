// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Synthetic caller fixtures only. Write results to a new private local file.
import {writeFileSync} from 'node:fs';
const [output] = process.argv.slice(2);
if (!output || process.argv.length !== 3) throw new Error('Usage: prepare-spike-nuttx-caller-fixtures.mjs NEW_PRIVATE_OUTPUT_FILE');
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {compileFirmwareProgram} from '../overlay/scratch-gui/src/lib/spike-arena/firmware-program.js';
import {encodePython,encodeInstructions,encodeBegin,encodeChunk,encodeCommand,crc32} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
function compileSource(source, topology='default') {
const creator = new SB3Creator(); creator.parse(source);
if(creator.warnings.length)throw new Error('caller emitted warnings');
const targets=creator.project.targets.map(t=>{const blocks=structuredClone(t.blocks);let serial=0;for(const block of Object.values(blocks)){block.fields=Object.fromEntries(Object.entries(block.fields).map(([k,v])=>[k,{value:v[0]}]));block.inputs=Object.fromEntries(Object.entries(block.inputs).map(([k,v])=>{if(typeof v[1]==='string')return[k,{block:v[1]}];const shadow='literal-'+serial++;blocks[shadow]={opcode:'text',shadow:true,fields:{TEXT:{value:v[1][1]}}};return[k,{block:shadow}];}));}return{isOriginal:true,blocks:{_blocks:blocks,getScripts:()=>Object.keys(blocks).filter(id=>blocks[id].topLevel)}}});
return compileFirmwareProgram({runtime:{targets}},{topology});
}
const program=compileSource('DEVICE SPIKE\nWHEN flag clicked:\n  set motor speed B 50\n  start motor B forward\n  wait 0.1 seconds\n  stop motor B\n');
const cases=[{name:'embedded Python print',source:'print("hello from ARM")\nassert sum(range(11)) == 55\n',python:true}, {name:'native reader and Scratch compiler',program,python:false}];
for(let i=0;i<cases.length;i++){const c=cases[i],id=i+12001,data=c.python?encodePython(c.source):encodeInstructions(c.program);c.packets=[encodeBegin(id,c.python?data.length:data.length/16,crc32(data),c.python)];for(let n=0;n<data.length;n+=10)c.packets.push(encodeChunk(id,n,data.subarray(n,n+10)));c.packets.push(encodeCommand(2,id),encodeCommand(3,id));c.status=Array.from(encodeCommand(5,id));c.packets=c.packets.map(p=>Array.from(p));}
// Storage proof uses the native compiler output and a distinct idle replacement
// under the same program ID; loading must restore the saved motor program.
const native = cases.find(c => !c.python), id = native.status[4] | (native.status[5] << 8);
const replacement = encodeInstructions({version: 1, instructions: [[2, 300, 0, 0], [0, 0, 0, 0]]});
const replace = [encodeBegin(id, replacement.length / 16, crc32(replacement))];
for (let n = 0; n < replacement.length; n += 10) replace.push(encodeChunk(id, n, replacement.subarray(n, n + 10)));
replace.push(encodeCommand(2, id));
native.storage = {upload: native.packets.slice(0, -1), save: Array.from(encodeCommand(8, id)),
    replace: replace.map(p => Array.from(p)), load: Array.from(encodeCommand(9, id)),
    start: Array.from(encodeCommand(3, id)), stop: Array.from(encodeCommand(4, id)),
    savedCount: native.program.instructions.length, replacementCount: replacement.length / 16};
// A separate profile property keeps the legacy default/paired caller unchanged.
const sixSource = 'import brickwright as b\nfor port in range(6):\n b.motor(port,200)\nwhile True:\n pass\n';
const sixData = encodePython(sixSource), sixId = 13001;
const sixPackets = [encodeBegin(sixId, sixData.length, crc32(sixData), true)];
for (let n = 0; n < sixData.length; n += 10) sixPackets.push(encodeChunk(sixId, n, sixData.subarray(n, n + 10)));
sixPackets.push(encodeCommand(2, sixId), encodeCommand(3, sixId));
native.sixMotorProfile = {source: sixSource, packets: sixPackets.map(p => Array.from(p)),
    status: Array.from(encodeCommand(5, sixId)), stop: Array.from(encodeCommand(4, sixId))};
// These native programs come from the actual Scratch reader/compiler, never handmade rows.
const compiledSixSources = {
    continuous: 'DEVICE SPIKE\nWHEN flag clicked:\n' + [...'ABCDEF'].map(p => `  set motor speed ${p} 20\n  start motor ${p} forward\n`).join('') + '  forever:\n    wait 0.01 seconds\n',
    timed: 'DEVICE SPIKE\nWHEN flag clicked:\n' + [...'ABCDEF'].map(p => `  set motor speed ${p} 20\n  start motor ${p} forward\n`).join('') + '  wait 0.3 seconds\n',
    position: 'DEVICE SPIKE\nWHEN flag clicked:\n  set motor speed F 30\n  run motor F forward 30 degrees\n'
};
native.compiledSix = Object.fromEntries(Object.entries(compiledSixSources).map(([name,source],index)=>{
    const program=compileSource(source,'six-motors'),id=14001+index;
    const data=encodeInstructions(program,{topology:'six-motors'});
    const packets=[encodeBegin(id,data.length/16,crc32(data))];
    for(let n=0;n<data.length;n+=10)packets.push(encodeChunk(id,n,data.subarray(n,n+10)));
    packets.push(encodeCommand(2,id));
    return [name,{source,program,upload:packets.map(p=>[...p]),start:[...encodeCommand(3,id)],stop:[...encodeCommand(4,id)]}];
}));
writeFileSync(output, JSON.stringify(cases, null, 2), {flag: 'wx', mode: 0o600});
