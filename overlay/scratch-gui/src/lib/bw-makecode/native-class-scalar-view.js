import {nativeSdkSpriteSource} from './native-sdk-sprite-source.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {prepareObjectClassStructure} from './object-class-source-structure.js';
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
    // Structural rejection only: this helper never supplies value domains.
    // Its accessor-half, conflict, visibility and super-call rules are the
    // actual selected source language, rather than generic JS inheritance.
    if((program.body||[]).some(node=>node.type==='Class'&&node.base)&&
        prepareObjectClassStructure(program).unsupported.length)return {program,current:guard.isCurrent};
    const lexical=analyseCallableBindings(program),classes=new Map(),methods=new Map(),functions=new Map();
    const values=new Map(),parents=new WeakMap(),classForBinding=new Map(),methodForScope=new Map(),fields=new Map();
    const unknown='Opaque',nodes=[],unsafe=new Set(),arrayRows=new WeakMap();let changed=false;
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
    // Reachability follows only private owned field/Array cells. An escape
    // poisons every contained instance, including cycles and values inserted
    // in a later monotone pass; private storage itself is not publication.
    const poison=(value,seen=new Set())=>{
        for(const type of get(value)){
            if(!type||typeof type!=='object'||seen.has(type))continue;seen.add(type);
            if(type.kind==='instance'||type.kind==='class'){
                mark(type.row);
                for(const member of type.row.members.values())poison(member.field,seen);
            }else if(type.kind==='aggregate'){
                if(!type.unsafe){type.unsafe=true;changed=true;}
                poison(type.elements,seen);
            }else if(type.kind==='function'||type.kind==='boundFunction'||type.kind==='aggregatePush')poisonAll();
        }
    };
    const poisonAll=()=>{for(const row of classes.values())mark(row);};
    const scan=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)scan(value,parent);return;}
        nodes.push(node);parents.set(node,parent);
        for(const [name,value]of Object.entries(node))if(!metadata.has(name))scan(value,node);
    };
    scan(program);
    const sdk=nativeSdkSpriteSource(program,lexical,nodes,parents),sdkParents=new Map();
    const sdkParent=name=>{
        const descriptor=sdk.base(name);if(!descriptor)return null;
        if(!sdkParents.has(descriptor)){
            const member={field:key(),get:null,set:null,method:null,declared:true,sdkSlot:'x'};
            const row={node:descriptor,sdk:true,instance:{kind:'instance'},members:new Map([['x',member]]),parent:null};
            row.instance.row=row;row.lineage=[row];row.ownMembers=row.members;sdkParents.set(descriptor,row);
        }
        return sdkParents.get(descriptor);
    };
    const containsThis=node=>node&&typeof node==='object'&&(node.type==='Identifier'&&node.name==='this'||Object.entries(node).some(([name,value])=>!metadata.has(name)&&(Array.isArray(value)?value.some(containsThis):containsThis(value))));
    const complete=body=>(body||[]).some(node=>node.type==='Return'||node.type==='ThrowStatement'||node.type==='Block'&&complete(node.body)||node.type==='If'&&complete(node.consequent)&&complete(node.alternate));
    for(const node of nodes)if(node.type==='Class'){
        const binding=lexical.scopes.get(node)?.names.get(node.name);
        const row={node,binding,instance:{kind:'instance'},constructorValue:{kind:'class'},members:new Map(),ownMembers:null,parent:null,lineage:null};
        row.instance.row=row;row.constructorValue.row=row;
        if(!binding||binding.kind!=='class'||binding.node!==node||binding.scope!==lexical.global||classes.has(binding))mark(row);
        classes.set(binding||node,row);classForBinding.set(binding,row);
        if(node.typeParameters?.length||node.unsupported?.length||binding?.written)mark(row);
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
        row.ownMembers=row.members;
        add(binding,row.constructorValue);
    }
    // Resolve only an actual unique global class binding, declared before the
    // child. Namespace/SDK spellings, aliases, reassignment and cycles cannot
    // enter this local lineage. Each concrete row owns its field cells.
    const resolveLineage=(row,seen=new Set())=>{
        if(row.lineage)return row.lineage;
        if(seen.has(row)){mark(row);return null;}seen.add(row);
        const name=row.node.base;
        if(name){
            const binding=lexical.global.names.get(name),parent=classForBinding.get(binding)||(!binding&&sdkParent(name));
            if(!parent||binding?.written||parent===row||!parent.sdk&&program.body.indexOf(parent.node)>=program.body.indexOf(row.node)){
                mark(row);return null;
            }
            row.parent=parent;
            const chain=parent.sdk?parent.lineage:resolveLineage(parent,seen);if(!chain){mark(row);return null;}
            row.lineage=[row,...chain];
        }else row.lineage=[row];
        if(row.lineage.some(base=>base.sdk)&&row.lineage.some(base=>!base.sdk&&(base.ownMembers.has('x')||
            (base.node.methods||[]).some(method=>['setImage','setKind','update','draw','__draw','setHitbox','setDimensions'].includes(method.name)))))mark(row);
        row.members=new Map();
        for(const owner of [...row.lineage].reverse())for(const [name,own]of owner.ownMembers){
            const inherited=row.members.get(name);
            // Structural validation already rejects field/method collisions.
            // Accessor get/set halves inherit independently in this dialect.
            row.members.set(name,{...own,field:key(),get:own.get||inherited?.get||null,
                set:own.set||inherited?.set||null,method:own.method||inherited?.method||null});
        }
        for(const owner of row.lineage)for(const field of owner.node.fields||[]){
            const original=fields.get(field),member=row.members.get(field.name);
            if(original&&member){copy(original.member.field,member.field);
                // An ancestor constructor can call a child override before
                // the child's initialized fields exist. Never seed only the
                // later initializer on that concrete receiver.
                if(owner.node.base&&row.lineage.some(base=>base!==owner&&owner.lineage?.includes(base)&&base.node.ctor))add(member.field,'Undefined');
            }
        }
        return row.lineage;
    };
    for(const row of classes.values())resolveLineage(row);
    for(const scope of lexical.functions){
        const row=[...classes.values()].find(row=>row.node.ctor===scope.node||(row.node.methods||[]).includes(scope.node));
        const fn={kind:'function',node:scope.node,scope,result:key(),row};functions.set(scope.node,fn);
        // Fallthrough/missing actual arguments contribute Undefined; complete
        // returns and supplied actual arguments never borrow their annotations.
        if(!complete(scope.node.body))add(fn.result,'Undefined');
        if(row)methodForScope.set(scope,fn);
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
    const call=(fn,args,result,receiver=null)=>{
        if(!fn){add(result,unknown);poisonAll();return;}
        if(receiver&&fn.scope.names.has('this'))add(fn.scope.names.get('this'),receiver.instance);
        const params=fn.node.params||[];
        for(let index=0;index<params.length;index++){
            const destination=fn.scope.names.get(params[index]),fallback=fn.node.parameterDefaults?.find(value=>value.name===params[index])?.value;
            if(args[index])copy(args[index],destination);else if(fallback)copy(evaluate(fallback),destination);else add(destination,'Undefined');
            if(args[index]&&get(args[index]).has('Undefined')&&fallback)copy(evaluate(fallback),destination);
        }
        copy(fn.result,result);
    };
    const scalarResult=(node,operands,kind)=>{
        const all=operands.map(get);
        if(all.some(set=>!set.size))return;
        if(all.some(set=>[...set].some(type=>!primitive.has(type)))){add(cell(node),unknown);return;}
        add(cell(node),kind==='add'&&all.some(set=>set.has('String'))?'String':kind==='compare'?'Boolean':kind==='truth'?'Boolean':kind==='typeof'?'String':'Number');
    };
    const boundMethods=new Map();
    const bound=(fn,row)=>{
        if(!fn)return null;
        if(!boundMethods.has(fn))boundMethods.set(fn,new Map());
        const rows=boundMethods.get(fn);
        if(!rows.has(row))rows.set(row,{kind:'boundFunction',fn,row});
        return rows.get(row);
    };
    const cloneMethods=new WeakMap(),sdkClone=image=>{
        if(!cloneMethods.has(image))cloneMethods.set(image,{kind:'sdkClone',image});return cloneMethods.get(image);
    };
    const activeMethod=node=>lexical.scopes.get(node)?.functionOwner;
    const superOwner=node=>methodForScope.get(activeMethod(node))?.row?.parent;
    const memberRead=(node,result)=>{
        const receiver=cell(node.object),types=get(receiver);
        if(!types.size)return;
        for(const type of types){
            if(type==='Null'||type==='Undefined')continue;
            if(type?.kind==='aggregate'){
                const parent=parents.get(node);
                if(type.unsafe){add(result,unknown);continue;}
                if(node.name==='length'){add(result,'Number');continue;}
                if(node.name==='push'&&parent?.type==='Call'&&parent.callee===node&&!parent.isNew){add(result,type.push);continue;}
                poison(receiver);poisonAll();add(result,unknown);continue;
            }
            if(type?.kind==='sdkImage'){
                const parent=parents.get(node);
                if(node.name==='clone'&&parent?.type==='Call'&&parent.callee===node&&!parent.isNew)add(result,sdkClone(type));
                else {poisonAll();add(result,unknown);}continue;
            }
            if(type?.kind!=='instance'){poisonAll();add(result,unknown);continue;}
            const row=type.row,lookup=node.object?.type==='Identifier'&&node.object.name==='super'?superOwner(node):row,member=lookup?.members.get(node.name);
            if(unsafe.has(row)||!member||dangerous.has(node.name)||node.object?.name==='super'&&(member.get||member.set)){add(result,unknown);continue;}
            if(member.method){
                const parent=parents.get(node);
                if(parent?.type!=='Call'||parent.callee!==node){mark(row);add(result,unknown);}else add(result,bound(fnFor(member.method),row));
            }else if(member.get)call(fnFor(member.get),[],result,row);
            else if(member.sdkSlot)add(result,'Number');
            else if(member.declared)copy(row.members.get(node.name).field,result);
            else add(result,'Undefined');
        }
    };
    const writeMember=(node,value)=>{
        const types=get(cell(node.object));
        if(!types.size)return;
        for(const type of types){
            if(type==='Null'||type==='Undefined')continue;
            if(type?.kind!=='instance'){poisonAll();continue;}
            const row=type.row,isSuper=node.object?.type==='Identifier'&&node.object.name==='super',lookup=isSuper?superOwner(node):row;
            const selected=lookup?.members.get(node.name),member=row.members.get(node.name);
            if(!selected||!member||selected.method||dangerous.has(node.name)||isSuper&&(selected.get||selected.set)){mark(row);poison(value);continue;}
            if(member.sdkSlot){
                const inputs=get(value);if(inputs.size&&[...inputs].some(type=>!primitive.has(type))){mark(row);poisonAll();}continue;
            }
            if(member.set)call(fnFor(member.set),[value],discard(node),row);
            else if(member.declared){
                copy(value,member.field);
                if(unsafe.has(row))poison(value);
                // Function-valued fields remain outside this private slice.
                if([...get(value)].some(type=>type?.kind==='function'||type?.kind==='boundFunction'||type?.kind==='aggregatePush'))poisonAll();
            }else {mark(row);poison(value);}
        }
    };
    const sdkConstructions=new Map(),allocationInputs=new Map(),sourceCallInputs=new Map();
    const sdkRows=()=>[...classes.values()].filter(row=>row.lineage?.some(base=>base.sdk));
    const actualSdkInputsClosed=(args,row)=>{
        const constructor=row.lineage.find(base=>base.node.ctor)?.node.ctor;
        if((constructor?.params||[]).some((name,index)=>!args[index]&&
            !constructor.parameterDefaults?.some(parameter=>parameter.name===name)))return false;
        return args.every(arg=>{
            const types=get(arg);
            return types.size&&[...types].every(type=>!['Opaque','Null','Undefined'].includes(type));
        });
    };
    const closedSdkConstruction=({owner,args})=>{
        const image=args[0]&&get(args[0]),kind=args[1]&&get(args[1]);
        return image?.size&&[...image].some(type=>type?.kind==='sdkImage')&&
            [...image].every(type=>type==='Null'||type==='Undefined'||type?.kind==='sdkImage')&&
            (owner.node.name==='Sprite'||kind?.size&&[...kind].every(type=>type==='Number'))&&
            args.length<=(owner.node.name==='Sprite'?1:2);
    };
    const construct=(owner,args,receiver,result)=>{
        if(owner.sdk){
            // Record every actual allocation/super edge, including edges whose
            // inputs are still empty during this monotone pass. Empty is not
            // Image/kind authority. Resolve these obligations only after the
            // ordinary value propagation has reached its fixed point.
            if(!sdkConstructions.has(result))sdkConstructions.set(result,new Map());
            sdkConstructions.get(result).set(receiver,{owner,args,receiver});
            const image=args[0]&&get(args[0]),kind=args[1]&&get(args[1]);
            if(!image?.size||owner.node.name==='__bwSDK_ExtendableSprite'&&!kind?.size)return;
            if([...image].some(type=>type!=='Null'&&type!=='Undefined'&&type?.kind!=='sdkImage')||
                ![...image].some(type=>type?.kind==='sdkImage')||
                owner.node.name==='__bwSDK_ExtendableSprite'&&[...kind].some(type=>type!=='Number')||args.length>(owner.node.name==='Sprite'?1:2)){
                mark(receiver);add(result,unknown);return;
            }
            add(result,'Undefined');return;
        }
        if(unsafe.has(owner)||!owner.lineage){mark(receiver);add(result,unknown);return;}
        // Every actual inherited writer remains in the census, including an
        // uncalled method. Its this is the concrete possible receiver, never
        // a newly invented standalone declaring-class instance.
        for(const base of receiver.lineage)for(const method of base.node.methods||[]){
            const fn=fnFor(method);if(fn?.scope.names.has('this'))add(fn.scope.names.get('this'),receiver.instance);
        }
        if(owner.node.ctor)call(fnFor(owner.node.ctor),args,result,receiver);
        else if(owner.parent)construct(owner.parent,args,receiver,result);
        else if(args.length){mark(receiver);add(result,unknown);}
    };
    const evaluate=node=>{
        if(!node||typeof node!=='object')return null;
        if(Array.isArray(node)){for(const value of node)evaluate(value);return null;}
        const out=cell(node);
        if(primitive.has(node.type))return singleton(out,node.type);
        if(node.type==='Identifier'){
            if(node.name==='super'){
                const scope=activeMethod(node),fn=methodForScope.get(scope);
                if(fn?.row?.parent&&scope.names.has('this'))copy(scope.names.get('this'),out);
                else {add(out,unknown);poisonAll();}
                return out;
            }
            const binding=read(node);
            if(!binding)add(out,unknown);else copy(overwrittenReads.has(node)?cell(overwrittenReads.get(node)):binding,out);
            if(classForBinding.has(binding)){
                const parent=parents.get(node);
                if(parent?.type!=='Call'||parent.callee!==node||!parent.isNew)mark(classForBinding.get(binding));
            }
            return out;
        }
        if(node.type==='Template'){
            const image=sdk.literal(node,lexical.scopes.get(node));
            if(image)add(out,image);else {add(out,unknown);poisonAll();}return out;
        }
        if(node.type==='Class'){
            for(const row of classes.values())if(row.lineage?.some(base=>unsafe.has(base)))mark(row);
            for(const field of node.fields||[]){
                const pair=fields.get(field);if(field.init){
                    const value=evaluate(field.init);
                    if(pair&&value){
                        copy(value,pair.member.field);
                        for(const concrete of classes.values())if(concrete.lineage?.includes(pair.row))copy(value,concrete.members.get(field.name).field);
                        if(unsafe.has(pair.row))poison(value);
                        if([...get(value)].some(type=>type?.kind==='function'||type?.kind==='boundFunction'||type?.kind==='aggregatePush'))poisonAll();
                    }
                }
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
        if(node.type==='Array'){
            if(!Array.isArray(node.items)||Object.keys(node).some(name=>!['type','items','parenthesized'].includes(name))){
                for(const value of Object.values(node))if(value&&typeof value==='object')evaluate(value);
                poisonAll();add(out,unknown);return out;
            }
            let row=arrayRows.get(node);
            if(!row){row={kind:'aggregate',node,elements:key(),unsafe:false,push:null};row.push={kind:'aggregatePush',row};arrayRows.set(node,row);}
            add(out,row);
            for(const item of node.items){
                const value=evaluate(item);if(value)copy(value,row.elements);
                if(item?.type==='Spread'||[...get(value)].some(type=>type?.kind==='function'||type?.kind==='boundFunction'||type?.kind==='aggregatePush')){row.unsafe=true;poisonAll();}
            }
            if(row.unsafe)poison(row.elements);
            return out;
        }
        if(node.type==='Index'){
            const receiver=evaluate(node.object),index=evaluate(node.index),indices=get(index);
            if(!indices.size)return out;
            if([...indices].some(type=>type!=='Number')){poison(receiver);poisonAll();add(out,unknown);return out;}
            for(const type of get(receiver)){
                if(type==='Null'||type==='Undefined')continue;
                if(type==='sdkRegistryCollection'){
                    for(const row of classes.values())if(row.lineage?.some(base=>base.sdk))add(out,row.instance);
                    add(out,'Undefined');continue;
                }
                if(type?.kind!=='aggregate'||type.unsafe){poison(receiver);poisonAll();add(out,unknown);continue;}
                // Image construction additionally requires an exact actual
                // in-bounds literal-frame index. Number is not a bounds proof.
                if([...get(type.elements)].some(value=>value?.kind==='sdkImage')){
                    const index=sdk.index(node.index);
                    if(!Number.isSafeInteger(index)||index<0||index>=type.node.items.length){add(out,unknown);poisonAll();continue;}
                }
                // Numeric indices can select any actual element or miss. No
                // named/prototype property or input conversion is inferred.
                copy(type.elements,out);add(out,'Undefined');
            }
            return out;
        }
        if(node.type==='Member'){
            const role=sdk.role(node);
            if(role){add(out,role==='kind'?'Number':role==='round'?'sdkRound':'sdkRegistry');return out;}
            evaluate(node.object);memberRead(node,out);return out;
        }
        if(node.type==='Call'){
            if(node.callee?.type==='Identifier'&&node.callee.name==='super'){
                const scope=activeMethod(node),fn=methodForScope.get(scope),parent=fn?.row?.parent;
                const args=(node.args||[]).map(evaluate);
                if(node.isNew||node.typeArguments?.length||!parent||fn.node!==fn.row.node.ctor||node.args?.some(arg=>arg?.type==='Spread')){add(out,unknown);poisonAll();return out;}
                for(const receiver of receivers(scope.names.get('this')))construct(parent,args,receiver.row,discard(node));
                add(out,'Undefined');return out;
            }
            const callee=evaluate(node.callee),args=(node.args||[]).map(evaluate);
            if(node.typeArguments?.length||node.args?.some(arg=>arg?.type==='Spread')){add(out,unknown);poisonAll();return out;}
            const types=get(callee);
            if(!types.size)return out;
            for(const type of types){
                if(node.isNew&&type?.kind==='class'){
                    const row=type.row;
                    // Keep the actual allocation's inputs before call() joins
                    // constructor formals from other allocation sites.
                    if(!allocationInputs.has(node))allocationInputs.set(node,new Map());
                    allocationInputs.get(node).set(row,args);
                    if(unsafe.has(row)){add(out,unknown);continue;}
                    add(out,row.instance);construct(row,args,row,discard(node));
                }else if(!node.isNew&&type==='sdkRound'){
                    if(args.length===1){const input=get(args[0]);if(input.size){if([...input].every(value=>primitive.has(value)))add(out,'Number');else {add(out,unknown);poisonAll();}}}
                    else {add(out,unknown);poisonAll();}
                }else if(!node.isNew&&type==='sdkRegistry'){
                    if(args.length===1&&get(args[0]).size&&[...get(args[0])].every(value=>value==='Number'))add(out,'sdkRegistryCollection');
                    else if(args.length!==1||get(args[0])?.size){add(out,unknown);poisonAll();}
                }else if(!node.isNew&&type?.kind==='sdkClone'){
                    const image=sdk.clone(node,[type.image]);if(image)add(out,image);else {add(out,unknown);poisonAll();}
                }else if(!node.isNew&&type?.kind==='function'){
                    sourceCallInputs.set(node,args);call(type,args,out);
                }else if(!node.isNew&&type?.kind==='boundFunction'){
                    sourceCallInputs.set(node,args);call(type.fn,args,out,type.row);
                }else if(!node.isNew&&type?.kind==='aggregatePush'){
                    const row=type.row;
                    if(row.unsafe){add(out,unknown);poison(row.elements);continue;}
                    for(const arg of args){copy(arg,row.elements);if([...get(arg)].some(value=>value?.kind==='function'||value?.kind==='boundFunction'||value?.kind==='aggregatePush'))poisonAll();}
                    if(row.unsafe)poison(row.elements);
                    // Actual native push returns its numeric length. The
                    // receiver/method cannot escape this direct call branch.
                    add(out,'Number');
                }else {add(out,unknown);poisonAll();for(const arg of args)poison(arg);}
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
        if(node.type==='Object'||node.type==='Spread'||node.type==='New'){
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
    // identities and actual Array allocation identities. No iteration count guess or annotation seeds are used.
    do{
        do{changed=false;evaluate(program);}while(changed);
        // A pending edge may never receive an input (unbound source, omitted
        // argument or uncalled forwarding path). Revoke the concrete receiver
        // after convergence, then propagate that refusal through every actual
        // getter/method/alias/writer before publishing any normal-result view.
        for(const entries of sdkConstructions.values())for(const entry of entries.values())
            if(!closedSdkConstruction(entry))mark(entry.receiver);
        const selectedSdkRows=sdkRows();
        for(const entries of allocationInputs.values())for(const [row,args]of entries){
            if(row.lineage?.some(base=>base.sdk)&&!actualSdkInputsClosed(args,row))mark(row);
            // A dormant ordinary constructor/call can forward an empty input
            // into a shared field/formal already populated by a valid site.
            // This initial closed-world SDK slice conservatively declines its
            // additional facts rather than treating that missing edge as a
            // proved value. Ordinary B1 rows acquire no new refusal or grant.
            if(args.some(arg=>!get(arg).size))for(const sdkRow of selectedSdkRows)mark(sdkRow);
        }
        for(const args of sourceCallInputs.values())if(args.some(arg=>!get(arg).size))
            for(const row of selectedSdkRows)mark(row);
    }while(changed);
    const current=()=>guard.isCurrent()&&sdk.current();
    if(!current())return {program,current};
    const selected=new Map();
    for(const node of nodes)if(node.type==='Member'){
        const parent=parents.get(node);
        if(parent?.type==='Assignment'&&parent.left===node||parent?.type==='Update'||parent?.type==='Call'&&parent.callee===node)continue;
        const types=get(cell(node)),receiver=get(cell(node.object));
        if(types.size&&[...types].every(type=>primitive.has(type))&&receiver.size&&
            [...receiver].some(type=>type?.kind==='instance')&&
            [...receiver].every(type=>type==='Null'||type==='Undefined'||type?.kind==='instance'&&!unsafe.has(type.row)))selected.set(node,[...types]);
    }
    // A primitive normal result may also come from an actual owned method
    // call. Retain the complete original receiver/arguments/call as the test;
    // no generic function, SDK ancestry, reference result or annotation enters.
    for(const node of nodes)if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Member'){
        const types=get(cell(node)),receiver=get(cell(node.callee.object)),callees=get(cell(node.callee));
        if(!types.size||[...types].some(type=>!primitive.has(type))||!receiver.size||!callees.size||
            ![...receiver].some(type=>type?.kind==='instance')||
            [...receiver].some(type=>type!=='Null'&&type!=='Undefined'&&(type?.kind!=='instance'||unsafe.has(type.row)))||
            [...callees].some(bound=>bound?.kind!=='boundFunction'||unsafe.has(bound.row)||
                bound.row.members.get(node.callee.name)?.method!==bound.fn.node))continue;
        selected.set(node,[...types]);
    }
    if(!selected.size)return {program,current};
    const literal=type=>({type,...(type==='Number'?{value:'0'}:type==='String'?{value:'""'}:type==='Boolean'?{value:'false'}:{})});
    const alternatives=types=>types.length===1?literal(types[0]):{type:'Conditional',test:{type:'Boolean',value:'false'},consequent:literal(types[0]),alternate:alternatives(types.slice(1))};
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return mapGeneratedSourceArray(node,rewrite);
        if(selected.has(node)){
            const types=selected.get(node);
            // Keep the actual getter or method call once in the private census.
            return {type:'Conditional',test:node,consequent:literal(types[0]),alternate:alternatives(types)};
        }
        return Object.fromEntries(Object.entries(node).map(([name,value])=>[name,metadata.has(name)?value:rewrite(value)]));
    };
    return {program:rewrite(program),current};
}
