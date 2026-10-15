import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {SDK_FONT_FIELDS} from './sdk-font-value-descriptors.js';
import {lowerNumberTextValue} from './lower-number-text-values.js';

// Directed actual-producer authority. An annotation, assertion or SDK-looking
// name does not allocate a Font, and no class/member result is guessed.
export function lowerSdkFontValues(program) {
    const sdk=staticSdkNamespaceReceivers(program,{builtinIdentifiers:['screen']}),fields=new Map(SDK_FONT_FIELDS.map(field=>[field.name,field.type]));
    let screenWritten=false;
    const scanScreenWrites=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(scanScreenWrites);return;}const target=node.type==='Assignment'?node.left:node.type==='Update'?node.argument:null;if(target?.type==='Identifier'&&target.name==='screen'&&sdk.has(target))screenWritten=true;Object.values(node).forEach(scanScreenWrites);};scanScreenWrites(program);
    const writing=new WeakSet(),owners=new WeakMap(),cells=new WeakMap(),types=new Map(),edges=[],scales=[],texts=[],derived=[],prints=[],classes=new Map(),classCalls=[],classWrites=new Set(),declarations=new Map(),functions=new Map(),calls=[],unsupported=[];
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const intrinsic=(name,args,type)=>({type:'Call',callee:{type:'Identifier',name:'__bwSdkFont_'+name},args,bwFontIntrinsic:name,...(type?{bwFontType:type}:{} )});
    const scope=parent=>({parent,bindings:new Map()});
    const global=scope(null),key=()=>Symbol(),add=(cell,type)=>{if(!types.has(cell))types.set(cell,new Set());const set=types.get(cell),before=set.size;set.add(type);return before!==set.size;};
    const binding=(owner,name)=>{for(let current=owner;current;current=current.parent)if(current.bindings.has(name))return current.bindings.get(name);if(!global.bindings.has(name))global.bindings.set(name,key());return global.bindings.get(name);};
    const declare=(owner,name)=>{if(!owner.bindings.has(name))owner.bindings.set(name,key());return owner.bindings.get(name);};
    const declaration=(owner,name,node)=>{const id=declare(owner,name);if(!declarations.has(id))declarations.set(id,new Set());declarations.get(id).add(node);};
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const returns=node=>node?.type==='Return'||node?.type==='Block'&&complete(node.body)||node?.type==='If'&&complete(node.consequent)&&complete(node.alternate);
    const complete=body=>(body||[]).some(returns);
    const predeclare=(body,owner)=>{for(const node of body||[]){if(node.type==='Declaration')for(const decl of node.decls)declaration(owner,decl.name,decl);if(['FunctionDeclaration','Class','Enum'].includes(node.type))declaration(owner,node.name,node);}};
    const vars=(node,owner)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>vars(value,owner));return;}if(['FunctionDeclaration','FunctionExpression','Class'].includes(node.type))return;if(node.type==='Declaration'&&node.kind==='var')node.decls.forEach(decl=>declare(owner,decl.name));Object.values(node).forEach(value=>{if(value&&typeof value==='object')vars(value,owner);});};
    const cell=node=>node?.type==='Identifier'&&writing.has(node)?binding(owners.get(node)||global,node.name):cells.get(node);
    const edge=(from,to)=>{if(from&&to)edges.push([from,to]);};
    const body=(nodes,outer,fn=null)=>{const owner=scope(outer);predeclare(nodes,owner);if(fn){for(const param of fn.params||[])declaration(owner,param,Symbol(param));vars(nodes,owner);owner.result=fn.result;}for(const node of nodes||[])visit(node,owner);return owner;};
    const visit=(node,owner)=>{
        if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>visit(value,owner));return;}
        owners.set(node,owner);if(['FunctionDeclaration','Class'].includes(node.type) && (node.name?.startsWith('__bwSdkFont_') || node.name==='__bwSDK_Font'))fail('Internal Font descriptor and intrinsic names are not source bindings');
        if(node.type==='Declaration' && node.decls.some(decl=>decl.name.startsWith('__bwSdkFont_') || decl.name==='__bwSDK_Font'))fail('Internal Font descriptor and intrinsic names are not source bindings');
        if(node.type==='Identifier'){if(node.name.startsWith('__bwSdkFont_'))fail('Internal Font intrinsic names are not source bindings');if(!writing.has(node)){cells.set(node,key());if(node.name==='screen'&&sdk.has(node))add(cell(node),screenWritten?'Opaque':'Image');else edge(binding(owner,node.name),cell(node));}return;}
        cells.set(node,key());const current=cell(node);
        if(node.type==='Program'){predeclare(node.body,owner);vars(node.body,owner);node.body.forEach(value=>visit(value,owner));return;}
        if(node.type==='Block'){body(node.body,owner);return;}
        if(node.type==='FunctionDeclaration'){
            const result=key(),entry={node,result,owner:null},functionBinding=binding(owner,node.name);
            if(functions.has(functionBinding)){functions.set(functionBinding,null);fail('SDK Font procedure flow requires a unique lexical declaration');}else functions.set(functionBinding,entry);
            entry.owner=body(node.body,owner,{params:node.params,result});if(!complete(node.body))add(result,'Undefined');return;
        }
        if(node.type==='FunctionExpression'){add(current,'Opaque');body(node.body,owner,{params:node.params,result:key()});return;}
        if(node.type==='Class'){
            const name=binding(owner,node.name);classes.set(name,(classes.get(name)||0)+1);add(current,'Opaque');for(const field of node.fields||[])visit(field.init,owner);
            for(const method of [node.ctor,...(node.methods||[])].filter(Boolean))body(method.body,owner,{params:method.params,result:key()});return;
        }
        if(node.type==='If'){visit(node.test,owner);body(node.consequent,owner);body(node.alternate,owner);return;}
        if(['For','ForOf','While'].includes(node.type)){
            const loop=scope(owner);if(node.init?.type==='Declaration')predeclare([node.init],loop);if(node.type==='ForOf')declare(loop,node.name);
            for(const value of [node.init,node.test,node.update,node.iterable])visit(value,loop);body(node.body,loop);return;
        }
        if(node.type==='Declaration'){
            for(const decl of node.decls){const target=binding(owner,decl.name);if(decl.init){visit(decl.init,owner);edge(cell(decl.init),target);}if(decl.typeName==='image.Font')owner.fontAnnotations=(owner.fontAnnotations||new Set()).add(target);}return;
        }
        if(node.type==='Return'){visit(node.value,owner);let fn=owner;while(fn&&!fn.result)fn=fn.parent;if(fn){if(node.value)edge(cell(node.value),fn.result);else add(fn.result,'Undefined');}return;}
        if(node.type==='Assignment'&&node.op==='='&&node.left?.type==='Identifier')writing.add(node.left);
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,owner);
        if(node.type==='Assignment'){if(node.left?.type==='Identifier')classWrites.add(binding(owners.get(node.left),node.left.name));if(node.op==='=')edge(cell(node.right),cell(node.left));else if(node.left?.type==='Identifier')derived.push({result:binding(owners.get(node.left),node.left.name),type:'Number',operands:[cell(node.left),cell(node.right)],signature:['+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','>>>='].includes(node.op),domain:'Number'});else add(cell(node.left),'Opaque');edge(cell(node.right),current);return;}
        if(node.type==='Update'&&node.argument?.type==='Identifier'){classWrites.add(binding(owners.get(node.argument),node.argument.name));derived.push({result:binding(owners.get(node.argument),node.argument.name),type:'Number',operands:[cell(node.argument)],signature:['++','--'].includes(node.op),domain:'Number'});edge(cell(node.argument),current);return;}
        if(node.type==='Call'&&node.isNew&&node.callee?.type==='Identifier'){classCalls.push({value:current,name:binding(owner,node.callee.name)});return;}
        if(node.type==='Member'&&sdk.has(node)&&['image.font5','image.font8','image.font12'].includes(path(node)))add(current,'Font');
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.getFontForText'&&node.args.length===1)texts.push({node,argument:cell(node.args[0]),result:current});
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.scaledFont'&&node.args.length===2)scales.push({node,receiver:cell(node.args[0]),result:current});
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.create')derived.push({result:current,type:'Image',operands:node.args.map(cell),signature:node.args.length===2,domain:'Number'});
        else if(node.type==='Template'&&node.tag==='img')add(current,'Image');
        else if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Member'&&node.callee.name==='clone')derived.push({result:current,type:'Image',operands:[cell(node.callee.object)],signature:node.args.length===0,domain:'Image'});
        else if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Member'&&node.callee.name==='toString')derived.push({result:current,type:'String',operands:[cell(node.callee.object)],signature:node.args.length===0,domain:'Number'});
        else if(node.type==='Unary'&&['+','-','~'].includes(node.op))derived.push({result:current,type:'Number',operands:[cell(node.argument)],signature:true,domain:'Number'});
        else if(node.type==='Binary'&&['+','-','*','/','%','&','|','^','<<','>>','>>>'].includes(node.op))derived.push({result:current,type:'Number',operands:[cell(node.left),cell(node.right)],signature:true,domain:'Number',stringConcat:node.op==='+'});
        else if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Identifier')calls.push({node,callee:binding(owner,node.callee.name),result:current});
        else if(['Conditional','Logical'].includes(node.type)){edge(cell(node.consequent||node.left),current);edge(cell(node.alternate||node.right),current);}
        else if(node.type==='Member'&&['width','height'].includes(node.name))edges.push([cell(node.object),current,'imageDimension',node.name]);
        else if(node.type==='Member'&&fields.has(node.name))edges.push([cell(node.object),current,'field',node.name]);
        else if(['Undefined','Null','String','Number','Boolean'].includes(node.type))add(current,node.type);
        else if(node.type==='Call'&&sdk.has(node.callee)&&path(node.callee)==='game.askForString')add(current,'String');
        else add(current,'Opaque');
    };
    const collectPrints=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collectPrints);return;}if(node.type==='Call'&&node.callee?.type==='Member'&&['print','printCenter'].includes(node.callee.name)){const center=node.callee.name==='printCenter',fontIndex=center?3:4;if(node.args.length>fontIndex)prints.push({node,center,fontIndex});}Object.values(node).forEach(value=>{if(value&&typeof value==='object')collectPrints(value);});};
    visit(program,global);collectPrints(program);
    function entry(node,known=new Set()){
        if(!node||typeof node!=='object')return known;
        if(Array.isArray(node)){for(const value of node)known=entry(value,known);return known;}
        const owner=owners.get(node)||global;
        if(node.type==='Identifier'){if(!writing.has(node)&&!(node.name==='screen'&&sdk.has(node))&&!known.has(binding(owner,node.name)))add(cell(node),'Undefined');return known;}
        if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'){const entryOwner=node.type==='FunctionDeclaration'?functions.get(binding(owner,node.name))?.owner:null;const first=node.body?.[0],methodOwner=entryOwner||owners.get(first);entry(node.body,new Set((node.params||[]).map(name=>binding(methodOwner||owner,name))));return known;}
        if(node.type==='Class'){for(const field of node.fields||[])entry(field.init,new Set());for(const method of [node.ctor,...(node.methods||[])].filter(Boolean)){const methodOwner=owners.get(method.body?.[0])||owner;entry(method.body,new Set((method.params||[]).map(name=>binding(methodOwner,name))));}return known;}
        if(node.type==='Declaration'){for(const decl of node.decls){known=entry(decl.init,known);if(decl.init)known=new Set([...known,binding(owner,decl.name)]);}return known;}
        if(node.type==='Assignment'){known=entry(node.right,known);if(node.left?.type==='Identifier'&&node.op==='=')known=new Set([...known,binding(owners.get(node.left),node.left.name)]);else known=entry(node.left,known);return known;}
        if(node.type==='Conditional'){known=entry(node.test,known);const left=entry(node.consequent,new Set(known)),right=entry(node.alternate,new Set(known));return new Set([...left].filter(value=>right.has(value)));}
        if(node.type==='Logical'||node.type==='Binary'&&['&&','||','??'].includes(node.op)){known=entry(node.left,known);entry(node.right,new Set(known));return known;}
        if(node.type==='If'){known=entry(node.test,known);const left=entry(node.consequent,new Set(known)),right=entry(node.alternate,new Set(known));return new Set([...left].filter(value=>right.has(value)));}
        if(['For','ForOf','While'].includes(node.type)){known=entry(node.init,known);entry(node.test,known);entry(node.iterable,known);const inside=entry(node.body,new Set(known));entry(node.update,inside);return known;}
        for(const value of Object.values(node))if(value&&typeof value==='object')known=entry(value,known);return known;
    }
    entry(program);
    for(const call of classCalls)add(call.value,classes.get(call.name)===1&&declarations.get(call.name)?.size===1&&!classWrites.has(call.name)?'ClassInstance':'Opaque');
    const resultFunctions=new Map([...functions].filter(([,fn])=>fn).map(([name,fn])=>[fn.result,name])),callGraph=new Map();
    for(const call of calls){let owner=owners.get(call.node);while(owner&&!owner.result)owner=owner.parent;const origin=resultFunctions.get(owner?.result);if(origin){if(!callGraph.has(origin))callGraph.set(origin,new Set());callGraph.get(origin).add(call.callee);}}
    const cyclic=(origin,current=origin,seen=new Set())=>{if(seen.has(current))return false;seen.add(current);for(const next of callGraph.get(current)||[])if(next===origin||cyclic(origin,next,seen))return true;return false;};
    for(const call of calls){const fn=functions.get(call.callee);if(!fn){add(call.result,'Opaque');continue;}if(cyclic(call.callee))add(call.result,'Opaque');
        fn.node.params.forEach((name,index)=>{const arg=call.node.args[index],param=fn.owner.bindings.get(name);if(arg)edge(cell(arg),param);else add(param,'Undefined');});edge(fn.result,call.result);
    }
    const isFont=current=>{const set=types.get(current);return !!set?.has('Font')&&set.size===1;};
    const exactType=(value,type)=>types.get(value)?.size===1&&types.get(value).has(type);
    const primitiveTypes=new Set(['String','Number','Boolean','Null','Undefined']);
    const stringConcat=item=>item.stringConcat&&item.operands.some(value=>exactType(value,'String'))&&item.operands.every(value=>types.get(value)?.size&&[...types.get(value)].every(type=>primitiveTypes.has(type)));
    const numericOperand=value=>types.get(value)?.size&&[...types.get(value)].every(type=>type==='Number'||type==='Undefined');
    const derivedValid=item=>item.signature&&(stringConcat(item)||item.operands.every(operand=>item.domain==='Number'&&item.type==='Number'?numericOperand(operand):exactType(operand,item.domain)));
    const propagate=()=>{let changed;do{changed=false;
        for(const[from,to,mode,name]of edges){if(mode==='imageDimension'){if(exactType(from,'Image'))changed=add(to,'Number')||changed;else if(types.get(from)?.size)changed=add(to,'Opaque')||changed;}else if(mode==='field'){if(isFont(from)){changed=add(to,name==='data'?'GlyphBuffer':'Number')||changed;if(name==='multiplier')changed=add(to,'Undefined')||changed;}else if(types.get(from)?.size)changed=add(to,'Opaque')||changed;}else for(const type of types.get(from)||[])changed=add(to,type)||changed;}
        for(const item of derived)if(derivedValid(item))changed=add(item.result,stringConcat(item)?'String':item.type)||changed;
        for(const item of scales)if(isFont(item.receiver))changed=add(item.result,'Font')||changed;
        for(const item of texts)if(types.get(item.argument)?.size===1 && types.get(item.argument).has('String'))changed=add(item.result,'Font')||changed;
    }while(changed);};propagate();
    let invalidated;do{invalidated=false;for(const item of derived)if(!derivedValid(item))invalidated=add(item.result,'Opaque')||invalidated;propagate();}while(invalidated);
    for(const item of scales){if(!isFont(item.receiver))fail('SDK scaledFont requires a proven current Font producer');const size=types.get(cell(item.node.args[1]));if(size?.size!==1 || !size.has('Number'))fail('SDK scaledFont size requires a proven Number producer');}
    for(const item of texts)if(types.get(item.argument)?.size!==1 || !types.get(item.argument).has('String'))fail('SDK Font selection requires a proven actual String producer');
    for(const {node,center,fontIndex}of prints){if(types.get(cell(node.callee.object))?.size===1&&types.get(cell(node.callee.object)).has('ClassInstance'))continue;if(!types.get(cell(node.callee.object))?.has('Image')&&!types.get(cell(node.args[fontIndex]))?.has('Font'))continue;const exact=(value,type)=>types.get(cell(value))?.size===1&&types.get(cell(value)).has(type);if(node.isNew||node.args.length!==fontIndex+1)fail('SDK Font print requires its exact selected signature');if(!exact(node.callee.object,'Image'))fail('SDK Font print IMAGE requires a proven actual Image producer');if(!exact(node.args[0],'String'))fail('SDK Font print TEXT requires a proven actual String producer');if(!exact(node.args[fontIndex],'Font'))fail('SDK Font print FONT requires a proven actual Font producer');for(const [index,name]of center?[[1,'Y'],[2,'COLOR']]:[[1,'X'],[2,'Y'],[3,'COLOR']])if(!exact(node.args[index],'Number'))fail('SDK Font print '+name+' requires a proven actual Number producer');}
    const fontAnnotations=new Set();const collectScope=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collectScope);return;}const owner=owners.get(node);for(let s=owner;s;s=s.parent)for(const value of s.fontAnnotations||[])fontAnnotations.add(value);Object.values(node).forEach(value=>{if(value&&typeof value==='object')collectScope(value);});};collectScope(program);
    const rewrite=(node,target=false)=>{
        if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(value=>rewrite(value,target));
        const numberText=lowerNumberTextValue(node,value=>types.get(cell(value)));
        if(numberText?.unsupported)fail(numberText.unsupported);
        if(numberText?.value)return {...numberText.value,left:rewrite(numberText.value.left)};
        if(node.type==='Member'&&fields.has(node.name)&&(types.get(cell(node.object))?.has('Font')||fontAnnotations.has(cell(node.object)))){
            if(!isFont(cell(node.object))){fail('SDK Font field requires proven actual producer authority');return node;}
            if(target){fail('SDK Font field mutation is not qualified by the read slice');return node;}
            // Keep the existing editable metric selectors for direct SDK constants.
            // Aliases and scaled records still read their actual live Font object.
            if(['charWidth','charHeight'].includes(node.name) && sdk.has(node.object) &&
                ['image.font5','image.font8','image.font12'].includes(path(node.object)))
                return {type:'FontMetric',font:node.object.name,property:node.name};
            return intrinsic('field',[rewrite(node.object),{type:'String',value:node.name}],fields.get(node.name));
        }
        if(node.type==='Call'&&node.callee?.type==='Member'&&types.get(cell(node.callee.object))?.has('GlyphBuffer')&&['setNumber','setByte','write','fill','shift','rotate','packAt'].includes(node.callee.name))fail('SDK Font glyph Buffer mutation is not qualified by the read slice');
        if(node.type==='Member'&&sdk.has(node)&&['image.font5','image.font8','image.font12'].includes(path(node)))return intrinsic('constant',[{type:'String',value:node.name}],'image.Font');
        if(node.type==='Call'&&sdk.has(node.callee)&&['image.getFontForText','image.scaledFont'].includes(path(node.callee))){
            const name=node.callee.name;if(node.isNew||node.args.length!==(name==='scaledFont'?2:1))fail('SDK Font factory requires its exact selected signature');
            return intrinsic(name,node.args.map(arg=>rewrite(arg)),'image.Font');
        }
        if(node.type==='Assignment')return {...node,left:rewrite(node.left,true),right:rewrite(node.right)};
        if(node.type==='Update')return {...node,argument:rewrite(node.argument,true)};
        const result=Object.fromEntries(Object.entries(node).map(([name,value])=>[name,value&&typeof value==='object'?rewrite(value,target):value]));
        if(node.type==='Declaration')result.decls=result.decls.map(decl=>({...decl,...(isFont(binding(owners.get(node),decl.name))?{bwFontProducer:true}:{})}));
        if(isFont(cell(node)))result.bwFontValue=true;
        return result;
    };
    return {program:rewrite(program),unsupported};
}
