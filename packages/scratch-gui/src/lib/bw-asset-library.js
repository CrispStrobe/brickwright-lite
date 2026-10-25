/** Explicit asset-library roles, independent of editable target names.
 * Roles live in the versioned artwork bundle; the VM's ordinary sprite serializer
 * ignores the private runtime property. Libraries contain artwork, never scripts.
 */
const ASSET_LIBRARY_ROLE = Object.freeze({version: 1, kind: 'arcade-animation'});
const guarded = new WeakSet();
const getAssetLibraryRole = target => target?.bwAssetLibrary || null;
const validateAssetLibraryTarget = (target, role) => {
    if (!role || role.version !== 1 || role.kind !== ASSET_LIBRARY_ROLE.kind) {
        throw new Error('Unsupported asset library role');
    }
    const blocks = target?.blocks?._blocks || target?.blocks || {};
    if (!target || target.isStage || target.visible !== false || Object.keys(blocks).length ||
        Object.keys(target.variables || {}).length || Object.keys(target.lists || {}).length ||
        (target.sprite?.sounds || target.sounds || []).length) {
        throw new Error('Asset library must be a hidden sprite containing artwork only');
    }
    return role;
};
const setAssetLibraryRole = (target, role) => {
    validateAssetLibraryTarget(target, role);
    Object.defineProperty(target, 'bwAssetLibrary', {value: Object.freeze({...role}), configurable: true});
    if (!guarded.has(target)) {
        guarded.add(target);
        // The UI hides gameplay editing. Keep the model safe against queued
        // Blockly events and runtime Show commands as selection changes.
        if (target.setVisible) {
            const setVisible = target.setVisible;
            target.setVisible = function (visible) {
                return setVisible.call(this, this.bwAssetLibrary ? false : visible);
            };
        }
        if (target.blocks?.blocklyListen) {
            const listen = target.blocks.blocklyListen;
            target.blocks.blocklyListen = function (event) {
                if (!target.bwAssetLibrary) return listen.call(this, event);
            };
        }
    }
};
const validateAssetLibraries = (project, libraries = []) => {
    if (!Array.isArray(libraries)) throw new Error('Invalid asset library records');
    const used = new Set();
    for (const record of libraries) {
        if (!record || !Number.isInteger(record.targetIndex) || used.has(record.targetIndex)) {
            throw new Error('Invalid or duplicate asset library target');
        }
        used.add(record.targetIndex);
        validateAssetLibraryTarget(project.targets?.[record.targetIndex], record.role);
    }
    return libraries;
};
const assetLibraryRecords = (vm, project) => {
    const targets = (vm.runtime?.targets || []).filter(target => target.isOriginal !== false);
    const libraries = [];
    targets.forEach((target, targetIndex) => {
        const role = getAssetLibraryRole(target);
        if (!role) return;
        validateAssetLibraryTarget(target, role);
        const saved = project.targets?.[targetIndex];
        if (!saved || saved.name !== (target.name || target.getName?.()) || saved.isStage !== target.isStage) {
            throw new Error('Asset library target order changed during serialization');
        }
        libraries.push({targetIndex, role: {...role}});
    });
    return validateAssetLibraries(project, libraries);
};
const withoutAssetLibraries = (project, libraries) => {
    validateAssetLibraries(project, libraries);
    const excluded = new Set(libraries.map(record => record.targetIndex));
    return {...project, targets: project.targets.filter((_target, index) => !excluded.has(index))};
};
export {ASSET_LIBRARY_ROLE, getAssetLibraryRole, setAssetLibraryRole, validateAssetLibraryTarget,
    validateAssetLibraries, assetLibraryRecords, withoutAssetLibraries};

/** Preflight the persisted role table and carry a synchronous restoration step.
 * Loaded by artwork inspection only when this versioned table is present.
 */
export const inspectAssetLibraries = (project, payload) => {
    if (payload.version < 7) throw new Error('Asset libraries require artwork bundle version 7');
    const libraries = validateAssetLibraries(project, payload.libraries);
    return {libraries, applyLibraries: targets => {
        for (const record of libraries) {
            const target = targets[record.targetIndex];
            validateAssetLibraryTarget(target, record.role);
            if ((target.name || target.getName?.()) !== project.targets[record.targetIndex].name) {
                throw new Error('Loaded asset library target differs from its source');
            }
        }
        for (const record of libraries) setAssetLibraryRole(targets[record.targetIndex], record.role);
    }};
};


/** A delayed module load must never label a newly selected or replaced target. */
export const restoreAssetLibraryRole = (vm, target, role, stage) => {
    if (vm.runtime.getTargetForStage() !== stage || !vm.runtime.targets.includes(target)) return false;
    setAssetLibraryRole(target, role);
    return true;
};
