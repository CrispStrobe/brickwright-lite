// Actual connected body proof for the first saved-field/conditional generic
// method shape. The adapter must bind blocks and literals to their real owner.
export function inspectClassConditionalBody(adapter,method,{className,receiverParameter,validateFollowup}) {
    const fail=message=>{throw Error('Class conditional body: '+message);};
    const {block,input,literal,definition}=adapter,seen=new Set();
    const get=(id,parent)=>{const row=block(id);if(!row||row.parent!==parent||seen.has(id))fail('missing, shared or cyclic connected body');seen.add(id);return row;};
    const reporter=(row,name,opcode)=>{const result=get(input(row,name),row.id);if(result.opcode!==opcode)fail('unqualified '+name+' producer');return result;};
    const local=(row,name,expected)=>{const value=reporter(row,name,'arcade_getLocal');if(literal(value,'NAME')!==expected)fail('local producer differs from its actual binding');return value;};
    const unique=(name,names)=>{if(!/^[A-Za-z_]\w*$/.test(name||'')||names.has(name))fail('duplicate or invalid current local');names.add(name);return name;};
    const emptyArgs=(row,name)=>{let value;try{value=JSON.parse(literal(row,name));}catch{fail('computed or malformed ordered arguments');}if(!Array.isArray(value)||value.length)fail('unexpected ordered arguments');};
    const flow=method.resultFlow;
    if(!flow||flow.schema!=='bw-class-result-flow/v1'||flow.present!=='callback'||flow.absent!=='undefined'||method.parameters.length!==1)fail('missing method result-flow constraints');
    const generics=method.typeParameters,callback=method.parameters[0].callableSignature;
    if(Object.keys(flow).some(key=>!['schema','presenceField','absent','present'].includes(key))||generics?.length!==1||
        generics[0].constraint!==''||generics[0].defaultType!==''||method.returnType!==generics[0].name||
        method.callableSignature?.result?.kind!=='named'||method.callableSignature.result.name!==generics[0].name||
        callback?.kind!=='callable'||callback.parameters?.length!==1||callback.result?.kind!=='named'||callback.result.name!==generics[0].name||
        method.parameters[0].type!=='callable'||JSON.stringify(method.callableSignature.parameters?.[0]?.type)!==JSON.stringify(callback))fail('conditional result constraints differ from the actual generic callback signature');
    const action=method.parameters[0].name,names=new Set([receiverParameter,action]);
    const root=block(definition);if(!root||root.opcode!=='procedures_definition')fail('missing actual procedure definition');
    const save=get(root.next,root.id);if(save.opcode!=='arcade_setLocal')fail('method must first save its actual receiver field');
    const saved=unique(literal(save,'NAME'),names),field=reporter(save,'VALUE','arcade_objectField');
    if(literal(field,'FIELD')!==flow.presenceField)fail('presence field differs');local(field,'OBJECT',receiverParameter);
    const condition=get(save.next,save.id);if(condition.opcode!=='control_if')fail('method requires its actual presence branch');
    const truth=reporter(condition,'CONDITION','arrays_valueTruthy');local(truth,'VALUE',saved);
    const result=get(input(condition,'SUBSTACK'),condition.id);if(result.opcode!=='arcade_setLocal')fail('present arm must retain the action result');
    const output=unique(literal(result,'NAME'),names),call=reporter(result,'VALUE','arcade_callCallable');local(call,'CALLABLE',action);
    const argument=reporter(call,'ARGS','arcade_functionArgument');local(argument,'VALUE',saved);emptyArgs(argument,'REST');
    let id=result.next,previous=result.id,returned=false;const followups=[];
    while(id){const row=get(id,previous);
        if(row.opcode==='arcade_returnValue'){local(row,'VALUE',output);if(row.next)fail('statements follow the present return');returned=true;break;}
        if(row.opcode!=='arcade_setLocal')fail('present followup is not a proved serial method call');
        unique(literal(row,'NAME'),names);
        const follow=reporter(row,'VALUE','arcade_callObjectMethod');local(follow,'OBJECT',saved);emptyArgs(follow,'ARGS');
        const name=literal(follow,'METHOD');if(validateFollowup(name,follow)!==true)fail('followup has no current Void producer proof');
        followups.push(follow);previous=id;id=row.next;
    }
    if(!returned)fail('present path has no action-result return');
    const absent=get(condition.next,condition.id);if(absent.opcode!=='arcade_returnValue'||absent.next)fail('absent path must return actual Undefined');
    const undefinedValue=get(input(absent,'VALUE'),absent.id);
    if(undefinedValue.opcode!=='arrays_valueUndefined'&&!(undefinedValue.opcode==='arrays_specialValue'&&undefinedValue.fields?.KIND&&adapter.field(undefinedValue,'KIND')==='undefined'))fail('absent result is not an actual Undefined producer');
    return Object.freeze({fieldReadBlock:field,procedure:method.procedure,className,memberName:method.name,receiverParameter,
        savedName:saved,resultName:output,condition,call,followups:Object.freeze(followups),presentReturn:block(id),absentReturn:absent});
}
