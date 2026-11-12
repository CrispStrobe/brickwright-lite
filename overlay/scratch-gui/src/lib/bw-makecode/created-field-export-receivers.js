import {parseMakeCodeTs} from './ts-import.js';
import {sdkSpriteConstructorScalarEffects} from './sdk-sprite-constructor-scalar-effects.js';

// Join privately recorded physical emissions to UNIQUE assignments in each
// complete, freshly parsed output program. Matching syntax only locates a
// candidate; the closed constructor interpreter supplies the receiver fact.
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','ordinaryParameterDefaultNames','bwProcedureConstraintSource']);
const canonical=value=>{
    if(Array.isArray(value))return value.map(canonical);
    if(!value||typeof value!=='object')return value;
    return Object.fromEntries(Object.keys(value).filter(key=>!metadata.has(key)).sort().map(key=>[key,canonical(value[key])]));
};
const assignments=program=>{
    const out=[];
    const visit=node=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const item of node)visit(item);return;}
        if(node.type==='Assignment'&&node.op==='='&&node.left?.type==='Member')out.push(node);
        for(const [key,value]of Object.entries(node))if(!metadata.has(key))visit(value);
    };
    visit(program);return out;
};
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
export function createCreatedFieldExportReceivers({sources,sites,current}){
    const rows=[],proofs=[];let live=true;
    const isCurrent=()=>{if(live)try{live=current()&&proofs.every(proof=>proof.current());}catch{live=false;}return live;};
    const denied=()=>null;
    if(!isCurrent())return denied;
    try{
        for(const site of sites){
            const nodes=assignments(parse(site.statement));
            if(nodes.length===1)rows.push({...site,key:JSON.stringify(canonical(nodes[0])),names:null});
        }
        const counts=new Map();for(const row of rows)counts.set(row.key,(counts.get(row.key)||0)+1);
        for(const source of new Set(sources)){
            const program=parse(source),nodes=assignments(program),proof=sdkSpriteConstructorScalarEffects(program);
            proofs.push(proof);
            const index=new Map();for(const node of nodes){const key=JSON.stringify(canonical(node));if(!index.has(key))index.set(key,[]);index.get(key).push(node);}
            for(const row of rows){
                const matches=index.get(row.key),receivers=counts.get(row.key)===1&&matches?.length===1?proof.fieldReceiverClassesAt(matches[0]):null;
                const names=receivers?.map(node=>node.name).sort();
                if(!names?.length||new Set(names).size!==names.length){row.names=false;continue;}
                if(row.names===null)row.names=names;
                else if(!row.names||JSON.stringify(row.names)!==JSON.stringify(names))row.names=false;
            }
        }
    }catch{return denied;}
    if(!sources.length||!isCurrent())return denied;
    return (target,block)=>{
        if(!isCurrent())return null;
        const matches=rows.filter(row=>row.target===target&&row.block===block);
        return matches.length===1&&matches[0].names?[...matches[0].names]:null;
    };
}
