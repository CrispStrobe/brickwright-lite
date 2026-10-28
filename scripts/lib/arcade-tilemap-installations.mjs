/** Observe actual native installations, not the last map after other scripts run.
 * Self-contained so Playwright can serialize this function into the real VM.
 */
export function observeTilemapInstallations({vm, blockId, expose = false}) {
    vm ||= globalThis.__brickwrightStore?.getState().scratchGui.vm;
    const runtime = vm?.runtime;
    const primitives = runtime?._primitives;
    const opcode = 'arcade_setTilemap';
    const original = primitives?.[opcode];
    if (typeof original !== 'function' || typeof blockId !== 'string' || !blockId) {
        throw new Error('native tilemap primitive and saved block identity are required');
    }
    const receipts = [];
    function observed(...args) {
        const before = runtime.bwArcadeDeviceState?.tilemap;
        const executingBlock = args[1]?.thread?.peekStack?.();
        const result = Reflect.apply(original, this, args);
        const map = runtime.bwArcadeDeviceState?.tilemap;
        // A refusal/no-op must not certify a previously installed map.
        if (executingBlock === blockId && map && map !== before) {
            receipts.push({blockId: executingBlock, map: {
                columns: map.columns, rows: map.rows, tileSize: map.tileSize,
                indices: Array.from(map.indices), walls: Array.from(map.walls),
                images: map.images.map(image => ({width: image.width, height: image.height,
                    pixels: Array.from(image.pixels)}))
            }});
        }
        return result;
    }
    primitives[opcode] = observed;
    const observer = {receipts, restore() {
        if (primitives[opcode] !== observed) throw new Error('tilemap primitive changed during observation');
        primitives[opcode] = original;
    }};
    // `expose` may name the global, so two blocks can be observed at once
    // (restore the later observer first).
    if (expose) globalThis[typeof expose === 'string' ? expose : '__bwTilemapInstallationProof'] = observer;
    return observer;
}
