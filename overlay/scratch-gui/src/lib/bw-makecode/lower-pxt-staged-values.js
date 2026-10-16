import {analyseSourceValueProducers} from './source-value-producers.js';
import {fixedControllerRepeatReceiver} from './controller-repeat-source.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

/** Preserve selected PXT 13.2.1 expression staging for imported Arcade source.
 * Ordinary IR reads and calls stay deferred while conditional/short-circuit
 * statements are emitted. Array pushes and constructors are emitted eagerly.
 * This pass runs before class lowering; authored BrickWright Code does not use it.
 * Source: microsoft/pxt v13.2.1 pxtcompiler/emitter/emitter.ts (MIT).
 * The original selected worker execution remains the semantic authority.
 */
export function lowerPxtStagedValues(program, {isStaticResource = () => false, isArrayQuery = () => false, lowerArrayMap = () => null, lowerIntegerDivision = () => null, onlySelected = null} = {}) {
    const names=new Set();
    const scan=node=>{
        if(!node || typeof node!=='object')return;
        if(typeof node.name==='string')names.add(node.name);
        if(node.params)for(const name of node.params)names.add(name);
        for(const value of Object.values(node))if(Array.isArray(value))value.forEach(scan);else scan(value);
    };
    // Identity/position facts only. These never grant Array element/value types.
    // Keep unsupported scopes and every non-statement expression on the old path.
    const directEmptyStatements=new WeakSet();let currentEmptyStatementProof=()=>false;
    const prepareDirectEmptyStatements=()=>{
        const knownSyntax=new Set(['Program','Declaration','FunctionDeclaration','FunctionExpression','Block','If','While','For','ExpressionStatement','Return','Break','Continue','Array','Object','Identifier','Number','String','Template','Boolean','Null','Undefined','Binary','Logical','Unary','Update','Assignment','Member','Index','Call','Conditional','LegacyParsedValue','LegacyJsonValue','NativeArrayAccess']);
        const occurrences=new Map(),nodes=[],statements=new Set(),bodyLists=new Set(),active=new Set(),physical=[];let closed=true;
        const visit=(value,parent=null,key=null)=>{
            if(!value||typeof value!=='object')return;
            occurrences.set(value,(occurrences.get(value)||0)+1);if(active.has(value)){closed=false;return;}
            const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==Array.prototype){closed=false;return;}
            physical.push({value,proto,keys:Reflect.ownKeys(value),descriptors:Object.getOwnPropertyDescriptors(value)});
            active.add(value);
            if(!Array.isArray(value)){
                nodes.push(value);
                const type=Object.getOwnPropertyDescriptor(value,'type')?.value;
                if(Object.hasOwn(value,'type')&&!knownSyntax.has(type))closed=false;
                if(['Unknown','Class','Namespace','Enum','ForOf','Switch','Try','Catch','ThrowStatement'].includes(type)||type==='Declaration'&&Object.getOwnPropertyDescriptor(value,'kind')?.value==='var')closed=false;
                if(parent&&bodyLists.has(parent))statements.add(value);
            }
            for(const own of Reflect.ownKeys(value)){
                const descriptor=Object.getOwnPropertyDescriptor(value,own);
                if(typeof own!=='string'||!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable&&!(Array.isArray(value)&&own==='length')){closed=false;continue;}
                const child=descriptor.value;
                // Only actual body statement lists qualify, never for.init,
                // originalBody metadata, conditions, expressions or class fields.
                const bodyList=!Array.isArray(value)&&(['Program','FunctionDeclaration','FunctionExpression','Block','While','For'].includes(Object.getOwnPropertyDescriptor(value,'type')?.value)&&own==='body'||Object.getOwnPropertyDescriptor(value,'type')?.value==='If'&&['consequent','alternate'].includes(own));
                if(Array.isArray(child)&&bodyList)bodyLists.add(child);
                if(typeof child==='function'||typeof child==='symbol')closed=false;
                visit(child,value,own);
            }
            active.delete(value);
        };
        visit(program);if(!closed)return;
        const unique=node=>!!node&&occurrences.get(node)===1;
        const plainEmpty=node=>{
            if(!unique(node)||node.type!=='Array'||!Array.isArray(node.items)||!unique(node.items)||node.items.length!==0||Reflect.ownKeys(node.items).length!==1)return false;
            return Reflect.ownKeys(node).every(key=>['type','items','parenthesized'].includes(key))&&(!Object.hasOwn(node,'parenthesized')||typeof node.parenthesized==='boolean');
        };
        const protocol=node=>Object.keys(node||{}).some(key=>key.startsWith('bw')||['temporary','valuePreserving','whenUsed'].includes(key));
        const graph=analyseSourceValueProducers(program,{arrayValues:true,parenthesized:true,unboundIsOpaque:true}),declarations=new Map();
        for(const st of nodes)if(st.type==='Declaration')for(const decl of st.decls||[]){const binding=graph.bindingOf(st,decl.name);if(binding){if(!declarations.has(binding))declarations.set(binding,[]);declarations.get(binding).push({st,decl});}}
        const bindingAt=(node,name)=>{
            const binding=graph.bindingOf(node,name),kinds=graph.bindingKindsAt(node,name);
            if(!binding||graph.declarationCountAt(node,name)!==1||kinds.size!==1)return null;
            return {binding,kind:[...kinds][0],records:declarations.get(binding)||[]};
        };
        for(const st of statements){
            if(!unique(st)||protocol(st))continue;
            if(st.type==='Declaration'&&['let','const'].includes(st.kind)&&st.decls?.length===1){
                const decl=st.decls[0],proof=bindingAt(st,decl.name);
                if(unique(decl)&&typeof decl.name==='string'&&!protocol(decl)&&plainEmpty(decl.init)&&proof?.kind==='variable'&&proof.records.length===1&&proof.records[0].st===st&&proof.records[0].decl===decl)directEmptyStatements.add(st);
            }
            if(st.type==='ExpressionStatement'&&st.expr?.type==='Assignment'&&st.expr.op==='='&&st.expr.left?.type==='Identifier'){
                const expr=st.expr,proof=bindingAt(expr.left,expr.left.name);
                if(unique(expr)&&unique(expr.left)&&!protocol(expr)&&!protocol(expr.left)&&plainEmpty(expr.right)&&proof&&(proof.kind==='parameter'||proof.kind==='variable'&&proof.records.length===1&&proof.records[0].st.kind==='let'))directEmptyStatements.add(st);
            }
        }
        // Lowering callbacks may edit the original tree. A previous binding or
        // literal census cannot authorize a different current AST occurrence.
        currentEmptyStatementProof=()=>physical.every(row=>{
            const now=Reflect.ownKeys(row.value);if(Object.getPrototypeOf(row.value)!==row.proto||now.length!==row.keys.length||now.some((key,i)=>key!==row.keys[i]))return false;
            return row.keys.every(key=>{const before=row.descriptors[key],after=Object.getOwnPropertyDescriptor(row.value,key);return after&&Object.hasOwn(after,'value')&&Object.is(before.value,after.value)&&before.enumerable===after.enumerable&&before.configurable===after.configurable&&before.writable===after.writable;});
        });
    };
    const directEmpty=st=>directEmptyStatements.has(st)&&currentEmptyStatementProof();
    // A failed/malformed lexical census cannot authorize the shortcut. Existing
    // lowering and its diagnostics remain the authority for all refused cases.
    try{prepareDirectEmptyStatements();}catch(_){/* keep existing staging */}
    // Only source-global whenUsed declarations participate in the selected
    // compiler's reachability. Keep their emitted effects in the same group.
    const globalWhenUsed=new Set(program.body.filter(node=>node.type==='Declaration')
        .flatMap(node=>node.decls.filter(decl=>decl.whenUsed)));
    scan(program);let counter=0,changed=false;
    const fresh=()=>{let name;do{name=`__bwPxtValue${++counter}`;}while(names.has(name));names.add(name);return name;};
    const id=name=>({type:'Identifier',name,temporary:true});
    const declaration=(name,init)=>({type:'Declaration',kind:'let',decls:[{name,init,temporary:true,valuePreserving:true}]});
    const assign=(name,value)=>({type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:id(name),right:value,valuePreserving:true}});
    const save=(value,prefix)=>{const name=fresh();prefix.push(declaration(name,value));return id(name);};
    const namespaces=staticSdkNamespaceReceivers(program);
    const namespace=node=>namespaces.has(node);
    // Selected PXT keeps ordinary target reads deferred while a lazy RHS emits
    // its statements; complex indexes can also be read twice. Calls can mutate
    // the receiver, index or old value. Preserve this measured staging instead
    // of applying ordinary JavaScript compound-assignment sequencing here.
    const hasEffects=node=>{
        if(!node || typeof node!=='object' || node.type==='FunctionExpression')return false;
        if(node.type==='Call'){
            // Built-in numeric functions cannot reassign a project reference.
            // Their arguments can still contain calls that do.
            const numeric=node.callee?.type==='Member' && node.callee.object?.type==='Identifier' && node.callee.object.name==='Math' ||
                node.callee?.type==='Identifier' && node.callee.name==='randint';
            return !numeric || node.args.some(hasEffects);
        }
        if(['Update','Assignment'].includes(node.type))return true;
        return Object.values(node).some(value=>Array.isArray(value)?value.some(hasEffects):hasEffects(value));
    };
    const body=statements=>(statements||[]).flatMap(statement);
    // Visit operands in source order, but retain ordinary IR until all eagerly
    // emitted sibling statements finish. Earlier aggregate construction is an
    // emitted operation and must finish before later sibling staging.
    const selected=new WeakMap();
    const containsSelected=node=>{
        if(!onlySelected||!node||typeof node!=='object')return !onlySelected;
        if(selected.has(node))return selected.get(node);
        const result=onlySelected(node)||Object.values(node).some(value=>Array.isArray(value)?value.some(containsSelected):containsSelected(value));selected.set(node,result);return result;
    };
    const sequence=nodes=>{
        const prefix=[],values=[];
        for(const node of nodes){
            const next=expression(node);
            if(next.prefix.length)for(let i=0;i<values.length;i++){
                if(!values[i]?.temporary && (next.prefix.some(statement=>statement.bwMapOrdered===true || statement.bwOrderedValuePrefix===true) || ['Array','New','Object'].includes(values[i]?.type)))values[i]=save(values[i],prefix);
            }
            prefix.push(...next.prefix);values.push(next.value);
        }
        return {prefix,values};
    };
    const lvalue=(node, repeatIndex=false)=>{
        if(node?.type==='Identifier')return {prefix:[],value:node};
        if(node?.type==='Member'){
            if(namespace(node.object) && fixedControllerRepeatReceiver(node))return {prefix:[],value:node};
            const result=expression(node.object),prefix=[...result.prefix];
            return {prefix,value:{...node,object:save(result.value,prefix)}};
        }
        if(node?.type==='Index'){
            const result=sequence([node.object,node.index]),prefix=[...result.prefix];
            return {prefix,value:{...node,object:save(result.values[0],prefix),index:repeatIndex?result.values[1]:save(result.values[1],prefix)}};
        }
        return {prefix:[],value:node};
    };
    function expression(node, directStatement = null) {
        if(!node || onlySelected&&!containsSelected(node))return {prefix:[],value:node};
        const divided=lowerIntegerDivision(node,{expression,save});if(divided){changed=true;return divided;}
        const mapped=lowerArrayMap(node,{expression,body});if(mapped){changed=true;return mapped;}
        if(fixedControllerRepeatReceiver(node) && namespace(node.object))return {prefix:[],value:node};
        // Fully decoded SDK resource factories are compile-time values. Keep
        // their literal aggregate representation for resource lowering instead
        // of turning its private tile list into an unrelated runtime array.
        // The caller must validate the complete factory, and lexical namespace
        // resolution prevents a user method from gaining this treatment.
        if(node.type==='Call' && namespace(node.callee?.object) && isStaticResource(node))return {prefix:[],value:node};
        if(node.type==='FunctionExpression')return {prefix:[],value:{...node,body:body(node.body),...(node.originalBody?{originalBody:body(node.originalBody)}:{})}};
        if(node.type==='Update' && ['Identifier','Member','Index'].includes(node.argument?.type)) {
            changed=true;
            const target=lvalue(node.argument,true),prefix=[...target.prefix];
            const previous=save({type:'Unary',op:'+',argument:target.value},prefix);
            const next=save({type:'Binary',op:node.op==='++'?'+':'-',left:previous,right:{type:'Number',value:'1'}},prefix);
            prefix.push({type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:target.value,right:next,valuePreserving:true,bwPxtSourceUpdate:node.op}});
            return {prefix,value:node.prefix?next:previous};
        }

        if(node.type==='Assignment' && node.op==='='){
            changed=true;
            const left=expression(node.left),right=expression(node.right);
            const target=lvalue(left.value),prefix=[...left.prefix,...right.prefix,...target.prefix];
            const value=save(right.value,prefix);
            prefix.push({type:'ExpressionStatement',expr:{...node,left:target.value,right:value}});
            return {prefix,value};
        }
        if(node.type==='Binary' && ['&&','||'].includes(node.op)){
            changed=true;const left=expression(node.left),prefix=[...left.prefix],result=save(left.value,prefix);
            const right=expression(node.right);
            prefix.push({type:'If',test:node.op==='&&'?result:{type:'Unary',op:'!',argument:result},
                consequent:[...right.prefix,assign(result.name,right.value)],alternate:[]});
            return {prefix,value:result};
        }
        if(node.type==='Conditional'){
            changed=true;const test=expression(node.test),yes=expression(node.consequent),no=expression(node.alternate);
            const name=fresh();return {prefix:[...test.prefix,declaration(name,{type:'Undefined'}),
                {type:'If',test:test.value,consequent:[...yes.prefix,assign(name,yes.value)],alternate:[...no.prefix,assign(name,no.value)]}],value:id(name)};
        }
        if(node.type==='Binary'){
            const result=sequence([node.left,node.right]);return {prefix:result.prefix,value:{...node,left:result.values[0],right:result.values[1]}};
        }
        if(node.type==='Array'){
            if(typeof node.bwAnimationResourceId==='string' && node.bwAnimationResourceId) {
                // Native animation import replaces this whole literal with an
                // authored resource factory. Its payload remains in the asset
                // companion; staging must evaluate that complete factory once,
                // rather than append the original literal frames to its result.
                changed=true;
                const prefix=[];
                return {prefix,value:save({...node},prefix)};
            }
            // Keep every existing value-lowering hook/resource protocol above.
            // Only the allocation transport is omitted, at this exact current
            // statement/literal position after callback currentness is checked.
            if(directStatement&&directEmpty(directStatement))return {prefix:[],value:node};
            const items=node.items.map(expression);
            changed=true;
            const prefix=[],array=save({...node,items:[]},prefix);
            const imageGroup=node.items.length>=2 && node.items.every(item=>item?.type==='Template' && item.tag==='img');
            // Scalars only: preserve the source-site artwork relationship without
            // adding AST children, skipping evaluation or sharing runtime images.
            if(imageGroup)prefix[0].decls[0].init.bwImageArrayGroup=array.name;
            for(const [index,item] of items.entries()) {
                const value=imageGroup?{...item.value,bwImageArrayGroup:array.name,bwImageArrayIndex:index,bwImageArrayCount:items.length}:item.value;
                prefix.push(...item.prefix,{type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Member',object:array,name:'push'},args:[value]}});
            }
            return {prefix,value:array};
        }
        if(node.type==='Call' && node.isNew){
            changed=true;
            const result=sequence(node.args || []),prefix=[...result.prefix];
            return {prefix,value:save({...node,args:result.values},prefix)};
        }
        if(node.type==='Index'){
            const result=sequence([node.object,node.index]);return {prefix:result.prefix,value:{...node,object:result.values[0],index:result.values[1]}};
        }
        if(['LegacyParsedValue','LegacyJsonValue','NativeArrayAccess'].includes(node.type)){const result=expression(node.value);return {prefix:result.prefix,value:{...node,value:result.value}};}
        if(node.type==='Unary' || node.type==='Member'){
            const key=node.type==='Unary'?'argument':'object',result=expression(node[key]);
            return {prefix:result.prefix,value:{...node,[key]:result.value}};
        }
        // A qualified zero-argument declaration invocation carries an ordered
        // argument syntax container, not an allocated source Array.
        if(node.type==='Call' && node.bwCallableIntrinsic==='invoke' && node.args?.length===2 &&
            node.args[1]?.type==='Array' && node.args[1].items.length===0) {
            const receiver=expression(node.args[0]);
            return {prefix:receiver.prefix,value:{...node,args:[receiver.value,node.args[1]]}};
        }
        if(node.type==='Call'){
            const method=node.callee?.type==='Member' && !namespace(node.callee.object);
            const dynamic=!method && node.callee?.type!=='Identifier' && !namespace(node.callee?.object);
            const result=sequence(method?[node.callee.object,...node.args]:dynamic?[node.callee,...node.args]:node.args);
            if(method && isArrayQuery(node)) {
                // The portable array query word presents its needle before its
                // receiver. Snapshot selected-PXT ordinary operand evaluation
                // after the existing eager staging, so field order cannot
                // reorder calls or observe a receiver reassigned by the needle.
                changed=true;
                const prefix=[...result.prefix],values=result.values.map(value=>save(value,prefix));
                return {prefix,value:{...node,callee:{...node.callee,object:values[0]},args:values.slice(1)}};
            }
            return {prefix:result.prefix,value:{...node,callee:method?{...node.callee,object:result.values[0]}:dynamic?result.values[0]:node.callee,args:method || dynamic?result.values.slice(1):result.values}};
        }
        return {prefix:[],value:node};
    }
    function statement(st) {
        if(onlySelected&&!containsSelected(st))return [st];
        if(st.type==='Class')return [{...st,fields:st.fields.map(field=>{if(!field.init)return field;const result=expression(field.init);return {...field,pxtStagingPrefix:result.prefix,pxtStagedInit:result.value};}),ctor:st.ctor?{...st.ctor,body:body(st.ctor.body),...(st.ctor.originalBody?{originalBody:body(st.ctor.originalBody)}:{})}:null,methods:st.methods.map(method=>({...method,body:body(method.body),...(method.originalBody?{originalBody:body(method.originalBody)}:{})}))}];
        if(st.type==='FunctionDeclaration')return [{...st,body:body(st.body),...(st.originalBody?{originalBody:body(st.originalBody)}:{})}];
        if(st.type==='Block' || st.type==='Namespace')return [{...st,body:body(st.body),...(st.originalBody?{originalBody:body(st.originalBody)}:{})}];
        if(st.type==='Declaration')return st.decls.flatMap(decl=>{
            const result=expression(decl.init,st);
            if(globalWhenUsed.has(decl) && result.prefix.length){
                const group=fresh();
                return [...result.prefix.map(node=>({...node,bwPxtWhenUsedGroup:group})),
                    {...st,decls:[{...decl,init:result.value,bwPxtWhenUsedGroup:group}]}];
            }
            return [...result.prefix,{...st,decls:[{...decl,init:result.value}]}];
        });
        if(st.type==='ThrowStatement'){
            const result=expression(st.argument);return [...result.prefix,{...st,argument:result.value}];
        }
        if(st.type==='Return'){
            const result=expression(st.value);return [...result.prefix,{...st,value:result.value}];
        }
        if(st.type==='If'){
            const result=expression(st.test);return [...result.prefix,{...st,test:result.value,consequent:body(st.consequent),alternate:body(st.alternate)}];
        }
        // A switch's case bodies are statements like any other (E10: they were
        // skipped, so `&&`/`||`, `? :` and `i++` in them stayed unlowered). The
        // discriminant is read once, before any label. A label is tested only
        // until one matches, so one whose value needs lines before it is left
        // as written rather than run early.
        if(st.type==='Switch'){
            const discriminant=expression(st.discriminant);
            const cases=st.cases.map(c=>{
                const test=c.test?expression(c.test):null;
                return {...c,test:test && !test.prefix.length?test.value:c.test,body:body(c.body)};
            });
            return [...discriminant.prefix,{...st,discriminant:discriminant.value,cases}];
        }
        if(st.type==='While' || st.type==='For'){
            const test=expression(st.test),statements=body(st.body);
            const init=st.type==='For' && st.init?statement(st.init):[];
            const update=st.type==='For' && st.update?statement({type:'ExpressionStatement',expr:st.update}):[];
            const liftedFor=st.type==='For' && (init.length!==Number(Boolean(st.init)) || update.length!==Number(Boolean(st.update)));
            if(!test.prefix.length && !liftedFor)return [{...st,init:init[0] || st.init,update:update[0]?.expr || st.update,body:statements}];
            return [{type:'Block',body:[...init,...test.prefix,{type:'While',test:test.value,body:[...statements,...update,...test.prefix]}]}];
        }
        if(st.type==='ExpressionStatement'){
            if(st.expr?.type==='Assignment'){
                const left=expression(st.expr.left),result=expression(st.expr.right,st);
                const referenceTarget=['Member','Index'].includes(st.expr.left?.type);
                const snapshot=referenceTarget && (hasEffects(st.expr.left) || hasEffects(st.expr.right));
                if(!left.prefix.length && !result.prefix.length && !snapshot)return [{...st,expr:{...st.expr,left:left.value,right:result.value}}];
                changed=true;
                const compound=st.expr.op!=='=';
                const target=lvalue(left.value,compound),prefix=compound?[...result.prefix,...left.prefix,...target.prefix]:[...left.prefix,...result.prefix,...target.prefix];let value=result.value;
                if(st.expr.op!=='='){
                    const previous=save(target.value,prefix);
                    value={type:'Binary',op:st.expr.op.slice(0,-1),left:previous,right:value};
                }
                return [...prefix,{...st,expr:{...st.expr,op:'=',left:target.value,right:value}}];
            }
            if(st.expr?.type==='Update' && ['Member','Index'].includes(st.expr.argument?.type)){
                changed=true;
                const target=lvalue(st.expr.argument,true),prefix=[...target.prefix];
                const previous=save({type:'Unary',op:'+',argument:target.value},prefix);
                return [...prefix,{...st,expr:{type:'Assignment',op:'=',left:target.value,
                    right:{type:'Binary',op:st.expr.op==='++'?'+':'-',left:previous,right:{type:'Number',value:'1'}},bwPxtSourceUpdate:st.expr.op}}];
            }
            // Standalone identifier updates already have editable statement
            // blocks; only consumed update results need invocation cells.
            if(st.expr?.type==='Update')return [st];
            const result=expression(st.expr);return result.discardableMap?result.prefix:[...result.prefix,{...st,expr:result.value}];
        }
        return [st];
    }
    const statements=body(program.body);
    return changed?{...program,body:statements,loweredPxtStaging:true}:program;
}
