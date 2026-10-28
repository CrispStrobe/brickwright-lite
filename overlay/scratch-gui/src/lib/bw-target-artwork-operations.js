/** Deferred sprite operations keep editable source and explicit library roles. */
import {captureTargetArtwork, restoreTargetArtwork,
    syncAnimationResources} from './bw-artwork-bundle.js';
import {getAssetLibraryRole, restoreAssetLibraryRole} from './bw-asset-library.js';
import {recordSpriteDeletion, withoutHistory} from './bw-project-history.js';

const owns = (vm, target, stage) => vm.runtime.getTargetForStage() === stage && vm.runtime.targets.includes(target);

// Delete a sprite with its editable artwork. Undo (menu-bar history or the Edit
// menu's Restore, whichever comes first) rebuilds it; Redo deletes it again.
export const deleteTargetArtwork = (vm, target, stage, onRestore) => {
    if (!owns(vm, target, stage)) return null;
    const remove = doomed => {
        const artwork = captureTargetArtwork(doomed), role = getAssetLibraryRole(doomed);
        const restoreSprite = withoutHistory(() => vm.deleteSprite(doomed.id));
        syncAnimationResources(vm);
        return async () => {
            if (vm.runtime.getTargetForStage() !== stage) return false;
            const before = new Set(vm.runtime.targets);
            await restoreSprite();
            if (vm.runtime.getTargetForStage() !== stage) return false;
            const added = vm.runtime.targets.filter(candidate => candidate.isOriginal !== false && !before.has(candidate));
            if (added.length !== 1) throw new Error('Restored artwork target is missing or ambiguous');
            const restored = added[0];
            restoreTargetArtwork(restored, artwork, vm);
            if (role && !restoreAssetLibraryRole(vm, restored, role, stage)) return false;
            vm.emitTargetsUpdate();
            onRestore?.(restored);
            return restored;
        };
    };
    return recordSpriteDeletion(vm, target, remove(target), remove);
};

export const duplicateTargetArtwork = async (vm, target, stage) => {
    if (!owns(vm, target, stage)) return null;
    const artwork = captureTargetArtwork(target), role = getAssetLibraryRole(target);
    const before = new Set(vm.runtime.targets);
    await vm.duplicateSprite(target.id);
    if (vm.runtime.getTargetForStage() !== stage) return null;
    const added = vm.runtime.targets.filter(candidate => candidate.isOriginal !== false && !before.has(candidate));
    if (added.length !== 1) throw new Error('Duplicated artwork target is missing or ambiguous');
    const copy = added[0];
    restoreTargetArtwork(copy, artwork, vm, {renewResourceIds: true});
    if (role && !restoreAssetLibraryRole(vm, copy, role, stage)) return null;
    syncAnimationResources(vm);
    vm.emitTargetsUpdate();
    return copy;
};
