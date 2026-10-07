// Ported from pinned pxt-arcade 4.2.1 libs/game/rotation.ts (MIT), the sprite's
// rotated bounding box: its corners, the axis-aligned size it occupies (which
// becomes the sprite's width and height) and the separating-axis overlap test.
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// TypeScript to JavaScript only; the arithmetic is unchanged (task F4).
module.exports = function initializePxtRotation() {
    function checkForNonIntersection(a, ax, ay, b, bx, by) {
        // we only need to check the first two sides because the
        // normals are the same for the other two
        for (let pointIndex = 0; pointIndex < 4; pointIndex += 2) {
            const normalX = a[pointIndex + 3] - a[pointIndex + 1];
            const normalY = a[pointIndex] - a[pointIndex + 2];
            let minA, maxA, minB, maxB;
            for (let i = 0; i < 8; i += 2) {
                const projected = normalX * (a[i] + ax) + normalY * (a[i + 1] + ay);
                if (minA === undefined || projected < minA) minA = projected;
                if (maxA == undefined || projected > maxA) maxA = projected;
            }
            for (let i = 0; i < 8; i += 2) {
                const projected = normalX * (b[i] + bx) + normalY * (b[i + 1] + by);
                if (minB === undefined || projected < minB) minB = projected;
                if (maxB == undefined || projected > maxB) maxB = projected;
            }
            if (maxA < minB || maxB < minA) return true;
        }
        return false;
    }
    function doRectanglesIntersect(a, ax, ay, b, bx, by) {
        return !(checkForNonIntersection(a, ax, ay, b, bx, by) || checkForNonIntersection(b, bx, by, a, ax, ay));
    }
    class RotatedBoundingBox {
        // anchor: the sprite; its x and y (center) place the box.
        constructor(anchor, width, height) {
            this.anchor = anchor;
            this.points = [];
            this._rotation = 0;
            this.setDimensions(width, height);
        }
        get rotation() { return this._rotation; }
        set rotation(value) { this.setRotation(value); }
        get width() { return this._width; }
        get height() { return this._height; }
        setDimensions(width, height) {
            width /= 2;
            height /= 2;
            this.cornerDistance = Math.sqrt(width * width + height * height);
            this.cornerAngle = Math.atan2(height, width);
            this.setRotation(this._rotation);
        }
        setRotation(angle) {
            this._rotation = angle;
            this.points[0] = Math.cos(this.cornerAngle + angle) * this.cornerDistance;
            this.points[1] = Math.sin(this.cornerAngle + angle) * this.cornerDistance;
            this.points[2] = Math.cos(Math.PI - this.cornerAngle + angle) * this.cornerDistance;
            this.points[3] = Math.sin(Math.PI - this.cornerAngle + angle) * this.cornerDistance;
            this.points[4] = Math.cos(Math.PI + this.cornerAngle + angle) * this.cornerDistance;
            this.points[5] = Math.sin(Math.PI + this.cornerAngle + angle) * this.cornerDistance;
            this.points[6] = Math.cos(angle - this.cornerAngle) * this.cornerDistance;
            this.points[7] = Math.sin(angle - this.cornerAngle) * this.cornerDistance;
            this.updateWidthHeight();
        }
        overlaps(other) {
            return doRectanglesIntersect(this.points, this.anchor.x, this.anchor.y, other.points, other.anchor.x, other.anchor.y);
        }
        overlapsAABB(left, top, right, bottom) {
            const aabbPoints = [left, top, right, top, right, bottom, left, bottom];
            return doRectanglesIntersect(this.points, this.anchor.x, this.anchor.y, aabbPoints, 0, 0);
        }
        updateWidthHeight() {
            let minX = this.points[0], maxX = minX, minY = this.points[1], maxY = minY;
            for (let i = 2; i < 8; i += 2) {
                minX = Math.min(minX, this.points[i]);
                maxX = Math.max(maxX, this.points[i]);
                minY = Math.min(minY, this.points[i + 1]);
                maxY = Math.max(maxY, this.points[i + 1]);
            }
            this._width = (maxX - minX) | 0;
            this._height = (maxY - minY) | 0;
        }
    }
    return {RotatedBoundingBox};
};
