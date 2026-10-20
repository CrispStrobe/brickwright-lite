/** Apply string operations to a proven string value, including a typed array
 * element. Unknown/reference values stay diagnosed instead of being coerced
 * through a Scratch text slot.
 */
export function indexedStringValue(translator, node) {
    if (node?.type === 'Member' && node.name === 'length' && node.object?.type === 'Index' && translator.strictStringReferences?.has(node.object)) {
        return `length of (${translator.expr(node.object)})`;
    }
    if (node?.type !== 'Call' || node.callee?.type !== 'Member' || node.callee.name !== 'charCodeAt') return null;
    const receiver = node.callee.object;
    if (!translator.strictStringReferences?.has(receiver)) {
        translator.note('String.charCodeAt() receiver must be a proven string value'); return 'undefined value';
    }
    if (node.args.length !== 1) {
        translator.note('String.charCodeAt() requires exactly one index'); return 'undefined value';
    }
    const index = node.args[0];
    const numericConstant = index.type === 'Identifier' && ['NaN', 'Infinity'].includes(index.name) && !translator.bindsName(index.name);
    if (!numericConstant && !translator.primitiveReferences?.has(index)) {
        translator.note('String.charCodeAt() index requires a proven primitive value'); return 'undefined value';
    }
    return `char code of text (${translator.expr(receiver)}) at (${translator.arrayElementValue(node.args[0])})`;
}
