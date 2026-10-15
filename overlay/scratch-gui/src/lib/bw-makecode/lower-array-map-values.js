import {analyseSourceValueProducers} from './source-value-producers.js';

// SPDX-License-Identifier: BSD-3-Clause
// Selected PXT 13.2.1 helpers.arrayMap caches length and reads each current
// indexed value, including Undefined after shrink (Microsoft PXT, MIT).
// Primary helper: https://github.com/microsoft/pxt/blob/v13.2.1/libs/pxt-common/pxt-helpers.ts
// This module proves actual source sites; the staging pass owns when they run.
export function proveArrayMapValues(program,source='') {
    const statementSites=new WeakSet();
    const findStatements=node=>{if(!node||typeof node!=='object')return;if(node.type==='ExpressionStatement')statementSites.add(node.expr);Object.values(node).forEach(value=>Array.isArray(value)?value.forEach(findStatements):findStatements(value));};findStatements(program);
    const proved=new WeakMap(),originals=new WeakMap(),allRenames=new Map(),unsupported=[],names=new Set();let suffix=0,hasMap=false;
    const scan=node=>{if(!node||typeof node!=='object')return;if(node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='map')hasMap=true;if(typeof node.name==='string')names.add(node.name);if(node.params)node.params.forEach(name=>names.add(name));Object.values(node).forEach(value=>Array.isArray(value)?value.forEach(scan):scan(value));};scan(program);
    if(!hasMap)return {unsupported:[],facts:null,lower:()=>null};
    const facts=analyseSourceValueProducers(program,{arrayValues:true,parenthesized:true,unboundIsOpaque:true,uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true});
    const fresh=()=>{let name;do{name=`__bwMapValue${++suffix}`;}while(names.has(name)||source.includes(name));names.add(name);return name;};
    const fail=message=>{const text=`Array.map: ${message}`;if(!unsupported.includes(text))unsupported.push(text);};
    const primitive=new Set(['Number','String','Boolean','Null','Undefined']);
    const inlineCallbacks=new Set(facts.arrayMapCalls.map(node=>node.args[0]));
    for(const node of facts.arrayMapCalls){
        const fn=node.args[0],receiver=node.callee.object;
        if(!facts.arrayAllocationsAt(receiver).length||!facts.arrayMapReceiverSafeAt(receiver)){fail('receiver requires actual initialized Array allocations and compatible all writers');continue;}
        if(facts.arrayConstraintErrorsAt(receiver).length){fail('receiver Array declaration/formal constraints contradict actual elements and all writers');continue;}
        if(node.typeArguments?.length||node.constructorCall||node.args.length!==1||fn?.type!=='FunctionExpression'||fn.params.length>2||new Set(fn.params).size!==fn.params.length||fn.optionalParams?.length||Object.keys(fn.paramDefaults||{}).length||fn.genericParams?.length||fn.typeParameters?.length){fail('callback requires zero to two distinct plain inline parameters');continue;}
        let bad=false,returns=0;
        const inspect=value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(inspect);return;}if(value.type==='FunctionExpression'&&inlineCallbacks.has(value))return;if(['FunctionDeclaration','FunctionExpression','Class','While','For','ForOf','Throw','Try'].includes(value.type)){bad=true;return;}if(value.type==='Return'){returns++;if(value!==fn.body.at(-1))bad=true;}Object.values(value).forEach(inspect);};fn.body.forEach(inspect);
        const result=facts.functionResultTypes(fn);
        if(bad||(!(returns===0&&statementSites.has(node))&&(fn.body.at(-1)?.type!=='Return'||!fn.body.at(-1).value))){fail('callback requires a complete body with one final value return and no escaped callback');continue;}
        if(!result.size||[...result].some(type=>!primitive.has(type))){fail('callback result requires actual primitive producers; reference, opaque or missing results are not admitted');continue;}
        const domain={number:'Number',string:'String',boolean:'Boolean'};
        const constraint=(types,name)=>!name||name==='any'||domain[name]&&[...types].every(type=>type===domain[name]||['Null','Undefined'].includes(type));
        if(!constraint(result,fn.returnType)||fn.params.some((name,index)=>{const annotation=fn.paramTypes?.[name];const types=facts.functionParameterTypes(fn,index);return annotation?.isArray||!constraint(types,annotation?.text||'');})) {fail('callback declared primitive constraints contradict actual argument/result producers');continue;}
        const renames=allRenames;fn.params.forEach((name,index)=>renames.set(facts.functionParameterBinding(fn,index),fresh()));
        const locals=value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(locals);return;}if(value.type==='FunctionExpression')return;if(value.type==='Declaration')for(const decl of value.decls){const binding=facts.bindingOf(value,decl.name);if(!binding||facts.declarationCountAt(value,decl.name)!==1||renames.has(binding)){bad=true;continue;}renames.set(binding,fresh());}Object.values(value).forEach(locals);};locals(fn.body);
        if(bad){fail('callback local bindings require actual unique lexical declarations');continue;}
        const clone=value=>{if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(clone);const out={};originals.set(out,originals.get(value)||value);for(const[key,child]of Object.entries(value))out[key]=clone(child);if(value.type==='Identifier'){const name=renames.get(facts.bindingOf(value));if(name){out.name=name;out.temporary=true;}}if(value.type==='Declaration')out.decls=value.decls.map(decl=>({...clone(decl),...(facts.localUndefinedDeclarations.includes(decl)?{init:{type:'Undefined'}}:{}),name:renames.get(facts.bindingOf(value,decl.name))||decl.name,temporary:true,valuePreserving:true}));return out;};
        proved.set(node,{fn,clone,implicitUndefined:returns===0,params:fn.params.map((name,index)=>renames.get(facts.functionParameterBinding(fn,index)))});
    }
    const id=name=>({type:'Identifier',name,temporary:true});
    const declaration=(name,init,isArray=false)=>({type:'Declaration',kind:'let',decls:[{name,init,isArray,temporary:true,valuePreserving:true}]});
    return {unsupported,facts,lower(node,{expression,body}){
        const proof=proved.get(originals.get(node)||node);if(!proof)return null;
        const receiver=expression(node.callee.object),array=fresh(),length=fresh(),index=fresh(),result=fresh();
        const callback=proof.clone(proof.fn.body),returned=proof.implicitUndefined?{type:'Return',value:{type:'Undefined'}}:callback.pop();
        const params=proof.params.map((name,i)=>declaration(name,i? id(index):{type:'Index',object:id(array),index:id(index)}));
        const prefix=[...receiver.prefix,declaration(array,receiver.value,true),declaration(length,{type:'Member',object:id(array),name:'length'}),declaration(result,{type:'Array',items:[]},true),
            {type:'For',bwMapOrdered:true,init:declaration(index,{type:'Number',value:'0'}),test:{type:'Binary',op:'<',left:id(index),right:id(length)},update:{type:'Update',op:'++',argument:id(index),prefix:false},body:body([...params,...callback,{type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Member',object:id(result),name:'push'},args:[returned.value]}}])}];
        return {prefix,value:id(result),discardableMap:true};
    }};
}
