import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

export const LIVE_FONT_NAMES = Object.freeze(['font5', 'font8', 'font12']);
export const LIVE_FONT_PROPERTIES = Object.freeze(['charWidth', 'charHeight']);

/** Preserve an actual SDK property read as one atomic source value. Neither
 * the font object nor its numeric field is copied or constant-folded. */
export function lowerLiveFontMetrics(program) {
    const sdk = staticSdkNamespaceReceivers(program);
    const visit = (node, target = false) => {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(value => visit(value, target));
        const font = node.object;
        if (!target && node.type === 'Member' && LIVE_FONT_PROPERTIES.includes(node.name) &&
            font?.type === 'Member' && LIVE_FONT_NAMES.includes(font.name) &&
            font.object?.type === 'Identifier' && font.object.name === 'image' && sdk.has(font.object)) {
            return {type: 'FontMetric', font: font.name, property: node.name};
        }
        if (node.type === 'Assignment') return {...node, left: visit(node.left, true), right: visit(node.right)};
        if (node.type === 'Update') return {...node, argument: visit(node.argument, true)};
        if (node.type === 'Index') return {...node, object: visit(node.object, target), index: visit(node.index)};
        return Object.fromEntries(Object.entries(node).map(([key, value]) =>
            [key, value && typeof value === 'object' ? visit(value, target) : value]));
    };
    return visit(program);
}
