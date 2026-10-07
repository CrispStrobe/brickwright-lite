import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {mouseCom,sha256,interactionHdd} from '../scripts/lib/i80386-freedos-interaction.mjs';
test('owned DOS mouse fixture bytes exactly assemble from its reviewable source',()=>{
    const dir=mkdtempSync(join(tmpdir(),'owned-ps2-'));
    try {
        execFileSync('as',['--32','test/fixtures/i80386-freedos-interaction/mouse.asm','-o',join(dir,'mouse.o')],{timeout:10000});
        execFileSync('ld',['-m','elf_i386','-Ttext','0x100','-e','_start','--oformat','binary',join(dir,'mouse.o'),'-o',join(dir,'mouse.com')],{timeout:10000});
        assert.deepEqual(mouseCom,readFileSync(join(dir,'mouse.com')));
        assert.equal(sha256(mouseCom),'b2874ac760be9c4922ff72bdd2341f31888c5f7fe355ad97a74d841fc7d62ec4');
    } finally {rmSync(dir,{recursive:true,force:true});}
});
test('interaction media builder refuses unrelated disks without modifying them',()=>{
    const disk=Buffer.alloc(306*4*17*512);const before=sha256(disk);
    assert.throws(()=>interactionHdd(disk),/qualified owned base HDD/);
    assert.equal(sha256(disk),before);
});
