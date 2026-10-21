/**
 * Store every extension menu argument in the shape Scratch gives it.
 *
 * An extension menu with `acceptReporters: true` is an INPUT holding a shadow
 * `<extension>_menu_<MENU>` block (field `<MENU>`); any other menu is a FIELD on
 * the block. A block holding the other shape loads with an EMPTY dropdown:
 * Blockly rebuilds the block from the extension's definition and drops the
 * misplaced value, so the extension runs with the argument missing (the SPIKE
 * motor blocks sb3-creator built until 2026-10-21 had PORT as a field and threw
 * `this._peripheral.motorSettings[port] is undefined` when clicked).
 *
 * extension-menu-table.js (generated from the extensions' own getInfo()) says
 * which shape each argument takes. Two doors apply it:
 *
 *   - withMenuShapes (installed on the compiler at lib/sb3-creator-register-art.js)
 *     runs every project the Code tab builds through normalizeMenuArgs, and hands
 *     the compiler's readers (decompile, Python, JavaScript, MicroPython, C, BASIC)
 *     a view in which each menu value is readable as a field AND as an input, so a
 *     project built in the palette reads back as one the compiler built;
 *   - arcade-project-migration.js runs every loaded project through
 *     normalizeProjectMenuArgs, so projects saved with the old shape open repaired.
 *
 * Both are layered here rather than edited into sb3-creator.js, which Lite
 * vendors byte-identical to CrispStrobe/sb3-creator at its pin.
 */
import TABLE from './extension-menu-table.js';

/** `{menu, reporters}` for one menu argument of an extension block, or null. */
export const menuArgOf = (opcode, arg) => {
    const spec = Object.prototype.hasOwnProperty.call(TABLE, opcode) ? TABLE[opcode][arg] : undefined;
    if (!spec) return null;
    return spec[0] === '+' ? {menu: spec.slice(1), reporters: true} : {menu: spec, reporters: false};
};

/** The shadow opcode of a menu: `spikeprime_motorRunFor` + MULTIPLE_PORT -> spikeprime_menu_MULTIPLE_PORT. */
export const menuShadowOpcode = (opcode, menu) => `${opcode.slice(0, opcode.indexOf('_'))}_menu_${menu}`;

/** The literal value an input holds directly (a menu shadow's field or a text/number primitive), or undefined. */
const literalOf = (input, blocks) => {
    if (!Array.isArray(input)) return undefined;
    if (input[0] !== 1) return undefined; // 2/3: a reporter sits in the slot
    const inner = input[1];
    if (Array.isArray(inner)) return [4, 5, 6, 7, 8, 9, 10].includes(inner[0]) ? String(inner[1]) : undefined;
    const shadow = typeof inner === 'string' ? blocks[inner] : null;
    if (!shadow || !shadow.shadow) return undefined;
    const fields = Object.values(shadow.fields || {});
    return fields.length === 1 ? (Array.isArray(fields[0]) ? fields[0][0] : fields[0] && fields[0].value) : undefined;
};

/**
 * Repair one target's block map in place. `newId(used)` returns a fresh block id.
 * Returns the arguments that could not be repaired (a reporter dropped into a
 * slot that only takes a field), as `{id, opcode, arg}`.
 */
export const normalizeMenuArgs = (blocks, newId) => {
    const unresolved = [];
    if (!blocks || typeof blocks !== 'object') return unresolved;
    for (const [id, block] of Object.entries(blocks)) {
        if (!block || typeof block !== 'object' || block.shadow || typeof block.opcode !== 'string') continue;
        const args = Object.prototype.hasOwnProperty.call(TABLE, block.opcode) ? TABLE[block.opcode] : null;
        if (!args) continue;
        for (const arg of Object.keys(args)) {
            const {menu, reporters} = menuArgOf(block.opcode, arg);
            const field = block.fields && block.fields[arg];
            const input = block.inputs && block.inputs[arg];
            if (reporters && field !== undefined) {
                if (input === undefined) {
                    const value = Array.isArray(field) ? field[0] : field && field.value;
                    const shadowId = newId(blocks);
                    blocks[shadowId] = {
                        opcode: menuShadowOpcode(block.opcode, menu), next: null, parent: id,
                        inputs: {}, fields: {[menu]: [value, null]}, shadow: true, topLevel: false
                    };
                    block.inputs = block.inputs || {};
                    block.inputs[arg] = [1, shadowId];
                }
                delete block.fields[arg];
            } else if (!reporters && input !== undefined) {
                const value = literalOf(input, blocks);
                if (field === undefined && value === undefined) {
                    unresolved.push({id, opcode: block.opcode, arg});
                    continue;
                }
                if (field === undefined) {
                    block.fields = block.fields || {};
                    block.fields[arg] = [value, null];
                }
                const inner = input[1];
                if (typeof inner === 'string' && blocks[inner] && blocks[inner].shadow) delete blocks[inner];
                delete block.inputs[arg];
            }
        }
    }
    return unresolved;
};

let serial = 0;
const freshId = blocks => {
    let id;
    do id = `bw-menu-${(serial++).toString(36)}`; while (Object.prototype.hasOwnProperty.call(blocks, id));
    return id;
};

/** Repair every target of a parsed sb3 project.json in place; returns the unresolved arguments. */
export const normalizeProjectMenuArgs = project => {
    const unresolved = [];
    for (const target of (project && Array.isArray(project.targets) ? project.targets : [])) {
        for (const miss of normalizeMenuArgs(target && target.blocks, freshId)) {
            unresolved.push({...miss, target: (target && target.name) || 'Stage'});
        }
    }
    return unresolved;
};

/** The one value a menu argument holds, read from a field, a menu shadow or a text primitive; undefined if none. */
const valueOf = (block, arg, blocks) => {
    const field = block.fields && block.fields[arg];
    if (field !== undefined) return Array.isArray(field) ? field[0] : field && field.value;
    return literalOf(block.inputs && block.inputs[arg], blocks);
};

/**
 * A view of a project for READERS. The compiler reads every menu argument as a
 * field (`set motor speed ${f('PORT')}`) except the circuit instruments', which it
 * reads as values (`voltage at ${v('NET')}`) because it used to write them as
 * inputs. In the view each acceptReporters menu value is ALSO a field, and each
 * READ_AS_VALUE one also a text input, so every reader finds its value whichever
 * shape the project holds. Blocks that need no change are shared with the
 * project, which is not modified.
 */
const READ_AS_VALUE = {
    circuit_nodevoltage: ['NET'], circuit_branchcurrent: ['PART'], circuit_resistance: ['A', 'B'],
    circuit_ledbrightness: ['PART'], circuit_buzzertone: ['PART'], circuit_setcontrol: ['CONTROL']
};
export const readableView = project => {
    if (!project || !Array.isArray(project.targets)) return project;
    let changed = false;
    const targets = project.targets.map(target => {
        const blocks = target && target.blocks;
        if (!blocks || typeof blocks !== 'object') return target;
        let copy = null;
        for (const [id, block] of Object.entries(blocks)) {
            if (!block || block.shadow || !Object.prototype.hasOwnProperty.call(TABLE, block.opcode)) continue;
            let fields = null;
            let inputs = null;
            for (const arg of Object.keys(TABLE[block.opcode])) {
                const value = valueOf(block, arg, blocks);
                if (value === undefined) continue;
                if (!block.fields || block.fields[arg] === undefined) (fields = fields || {...block.fields})[arg] = [value, null];
                if ((READ_AS_VALUE[block.opcode] || []).includes(arg) && (!block.inputs || block.inputs[arg] === undefined)) {
                    (inputs = inputs || {...block.inputs})[arg] = [1, [10, String(value)]];
                }
            }
            if (!fields && !inputs) continue;
            copy = copy || {...blocks};
            copy[id] = {...block, fields: fields || block.fields, inputs: inputs || block.inputs};
        }
        if (!copy) return target;
        changed = true;
        return {...target, blocks: copy};
    });
    return changed ? {...project, targets} : project;
};

/**
 * The compiler, with every project it builds stored in the extensions' shapes and
 * every project it reads seen through readableView. See the header.
 */
export const withMenuShapes = Base => class extends Base {
    parse (...args) {
        const project = super.parse(...args);
        for (const target of project.targets) {
            for (const {opcode, arg} of normalizeMenuArgs(target.blocks, () => this.generateId())) {
                this.warnings.push(`${opcode}: ${arg} takes a choice from its menu, not a reporter; the editor shows it empty`);
            }
        }
        return project;
    }

    decompile (project = this.project, ...rest) { return super.decompile(readableView(project), ...rest); }

    generatePython (project = this.project, ...rest) { return super.generatePython(readableView(project), ...rest); }

    generateJavaScript (project = this.project, ...rest) { return super.generateJavaScript(readableView(project), ...rest); }

    generateMicroPython (project = this.project, ...rest) { return super.generateMicroPython(readableView(project), ...rest); }

    generateHostC (project = this.project, ...rest) { return super.generateHostC(readableView(project), ...rest); }

    generateC (project = this.project, ...rest) { return super.generateC(readableView(project), ...rest); }

    generateBASIC (project = this.project, ...rest) { return super.generateBASIC(readableView(project), ...rest); }
};
