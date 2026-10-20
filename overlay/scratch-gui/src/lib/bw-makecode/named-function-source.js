import {currentParserClassAbsence} from './ts-import.js';
import {parseCallableType} from './callable-type-syntax.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {analyseSourceValueProducers} from './source-value-producers.js';
import {lowerNamespaceBindings} from './namespace-bindings.js';

const metadata = new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType']);
const children = node => Object.entries(node).filter(([key,value])=>!metadata.has(key)&&value&&typeof value==='object');
const unparen = node => node?.type==='Parenthesized'?unparen(node.expression):node;
const singleton = (types,name) => types.size===1&&types.has(name);
const named = name => ({kind:'named',name});

// An actual declaration/call graph proof. No source annotation supplies a result
// or a callable producer. The returned Maps are tied to this exact parsed AST.
export function proveNamedFunctionSource(input) {
    const flattened=lowerNamespaceBindings(input,{namedFunctionValues:true});
    const program=flattened.program || input,lexical=analyseCallableBindings(program);
    // The target census below does not consume producer facts. Preserve eager
    // analysis for every input lacking current parser-owned structural evidence.
    let producers=currentParserClassAbsence(program)?null:analyseSourceValueProducers(program,{parenthesized:true,unboundIsOpaque:true});
    const unsupported=[],fail=message=>{const text='Named function values: '+message;if(!unsupported.includes(text))unsupported.push(text);};
    const writes=new Map(),parents=new WeakMap(),order=new WeakMap(),declarationKinds=new WeakMap();
    const add=(binding,row)=>{if(!binding)return;if(!writes.has(binding))writes.set(binding,[]);writes.get(binding).push(row);};
    const scan=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(value=>scan(value,parent));return;}
        parents.set(node,parent);
        if(node.type==='Declaration')for(const row of node.decls){
            const binding=lexical.scopes.get(node)?.names.get(row.name);
            add(binding,{node:row,value:row.init,op:'='});declarationKinds.set(row,node.kind);
        }
        if(node.type==='Assignment'&&node.left?.type==='Identifier')add(lexical.references.get(node.left),{node,value:node.right,op:node.op});
        if(node.type==='Update'&&node.argument?.type==='Identifier')add(lexical.references.get(node.argument),{node,value:null,op:node.op});
        for(const [,value]of children(node))scan(value,node);
    };
    scan(program);
    let next=0;
    const sequence=node=>{if(!node||typeof node!=='object'||['FunctionDeclaration','FunctionExpression','Class'].includes(node.type))return;
        if(Array.isArray(node)){node.forEach(sequence);return;}for(const [,value]of children(node))sequence(value);order.set(node,++next);};
    program.body.forEach(sequence);
    const targetCache=new Map(),targetOf=(binding,seen=new Set())=>{
        if(!binding||seen.has(binding))return null;
        if(targetCache.has(binding))return targetCache.get(binding);
        if(binding.kind==='function') {
            const node=binding.node;
            return binding.scope===lexical.global&&!binding.written&&node?.type==='FunctionDeclaration'&&
                program.body.filter(row=>row.name===binding.name||row.decls?.some(decl=>decl.name===binding.name)).length===1 ? node:null;
        }
        const rows=writes.get(binding);
        // Only a real module declaration initializes an alias in this slice.
        // Reassignment and control-dependent producers are not inferred.
        const concrete=rows?.filter(row=>row.value&&row.value.type!=='Undefined')||[];
        if(binding.scope!==lexical.global||rows?.[0]?.node!==binding.node||concrete.length!==1||
            rows.some(row=>row.op!=='='||row!==concrete[0]&&row.node!==binding.node))return null;
        let value=unparen(concrete[0].value);
        const target=value?.type==='Identifier'?targetOf(lexical.references.get(value),new Set([...seen,binding])):null;
        targetCache.set(binding,target);return target;
    };
    const reads=[],calls=[],targets=new Set(),aliases=new Set();
    const inspect=node=>{
        if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(inspect);return;}
        if(node.type==='Identifier') {
            const binding=lexical.references.get(node),target=targetOf(binding),parent=parents.get(node);
            const lhs=parent?.type==='Assignment'&&parent.left===node||parent?.type==='Update';
            const direct=parent?.type==='Call'&&parent.callee===node&&binding?.kind==='function';
            if(target&&!lhs&&!direct) {
                targets.add(target);if(binding.kind!=='function')aliases.add(binding);
                reads.push({node,binding,target});
            }
        }
        if(node.type==='Call'&&unparen(node.callee)?.type==='Identifier') {
            const binding=lexical.references.get(unparen(node.callee)),target=targetOf(binding);
            if(target)calls.push({node,binding,target});
        }
        for(const [,value]of children(node))inspect(value);
    };
    inspect(program);
    if(!targets.size)return {eligible:false,unsupported:[],program:input};
    producers ||= analyseSourceValueProducers(program,{parenthesized:true,unboundIsOpaque:true});
    flattened.unsupported.forEach(fail);
    if(lexical.bindings.some(binding=>binding.name==='__bwCallables'))fail('authored internal callable namespace conflicts with declaration lowering');
    // A named-only plan must not silently swallow the established Arrow/class
    // callable source models. Ordinary non-callable primitive declarations work.
    const adjacent=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(adjacent);return;}
        if(['FunctionExpression','Class'].includes(node.type))fail('mixed Arrow/class plans require a separate qualified bridge');
        for(const [,value]of children(node))adjacent(value);};adjacent(program);
    const comparisons=new Map();
    const comparisonCall=node=>{
        const binding=unparen(node.callee)?.type==='Identifier'&&lexical.references.get(unparen(node.callee)),fn=binding?.node;
        const returned=fn?.body?.[0]?.value,scope=fn&&lexical.scopes.get(fn);
        // The exporter comparison helper accepts values without imposing a
        // primitive parameter constraint. Distinct actual formal cells, not
        // repeated identifier spellings, establish the ordered operand binding.
        const parameter=index=>scope?.names.get(fn.params?.[index]);
        const unrestricted=name=>{const type=fn.paramTypes?.[name],text=typeof type==='string'?type:type?.text;return !text||text==='any';};
        const resultConstraint=typeof fn?.returnType==='string'?fn.returnType:fn?.returnType?.text;
        const valid=binding?.kind==='function'&&!binding.written&&fn.params?.length===2&&new Set(fn.params).size===2&&fn.body.length===1&&
            (!resultConstraint||['any','boolean'].includes(resultConstraint))&&
            fn.params.every(unrestricted)&&parameter(0)?.kind==='parameter'&&parameter(1)?.kind==='parameter'&&parameter(0)!==parameter(1)&&
            !fn.typeParameters?.length&&!(fn.parameterDefaults?.length)&&node.args?.length===2&&!node.isNew&&
            !node.typeArguments?.length&&fn.body[0].type==='Return'&&returned?.type==='Binary'&&
            ['===','!=='].includes(returned.op)&&returned.left?.type==='Identifier'&&lexical.references.get(returned.left)===parameter(0)&&
            returned.right?.type==='Identifier'&&lexical.references.get(returned.right)===parameter(1)&&
            program.body.filter(row=>row.name===binding.name||row.decls?.some(decl=>decl.name===binding.name)).length===1;
        if(valid)comparisons.set(node,{declaration:fn,op:returned.op});
        return valid;
    };
    for(const row of reads) {
        const scope=lexical.scopes.get(row.node);
        if(scope!==lexical.global)fail('declaration values in deferred or nested owners are not qualified');
        if(row.binding.kind!=='function') {
            const writer=writes.get(row.binding)?.find(value=>value.value&&value.value.type!=='Undefined');
            if(!order.has(row.node)||!order.has(writer?.node)||order.get(writer.node)>=order.get(row.node))fail('alias read precedes its actual initializer');
        }
        const parent=parents.get(row.node);
        if(parent?.type==='Call'&&parent.callee!==row.node&&!comparisonCall(parent))fail('forwarding declaration labels as arguments is not qualified');
    }
    const signatures=new Map(),active=new Set();
    const prove=node=>{
        if(signatures.has(node))return signatures.get(node);
        if(active.has(node)){fail('recursive declaration result graph is not qualified');return null;}
        active.add(node);
        if(node.params?.length||node.typeParameters?.length||Object.keys(node.parameterDefaults||{}).length)
            fail('declaration needs its actual zero-argument non-generic signature');
        const scope=lexical.scopes.get(node);
        if(scope?.parent!==lexical.global||scope.captures.size)fail('captured or nested declarations are not qualified');
        const result=new Set();let returned=false;
        const expr=value=>{
            if(!value)return new Set(['Undefined']);
            if(value.type==='Call') {
                if(value.isNew||value.typeArguments?.length){fail('constructor or generic calls are not declaration calls');return new Set(['Opaque']);}
                const binding=value.callee?.type==='Identifier'&&lexical.references.get(value.callee),target=targetOf(binding);
                if(!target||binding.kind!=='function'||value.args?.length){fail('body calls require an actual unchanged zero-argument declaration');return new Set(['Opaque']);}
                const signature=prove(target);return new Set([signature?.result.name==='void'?'Undefined':({number:'Number',string:'String'}[signature?.result.name]||'Opaque')]);
            }
            if(value.type==='Identifier') {
                const binding=lexical.references.get(value);
                if(binding?.scope===lexical.global&&binding.kind!=='function')fail('deferred global reads need a closed initialization proof');
            } else if(value.type==='Binary') {
                if(!['+','-','*','/','%','**','&','|','^','<<','>>','>>>','===','!=='].includes(value.op))fail('body binary operation is outside the declaration slice');
                expr(value.left);expr(value.right);
            } else if(value.type==='Unary') {
                if(!['+','-','~'].includes(value.op))fail('body unary operation is outside the declaration slice');expr(value.argument);
            } else if(value.type==='Parenthesized')expr(value.expression);
            else if(!['Number','String','Boolean','Null','Undefined'].includes(value.type))fail('body syntax is outside the actual primitive declaration slice');
            // Shared analysis is the primitive producer authority. Occurrence
            // facts include Undefined before writes and all incompatible writers.
            const facts=producers.typesAt(value);
            if(!facts.size||[...facts].some(type=>!['Number','String','Boolean','Null','Undefined'].includes(type)))fail('body expression lacks actual primitive producer authority');
            return facts;
        };
        for(const statement of node.body||[]) {
            if(returned){fail('unreachable statements after return are not qualified');break;}
            if(statement.type==='Return') {for(const type of expr(statement.value||statement.argument))result.add(type);returned=true;}
            else if(statement.type==='Declaration')for(const row of statement.decls)expr(row.init);
            else if(statement.type==='ExpressionStatement') {
                const value=statement.expr;
                if(value?.type==='Assignment'&&value.left?.type==='Identifier'&&value.op==='=') {
                    const binding=lexical.references.get(value.left);
                    if(!binding||['function','class'].includes(binding.kind))fail('body writer lacks its actual variable declaration');
                    const actual=expr(value.right),expected={number:'Number',string:'String',boolean:'Boolean'}[binding?.node?.typeName];
                    if(expected&&[...actual].some(type=>!['Undefined','Null',expected].includes(type)))fail('body writer differs from its actual declared constraint');
                }
                else if(value?.type==='Call')expr(value);
                else fail('body statement is outside the complete primitive declaration slice');
            } else fail('control-dependent declaration bodies require a separate complete proof');
        }
        if(!returned)result.add('Undefined');
        const kind=singleton(result,'Number')?'number':singleton(result,'String')?'string':singleton(result,'Undefined')?'void':null;
        if(!kind)fail('result must have a complete actual Number, String or Void producer');
        const annotation=typeof node.returnType==='string'?node.returnType:node.returnType?.text;
        if(annotation&&annotation!==kind)fail('actual result differs from its declared constraint');
        const signature=kind?{kind:'callable',parameters:[],result:named(kind)}:null;
        signatures.set(node,signature);active.delete(node);return signature;
    };
    for(const target of targets)prove(target);
    for(const binding of lexical.bindings) {
        const target=targetOf(binding),signature=target&&signatures.get(target);if(binding.kind==='function'||!signature)continue;
        const text=binding.node.typeName,annotation=text&&parseCallableType(text);
        if(text&&text!=='any'&&(!annotation||JSON.stringify(annotation)!==JSON.stringify(signature)))fail('actual alias signature differs from its declared constraint');
    }
    for(const row of calls)if(targets.has(row.target)) {
        if(row.node.isNew||row.node.typeArguments?.length||row.node.args?.length)fail('label invocation requires an actual ordinary zero-argument call');
    }
    // All bindings whose actual initializer reaches a label must be closed;
    // dropping an incompatible writer cannot turn it into an ordinary variable.
    for(const binding of lexical.bindings) {
        const rows=writes.get(binding)||[];
        if(rows.some(row=>unparen(row.value)?.type==='Identifier'&&targets.has(targetOf(lexical.references.get(unparen(row.value)))))&&!targetOf(binding))
            fail('label alias has incompatible, ambiguous or multiple writers');
    }
    for(const binding of lexical.bindings) {
        if(binding.kind!=='local')continue;
        const expected={number:'Number',string:'String',boolean:'Boolean'}[binding.node?.typeName];
        const writer=(writes.get(binding)||[]).find(row=>row.value);
        if(expected&&writer) {
            const facts=producers.bindingTypesAt(writer.value,binding.name);
            if([...facts].some(type=>!['Undefined','Null',expected].includes(type)))fail('primitive writer differs from its declared constraint');
        }
    }
    const moduleValue=node=>{
        if(!node)return new Set(['Undefined']);
        if(node.type==='Identifier'&&targetOf(lexical.references.get(node)))return new Set(['Label']);
        if(node.type==='Unary'&&node.op==='typeof'&&targetOf(lexical.references.get(unparen(node.argument))))fail('declaration reflection needs its separate current-owner source proof');
        if(node.type==='Call') {
            const binding=unparen(node.callee)?.type==='Identifier'&&lexical.references.get(unparen(node.callee)),target=targetOf(binding);
            if(target&&!node.isNew&&!node.typeArguments?.length&&!node.args?.length) {
                const signature=prove(target);return new Set([({number:'Number',string:'String',void:'Undefined'}[signature?.result.name])||'Opaque']);
            }
            if(comparisonCall(node)){node.args.forEach(moduleValue);return new Set(['Boolean']);}
            fail('module call lacks an actual qualified declaration body');return new Set(['Opaque']);
        }
        if(node.type==='Binary'&&['===','!=='].includes(node.op)) {moduleValue(node.left);moduleValue(node.right);return new Set(['Boolean']);}
        const facts=producers.typesAt(node);
        if(!facts.size||[...facts].some(type=>!['Number','String','Boolean','Null','Undefined'].includes(type)))fail('module expression has an opaque or unproved producer');
        return facts;
    };
    const constraint=(binding,facts)=>{
        const expected={number:'Number',string:'String',boolean:'Boolean'}[binding?.node?.typeName];
        if(expected&&[...facts].some(type=>!['Undefined','Null',expected].includes(type)))fail('current module writer differs from its actual declared constraint');
    };
    for(const statement of program.body) {
        if(statement.type==='FunctionDeclaration')continue;
        if(statement.type==='Declaration'){for(const row of statement.decls)if(row.init){const facts=moduleValue(row.init);
            if(row.init.type==='Call'&&singleton(facts,'Undefined'))fail('stored Void results need their separate portable source proof');
            constraint(lexical.scopes.get(statement)?.names.get(row.name),facts);
        }continue;}
        const expr=statement.expr;
        if(statement.type==='ExpressionStatement'&&expr?.type==='Assignment'&&expr.left?.type==='Identifier'&&expr.op==='=') {
            if(!lexical.references.get(expr.left))fail('assignment has no actual declared module binding');const facts=moduleValue(expr.right);if(expr.right?.type==='Call'&&singleton(facts,'Undefined'))fail('stored Void results need their separate portable source proof');
            constraint(lexical.references.get(expr.left),facts);
        }else if(statement.type==='ExpressionStatement'&&expr?.type==='Call')moduleValue(expr);
        else fail('module statement requires a separate complete control/producer proof');
    }
    return {eligible:unsupported.length===0,unsupported,program,lexical,producers,targets,signatures,reads,calls,aliases,writes,declarationKinds,comparisons,
        origins:flattened.namedFunctionOrigins||new WeakMap()};
}
