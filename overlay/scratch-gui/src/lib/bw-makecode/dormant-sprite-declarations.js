import {parseMakeCodeTs} from './ts-import.js';
import {analyseSourceValueProducers} from './source-value-producers.js';

const metadata=new Set(['originalBody','paramTypes','parameterDefaults','typeParameters','returnType','source']);
const identifier=name=>typeof name==='string'&&/^[A-Za-z_]\w*$/.test(name);
const primitiveDeclarations=new Set(['number','string','boolean']);
const nullInput=(record,node)=>{
    const value=record.target.blocks[node.inputs?.VALUE?.[1]];
    return value?.opcode==='arrays_specialValue'&&value.mutation==null&&
        Object.keys(value.inputs||{}).length===0&&Object.keys(value.fields||{}).join(',')==='KIND'&&
        value.fields.KIND[0]==='null';
};
const flagsReceiver=(record,id,node)=>{
    const parent=record.target.blocks[node.parent],property=parent?.fields?.PROPERTY;
    return parent?.opcode==='arcade_spriteProperty'&&parent.mutation==null&&
        parent.shadow===false&&parent.topLevel===false&&parent.next==null&&
        Object.keys(parent.fields||{}).join(',')==='PROPERTY'&&Array.isArray(property)&&
        property[0]==='flags'&&(property.length===1||property.length===2&&property[1]===null)&&
        Object.keys(parent.inputs||{}).join(',')==='ID'&&parent.inputs.ID?.[1]===id;
};
const flagsRead=(node,parent,parents)=>{
    const outer=parents.get(parent);
    return parent?.type==='Member'&&parent.object===node&&parent.name==='flags'&&!parent.optional&&
        !(outer?.type==='Assignment'&&outer.left===parent)&&
        !(outer?.type==='Update'&&outer.argument===parent)&&
        !(outer?.type==='Unary'&&outer.op==='delete');
};

// This reconstructs declarations only. The physical graph must already prove
// the complete affected closure dormant. Null writers and exact contextual
// flags uses select a compatible declaration, never an initialized value fact.
export function dormantSpriteDeclarations({project,records,isUnreachable,current,literal,resolveCall,globalName,namedArrays}) {
    const denied=()=>new Map();
    try {
        if(!current()||!records.length)return denied();
        const recordByDefinition=new Map(records.map(record=>[record.definition,record]));
        const recordByName=new Map(records.map(record=>[record.name,record]));
        if(recordByName.size!==records.length)return denied();
        const physical=[],byRecord=new Map(records.map(record=>[record,[]]));
        const owner=(target,node)=>{
            const seen=new Set();
            for(let value=node;value&&!seen.has(value);value=target.blocks[value.parent]){
                if(value.opcode==='procedures_definition')return recordByDefinition.get(value)||null;
                seen.add(value);
            }
            return null;
        };
        for(const target of project.targets)for(const [id,node]of Object.entries(target.blocks||{})){
            const record=owner(target,node),row={target,id,node,record};physical.push(row);
            if(record)byRecord.get(record).push(row);
        }
        const dormant=record=>isUnreachable(record.target,record.definition);
        const locals=new Map(),results=new Map(),localConflicts=new Map(),resultConflicts=new Map();
        for(const record of records){
            if(!dormant(record))continue;
            const rows=byRecord.get(record);
            for(const [name,type]of record.localTypes){
                if(primitiveDeclarations.has(type)&&identifier(name)){
                    const reads=rows.filter(({id,node})=>node.opcode==='arcade_getLocal'&&
                        literal(record.target,node,'NAME')===name&&flagsReceiver(record,id,node)&&isUnreachable(record.target,node));
                    if(reads.length){
                        if(!localConflicts.has(record))localConflicts.set(record,new Map());
                        localConflicts.get(record).set(name,{type,reads:reads.length});
                    }
                }
                if(type!=='any'||!identifier(name))continue;
                const writes=[],reads=[];let valid=true;
                for(const {id,node}of rows){
                    if(node.fields?.VARIABLE&&globalName(record.target,node.fields.VARIABLE[0])===name)valid=false;
                    for(const slot of Object.values(node.inputs||{})){
                        const value=slot?.[1];
                        if(Array.isArray(value)&&[12,13].includes(value[0])&&globalName(record.target,value[1])===name)valid=false;
                    }
                    if(node.opcode.startsWith('arrays_')&&namedArrays.get(literal(record.target,node,'NAME'))===name)valid=false;
                    if(literal(record.target,node,'NAME')!==name)continue;
                    if(node.opcode==='arcade_setLocal'){
                        writes.push(node);if(!nullInput(record,node)||!isUnreachable(record.target,node))valid=false;
                    }else if(node.opcode==='arcade_getLocal'){
                        reads.push(node);if(!flagsReceiver(record,id,node)||!isUnreachable(record.target,node))valid=false;
                    }else if(['arcade_getCaptured','arcade_setCaptured','arcade_declareLocal'].includes(node.opcode))valid=false;
                }
                if(valid&&writes.length&&reads.length){
                    if(!locals.has(record))locals.set(record,new Map());
                    locals.get(record).set(name,{writes:writes.length,reads:reads.length});
                }
            }
            const primitiveResult=record.resultType.slice(2);
            if(primitiveDeclarations.has(primitiveResult)){
                const flags=physical.filter(row=>row.node.opcode==='arcade_callFunction'&&
                    resolveCall(row.target,row.node)===record.name&&row.record&&dormant(row.record)&&
                    isUnreachable(row.target,row.node)&&flagsReceiver(row.record,row.id,row.node)).length;
                if(flags)resultConflicts.set(record,{type:primitiveResult,flags});
            }
            if(record.resultType!==': any')continue;
            const returns=rows.filter(({node})=>node.opcode==='arcade_returnValue');
            if(!returns.length||returns.some(({node})=>!nullInput(record,node)||!isUnreachable(record.target,node)))continue;
            const calls=[];let valid=true,flags=0;
            for(const row of physical){
                if(!['arcade_callFunction','procedures_call'].includes(row.node.opcode)||resolveCall(row.target,row.node)!==record.name)continue;
                calls.push(row);
                if(!row.record||!dormant(row.record)||!isUnreachable(row.target,row.node)){valid=false;continue;}
                if(row.node.opcode==='arcade_callFunction'){
                    if(flagsReceiver(row.record,row.id,row.node))flags++;
                    else valid=false;
                }
            }
            if(valid&&calls.length&&flags)results.set(record,{returns:returns.length,calls:calls.length,flags});
        }
        if(!locals.size&&!results.size&&!localConflicts.size&&!resultConflicts.size)return denied();
        const program=parseMakeCodeTs(records.map(record=>record.source).join('\n'));
        if(program.body.length!==records.length||program.body.some(node=>node.type!=='FunctionDeclaration'))return denied();
        const functions=new Map();
        for(const fn of program.body){
            const record=recordByName.get(fn.name);
            if(!record||functions.has(record))return denied();functions.set(record,fn);
            // Ignore only the emitter's generated any=0 initializer when
            // proving physical initialization. Real null assignments must
            // dominate every read, including branches and loop entries.
            for(const [name]of locals.get(record)||[]){
                const declarations=fn.body.filter(node=>node.type==='Declaration')
                    .flatMap(node=>node.decls).filter(decl=>decl.name===name);
                if(declarations.length!==1||declarations[0].init?.type!=='Number'||declarations[0].init.value!=='0'){locals.get(record).delete(name);continue;}
                declarations[0].init=null;
            }
        }
        const graph=analyseSourceValueProducers(program,{unboundIsOpaque:true,initializationEntries:true});
        const nodes=[],parents=new WeakMap(),owners=new WeakMap();
        const visit=(node,parent=null,owner=null)=>{
            if(!node||typeof node!=='object')return;
            if(['FunctionDeclaration','FunctionExpression'].includes(node.type))owner=node;
            parents.set(node,parent);owners.set(node,owner);nodes.push(node);
            for(const [key,value]of Object.entries(node))if(!metadata.has(key)){
                if(Array.isArray(value))for(const child of value)visit(child,node,owner);
                else if(value&&typeof value==='object')visit(value,node,owner);
            }
        };visit(program);
        const plans=new Map();
        for(const record of records){
            const fn=functions.get(record),selected=new Set(),conflicts=[];
            // Diagnose the actual rendered primitive declaration, not a type
            // inferred from an annotation or a desired flags result. Keep the
            // declaration and body intact; this is never a coercion/admission.
            for(const [name,expected]of localConflicts.get(record)||[]){
                const declarations=fn.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls)
                    .filter(decl=>decl.name===name&&decl.typeName===expected.type);
                const binding=graph.bindingOf(fn.body[0],name),kinds=graph.bindingKindsAt(fn.body[0],name);
                if(declarations.length!==1||!binding||kinds.size!==1||!kinds.has('variable')||
                    graph.declarationCountAt(fn.body[0],name)!==1)continue;
                const reads=nodes.filter(node=>node.type==='Identifier'&&graph.bindingOf(node)===binding&&
                    owners.get(node)===fn&&flagsRead(node,parents.get(node),parents)).length;
                if(reads===expected.reads)conflicts.push(`Arcade dormant flags receiver ${record.name}.${name}: incompatible ${expected.type} local declaration`);
            }
            const resultConflict=resultConflicts.get(record);
            if(resultConflict&&fn.returnType===resultConflict.type){
                const calls=nodes.filter(node=>node.type==='Call'&&graph.unchangedFunctionAt(node)===fn&&
                    flagsRead(node,parents.get(node),parents)&&
                    recordByName.has(owners.get(node)?.name)&&dormant(recordByName.get(owners.get(node).name))).length;
                if(calls===resultConflict.flags)conflicts.push(`Arcade dormant flags receiver ${record.name}(): incompatible ${resultConflict.type} result declaration`);
            }
            for(const [name,physicalCounts]of locals.get(record)||[]){
                const binding=graph.bindingOf(fn.body[0],name),kinds=graph.bindingKindsAt(fn.body[0],name);
                if(!binding||kinds.size!==1||!kinds.has('variable')||graph.declarationCountAt(fn.body[0],name)!==1)continue;
                let valid=true,reads=0,writes=0;
                for(const node of nodes){
                    if(node.type!=='Identifier'||graph.bindingOf(node)!==binding)continue;
                    const parent=parents.get(node);
                    if(owners.get(node)!==fn){valid=false;continue;}
                    if(parent?.type==='Assignment'&&parent.left===node){
                        writes++;if(parent.op!=='='||parent.right?.type!=='Null')valid=false;
                    }else if(flagsRead(node,parent,parents)){
                        reads++;if(!graph.isInitializedAt(node))valid=false;
                    }else valid=false;
                }
                if(valid&&reads===physicalCounts.reads&&writes===physicalCounts.writes)selected.add(name);
            }
            let result=false;
            const expected=results.get(record);
            if(expected){
                const returns=nodes.filter(node=>node.type==='Return'&&owners.get(node)===fn);
                let valid=returns.length===expected.returns&&returns.every(node=>node.value?.type==='Null'),calls=0,flags=0;
                for(const node of nodes){
                    if(node.type!=='Identifier'||graph.unchangedFunctionAt(node)!==fn)continue;
                    const parent=parents.get(node),caller=recordByName.get(owners.get(node)?.name);
                    if(parent?.type!=='Call'||parent.callee!==node||!caller||!dormant(caller)){valid=false;continue;}
                    calls++;
                    if(flagsRead(parent,parents.get(parent),parents))flags++;
                    else if(parents.get(parent)?.type!=='ExpressionStatement')valid=false;
                }
                result=valid&&calls===expected.calls&&flags===expected.flags;
            }
            if(selected.size||result||conflicts.length)plans.set(record,{locals:selected,result,conflicts});
        }
        return current()?plans:denied();
    }catch{return denied();}
}
