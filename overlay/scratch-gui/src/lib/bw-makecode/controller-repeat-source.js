/** Fixed SDK Button objects are stable receivers, not temporary scalar values.
 * Callers must separately verify lexical SDK namespace resolution. This table
 * does not admit user objects, dynamic button lookups or arbitrary SDK members.
 */
export function fixedControllerRepeatReceiver(node) {
    if(node?.type!=='Member'||!['repeatDelay','repeatInterval'].includes(node.name))return false;
    const path=value=>value?.type==='Identifier'?value.name:value?.type==='Member'?path(value.object)+'.'+value.name:'';
    return /^controller(?:\.player[1-4])?\.(?:A|B|up|down|left|right)$/.test(path(node.object));
}
