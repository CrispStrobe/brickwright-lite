// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Synthetic caller fixtures only. Write results to a new private local file.
import {writeFileSync} from 'node:fs';
const [output] = process.argv.slice(2);
if (!output || process.argv.length !== 3) throw new Error('Usage: prepare-spike-nuttx-caller-fixtures.mjs NEW_PRIVATE_OUTPUT_FILE');
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {compileFirmwareProgram} from '../overlay/scratch-gui/src/lib/spike-arena/firmware-program.js';
import {encodePython,encodeInstructions,encodeBegin,encodeChunk,encodeCommand,crc32} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
const creator = new SB3Creator(); creator.parse('DEVICE SPIKE\nWHEN flag clicked:\n  set motor speed B 50\n  start motor B forward\n  wait 0.1 seconds\n  stop motor B\n');
if(creator.warnings.length)throw new Error('caller emitted warnings');
const targets=creator.project.targets.map(t=>{const blocks=structuredClone(t.blocks);let serial=0;for(const block of Object.values(blocks)){block.fields=Object.fromEntries(Object.entries(block.fields).map(([k,v])=>[k,{value:v[0]}]));block.inputs=Object.fromEntries(Object.entries(block.inputs).map(([k,v])=>{if(typeof v[1]==='string')return[k,{block:v[1]}];const shadow='literal-'+serial++;blocks[shadow]={opcode:'text',shadow:true,fields:{TEXT:{value:v[1][1]}}};return[k,{block:shadow}];}));}return{isOriginal:true,blocks:{_blocks:blocks,getScripts:()=>Object.keys(blocks).filter(id=>blocks[id].topLevel)}}});
const program=compileFirmwareProgram({runtime:{targets}});
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
writeFileSync(output, JSON.stringify(cases, null, 2), {flag: 'wx', mode: 0o600});
