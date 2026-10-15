import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {createSdkImageLiteralResources} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-image-literal-resources.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {SB3Creator} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-literal-callables.mjs';
const fixture=()=>{
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const creator=new SB3Creator();creator.parse(imported.code);for(const upload of imported.costumes)creator.applyCustomSVG(upload.sprite,upload.svg);
 const project=creator.project,target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_frameImage'));
 const frame=Object.values(target.blocks).find(b=>b.opcode==='arcade_frameImage'),resource=project.targets.find(t=>t.name===frame.inputs.TEMPLATE[1][1]);
 return {project,target,frame,resource,reader:(_t,c)=>creator.assets.get(c.assetId)?.data,svg:creator.assets.get(resource.costumes[0].assetId).data};
};
test('literal source requires actual unshadowed exact pixels and strict Image pixel operation operands',()=>{
 assert.deepEqual(arcadeToPseudocode(source).unsupported,[]);
 for(const input of [source.replace(/img`[^`]*`/,'img`1 .\n2`'),source.replace(/img`[^`]*`/,'img`z`'),
  'let img:any;'+source,source.replace('constructor(){','constructor(img:any){'),
  source.replace('image.setPixel(0,0,7)','image.setPixel("0",0,7)'),source.replace('image.setPixel(0,0,7)','image.setPixel(0,0,unknown)'),
  source.replace('imageLiteralFirst.getPixel(0,0)','imageLiteralFirst.getPixel(0,0,3)'),source.replace('imageLiteralFirst.getPixel(0,0)','imageLiteralFirst.other(0,0)')]){
  assert.notEqual(input,source,'negative must actually change source');assert.ok(arcadeToPseudocode(input).unsupported.length,input);
 }
});
test('current literal resource proof binds exact cloned frame definition and actual SVG body',()=>{
 const f=fixture(),proof=createSdkImageLiteralResources(f.project,()=>f.svg),value=proof.resource(f.target,f.frame);
 assert.deepEqual(value,{width:2,height:2,pixels:[1,0,0,2]});assert.ok(Object.isFrozen(value.pixels));
 assert.equal(proof.allocation(f.target,f.target.blocks[f.frame.parent]),value);
 f.resource.costumes[0].name='Renamed art';assert.equal(proof.resource(f.target,f.frame),null,'changed snapshot cannot borrow the first proof');
 for(const mutate of [
  f=>{f.frame.inputs.COUNT[1][1]='2';},f=>{f.frame.inputs.INDEX[1][1]='1';},f=>{f.frame.inputs.START[1][1]='1';},
  f=>{f.frame.inputs.KEY=[2,'unknown'];},f=>{f.frame.inputs.EXTRA=[1,[4,'0']];},f=>{f.frame.parent='missing';},
  f=>{f.resource.costumes[0].dataFormat='png';},f=>{f.resource.costumes[0].rotationCenterX=999;},
  f=>{f.resource.costumes[0].md5ext='foreign.svg';},f=>{f.project.targets.push(structuredClone(f.resource));},
  f=>{const exposed=structuredClone(f.frame);exposed.parent=null;f.target.blocks.exposed=exposed;},
  f=>{f.svg=f.svg.replace('fill="#ffffff"','fill="#123456"');}
 ]){const f=fixture();mutate(f);assert.equal(createSdkImageLiteralResources(f.project,()=>f.svg).resource(f.target,f.frame),null,String(mutate));}
 let reads=0;const g=fixture(),p=createSdkImageLiteralResources(g.project,()=>{reads++;return g.svg;});assert.ok(p.resource(g.target,g.frame));assert.ok(p.resource(g.target,g.frame));assert.equal(reads,1);
 assert.equal(createSdkImageLiteralResources(g.project,()=>null).resource(g.target,g.frame),null);
});

test('current class pixel operations reject wrong actual inputs and unproved literal ingress',()=>{
 const exportProject=f=>projectToArcade(f.project,{costumeSvg:f.reader});assert.deepEqual(exportProject(fixture()).unsupported,[]);
 for(const mutate of [
  f=>{const pixel=Object.values(f.target.blocks).find(b=>b.opcode==='arcade_setImagePixel');pixel.inputs.X=[1,[10,'0']];},
  f=>{const pixel=Object.values(f.target.blocks).find(b=>b.opcode==='arcade_imagePixel');pixel.inputs.IMAGE=[1,[10,'opaque']];},
  f=>{const pixel=Object.values(f.target.blocks).find(b=>b.opcode==='arcade_setImagePixel');pixel.inputs.EXTRA=[1,[4,'0']];},
  f=>{f.frame.inputs.COUNT[1][1]='2';},f=>{f.frame.inputs.TEMPLATE[1][1]='missing';},
  f=>{f.resource.costumes[0].rotationCenterY=99;},f=>{f.reader=()=>null;}
 ]){const f=fixture();mutate(f);assert.ok(exportProject(f).unsupported.length,String(mutate));}
});
