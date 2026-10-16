import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';

const SOURCE='let input=[1];let calls=0;function effect(value:number){calls++;return value}calls+=10;input.map(value=>effect(value));calls+=100;';
const record=row=>{if(process.env.BW_DISCARDED_MAP_EXPORT_EVIDENCE)appendFileSync(process.env.BW_DISCARDED_MAP_EXPORT_EVIDENCE,JSON.stringify(row,(_k,v)=>v===undefined?{$scalar:'Undefined'}:v)+'\n');};
const channels=value=>Object.fromEntries([...new Set(['unsupported','warnings','errors','unparsed','diagnostics','refused','fetchRefusals','netAttempts',...Object.keys(value).filter(k=>/unsupported|warn|error|unparsed|diagnostic|refus|netAttempts/i.test(k))])].map(key=>[key,{provided:Object.hasOwn(value,key),...(Object.hasOwn(value,key)?{value:value[key]}:{})}]));
const clean=(value,required=['unsupported'])=>{for(const key of required)assert.ok(Object.hasOwn(value,key),'promised channel absent: '+key);for(const [key,row]of Object.entries(channels(value)))if(row.provided)assert.ok(Array.isArray(row.value)&&row.value.length===0,key+': '+JSON.stringify(row.value));};
const nodes=root=>{const out=[];const visit=value=>{if(!value||typeof value!=='object')return;if(!Array.isArray(value))out.push(value);for(const child of Object.values(value))visit(child);};visit(root);return out;};
const convert=(label,source)=>{const result=arcadeToPseudocode(source);record({stage:label,source,result,channels:channels(result)});return result;};
const exported=(label,creator)=>{const result=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:label,result,channels:channels(result)});return result;};
const inspectExport=(label,result)=>{
    clean(result);assert.equal(typeof result.ts,'string');assert.ok(result.ts.length);
    const ast=parseMakeCodeTs(result.ts,{parameterDefaults:true,retainParentheses:true,retainPrimitiveProcedureDefaults:true});record({stage:label+'-actual-AST',ast});
    const procedures=nodes(ast).filter(n=>n.type==='FunctionDeclaration'&&n.name==='effect');assert.equal(procedures.length,1);assert.equal(procedures[0].paramTypes?.value?.text,'number','actual exported formal keeps its original constraint');
    const calls=nodes(ast).filter(n=>n.type==='Call'&&n.callee?.type==='Identifier'&&n.callee.name==='effect');assert.equal(calls.length,1);assert.equal(calls[0].args.length,1);
    return convert(label+'-reimport',result.files);
};

test('typed discarded map survives actual Creator export and a current numeric input edit without annotation-derived ingress',()=>{
    const imported=convert('original-import',SOURCE);clean(imported);
    const creator=new Creator();creator.parse(imported.code);record({stage:'actual-Creator',project:creator.project,channels:channels(creator)});clean(creator,['warnings','errors','unparsed']);
    const firstExport=exported('original-export',creator),firstAgain=inspectExport('original-export',firstExport);
    // The actual Creator stages literal construction as empty allocation,
    // defining push and assignment. Join their physical current connections.
    const candidates=[];
    const literal=input=>Array.isArray(input?.[1])?input[1]:null;
    for(const target of creator.project.targets){
        const blocks=target.blocks||{},entries=Object.entries(blocks).filter(([,block])=>block.opcode==='arcade_whenSourceStarts');
        for(const [entryId,entry]of entries){
            const chain=[],seen=new Set();let cursor=entry.next,prior=entryId;
            while(cursor){assert.ok(!seen.has(cursor),'source entry chain is acyclic');seen.add(cursor);const block=blocks[cursor];assert.ok(block);assert.equal(block.parent,prior);chain.push(cursor);prior=cursor;cursor=block.next;}
            for(const allocationId of chain){
                const allocation=blocks[allocationId],constructorId=allocation.inputs?.VALUE?.[1],constructor=typeof constructorId==='string'?blocks[constructorId]:null;
                if(allocation.opcode!=='arcade_setLocal'||constructor?.opcode!=='arrays_createReference'||constructor.parent!==allocationId||literal(constructor.inputs.VALUES)?.[1]!=='[]')continue;
                const local=literal(allocation.inputs.NAME)?.[1],pushId=allocation.next,push=blocks[pushId],writerId=push?.next,writer=blocks[writerId];
                if(typeof local!=='string'||push?.opcode!=='arrays_mutateReference'||literal(push.inputs.OP)?.[1]!=='push'||writer?.opcode!=='data_setvariableto'||writer.fields?.VARIABLE?.[0]!=='input')continue;
                const receiverId=push.inputs?.ARRAY?.[1],receiver=typeof receiverId==='string'?blocks[receiverId]:null,sourceId=writer.inputs?.VALUE?.[1],source=typeof sourceId==='string'?blocks[sourceId]:null;
                if(receiver?.opcode!=='arcade_getLocal'||receiver.parent!==pushId||literal(receiver.inputs.NAME)?.[1]!==local||source?.opcode!=='arcade_getLocal'||source.parent!==writerId||literal(source.inputs.NAME)?.[1]!==local)continue;
                const valueId=push.inputs?.VALUE?.[1],value=typeof valueId==='string'?blocks[valueId]:null,left=literal(value?.inputs?.NUM1),right=literal(value?.inputs?.NUM2);
                if(value?.opcode!=='operator_add'||value.parent!==pushId||!left||!right||![4,5,6,7,8].includes(left[0])||![4,5,6,7,8].includes(right[0])||String(left[1])!=='0'||String(right[1])!=='1')continue;
                const variableId=writer.fields.VARIABLE[1],cells=creator.project.targets.flatMap(owner=>Object.hasOwn(owner.variables||{},variableId)?[{owner:owner.name,id:variableId,value:owner.variables[variableId]}]:[]);
                candidates.push({target,id:allocationId,block:allocation,entryId,chain,constructorId,constructor,pushId,push,writerId,writer,receiverId,receiver,sourceId,source,valueId,value,local,variableId,cells,cell:right,index:1,old:right[1],next:'2',kind:'actual-connected-allocation-push-numeric-cell'});
            }
        }
    }
    for(const candidate of candidates){candidate.cellUses=[];for(const target of creator.project.targets)for(const [id,block]of Object.entries(target.blocks||{}))for(const [input,slot]of Object.entries(block.inputs||{}))if(slot?.[1]===candidate.cell)candidate.cellUses.push({target:target.name,id,input});}
    record({stage:'edit-candidates',candidates});assert.equal(candidates.length,1,'unique actual singleton input allocation');
    const selected=candidates[0],cell=selected.cell;assert.deepEqual(selected.cellUses,[{target:selected.target.name,id:selected.valueId,input:'NUM2'}],'the same physical editable cell has one exact active source socket');assert.equal(selected.cells.length,1,'unique actual source variable owner');assert.equal(selected.cells[0].value[0],'input');assert.equal(cell[selected.index],selected.old);cell[selected.index]=selected.next;
    record({stage:'actual-input-edit',target:creator.project.targets.indexOf(selected.target),blockId:selected.id,kind:selected.kind,old:selected.old,next:selected.next,sameCell:cell===selected.cell,project:creator.project});assert.equal(cell[selected.index],selected.next);
    const secondExport=exported('edited-export',creator),secondAgain=inspectExport('edited-export',secondExport);
    assert.notEqual(secondExport.ts,firstExport.ts,'actual current graph edit changes emitted source');
    // Retain both complete current roundtrips before either clean-admission assertion.
    clean(firstAgain);clean(secondAgain);
});
