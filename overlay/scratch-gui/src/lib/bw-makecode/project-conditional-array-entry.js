import {isProjectJsonSnapshot} from './project-json-snapshot.js';
import {createOrdinaryExportSymbols} from './ordinary-export-symbols.js';
import {HELPERS} from './arcade-runtime.js';

// A private occurrence-readiness certificate. Concrete control values and Array
// identities below never become public producer, element, or Number facts.
const own=Object.hasOwn,keys=Reflect.ownKeys,get=Object.getOwnPropertyDescriptor,proto=Object.getPrototypeOf;
const array=Array.isArray,finite=Number.isFinite,integer=Number.isSafeInteger,num=Number,same=Object.is;
const ambient=[],aliases=[],realm=globalThis;
for(const name of ['Object','Array','Number','String','Boolean','Symbol','RegExp','Reflect','Math','JSON','Map','Set','WeakMap','WeakSet'])aliases.push([name,get(realm,name)]);
for(const object of [Object,Array,Number,String,Boolean,Symbol,RegExp,Reflect,Math,JSON,Map,Set,WeakMap,WeakSet,
    Object.prototype,Array.prototype,Number.prototype,String.prototype,Boolean.prototype,Symbol.prototype,RegExp.prototype,
    Map.prototype,Set.prototype,WeakMap.prototype,WeakSet.prototype,proto([][Symbol.iterator]()),
    proto(new Map()[Symbol.iterator]()),proto(new Set()[Symbol.iterator]()),HELPERS,...Object.values(HELPERS),
    ...Object.values(HELPERS).map(helper=>helper.deps)]){
    const names=keys(object);ambient.push({object,parent:proto(object),names,rows:names.map(name=>get(object,name))});
}
const sameDescriptor=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    own(a,'value')===own(b,'value')&&(own(a,'value')?same(a.value,b.value)&&a.writable===b.writable:a.get===b.get&&a.set===b.set);
const ambientCurrent=()=>{
    for(let i=0;i<aliases.length;i++)if(!sameDescriptor(aliases[i][1],get(realm,aliases[i][0])))return false;
    for(let i=0;i<ambient.length;i++){
        const r=ambient[i],names=keys(r.object);
        if(proto(r.object)!==r.parent||names.length!==r.names.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==r.names[j]||!sameDescriptor(get(r.object,names[j]),r.rows[j]))return false;
    }
    return true;
};
const exact=(value,names)=>!!value&&typeof value==='object'&&!array(value)&&keys(value).length===names.length&&names.every(n=>own(value,n));
const field=(node,name)=>{const v=node.fields?.[name];return array(v)&&(v.length===1||v.length===2&&v[1]===null)?v[0]:null;};
const identifier=name=>typeof name==='string'&&/^[A-Za-z_]\w*$/.test(name)&&!own(Object.prototype,name);
const ident=name=>{const v=String(name||'v').replace(/[^A-Za-z0-9_]/g,'_');return /^[0-9]/.test(v)?'_'+v:v;};
// These are the current exporter's actual variable escapes, not type facts.
const reserved=new Set(['score','life','info','game','scene','sprites','controller','Math','function','let','var',
    'if','else','while','for','return','true','false','null','new','this','pause','forever','__bwSdkCharCode','__bwSdkConcat',
    '__bwScratchTimerStart','__bwScratchTimer','__bwResetScratchTimer','SpriteKind','SpriteFlag','ControllerButtonEvent',
    'DialogLayout','Image','Buffer','NumberFormat','console','control','assets','images','image','hex','img','undefined','bwStringArraySettings']);
const lexical=new Set(('break case catch class const continue debugger default delete do else enum export extends false finally '+
    'for function if import in instanceof new null return super switch this throw true try typeof var void while with let static yield '+
    'await implements interface package private protected public namespace type declare abstract readonly as any boolean number string '+
    'never unknown undefined constructor arguments eval score life lives info game scene sprites controller Math String Number Boolean '+
    'Array Object JSON Reflect Infinity NaN randint pause screen music Sounds parseInt parseFloat isNaN isFinite Sprite Image Buffer Font '+
    'self _t _g sprite otherSprite').split(' '));
const helperBases=new Set(['_na','_stopAll','_broadcast','_backdrops','_backdropNames','_bd','_setBackdrop','_backdropHats','__bwStartup',
    '__bwAnimationAssets','__bwAnimationFrames','__bwAnimationFreshFrames','__bwAnimationInterval','__bwSongAssets','__bwNamedParseValue',
    '__bwNamedJsonValue','__bwScratchMin','__bwScratchMax','__bwArrayAccess','__bwControllerAxisStep','__bwLiteralNegativeZero']);
for(const helper of Object.values(HELPERS))for(const match of helper.ts.matchAll(/(?:^|\n)(?:function|class|let|const)\s+([A-Za-z_$][\w$]*)/g))helperBases.add(match[1]);
const helperFamilies=[/^__bwArt_/,/^__bwFrames_/,/^__bwNamedArray_/,/^__bwAnimationFrames[0-9]+_*$/,
    /^__bw(?:Unary|Binary|Compare)(?:Add|Subtract|Multiply|Divide|Remainder|Power|BitAnd|BitOr|BitXor|ShiftLeft|ShiftRight|UnsignedShiftRight|BitNot|Equal|NotEqual|StrictEqual|StrictNotEqual|Less|Greater|LessEqual|GreaterEqual)_*$/,
    /^__bwNamedArray(?:Get|Set|Push|Pop|Shift|Unshift|Insert|Remove|Length|IndexOf|Contains|Reverse|Sort|Join|Slice|Concat)_*$/];
const helperName=name=>helperFamilies.some(r=>r.test(name))||[...helperBases].some(base=>name===base||name.startsWith(base)&&/^_+$/.test(name.slice(base.length)));
const binary=new Set(['+','-','*','/','%','**','&','|','^','<<','>>','>>>']);
const comparisons=new Set(['==','!=','===','!==','<','<=','>','>=']);
const numericShadows=new Set(['math_number','math_integer','math_whole_number','math_positive_number','math_angle']);
const arithmetic={operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],operator_multiply:['NUM1','NUM2'],
    operator_divide:['NUM1','NUM2'],operator_mod:['NUM1','NUM2']};
const grammar={
    arcade_whenSourceStarts:[[],[],'root'],arcade_whenRegisteredPaint:[['TOKEN'],[],'root'],
    procedures_definition:[['custom_block'],[],'root'],procedures_prototype:[[],[],'prototype'],procedures_call:[[],[],'command'],
    arcade_declareSourceScalar:[['VARIABLE'],['TYPE'],'command'],arcade_declareSourceReference:[['VARIABLE'],['TYPE'],'command'],
    data_setvariableto:[['VALUE'],['VARIABLE'],'command'],data_variable:[[],['VARIABLE'],'value'],
    arcade_setLocal:[['NAME','VALUE'],[],'command'],arcade_getLocal:[['NAME'],[],'value'],
    arcade_registerPaintHandler:[['TOKEN','CAPTURES'],[],'command'],arcade_returnValue:[['VALUE'],[],'command'],
    control_if:[['CONDITION','SUBSTACK'],[],'command'],control_if_else:[['CONDITION','SUBSTACK','SUBSTACK2'],[],'command'],
    looks_hide:[[],[],'command'],arrays_createReference:[['VALUES'],[],'value'],
    arrays_mutateReference:[['ARRAY','OP','INDEX','VALUE'],[],'command'],arrays_referenceIndexOf:[['ARRAY','VALUE','INDEX'],[],'value'],
    arrays_referenceLength:[['ARRAY'],[],'value'],
    arrays_valueBinary:[['LEFT','RIGHT'],['OP'],'value'],arrays_valueCompare:[['LEFT','RIGHT'],['OP'],'value'],
    arrays_valueUnary:[['VALUE'],['OP'],'value'],arrays_valueTruthy:[['VALUE'],[],'value'],arrays_specialValue:[[],['KIND'],'value'],
    operator_equals:[['OPERAND1','OPERAND2'],[],'value'],operator_lt:[['OPERAND1','OPERAND2'],[],'value'],
    operator_gt:[['OPERAND1','OPERAND2'],[],'value'],operator_not:[['OPERAND'],[],'value'],text:[[],['TEXT'],'shadow']
};
for(const name of Object.keys(arithmetic))grammar[name]=[arithmetic[name],[],'value'];
for(const name of numericShadows)grammar[name]=[[],['NUM'],'shadow'];
const denied=Object.freeze({current:()=>true,writerBefore:()=>null});

export function createProjectConditionalArrayEntry(context){
    const {project,targets,scopes,records,calls,owners,invalid,globalCell,implicitEntries}=context;
    if(!ambientCurrent()||!isProjectJsonSnapshot(project))return denied;
    const fail=()=>{throw refusal;},refusal=Object.freeze({}),need=value=>{if(!value)fail();};
    const physical=new WeakMap(),byCell=new Map(),byId=new Map(),globalWrites=new Map(),byScope=new Map(),callRows=new Map();
    const snapshots=[],checks=[],observations=new WeakMap(),tokens=new WeakSet(),globals=new Map(),executed=new Set(),active=new Set();
    let source=null,paint=null,registration=null,symbols,expired=false,steps=0;
    // Derived bridge records are not source authority. Retain their actual data
    // descriptors so an observed cell/call/owner replacement cannot renew a fact.
    const retain=(object,names,all=false)=>{
        const parent=proto(object);need(parent===(array(object)?Array.prototype:Object.prototype));
        const rows=names.map(name=>get(object,name));need(rows.every(row=>row&&own(row,'value')));
        snapshots.push({object,parent,names,rows,all});
    };
    const retainArray=value=>{need(array(value));retain(value,keys(value),true);};
    const literal=(target,node,name)=>{
        const slot=node.inputs[name];if(slot?.[0]!==1)return null;
        const v=slot[1];if(array(v))return v.length===2&&v[0]===10&&typeof v[1]==='string'?v[1]:null;
        const child=target.blocks[v];return child?.opcode==='text'?field(child,'TEXT'):null;
    };
    const binding=(target,name,id)=>{
        const r=byId.get(id);return r&&r.name===name&&(r.target===target||r.target.isStage)?r:null;
    };
    const directBinding=(target,node)=>{
        const row=node.fields.VARIABLE;return array(row)&&row.length===2?binding(target,row[0],row[1]):null;
    };
    try{
        need(targets===project.targets&&array(targets)&&array(scopes)&&array(records)&&array(calls)&&targets.filter(t=>t.isStage).length===1);
        need(array(project.extensions)&&new Set(project.extensions).size===project.extensions.length&&project.extensions.includes('arcade')&&
            project.extensions.includes('arrays')&&project.extensions.every(v=>['arcade','arrays'].includes(v)));
        need(project.extensionURLs==null||Object.entries(project.extensionURLs).every(([name,url])=>name==='arrays'&&url==='https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js'));
        retainArray(scopes);retainArray(records);retainArray(calls);
        const stage=targets.find(t=>t.isStage),targetNames=new Set(),emittedCells=new Set();
        for(const target of targets){
            need(typeof target.name==='string'&&typeof target.isStage==='boolean'&&!targetNames.has(target.name));targetNames.add(target.name);
            need(target.blocks&&!array(target.blocks)&&!Object.keys(target.lists||{}).length&&!Object.keys(target.broadcasts||{}).length);
            const names=new Set();
            for(const [id,row]of Object.entries(target.variables||{})){
                need(typeof id==='string'&&!own(Object.prototype,id)&&array(row)&&row.length===2&&identifier(row[0])&&!byId.has(id)&&!names.has(row[0]));
                names.add(row[0]);
                need(!['score','life','lives'].includes(row[0]));
                if(target!==stage)need(!Object.values(stage.variables||{}).some(v=>v[0]===row[0]));
                let emitted=ident(target.isStage?row[0]:target.name+'_'+row[0]);if(reserved.has(emitted))emitted+='_';
                need(!emittedCells.has(emitted)&&!lexical.has(emitted));emittedCells.add(emitted);
                const c=globalCell(target,id);need(c&&c.global&&!c.formal&&!byCell.has(c)&&array(c.writers));
                const r={target,id,name:row[0],cell:c,emitted};byId.set(id,r);byCell.set(c,r);globalWrites.set(c,[]);
                retain(c,['global','formal','writers']);retainArray(c.writers);
                checks.push(()=>!c.directBad);
            }
            for(const [id,node]of Object.entries(target.blocks)){
                need(!own(Object.prototype,id)&&node&&typeof node==='object'&&!physical.has(node));physical.set(node,{target,id});
                need(keys(node).every(k=>['opcode','inputs','fields','parent','next','shadow','topLevel','mutation','x','y','comment'].includes(k)));
            }
        }
        for(const monitor of project.monitors||[]){
            const r=byId.get(monitor.id);need(r&&monitor.visible===false&&monitor.mode==='default'&&monitor.opcode==='data_variable'&&
                exact(monitor.params,['VARIABLE'])&&monitor.params.VARIABLE===r.name&&monitor.spriteName===(r.target.isStage?null:r.target.name));
        }
        symbols=createOrdinaryExportSymbols(project);need(symbols.current());
        const fnNames=new Set(symbols.values());
        const localName=name=>identifier(name)&&!emittedCells.has(name)&&!lexical.has(name)&&!reserved.has(name)&&!fnNames.has(name)&&!helperName(name);
        for(const scope of scopes){
            need(scope&&scope.target&&targets.includes(scope.target)&&scope.target.blocks[scope.id]===scope.root&&
                !scope.invalid&&!scope.unknownEntry&&!implicitEntries?.has(scope)&&array(scope.params)&&array(scope.ids)&&!scope.params.length&&!scope.ids.length);
            need(!byScope.has(scope));byScope.set(scope,{calls:[],paintReachable:false});
            retain(scope,['target','root','id','proc','params','ids','callers']);retainArray(scope.params);retainArray(scope.ids);retainArray(scope.callers);
            checks.push(()=>!scope.invalid&&!scope.unknownEntry&&!implicitEntries?.has(scope));
            if(scope.root.opcode==='arcade_whenSourceStarts'){need(!source);source=scope;}
            else if(scope.root.opcode==='arcade_whenRegisteredPaint'){need(!paint);paint=scope;}
            else need(scope.root.opcode==='procedures_definition'&&identifier(ident(scope.proc))&&symbols.name(scope.target,scope.proc));
        }
        need(source);
        const seen=new Set(),expectedRecords=new Set(),procedureScopes=new Map();
        for(const scope of scopes)if(scope.proc){
            let map=procedureScopes.get(scope.target);if(!map)procedureScopes.set(scope.target,map=new Map());
            need(!map.has(scope.proc));map.set(scope.proc,scope);
        }
        const inline=(target,v,fallback)=>{
            need(array(v));
            if(v.length===2&&[4,5,6,7,8,10].includes(v[0]))need(typeof v[1]==='string'||v[0]<=8&&typeof v[1]==='number'&&finite(v[1]));
            else need(!fallback&&v.length===3&&v[0]===12&&binding(target,v[1],v[2]));
        };
        const visit=(scope,node,parent,shadow,kind,inactive=false)=>{
            need(node&&!seen.has(node));seen.add(node);need(seen.size<=10000);
            need(!invalid.has(node));checks.push(()=>!invalid.has(node));
            const p=physical.get(node);need(p&&p.target===scope.target&&node.parent===parent&&node.shadow===shadow&&node.topLevel===(parent===null));
            p.scope=scope;
            need(node.next===null||typeof node.next==='string');
            const schema=own(grammar,node.opcode)&&grammar[node.opcode];need(schema);
            const [inputs,fields,role]=schema;need(exact(node.inputs,inputs)&&exact(node.fields,fields));
            if(kind==='root')need(role==='root');
            else if(kind==='statement')need(role==='command');
            else if(kind==='prototype')need(role==='prototype'&&scope.root.inputs.custom_block?.[1]===p.id);
            else need(role==='value'||role==='shadow');
            need(shadow===(role==='shadow'||role==='prototype'));
            if(kind!=='root'&&kind!=='statement')need(node.next===null);
            if(inactive)need(role==='shadow');
            if(kind!=='prototype'&&!inactive){
                need(owners.get(node)===scope&&!invalid.has(node));expectedRecords.add(node);
                checks.push(()=>owners.get(node)===scope&&!invalid.has(node));
            }
            for(const name of fields)need(name==='VARIABLE'?!!directBinding(scope.target,node):
                typeof field(node,name)==='string'||name==='NUM'&&typeof field(node,name)==='number'&&finite(field(node,name)));
            if(node.opcode==='procedures_prototype'||node.opcode==='procedures_call'){
                const m=node.mutation;need(m&&m.tagName==='mutation'&&array(m.children)&&!m.children.length&&m.warp==='false'&&
                    keys(m).every(k=>['tagName','children','proccode','argumentids','argumentnames','argumentdefaults','warp'].includes(k))&&m.argumentids==='[]');
                if(node.opcode==='procedures_prototype')need(m.proccode===scope.proc&&m.argumentnames==='[]'&&m.argumentdefaults==='[]');
                else{
                    const fn=procedureScopes.get(scope.target)?.get(m.proccode);need(fn&&symbols.call(scope.target,node));
                    const row=calls.filter(c=>c.node===node);need(row.length===1&&row[0].scope===scope&&row[0].target===scope.target&&row[0].fn===fn&&array(row[0].args)&&!row[0].args.length);
                    callRows.set(node,row[0]);byScope.get(fn).calls.push(row[0]);retain(row[0],keys(row[0]),true);retainArray(row[0].args);
                }
            }else need(node.mutation==null);
            if(node.opcode==='data_setvariableto'){
                const r=directBinding(scope.target,node);globalWrites.get(r.cell).push(node);
            }
            if(['arcade_declareSourceScalar','arcade_declareSourceReference'].includes(node.opcode)){
                const raw=node.inputs.VARIABLE?.[1];need(array(raw)&&raw[0]===12&&binding(scope.target,raw[1],raw[2]));
                need(node.opcode==='arcade_declareSourceScalar'?['Number','String','Boolean'].includes(field(node,'TYPE')):
                    ['number[]','string[]','boolean[]'].includes(field(node,'TYPE')));
            }
            if(['arcade_getLocal','arcade_setLocal'].includes(node.opcode))need(localName(literal(scope.target,node,'NAME')));
            if(node.opcode==='arrays_valueBinary')need(binary.has(field(node,'OP')));
            if(node.opcode==='arrays_valueCompare')need(comparisons.has(field(node,'OP')));
            if(node.opcode==='arrays_valueUnary')need(['+','-','~','!'].includes(field(node,'OP')));
            if(node.opcode==='arrays_specialValue')need(['null','undefined'].includes(field(node,'KIND')));
            if(node.opcode==='arrays_createReference')need(literal(scope.target,node,'VALUES')==='[]');
            if(node.opcode==='arrays_mutateReference')need(literal(scope.target,node,'OP')==='push');
            if(node.opcode==='arcade_returnValue'){
                const v=scope.target.blocks[node.inputs.VALUE?.[1]];
                need(scope!==source&&node.next===null&&v?.opcode==='arrays_specialValue'&&field(v,'KIND')==='undefined');
            }
            if(node.opcode==='arcade_registerPaintHandler'){need(!registration&&scope===source);registration=node;}
            for(const [name,slot]of Object.entries(node.inputs)){
                need(array(slot)&&[1,2,3].includes(slot[0])&&slot.length===(slot[0]===3?3:2));
                const sub=name==='SUBSTACK'||name==='SUBSTACK2';if(sub)need(slot[0]===2&&typeof slot[1]==='string');
                for(let i=1;i<slot.length;i++){
                    const v=slot[i];
                    if(array(v)){need(!sub);inline(scope.target,v,i===2);if(v[0]===12)need(i===1&&slot[0]!==1);}
                    else{
                        need(typeof v==='string'&&own(scope.target.blocks,v));
                        visit(scope,scope.target.blocks[v],p.id,i===2||slot[0]===1,
                            sub?'statement':name==='custom_block'?'prototype':'input',inactive||i===2);
                    }
                }
            }
            if(node.next!==null){need(own(scope.target.blocks,node.next));visit(scope,scope.target.blocks[node.next],p.id,false,'statement',inactive);}
        };
        for(const scope of scopes)visit(scope,scope.root,null,false,'root');
        need(seen.size===targets.reduce((n,t)=>n+Object.keys(t.blocks).length,0)&&records.length===expectedRecords.size&&callRows.size===calls.length);
        for(const r of records){need(expectedRecords.delete(r.node)&&physical.get(r.node).scope===r.scope&&physical.get(r.node).target===r.target);retain(r,keys(r),true);}
        for(const scope of scopes){const actual=byScope.get(scope).calls;need(scope.callers.length===actual.length&&actual.every(c=>scope.callers.includes(c)));}
        need(!!paint===!!registration);
        if(paint)need(paint.target===physical.get(registration).target&&literal(paint.target,paint.root,'TOKEN')&&
            literal(paint.target,paint.root,'TOKEN')===literal(paint.target,registration,'TOKEN')&&literal(paint.target,registration,'CAPTURES')==='');
        if(registration){
            // Once paint is registered it can change startup control inputs.
            // Only a final direct source statement leaves no continuation whose
            // private scalar evaluation would assume those callbacks stay idle.
            let tail=null,node=source.target.blocks[source.root.next];const direct=new Set();
            while(node){need(!direct.has(node));direct.add(node);tail=node;node=source.target.blocks[node.next];}
            need(tail===registration);
        }
        const cycle=new Set(),done=new Set();
        const inspect=scope=>{
            need(!cycle.has(scope));if(done.has(scope))return;cycle.add(scope);
            for(const c of calls)if(c.scope===scope)inspect(c.fn);
            cycle.delete(scope);done.add(scope);
        };
        for(const scope of scopes)inspect(scope);
        const mark=scope=>{if(byScope.get(scope).paintReachable)return;byScope.get(scope).paintReachable=true;for(const c of calls)if(c.scope===scope)mark(c.fn);};
        if(paint)mark(paint);
        // Bind the actual all-writer entries now; filtered/missing reset entries
        // cannot be smuggled back as a new reset-discount or producer theorem.
        for(const [c,r]of byCell){
            r.writers=new Map();
            for(const w of c.writers){
                need(globalWrites.get(c).includes(w.node)&&w.scope===physical.get(w.node).scope&&w.target===physical.get(w.node).target&&!r.writers.has(w.node));
                r.writers.set(w.node,w);retain(w,keys(w),true);
                if(w.value)retain(w.value,keys(w.value),true);
            }
        }
        const scalar=v=>v===null||v===undefined||['number','string','boolean'].includes(typeof v);
        const tick=()=>need(++steps<=100000);
        const observe=node=>{
            tick();let rows=observations.get(node);if(!rows)observations.set(node,rows=[]);
            rows.push(new Map(globals));
        };
        const read=r=>{need(r&&globals.has(r.cell));return globals.get(r.cell).value;};
        const numberValue=v=>{need(typeof v==='number'&&finite(v));return v;};
        const binaryValue=(op,a,b)=>{
            numberValue(a);numberValue(b);let v;
            switch(op){case '+':v=a+b;break;case '-':v=a-b;break;case '*':v=a*b;break;case '/':v=a/b;break;
            case '%':v=a%b;break;case '**':v=a**b;break;case '&':v=a&b;break;case '|':v=a|b;break;case '^':v=a^b;break;
            case '<<':v=a<<b;break;case '>>':v=a>>b;break;case '>>>':v=a>>>b;break;default:fail();}
            return numberValue(v);
        };
        const compareValue=(op,a,b)=>{
            // Avoid Scratch's alternate string comparison and opaque coercions.
            numberValue(a);numberValue(b);
            switch(op){case '==':case '===':return a===b;case '!=':case '!==':return a!==b;
            case '<':return a<b;case '<=':return a<=b;case '>':return a>b;case '>=':return a>=b;default:fail();}
        };
        const inputValue=(node,name,frame)=>{
            const v=node.inputs[name][1];
            if(array(v)){
                if(v[0]===12)return read(binding(frame.scope.target,v[1],v[2]));
                if(v[0]===10)return v[1];return numberValue(num(v[1]));
            }
            return value(frame.scope.target.blocks[v],frame);
        };
        const value=(node,frame)=>{
            observe(node);const op=node.opcode;
            if(numericShadows.has(op))return numberValue(num(field(node,'NUM')));
            if(op==='text')return field(node,'TEXT');
            if(op==='arrays_specialValue')return field(node,'KIND')==='null'?null:undefined;
            if(op==='data_variable')return read(directBinding(frame.scope.target,node));
            if(op==='arcade_getLocal'){const name=literal(frame.scope.target,node,'NAME');need(frame.locals.has(name));return frame.locals.get(name);}
            if(op==='arrays_createReference'){const token={elements:[],published:false};tokens.add(token);return token;}
            if(op==='arrays_valueBinary'){
                const a=inputValue(node,'LEFT',frame),b=inputValue(node,'RIGHT',frame);return binaryValue(field(node,'OP'),a,b);
            }
            if(own(arithmetic,op)){
                const a=inputValue(node,'NUM1',frame),b=inputValue(node,'NUM2',frame);
                // Scratch modulo adjusts a negative remainder's sign. Enroll
                // only the range where it agrees with the emitted native %.
                if(op==='operator_mod')need(typeof a==='number'&&a>=0&&typeof b==='number'&&b>0);
                return binaryValue({operator_add:'+',operator_subtract:'-',operator_multiply:'*',operator_divide:'/',operator_mod:'%'}[op],a,b);
            }
            if(op==='arrays_valueCompare'){
                const a=inputValue(node,'LEFT',frame),b=inputValue(node,'RIGHT',frame);return compareValue(field(node,'OP'),a,b);
            }
            if(['operator_equals','operator_lt','operator_gt'].includes(op)){
                const a=inputValue(node,'OPERAND1',frame),b=inputValue(node,'OPERAND2',frame);
                return compareValue({operator_equals:'===',operator_lt:'<',operator_gt:'>'}[op],a,b);
            }
            if(op==='operator_not'){const a=inputValue(node,'OPERAND',frame);need(typeof a==='boolean');return !a;}
            if(op==='arrays_valueTruthy'){const a=inputValue(node,'VALUE',frame);need(scalar(a)||tokens.has(a));return !!a;}
            if(op==='arrays_valueUnary'){
                const a=inputValue(node,'VALUE',frame),selector=field(node,'OP');
                if(selector==='!'){need(scalar(a)||tokens.has(a));return !a;}
                numberValue(a);return numberValue(selector==='+'?a:selector==='-'?-a:~a);
            }
            if(op==='arrays_referenceIndexOf'){
                // Exact private startup effects only; no element/presence fact
                // leaves the interpreter. Keep the original socket order.
                const receiver=inputValue(node,'ARRAY',frame),item=inputValue(node,'VALUE',frame),from=inputValue(node,'INDEX',frame);
                need(tokens.has(receiver)&&scalar(item)&&integer(from)&&from>=0);
                for(let i=from;i<receiver.elements.length;i++)if(receiver.elements[i]===item)return i;
                return -1;
            }
            fail();
        };
        const run=(scope,depth=0)=>{
            need(depth<64&&!active.has(scope));active.add(scope);
            const frame={scope,locals:new Map()};
            const chain=start=>{
                for(let node=scope.target.blocks[start];node;node=scope.target.blocks[node.next]){
                    observe(node);executed.add(node);const op=node.opcode;
                    if(op==='data_setvariableto'){
                        const r=directBinding(scope.target,node),v=inputValue(node,'VALUE',frame),w=r.writers.get(node);
                        need(w&&(scalar(v)||tokens.has(v)));if(tokens.has(v))v.published=true;
                        globals.set(r.cell,{value:v,writer:w});
                    }else if(op==='arcade_setLocal'){
                        const v=inputValue(node,'VALUE',frame);need(scalar(v)||tokens.has(v));frame.locals.set(literal(scope.target,node,'NAME'),v);
                    }else if(op==='procedures_call'){
                        const c=callRows.get(node);need(c);run(c.fn,depth+1);
                    }else if(op==='control_if'||op==='control_if_else'){
                        const condition=inputValue(node,'CONDITION',frame);need(typeof condition==='boolean');
                        const slot=condition?'SUBSTACK':op==='control_if_else'?'SUBSTACK2':null;
                        if(slot&&chain(node.inputs[slot][1]))return true;
                    }else if(op==='arrays_mutateReference'){
                        const receiver=inputValue(node,'ARRAY',frame);
                        // Push cannot change receiver identity; forbid mutation
                        // of an already published body in this initial theorem.
                        need(tokens.has(receiver)&&!receiver.published);
                        const index=inputValue(node,'INDEX',frame),v=inputValue(node,'VALUE',frame);
                        need(index===0&&scalar(v)&&receiver.elements.length<10000);receiver.elements.push(v);
                    }else if(op==='arcade_registerPaintHandler'){
                        need(node===registration);inputValue(node,'TOKEN',frame);inputValue(node,'CAPTURES',frame);
                    }else if(op==='arcade_returnValue'){
                        need(inputValue(node,'VALUE',frame)===undefined);return true;
                    }else if(op==='arcade_declareSourceScalar'||op==='arcade_declareSourceReference'){
                        // Native prelude resets precede threads. A declaration
                        // validates its real binding; it does not reset a write.
                    }else if(op!=='looks_hide')fail();
                }
                return false;
            };
            chain(scope.root.next);active.delete(scope);
        };
        run(source);
        need(!registration||observations.has(registration));
    }catch(_){return denied;}

    const current=()=>{
        if(expired)return false;
        try{
            if(!ambientCurrent()||!symbols.current())expired=true;
            for(let i=0;!expired&&i<snapshots.length;i++){
                const r=snapshots[i];
                if(proto(r.object)!==r.parent||r.all&&keys(r.object).length!==r.names.length){expired=true;break;}
                for(let j=0;j<r.names.length;j++)if(!sameDescriptor(get(r.object,r.names[j]),r.rows[j])){expired=true;break;}
            }
            for(let i=0;!expired&&i<checks.length;i++)if(!checks[i]())expired=true;
        }catch(_){expired=true;}
        return !expired;
    };
    const stable=new Map();
    const resultFor=(c,scope,node)=>{
        const r=byCell.get(c),p=physical.get(node);if(!r||!p||p.scope!==scope||!byScope.has(scope))return null;
        if(!stable.has(c)){
            const all=globalWrites.get(c),entries=r.writers;
            stable.set(c,all.length>0&&all.length===entries.size&&all.every(n=>executed.has(n)&&
                !byScope.get(physical.get(n).scope).paintReachable));
        }
        if(!stable.get(c))return null;
        let writer=null;
        const accept=state=>{
            const v=state?.get(c);
            if(!v||!tokens.has(v.value)||!c.writers.includes(v.writer)||writer&&writer!==v.writer)return false;
            writer=v.writer;return true;
        };
        const rows=observations.get(node)||[];
        if(rows.some(state=>!accept(state)))return null;
        const busy=new Set();
        const covered=s=>{
            if(busy.has(s))return false;busy.add(s);
            let ok;
            if(s===source)ok=true;
            else if(s===paint)ok=!!registration&&(observations.get(registration)||[]).length>0&&
                observations.get(registration).every(accept)&&accept(globals);
            else{
                const cs=byScope.get(s).calls;
                ok=cs.length>0&&cs.every(call=>{
                    // Every real source invocation was evaluated. An untaken
                    // source callsite gets no speculative completion credit.
                    return (observations.has(call.node)||byScope.get(call.scope).paintReachable)&&covered(call.scope);
                });
            }
            busy.delete(s);return ok;
        };
        if(!covered(scope)||!rows.length&&!byScope.get(scope).paintReachable)return null;
        return writer;
    };
    return Object.freeze({current,writerBefore(cell,scope,node){
        if(!current())return null;
        try{
            const result=resultFor(cell,scope,node);
            if(!result)return null;
            return current()?result:null;
        }catch(_){expired=true;return null;}
    }});
}
