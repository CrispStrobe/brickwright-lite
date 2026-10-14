import test from 'node:test';
import assert from 'node:assert/strict';
import {accessSync,constants,mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {mouseCom,sha256,interactionHdd} from '../scripts/lib/i80386-freedos-interaction.mjs';
// This gate depends on host GNU binutils. Resolve each executable once, assert
// both tool identities before using them, then compare the emitted bytes with
// the fixed program. Missing or incompatible tools fail the test by name.
function binutilsTool(name,identity){
    for(const dir of (process.env.PATH??'').split(delimiter)){
        if(!dir)continue;
        let path;
        try{path=realpathSync(join(dir,name));accessSync(path,constants.X_OK);}
        catch{continue;}
        const version=execFileSync(path,['--version'],{encoding:'utf8',timeout:10000}).split('\n')[0];
        assert.match(version,identity,`${name} must be GNU binutils: ${path}`);
        return {path,version};
    }
    assert.fail(`GNU binutils ${name} is required to assemble the owned DOS mouse fixture`);
}
test('owned DOS mouse fixture bytes exactly assemble from its reviewable source',(t)=>{
    const assembler=binutilsTool('as',/^GNU assembler \(GNU Binutils(?: for [^)]+)?\) \d+\.\d+/);
    const linker=binutilsTool('ld',/^GNU ld \(GNU Binutils(?: for [^)]+)?\) \d+\.\d+/);
    assert.equal(assembler.version.match(/\d+\.\d+/)?.[0],linker.version.match(/\d+\.\d+/)?.[0],
        'assembler and linker must be from the same GNU binutils release');
    t.diagnostic(`${assembler.version}; ${linker.version}`);
    const dir=mkdtempSync(join(tmpdir(),'owned-ps2-'));
    try {
        execFileSync(assembler.path,['--32','test/fixtures/i80386-freedos-interaction/mouse.asm','-o',join(dir,'mouse.o')],{timeout:10000});
        execFileSync(linker.path,['-m','elf_i386','-Ttext','0x100','-e','_start','--oformat','binary',join(dir,'mouse.o'),'-o',join(dir,'mouse.com')],{timeout:10000});
        assert.deepEqual(mouseCom,readFileSync(join(dir,'mouse.com')));
        assert.equal(sha256(mouseCom),'b2874ac760be9c4922ff72bdd2341f31888c5f7fe355ad97a74d841fc7d62ec4');
    } finally {rmSync(dir,{recursive:true,force:true});}
});
test('interaction media builder refuses unrelated disks without modifying them',()=>{
    const disk=Buffer.alloc(306*4*17*512);const before=sha256(disk);
    assert.throws(()=>interactionHdd(disk),/qualified owned base HDD/);
    assert.equal(sha256(disk),before);
});
