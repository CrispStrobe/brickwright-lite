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
const startupHat = block => ['arcade_whenSourceStarts','event_whenflagclicked'].includes(block?.opcode);
const sourceDeclarations = new Set(['arcade_declareSourceScalar','arcade_declareSourceReference']);
// Source declarations are an atomic prelude. Palette authoring may insert only
// after that entire prefix; ordinary Scratch startup retains its saved defaults.
const startupPosition = (blocks, hat) => {
    let parent = hat, next = hat.next;
    const declarations = [], seen = new Set();
    if (hat.opcode === 'arcade_whenSourceStarts') {
        while (next) {
            const block = blocks.getBlock(next);
            if (!block) throw new Error('Startup stack has a missing block');
            if (!sourceDeclarations.has(block.opcode)) break;
            if (seen.has(next)) throw new Error('Cyclic source declaration prefix');
            seen.add(next);
            declarations.push({id:block.id,opcode:block.opcode,next:block.next,fields:block.fields,inputs:block.inputs,
                reporters:Object.values(block.inputs || {}).map(input=>blocks.getBlock(input.block))});
            parent = block;
            next = block.next;
        }
    }
    return {parent,next,declarations};
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
    const starts = [], commands = [], prefixes = [];
    for (const target of targets) {
        const blocks = target.blocks;
        if (!blocks?.getScripts || !blocks.getBlock) continue;
        for (const id of blocks.getScripts()) {
            const hat = blocks.getBlock(id);
            if (!startupHat(hat)) continue;
            const position = startupPosition(blocks,hat), first = position.next && blocks.getBlock(position.next);
            prefixes.push([target.id,hat.id,hat.next,position.declarations]);
            if (first?.opcode === 'arcade_setPalette') {
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
            start.literal?.text.fields]),commands,prefixes});
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
        const sourceEntries=(vm.runtime.targets || []).filter(target=>target.isOriginal!==false).flatMap(target=>
            (target.blocks?.getScripts?.() || []).map(id=>target.blocks.getBlock(id))
                .filter(hat=>hat?.opcode==='arcade_whenSourceStarts').map(hat=>({target,hat})));
        // Generated art holders use source hats containing only hide. They
        // do not own program initialization or compete for palette ordering.
        const activeEntries=sourceEntries.filter(({target,hat})=>{let id=hat.next;const seen=new Set();while(id){if(seen.has(id))return true;seen.add(id);const block=target.blocks.getBlock(id);if(!block || block.opcode!=='looks_hide')return true;id=block.next;}return false;});
        if(activeEntries.length>1)throw new Error('Project has multiple source entry stacks. Edit its startup palette in Code or Blocks.');
        // Source entry owns the earlier startup phase, even on a non-Stage
        // target. Keep its existing stack and ordinary Scratch hats intact.
        const selected=activeEntries[0] || sourceEntries[0];
        const target=selected?.target || vm.runtime.getTargetForStage();
        const blocks = target?.blocks;
        if (!blocks?.createBlock || !blocks.moveBlock) throw new Error('Project Stage is unavailable');
        const hat=selected?.hat || blocks.getScripts().map(id=>blocks.getBlock(id)).find(startupHat);
        const hatId=hat?.id || newId(blocks), commandId=newId(blocks), textId=newId(blocks);
        const position=hat ? startupPosition(blocks,hat) : null;
        const first=position?.next, parentId=position?.parent.id || hatId;
        if(first && !blocks.getBlock(first)) throw new Error('Startup stack has a missing block');
        if(!hat)blocks.createBlock({id:hatId,opcode:'event_whenflagclicked',inputs:{},fields:{},next:null,parent:null,
            shadow:false,topLevel:true,x:32,y:32});
        blocks.createBlock({id:textId,opcode:'text',inputs:{},fields:{TEXT:{name:'TEXT',value:hex}},next:null,
            parent:commandId,shadow:true,topLevel:false});
        blocks.createBlock({id:commandId,opcode:'arcade_setPalette',inputs:{DATA:{name:'DATA',block:textId,shadow:textId}},
            fields:{},next:null,parent:null,shadow:false,topLevel:false});
        if(first)blocks.moveBlock({id:first,oldParent:parentId,newParent:commandId});
        blocks.moveBlock({id:commandId,newParent:parentId});
    }
    vm.runtime.emitProjectChanged?.();
    vm.emitWorkspaceUpdate?.();
    // Applying is an explicit live color change; it does not start the game.
    vm.runtime._primitives.arcade_setPalette({DATA:hex},{target:vm.editingTarget});
    return inspectProjectPalette(vm);
}
