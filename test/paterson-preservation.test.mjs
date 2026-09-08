import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assembleRaw} from '../overlay/scratch-gui/src/lib/bw-board/i8086-asm.js';
import {paterson,load} from '../overlay/scratch-gui/src/lib/bw-286-lab/runtime.js';
import {PATERSON_FAT12_BYTES} from '../overlay/scratch-gui/src/lib/bw-286-lab/paterson-fat12.js';

const root=new URL('../overlay/scratch-gui/static/guests/paterson-fat12/',import.meta.url);
const read=name=>readFileSync(new URL(name,root));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('preserved source, notice, adapted ASM and downloadable recipe match pinned hashes',()=>{
    const source=JSON.parse(read('SOURCE.json'));
    assert.equal(source.license,'MIT');
    assert.equal(sha(read(source.localPath)),source.sha256);
    assert.equal(sha(read('LICENSE')),source.licenseSha256);
    for(const entry of source.generated) assert.equal(sha(read(entry.path)),entry.sha256,entry.path);
    assert.deepEqual([...assembleRaw(read('paterson-fat12.asm').toString(),0x100)],PATERSON_FAT12_BYTES);
    assert.equal(sha(Uint8Array.from(PATERSON_FAT12_BYTES)),source.runtimeBytesSha256);
    const engine=JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-286-lab/engine/SOURCE.json',import.meta.url)));
    assert.equal(source.engineRevision,engine.revision);
    assert.deepEqual(paterson(),JSON.parse(read('paterson-fat12.board.json')));
});

test('downloadable preserved recipe executes in the application runtime with real wired FAT writes',()=>{
    const session=load(read('paterson-fat12.board.json').toString()); session.initialize();
    assert.equal(session.run(4096).reason,'halted');
    const state=session.inspect();
    assert.equal(state.registers.di,0xabc); assert.equal(state.registers.si,3); assert.equal(state.registers.sp,0xf000);
    const even=session.inspectBank('ram0').bytes, odd=session.inspectBank('ram1').bytes;
    assert.equal(even[0x280],1,'CHGCLS');
    assert.equal(even[0xb02],0xc0); assert.equal(odd[0xb02],0xab,'FAT cluster 3 at 1604h/1605h');
    assert.equal(state.fault,null);
});
