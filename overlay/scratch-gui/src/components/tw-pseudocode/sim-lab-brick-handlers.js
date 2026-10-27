// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Whether the Code tab's program reads the hub's own buttons (Left / Center / Right, EV3 brick
// keys, ...). The Robot Lab shows its "Brick buttons" panel by default only then; otherwise the
// same panel stays available on demand inside Manual controls.

// Button blocks of devices that are not a robot hub's brick (game pads, micro:bit, IR remotes),
// and button *lights*, are not handlers for brick buttons.
const NOT_BRICK = /^(arcade|microbit|microbitplus|circuitplayground|universalgamepad|makeymakey)_/;
const NOT_HANDLER = /colou?r|light|remote/i;

/** True when an opcode reads or waits for a robot hub's brick button. */
export const isBrickButtonOpcode = opcode => typeof opcode === 'string' && /button/i.test(opcode) &&
    !NOT_BRICK.test(opcode) && !NOT_HANDLER.test(opcode);

const cache = new WeakMap();

/**
 * True when any target of the VM's project uses a brick-button block. Cached per block container
 * and its block count, so a render loop does not rescan an unchanged project.
 */
export const programUsesBrickButtons = vm => (vm?.runtime?.targets || []).some(target => {
    const container = target?.blocks;
    const blocks = container?._blocks;
    if (!blocks) return false;
    const count = Object.keys(blocks).length;
    const known = cache.get(container);
    if (known && known.count === count) return known.used;
    const used = Object.values(blocks).some(block => isBrickButtonOpcode(block?.opcode));
    cache.set(container, {count, used});
    return used;
});
