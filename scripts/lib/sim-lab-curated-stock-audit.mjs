// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Read-only provenance for an official part promoted into the shipped catalogue.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validatePartMeta} from '../../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {closureOf,judgeFile} from '../sync-ldraw-parts.mjs';
const root=new URL('../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
export function curatedStockAudit(parts){
 const metadata=JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',root)));
 const directory=new URL('overlay/scratch-gui/static/ldraw/',root),bytes=readFileSync(new URL('ldraw-lock.json',directory)),lock=JSON.parse(bytes);
 const read=p=>{const url=new URL(p.toLowerCase(),directory);return existsSync(url)?readFileSync(url,'latin1'):undefined;};
 const closure=closureOf(parts,read);assert.deepEqual(closure.missing,[]);
 const files=closure.files.map(path=>{
  const content=readFileSync(new URL(path,directory)),digest=sha(content);
  assert.equal(digest,lock.files[path]?.sha256,'Official closure identity: '+path);
  assert.equal(judgeFile(path,content.toString('latin1')).problem,null);
  return {path,origin:'canonical-vendored',bytes:content.length,sha256:digest};
 });
 const entries=parts.map(part=>{
  const meta=metadata.parts.find(p=>p.part===part);assert.ok(meta,'Shipped stock metadata: '+part);
  const why=validatePartMeta(meta);assert.deepEqual(why,[]);
  return {part,meta,decoration:false,why,metadataSha256:sha(JSON.stringify(meta)),origin:'reviewed-curated-stock'};
 });
 return {schema:'brickwright-native-catalog-admission/v1',route:'curated stock metadata with verified canonical official closure',unknownParts:[],entries,files,missing:[],
  provenance:{filename:'ldraw-lock.json',sha256:sha(bytes),data:{source:lock.source}},fileHashVerification:{status:'PASS',checkedFiles:files.length,mismatches:[]}};
}
