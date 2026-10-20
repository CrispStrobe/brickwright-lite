// Internal producer alternatives. These never become a serialized signature or
// a runtime value, and an annotation cannot add an alternative.
export const alternatives=value=>value?.alternatives||[value];
export function joinProducedValues(values) {
    const rows=[];
    for(const value of values.flatMap(alternatives))if(!rows.some(row=>
        JSON.stringify(row.type)===JSON.stringify(value.type)&&row.instance===value.instance&&
        row.node===value.node&&row.env===value.env&&row.genericOrigin===value.genericOrigin&&
        row.absentReturn===value.absentReturn&&row.absenceField===value.absenceField))rows.push(value);
    if(!rows.length)throw Error('Class branch proof has no produced alternatives');
    if(rows.every(row=>row===rows[0]))return rows[0];
    const same=rows.every(row=>JSON.stringify(row.type)===JSON.stringify(rows[0].type));
    return {type:same?rows[0].type:null,alternatives:rows};
}
export function presenceAlternatives(value,present) {
    const rows=alternatives(value);
    if(rows.some(row=>!row.instance&&row.type?.name!=='undefined'))
        throw Error('Class branch presence requires actual ordinary object or Undefined producers');
    const selected=rows.filter(row=>Boolean(row.instance)===present);
    // An empty arm still needs independent body proof. Retain its known
    // producer rather than inventing an object from a declaration.
    return selected.length?joinProducedValues(selected):value;
}
