// Pixel colours/settings live in the compact toolbar popover. Preserve the
// selected foreground/background slot when the picker is already open.
export const pixelControl = async (page, testId) => {
    const control = page.getByTestId(testId);
    if (!(await control.isVisible())) {
        await page.getByTestId('bw-pixel-colour-trigger').click();
        await control.waitFor({state: 'visible'});
    }
    return control;
};
