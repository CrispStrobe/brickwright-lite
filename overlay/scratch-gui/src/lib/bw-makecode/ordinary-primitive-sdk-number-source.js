import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

// A bounded Number producer for the ordinary parameter-constraint consumer.
// Every unshadowed info use must stay inside this closed native API surface.
// Namespace/member writes, computed access, extraction and escaping aliases
// invalidate the whole root, including writes in later or unused functions.
export function ordinaryPrimitiveSdkNumberCalls(program) {
    const sdk=staticSdkNamespaceReceivers(program),candidates=[],allowed=new Set([
        'score','setScore','changeScoreBy','startCountdown','onCountdownEnd','onScore','showScore'
    ]);
    let unsafe=false;
    const visit=(node,parent=null,grandparent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)visit(value,parent,grandparent);return;}
        if(node.type==='Identifier'&&node.name==='info'&&sdk.has(node)){
            const member=parent?.type==='Member'&&parent.object===node?parent:null;
            const call=grandparent?.type==='Call'&&grandparent.callee===member?grandparent:null;
            if(!call||call.isNew||call.typeArguments?.length||!allowed.has(member.name))unsafe=true;
            else if(member.name==='score'&&call.args.length===0)candidates.push(call);
        }
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node,parent);
    };
    visit(program);
    return new WeakSet(unsafe?[]:candidates);
}

// The original seven-call census remains independent. This additional profile
// is selected only by the ordinary primitive constraint consumer whose native
// score implementation and fixed-player result ownership are checked separately.
// A source candidate is never a certificate for a cached native Number result.
export function ordinaryPlayerScoreNumberCalls(program, safeIndex = () => false) {
    const sdk=staticSdkNamespaceReceivers(program),candidates=[];
    const rootArities=new Map([['score',0],['setScore',1],['changeScoreBy',1],
        ['startCountdown',1],['onCountdownEnd',1],['onScore',2],['showScore',1]]);
    const playerArities=new Map([['score',0],['setScore',1],['changeScoreBy',1]]);
    const players=new Set(['player1','player2','player3','player4']);
    // The parser stores a template tag as a dotted STRING, not its original
    // Identifier/Member tree. Do not let those erased calls escape the census.
    const resourceTags=new Set(['img','hex','tilemap','assets.image','assets.tile','assets.tilemap']);
    const resourceRoots=new Set(['img','hex','tilemap','assets']),resourceBindings=new Set(),tags=[];
    let unsafe=false,hasPlayerAccess=false;
    const classThis=ancestors=>{
        const owner=[...ancestors].reverse().find(node=>node.type==='Class');
        if(!owner)return false;
        const at=ancestors.indexOf(owner),member=ancestors[at+1];
        if(!member||member.isStatic||!(member===owner.ctor||owner.methods?.includes(member)||owner.fields?.includes(member)))return false;
        return ancestors.slice(at+2).every(node=>node.type!=='FunctionDeclaration'&&
            (node.type!=='FunctionExpression'||node.functionKind==='arrow'));
    };
    const visit=(node,parent=null,grandparent=null,ancestors=[])=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)visit(value,parent,grandparent,ancestors);return;}
        if(node.type==='Template'){
            if(typeof node.value!=='string'||node.value.includes('${'))unsafe=true;
            if(Object.hasOwn(node,'tag')){
                tags.push(node.tag);
                // Even an erased/malformed info tag must select the extended
                // profile, rather than falling through to the legacy API.
                if(typeof node.tag==='string'&&node.tag.split('.')[0]==='info')hasPlayerAccess=true;
            }
        }
        // Resource literals are the only closed tag effects retained here.
        // Any source binding/reference to their root makes that literal's
        // builtin identity uncertain. This is deliberately conservative across
        // scopes; it supplies no Image/Buffer or SDK result authority.
        if(node.type==='Identifier'&&resourceRoots.has(node.name))resourceBindings.add(node.name);
        if(['FunctionDeclaration','FunctionExpression','Class','Enum','Namespace','ForOf'].includes(node.type)&&resourceRoots.has(node.name))resourceBindings.add(node.name);
        if(node.type==='Declaration')for(const decl of node.decls||[])if(resourceRoots.has(decl.name))resourceBindings.add(decl.name);
        if(Array.isArray(node.params))for(const name of node.params)if(resourceRoots.has(name))resourceBindings.add(name);
        if(node.type==='Unknown'||node.type==='Identifier'&&
            (['globalThis','global','window','self','eval','Function','Reflect','arguments'].includes(node.name)||
                node.name==='this'&&!classThis(ancestors))||
            node.type==='Member'&&node.name==='constructor'||node.type==='Index'&&!safeIndex(node))unsafe=true;
        if(node.type==='Identifier'&&node.name==='info'&&sdk.has(node)){
            const receiver=parent?.type==='Member'&&parent.object===node?parent:null;
            const selected=players.has(receiver?.name);
            if(selected)hasPlayerAccess=true;
            const member=selected&&grandparent?.type==='Member'&&grandparent.object===receiver?grandparent:receiver;
            const call=selected?ancestors.at(-3):grandparent;
            const arities=selected?playerArities:rootArities;
            if(!member||!call||call.type!=='Call'||call.callee!==member||call.isNew||call.constructorCall||
                call.optional||member.optional||receiver.optional||call.typeArguments?.length||
                !arities.has(member.name)||!Array.isArray(call.args)||call.args.length!==arities.get(member.name)||
                call.args.some(arg=>arg?.type==='Spread'))unsafe=true;
            else if(member.name==='score')candidates.push(call);
        }
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node,parent,[...ancestors,node]);
    };
    visit(program);
    // Consumers that do not use the added player surface retain the complete
    // original seven-call policy, including its independently tested limits.
    if(!hasPlayerAccess)return ordinaryPrimitiveSdkNumberCalls(program);
    if(tags.some(tag=>typeof tag!=='string'||!resourceTags.has(tag)||resourceBindings.has(tag.split('.')[0])))unsafe=true;
    return new WeakSet(unsafe?[]:candidates);
}

// Builtin CameraProperty members are compile-time Number enum leaves; the
// translator emits each as its declared numeric literal. Only an unshadowed
// builtin root qualifies, and any write, delete, extraction or alias of that
// root invalidates every leaf in the program.
const CAMERA_PROPERTY_MEMBERS = Object.freeze(['X','Y','Left','Right','Top','Bottom']);
export function ordinaryCameraPropertyNumberLeaves(program) {
    const sdk=staticSdkNamespaceReceivers(program),candidates=[];
    let unsafe=false;
    const rootOf=node=>{while(['Member','Index'].includes(node?.type))node=node.object;return node;};
    const visit=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)visit(value,parent);return;}
        if(node.type==='Identifier'&&node.name==='CameraProperty'&&sdk.has(node)){
            const member=parent?.type==='Member'&&parent.object===node?parent:null;
            if(!member||member.optional||!CAMERA_PROPERTY_MEMBERS.includes(member.name))unsafe=true;
            else candidates.push(member);
        }
        if(node.type==='Assignment'||node.type==='Update'||node.type==='Unary'&&node.op==='delete'){
            const root=rootOf(node.type==='Assignment'?node.left:node.argument);
            if(root?.type==='Identifier'&&root.name==='CameraProperty'&&sdk.has(root))unsafe=true;
        }
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node);
    };
    visit(program);
    return new WeakSet(unsafe?[]:candidates);
}

// Builtin numeric values: `randint(a, b)`, `Infinity`, `NaN` and the Number-valued members of
// the unshadowed builtin `Math` namespace. Any source declaration, parameter
// or write of `randint`, or any write/extraction of `Math`, invalidates all.
const MATH_NUMBER_MEMBERS = Object.freeze(['abs','acos','asin','atan','atan2','ceil','clamp','constrain','cos','exp','floor',
    'icos','idiv','imul','isin','log','map','max','min','pow','random','randomRange','round','roundWithPrecision','sign','sin',
    'sqrt','tan','trunc','E','LN10','LN2','LOG10E','LOG2E','PI','SQRT1_2','SQRT2']);
export function ordinaryMathNumberCalls(program) {
    const sdk=staticSdkNamespaceReceivers(program),candidates=[];
    let randintBound=false,mathUnsafe=false;const bound=new Set(),constants=[];
    const rootOf=node=>{while(['Member','Index'].includes(node?.type))node=node.object;return node;};
    const visit=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const value of node)visit(value,parent);return;}
        if(node.type==='Declaration'&&(node.decls||[]).some(decl=>decl.name==='randint'))randintBound=true;
        if(node.type==='Declaration')for(const decl of node.decls||[])bound.add(decl.name);
        if(['FunctionDeclaration','FunctionExpression','Class','Enum','Namespace'].includes(node.type)&&node.name)bound.add(node.name);
        if(Array.isArray(node.params))for(const name of node.params)bound.add(name);
        if(node.type==='Identifier'&&['Infinity','NaN'].includes(node.name)&&!(parent?.type==='Member'&&parent.object!==node&&parent.name===node.name))constants.push(node);
        if(['FunctionDeclaration','FunctionExpression','Class','Enum','Namespace'].includes(node.type)&&node.name==='randint')randintBound=true;
        if(Array.isArray(node.params)&&node.params.includes('randint'))randintBound=true;
        if(node.type==='Assignment'||node.type==='Update'||node.type==='Unary'&&node.op==='delete'){
            const root=rootOf(node.type==='Assignment'?node.left:node.argument);
            if(root?.type==='Identifier'&&root.name==='randint')randintBound=true;
            if(root?.type==='Identifier'&&['Infinity','NaN'].includes(root.name))bound.add(root.name);
            if(root?.type==='Identifier'&&root.name==='Math'&&sdk.has(root))mathUnsafe=true;
        }
        if(node.type==='Identifier'&&node.name==='Math'&&sdk.has(node)&&!(parent?.type==='Member'&&parent.object===node))mathUnsafe=true;
        if(node.type==='Call'&&!node.isNew&&!node.typeArguments?.length&&!node.args?.some(arg=>arg?.type==='Spread')){
            const callee=node.callee;
            if(callee?.type==='Identifier'&&callee.name==='randint'&&node.args.length===2)candidates.push({node,kind:'randint'});
            if(callee?.type==='Member'&&!callee.optional&&callee.object?.type==='Identifier'&&callee.object.name==='Math'&&sdk.has(callee.object)&&MATH_NUMBER_MEMBERS.includes(callee.name))candidates.push({node,kind:'math'});
        }
        if(node.type==='Member'&&!node.optional&&node.object?.type==='Identifier'&&node.object.name==='Math'&&sdk.has(node.object)&&/^[A-Z0-9_]+$/.test(node.name)&&MATH_NUMBER_MEMBERS.includes(node.name)&&!(parent?.type==='Call'&&parent.callee===node))candidates.push({node,kind:'math'});
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,node);
    };
    visit(program);
    // `Infinity` and `NaN` are global Number values unless the program binds or writes them.
    const constantSafe=name=>!bound.has(name);
    return new WeakSet([...candidates.filter(({kind})=>kind==='randint'?!randintBound:!mathUnsafe).map(({node})=>node),
        ...constants.filter(node=>constantSafe(node.name))]);
}
