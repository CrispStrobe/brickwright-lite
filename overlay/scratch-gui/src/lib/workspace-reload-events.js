/**
 * Keep a workspace reload's own Blockly events away from the VM.
 *
 * `vm.emitWorkspaceUpdate()` makes the GUI clear the Blockly workspace and
 * load it again from XML the VM just generated. The GUI removes the VM's
 * listener around that load and re-adds it right after, meaning "the VM does
 * not hear its own blocks echoed back". But Blockly QUEUES events and fires
 * them on a later task (`Blockly.Events.fire` -> `setTimeout(fireNow_, 0)`) to
 * whichever listeners are attached THEN -- the VM's listener included. So the
 * clear's delete events and the load's create events still reached the VM one
 * task later, and for a refresh of the SAME target the VM deleted every block
 * and recreated it from XML as a new object with the same id.
 *
 * A run started in that window binds to the old objects and finds new ones
 * when its threads execute. The Arcade source prelude binds each source
 * declaration to its block object, so a green flag right after a painter Save
 * (both legacy-layout editors call emitWorkspaceUpdate) failed every frame with
 * "Source scalar declaration has no current prelude binding" and never set up
 * the game: the intermittent verify-arcade-legacy-layout timeout.
 *
 * Events created during the reload carry a reserved Blockly event group; the
 * VM's listener ignores that group. Every other listener still sees them.
 */
export const WORKSPACE_RELOAD_GROUP_PREFIX = 'bw-workspace-reload:';

let reloadSerial = 0;

/** Run `load` with a reload event group set, restoring the caller's group. */
export function runAsWorkspaceReload (Events, load) {
    const previous = Events.getGroup();
    reloadSerial += 1;
    Events.setGroup(`${WORKSPACE_RELOAD_GROUP_PREFIX}${reloadSerial}`);
    try {
        return load();
    } finally {
        Events.setGroup(previous);
    }
}

export function isWorkspaceReloadEvent (event) {
    return !!event && typeof event.group === 'string' &&
        event.group.startsWith(WORKSPACE_RELOAD_GROUP_PREFIX);
}

const listeners = new WeakMap();

/**
 * The VM's block listener, minus the events a reload echoes back. One function
 * per VM, so adding and removing it pair up the way `vm.blockListener` did.
 */
export function vmBlockListenerFor (vm) {
    let listener = listeners.get(vm);
    if (!listener) {
        listener = event => {
            if (isWorkspaceReloadEvent(event)) return;
            vm.blockListener(event);
        };
        listeners.set(vm, listener);
    }
    return listener;
}
