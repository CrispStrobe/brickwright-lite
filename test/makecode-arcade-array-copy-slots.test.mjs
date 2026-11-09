import test from 'node:test';
import assert from 'node:assert/strict';
import {SB3Creator} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// Per-slot Array facts through push-built literals and whole copies
// (slice() / concat): accepted only when every slot is exactly proven.
const exportOf = async source => {
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator(); creator.parse(imported.code); assert.deepEqual(creator.warnings, []);
    await creator.generateSB3();
    return projectToArcade(creator.project);
};
const REFUSAL = /requires an actual initialized Array producer and compatible all writers/;
const head = 'let special:any[]=[undefined,NaN,[5]]\n';
const use = read => `let n:any[]=${read}\nn[0]=8\n`;

const accepted = {
    'direct slot of a push-built literal': head + use('special[2]'),
    'slice then concat slot (row 2g fixture shape)': head + 'let c=special.slice()\nlet j=c.concat(special)\n' + use('j[2]') + 'let o:any[]=special[2]\nlet q=o[0]\n',
    'copy taken before the source slot is overwritten': head + 'let c=special.slice()\nspecial[2]=1\n' + use('c[2]')
};
const refused = {
    'source slot overwritten before the read': head + 'special[2]=1\n' + use('special[2]'),
    'alias writes the slot before the read': head + 'let a=special\na[2]=1\n' + use('special[2]'),
    'function writes the slot before the read': head + 'function f(){special[2]=1}\nf()\n' + use('special[2]'),
    'conditional push leaves the concat left length unknown': head + 'if(Math.random()>2){special.push(1)}\nlet j=special.concat(special)\n' + use('j[5]'),
    'slot of a non-Array value through concat': head + 'let j=special.slice().concat(special)\n' + use('j[4]'),
    'user push keeps the all-element-writer policy': head + 'special.push(2)\nlet j=special.concat(special)\n' + use('j[6]'),
    'off-by-push slot (NaN) after an earlier push': head + 'special.push(2)\nlet j=special.concat(special)\n' + use('j[5]'),
    'slice with explicit bounds has no slot facts': head + 'let c=special.slice(1)\n' + use('c[1]'),
    'unshift on the copy shifts its slots': head + 'let c=special.slice()\nc.unshift(1)\n' + use('c[2]')
};
for (const [name, source] of Object.entries(accepted)) test('accepts ' + name, {timeout: 120000}, async () => {
    const exported = await exportOf(source);
    assert.deepEqual(exported.unsupported, []); assert.deepEqual(exported.warnings, []);
});
for (const [name, source] of Object.entries(refused)) test('refuses ' + name, {timeout: 120000}, async () => {
    const exported = await exportOf(source);
    assert.ok(exported.unsupported.some(reason => REFUSAL.test(reason)), JSON.stringify(exported.unsupported));
});
