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
    // Join the actual reference constructor; edit its real literal input, not exported text.
    const candidates=[];
    for(const target of creator.project.targets)for(const [id,block]of Object.entries(target.blocks||{}))if(block.opcode==='arrays_createReference'){
        const socket=block.inputs?.VALUES;
        if(Array.isArray(socket?.[1])&&socket[1][0]===10&&socket[1][1]==='[1]')candidates.push({target,id,block,cell:socket[1],index:1,old:'[1]',next:'[2]',kind:'actual-JSON-literal'});
        else if(typeof socket?.[1]==='string'){
            const item=target.blocks[socket[1]],value=item?.inputs?.VALUE;
            if(item?.opcode==='arrays_referenceValues'&&Array.isArray(value?.[1])&&[4,5,6,7,8].includes(value[1][0])&&String(value[1][1])==='1')candidates.push({target,id,block,cell:value[1],index:1,old:value[1][1],next:'2',kind:'actual-value-chain-literal'});
        }
    }
    record({stage:'edit-candidates',candidates});assert.equal(candidates.length,1,'unique actual singleton input allocation');
    const selected=candidates[0],cell=selected.cell;assert.equal(cell[selected.index],selected.old);cell[selected.index]=selected.next;
    record({stage:'actual-input-edit',target:creator.project.targets.indexOf(selected.target),blockId:selected.id,kind:selected.kind,old:selected.old,next:selected.next,sameCell:cell===selected.cell,project:creator.project});assert.equal(cell[selected.index],selected.next);
    const secondExport=exported('edited-export',creator),secondAgain=inspectExport('edited-export',secondExport);
    assert.notEqual(secondExport.ts,firstExport.ts,'actual current graph edit changes emitted source');
    // Retain both complete current roundtrips before either clean-admission assertion.
    clean(firstAgain);clean(secondAgain);
});
