import {analyseCallableBindings} from './callable-bindings.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from './generated-helper-recognition.js';

const primitive=new Set(['Number','String','Boolean','Null','Undefined']);
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType',
    'assertedType','ordinaryParameterDefaultNames','bwProcedureConstraintSource']);
const dangerous=new Set(['constructor','prototype','__proto__']);

// Private native-add analysis only. Annotations never seed this graph. Actual
// constructors, aliases, calls, returns and every field writer contribute.
// Unsupported/foreign object effects decline these additional scalar facts.
// The original source is never lowered by this module.
export function nativeClassScalarView(program,profile=GENERATED_HELPER_PROFILES.ordinary) {
    if(!(program.body||[]).some(node=>node?.type==='Class'))return {program,current:()=>true};
    const guard=inspectGeneratedHelperBindings(program,profile);
    if(!guard.isCurrent())return {program,current:guard.isCurrent};
    const lexical=analyseCallableBindings(program),classes=new Map(),methods=new Map(),functions=new Map();
    const values=new Map(),parents=new WeakMap(),classForBinding=new Map(),methodForScope=new Map(),fields=new Map();
    const unknown='Opaque',nodes=[],unsafe=new Set();let changed=false;
    const key=()=>Symbol();
    const add=(cell,type)=>{if(!values.has(cell))values.set(cell,new Set());const set=values.get(cell);if(!set.has(type)){set.add(type);changed=true;}};
    const get=cell=>values.get(cell)||new Set();
    const copy=(from,to)=>{for(const type of get(from))add(to,type);};
    const singleton=(cell,type)=>{add(cell,type);return cell;};
    const cells=new WeakMap(),discards=new WeakMap(),cell=node=>{if(!cells.has(node))cells.set(node,key());return cells.get(node);};
    const discard=node=>{if(!discards.has(node))discards.set(node,key());return discards.get(node);};
    // Object property records have no type and are not visited by the shared
    // callable index. Resolve only their otherwise-unindexed Identifier reads
    // from the nearest already-indexed lexical scope; never from spelling alone.
    const read=node=>{
        if(lexical.references.has(node))return lexical.references.get(node);
        let scope;
        for(let parent=node;parent&&!scope;parent=parents.get(parent))scope=lexical.scopes.get(parent);
        for(;scope;scope=scope.parent)if(scope.names.has(node.name))return scope.names.get(node.name);
        return null;
    };
    const variable=node=>read(node)||cell(node);
    const mark=row=>{if(row&&!unsafe.has(row)){unsafe.add(row);changed=true;}};
    const poison=value=>{for(const type of get(value))if(type?.kind==='instance'||type?.kind==='class')mark(type.row);else if(type?.kind==='function')poisonAll();};
    const poisonAll=()=>{for(const row of classes.values())mark(row);};
    const scan=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)scan(value,parent);return;}
        nodes.push(node);parents.set(node,parent);
        for(const [name,value]of Object.entries(node))if(!metadata.has(name))scan(value,node);
    };
    scan(program);
    const containsThis=node=>node&&typeof node==='object'&&(node.type==='Identifier'&&node.name==='this'||Object.entries(node).some(([name,value])=>!metadata.has(name)&&(Array.isArray(value)?value.some(containsThis):containsThis(value))));
    const complete=body=>(body||[]).some(node=>node.type==='Return'||node.type==='ThrowStatement'||node.type==='Block'&&complete(node.body)||node.type==='If'&&complete(node.consequent)&&complete(node.alternate));
    for(const node of nodes)if(node.type==='Class'){
        const binding=lexical.scopes.get(node)?.names.get(node.name);
        const row={node,binding,instance:{kind:'instance'},constructorValue:{kind:'class'},members:new Map()};
        row.instance.row=row;row.constructorValue.row=row;
        if(!binding||binding.kind!=='class'||binding.node!==node||binding.scope!==lexical.global||classes.has(binding))mark(row);
        classes.set(binding||node,row);classForBinding.set(binding,row);
        if(node.base||node.typeParameters?.length||node.unsupported?.length||binding?.written)mark(row);
        const property=(name,kind,value)=>{
            if(typeof name!=='string'||dangerous.has(name)||['toString','valueOf'].includes(name)){mark(row);return;}
            if(!row.members.has(name))row.members.set(name,{field:key(),get:null,set:null,method:null,declared:false});
            const member=row.members.get(name);
            if(kind==='field'){if(member.declared||member.get||member.set||member.method)mark(row);member.declared=true;fields.set(value,{row,member});}
            else if(member[kind]||member.declared||member.method||kind==='method'&&(member.get||member.set))mark(row);
            else member[kind]=value;
        };
        for(const field of node.fields||[]){if(field.isStatic)mark(row);property(field.name,'field',field);}
        const initialWrites=new Set();
        for(const statement of node.ctor?.body||[]){
            const write=statement.type==='ExpressionStatement'&&statement.expr;
            if(write?.type!=='Assignment'||write.op!=='='||write.left?.type!=='Member'||write.left.object?.type!=='Identifier'||write.left.object.name!=='this'||containsThis(write.right))break;
            initialWrites.add(write.left.name);
        }
        for(const field of node.fields||[]){
            const pair=fields.get(field);
            if(pair&&!field.init&&!initialWrites.has(field.name))add(pair.member.field,'Undefined');
            if(containsThis(field.init))mark(row);
        }

        for(const method of node.methods||[]){if(method.isStatic||method.typeParameters?.length||method.kind==='get'&&method.params.length!==0||method.kind==='set'&&method.params.length!==1)mark(row);property(method.name,method.kind==='get'?'get':method.kind==='set'?'set':'method',method);}
        add(binding,row.constructorValue);
    }
    for(const scope of lexical.functions){
        const row=[...classes.values()].find(row=>row.node.ctor===scope.node||(row.node.methods||[]).includes(scope.node));
        const fn={kind:'function',node:scope.node,scope,result:key(),row};functions.set(scope.node,fn);
        // Fallthrough/missing actual arguments contribute Undefined; complete
        // returns and supplied actual arguments never borrow their annotations.
        if(!complete(scope.node.body))add(fn.result,'Undefined');
        if(row){methodForScope.set(scope,fn);if(scope.names.has('this'))add(scope.names.get('this'),row.instance);}
        if(scope.node.type==='FunctionDeclaration'){
            const binding=scope.parent?.names.get(scope.node.name);
            if(!binding||binding.node!==scope.node||binding.written)poisonAll();else add(binding,fn);
        }
    }
    // Private occurrence refinement, not an all-writer or initialization grant.
    // A single uncaptured local can have a stale primitive initializer in its
    // binding union even after a direct, definite class-constructor overwrite.
    // Only later direct alias-copy reads in this exact function body may use
    // that actual RHS. Branches, captures, other writes and non-copy uses keep
    // the ordinary complete binding union. No generated name selects this.
    const overwrittenReads=new WeakMap();
    for(const binding of lexical.bindings){
        const owner=binding.functionOwner,body=owner?.node?.body;
        if(binding.kind!=='local'||binding.scope!==owner||!Array.isArray(body)||
            lexical.functions.some(fn=>fn.captures.has(binding)))continue;
        const declarations=nodes.filter(node=>node.type==='Declaration'&&lexical.scopes.get(node)===binding.scope)
            .flatMap(node=>(node.decls||[]).filter(decl=>decl.name===binding.name).map(decl=>({statement:node,decl})));
        if(declarations.length!==1||declarations[0].decl!==binding.node||
            declarations[0].statement.kind!=='let'||
            declarations[0].decl.init&&!primitive.has(declarations[0].decl.init.type))continue;
        const references=nodes.filter(node=>node.type==='Identifier'&&read(node)===binding);
        const writes=references.filter(node=>parents.get(node)?.type==='Assignment'&&parents.get(node).left===node||parents.get(node)?.type==='Update');
        if(writes.length!==1)continue;
        const assignment=parents.get(writes[0]),statement=parents.get(assignment),rhs=assignment.right;
        const declarationIndex=body.indexOf(declarations[0].statement),assignmentIndex=body.indexOf(statement);
        if(assignment.type!=='Assignment'||assignment.op!=='='||statement?.type!=='ExpressionStatement'||
            statement.expr!==assignment||declarationIndex<0||assignmentIndex<=declarationIndex||
            rhs?.type!=='Call'||!rhs.isNew||rhs.callee?.type!=='Identifier'||!classForBinding.has(read(rhs.callee)))continue;
        const copies=[];let closed=true;
        for(const reference of references){
            if(reference===writes[0])continue;
            const parent=parents.get(reference),outer=parents.get(parent);
            const copyStatement=parent?.type==='Assignment'&&parent.op==='='&&parent.right===reference&&parent.left?.type==='Identifier'&&
                outer?.type==='ExpressionStatement'&&outer.expr===parent?outer:
                !parent?.type&&parent?.init===reference&&outer?.type==='Declaration'?outer:null;
            if(!copyStatement||body.indexOf(copyStatement)<=assignmentIndex){closed=false;break;}
            copies.push(reference);
        }
        if(closed&&copies.length)for(const reference of copies)overwrittenReads.set(reference,rhs);
    }
    const fnFor=node=>functions.get(node);
    const receivers=value=>[...get(value)].filter(type=>type?.kind==='instance');
    const call=(fn,args,result)=>{
        if(!fn){add(result,unknown);poisonAll();return;}
        const params=fn.node.params||[];
        for(let index=0;index<params.length;index++)if(args[index])copy(args[index],fn.scope.names.get(params[index]));else add(fn.scope.names.get(params[index]),'Undefined');
        copy(fn.result,result);
    };
    const scalarResult=(node,operands,kind)=>{
        const all=operands.map(get);
        if(all.some(set=>!set.size))return;
        if(all.some(set=>[...set].some(type=>!primitive.has(type)))){add(cell(node),unknown);return;}
        add(cell(node),kind==='add'&&all.some(set=>set.has('String'))?'String':kind==='compare'?'Boolean':kind==='truth'?'Boolean':kind==='typeof'?'String':'Number');
    };
    const memberRead=(node,result)=>{
        const receiver=cell(node.object),types=get(receiver);
        if(!types.size)return;
        for(const type of types){
            if(type==='Null'||type==='Undefined')continue;
            if(type?.kind!=='instance'){add(result,unknown);continue;}
            const row=type.row,member=row.members.get(node.name);
            if(unsafe.has(row)||!member||dangerous.has(node.name)){add(result,unknown);continue;}
            if(member.method){
                const parent=parents.get(node);
                if(parent?.type!=='Call'||parent.callee!==node){mark(row);add(result,unknown);}else add(result,fnFor(member.method));
            }else if(member.get)copy(fnFor(member.get)?.result,result);
            else if(member.declared)copy(member.field,result);
            else add(result,'Undefined');
        }
    };
    const writeMember=(node,value)=>{
        const types=get(cell(node.object));
        if(!types.size)return;
        for(const type of types){
            if(type==='Null'||type==='Undefined')continue;
            if(type?.kind!=='instance'){poisonAll();continue;}
            const row=type.row,member=row.members.get(node.name);
            if(!member||member.method||dangerous.has(node.name)){mark(row);continue;}
            if(member.set)call(fnFor(member.set),[value],discard(node));
            else if(member.declared)copy(value,member.field);
            else mark(row);
            poison(value);
        }
    };
    const evaluate=node=>{
        if(!node||typeof node!=='object')return null;
        if(Array.isArray(node)){for(const value of node)evaluate(value);return null;}
        const out=cell(node);
        if(primitive.has(node.type))return singleton(out,node.type);
        if(node.type==='Identifier'){
            const binding=read(node);
            if(!binding)add(out,unknown);else copy(overwrittenReads.has(node)?cell(overwrittenReads.get(node)):binding,out);
            if(classForBinding.has(binding)){
                const parent=parents.get(node);
                if(parent?.type!=='Call'||parent.callee!==node||!parent.isNew)mark(classForBinding.get(binding));
            }
            return out;
        }
        if(node.type==='Class'){
            for(const field of node.fields||[]){
                const pair=fields.get(field);if(field.init){const value=evaluate(field.init);if(pair&&value)copy(value,pair.member.field);}
            }
            if(node.ctor)evaluate(node.ctor.body);
            for(const method of node.methods||[])evaluate(method.body);
            return out;
        }
        if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'){
            const fn=fnFor(node);if(fn)add(out,fn);else {add(out,unknown);poisonAll();}evaluate(node.body);return out;
        }
        if(node.type==='Declaration'){
            for(const decl of node.decls){
                const binding=lexical.bindings.find(binding=>binding.node===decl);
                if(!binding){poisonAll();continue;}
                if(!decl.init||node.kind==='var')add(binding,'Undefined');if(decl.init)copy(evaluate(decl.init),binding);
            }
            return out;
        }
        if(node.type==='Assignment'){
            // Record both expressions in original order; no source is erased.
            const left=node.left;if(left?.type==='Member')evaluate(left.object);
            else if(left?.type==='Index'){evaluate(left.object);evaluate(left.index);}
            if(node.op!=='=')evaluate(left);
            const right=evaluate(node.right);if(!right){add(out,unknown);return out;}
            let assigned=right;
            if(node.op!=='='){
                scalarResult(node,[cell(left),right],node.op==='+='?'add':'number');assigned=out;
            }
            if(left?.type==='Identifier'){const binding=read(left);if(binding)copy(assigned,binding);else poisonAll();}
            else if(left?.type==='Member')writeMember(left,assigned);
            else {poisonAll();poison(assigned);}
            copy(assigned,out);return out;
        }
        if(node.type==='Member'){
            evaluate(node.object);memberRead(node,out);return out;
        }
        if(node.type==='Call'){
            const callee=evaluate(node.callee),args=(node.args||[]).map(evaluate);
            if(node.typeArguments?.length||node.args?.some(arg=>arg?.type==='Spread')){add(out,unknown);poisonAll();return out;}
            const types=get(callee);
            if(!types.size)return out;
            for(const type of types){
                if(node.isNew&&type?.kind==='class'){
                    const row=type.row;if(unsafe.has(row)){add(out,unknown);continue;}
                    add(out,row.instance);if(row.node.ctor)call(fnFor(row.node.ctor),args,discard(node));
                    else if(args.length){mark(row);add(out,unknown);}
                }else if(!node.isNew&&type?.kind==='function')call(type,args,out);
                else {add(out,unknown);poisonAll();for(const arg of args)poison(arg);}
            }
            return out;
        }
        if(node.type==='Return'){
            const value=node.value?evaluate(node.value):singleton(out,'Undefined');
            const scope=lexical.scopes.get(node)?.functionOwner,fn=scope&&fnFor(scope.node);
            if(fn){if(fn.row&&fn.node===fn.row.node.ctor&&node.value)mark(fn.row);copy(value,fn.result);}else poisonAll();return out;
        }
        if(node.type==='Binary'||node.type==='Logical'){
            const a=evaluate(node.left),b=evaluate(node.right);
            if(['&&','||','??'].includes(node.op)){copy(a,out);copy(b,out);}
            else scalarResult(node,[a,b],node.op==='+'?'add':['===','!==','==','!=','<','<=','>','>='].includes(node.op)?'compare':'number');
            return out;
        }
        if(node.type==='Unary'){
            const value=evaluate(node.argument);
            if(node.op==='delete'){poisonAll();add(out,'Boolean');}
            else scalarResult(node,[value],node.op==='!'?'truth':node.op==='typeof'?'typeof':'number');
            return out;
        }
        if(node.type==='Update'){
            const value=evaluate(node.argument);scalarResult(node,[value],'number');
            if(node.argument?.type==='Member')writeMember(node.argument,out);
            else if(node.argument?.type==='Identifier'){const binding=read(node.argument);if(binding)copy(out,binding);else poisonAll();}
            else poisonAll();return out;
        }
        if(node.type==='Conditional'){
            evaluate(node.test);copy(evaluate(node.consequent),out);copy(evaluate(node.alternate),out);return out;
        }
        if(node.type==='Parenthesized'){copy(evaluate(node.expression),out);return out;}
        if(node.type==='Object'||node.type==='Array'||node.type==='Index'||node.type==='Spread'||node.type==='New'){
            // Property records/pairs and nested containers are not expressions.
            // Traverse their actual values recursively rather than dropping an
            // Array-of-records evaluate() result (which has no value cell).
            const escape=value=>{
                if(!value||typeof value!=='object')return;
                if(Array.isArray(value)){for(const child of value)escape(child);return;}
                if(value.type){const result=evaluate(value);if(result)poison(result);return;}
                for(const [name,child]of Object.entries(value))if(!metadata.has(name))escape(child);
            };
            for(const [name,value]of Object.entries(node))if(!metadata.has(name))escape(value);
            // Opaque object syntax retains only a CallSpotter summary, not a
            // complete value/callback AST. It cannot close an escape census.
            if(node.type==='Object'&&(!Array.isArray(node.props)||node.calls?.length)||
                ['Index','Spread','New'].includes(node.type))poisonAll();
            add(out,unknown);return out;
        }
        // Only these structural statements have no value/effect semantics
        // beyond their explicitly traversed children. An unknown expression
        // must not disappear as an empty writer/argument cell. Unknown tags
        // may invoke arbitrary callbacks even when their result is unused.
        const structural=['Program','Block','ExpressionStatement','If','While','For','Break','Continue'];
        for(const [name,value]of Object.entries(node))if(!metadata.has(name)&&value&&typeof value==='object')evaluate(value);
        if(!structural.includes(node.type)){add(out,unknown);poisonAll();}
        return out;
    };
    // Finite monotone domains: five primitives, Opaque, actual class/function
    // identities. No iteration count guess or annotation seeds are used.
    do{changed=false;evaluate(program);}while(changed);
    if(!guard.isCurrent())return {program,current:guard.isCurrent};
    const selected=new Map();
    for(const node of nodes)if(node.type==='Member'){
        const parent=parents.get(node);
        if(parent?.type==='Assignment'&&parent.left===node||parent?.type==='Update'||parent?.type==='Call'&&parent.callee===node)continue;
        const types=get(cell(node)),receiver=get(cell(node.object));
        if(types.size&&[...types].every(type=>primitive.has(type))&&receiver.size&&
            [...receiver].some(type=>type?.kind==='instance')&&
            [...receiver].every(type=>type==='Null'||type==='Undefined'||type?.kind==='instance'&&!unsafe.has(type.row)))selected.set(node,[...types]);
    }
    if(!selected.size)return {program,current:guard.isCurrent};
    const literal=type=>({type,...(type==='Number'?{value:'0'}:type==='String'?{value:'""'}:type==='Boolean'?{value:'false'}:{})});
    const alternatives=types=>types.length===1?literal(types[0]):{type:'Conditional',test:{type:'Boolean',value:'false'},consequent:literal(types[0]),alternate:alternatives(types.slice(1))};
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return mapGeneratedSourceArray(node,rewrite);
        if(selected.has(node)){
            const types=selected.get(node);
            // Keep the actual getter/receiver read once in the private census.
            return {type:'Conditional',test:node,consequent:literal(types[0]),alternate:alternatives(types)};
        }
        return Object.fromEntries(Object.entries(node).map(([name,value])=>[name,metadata.has(name)?value:rewrite(value)]));
    };
    return {program:rewrite(program),current:guard.isCurrent};
}
