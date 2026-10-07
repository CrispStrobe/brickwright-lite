import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deriveCircuitsProbe} from '../scripts/verify-i80386-freedos-circuits-direct.mjs';

test('direct Circuit probe is an exact accepted-browser derivative with a real VDP key route',()=>{
 const {generated,generatedSha256}=deriveCircuitsProbe();
 assert.equal(createHash('sha256').update(generated).digest('hex'),generatedSha256);
 assert.match(generated,/page\.locator\('\[data-vdp-screen\]:visible'\)/);
 assert.match(generated,/vdp\.click\(\)/);
 assert.match(generated,/vdp\.evaluate\(el=>document\.activeElement===el\)/);
 assert.match(generated,/vdpCanvas\.evaluate\(circuitTextObserver\)/);
 assert.match(generated,/actual Circuit VDP pixels show guest shell response/);
 assert.match(generated,/Circuit guest output survives Code return/);
 assert.doesNotMatch(generated,/window\.__benchTarget\.keyIn\(/,'no diagnostic input injection');
 const directory=mkdtempSync(join(process.env.BW_TEST_TMPDIR || tmpdir(),'freedos-circuits-source-'));
 try{
  const generatedPath=join(directory,'probe.mjs');writeFileSync(generatedPath,generated);
  const parsed=spawnSync(process.execPath,['--check',generatedPath],{encoding:'utf8',timeout:5000});
  assert.equal(parsed.status,0,parsed.stderr);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
