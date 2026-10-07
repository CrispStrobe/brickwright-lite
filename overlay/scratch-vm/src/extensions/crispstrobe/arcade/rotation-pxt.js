// Ported from pinned pxt-arcade 4.2.1 libs/game/rotation.ts (MIT), the sprite's
// rotated bounding box: its corners, the axis-aligned size it occupies (which
// becomes the sprite's width and height) and the separating-axis overlap test.
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Bounding-box port: TypeScript to JavaScript only; its arithmetic is unchanged.
// rasterWindow below independently gathers the pinned simulator scatter output.
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
    function shearGeometry(source, sx, sy, angle) {
        angle %= 2 * Math.PI;
        if (angle < 0) angle += 2 * Math.PI;
        const flip = angle > Math.PI / 2 && angle <= 3 * Math.PI / 2;
        if (flip) angle = (angle + Math.PI) % (2 * Math.PI);
        const xs = -Math.tan(angle / 2), ys = Math.sin(angle);
        const sw = source.width * sx, sh = source.height * sy;
        const shear = (x, y) => {
            let a = (x + y * xs) | 0;
            const b = (y + a * ys) | 0;
            a = (a + b * xs) | 0;
            return [a, b];
        };
        const corners = [[0, 0], [sw - 1, 0], [sw - 1, sh - 1], [0, sh - 1]].map(([x, y]) => shear(x, y));
        const minX = Math.min(...corners.map(p => p[0])), minY = Math.min(...corners.map(p => p[1]));
        const maxX=Math.max(...corners.map(p=>p[0])),maxY=Math.max(...corners.map(p=>p[1]));
        return {xs,ys,sw,sh,flip,minX,minY,maxX,maxY};
    }
    // Bounds enclose every integer source-lattice scatter, including pixels
    // outside the separately calculated Sprite bounding box. Interval bounds
    // may include transparent space; they never change logical sprite geometry.
    function rasterFootprint(source, sx, sy, angle) {
        if(sx<=0 || sy<=0)return {left:0,top:0,right:-1,bottom:-1};
        const {xs,ys,sw,sh,minX,minY,maxX,maxY}=shearGeometry(source,sx,sy,angle);
        const truncRange=(low,high)=>{
            if(!Number.isFinite(low) || !Number.isFinite(high))return [0,0];
            if(low < -2147483648 || high > 2147483647)return [-2147483648,2147483647];
            return [low|0,high|0];
        };
        const product=(range,factor)=>factor>=0?[range[0]*factor,range[1]*factor]:[range[1]*factor,range[0]*factor];
        const add=(a,b)=>truncRange(a[0]+b[0],a[1]+b[1]);
        const x=[0,Math.ceil(sw)-1],y=[0,Math.ceil(sh)-1];
        const firstX=add(x,product(y,xs));
        const outY=add(y,product(firstX,ys));
        const outX=add(firstX,product(outY,xs));
        return {left:outX[0]-minX,top:outY[0]-minY,right:outX[1]-minX,bottom:outY[1]-minY,cullWidth:maxX-minX,cullHeight:maxY-minY};
    }
    // Gather only visible output pixels. The simulator scatters every scaled
    // source pixel through three truncating shears. Truncation at zero can map
    // several inputs to one output: verify all integer preimages, then retain
    // the last nontransparent writer in its original row/column order.
    function rasterWindow(source, sx, sy, angle, window) {
        const {x: cropX, y: cropY, width, height} = window;
        const pixels = new Uint8Array(width * height);
        if (!width || !height || sx <= 0 || sy <= 0) return {width, height, pixels};
        const {xs,ys,sw,sh,flip,minX,minY}=shearGeometry(source,sx,sy,angle);
        const maxInputX = Math.ceil(sw) - 1, maxInputY = Math.ceil(sh) - 1;
        // Invert ToInt32(n + offset), including its 2^32 wrapping. Each
        // preimage is checked with the actual forward operation; the small
        // neighbourhood includes both sides of the truncation discontinuity.
        const preimages = (target, offset, low, high) => {
            const result = [], period = 4294967296;
            const first = Math.ceil((low + offset - target - 2) / period);
            const last = Math.floor((high + offset - target + 2) / period);
            for (let k = first; k <= last; k++) {
                const base = Math.floor(target + k * period - offset);
                for (let d = -1; d <= 2; d++) {
                    const n = base + d;
                    if (n >= low && n <= high && ((n + offset) | 0) === target) result.push(n);
                }
            }
            return result;
        };
        for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
            const outX = col + cropX + minX, outY = row + cropY + minY;
            let lastX = -1, lastY = -1, color = 0;
            for (const a of preimages(outX, outY * xs, -2147483648, 2147483647)) {
                for (const y of preimages(outY, a * ys, 0, maxInputY)) {
                    for (const x of preimages(a, y * xs, 0, maxInputX)) {
                        if (y < lastY || (y === lastY && x <= lastX)) continue;
                        const ix = ((flip ? sw - x - 1 : x) / sx) | 0;
                        const iy = ((flip ? sh - y - 1 : y) / sy) | 0;
                        const c = ix >= 0 && iy >= 0 && ix < source.width && iy < source.height ? source.pixels[iy * source.width + ix] : 0;
                        if (c) {lastX = x; lastY = y; color = c;}
                    }
                }
            }
            pixels[row * width + col] = color;
        }
        return {width, height, pixels};
    }
    return {RotatedBoundingBox, rasterWindow, rasterFootprint};
};
