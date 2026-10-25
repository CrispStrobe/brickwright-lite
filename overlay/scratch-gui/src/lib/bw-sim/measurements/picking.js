// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** One explicit scene pick. A camera drag, secondary pointer or cancellation never selects a part. */
export const createMeasurementPicker = ({canvas, pick, highlight}) => {
    let receive = null, down = null;
    const finish = id => {
        const callback = receive;
        receive = null; down = null;
        canvas.style.cursor = '';
        if (id) highlight?.([id]);
        callback?.(id);
    };
    const start = e => {
        if (!receive || e.button !== 0) return;
        if (down) { down.moved = true; return; }
        down = {id: e.pointerId, x: e.clientX, y: e.clientY, moved: false};
    };
    const move = e => {
        if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
    };
    const end = e => {
        if (!receive || !down || down.id !== e.pointerId) return;
        move(e);
        const clicked = !down.moved && e.button === 0;
        down = null;
        if (clicked) {
            const id = pick(e.clientX, e.clientY);
            if (id) finish(id);
        }
    };
    const cancelPointer = () => { down = null; };
    const key = e => {
        if (e.key === 'Escape' && receive) { e.preventDefault(); e.stopPropagation(); finish(null); }
    };
    const handlers = {pointerdown: start, pointermove: move, pointerup: end, pointercancel: cancelPointer, pointerleave: cancelPointer, keydown: key};
    for (const [name, fn] of Object.entries(handlers)) canvas.addEventListener(name, fn);
    return {
        set (callback) {
            if (receive) finish(null);
            receive = callback || null; down = null;
            canvas.style.cursor = receive ? 'crosshair' : '';
            if (receive) canvas.focus({preventScroll: true});
        },
        dispose () {
            finish(null);
            for (const [name, fn] of Object.entries(handlers)) canvas.removeEventListener(name, fn);
        }
    };
};
