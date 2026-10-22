// Preserve the meaning of pre-schema-fix projects before Blockly sees them:
// Arcade's schema changes, and every extension's menu-argument shapes.
// The shared compiler owns normalization; this module installs it at the app's
// single parsed-project boundary, including files, JSON and Code compilation.
const INSTALLED = Symbol.for('brickwright.arcadeSchemaMigrationInstalled');
const slots = {
    arrays_valueBinary: 'OP', arrays_valueUnary: 'OP',
    arrays_valueCompare: 'OP', arrays_specialValue: 'KIND',
    arcade_controllerStep: 'AXIS', arcade_mathBinary: 'OP',
    arcade_textSpriteProperty: 'PROPERTY', arcade_textSpriteSetProperty: 'PROPERTY',
    arcade_spriteDataSet: 'TYPE', arcade_spriteDataRead: 'TYPE',
    arcade_setBackgroundScrollVersion: 'VERSION', arcade_setCharacterAnimationVersion: 'VERSION', arcade_settingsRead: 'TYPE', arcade_settingsWrite: 'TYPE'
};

const installArcadeProjectMigration = vm => {
    if (!vm || typeof vm.deserializeProject !== 'function' || vm[INSTALLED]) return false;
    const original = vm.deserializeProject.bind(vm);
    vm.deserializeProject = function (project, zip) {
        const candidates = (project?.targets || []).flatMap(target =>
            Object.entries(target?.blocks || {}).filter(([, block]) => block &&
                Object.prototype.hasOwnProperty.call(slots, block.opcode))
                .map(([id, block]) => ({id, block, blocks: target.blocks, target: target.name || 'Stage'})));
        // After Arcade's schema repair, every extension's menu arguments saved in the wrong shape (a field
        // where the extension takes a menu shadow input, or the reverse), repaired
        // from the extensions' own declarations: until 2026-10-21 sb3-creator saved
        // every SPIKE motor port as a field, which opened as an empty dropdown.
        const menus = () => (project?.extensions?.length ? import(/* webpackChunkName: "bw-extension-menus" */
            './extension-menu-args.js').then(m => m.normalizeProjectMenuArgs(project), () => {}) : null);
        if (!candidates.length) {
            const pending = menus();
            return pending ? pending.then(() => original(project, zip)) : original(project, zip);
        }
        return import(/* webpackChunkName: "bw-arcade-schema" */ './arcadeDialect.js').then(
            ({normalizeArcadeBlockSchema}) => {
                for (const {id, block, blocks, target} of candidates) {
                    normalizeArcadeBlockSchema(block, {id, blocks});
                    const slot = slots[block.opcode];
                    const unresolved = block.opcode === 'arcade_controllerStep' ?
                        block.fields?.AXIS : block.inputs?.[slot];
                    if (unresolved) {
                        throw new Error(`Cannot preserve ${block.opcode}.${slot} in ${target}, block ${id}: ` +
                            'the saved menu value cannot be represented by the native block. ' +
                            'Choose a supported menu value in the source project before importing it.');
                    }
                }
                return menus();
            }).then(() => original(project, zip));
    };
    Object.defineProperty(vm, INSTALLED, {value: true});
    return true;
};

export default installArcadeProjectMigration;
