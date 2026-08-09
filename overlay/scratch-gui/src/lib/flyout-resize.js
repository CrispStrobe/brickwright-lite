/**
 * Blockly flyout resize utility.
 *
 * From gui-layout.md: "The block palette is not a pane. It is Blockly's
 * flyout, drawn inside the same canvas as the workspace."
 *
 * The left column at xs shows only the category strip (Blockly's toolbox).
 * At larger sizes, the flyout expands. This module bridges the pane size
 * vocabulary with Blockly's flyout API.
 *
 * The mechanism: Blockly's flyout width is determined by the workspace
 * container's size plus Blockly's own category strip. We don't set the
 * flyout width directly — instead, we tell the workspace to resize, and
 * Blockly reflows the flyout to fit.
 */

/**
 * Trigger a Blockly workspace resize.
 *
 * Call this after changing the left column's size, so Blockly reflows
 * its flyout to match the new container width.
 *
 * @param {object} workspace — Blockly workspace instance
 */
export function resizeBlocklyFlyout(workspace) {
  if (!workspace) return;

  try {
    // Blockly's resize recalculates the flyout width from the container
    if (typeof workspace.resize === 'function') {
      workspace.resize();
    }

    // Also fire a resize event so Blockly's internal listeners update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
  } catch {
    // Blockly not ready yet — safe to ignore
  }
}

/**
 * At xs, the Blockly workspace should show only the category strip
 * (the vertical list of category names). The flyout is hidden.
 *
 * This is faked by setting the container to ~28px wide, which leaves
 * room for the category strip but not the flyout. Blockly hides the
 * flyout automatically when there isn't room.
 *
 * @param {string} size — pane size name
 * @returns {boolean} — true if the flyout should be visible
 */
export function shouldShowFlyout(size) {
  return size !== 'xs';
}
