import {isProjectJsonSnapshot} from './project-json-snapshot.js';
import {createOrdinaryExportSymbols} from './ordinary-export-symbols.js';
import {HELPERS} from './arcade-runtime.js';

// This issuer exposes arithmetic occurrences only. Its private cell facts are
// neither variable type facts nor an initialization service for other issuers.
const own=Object.hasOwn,keys=Reflect.ownKeys,get=Object.getOwnPropertyDescriptor,proto=Object.getPrototypeOf;
const array=Array.isArray,finite=Number.isFinite,number=Number,sameValue=Object.is,realm=globalThis;
const aliases=[],ambient=[];
for(const name of ['Object','Array','Number','String','Boolean','Symbol','RegExp','Reflect','Math','JSON','Map','Set','WeakMap','WeakSet'])aliases.push([name,get(realm,name)]);
for(const object of [Object,Array,Number,String,Boolean,Symbol,RegExp,Reflect,Math,JSON,Map,Set,WeakMap,WeakSet,Object.prototype,Array.prototype,Symbol.prototype,RegExp.prototype,
    Number.prototype,String.prototype,Boolean.prototype,Map.prototype,Set.prototype,WeakMap.prototype,WeakSet.prototype,
    proto([][Symbol.iterator]()),proto(new Map()[Symbol.iterator]()),proto(new Set()[Symbol.iterator]()),
    HELPERS,...Object.values(HELPERS),...Object.values(HELPERS).map(helper=>helper.deps)]){
    const names=keys(object);ambient.push({object,parent:proto(object),names,descriptors:names.map(name=>get(object,name))});
}
const descriptorSame=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    own(a,'value')===own(b,'value')&&(own(a,'value')?sameValue(a.value,b.value)&&a.writable===b.writable:a.get===b.get&&a.set===b.set);
const ambientCurrent=()=>{
    for(let i=0;i<aliases.length;i++)if(!descriptorSame(aliases[i][1],get(realm,aliases[i][0])))return false;
    for(let i=0;i<ambient.length;i++){
        const row=ambient[i],names=keys(row.object);
        if(proto(row.object)!==row.parent||names.length!==row.names.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.names[j]||!descriptorSame(get(row.object,names[j]),row.descriptors[j]))return false;
    }
    return true;
};
const exact=(value,names)=>!!value&&typeof value==='object'&&!array(value)&&keys(value).length===names.length&&names.every(name=>own(value,name));
const field=(node,name)=>{const row=node.fields[name];return array(row)&&(row.length===1||row.length===2&&row[1]===null)?row[0]:null;};
const binary=new Set(['+','-','*','/','%','**','&','|','^','<<','>>','>>>']);
const compare=new Set(['==','!=','===','!==','<','<=','>','>=']);
const shadows=new Set(['math_number','math_integer','math_whole_number','math_positive_number','math_angle']);
const specialCells=new Set(['score','life','lives','info','game','scene','sprites','controller','Math','Number','String',
    'Boolean','Array','Object','JSON','Reflect','Infinity','NaN','undefined']);
// Mirror the actual exporter's variable spelling locally. This comparison is
// hygiene only; neither spelling nor a reserved-name escape establishes a fact.
const ident=name=>{
    const text=String(name||'v').replace(/[^A-Za-z0-9_]/g,'_');
    return /^[0-9]/.test(text)?'_'+text:text;
};
const reserved=new Set(['score','life','info','game','scene','sprites','controller','Math','function','let','var',
    'if','else','while','for','return','true','false','null','new','this','pause','forever',
    '__bwSdkCharCode','__bwSdkConcat','__bwScratchTimerStart','__bwScratchTimer','__bwResetScratchTimer',
    'SpriteKind','SpriteFlag','ControllerButtonEvent','DialogLayout','Image','Buffer','NumberFormat','console',
    'control','assets','images','image','hex','img','undefined','bwStringArraySettings']);
const formalKeywords=new Set(('break case catch class const continue debugger default delete do else enum export extends false finally '+
    'for function if import in instanceof new null return super switch this throw true try typeof var void while with let static yield '+
    'await implements interface package private protected public namespace type declare abstract readonly as any boolean number string '+
    'never unknown undefined constructor arguments eval').split(' '));
// These bindings are reached by this closed opcode census. Reserve their
// actual lexical names, including generated declarations and allocator suffixes.
// HELPERS and each source record are descriptor-stamped above: deleting a name
// or changing its TypeScript cannot silently enlarge this hygiene domain.
const sdkBindings=new Set(['randint','pause','screen','music','Sounds','Math','String','Number','Boolean','Array','Object','JSON',
    'Infinity','NaN','parseInt','parseFloat','isNaN','isFinite','Sprite','Image','Buffer','Font','self','_t','_g','sprite','otherSprite']);
const helperBases=new Set(['_na','_stopAll','_broadcast','_backdrops','_backdropNames','_bd','_setBackdrop','_backdropHats',
    '__bwStartup','__bwAnimationAssets','__bwAnimationFrames','__bwAnimationFreshFrames','__bwAnimationInterval','__bwSongAssets',
    '__bwNamedParseValue','__bwNamedJsonValue','__bwScratchMin','__bwScratchMax','__bwArrayAccess','__bwControllerAxisStep','__bwLiteralNegativeZero']);
for(const helper of Object.values(HELPERS))for(const match of helper.ts.matchAll(/(?:^|\n)(?:function|class|let|const)\s+([A-Za-z_$][\w$]*)/g))helperBases.add(match[1]);
const helperFamilies=[/^__bwArt_/,/^__bwFrames_/,/^__bwNamedArray_/,/^__bwAnimationFrames[0-9]+_*$/,
    /^__bw(?:Unary|Binary|Compare)(?:Add|Subtract|Multiply|Divide|Remainder|Power|BitAnd|BitOr|BitXor|ShiftLeft|ShiftRight|UnsignedShiftRight|BitNot|Equal|NotEqual|StrictEqual|StrictNotEqual|Less|Greater|LessEqual|GreaterEqual)_*$/,
    /^__bwNamedArray(?:Get|Set|Push|Pop|Shift|Unshift|Insert|Remove|Length|IndexOf|Contains|Reverse|Sort|Join|Slice|Concat)_*$/];
const helperBinding=name=>helperFamilies.some(pattern=>pattern.test(name))||[...helperBases].some(base=>
    name===base||name.startsWith(base)&&/^_+$/.test(name.slice(base.length)));
const stock={operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],operator_multiply:['NUM1','NUM2'],
    operator_divide:['NUM1','NUM2'],operator_mod:['NUM1','NUM2'],operator_round:['NUM'],operator_random:['FROM','TO']};
const schemas={
    arcade_whenSourceStarts:[[],[],'root'],arcade_whenRegisteredPaint:[['TOKEN'],[],'root'],
    procedures_definition:[['custom_block'],[],'root'],procedures_prototype:[null,[],'prototype'],
    procedures_call:[null,[],'command'],arcade_callFunction:[['NAME','ARGS'],[],'either'],
    arcade_functionArgument:[['VALUE','REST'],[],'value'],
    arcade_declareSourceScalar:[['VARIABLE'],['TYPE'],'command'],arcade_declareSourceReference:[['VARIABLE'],['TYPE'],'command'],
    arcade_declareParameterConstraint:[[],['PROCEDURE','PARAMETER','TYPE'],'command'],
    data_setvariableto:[['VALUE'],['VARIABLE'],'command'],data_variable:[[],['VARIABLE'],'value'],
    arcade_setLocal:[['NAME','VALUE'],[],'command'],arcade_getLocal:[['NAME'],[],'value'],
    argument_reporter_string_number:[[],['VALUE'],'value'],argument_reporter_boolean:[[],['VALUE'],'value'],
    arcade_returnValue:[['VALUE'],[],'command'],arcade_registerPaintHandler:[['TOKEN','CAPTURES'],[],'command'],
    control_if:[['CONDITION','SUBSTACK'],[],'command'],control_if_else:[['CONDITION','SUBSTACK','SUBSTACK2'],[],'command'],
    arcade_sourceWhile:[['CONDITION','SUBSTACK'],[],'command'],control_wait:[['DURATION'],[],'command'],
    looks_hide:[[],[],'command'],arcade_splash:[['TITLE','SUBTITLE'],[],'command'],arcade_gameOver:[['WIN'],[],'command'],
    arcade_playSound:[['SOUND','UNTIL_DONE'],[],'command'],arcade_soundMelody:[[],['SOUND'],'value'],
    arcade_screenImage:[[],[],'value'],arcade_mutateImage:[['IMAGE','COLOR','TO'],['OP'],'command'],
    arcade_drawImage:[['IMAGE','X','Y','W','H','COLOR'],['OP'],'command'],
    arcade_printImageText:[['IMAGE','TEXT','X','Y','COLOR'],['FONT'],'command'],
    arcade_controllerStep:[['AXIS','STEP'],[],'value'],arcade_menu_axes:[[],['axes'],'shadow'],
    arcade_frameDeltaTime:[[],[],'value'],arcade_signNumber:[['NUM'],[],'value'],
    arcade_mathBinary:[['A','B'],['OP'],'value'],
    arrays_valueBinary:[['LEFT','RIGHT'],['OP'],'value'],arrays_valueCompare:[['LEFT','RIGHT'],['OP'],'value'],
    arrays_valueUnary:[['VALUE'],['OP'],'value'],arrays_valueTruthy:[['VALUE'],[],'value'],
    arrays_specialValue:[[],['KIND'],'value'],arrays_createReference:[['VALUES'],[],'value'],
    arrays_referenceItem:[['ARRAY','INDEX'],[],'value'],arrays_referenceIndexOf:[['ARRAY','VALUE','INDEX'],[],'value'],
    arrays_mutateReference:[['ARRAY','OP','INDEX','VALUE'],[],'command'],
    operator_equals:[['OPERAND1','OPERAND2'],[],'value'],operator_not:[['OPERAND'],[],'value'],
    text:[[],['TEXT'],'shadow'],colour_picker:[[],['COLOUR'],'shadow']
};
for(const name of Object.keys(stock))schemas[name]=[stock[name],[],'value'];
for(const name of shadows)schemas[name]=[[],['NUM'],'shadow'];
const denied=Object.freeze({current:()=>true,isNumberArithmeticResult:()=>false});

export function createProjectReadonlyNumberOperands(project){
    if(!ambientCurrent()||!isProjectJsonSnapshot(project))return denied;
    let expired=false,symbols;
    const owners=new WeakMap(),scopes=[],cells=new Map(),writers=new Map(),calls=[],registrations=[],paints=[];
    let source=null,stage=null,valid=true;
    const fail=()=>{throw new Error('Outside readonly Number operand domain');};
    const require=value=>{if(!value)fail();};
    const safeName=name=>typeof name==='string'&&name.length>0&&!own(Object.prototype,name);
    const literal=(target,node,name)=>{
        const slot=node.inputs[name],value=slot?.[1];
        if(slot?.[0]!==1)return null;
        if(array(value))return value.length===2&&value[0]===10&&typeof value[1]==='string'?value[1]:null;
        const child=target.blocks[value];return child?.opcode==='text'?field(child,'TEXT'):null;
    };
    const cell=(target,row)=>{
        if(!array(row)||row.length!==2||typeof row[0]!=='string'||typeof row[1]!=='string')return null;
        const c=cells.get(row[1]);return c&&c.name===row[0]&&(c.target===target||c.target===stage)?c:null;
    };
    const raw=(target,value)=>{
        require(array(value));
        if(value.length===2&&[4,5,6,7,8,9,10].includes(value[0])){
            require(typeof value[1]==='string'||value[0]<=8&&typeof value[1]==='number'&&finite(value[1]));return;
        }
        require(value.length===3&&value[0]===12&&cell(target,[value[1],value[2]]));
    };
    const list=value=>{try{const result=JSON.parse(value);return array(result)?result:null;}catch(_){return null;}};
    try{
        require(array(project.targets)&&project.targets.length>0&&project.targets.filter(t=>t.isStage).length===1);
        stage=project.targets.find(t=>t.isStage);
        require(array(project.extensions)&&new Set(project.extensions).size===project.extensions.length&&project.extensions.every(v=>['arcade','arrays'].includes(v)));
        require(project.extensionURLs==null||Object.entries(project.extensionURLs).every(([name,url])=>name==='arrays'&&url==='https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js'));
        const targetNames=new Set(),exportedCells=new Set();
        for(const target of project.targets){
            require(target&&typeof target.name==='string'&&typeof target.isStage==='boolean'&&target.blocks&&typeof target.blocks==='object'&&!array(target.blocks));
            require(!targetNames.has(target.name));targetNames.add(target.name);
            require(!Object.keys(target.lists||{}).length&&!Object.keys(target.broadcasts||{}).length);
            const names=new Set();
            for(const [id,row]of Object.entries(target.variables||{})){
                require(safeName(id)&&array(row)&&row.length===2&&safeName(row[0])&&/^[A-Za-z_][\w]*$/.test(row[0])&&
                    !specialCells.has(row[0])&&!names.has(row[0])&&!cells.has(id));
                require(row[1]===null||['string','number','boolean'].includes(typeof row[1]));
                names.add(row[0]);cells.set(id,{id,name:row[0],target});
            }
        }
        // Visibility and cell identity must not depend on a same-named fallback.
        for(const c of cells.values()){
            if(c.target!==stage)require(!Object.values(stage.variables||{}).some(row=>row[0]===c.name));
            let emitted=ident(c.target.isStage||Object.values(stage.variables||{}).some(row=>row[0]===c.name)?c.name:c.target.name+'_'+c.name);
            if(reserved.has(emitted))emitted+='_';
            require(!exportedCells.has(emitted)&&!sdkBindings.has(emitted));exportedCells.add(emitted);
        }
        require(array(project.monitors||[]));
        for(const monitor of project.monitors||[]){
            const c=cells.get(monitor.id);
            require(c&&monitor.opcode==='data_variable'&&monitor.visible===false&&monitor.mode==='default'&&
                exact(monitor.params,['VARIABLE'])&&monitor.params.VARIABLE===c.name&&
                (c.target===stage?monitor.spriteName===null:monitor.spriteName===c.target.name));
        }
        symbols=createOrdinaryExportSymbols(project);require(symbols.current());
        const functionNames=new Set(symbols.values());
        const protectedBinding=name=>exportedCells.has(name)||functionNames.has(name)||reserved.has(name)||
            formalKeywords.has(name)||specialCells.has(name)||sdkBindings.has(name)||helperBinding(name);
        const rootNodes=[];
        for(const target of project.targets){
            for(const [id,node]of Object.entries(target.blocks)){
                require(node&&typeof node==='object'&&!owners.has(node)&&safeName(id));
                require(keys(node).every(key=>['opcode','next','parent','inputs','fields','shadow','topLevel','x','y','mutation','comment'].includes(key)));
                require(typeof node.opcode==='string'&&node.inputs&&node.fields&&typeof node.shadow==='boolean'&&typeof node.topLevel==='boolean');
                require(node.next===null||typeof node.next==='string');
                owners.set(node,{target,id});if(node.topLevel)rootNodes.push(node);
            }
        }
        for(const node of rootNodes){
            const owner=owners.get(node),scope={root:node,target:owner.target,callers:[],formals:[],ids:[],code:null};
            require(node.parent===null&&!node.shadow);
            if(node.opcode==='arcade_whenSourceStarts'){require(!source);source=scope;}
            else if(node.opcode==='arcade_whenRegisteredPaint')paints.push(scope);
            else{
                require(node.opcode==='procedures_definition');
                const p=scope.target.blocks[node.inputs.custom_block?.[1]],m=p?.mutation;
                require(p?.opcode==='procedures_prototype'&&m&&typeof m.proccode==='string'&&symbols.name(scope.target,m.proccode));
                scope.code=m.proccode;scope.formals=list(m.argumentnames);scope.ids=list(m.argumentids);
                require(scope.formals&&scope.ids&&scope.formals.every(name=>safeName(name)&&/^[A-Za-z_]\w*$/.test(name)&&ident(name)===name));
                const emittedFormals=scope.formals.map(ident);
                require(new Set(emittedFormals).size===emittedFormals.length&&emittedFormals.every(name=>
                    !protectedBinding(name)));
            }
            scopes.push(scope);
        }
        require(source&&paints.length<=1);
        const visited=new Set();
        const walk=(scope,node,parent,shadow,kind,index,direct)=>{
            require(node&&!visited.has(node));visited.add(node);
            const o=owners.get(node);require(o&&o.target===scope.target&&node.parent===parent&&node.shadow===shadow&&node.topLevel===(parent===null));
            o.scope=scope;o.index=index;o.direct=direct;o.kind=kind;
            const schema=own(schemas,node.opcode)&&schemas[node.opcode];require(schema);
            const [inputs,fields,role]=schema;
            require(exact(node.fields,fields)&&(!inputs||exact(node.inputs,inputs)));
            for(const name of fields)require(array(node.fields[name])&&(name==='VARIABLE'?!!cell(scope.target,node.fields[name]):
                typeof field(node,name)==='string'||name==='NUM'&&typeof field(node,name)==='number'&&finite(field(node,name))));
            if(kind==='next'||kind==='root')require(['command','either','root'].includes(role));
            else if(kind==='substack')require(role==='command'||role==='either');
            else require(!['command','root'].includes(role));
            if(role==='root')require(kind==='root');
            if(role==='prototype')require(node.opcode==='procedures_prototype'&&parent===owners.get(scope.root).id&&kind==='custom_block');
            require(shadow===(role==='shadow'||role==='prototype'||node.opcode.startsWith('argument_reporter_')&&
                scope.target.blocks[parent]?.opcode==='procedures_prototype'));
            if(kind!=='next'&&kind!=='root'&&kind!=='substack')require(node.next===null);
            if(node.opcode!=='procedures_call'&&node.opcode!=='procedures_prototype')require(node.mutation==null);
            else{
                const m=node.mutation;
                require(m&&keys(m).every(k=>['tagName','children','proccode','argumentids','argumentnames','argumentdefaults','warp'].includes(k))&&
                    m.tagName==='mutation'&&array(m.children)&&m.children.length===0&&['false','true'].includes(m.warp));
                const ids=list(m.argumentids);require(ids&&exact(node.inputs,ids));
            }
            if(node.opcode==='arrays_valueBinary')require(binary.has(field(node,'OP')));
            if(node.opcode==='arrays_valueCompare')require(compare.has(field(node,'OP')));
            if(node.opcode==='arrays_valueUnary')require(['+','-','~','!','typeof','void'].includes(field(node,'OP')));
            if(node.opcode==='arrays_specialValue')require(['undefined','null','NaN','Infinity','-Infinity'].includes(field(node,'KIND')));
            if(node.opcode==='arcade_mathBinary')require(['min','max','atan2','randomRange'].includes(field(node,'OP')));
            if(node.opcode==='arcade_menu_axes')require(['x','y'].includes(field(node,'axes')));
            if(node.opcode==='arcade_soundMelody')require(['PowerUp','BaDing','Buzzer','JumpUp','JumpDown','PowerDown','MagicWand','Siren','Wawawawaa','Dadadadum','PewPew','Knock','Enter','Exit','Spooky','Beam','Footstep','Rustle','Click'].includes(field(node,'SOUND')));
            if(node.opcode==='arcade_mutateImage'||node.opcode==='arcade_drawImage'||node.opcode==='arcade_printImageText'){
                require(node.opcode==='arcade_mutateImage'?field(node,'OP')==='fill':node.opcode==='arcade_drawImage'?field(node,'OP')==='fillRect':field(node,'FONT')==='auto');
                require(scope.target.blocks[node.inputs.IMAGE?.[1]]?.opcode==='arcade_screenImage');
            }
            if(['arcade_setLocal','arcade_getLocal'].includes(node.opcode)){
                const name=literal(scope.target,node,'NAME');
                require(safeName(name)&&/^[A-Za-z_]\w*$/.test(name)&&ident(name)===name&&!protectedBinding(name));
                require(![...cells.values()].some(c=>(c.target===stage||c.target===scope.target)&&c.name===name));
            }
            if(node.opcode.startsWith('argument_reporter_'))require(scope.formals.includes(field(node,'VALUE')));
            if(node.opcode==='arcade_returnValue'){
                // The native frame<0 return path retires this callback thread.
                // Inventory only its canonical void exit, not a startup return
                // or an arbitrary callback expression/returned-value producer.
                const value=scope.target.blocks[node.inputs.VALUE?.[1]];
                require(scope.code!==null||scope===paints[0]&&node.next===null&&
                    value?.opcode==='arrays_specialValue'&&field(value,'KIND')==='undefined');
            }
            if(node.opcode==='data_setvariableto'){
                const c=cell(scope.target,node.fields.VARIABLE);require(c);
                if(!writers.has(c))writers.set(c,[]);writers.get(c).push(node);
            }
            if(['arcade_declareSourceScalar','arcade_declareSourceReference'].includes(node.opcode)){
                const v=node.inputs.VARIABLE?.[1];require(array(v)&&v[0]===12&&cell(scope.target,[v[1],v[2]]));
            }
            if(node.opcode==='arcade_declareParameterConstraint')require(field(node,'PROCEDURE')===scope.code&&scope.formals.includes(field(node,'PARAMETER'))&&['Number','String','Boolean'].includes(field(node,'TYPE')));
            if(node.opcode==='arrays_createReference'){
                // Inventory a closed literal allocation as an effect only. No
                // Array result or element is admitted as a Number operand.
                const values=list(literal(scope.target,node,'VALUES'));
                const closed=(value,depth)=>depth<64&&(value===null||['string','number','boolean'].includes(typeof value)||
                    array(value)&&value.every(v=>closed(v,depth+1)));
                require(values&&closed(values,0));
            }
            if(node.opcode==='arrays_mutateReference')require(['push','pop','shift','unshift','insert','remove','set','reverse'].includes(literal(scope.target,node,'OP')));
            if(node.opcode==='arcade_registerPaintHandler')registrations.push(node);
            if(node.opcode==='procedures_call'||node.opcode==='arcade_callFunction')calls.push(node);
            for(const [name,slot]of Object.entries(node.inputs)){
                require(array(slot)&&[1,2,3].includes(slot[0])&&slot.length===(slot[0]===3?3:2));
                const sub=name==='SUBSTACK'||name==='SUBSTACK2';
                if(sub)require(slot[0]===2&&typeof slot[1]==='string');
                for(let j=1;j<slot.length;j++){
                    const value=slot[j],childShadow=j===2||slot[0]===1;
                    if(array(value)){
                        require(!sub);raw(scope.target,value);
                        if(value[0]===12)require(slot[0]!==1&&j===1);
                        if(j===2)require(value[0]>=4&&value[0]<=10);
                    }
                    else{
                        require(typeof value==='string'&&own(scope.target.blocks,value));
                        walk(scope,scope.target.blocks[value],o.id,childShadow,sub?'substack':name==='custom_block'?'custom_block':'input',index,false);
                    }
                }
            }
            if(node.next!==null){
                require(own(scope.target.blocks,node.next));
                walk(scope,scope.target.blocks[node.next],o.id,false,'next',direct?index+1:index,direct);
            }
        };
        for(const scope of scopes)walk(scope,scope.root,null,false,'root',0,true);
        require(visited.size===project.targets.reduce((sum,t)=>sum+Object.keys(t.blocks).length,0));
        for(const node of calls){
            const o=owners.get(node);require(symbols.call(o.target,node));
            const code=node.opcode==='procedures_call'?node.mutation.proccode:literal(o.target,node,'NAME');
            const callee=scopes.find(s=>s.target===o.target&&s.code===code);require(callee);
            if(node.opcode==='arcade_callFunction'){
                let slot=node.inputs.ARGS,count=0;const seen=new Set();
                while(typeof slot[1]==='string'&&o.target.blocks[slot[1]]?.opcode==='arcade_functionArgument'){
                    const argument=o.target.blocks[slot[1]];require(!seen.has(argument));seen.add(argument);count++;slot=argument.inputs.REST;
                }
                require(count===callee.ids.length);
            }
            callee.callers.push(node);
        }
        require(registrations.length===paints.length);
        if(paints.length){
            const paint=paints[0],reg=registrations[0],o=owners.get(reg),token=literal(paint.target,paint.root,'TOKEN');
            require(typeof token==='string'&&token.length>0&&paint.target===o.target&&literal(o.target,reg,'TOKEN')===token&&literal(o.target,reg,'CAPTURES')==='');
            paint.registration=reg;
        }
    }catch(_){valid=false;}
    if(!valid)return denied;

    const current=()=>{
        if(expired)return false;
        try{if(!ambientCurrent()||!symbols.current())expired=true;}catch(_){expired=true;}
        return !expired;
    };
    // A prefix function is identified by its one actual zero-argument call,
    // never by a generated name. Its body cannot return past a required write.
    const prefixes=new Map([[source,[]]]),prefixActive=new Set();
    const prefix=scope=>{
        if(prefixes.has(scope))return prefixes.get(scope);
        if(prefixActive.has(scope)||scope.code===null||scope.ids.length||scope.callers.length!==1)return null;
        prefixActive.add(scope);
        const call=scope.callers[0],o=owners.get(call),parent=prefix(o.scope);
        let result=null;
        if(parent&&o.direct&&o.kind==='next'&&
            !Object.values(scope.target.blocks).some(n=>owners.get(n).scope===scope&&n.opcode==='arcade_returnValue'))result=[...parent,o.index];
        prefixActive.delete(scope);prefixes.set(scope,result);return result;
    };
    const position=node=>{const o=owners.get(node),p=prefix(o.scope);return p&&o.direct?[...p,o.index]:null;};
    const before=(a,b)=>{for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i])return a[i]<b[i];}return false;};
    const after=(writer,node,active=new Set())=>{
        const o=owners.get(node),wp=position(writer);if(!wp||!o||active.has(o.scope))return false;
        const p=prefix(o.scope);if(p)return before(wp,[...p,o.index]);
        const next=new Set(active);next.add(o.scope);
        if(o.scope.registration)return after(writer,o.scope.registration,next);
        return o.scope.code!==null&&o.scope.callers.length>0&&o.scope.callers.every(call=>after(writer,call,next));
    };
    const facts=new Map(),resolving=new Set();
    const operand=(target,node,name,active)=>{
        const value=node.inputs[name][1];
        if(array(value)){
            if(value.length===2&&[4,5,6,7,8].includes(value[0]))return finite(number(value[1]));
            if(value[0]===12){const c=cell(target,[value[1],value[2]]),writer=c&&prove(c);return !!writer&&after(writer,node);}
            return false;
        }
        return numeric(target,target.blocks[value],active);
    };
    const numeric=(target,node,active=new Set())=>{
        if(!node||active.has(node)||active.size>128)return false;
        const next=new Set(active);next.add(node);
        if(shadows.has(node.opcode))return finite(number(field(node,'NUM')));
        if(node.opcode==='arrays_specialValue')return ['NaN','Infinity','-Infinity'].includes(field(node,'KIND'));
        if(node.opcode==='data_variable'){
            const c=cell(target,node.fields.VARIABLE),writer=c&&prove(c);return !!writer&&after(writer,node);
        }
        if(node.opcode==='arrays_valueBinary')return operand(target,node,'LEFT',next)&&operand(target,node,'RIGHT',next);
        if(node.opcode==='arrays_valueUnary')return ['+','-','~'].includes(field(node,'OP'))&&operand(target,node,'VALUE',next);
        if(node.opcode==='arcade_mathBinary')return operand(target,node,'A',next)&&operand(target,node,'B',next);
        return own(stock,node.opcode)&&stock[node.opcode].every(name=>operand(target,node,name,next));
    };
    const reset=(target,node)=>{
        const v=node.inputs.VALUE[1],child=typeof v==='string'&&target.blocks[v];
        return child?.opcode==='arrays_specialValue'&&['null','undefined'].includes(field(child,'KIND'));
    };
    const prove=c=>{
        if(facts.has(c))return facts.get(c);
        if(resolving.has(c))return null;resolving.add(c);
        const all=writers.get(c)||[],ordered=all.map(node=>({node,at:position(node)}));let result=null;
        if(ordered.length&&ordered.every(row=>row.at)){
            ordered.sort((a,b)=>before(a.at,b.at)?-1:before(b.at,a.at)?1:0);
            const last=ordered[ordered.length-1].node;
            if(ordered.every((row,i)=>i===0||before(ordered[i-1].at,row.at))&&
                ordered.every(row=>row.node!==last&&reset(owners.get(row.node).target,row.node)||operand(owners.get(row.node).target,row.node,'VALUE',new Set()))&&
                paints.every(paint=>after(last,paint.registration)))result=last;
        }
        resolving.delete(c);facts.set(c,result);return result;
    };
    // A registration itself must be a once-only direct startup operation.
    if(registrations.some(node=>!position(node)))return denied;
    return Object.freeze({current,isNumberArithmeticResult(target,node){
        if(!current())return false;
        try{
            const o=node&&owners.get(node);
            return !!o&&o.target===target&&node.opcode==='arrays_valueBinary'&&numeric(target,node)&&current();
        }catch(_){expired=true;return false;}
    }});
}
