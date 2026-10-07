#!/usr/bin/env node
// Generate the owned marker HDD; FreeDOS is supplied separately by the caller.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {baseHddSha256,sha256} from './lib/i80386-freedos-interaction.mjs';
const [board,output]=process.argv.slice(2);
assert.ok(board&&output,'usage: node scripts/prepare-i80386-freedos-interaction.mjs BOARD_CHECKOUT OUTPUT_IMG');
const {buildFat16}=await import(pathToFileURL(resolve(board,'scripts/lib/i80386-free-bios-fat16.mjs')));
const {image}=buildFat16({geometry:{cylinders:306,heads:4,sectors:17},volLabel:'FREEBIOSHD',
    files:[{name:'CMOUNTOKTXT',bytes:Buffer.from('FREE-BIOS 386 C: MOUNT OK\r\n')}]});
assert.equal(sha256(image),baseHddSha256,'qualified owned base HDD generator identity');
await writeFile(output,image,{flag:'wx'});
console.log(JSON.stringify({bytes:image.length,sha256:sha256(image)}));
