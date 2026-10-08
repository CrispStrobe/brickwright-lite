/** Value type constraints for aliases, procedure arguments and array elements.
 * This graph describes types, not runtime object identity. Cyclic arrays remain
 * finite graphs; they must not grow an unbounded sequence of nested type tags. */
export class ValueTypeGraph {
    constructor () {
        this.nodes = new Map();
        this.revision = 0;
    }

    node (key) {
        if (!this.nodes.has(key)) {
            const node = {parent: null, types: new Set(), element: null, properties: new Map()};
            node.parent = node;
            this.nodes.set(key, node);
        }
        let node = this.nodes.get(key);
        while (node.parent !== node) {
            node.parent = node.parent.parent;
            node = node.parent;
        }
        return node;
    }

    add (key, type) {
        const node = this.node(key);
        if (!node.types.has(type)) {
            node.types.add(type);
            this.revision++;
        }
    }

    has (key, type) {
        return this.node(key).types.has(type);
    }

    merge (a, b) {
        const pending = [[a, b]];
        while (pending.length) {
            const [left, right] = pending.pop();
            const x = this.node(left), y = this.node(right);
            if (x === y) continue;
            y.parent = x;
            for (const type of y.types) x.types.add(type);
            if (x.element && y.element) pending.push([x.element, y.element]);
            else if (y.element) x.element = y.element;
            for (const [name, value] of y.properties) {
                if (x.properties.has(name)) pending.push([x.properties.get(name), value]);
                else x.properties.set(name, value);
            }
            this.revision++;
        }
    }

    property (key, name) {
        const node = this.node(key);
        if (!node.properties.has(name)) {
            node.properties.set(name, Symbol(`property ${name}`));
            this.revision++;
        }
        return node.properties.get(name);
    }

    element (key) {
        const node = this.node(key);
        if (!node.element) {
            node.element = Symbol('array element');
            this.revision++;
        }
        return node.element;
    }

    arrayType (key, visiting = new Set()) {
        const node = this.node(key);
        if (visiting.has(node) || node.types.has('any')) return 'any';
        if (node.types.has('array') && [...node.types].some(type=>['Image','Sprite','TileLocation','Animation','Scene','PhysicsEngine','Player','number','string','boolean'].includes(type)))return 'any';
        if (node.types.has('array')) {
            visiting.add(node);
            const value = node.element ? this.arrayType(node.element, visiting) : 'any';
            visiting.delete(node);
            return `${value}[]`;
        }
        const types = [...node.types].filter(t => ['Image', 'Sprite', 'TileLocation', 'Animation','Scene','PhysicsEngine','Player', 'number', 'string', 'boolean'].includes(t));
        return types.length === 1 ? types[0] === 'Player' ? 'mp.Player' : types[0] === 'TileLocation' ? 'tiles.Location' : types[0] === 'Animation' ? 'animation.Animation' : types[0] === 'Scene' ? 'scene.Scene' : types[0] === 'PhysicsEngine' ? 'ArcadePhysicsEngine' : types[0] : 'any';
    }
}
