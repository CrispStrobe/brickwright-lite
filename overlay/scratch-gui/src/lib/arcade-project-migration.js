// Preserve the meaning of pre-schema-fix projects before Blockly sees them.
// The shared compiler owns normalization; this module installs it at the app's
// single parsed-project boundary, including files, JSON and Code compilation.
const INSTALLED = Symbol.for('brickwright.arcadeSchemaMigrationInstalled');
const slots = {
    arrays_valueBinary: 'OP', arrays_valueUnary: 'OP',
    arrays_valueCompare: 'OP', arrays_specialValue: 'KIND',
    arcade_controllerStep: 'AXIS'
};

const installArcadeProjectMigration = vm => {
    if (!vm || typeof vm.deserializeProject !== 'function' || vm[INSTALLED]) return false;
    const original = vm.deserializeProject.bind(vm);
    vm.deserializeProject = function (project, zip) {
        const candidates = (project?.targets || []).flatMap(target =>
            Object.entries(target?.blocks || {}).filter(([, block]) => block &&
                Object.prototype.hasOwnProperty.call(slots, block.opcode))
                .map(([id, block]) => ({id, block, target: target.name || 'Stage'})));
        if (!candidates.length) return original(project, zip);
        return import(/* webpackChunkName: "bw-arcade-schema" */ './arcadeDialect.js').then(
            ({normalizeArcadeBlockSchema}) => {
                for (const {id, block, target} of candidates) {
                    normalizeArcadeBlockSchema(block);
                    const slot = slots[block.opcode];
                    const unresolved = block.opcode === 'arcade_controllerStep' ?
                        block.fields?.AXIS : block.inputs?.[slot];
                    if (unresolved) {
                        throw new Error(`Cannot preserve ${block.opcode}.${slot} in ${target}, block ${id}: ` +
                            'the saved menu value cannot be represented by the native block. ' +
                            'Choose a supported menu value in the source project before importing it.');
                    }
                }
                return original(project, zip);
            });
    };
    Object.defineProperty(vm, INSTALLED, {value: true});
    return true;
};

export default installArcadeProjectMigration;
