import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {UPSTREAM_COMMIT, UPSTREAM_REPO} from '../scripts/spike/bundled-upstream.mjs';

test('targeted vendor adoption fetches one immutable source and preserves unrelated bundles and pin records', () => {
  const root = mkdtempSync(join(tmpdir(), 'bw-target-vendor-'));
  try {
    const scripts = join(root, 'scripts/spike'), support = join(root, 'overlay/scratch-vm/src/extension-support');
    mkdirSync(scripts, {recursive:true}); mkdirSync(support, {recursive:true});
    for (const id of ['arrays','circuit']) mkdirSync(join(root, 'overlay/scratch-vm/src/extensions/crispstrobe', id), {recursive:true});
    for (const name of ['vendor-bundles.mjs','bundled-upstream.mjs']) copyFileSync(new URL('../scripts/spike/'+name, import.meta.url), join(scripts,name));
    const candidate = 'a'.repeat(40), source = '// immutable test source\n' + 'x'.repeat(600);
    writeFileSync(join(root,'vendor-pins.json'), JSON.stringify({'arrays-values':candidate}));
    const pinPath = join(support,'bundled-upstream-pins.json');
    const untouched = {path:'extensions/CrispStrobe/circuit.js',sha256:'preserve-this-receipt',bytes:123};
    writeFileSync(pinPath,JSON.stringify({repo:UPSTREAM_REPO,commit:UPSTREAM_COMMIT,files:{circuit:untouched}}));
    const circuit = join(root,'overlay/scratch-vm/src/extensions/crispstrobe/circuit/index.js');
    writeFileSync(circuit,'owned unrelated bytes');
    const preload = join(root,'fetch.mjs'), calls = join(root,'calls.json');
    writeFileSync(preload, `import {writeFileSync} from 'node:fs'; globalThis.fetch=async url=>{writeFileSync(${JSON.stringify(calls)},JSON.stringify(url));return {ok:true,text:async()=>${JSON.stringify(source)}}};`);
    execFileSync(process.execPath,['--import',preload,join(scripts,'vendor-bundles.mjs'),'--only','arrays'],{stdio:'pipe'});
    assert.equal(JSON.parse(readFileSync(calls)),`https://raw.githubusercontent.com/${UPSTREAM_REPO}/${candidate}/extensions/CrispStrobe/arrays.js`);
    assert.equal(readFileSync(circuit,'utf8'),'owned unrelated bytes');
    const pins=JSON.parse(readFileSync(pinPath));
    assert.deepEqual(pins.files.circuit,untouched);
    assert.equal(pins.commit,UPSTREAM_COMMIT);
    assert.equal(pins.files.arrays.commit,candidate);
    assert.equal(pins.files.arrays.repo,UPSTREAM_REPO);
    assert.equal(pins.files.arrays.bytes,Buffer.byteLength(source));
    assert.ok(readFileSync(join(root,'overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js'),'utf8').includes(JSON.stringify(source)));
    assert.throws(()=>execFileSync(process.execPath,[join(scripts,'vendor-bundles.mjs'),'--only','unknown'],{stdio:'pipe'}),/Command failed/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
