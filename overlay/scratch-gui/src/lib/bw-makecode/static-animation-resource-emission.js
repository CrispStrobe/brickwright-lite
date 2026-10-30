import {parseMakeCodeTs,tokenize,currentParserClassAbsence} from './ts-import.js';
import {GENERATED_HELPER_PROFILES,hasGeneratedHelperShape} from './generated-helper-recognition.js';
import {analyseCallableBindings} from './callable-bindings.js';

const descriptor=Object.getOwnPropertyDescriptor,own=Object.hasOwn,keys=Reflect.ownKeys;
const data=(value,key)=>{
    if(!value||typeof value!=='object')return null;
    const d=descriptor(value,key);return d&&own(d,'value')?d:null;
};
const absent=(value,key)=>{
    for(let current=value;current;current=Object.getPrototypeOf(current))if(descriptor(current,key))return false;
    return true;
};
const optionalNull=(value,key)=>{const d=data(value,key);return d?d.value==null:absent(value,key);};
const dense=(value,length)=>Array.isArray(value)&&data(value,'length')?.value===length&&
    keys(value).length===length+1&&Array.from({length},(_,i)=>!!data(value,String(i))).every(Boolean);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value)&&keys(value).every(key=>
    typeof key==='string'&&!!data(value,key));

// Call only for a private owned JSON snapshot. No property access may invoke an
// inherited getter while deciding whether to SKIP the original input emission.
export function ownedAnimationLiteral(project,target,node) {
    const targets=data(project,'targets')?.value;
    if(!Array.isArray(targets)||!dense(targets,data(targets,'length')?.value)||
        targets.filter(item=>item===target).length!==1)return false;
    // Moving a global lookup's tag into a caller must not capture a lexical
    // parameter/local/class binding. This first slice retains all lookups in
    // projects with callable/class/local declaration machinery; it does not
    // infer a namespace from a requested type or a parameter's spelling.
    for(let index=0;index<targets.length;index++){
        const candidate=data(targets,String(index)).value,candidateBlocks=data(candidate,'blocks')?.value;
        if(!record(candidateBlocks))return false;
        for(const key of keys(candidateBlocks)){
            const block=data(candidateBlocks,key).value,opcode=data(block,'opcode')?.value;
            if(typeof opcode!=='string'||/^(?:procedures_|argument_)|^arcade_.*(?:Class|Callable|Function|Local|SourceScalar|SourceReference)/.test(opcode))return false;
        }
    }
    const blocks=data(target,'blocks')?.value;
    if(!record(blocks)||keys(blocks).filter(key=>data(blocks,key).value===node).length!==1)return false;
    if(data(node,'opcode')?.value!=='arcade_animationAssetFreshFrames'||!optionalNull(node,'mutation')||
        !optionalNull(node,'next')||!(data(node,'shadow')?typeof data(node,'shadow').value==='boolean':absent(node,'shadow')))return false;
    const fields=data(node,'fields')?.value,inputs=data(node,'inputs')?.value;
    if(!record(fields)||keys(fields).length||!record(inputs)||keys(inputs).join('|')!=='RESOURCE')return false;
    const slot=data(inputs,'RESOURCE').value;
    if(!dense(slot,2)||data(slot,'0').value!==1)return false;
    const raw=data(slot,'1').value;
    if(Array.isArray(raw))return dense(raw,2)&&data(raw,'0').value===10&&typeof data(raw,'1').value==='string';
    if(typeof raw!=='string')return false;
    const selector=data(blocks,raw)?.value;
    if(!selector||data(selector,'shadow')?.value!==true||!optionalNull(selector,'next')||
        !optionalNull(selector,'mutation'))return false;
    const opcode=data(selector,'opcode')?.value;
    const field=opcode==='text'?'TEXT':opcode==='arcade_menu_animationAssets'?'animationAssets':null;
    const selectorInputs=data(selector,'inputs')?.value,selectorFields=data(selector,'fields')?.value;
    if(!field||!record(selectorInputs)||keys(selectorInputs).length||!record(selectorFields)||
        keys(selectorFields).join('|')!==field)return false;
    const value=data(selectorFields,field).value;
    return dense(value,2)&&typeof data(value,'0').value==='string'&&data(value,'1').value===null;
}

// This is dead-definition accounting, not a source producer/type proof. Parse
// the COMPLETE assembled source. Conservatively keep the entire lookup family
// on any reference, ambiguous declaration, opaque grammar or reflective effect.
// Resource allocations are never candidates for removal.
export function unusedAnimationLookups(source,owned,nativeIds=new Set()) {
    const none=new Set();if(!owned.size)return none;
    try {
        // The parser deliberately recovers some unsupported tokens/type forms.
        // Recovery is useful for importing, but cannot prove dead code here.
        const tokens=tokenize(source);
        if(tokens.some(token=>token.unknownBefore||token.invalidLiteral||
            ['type','interface','namespace','class','import','export'].includes(token.type)))return none;
        const program=parseMakeCodeTs(source,GENERATED_HELPER_PROFILES.metadata);
        if(!currentParserClassAbsence(program))return none;
        const lexical=analyseCallableBindings(program),definitions=new Set(),names=new Set(owned.keys());
        if(lexical.bindings.some(binding=>['assets','img','hex'].includes(binding.name)))return none;
        for(const [name,text] of owned){
            const matches=program.body.filter(node=>node.type==='FunctionDeclaration'&&node.name===name);
            const binding=lexical.global.names.get(name);
            if(matches.length!==1||!binding||binding.kind!=='function'||binding.node!==matches[0]||binding.written||
                !hasGeneratedHelperShape(matches[0],text,GENERATED_HELPER_PROFILES.metadata))return none;
            definitions.add(matches[0]);
        }
        const forbidden=new Set(['eval','Function','Reflect','Proxy','Object','globalThis','window','self','this','constructor','prototype','__proto__']);
        const safeName=name=>typeof name==='string'&&!names.has(name)&&!forbidden.has(name);
        // Default/optional expressions can hold the ONLY actual reference.
        // Object maps and malformed metadata are refusals, never length-zero.
        const emptyMetadata=value=>value===undefined||Array.isArray(value)&&
            data(value,'length')?.value===0&&keys(value).length===1;
        const list=items=>Array.isArray(items)&&items.every(visit);
        const visit=node=>{
            if(node==null)return true;
            if(!node||typeof node!=='object'||!data(node,'type'))return false;
            if(definitions.has(node))return true;
            switch(node.type){
            case 'Program':case 'Block':return list(node.body);
            case 'FunctionDeclaration':
                return safeName(node.name)&&Array.isArray(node.params)&&node.params.every(safeName)&&
                    emptyMetadata(node.parameterDefaults)&&emptyMetadata(node.ordinaryParameterDefaultNames)&&
                    emptyMetadata(node.optionalParams)&&emptyMetadata(node.params.parameterDefaults)&&
                    emptyMetadata(node.params.optionalParams)&&list(node.body);
            case 'Declaration':return Array.isArray(node.decls)&&node.decls.every(decl=>safeName(decl.name)&&visit(decl.init));
            case 'ExpressionStatement':return visit(node.expr);
            case 'Return':return visit(node.value);
            case 'Identifier':return safeName(node.name)&&!!lexical.references.get(node);
            case 'Number':case 'String':case 'Boolean':case 'Null':case 'Undefined':return true;
            case 'Template':return (['img','hex'].includes(node.tag)||node.tag==='assets.animation'&&nativeIds.has(node.value))&&
                typeof node.value==='string'&&!node.value.includes('${');
            case 'Array':return list(node.items);
            case 'Parenthesized':return visit(node.expression);
            case 'Assignment':return node.op==='='&&node.left?.type==='Identifier'&&visit(node.left)&&visit(node.right);
            case 'Binary':case 'Logical':return !['in','instanceof'].includes(node.op)&&visit(node.left)&&visit(node.right);
            case 'Unary':return ['!','~','+','-','typeof','void'].includes(node.op)&&visit(node.argument);
            case 'Conditional':return visit(node.test)&&visit(node.consequent)&&visit(node.alternate);
            case 'If':return visit(node.test)&&list(node.consequent)&&(node.alternate===null||list(node.alternate));
            case 'Call':{
                if(node.isNew||node.constructorCall||node.optional||node.callee?.type!=='Identifier')return false;
                const binding=lexical.references.get(node.callee);
                return !!binding&&binding.kind==='function'&&!binding.written&&visit(node.callee)&&list(node.args);
            }
            default:return false;
            }
        };
        return visit(program)&&currentParserClassAbsence(program)?new Set(owned.values()):none;
    }catch {return none;}
}
