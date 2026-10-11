// Project palettes are normal startup blocks, so Code, SB3 and Arcade export
// share one source of truth. Later runtime palette calls remain authored code.
import {ARCADE_PALETTE} from './bw-makecode/arcade-assets.js';

export const DEFAULT_PROJECT_PALETTE = ['#000000', ...ARCADE_PALETTE.slice(1)];
export const paletteHex = colors => {
    if (!Array.isArray(colors) || colors.length !== 16 ||
        !colors.every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) {
        throw new Error('Project palette needs 16 RGB colors');
    }
    return colors.map(color => color.slice(1).toLowerCase()).join('');
};
const literalPalette = (blocks, block) => {
    const input = block.inputs?.DATA;
    const text = input && blocks.getBlock(input.block);
    const value = text?.opcode === 'text' && text.shadow ? text.fields?.TEXT?.value : null;
    return typeof value === 'string' && /^[0-9a-f]{96}$/i.test(value) ?
        {text, colors:value.match(/.{6}/g).map(color => `#${color.toLowerCase()}`)} : null;
};
export function inspectProjectPalette (vm) {
    const targets = (vm?.runtime?.targets || []).filter(target => target.isOriginal !== false);
    const starts = [], commands = [];
    for (const target of targets) {
        const blocks = target.blocks;
        if (!blocks?.getScripts || !blocks.getBlock) continue;
        for (const id of blocks.getScripts()) {
            const hat = blocks.getBlock(id), first = hat?.next && blocks.getBlock(hat.next);
            if (hat?.opcode === 'event_whenflagclicked' && first?.opcode === 'arcade_setPalette') {
                starts.push({target,hat,command:first,literal:literalPalette(blocks,first)});
            }
        }
        for (const block of Object.values(blocks._blocks || {})) {
            if (block.opcode === 'arcade_setPalette') commands.push([target.id,block.id]);
        }
    }
    const kind = starts.length > 1 ? 'conflict' : starts.length === 1 ?
        starts[0].literal ? 'constant' : 'dynamic' : 'default';
    // A dialog opened on one project cannot overwrite a later project/Blocks edit.
    const signature = JSON.stringify({targets:targets.map(target=>target.id),
        starts:starts.map(start=>[start.target.id,start.hat.id,start.command.id,start.command.inputs,
            start.literal?.text.fields]),commands});
    return {kind,signature,colors:starts.length===1 && starts[0].literal ?
        [...starts[0].literal.colors] : [...DEFAULT_PROJECT_PALETTE],
    laterChanges:commands.length>starts.length,start:starts.length===1?starts[0]:null};
}
let nextId = 0;
const newId = blocks => {
    let id;
    do { id=`bwPalette_${Date.now().toString(36)}_${(++nextId).toString(36)}`; } while(blocks.getBlock(id));
    return id;
};
export async function applyProjectPalette (vm, colors, expectedSignature) {
    const hex = paletteHex(colors);
    const check = () => {
        const current = inspectProjectPalette(vm);
        if (expectedSignature !== undefined && current.signature !== expectedSignature) {
            throw new Error('Project palette changed. Reload it before applying.');
        }
        if (current.kind === 'conflict' || current.kind === 'dynamic') {
            throw new Error('Startup palette has multiple commands or an expression. Edit it in Code or Blocks.');
        }
        return current;
    };
    check();
    if (typeof vm?.runtime?._primitives?.arcade_setPalette !== 'function') {
        if (!vm?.extensionManager?.loadExtensionURL) throw new Error('Arcade extension is unavailable');
        await vm.extensionManager.loadExtensionURL('arcade');
        if (typeof vm.runtime._primitives?.arcade_setPalette !== 'function') {
            throw new Error('Arcade palette command is unavailable');
        }
    }
    const current = check();
    if (current.kind === 'constant') {
        const {target,literal} = current.start;
        target.blocks.changeBlock({id:literal.text.id,element:'field',name:'TEXT',value:hex});
    } else {
        const stage = vm.runtime.getTargetForStage();
        const blocks = stage?.blocks;
        if (!blocks?.createBlock || !blocks.moveBlock) throw new Error('Project Stage is unavailable');
        const hat = blocks.getScripts().map(id=>blocks.getBlock(id)).find(block=>block.opcode==='event_whenflagclicked');
        const hatId=hat?.id || newId(blocks), commandId=newId(blocks), textId=newId(blocks);
        const first=hat?.next;
        if(first && !blocks.getBlock(first)) throw new Error('Startup stack has a missing block');
        if(!hat)blocks.createBlock({id:hatId,opcode:'event_whenflagclicked',inputs:{},fields:{},next:null,parent:null,
            shadow:false,topLevel:true,x:32,y:32});
        blocks.createBlock({id:textId,opcode:'text',inputs:{},fields:{TEXT:{name:'TEXT',value:hex}},next:null,
            parent:commandId,shadow:true,topLevel:false});
        blocks.createBlock({id:commandId,opcode:'arcade_setPalette',inputs:{DATA:{name:'DATA',block:textId,shadow:textId}},
            fields:{},next:null,parent:null,shadow:false,topLevel:false});
        if(first)blocks.moveBlock({id:first,oldParent:hatId,newParent:commandId});
        blocks.moveBlock({id:commandId,newParent:hatId});
    }
    vm.runtime.emitProjectChanged?.();
    vm.emitWorkspaceUpdate?.();
    // Applying is an explicit live color change; it does not start the game.
    vm.runtime._primitives.arcade_setPalette({DATA:hex},{target:vm.editingTarget});
    return inspectProjectPalette(vm);
}
