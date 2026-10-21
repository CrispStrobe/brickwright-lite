// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// A native touch release can lack a compatibility click after a canvas drag.
// Activate the completed tap directly, and consume its optional following click.
// A fresh pointer-down resets that consumption; mouse and keyboard need no timer.
export const createPopupTrigger = activate => {
    let down = null;
    let consumeClick = false;
    return {
        onPointerDown (event) {
            consumeClick = false;
            down = event.pointerType === 'touch' ? {id: event.pointerId, x: event.clientX, y: event.clientY} : null;
        },
        onPointerUp (event) {
            if (event.pointerType !== 'touch') return;
            consumeClick = true;
            const start = down;
            down = null;
            if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8) activate();
        },
        onPointerCancel () { down = null; consumeClick = true; },
        onClick (event) {
            if (consumeClick && event.detail !== 0) { consumeClick = false; return; }
            activate();
        }
    };
};
