import assert from 'node:assert/strict';
import Creator from '../../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

export const clean=value=>{for(const key of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(value,key))assert.deepEqual(value[key],[],key);};
export function checkedCode(creator,project=creator.project){
 const code=creator.decompile(project);assert.equal(typeof code,'string');assert.match(code,/DEVICE ARCADE/);
 assert.doesNotMatch(code,/^\s*# unsupported:/m,'Code feedback cannot silently erase an unsupported block');return code;
}

// Per-consumer source/artwork state; no authority decisions are stored here.
export function createFrameSourceProjects(){
// Artwork remains associated with the exact serialized project, rather
// than a visible sprite name or an asset ID shared by another fixture.
const projectArtwork=new Map();
function svgProvider(creator){
 const assets=new Map([...creator.assets].filter(([,asset])=>asset.type==='svg'&&typeof asset.data==='string').map(([id,asset])=>[id,asset.data]));
 return (_target,costume)=>assets.get(costume.assetId)??null;
}
function rememberArtwork(creator){projectArtwork.set(JSON.stringify(creator.project),svgProvider(creator));return creator;}
function applyArtwork(creator,costumes){
 for(const costume of costumes||[]){
  assert.equal(typeof costume.sprite,'string');assert.equal(typeof costume.svg,'string');
  const added=costume.mode==='add';
  assert.equal(added?creator.addCustomSVGCostume(costume.sprite,costume.svg,costume.name):creator.applyCustomSVG(costume.sprite,costume.svg),true,'real imported artwork target');
  const target=creator.project.targets.find(t=>!t.isStage&&t.name===costume.sprite);assert.ok(target);
  if(!added&&costume.name)target.costumes[0].name=String(costume.name);
  const installed=added?target.costumes.at(-1):target.costumes[0];
  assert.equal(creator.assets.get(installed.assetId)?.data,costume.svg,'exact imported SVG bytes');
 }
 return creator;
}
function carryArtwork(previous,next){
 const costumes=[];
 for(const target of previous.project.targets.filter(t=>!t.isStage))for(const [index,costume]of target.costumes.entries()){
  const asset=previous.assets.get(costume.assetId);
  assert.ok(asset&&asset.type==='svg'&&typeof asset.data==='string','real previous Creator artwork');
  costumes.push({sprite:target.name,name:costume.name,svg:asset.data,mode:index?'add':'replace'});
 }
 return rememberArtwork(applyArtwork(next,costumes));
}
function imported(files){
 const translated=arcadeToPseudocode(files);clean(translated);
 const creator=new Creator();creator.parse(translated.code);clean(creator);applyArtwork(creator,translated.costumes);
 // The GUI's original export/reimport precedes its final From blocks ->
 // Code -> To blocks feedback. The real export emits local declarations;
 // their actual initializers must return through the public source importer.
 const exported=projectJsonToArcade(JSON.stringify(creator.project),{costumeSvg:svgProvider(creator)});clean(exported);
 assert.ok(exported.files&&typeof exported.files==='object'&&!Array.isArray(exported.files));
 assert.equal(typeof exported.files['main.ts'],'string');assert.ok(exported.files['main.ts'].length);
 for(const value of Object.values(exported.files))assert.equal(typeof value,'string');
 const reimported=arcadeToPseudocode(exported.files);clean(reimported);
 assert.doesNotMatch(reimported.code,/^\s*# unsupported:/m);
 const blocks=new Creator();blocks.parse(reimported.code);clean(blocks);applyArtwork(blocks,reimported.costumes);
 const savedProject=JSON.parse(JSON.stringify(blocks.project));
 const code=new Creator().decompile(savedProject);
 assert.equal(typeof code,'string');assert.match(code,/DEVICE ARCADE/);
 assert.doesNotMatch(code,/^\s*# unsupported:/m);
 const feedback=new Creator();feedback.parse(code);clean(feedback);return carryArtwork(blocks,feedback);
}
return {imported,carryArtwork,artworkForProject:serializedProject=>projectArtwork.get(serializedProject)};
}
