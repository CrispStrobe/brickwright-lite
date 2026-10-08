/** Seed known PXT resource types without treating annotations as runtime casts.
 * Unknown names (including user aliases and callable types) add no constraints.
 * Array element nodes preserve arbitrary nesting without flattened type names.
 */
export function applyDeclaredValueType(graph, key, annotation) {
    const text = String(annotation || '').replace(/\s+/g, '');
    if (!text || /[|&=]/.test(text)) return;
    if (text.endsWith('[]')) {
        graph.add(key, 'array');
        applyDeclaredValueType(graph, graph.element(key), text.slice(0, -2));
        return;
    }
    if (text.startsWith('Array<') && text.endsWith('>')) {
        graph.add(key, 'array');
        applyDeclaredValueType(graph, graph.element(key), text.slice(6, -1));
        return;
    }
    const type = {'mp.Player': 'Player', Image: 'Image', Sprite: 'Sprite', 'tiles.Location': 'TileLocation',
        'animation.Animation': 'Animation', 'scene.Scene': 'Scene', ArcadePhysicsEngine: 'PhysicsEngine',
        number: 'number', string: 'string', boolean: 'boolean'}[text];
    if (type) graph.add(key, type);
}
