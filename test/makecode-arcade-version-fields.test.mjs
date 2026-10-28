import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import installMigration from '../overlay/scratch-gui/src/lib/arcade-project-migration.js';
const cases=[['arcade_setBackgroundScrollVersion','backgroundScrollVersions','background scroll','arcade-background-scroll',['v0.1.2','43651f88b917a98ad886fdd4c1c2ad8001ce9b9c']],['arcade_setCharacterAnimationVersion','characterAnimationVersions','character animation','arcade-character-animations',['v0.1.0','a8df7de6f7073b553976b9e47fbfadebcdc4f0ec']]];
for(const[opcode,menu,word,dependency,versions]of cases)for(const version of versions)for(const shape of ['native','inline','shadow','computed'])test(`${opcode} ${version} ${shape} preserves its actual library selection`,async()=>{
 const c=new SB3Creator();c.parse(`DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  arcade use ${word} version "${version}"`);assert.deepEqual(c.warnings,[]);
 const t=c.project.targets.find(t=>t.name==='Game'),[id,b]=Object.entries(t.blocks).find(([,b])=>b.opcode===opcode);assert.deepEqual(b.fields.VERSION,[version,null]);
 if(shape!=='native'){delete b.fields.VERSION;if(shape==='inline')b.inputs.VERSION=[1,[10,version]];else{b.inputs.VERSION=shape==='computed'?[3,'computed','menu']:[1,'menu'];t.blocks.menu={opcode:`arcade_menu_${menu}`,fields:{[menu]:[version,null]},inputs:{},shadow:true,parent:id};if(shape==='computed')t.blocks.computed={opcode:'data_variable',fields:{VARIABLE:['version','v']},inputs:{}};}}
 const exported=projectToArcade(c.project);
 const vm={deserializeProject:project=>project};installMigration(vm);
 if(shape==='computed'){assert.ok(exported.unsupported.some(x=>x.includes('fixed selection')));await assert.rejects(vm.deserializeProject(c.project),/cannot be represented/);return;}
 assert.deepEqual(exported.unsupported,[]);assert.ok(JSON.parse(exported.files['pxt.json']).dependencies[dependency].endsWith('#'+version));
 const fresh=new SB3Creator();fresh.parse(c.decompile());assert.deepEqual(fresh.warnings,[]);const block=fresh.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode===opcode);assert.deepEqual(block.fields.VERSION,[version,null]);assert.equal(block.inputs.VERSION,undefined);
 await vm.deserializeProject(c.project);assert.deepEqual(b.fields.VERSION,[version,null]);assert.equal(b.inputs.VERSION,undefined);
});

for(const[opcode,,word,dependency,versions]of cases)test(`${opcode} follows a validated source prelude without losing package identity`,()=>{
 const c=new SB3Creator();c.parse(`DEVICE ARCADE\nGLOBAL count\nSPRITE Game:\nWHEN arcade source starts:\n  declare arcade source scalar count as Number\n  arcade use ${word} version "${versions[1]}"\n  set [count] to 1`);assert.deepEqual(c.warnings,[]);
 const out=projectToArcade(c.project);assert.deepEqual(out.unsupported,[]);assert.ok(JSON.parse(out.files['pxt.json']).dependencies[dependency].endsWith('#'+versions[1]));
 const target=c.project.targets.find(t=>t.name==='Game'),declaration=Object.values(target.blocks).find(b=>b.opcode==='arcade_declareSourceScalar');declaration.fields.TYPE=['Unknown',null];
 const refused=projectToArcade(c.project);assert.ok(refused.unsupported.some(x=>x.includes('Source scalar')));
});
