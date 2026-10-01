import paper from '@scratch/paper';
import {getRaster, getGuideLayer} from '../layer';
import {forEachLinePoint, getBrushMark} from '../bitmap';

/**
 * Tool for drawing with the bitmap brush and eraser
 */
class BrushTool extends paper.Tool {
    /**
     * @param {!function} onUpdateImage A callback to call when the image visibly changes
     * @param {boolean} isEraser True if brush should erase
     */
    constructor (onUpdateImage, isEraser) {
        super();
        this.onUpdateImage = onUpdateImage;
        this.isEraser = isEraser;

        // We have to set these functions instead of just declaring them because
        // paper.js tools hook up the listeners in the setter functions.
        this.onMouseMove = this.handleMouseMove;
        this.onMouseDown = this.handleMouseDown;
        this.onMouseDrag = this.handleMouseDrag;
        this.onMouseUp = this.handleMouseUp;

        this.colorState = null;
        this.active = false;
        this.lastPoint = null;
        this.cursorPreview = null;
        this.opacity = 1;
    }
    setColor (color) {
        this.color = color;
        this.tmpCanvas = getBrushMark(this.size, this.color, this.isEraser || !this.color);
    }
    setBrushSize (size) {
        // For performance, make sure this is an integer
        this.size = Math.max(1, ~~size);
        this.tmpCanvas = getBrushMark(this.size, this.color, this.isEraser || !this.color);
    }
    setOpacity (percent) {
        const value = Number(percent);
        this.opacity = Number.isFinite(value) ? Math.max(0.01, Math.min(1, value / 100)) : 1;
    }
    // Draw a brush mark at the given point
    draw (x, y) {
        const roundedUpRadius = Math.ceil(this.size / 2);
        if (this.strokeCanvas) {
            this.strokeCanvas.getContext('2d').drawImage(this.tmpCanvas,
                ~~x - roundedUpRadius, ~~y - roundedUpRadius);
            return;
        }
        const context = getRaster().getContext('2d');
        const previousAlpha = context.globalAlpha;
        const previousComposite = context.globalCompositeOperation;
        context.globalAlpha = this.isEraser || !this.color ? 1 : this.opacity;
        if (this.isEraser || !this.color) {
            context.globalCompositeOperation = 'destination-out';
        }
        getRaster().drawImage(this.tmpCanvas, new paper.Point(~~x - roundedUpRadius, ~~y - roundedUpRadius));
        context.globalAlpha = previousAlpha;
        context.globalCompositeOperation = previousComposite;
    }
    beginTranslucentStroke () {
        this.strokeCanvas = null;
        this.strokeBase = null;
        if (this.isEraser || !this.color || this.opacity >= 1) return;
        const source = getRaster().canvas;
        this.strokeBase = document.createElement('canvas');
        this.strokeBase.width = source.width;
        this.strokeBase.height = source.height;
        this.strokeBase.getContext('2d').drawImage(source, 0, 0);
        this.strokeCanvas = document.createElement('canvas');
        this.strokeCanvas.width = source.width;
        this.strokeCanvas.height = source.height;
    }
    compositeStroke () {
        if (!this.strokeCanvas) return;
        const raster = getRaster();
        const context = raster.getContext(true /* modify */);
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, raster.canvas.width, raster.canvas.height);
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 1;
        context.drawImage(this.strokeBase, 0, 0);
        context.globalAlpha = this.opacity;
        context.drawImage(this.strokeCanvas, 0, 0);
        context.restore();
    }
    updateCursorIfNeeded () {
        if (!this.size) {
            return;
        }

        // The cursor preview was unattached from the view by an outside process,
        // such as changing costumes or undo.
        if (this.cursorPreview && !this.cursorPreview.parent) {
            this.cursorPreview = null;
        }

        if (!this.cursorPreview || !(this.lastSize === this.size && this.lastColor === this.color &&
            this.lastOpacity === this.opacity)) {
            if (this.cursorPreview) {
                this.cursorPreview.remove();
            }

            this.tmpCanvas = getBrushMark(this.size, this.color, this.isEraser || !this.color);
            this.cursorPreview = new paper.Raster(this.tmpCanvas);
            this.cursorPreview.opacity = this.isEraser ? 1 : this.opacity;
            this.cursorPreview.guide = true;
            this.cursorPreview.parent = getGuideLayer();
            this.cursorPreview.data.isHelperItem = true;
        }

        this.lastSize = this.size;
        this.lastColor = this.color;
        this.lastOpacity = this.opacity;
    }
    handleMouseMove (event) {
        this.updateCursorIfNeeded();
        this.cursorPreview.position = new paper.Point(~~event.point.x, ~~event.point.y);
    }
    handleMouseDown (event) {
        if (event.event.button > 0) return; // only first mouse button
        this.active = true;

        if (this.cursorPreview) {
            this.cursorPreview.remove();
        }

        this.beginTranslucentStroke();
        this.draw(event.point.x, event.point.y);
        this.compositeStroke();
        this.lastPoint = event.point;
    }
    handleMouseDrag (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        forEachLinePoint(this.lastPoint, event.point, this.draw.bind(this));
        this.compositeStroke();
        this.lastPoint = event.point;
    }
    handleMouseUp (event) {
        if (event.event.button > 0 || !this.active) return; // only first mouse button

        if (this.lastPoint && !this.lastPoint.equals(event.point)) {
            forEachLinePoint(this.lastPoint, event.point, this.draw.bind(this));
            this.compositeStroke();
        }
        this.onUpdateImage();

        this.strokeCanvas = null;
        this.strokeBase = null;
        this.lastPoint = null;
        this.active = false;

        this.updateCursorIfNeeded();
        this.cursorPreview.position = new paper.Point(~~event.point.x, ~~event.point.y);
    }
    deactivateTool () {
        this.active = false;
        this.strokeCanvas = null;
        this.strokeBase = null;
        this.tmpCanvas = null;
        if (this.cursorPreview) {
            this.cursorPreview.remove();
            this.cursorPreview = null;
        }
    }
}

export default BrushTool;
