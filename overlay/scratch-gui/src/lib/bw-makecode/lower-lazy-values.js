/** Lower lazy value expressions to editable statements before type inference.
 * Each result is a hygienic invocation cell. Snapshot earlier operands before
 * a later operand's statements run, preserving JavaScript's evaluation order.
 */
export function lowerLazyValues(program) {
    const names=new Set();
    const scan=node=>{
        if(!node || typeof node!=='object')return;
        if(typeof node.name==='string')names.add(node.name);
        if(node.params)for(const name of node.params)names.add(name);
        for(const value of Object.values(node))if(Array.isArray(value))value.forEach(scan);else scan(value);
    };
    scan(program);let counter=0,changed=false;
    const fresh=()=>{let name;do{name=`__bwValue${++counter}`;}while(names.has(name));names.add(name);return name;};
    const id=name=>({type:'Identifier',name,temporary:true});
    const declaration=(name,init)=>({type:'Declaration',kind:'let',decls:[{name,init,temporary:true,valuePreserving:true}]});
    const assign=(name,value)=>({type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:id(name),right:value,valuePreserving:true}});
    const save=(value,prefix)=>{const name=fresh();prefix.push(declaration(name,value));return id(name);};
    const namespaces=new Set(['Math','sprites','SpriteKind','SpriteFlag','controller','info','scene','game','image','assets','animation','effects','music','control','loops','console','screen']);
    const namespace=node=>node?.type==='Identifier'?namespaces.has(node.name):node?.type==='Member' && namespace(node.object);
    // A compound target is evaluated before its right operand. Calls can
    // mutate the receiver, index or old value even when neither side is lazy.
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
    // Expression lists (call arguments, array elements, binary operands, etc.)
    // are evaluated from left to right. An earlier read/call must happen before
    // any lifted statements belonging to a later sibling.
    const sequence=nodes=>{
        const prefix=[],values=[];
        for(const node of nodes){
            const next=expression(node);
            if(next.prefix.length)for(let i=0;i<values.length;i++){
                if(!values[i]?.temporary && values[i]?.type!=='FunctionExpression')values[i]=save(values[i],prefix);
            }
            prefix.push(...next.prefix);values.push(next.value);
        }
        return {prefix,values};
    };
    const lvalue=node=>{
        if(node?.type==='Identifier')return {prefix:[],value:node};
        if(node?.type==='Member'){
            const result=expression(node.object),prefix=[...result.prefix];
            return {prefix,value:{...node,object:save(result.value,prefix)}};
        }
        if(node?.type==='Index'){
            const result=sequence([node.object,node.index]),prefix=[...result.prefix];
            return {prefix,value:{...node,object:save(result.values[0],prefix),index:save(result.values[1],prefix)}};
        }
        return {prefix:[],value:node};
    };
    function expression(node) {
        if(!node)return {prefix:[],value:node};
        if(node.type==='FunctionExpression')return {prefix:[],value:{...node,body:body(node.body)}};
        if(node.type==='Update' && ['Identifier','Member','Index'].includes(node.argument?.type)) {
            changed=true;
            const target=lvalue(node.argument),prefix=[...target.prefix];
            const previous=save({type:'Unary',op:'+',argument:target.value},prefix);
            const next=save({type:'Binary',op:node.op==='++'?'+':'-',left:previous,right:{type:'Number',value:'1'}},prefix);
            prefix.push({type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:target.value,right:next,valuePreserving:true}});
            return {prefix,value:node.prefix?next:previous};
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
            const result=sequence(node.items);return {prefix:result.prefix,value:{...node,items:result.values}};
        }
        if(node.type==='Index'){
            const result=sequence([node.object,node.index]);return {prefix:result.prefix,value:{...node,object:result.values[0],index:result.values[1]}};
        }
        if(['LegacyParsedValue','LegacyJsonValue','NativeArrayAccess'].includes(node.type)){const result=expression(node.value);return {prefix:result.prefix,value:{...node,value:result.value}};}
        if(node.type==='Unary' || node.type==='Member'){
            const key=node.type==='Unary'?'argument':'object',result=expression(node[key]);
            return {prefix:result.prefix,value:{...node,[key]:result.value}};
        }
        if(node.type==='Call'){
            const method=node.callee?.type==='Member' && !namespace(node.callee.object);
            const result=sequence(method?[node.callee.object,...node.args]:node.args);
            return {prefix:result.prefix,value:{...node,callee:method?{...node.callee,object:result.values[0]}:node.callee,args:method?result.values.slice(1):result.values}};
        }
        return {prefix:[],value:node};
    }
    function statement(st) {
        if(st.type==='FunctionDeclaration')return [{...st,body:body(st.body)}];
        if(st.type==='Block' || st.type==='Namespace')return [{...st,body:body(st.body)}];
        if(st.type==='Declaration')return st.decls.flatMap(decl=>{
            const result=expression(decl.init);return [...result.prefix,{...st,decls:[{...decl,init:result.value}]}];
        });
        if(st.type==='Return'){
            const result=expression(st.value);return [...result.prefix,{...st,value:result.value}];
        }
        if(st.type==='If'){
            const result=expression(st.test);return [...result.prefix,{...st,test:result.value,consequent:body(st.consequent),alternate:body(st.alternate)}];
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
                const left=expression(st.expr.left),result=expression(st.expr.right);
                const referenceTarget=['Member','Index'].includes(st.expr.left?.type);
                const snapshot=referenceTarget && (hasEffects(st.expr.left) || hasEffects(st.expr.right));
                if(!left.prefix.length && !result.prefix.length && !snapshot)return [{...st,expr:{...st.expr,left:left.value,right:result.value}}];
                changed=true;
                const target=lvalue(left.value),prefix=[...left.prefix,...target.prefix];let value=result.value;
                if(st.expr.op!=='='){
                    const previous=save(target.value,prefix);
                    value={type:'Binary',op:st.expr.op.slice(0,-1),left:previous,right:value};
                }
                return [...prefix,...result.prefix,{...st,expr:{...st.expr,op:'=',left:target.value,right:value}}];
            }
            if(st.expr?.type==='Update' && ['Member','Index'].includes(st.expr.argument?.type)){
                changed=true;
                const target=lvalue(st.expr.argument),prefix=[...target.prefix];
                const previous=save({type:'Unary',op:'+',argument:target.value},prefix);
                return [...prefix,{...st,expr:{type:'Assignment',op:'=',left:target.value,
                    right:{type:'Binary',op:st.expr.op==='++'?'+':'-',left:previous,right:{type:'Number',value:'1'}}}}];
            }
            // Standalone identifier updates already have editable statement
            // blocks; only consumed update results need invocation cells.
            if(st.expr?.type==='Update')return [st];
            const result=expression(st.expr);return [...result.prefix,{...st,expr:result.value}];
        }
        return [st];
    }
    const statements=body(program.body);
    return changed?{...program,body:statements,loweredLazyValues:true}:program;
}
