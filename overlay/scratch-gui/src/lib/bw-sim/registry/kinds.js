// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The mechanism kind registries (docs/ROBOT-LAB-ARCHITECTURE.md §6.2): what a
// connector pairs with and which edge it makes, which couplings the compiler
// finds between joints, and which joint kinds a CompiledMechanism may hold.
// Adding a mechanism is a kind module plus part metadata — never an `if` in
// mech/graph.js, mech/gears.js or contracts.js.
//
// As registry/hubs.js does for hubs, a registry is an INSTANCE: the Sim Lab
// uses the built-in one (kinds/index.js), and a test builds its own with a
// fixture kind beside the built-ins (`with(...)`) without mutating anything
// shared. This module imports nothing (contracts.js, the compiler and the
// physics side may all read it).

class Registry {
    /** @param {string} key the module field that names it @param {object[]} [modules] */
    constructor (key, modules = []) {
        this.key = key;
        this.modules = new Map();
        for (const m of modules) this.register(m);
    }

    register (module) {
        const id = module && module[this.key];
        if (typeof id !== 'string' || !id) throw new TypeError(`a kind module needs a string '${this.key}'`);
        if (this.modules.has(id)) throw new Error(`kind '${id}' is registered twice`);
        this._check(module);
        this.modules.set(id, Object.freeze(module));
        return this;
    }

    _check () {}

    has (id) {
        return this.modules.has(id);
    }

    get (id) {
        return this.modules.get(id) || null;
    }

    list () {
        return [...this.modules.values()];
    }

    /** A new registry of the same class with these modules added (this one stays as it is). */
    with (...modules) {
        return new this.constructor([...this.modules.values(), ...modules]);
    }
}

/**
 * Connector kinds. A module: {kind, shaft?: boolean, pairs?: [{with, edge(shaft, hole), match(shaft, hole)}],
 * validate?(connector): string[]}. A pair rule lives on the SHAFT side's kind (the connector that
 * goes into the other one): `edge` names the edge it makes ('rigid' | 'hinge' | 'ball' | … or null
 * for none) and `match` is the geometric test on the two connectors (model frame, LDU).
 */
export class ConnectorKindRegistry extends Registry {
    constructor (modules = []) {
        super('kind', modules);
    }

    _check (m) {
        for (const r of m.pairs || []) {
            if (typeof r.with !== 'string' || typeof r.edge !== 'function' || typeof r.match !== 'function') {
                throw new TypeError(`connector kind '${m.kind}': a pair rule is {with, edge(shaft, hole), match(shaft, hole)}`);
            }
        }
    }

    /** The rule for `shaftKind` going into `holeKind`, or null. */
    rule (shaftKind, holeKind) {
        const m = this.modules.get(shaftKind);
        return (m && m.pairs && m.pairs.find(r => r.with === holeKind)) || null;
    }

    /**
     * Whether two connectors of different parts join, and how: a tries as the shaft first,
     * then b (mech/graph.js's order since v1).
     * @returns {{shaft: object, hole: object, kind: string}|null}
     */
    pair (a, b) {
        for (const [s, h] of [[a, b], [b, a]]) {
            const r = this.rule(s.type, h.type);
            if (!r) continue;
            const kind = r.edge(s, h);
            if (kind && r.match(s, h)) return {shaft: s, hole: h, kind};
        }
        return null;
    }
}

/**
 * Coupling kinds. A module: {id, kind (the CouplingV2 kind it emits), validate?(c, m): string[],
 * and ONE of
 *   mesh: {accepts(type1, type2): boolean, contact(g1, g2): {P}|null, ratio?(g1, h1, g2, h2, P)}
 *         — a tooth mesh between two parts' `gear` tooth sets; mech/gears.js applies the
 *         common-frame / gear-on-frame rules every mesh shares;
 *   detect(ctx): {couplings, welds?, diagnostics?} — a free detector run after the meshes
 *         (ctx: {nodes, islands, joints, jointEntries, catalog}).
 * `bodies?(c, m)`: the two bodies a coupling of this kind ties (for the no-collide pairs).
 */
export class CouplingKindRegistry extends Registry {
    constructor (modules = []) {
        super('id', modules);
    }

    _check (m) {
        if (typeof m.kind !== 'string' || !m.kind) throw new TypeError(`coupling module '${m.id}' needs the kind it emits`);
        if (!m.mesh === !m.detect) throw new TypeError(`coupling module '${m.id}' needs exactly one of mesh, detect`);
    }

    /** The mesh module for two tooth types, in registration order, or null. */
    meshFor (t1, t2) {
        for (const m of this.modules.values()) if (m.mesh && m.mesh.accepts(t1, t2)) return m;
        return null;
    }

    detectors () {
        return this.list().filter(m => m.detect);
    }

    /** The module that emits coupling kind `kind` (the first one registered), or null. */
    ofKind (kind) {
        for (const m of this.modules.values()) if (m.kind === kind) return m;
        return null;
    }
}

/** Joint kinds a CompiledMechanism may hold. A module: {type, dof: number, validate?(j): string[]}. */
export class JointKindRegistry extends Registry {
    constructor (modules = []) {
        super('type', modules);
    }
}
