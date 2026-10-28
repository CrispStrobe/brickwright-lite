// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {applySnapshot} from './sim-scene3d.js';

/** Sample ink at physics-clock cadence without a WebGL draw. Return whether new ink needs painting. */
export const sampleDrawingSnapshot = ({built, pens, snapshot}) => {
    if (!pens || !snapshot) return false;
    const before = pens.pointCount;
    applySnapshot(built, snapshot);
    pens.update();
    return pens.pointCount !== before;
};
