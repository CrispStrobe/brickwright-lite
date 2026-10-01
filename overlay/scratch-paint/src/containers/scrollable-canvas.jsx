import paper from '@scratch/paper';
import PropTypes from 'prop-types';

import React from 'react';
import {connect} from 'react-redux';
import ScrollableCanvasComponent from '../components/scrollable-canvas/scrollable-canvas.jsx';

import {clampViewBounds, pan, zoomOnFixedPoint, getWorkspaceBounds} from '../helper/view';
import {updateViewBounds} from '../reducers/view-bounds';
import {redrawSelectionBox} from '../reducers/selected-items';

import {getEventXY} from '../lib/touch-utils';
import bindAll from 'lodash.bindall';

class ScrollableCanvas extends React.Component {
    static get ZOOM_INCREMENT () {
        return 0.5;
    }
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleHorizontalScrollbarMouseDown',
            'handleHorizontalScrollbarMouseMove',
            'handleHorizontalScrollbarMouseUp',
            'handleVerticalScrollbarMouseDown',
            'handleVerticalScrollbarMouseMove',
            'handleVerticalScrollbarMouseUp',
            'handleWheel',
            'handlePanKeyDown',
            'handlePanKeyUp',
            'handlePanPointerEnter',
            'handlePanPointerLeave',
            'handlePanMouseDown',
            'handlePanMouseMove',
            'handlePanMouseUp',
            'handlePanBlur'
        ]);
        this.spaceHeld = false;
        this.pointerOverCanvas = false;
        this.panning = false;
    }
    componentDidMount () {
        this.attachCanvas(this.props.canvas);
        document.addEventListener('keydown', this.handlePanKeyDown, true);
        document.addEventListener('keyup', this.handlePanKeyUp, true);
        window.addEventListener('blur', this.handlePanBlur);
    }
    componentWillReceiveProps (nextProps) {
        if (nextProps.canvas === this.props.canvas) return;
        this.detachCanvas(this.props.canvas);
        this.attachCanvas(nextProps.canvas);
    }
    componentWillUnmount () {
        this.handlePanMouseUp();
        this.spaceHeld = false;
        this.detachCanvas(this.props.canvas);
        document.removeEventListener('keydown', this.handlePanKeyDown, true);
        document.removeEventListener('keyup', this.handlePanKeyUp, true);
        window.removeEventListener('blur', this.handlePanBlur);
    }
    attachCanvas (canvas) {
        if (!canvas) return;
        this.originalCursor = {value: canvas.style.getPropertyValue('cursor'),
            priority: canvas.style.getPropertyPriority('cursor')};
        canvas.addEventListener('wheel', this.handleWheel);
        canvas.addEventListener('mouseenter', this.handlePanPointerEnter);
        canvas.addEventListener('mouseleave', this.handlePanPointerLeave);
        canvas.addEventListener('mousedown', this.handlePanMouseDown, true);
    }
    detachCanvas (canvas) {
        if (!canvas) return;
        canvas.removeEventListener('wheel', this.handleWheel);
        canvas.removeEventListener('mouseenter', this.handlePanPointerEnter);
        canvas.removeEventListener('mouseleave', this.handlePanPointerLeave);
        canvas.removeEventListener('mousedown', this.handlePanMouseDown, true);
        canvas.style.setProperty('cursor', this.originalCursor.value, this.originalCursor.priority);
        this.pointerOverCanvas = false;
    }
    updatePanCursor () {
        if (!this.props.canvas) return;
        if (this.panning) this.props.canvas.style.setProperty('cursor', 'grabbing', 'important');
        else if (this.spaceHeld && this.pointerOverCanvas) {
            this.props.canvas.style.setProperty('cursor', 'grab', 'important');
        } else this.props.canvas.style.setProperty('cursor', this.originalCursor.value, this.originalCursor.priority);
    }
    handlePanKeyDown (event) {
        if (event.code !== 'Space' || !this.pointerOverCanvas) return;
        if (event.target.closest && event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
        this.spaceHeld = true;
        this.updatePanCursor();
        event.preventDefault();
    }
    handlePanKeyUp (event) {
        if (event.code !== 'Space' || !this.spaceHeld) return;
        this.spaceHeld = false;
        this.updatePanCursor();
        event.preventDefault();
    }
    handlePanPointerEnter () {
        this.pointerOverCanvas = true;
        this.updatePanCursor();
    }
    handlePanPointerLeave () {
        this.pointerOverCanvas = false;
        this.updatePanCursor();
    }
    handlePanMouseDown (event) {
        if (!this.spaceHeld || event.button !== 0) return;
        this.panning = true;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        window.addEventListener('mousemove', this.handlePanMouseMove, true);
        window.addEventListener('mouseup', this.handlePanMouseUp, true);
        this.updatePanCursor();
        event.preventDefault();
        event.stopImmediatePropagation();
    }
    handlePanMouseMove (event) {
        if (!this.panning) return;
        const dx = event.clientX - this.lastPanX;
        const dy = event.clientY - this.lastPanY;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        pan(-dx / paper.view.zoom, -dy / paper.view.zoom);
        this.props.updateViewBounds(paper.view.matrix);
        this.props.redrawSelectionBox();
        event.preventDefault();
        event.stopImmediatePropagation();
    }
    handlePanMouseUp (event) {
        if (!this.panning) return;
        this.panning = false;
        window.removeEventListener('mousemove', this.handlePanMouseMove, true);
        window.removeEventListener('mouseup', this.handlePanMouseUp, true);
        this.updatePanCursor();
        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }
    handlePanBlur () {
        this.handlePanMouseUp();
        this.spaceHeld = false;
        this.updatePanCursor();
    }
    handleHorizontalScrollbarMouseDown (event) {
        this.initialMouseX = getEventXY(event).x;
        this.initialScreenX = paper.view.matrix.tx;
        window.addEventListener('mousemove', this.handleHorizontalScrollbarMouseMove);
        window.addEventListener('touchmove', this.handleHorizontalScrollbarMouseMove, {passive: false});
        window.addEventListener('mouseup', this.handleHorizontalScrollbarMouseUp);
        window.addEventListener('touchend', this.handleHorizontalScrollbarMouseUp);
        event.preventDefault();
    }
    handleHorizontalScrollbarMouseMove (event) {
        const dx = this.initialMouseX - getEventXY(event).x;
        paper.view.matrix.tx = this.initialScreenX + (dx * paper.view.zoom * 2);
        clampViewBounds();
        this.props.updateViewBounds(paper.view.matrix);
        event.preventDefault();
    }
    handleHorizontalScrollbarMouseUp (event) {
        window.removeEventListener('mousemove', this.handleHorizontalScrollbarMouseMove);
        window.removeEventListener('touchmove', this.handleHorizontalScrollbarMouseMove, {passive: false});
        window.removeEventListener('mouseup', this.handleHorizontalScrollbarMouseUp);
        window.removeEventListener('touchend', this.handleHorizontalScrollbarMouseUp);
        this.initialMouseX = null;
        this.initialScreenX = null;
        event.preventDefault();
    }
    handleVerticalScrollbarMouseDown (event) {
        this.initialMouseY = getEventXY(event).y;
        this.initialScreenY = paper.view.matrix.ty;
        window.addEventListener('mousemove', this.handleVerticalScrollbarMouseMove);
        window.addEventListener('touchmove', this.handleVerticalScrollbarMouseMove, {passive: false});
        window.addEventListener('mouseup', this.handleVerticalScrollbarMouseUp);
        window.addEventListener('touchend', this.handleVerticalScrollbarMouseUp);
        event.preventDefault();
    }
    handleVerticalScrollbarMouseMove (event) {
        const dy = this.initialMouseY - getEventXY(event).y;
        paper.view.matrix.ty = this.initialScreenY + (dy * paper.view.zoom * 2);
        clampViewBounds();
        this.props.updateViewBounds(paper.view.matrix);
        event.preventDefault();
    }
    handleVerticalScrollbarMouseUp (event) {
        window.removeEventListener('mousemove', this.handleVerticalScrollbarMouseMove);
        window.removeEventListener('touchmove', this.handleVerticalScrollbarMouseMove, {passive: false});
        window.removeEventListener('mouseup', this.handleVerticalScrollbarMouseUp);
        window.removeEventListener('touchend', this.handleVerticalScrollbarMouseUp);
        this.initialMouseY = null;
        this.initialScreenY = null;
        event.preventDefault();
    }
    handleWheel (event) {
        // Multiplier variable, so that non-pixel-deltaModes are supported. Needed for Firefox.
        // See #529 (or LLK/scratch-blocks#1190).
        const multiplier = event.deltaMode === 0x1 ? 15 : 1;
        const deltaX = event.deltaX * multiplier;
        const deltaY = event.deltaY * multiplier;
        const canvasRect = this.props.canvas.getBoundingClientRect();
        const offsetX = event.clientX - canvasRect.left;
        const offsetY = event.clientY - canvasRect.top;
        const fixedPoint = paper.view.viewToProject(
            new paper.Point(offsetX, offsetY)
        );
        if (event.metaKey || event.ctrlKey) {
            // Zoom keeping mouse location fixed
            zoomOnFixedPoint(-deltaY / 1000, fixedPoint);
            this.props.updateViewBounds(paper.view.matrix);
            this.props.redrawSelectionBox(); // Selection handles need to be resized after zoom
        } else if (event.shiftKey && event.deltaX === 0) {
            // Scroll horizontally (based on vertical scroll delta)
            // This is needed as for some browser/system combinations which do not set deltaX.
            // See #156.
            const dx = deltaY / paper.view.zoom;
            pan(dx, 0);
            this.props.updateViewBounds(paper.view.matrix);
        } else {
            const dx = deltaX / paper.view.zoom;
            const dy = deltaY / paper.view.zoom;
            pan(dx, dy);
            this.props.updateViewBounds(paper.view.matrix);
            if (paper.tool) {
                paper.tool.view._handleMouseEvent('mousemove', event, fixedPoint);
            }
        }
        event.preventDefault();
    }
    render () {
        let widthPercent = 0;
        let heightPercent = 0;
        let topPercent = 0;
        let leftPercent = 0;
        if (paper.project) {
            const bounds = getWorkspaceBounds();
            const {x, y, width, height} = paper.view.bounds;
            widthPercent = Math.min(100, 100 * width / bounds.width);
            heightPercent = Math.min(100, 100 * height / bounds.height);
            const centerX = (x + (width / 2) - bounds.x) / bounds.width;
            const centerY = (y + (height / 2) - bounds.y) / bounds.height;
            topPercent = Math.max(0, (100 * centerY) - (heightPercent / 2));
            leftPercent = Math.max(0, (100 * centerX) - (widthPercent / 2));
        }
        return (
            <ScrollableCanvasComponent
                hideScrollbars={this.props.hideScrollbars}
                horizontalScrollLengthPercent={widthPercent}
                horizontalScrollStartPercent={leftPercent}
                style={this.props.style}
                verticalScrollLengthPercent={heightPercent}
                verticalScrollStartPercent={topPercent}
                onHorizontalScrollbarMouseDown={this.handleHorizontalScrollbarMouseDown}
                onVerticalScrollbarMouseDown={this.handleVerticalScrollbarMouseDown}
            >
                {this.props.children}
            </ScrollableCanvasComponent>
        );
    }
}

ScrollableCanvas.propTypes = {
    canvas: PropTypes.instanceOf(Element),
    children: PropTypes.node.isRequired,
    hideScrollbars: PropTypes.bool,
    redrawSelectionBox: PropTypes.func.isRequired,
    style: PropTypes.string,
    updateViewBounds: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    viewBounds: state.scratchPaint.viewBounds
});
const mapDispatchToProps = dispatch => ({
    redrawSelectionBox: () => {
        dispatch(redrawSelectionBox());
    },
    updateViewBounds: matrix => {
        dispatch(updateViewBounds(matrix));
    }
});


export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ScrollableCanvas);
