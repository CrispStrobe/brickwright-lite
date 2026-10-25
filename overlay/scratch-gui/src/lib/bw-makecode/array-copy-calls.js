/** Fresh, shallow array copies use the reference heap. Named-array JSON
 * reporters have different identity and cannot substitute for these calls.
 */
export function arrayCopyCall(translator, node) {
    if (node?.callee?.type !== 'Member' || !translator.isArrayReference(node.callee.object)) return null;
    const operation = node.callee.name, args = node.args || [];
    if (!['slice', 'concat'].includes(operation)) return null;
    const receiver = translator.expr(node.callee.object);
    if (operation === 'slice') {
        if (args.length > 2) {
            translator.note('Array.slice() accepts only optional start and end'); return 'undefined value';
        }
        const value = index => args[index] ? translator.arrayElementValue(args[index]) : 'undefined value';
        return `slice array reference (${receiver}) from (${value(0)}) to (${value(1)})`;
    }
    if (args.length !== 1 || !translator.isArrayReference(args[0])) {
        translator.note('PXT Array.concat() requires exactly one typed array argument'); return 'undefined value';
    }
    return `concatenate array reference (${receiver}) with (${translator.expr(args[0])})`;
}
