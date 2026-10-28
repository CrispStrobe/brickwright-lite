// The Costumes tab needs block presence, even when a map is computed or not
// editable. Keep asset decoding and the editor parser in the lazy painter.
export const hasTilemapBlocks = vm => (vm?.runtime?.targets || []).some(target =>
    target.isOriginal !== false && Object.values(target.blocks?._blocks || {}).some(block =>
        block?.opcode === 'arcade_setTilemap' || block?.opcode === 'arcade_setLegacyTilemap'));
