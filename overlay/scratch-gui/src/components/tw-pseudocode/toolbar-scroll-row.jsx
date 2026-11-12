// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';

/**
 * One toolbar row that never wraps: the controls scroll sideways inside it (as the Robot Lab
 * toolbar does) and the few controls that must always be reachable (`trailing`: the "..." menu,
 * Maximize) stay pinned at the right end. Nothing is measured, so there is no size observer and
 * no layout feedback loop; the browser's own scrolling, focus-into-view and keyboard handling do
 * the work. Anything that opens a pop-up must use a portalled one (`Popup` in sim-lab-toolbar.jsx)
 * because the scroller clips absolutely positioned children.
 *
 * Reusable by the Circuit and FPGA toolbars: pass the controls as children.
 */
const ScrollRow = ({children, trailing = null, testId, label, style = null, scrollerStyle = null}) => {
    const scroller = React.useRef(null);
    // Keep the control that took focus fully visible, including one hidden under the pinned end.
    const onFocus = React.useCallback(event => {
        const box = scroller.current;
        if (!box || !box.contains(event.target) || !event.target.getBoundingClientRect) return;
        const edge = box.getBoundingClientRect();
        const rect = event.target.getBoundingClientRect();
        if (rect.left < edge.left) box.scrollLeft -= edge.left - rect.left + 8;
        else if (rect.right > edge.right) box.scrollLeft += rect.right - edge.right + 8;
    }, []);
    return (
        <div data-testid={testId} style={{display: 'flex', alignItems: 'flex-end', gap: 6, minWidth: 0, flexShrink: 0, ...style}}>
            <div ref={scroller} role="group" aria-label={label} data-bw-scroll-row="true" onFocus={onFocus}
                style={{display: 'flex', flexWrap: 'nowrap', alignItems: 'flex-end', gap: 2, flex: '1 1 0', minWidth: 0,
                    overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', ...scrollerStyle}}>
                <style>{'[data-bw-scroll-row] > * {flex-shrink: 0 !important;}'}</style>
                {children}
            </div>
            {trailing ? (
                <div data-bw-scroll-row-end="true"
                    style={{display: 'flex', alignItems: 'center', alignSelf: 'center', gap: 6, flex: '0 0 auto'}}>
                    {trailing}
                </div>
            ) : null}
        </div>
    );
};

export default ScrollRow;
