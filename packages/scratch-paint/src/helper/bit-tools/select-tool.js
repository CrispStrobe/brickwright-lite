import paper from '@scratch/paper';
import Modes from '../../lib/modes';

import {getGuideLayer, getRaster} from '../layer';
import {commitSelectionToBitmap} from '../bitmap';
import {lassoMask, opaqueBounds, wandMask} from './bw-selection-mask';

import BoundingBoxTool from '../selection-tools/bounding-box-tool';
import NudgeTool from '../selection-tools/nudge-tool';
import SelectionBoxTool from '../selection-tools/selection-box-tool';

/**
 * paper.Tool that handles bitmap selection and transforms.
 * - The selection box tool is active when the user clicks an empty space and drags.
 *   Lasso and wand use masks to lift only the chosen bitmap pixels.
 * - The bounding box tool is active if the user clicks on a non-empty space. It handles
 *   reshaping the selection.
 */
class SelectTool extends paper.Tool {
    /** The distance within which mouse events count as a hit against an item */
    static get TOLERANCE () {
        return 2;
    }
    /**
     * @param {function} setSelectedItems Callback to set the set of selected items in the Redux state
     * @param {function} clearSelectedItems Callback to clear the set of selected items in the Redux state
     * @param {function} setCursor Callback to set the visible mouse cursor
     * @param {!function} onUpdateImage A callback to call when the image visibly changes
     */
    constructor (setSelectedItems, clearSelectedItems, setCursor, onUpdateImage) {
        super();
        this.onUpdateImage = onUpdateImage;
        this.boundingBoxTool = new BoundingBoxTool(
            Modes.BIT_SELECT,
            setSelectedItems,
            clearSelectedItems,
            setCursor,
            onUpdateImage
        );
        const nudgeTool = new NudgeTool(Modes.BIT_SELECT, this.boundingBoxTool, onUpdateImage);
        this.selectionBoxTool = new SelectionBoxTool(Modes.BIT_SELECT, setSelectedItems, clearSelectedItems);
        this.selectionBoxMode = false;
        this.maskMode = false;
        this.maskPath = null;
        this.lassoPoints = null;
        this.selectionKind = 'rectangle';
        this.tolerance = 0;
        this.selection = null;
        this.active = false;

        // We have to set these functions instead of just declaring them because
        // paper.js tools hook up the listeners in the setter functions.
        this.onMouseDown = this.handleMouseDown;
        this.onMouseDrag = this.handleMouseDrag;
        this.onMouseMove = this.handleMouseMove;
        this.onMouseUp = this.handleMouseUp;
        this.onKeyUp = nudgeTool.onKeyUp;
        this.onKeyDown = nudgeTool.onKeyDown;

        this.boundingBoxTool.setSelectionBounds();
    }
    setSelectionOptions (kind, tolerance) {
        this.selectionKind = kind;
        this.tolerance = tolerance;
    }
    pointCell (point) {
        return [Math.floor(point.x), Math.floor(point.y)];
    }
    takeMaskedSelection (mask) {
        if (!mask) return;
        const bitmap = getRaster();
        const {width, height} = bitmap.canvas;
        const context = bitmap.getContext();
        const image = context.getImageData(0, 0, width, height);
        const bounds = opaqueBounds(mask, image.data, width, height);
        if (!bounds) return;
        const rect = new paper.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
        const raster = bitmap.getSubRaster(rect);
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = bounds.width;
        maskCanvas.height = bounds.height;
        const maskContext = maskCanvas.getContext('2d');
        const maskImage = maskContext.createImageData(bounds.width, bounds.height);
        for (let y = 0; y < bounds.height; y++) {
            for (let x = 0; x < bounds.width; x++) {
                const index = ((bounds.y + y) * width) + bounds.x + x;
                if (mask[index]) maskImage.data[(((y * bounds.width) + x) * 4) + 3] = 255;
            }
        }
        maskContext.putImageData(maskImage, 0, 0);
        const selectedContext = raster.canvas.getContext('2d');
        selectedContext.globalCompositeOperation = 'destination-in';
        selectedContext.drawImage(maskCanvas, 0, 0);
        selectedContext.globalCompositeOperation = 'source-over';
        raster.canvas.getContext('2d').imageSmoothingEnabled = false;
        raster.parent = paper.project.activeLayer;
        raster.selected = true;
        // The base bitmap is altered only by pixels inside the mask. Keep the masked
        // raster as the source for later rotations, instead of an unmasked expanded copy.
        const baseContext = bitmap.getContext(true /* modify */);
        baseContext.globalCompositeOperation = 'destination-out';
        baseContext.drawImage(maskCanvas, bounds.x, bounds.y);
        baseContext.globalCompositeOperation = 'source-over';
        this.selection = raster;
        this.selectionBoxTool.setSelectedItems();
    }
    /**
     * Should be called if the selection changes to update the bounds of the bounding box.
     * @param {Array<paper.Item>} selectedItems Array of selected items.
     */
    onSelectionChanged (selectedItems) {
        this.boundingBoxTool.onSelectionChanged(selectedItems);
        if (this.selection && this.selection.parent && !this.selection.selected) {
            // Selection got deselected
            this.commitSelection();
        }
        if ((!this.selection || !this.selection.parent) &&
                selectedItems && selectedItems.length === 1 && selectedItems[0] instanceof paper.Raster) {
            // Track the new active selection. This may happen via undo, paste, or drag to select.
            this.selection = selectedItems[0];
        }
    }
    /**
     * Returns the hit options to use when conducting hit tests.
     * @return {object} See paper.Item.hitTest for definition of options
     */
    getHitOptions () {
        // Tolerance needs to be scaled when the view is zoomed in in order to represent the same
        // distance for the user to move the mouse.
        return {
            segments: true,
            stroke: true,
            curves: true,
            fill: true,
            guide: false,
            tolerance: SelectTool.TOLERANCE / paper.view.zoom,
            match: hitResult => {
                // Don't match helper items, unless they are handles.
                if (!hitResult.item.data || !hitResult.item.data.isHelperItem) return true;
                return hitResult.item.data.isScaleHandle || hitResult.item.data.isRotHandle;
            }
        };
    }
    handleMouseDown (event) {
        if (event.event.button > 0) return; // only first mouse button
        this.active = true;

        // If bounding box tool does not find an item that was hit, rasterize the old selection,
        // then use selection box tool.
        if (!this.boundingBoxTool
            .onMouseDown(
                event,
                event.modifiers.alt,
                event.modifiers.shift,
                false /* doubleClicked */,
                this.getHitOptions())) {
            this.commitSelection();
            this.selectionBoxTool.onMouseDown(event.modifiers.shift);
            if (this.selectionKind === 'rectangle') {
                this.selectionBoxMode = true;
            } else {
                this.maskMode = true;
                const [x, y] = this.pointCell(event.point);
                if (this.selectionKind === 'wand') {
                    const canvas = getRaster().canvas;
                    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                    this.takeMaskedSelection(wandMask(data, canvas.width, canvas.height, x, y, this.tolerance));
                } else {
                    this.lassoPoints = [[x, y]];
                    this.maskPath = new paper.Path();
                    this.maskPath.parent = getGuideLayer();
                    this.maskPath.guide = true;
                    this.maskPath.data.isHelperItem = true;
                    this.maskPath.strokeColor = '#777';
                    this.maskPath.strokeWidth = 1 / paper.view.zoom;
                    this.maskPath.dashArray = [3 / paper.view.zoom, 3 / paper.view.zoom];
                    this.maskPath.add(event.point);
                }
            }
        }
    }
    handleMouseDrag (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        if (this.selectionBoxMode) {
            this.selectionBoxTool.onMouseDrag(event);
        } else if (this.maskMode) {
            if (this.selectionKind === 'lasso' && this.maskPath) {
                const cell = this.pointCell(event.point);
                const last = this.lassoPoints[this.lassoPoints.length - 1];
                if (cell[0] !== last[0] || cell[1] !== last[1]) {
                    this.lassoPoints.push(cell);
                    this.maskPath.add(event.point);
                }
            }
        } else {
            this.boundingBoxTool.onMouseDrag(event);
        }
    }
    handleMouseMove (event) {
        this.boundingBoxTool.onMouseMove(event, this.getHitOptions());
    }
    handleMouseUp (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        if (this.selectionBoxMode) {
            this.selectionBoxTool.onMouseUpBitmap(event);
        } else if (this.maskMode) {
            if (this.selectionKind === 'lasso' && this.lassoPoints) {
                const canvas = getRaster().canvas;
                this.takeMaskedSelection(lassoMask(this.lassoPoints, canvas.width, canvas.height));
            }
            if (this.maskPath) this.maskPath.remove();
            this.maskPath = null;
            this.lassoPoints = null;
        } else {
            this.boundingBoxTool.onMouseUp(event);
        }
        this.selectionBoxMode = false;
        this.maskMode = false;
        this.active = false;
    }
    commitSelection () {
        if (!this.selection || !this.selection.parent) return;

        commitSelectionToBitmap(this.selection, getRaster());
        this.selection.remove();
        this.selection = null;
        this.onUpdateImage();
    }
    deactivateTool () {
        if (this.maskPath) this.maskPath.remove();
        this.maskPath = null;
        this.lassoPoints = null;
        this.commitSelection();
        this.boundingBoxTool.deactivateTool();
        this.boundingBoxTool = null;
        this.selectionBoxTool = null;
    }
}

export default SelectTool;
