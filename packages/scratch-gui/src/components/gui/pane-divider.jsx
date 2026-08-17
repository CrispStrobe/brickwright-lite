import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import styles from './pane-divider.css';
import {clampFraction, isCollapsed} from '../../lib/pane-sizes.js';

/**
 * Drag the boundary between the editor column and the stage column.
 *
 * What this replaces: a 9px-monospace square in the corner of the stage that
 * cycled the right column through xs/s/m/l/xl. It was a debug control that
 * became the only way to resize that column, and its xs step collapsed the
 * column to a 28px strip — reported, fairly, as broken rather than as a size.
 * So this is a replacement, not a deletion: the capability has to survive.
 *
 * Why the size vocabulary had to grow a number. The five names are shares, and
 * dragging is continuous; no cycle of five can express it. The names stay
 * because PRESETS and the stage-size coupling are written in them and must keep
 * meaning the same thing after a drag — `pane-sizes.js` now resolves either.
 *
 * A dragged size is a FRACTION of the row, not a share, and the column renders
 * it with flex-grow 0. That difference is load-bearing and was found by
 * measuring: a share also grows into the row's free space, so the first version
 * of this moved the boundary 90px for a 220px drag and the divider slid out
 * from under the pointer. See isExplicitFraction in pane-sizes.js.
 *
 * Two behaviours worth stating, because both are the reason split dividers feel
 * wrong when they are missing:
 *
 * 1. **Collapse stays reachable, by double-click.** That is the one step of the
 *    old cycle a drag genuinely cannot reach, since the clamp below stops well
 *    short of it. Double-clicking again restores, so the same gesture that put
 *    the column away brings it back — the rule chrome-toggle.jsx already
 *    follows, and the reason there is no "reset layout" button anywhere.
 * 2. **Keyboard works.** It is a `separator` with `aria-valuenow`, and the
 *    arrows move it. A pane boundary that only a pointer can move is a pane
 *    boundary some people simply cannot move.
 *
 * The redux dispatch is throttled to one per animation frame. Blockly measures
 * its canvas on resize and not otherwise, so each committed frame also fires a
 * window resize — the same event a real window drag would produce, at the same
 * rate — or the workspace keeps the old width and the blocks sit under the
 * stage until the pointer is released.
 */

/** Arrow-key step, in px of column width. Big enough to feel, small enough to aim. */
const KEY_STEP = 24;

/** Two pointerdowns closer together than this are a double-click. */
const DOUBLE_CLICK_MS = 400;

class PaneDivider extends React.Component {
    constructor (props) {
        super(props);
        this.state = {dragging: false, percent: null};
        this.el = null;
        this.frame = null;
        this.pending = null;
        this.moved = false;
        this.lastDownAt = 0;

        this.setRef = this.setRef.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.toggleCollapse = this.toggleCollapse.bind(this);
        this.commit = this.commit.bind(this);
    }

    componentDidMount () {
        this.syncPercent();
    }

    componentDidUpdate (prevProps) {
        // After React has committed, so the measurement reflects the new layout
        // rather than the one being replaced. Measuring in render() instead
        // would force a reflow on every frame of a drag.
        if (prevProps.share !== this.props.share) this.syncPercent();
    }

    componentWillUnmount () {
        // A drag interrupted by a tab switch would otherwise leave the whole
        // document stuck in col-resize with text selection off.
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.setDraggingClass(false);
    }

    setRef (el) {
        this.el = el;
    }

    /** Keep aria-valuenow honest about where the boundary actually sits. */
    syncPercent () {
        const percent = Math.round(this.currentFraction() * 100);
        if (percent !== this.state.percent) this.setState({percent});
    }

    setDraggingClass (on) {
        if (typeof document !== 'undefined') {
            document.body.classList.toggle('bw-pane-dragging', on);
        }
    }

    /** @returns {?DOMRect} The row both columns live in, or null before mount. */
    rowRect () {
        const row = this.el && this.el.parentElement;
        if (!row) return null;
        const rect = row.getBoundingClientRect();
        return rect.width > 0 ? rect : null;
    }

    /**
     * Turn a pointer position into a fraction of the row for the sized column.
     *
     * Clamped so neither side drops below MIN_COLUMN_WIDTH — the same minimum
     * computePaneStyles declares, so the clamp and the CSS agree rather than
     * the CSS quietly overriding a value we asked for and the divider then
     * drifting away from the pointer.
     *
     * @param {number} clientX — pointer x in client coordinates
     * @returns {?number} The fraction to store, or null if unmeasurable
     */
    fractionForPointer (clientX) {
        const rect = this.rowRect();
        if (!rect) return null;

        // In RTL the stage column is on the left, so the distance that means
        // "how wide is that column" is measured from the other edge.
        const px = this.props.isRtl ? clientX - rect.left : rect.right - clientX;

        return clampFraction(px / rect.width, rect.width);
    }

    /** Apply the most recent pointer position, at most once per frame. */
    commit () {
        this.frame = null;
        if (this.pending === null) return;
        this.props.onResize(this.pending);
        this.pending = null;
        window.dispatchEvent(new Event('resize'));
    }

    schedule (fraction) {
        if (fraction === null) return;
        this.pending = fraction;
        if (this.frame === null) this.frame = requestAnimationFrame(this.commit);
    }

    handlePointerDown (e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        // Double-click is detected here rather than through onDoubleClick,
        // because the preventDefault below suppresses the compatibility mouse
        // events — click and dblclick among them — and dropping the
        // preventDefault instead would hand every drag a text selection and a
        // drag-ghost. Measured in Firefox: with onDoubleClick, collapsing the
        // column never fired once.
        if (e.timeStamp - this.lastDownAt < DOUBLE_CLICK_MS) {
            this.lastDownAt = 0;
            this.toggleCollapse();
            return;
        }
        this.lastDownAt = e.timeStamp;

        // Pointer capture is what lets the drag continue over the stage, over
        // the Blockly canvas, and outside the window — all of which would
        // otherwise swallow the move events and strand the divider mid-drag.
        if (this.el && this.el.setPointerCapture) this.el.setPointerCapture(e.pointerId);
        this.moved = false;
        this.setState({dragging: true});
        this.setDraggingClass(true);
        e.preventDefault();
    }

    handlePointerMove (e) {
        if (!this.state.dragging) return;
        this.moved = true;
        this.schedule(this.fractionForPointer(e.clientX));
    }

    handlePointerUp (e) {
        if (!this.state.dragging) return;
        if (this.el && this.el.releasePointerCapture) {
            try { this.el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
        }
        this.setState({dragging: false});
        this.setDraggingClass(false);
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        // A click that never moved must change nothing. Committing anyway would
        // convert the column from a named size to a fraction — invisible at the
        // time, but it would then ignore the next preset, which is a strange
        // thing for a click on nothing to have done.
        if (!this.moved) {
            this.pending = null;
            return;
        }
        // Land on the exact final position rather than wherever the last frame
        // happened to fall.
        this.pending = this.fractionForPointer(e.clientX);
        this.commit();
    }

    toggleCollapse () {
        this.props.onCollapseToggle();
        window.dispatchEvent(new Event('resize'));
    }

    handleKeyDown (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.toggleCollapse();
            return;
        }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

        const rect = this.rowRect();
        if (!rect) return;
        e.preventDefault();

        // ArrowRight always means "move the boundary right", so in RTL — where
        // the stage is on the left — that grows the stage column instead of
        // shrinking it.
        const grow = this.props.isRtl ? e.key === 'ArrowRight' : e.key === 'ArrowLeft';
        const next = (this.currentFraction() * rect.width) + (grow ? KEY_STEP : -KEY_STEP);

        const fraction = this.fractionForPointer(
            this.props.isRtl ? rect.left + next : rect.right - next
        );
        if (fraction === null) return;
        this.props.onResize(fraction);
        window.dispatchEvent(new Event('resize'));
    }

    /**
     * The sized column's current fraction of the row, 0..1.
     *
     * Measured off the DOM rather than derived from the stored size, because
     * for a NAMED size the two disagree: the column renders at its share plus a
     * cut of the free space. The keyboard step has to start from where the
     * boundary actually is, or the first arrow press jumps.
     *
     * @returns {number} 0..1
     */
    currentFraction () {
        if (isCollapsed(this.props.share)) return 0;
        const rect = this.rowRect();
        const column = this.el && this.el.nextElementSibling;
        if (!rect || !column) return 0.3;
        return column.getBoundingClientRect().width / rect.width;
    }

    render () {
        const {percent} = this.state;
        return (
            <div
                aria-label="Resize the stage column"
                aria-orientation="vertical"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={percent}
                className={classNames(styles.divider, {[styles.dragging]: this.state.dragging})}
                ref={this.setRef}
                role="separator"
                tabIndex={0}
                title="Drag to resize · double-click to collapse"
                onKeyDown={this.handleKeyDown}
                onPointerCancel={this.handlePointerUp}
                onPointerDown={this.handlePointerDown}
                onPointerMove={this.handlePointerMove}
                onPointerUp={this.handlePointerUp}
            />
        );
    }
}

PaneDivider.propTypes = {
    /** Current size of the column being resized: a name, or a dragged fraction. */
    share: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    isRtl: PropTypes.bool,
    onResize: PropTypes.func.isRequired,
    onCollapseToggle: PropTypes.func.isRequired
};

export default PaneDivider;
