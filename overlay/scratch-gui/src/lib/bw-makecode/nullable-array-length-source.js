import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';

// Private effect closure for the ADDITIONAL nullable-receiver length theorem.
// This object never enrolls a caller value or issues an Array/type certificate.
export function nullableArrayLengthSource(program) {
    const baseline=physicalUpdateSourceSnapshot(program);let expired=false;
    const current=()=>{
        if(expired)return false;
        try {if(!baseline||!baseline.current())expired=true;}
        catch(error){expired=true;throw error;}
        return !expired;
    };
    const forbidden=new Set(['eval','Function','Reflect','Proxy','Object','Array','globalThis','window','self','this']);
    const closed=graph=>{
        if(!current())return false;
        const seen=new WeakSet(),references=[],functions=new Set();let valid=program?.type==='Program';
        // The general graph also traverses data properties. Additional facts
        // require every executable-shaped occurrence to occupy a real grammar
        // edge, including edges to an otherwise genuine allocation/identifier.
        const data=(object,key)=>{
            const d=Object.getOwnPropertyDescriptor(object,key);
            return d&&Object.hasOwn(d,'value')?d:null;
        };
        const ownOrAbsent=(object,key)=>{
            if(Object.hasOwn(object,key))return !!data(object,key);
            for(let proto=Object.getPrototypeOf(object);proto;proto=Object.getPrototypeOf(proto))
                if(Object.getOwnPropertyDescriptor(proto,key))return false;
            return true;
        };
        const noExecutable=value=>{
            const checked=new WeakSet();
            const visit=item=>{
                if(!item||typeof item!=='object'||checked.has(item))return true;
                checked.add(item);
                if(!ownOrAbsent(item,'type')||typeof data(item,'type')?.value==='string')return false;
                return Reflect.ownKeys(item).every(key=>{
                    const d=Object.getOwnPropertyDescriptor(item,key);
                    return typeof key==='string'&&!!d&&Object.hasOwn(d,'value')&&visit(d.value);
                });
            };return visit(value);
        };
        const slots={Program:{body:'list'},Declaration:{decls:'declarations'},
            FunctionDeclaration:{body:'list'},Block:{body:'list'},If:{test:'node',consequent:'list',alternate:'nullable-list'},
            ExpressionStatement:{expr:'node'},Return:{value:'node'},ThrowStatement:{argument:'node'},
            Array:{items:'list'},Object:{props:'properties'},Parenthesized:{expression:'node'},
            Member:{object:'node'},Assignment:{left:'node',right:'node'},Call:{callee:'node',args:'list'},
            Conditional:{test:'node',consequent:'node',alternate:'node'},Binary:{left:'node',right:'node'},
            Logical:{left:'node',right:'node'},Unary:{argument:'node'}};
        const required={Program:['body'],Declaration:['kind','decls'],FunctionDeclaration:['name','params','body'],
            Block:['body'],If:['test','consequent','alternate'],ExpressionStatement:['expr'],Return:['value'],
            ThrowStatement:['argument'],Array:['items'],Object:['props'],Parenthesized:['expression'],
            Member:['name','object'],Assignment:['op','left','right'],Call:['callee','args'],
            Conditional:['test','consequent','alternate'],Binary:['op','left','right'],Logical:['op','left','right'],
            Unary:['op','argument'],Identifier:['name'],Number:['value'],String:['value'],Boolean:['value'],Template:['tag','value']};
        const optional=['isNew','constructorCall','optional','typeArguments','parameterDefaults','ordinaryParameterDefaultNames',
            'optionalParams','typeParameters','paramTypes','returnType','originalBody','calls'];
        const ownSlots=new WeakSet();
        const slotNode=node=>{
            if(node==null)return true;
            if(typeof node!=='object'||ownSlots.has(node))return false;
            ownSlots.add(node);
            const type=data(node,'type');if(!type||typeof type.value!=='string')return false;
            for(const key of required[type.value]||[])if(!data(node,key))return false;
            for(const key of optional)if(!ownOrAbsent(node,key))return false;
            if(type.value==='FunctionDeclaration'){
                if(!slotList(data(node,'params').value,'parameters'))return false;
                for(const key of ['parameterDefaults','optionalParams','parameterProperties'])if(!ownOrAbsent(node.params,key))return false;
            }
            const grammar=slots[type.value]||{};
            for(const key of Reflect.ownKeys(node)){
                const d=Object.getOwnPropertyDescriptor(node,key);
                if(typeof key!=='string'||!d||!Object.hasOwn(d,'value'))return false;
                const value=d.value,kind=grammar[key];
                if(kind==='node'){if(!slotNode(value))return false;}
                else if(kind){if(!(kind==='nullable-list'&&value===null)&&!slotList(value,kind))return false;}
                else if(!noExecutable(value))return false;
            }return true;
        };
        const slotList=(list,kind)=>{
            if(!Array.isArray(list)||!data(list,'length'))return false;
            for(let index=0;index<list.length;index++)if(!data(list,String(index)))return false;
            for(const key of Reflect.ownKeys(list)){
                const d=Object.getOwnPropertyDescriptor(list,key);
                if(typeof key!=='string'||!d||!Object.hasOwn(d,'value'))return false;
                if(/^(?:0|[1-9][0-9]*)$/.test(key)&&Number(key)<list.length){
                    if(kind==='list'||kind==='nullable-list'){if(!slotNode(d.value))return false;}
                    else if(kind==='parameters'){if(typeof d.value!=='string')return false;}
                    else {
                        const record=d.value,field=kind==='declarations'?'init':'value';
                        if(!record||typeof record!=='object'||Array.isArray(record)||!ownOrAbsent(record,'type')||Object.hasOwn(record,'type'))return false;
                        if(!data(record,field)||!data(record,kind==='declarations'?'name':'key'))return false;
                        for(const key of ['init','value','name','key','typeName','isArray'])if(!ownOrAbsent(record,key))return false;
                        for(const name of Reflect.ownKeys(record)){
                            const r=Object.getOwnPropertyDescriptor(record,name);
                            if(typeof name!=='string'||!r||!Object.hasOwn(r,'value'))return false;
                            if(name===field){if(!slotNode(r.value))return false;}
                            else if(!noExecutable(r.value))return false;
                        }
                    }
                }else if(!noExecutable(d.value))return false;
            }return true;
        };
        if(valid&&!slotNode(program))valid=false;
        const own=node=>{
            if(!node||typeof node!=='object'||seen.has(node)){valid=false;return false;}
            seen.add(node);return true;
        };
        const list=body=>{if(!Array.isArray(body)){valid=false;return;}for(const node of body)statement(node);};
        const expression=(node,parent=null,slot=null)=>{
            if(node==null)return;
            if(!own(node))return;
            if(node.type==='Identifier'){
                if(forbidden.has(node.name)||!graph.bound(node))valid=false;
                references.push({node,parent,slot});return;
            }
            if(node.type==='Number'){if(typeof node.value!=='string'||!Number.isFinite(Number(node.value)))valid=false;return;}
            if(node.type==='String'){if(typeof node.value!=='string')valid=false;return;}
            if(node.type==='Boolean'){if(typeof node.value!=='boolean')valid=false;return;}
            if(node.type==='Null'||node.type==='Undefined')return;
            if(node.type==='Template'){
                if(node.tag!=='img'||!graph.imageLiteral(node))valid=false;return;
            }
            if(node.type==='Array'){
                if(!Array.isArray(node.items))valid=false;else for(const item of node.items)expression(item,node,'items');return;
            }
            if(node.type==='Object'){
                if(!Array.isArray(node.props)||node.calls?.length)valid=false;
                else for(const prop of node.props){
                    if(!prop||typeof prop.key!=='string'||['__proto__','constructor','prototype'].includes(prop.key))valid=false;
                    expression(prop.value,node,'props');
                }return;
            }
            if(node.type==='Parenthesized'){expression(node.expression,node,'expression');return;}
            if(node.type==='Member'){
                if(node.name!=='length'||!graph.nativeLength(node))valid=false;
                expression(node.object,node,'object');return;
            }
            if(node.type==='Assignment'){
                if(node.op!=='='||node.left?.type!=='Identifier')valid=false;
                expression(node.left,node,'left');expression(node.right,node,'right');return;
            }
            if(node.type==='Call'){
                if(node.isNew||node.constructorCall||node.optional||node.typeArguments?.length||
                    node.callee?.type!=='Identifier'||!graph.functionAt(node)||!Array.isArray(node.args))valid=false;
                expression(node.callee,node,'callee');
                if(Array.isArray(node.args))for(const arg of node.args)expression(arg,node,'args');return;
            }
            if(node.type==='Conditional'){
                expression(node.test,node,'test');expression(node.consequent,node,'consequent');expression(node.alternate,node,'alternate');
                if(!graph.primitive(node.test))valid=false;return;
            }
            if(node.type==='Binary'||node.type==='Logical'){
                expression(node.left,node,'left');expression(node.right,node,'right');
                if(!graph.primitive(node.left)||!graph.primitive(node.right))valid=false;return;
            }
            if(node.type==='Unary'){
                expression(node.argument,node,'argument');
                if(!['+','-','!','~','typeof','void'].includes(node.op)||!graph.primitive(node.argument))valid=false;return;
            }
            // Callback allocation, computed access, unknown calls, mutation and
            // unsupported grammar cannot silently supply a closed effect graph.
            valid=false;
        };
        const statement=node=>{
            if(!own(node))return;
            if(node.type==='Declaration'){
                if(!['let','const','var'].includes(node.kind)||!Array.isArray(node.decls)){valid=false;return;}
                for(const decl of node.decls){if(typeof decl.name!=='string'||forbidden.has(decl.name))valid=false;expression(decl.init,node,'init');}return;
            }
            if(node.type==='FunctionDeclaration'){
                if(!Array.isArray(node.params)||!Array.isArray(node.body)||forbidden.has(node.name)||graph.functionAt(node)!==node){valid=false;return;}
                for(const metadata of [node.parameterDefaults,node.params.parameterDefaults,node.ordinaryParameterDefaultNames,node.optionalParams,node.params.optionalParams])
                    if(metadata!==undefined&&(!Array.isArray(metadata)||metadata.length))valid=false;
                if(node.params.some(name=>typeof name!=='string'||forbidden.has(name)))valid=false;
                functions.add(node);list(node.body);return;
            }
            if(node.type==='Block'){list(node.body);return;}
            if(node.type==='If'){
                expression(node.test,node,'test');if(!graph.primitive(node.test))valid=false;
                list(node.consequent);if(node.alternate!==null)list(node.alternate);return;
            }
            if(node.type==='ExpressionStatement'){expression(node.expr,node,'expr');return;}
            if(node.type==='Return'){expression(node.value,node,'value');return;}
            if(node.type==='ThrowStatement'){expression(node.argument,node,'argument');return;}
            valid=false;
        };
        if(valid)list(program.body);
        // A callable's immutable body does not prove closed registration or
        // alias entry. Every actual function reference must be its direct call.
        for(const ref of references){const fn=graph.functionAt(ref.node);
            if(fn&&(!functions.has(fn)||ref.slot!=='callee'||ref.parent?.type!=='Call'||ref.parent.callee!==ref.node))valid=false;
        }
        return valid&&current();
    };
    return Object.freeze({current,closed});
}
