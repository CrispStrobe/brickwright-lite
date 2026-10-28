// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
export const openManualControls = async (page, {motors = false, override = false} = {}) => {
    const controls = page.getByTestId('bw-sim-lab-controls-toggle');
    if (await controls.getAttribute('aria-expanded') !== 'true') await controls.click();
    if (motors || override) {
        const mixer = page.getByTestId('bw-sim-lab-mixer-toggle');
        if (await mixer.getAttribute('aria-expanded') !== 'true') await mixer.click();
    }
    if (override) await page.getByTestId('bw-sim-lab-mixer-override').check();
};
