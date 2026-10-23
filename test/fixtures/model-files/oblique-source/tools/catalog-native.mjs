// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reproduce the application's catalogFor -> fetchLDrawClosure ->
// catalogPartMeta -> upgradePartMeta route for official external LDraw parts.
// This utility never supplies or edits connector metadata itself.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const filesBelow = root => {
  const out = new Map();
  const visit = (dir, prefix='') => {
    for (const item of readdirSync(dir, {withFileTypes:true})) {
      const name = prefix + item.name;
      if (item.isDirectory()) visit(path.join(dir,item.name),name+'/');
      else if (item.isFile()) out.set(name.toLowerCase(),path.join(dir,item.name));
    }
  };
  visit(root);
  return out;
};

export async function augmentNativeCatalog({repo, catalog, modelText, extraRoot, provenanceFile}) {
  const sim = 'overlay/scratch-gui/src/lib/bw-sim/';
  const imp = rel => import(pathToFileURL(path.join(repo,sim,rel)).href);
  const [{referencedFiles},{fetchLDrawClosure},{catalogPartMeta},{upgradePartMeta,validatePartMeta},{BUILTIN_KINDS},{MIN_ENGAGE_LDU}] = await Promise.all([
    imp('model/ldraw-model.js'), imp('ldraw/ldraw-fetch.js'), imp('part-meta/catalog-parts.js'),
    imp('contracts.js'), imp('kinds/index.js'), imp('kinds/pin-axle.js')
  ]);
  const unknown = [...referencedFiles(modelText)].filter(p=>p.endsWith('.dat') && !catalog.has(p)).sort();
  const audit = {schema:'brickwright-native-catalog-admission/v1', unknownParts:unknown, route:'sim-lab.js::catalogFor/deriveCatalogPart (headless exact catalogPartMeta admission)', entries:[], files:[], missing:[]};
  audit.pipelineSha256 = Object.fromEntries(['part-meta/catalog-parts.js','part-meta/derive.js','contracts.js','kinds/pin-axle.js','ldraw/ldraw-fetch.js'].map(rel=>[rel,sha256(readFileSync(path.join(repo,sim,rel)))]));
  if (!unknown.length) return audit;
  if (!extraRoot) throw new Error('Unknown stock parts require --ldraw-extra official-library-root: '+unknown.join(', '));
  const root=path.resolve(extraRoot), extras=filesBelow(root), used=new Map();
  if (provenanceFile) {
    const bytes=readFileSync(provenanceFile);
    audit.provenance={filename:path.basename(provenanceFile),sha256:sha256(bytes),data:JSON.parse(bytes)};
  }
  const vendored=path.join(repo,'overlay/scratch-gui/static/ldraw');
  const lock=JSON.parse(readFileSync(path.join(vendored,'ldraw-lock.json'),'utf8'));
  const local=new Set(Object.keys(lock.files).map(p=>p.toLowerCase()));
  const asset = (filename, key, origin) => {
    const bytes=readFileSync(filename);
    used.set(origin+':'+key,{path:key,origin,bytes:bytes.length,sha256:sha256(bytes)});
    return bytes.toString('utf8');
  };
  const library={
    has:key=>extras.has(key.toLowerCase()),
    read:async key=>asset(extras.get(key.toLowerCase()),key.toLowerCase(),'official-extra')
  };
  const fetchImpl=async url=>{
    const key=String(url).replace(/^native-vendored\//,'').toLowerCase();
    if (!local.has(key)) return {ok:false};
    return {ok:true,text:async()=>asset(path.join(vendored,key),key,'vendored')};
  };
  const closure=await fetchLDrawClosure(unknown,{base:'native-vendored/',fetchImpl,fallback:{library:Promise.resolve(library),local:Promise.resolve(local)}});
  audit.files=[...used.values()].sort((a,b)=>(a.origin+':'+a.path).localeCompare(b.origin+':'+b.path));
  audit.missing=closure.missing;
  if (closure.missing.length) throw Object.assign(new Error('Incomplete official part closure: '+closure.missing.join(', ')),{catalogAudit:audit});
  const pinned=audit.provenance?.data?.completePartClosure;
  if(pinned) {
    const expected=new Map(pinned.map(f=>[f.path.toLowerCase(),f.sha256]));
    const mismatches=audit.files.filter(f=>expected.get(f.path)!==f.sha256).map(f=>({path:f.path,actual:f.sha256,expected:expected.get(f.path)}));
    audit.fileHashVerification={status:mismatches.length?'FAIL':'PASS',checkedFiles:audit.files.length,mismatches};
    if(mismatches.length)throw Object.assign(new Error('LDraw closure differs from its pinned official/check-out manifest'),{catalogAudit:audit});
  } else audit.fileHashVerification={status:'UNTESTED',reason:'Provenance identifies source library but does not pin individual complete-closure files'};
  const check={validate:validatePartMeta,kinds:BUILTIN_KINDS.connectors,minEngage:MIN_ENGAGE_LDU};
  for (const part of unknown) {
    const result=catalogPartMeta(part,closure.read,check);
    const entry={part,decoration:result.decoration,why:result.why,description:result.desc,meta:result.meta};
    entry.metadataSha256=sha256(JSON.stringify(result.meta));
    audit.entries.push(entry);
    if (!result.meta || result.decoration) throw Object.assign(new Error('Official part was not admitted as structural: '+part+'; '+result.why.join('; ')),{catalogAudit:audit});
    catalog.set(part,upgradePartMeta(result.meta));
  }
  return audit;
}
