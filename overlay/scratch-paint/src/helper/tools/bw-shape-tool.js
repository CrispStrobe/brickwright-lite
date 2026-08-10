import paper from '@scratch/paper';
import {styleShape} from '../style-path';
import {clearSelection} from '../selection';
import {getSquareDimensions} from '../math';
import BoundingBoxTool from '../selection-tools/bounding-box-tool';
import NudgeTool from '../selection-tools/nudge-tool';

/**
 * Brickwright: drag-a-box tool for parametric shapes (polygon, star).
 *
 * Structurally this is rect-tool.js — same bounding-box handoff, same modifier keys, same tiny-
 * shape guard — with the one rectangle-specific line replaced by a `buildPath` callback. The
 * shape is inscribed in the dragged rectangle rather than drawn from a centre and radius, so a
 * polygon can be squashed or stretched like every other shape in this editor, and shift still
 * means "regular".
 */
class BwShapeTool extends paper.Tool {
    static get TOLERANCE () {
        return 2;
    }
    /**
     * @param {!string} mode The Modes entry this tool serves, for the bounding box and nudge tools
     * @param {!function} buildPath (paper.Rectangle, params) => paper.Path — the shape to draw
     * @param {function} setSelectedItems Callback to set the set of selected items in the Redux state
     * @param {function} clearSelectedItems Callback to clear the set of selected items in the Redux state
     * @param {function} setCursor Callback to set the visible mouse cursor
     * @param {!function} onUpdateImage A callback to call when the image visibly changes
     */
    constructor (mode, buildPath, setSelectedItems, clearSelectedItems, setCursor, onUpdateImage) {
        super();
        this.buildPath = buildPath;
        this.setSelectedItems = setSelectedItems;
        this.clearSelectedItems = clearSelectedItems;
        this.onUpdateImage = onUpdateImage;
        this.boundingBoxTool = new BoundingBoxTool(
            mode,
            setSelectedItems,
            clearSelectedItems,
            setCursor,
            onUpdateImage
        );
        const nudgeTool = new NudgeTool(mode, this.boundingBoxTool, onUpdateImage);

        // We have to set these functions instead of just declaring them because
        // paper.js tools hook up the listeners in the setter functions.
        this.onMouseDown = this.handleMouseDown;
        this.onMouseMove = this.handleMouseMove;
        this.onMouseDrag = this.handleMouseDrag;
        this.onMouseUp = this.handleMouseUp;
        this.onKeyUp = nudgeTool.onKeyUp;
        this.onKeyDown = nudgeTool.onKeyDown;

        this.shape = null;
        this.colorState = null;
        this.params = {};
        this.isBoundingBoxMode = null;
        this.active = false;
    }
    getHitOptions () {
        return {
            segments: true,
            stroke: true,
            curves: true,
            fill: true,
            guide: false,
            match: hitResult =>
                (hitResult.item.data && (hitResult.item.data.isScaleHandle || hitResult.item.data.isRotHandle)) ||
                hitResult.item.selected, // Allow hits on bounding box and selected only
            tolerance: BwShapeTool.TOLERANCE / paper.view.zoom
        };
    }
    /**
     * Should be called if the selection changes to update the bounds of the bounding box.
     * @param {Array<paper.Item>} selectedItems Array of selected items.
     */
    onSelectionChanged (selectedItems) {
        this.boundingBoxTool.onSelectionChanged(selectedItems);
    }
    setColorState (colorState) {
        this.colorState = colorState;
    }
    /**
     * @param {!object} params Shape parameters from the shape panel (sides, points, inner ratio).
     */
    setParams (params) {
        this.params = params;
    }
    handleMouseDown (event) {
        if (event.event.button > 0) return; // only first mouse button
        this.active = true;

        if (this.boundingBoxTool.onMouseDown(
            event, false /* clone */, false /* multiselect */, false /* doubleClicked */, this.getHitOptions())) {
            this.isBoundingBoxMode = true;
        } else {
            this.isBoundingBoxMode = false;
            clearSelection(this.clearSelectedItems);
        }
    }
    handleMouseDrag (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        if (this.isBoundingBoxMode) {
            this.boundingBoxTool.onMouseDrag(event);
            return;
        }

        if (this.shape) {
            this.shape.remove();
        }

        const rect = new paper.Rectangle(event.downPoint, event.point);
        const squareDimensions = getSquareDimensions(event.downPoint, event.point);
        if (event.modifiers.shift) {
            rect.size = squareDimensions.size.abs();
        }

        // Unlike rect-tool, the shape is built INTO its final rectangle rather than built and
        // then moved, so the rectangle has to be placed first. Same three cases, same meanings.
        if (event.modifiers.alt) {
            rect.center = event.downPoint;
        } else if (event.modifiers.shift) {
            rect.center = squareDimensions.position;
        } else {
            rect.center = event.downPoint.add(event.point.subtract(event.downPoint).multiply(0.5));
        }

        this.shape = this.buildPath(rect, this.params);
        styleShape(this.shape, this.colorState);
    }
    handleMouseUp (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        if (this.isBoundingBoxMode) {
            this.boundingBoxTool.onMouseUp(event);
            this.isBoundingBoxMode = null;
            return;
        }

        if (this.shape) {
            if (Math.abs(this.shape.area) < BwShapeTool.TOLERANCE / paper.view.zoom) {
                // Tiny shape created unintentionally?
                this.shape.remove();
                this.shape = null;
            } else {
                this.shape.selected = true;
                this.setSelectedItems();
                this.onUpdateImage();
                this.shape = null;
            }
        }
        this.active = false;
    }
    handleMouseMove (event) {
        this.boundingBoxTool.onMouseMove(event, this.getHitOptions());
    }
    deactivateTool () {
        this.boundingBoxTool.deactivateTool();
    }
}

export default BwShapeTool;
