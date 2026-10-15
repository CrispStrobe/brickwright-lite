import {imageToSvg,ARCADE_PALETTE} from './arcade-assets.js';
import {svgToPixels} from './pixel-image.js';

// Only a cloned, fixed single-frame resource can stand in for an allocating
// img literal. The current asset reader supplies bytes for the actual costume;
// names/file identifiers alone never supply pixel or runtime Image authority.
export function createSdkImageLiteralResources(project,readSvg,palette=ARCADE_PALETTE) {
    const cached=new WeakMap();
    const text=(target,block,name)=>{
        const input=block.inputs?.[name],slot=input?.[1];
        if(!input||![1,3].includes(input[0]))return null;
        if(Array.isArray(slot))return slot.length===2&&slot[0]===10&&typeof slot[1]==='string'?slot[1]:null;
        const leaf=typeof slot==='string'&&target.blocks[slot];
        return leaf?.opcode==='text'&&leaf.shadow&&leaf.parent===Object.keys(target.blocks).find(id=>target.blocks[id]===block)&&!Object.keys(leaf.inputs||{}).length&&Object.keys(leaf.fields||{}).length===1&&typeof leaf.fields.TEXT?.[0]==='string'?leaf.fields.TEXT[0]:null;
    };
    const number=(target,block,name)=>{
        const input=block.inputs?.[name],slot=input?.[1];if(!input||![1,3].includes(input[0]))return null;
        let value;if(Array.isArray(slot)&&slot.length===2&&[4,5,6,7,8].includes(slot[0]))value=slot[1];
        else {const leaf=typeof slot==='string'&&target.blocks[slot];if(!leaf||leaf.opcode!=='math_number'||!leaf.shadow||leaf.parent!==Object.keys(target.blocks).find(id=>target.blocks[id]===block)||Object.keys(leaf.inputs||{}).length||Object.keys(leaf.fields||{}).length!==1)return null;value=leaf.fields.NUM?.[0];}
        return ['string','number'].includes(typeof value)&&Number.isFinite(Number(value))?Number(value):null;
    };
    const definition=(target,block)=>{
        if(!block||block.opcode!=='arcade_frameImage'||!Object.values(target.blocks||{}).includes(block)||block.shadow||block.topLevel||block.next||Object.keys(block.fields||{}).length||Object.keys(block.inputs||{}).sort().join(',')!=='COUNT,INDEX,KEY,START,TEMPLATE')return null;
        const key=text(target,block,'KEY'),template=text(target,block,'TEMPLATE');
        return key&&template&&number(target,block,'START')===0&&number(target,block,'COUNT')===1&&number(target,block,'INDEX')===0?{key,template}:null;
    };
    const cloneFor=(target,frame)=>{
        const id=Object.keys(target.blocks||{}).find(id=>target.blocks[id]===frame),clone=target.blocks[frame?.parent];
        return id&&clone?.opcode==='arcade_cloneImage'&&!clone.shadow&&!clone.topLevel&&!clone.next&&!Object.keys(clone.fields||{}).length&&Object.keys(clone.inputs||{}).length===1&&clone.inputs.IMAGE?.[1]===id?clone:null;
    };
    const inspect=(target,frame)=>{
        if(!project.targets.includes(target)||typeof readSvg!=='function')return null;
        const selected=definition(target,frame),clone=cloneFor(target,frame);if(!selected||!clone)return null;
        // The native cache uses the first definition for each key. Unknown or
        // incompatible definitions and uncloned exposure cannot borrow it.
        const uses=[];
        for(const actual of project.targets)for(const block of Object.values(actual.blocks||{}))if(block.opcode==='arcade_frameImage'){
            const key=text(actual,block,'KEY');if(key===null)return null;if(key!==selected.key)continue;
            const row=definition(actual,block);if(!row||row.template!==selected.template||!cloneFor(actual,block))return null;
            uses.push([actual.name,block]);
        }
        const targets=project.targets.filter(actual=>!actual.isStage&&actual.name===selected.template);if(targets.length!==1)return null;
        const resource=targets[0],costume=resource.costumes?.[0];
        if(!costume||costume.dataFormat!=='svg'||typeof costume.assetId!=='string'||!costume.assetId||costume.md5ext!==costume.assetId+'.svg')return null;
        const snapshot=JSON.stringify([target.name,frame,clone,resource.name,costume,uses]);
        const previous=cached.get(frame);if(previous)return previous.snapshot===snapshot?previous.image:null;
        const svg=readSvg(resource,costume);if(typeof svg!=='string')return null;
        const image=svgToPixels(svg,palette);
        if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width>2000||image.height>2000||image.pixels.length!==image.width*image.height||
            costume.rotationCenterX!==image.width*2||costume.rotationCenterY!==image.height*2||image.pixels.some(pixel=>!Number.isInteger(pixel)||pixel<0||pixel>15)||
            image.palette&&JSON.stringify(image.palette)!==JSON.stringify(palette)||imageToSvg(image,{palette})!==svg||JSON.stringify([target.name,frame,clone,resource.name,costume,uses])!==snapshot)return null;
        const owned=Object.freeze({width:image.width,height:image.height,pixels:Object.freeze(Array.from(image.pixels))});
        cached.set(frame,{snapshot,image:owned});return owned;
    };
    return Object.freeze({
        resource(target,block){return inspect(target,block);},
        allocation(target,clone){
            if(!clone||!Object.values(target.blocks||{}).includes(clone)||clone.opcode!=='arcade_cloneImage')return null;
            const frame=target.blocks[clone.inputs?.IMAGE?.[1]];return frame&&cloneFor(target,frame)===clone?inspect(target,frame):null;
        }
    });
}
