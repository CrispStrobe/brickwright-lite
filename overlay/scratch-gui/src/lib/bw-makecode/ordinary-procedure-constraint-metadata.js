// Signature obligations only; annotations never mint producer values.
export const TYPES=Object.freeze({number:'Number',string:'String',boolean:'Boolean',any:'Any'});
const fail=message=>{throw Error('Procedure parameter constraint: '+message);};
function actualAnyDefaultPrologue(fn) {
 const defaults=fn.parameterDefaults||[];
 if(!Array.isArray(defaults)||defaults.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return false;
 if(!defaults.length)return true;
 if(fn.parameterDefaultPrologue!==true||new Set(defaults.map(row=>row.name)).size!==defaults.length)return false;
 const expected=defaults.map(({name,value})=>({type:'If',test:{type:'Binary',op:'===',left:{type:'Identifier',name},right:{type:'Undefined'}},consequent:[{type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name},right:value}}],alternate:[]}));
 return defaults.every(row=>row&&Object.keys(row).length===2&&Object.hasOwn(row,'value')&&fn.params.includes(row.name)&&fn.optionalParams?.includes(row.name)&&fn.paramTypes?.[row.name]?.text==='any')&&JSON.stringify(fn.body?.slice(0,defaults.length))===JSON.stringify(expected);
}
export function constraints(fn,explicit=false) {
 if(fn?.bwCallableDefinition || fn?.bwClassCallableMethod || fn?.bwObjectClass || !fn?.params?.length)return [];
 const annotated=fn.params.filter(name=>fn.paramTypes?.[name]?.text);
 if(!annotated.length)return [];
 // Reference/callable routes remain independently checked, outside this protocol.
 if(annotated.some(name=>!TYPES[fn.paramTypes[name].text]))return [];
 const optional=fn.optionalParams||[],firstOptional=fn.params.findIndex(name=>optional.includes(name));
 const optionalAny=optional.every(name=>fn.params.includes(name)&&fn.paramTypes?.[name]?.text==='any')&&(firstOptional<0||fn.params.slice(firstOptional).every(name=>optional.includes(name)));
 if(!optionalAny||!actualAnyDefaultPrologue(fn)||fn.defaultParams&&Object.keys(fn.defaultParams).length||fn.restParam||fn.typeParameters?.length){if(explicit)fail('optional typed/default/rest/generic parameters are outside the primitive protocol');return [];}
 return annotated.map(name=>Object.freeze({name,type:TYPES[fn.paramTypes[name].text]}));
}
