import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, stat, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {officialUbuntuArchive, prepareUbuntuArchives} from '../scripts/prepare-playwright-apt.mjs';

test('Ubuntu mirror preparation retains suites, components, architectures and signing authority',()=>{
    const before='# http://azure.archive.ubuntu.com/ubuntu is a comment\nTypes: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates\nComponents: main universe\nArchitectures: amd64\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu\nSuites: noble-security\n';
    const after=officialUbuntuArchive(before);
    assert.equal(after,before.replace('URIs: http://azure.archive.ubuntu.com/ubuntu/','URIs: https://archive.ubuntu.com/ubuntu/'));
    assert.equal(officialUbuntuArchive(after),after);
    const list='deb [arch=amd64 signed-by=/trusted/key.gpg] http://azure.archive.ubuntu.com/ubuntu noble main\r\n';
    assert.equal(officialUbuntuArchive(list),list.replace('http://azure.archive.ubuntu.com/ubuntu','https://archive.ubuntu.com/ubuntu'));
});

test('unrelated repositories, lookalike hosts and signing fields are never rewritten',()=>{
    for(const text of [
        'deb https://azure.archive.ubuntu.com.evil.invalid/ubuntu noble main\n',
        'deb https://azure.archive.ubuntu.com/ubuntu-private noble main\n',
        'deb https://private.invalid/ubuntu noble main\n',
        'Signed-By: https://azure.archive.ubuntu.com/ubuntu\n',
        '# deb http://azure.archive.ubuntu.com/ubuntu noble main\n'
    ])assert.equal(officialUbuntuArchive(text),text);
});

test('actual apt files are updated once, retaining permissions and unrelated content',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'bw-apt-source-'));
    try{
        const file=path.join(dir,'ubuntu.sources'),unrelated=path.join(dir,'vendor.list');
        await writeFile(file,'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble\n',{mode:0o640});
        await writeFile(unrelated,'deb https://private.invalid/archive stable main\n');
        const mode=(await stat(file)).mode;
        assert.deepEqual(await prepareUbuntuArchives([file,unrelated,path.join(dir,'absent')]),[file]);
        assert.equal((await stat(file)).mode,mode);
        assert.equal(await readFile(unrelated,'utf8'),'deb https://private.invalid/archive stable main\n');
        assert.deepEqual(await prepareUbuntuArchives([file,unrelated]),[]);
    }finally{await rm(dir,{recursive:true,force:true});}
});
