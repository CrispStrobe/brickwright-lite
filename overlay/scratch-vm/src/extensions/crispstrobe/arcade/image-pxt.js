// Generated from pinned pxt-common-packages simulator image algorithms (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Source algorithms SHA-256: 077647b73cced8e8058dac5e3ec53be2ff1c75a57c4e33aa03aca953912df648
// Regenerate: node scripts/generate-arcade-image-operations.mjs
module.exports = function initializePxtImageOperations() {
function setPixel(img, x, y, c) {
            img.makeWritable();
            if (img.inRange(x, y))
                img.data[img.pix(x, y)] = img.color(c);
        }
function getPixel(img, x, y) {
            if (img.inRange(x, y))
                return img.data[img.pix(x, y)];
            return 0;
        }
function fillRect(img, x, y, w, h, c) {
            if (w == 0 || h == 0 || x >= img._width || y >= img._height || x + w - 1 < 0 || y + h - 1 < 0)
                return;
            img.makeWritable();
            let [x2, y2] = img.clamp(x + w - 1, y + h - 1);
            [x, y] = img.clamp(x, y);
            let p = img.pix(x, y);
            w = x2 - x + 1;
            h = y2 - y + 1;
            let d = img._width - w;
            c = img.color(c);
            while (h-- > 0) {
                for (let i = 0; i < w; ++i)
                    img.data[p++] = c;
                p += d;
            }
        }
function drawLineLow(img, x0, y0, x1, y1, c) {
            let dx = x1 - x0;
            let dy = y1 - y0;
            let yi = img._width;
            if (dy < 0) {
                yi = -yi;
                dy = -dy;
            }
            let D = 2 * dy - dx;
            dx <<= 1;
            dy <<= 1;
            c = img.color(c);
            let ptr = img.pix(x0, y0);
            for (let x = x0; x <= x1; ++x) {
                img.data[ptr] = c;
                if (D > 0) {
                    ptr += yi;
                    D -= dx;
                }
                D += dy;
                ptr++;
            }
        }
function drawLineHigh(img, x0, y0, x1, y1, c) {
            let dx = x1 - x0;
            let dy = y1 - y0;
            let xi = 1;
            if (dx < 0) {
                xi = -1;
                dx = -dx;
            }
            let D = 2 * dx - dy;
            dx <<= 1;
            dy <<= 1;
            c = img.color(c);
            let ptr = img.pix(x0, y0);
            for (let y = y0; y <= y1; ++y) {
                img.data[ptr] = c;
                if (D > 0) {
                    ptr += xi;
                    D -= dy;
                }
                D += dx;
                ptr += img._width;
            }
        }
function drawLine(img, x0, y0, x1, y1, c) {
            x0 |= 0;
            y0 |= 0;
            x1 |= 0;
            y1 |= 0;
            if (x1 < x0) {
                drawLine(img, x1, y1, x0, y0, c);
                return;
            }
            let w = x1 - x0;
            let h = y1 - y0;
            if (h == 0) {
                if (w == 0)
                    setPixel(img, x0, y0, c);
                else
                    fillRect(img, x0, y0, w + 1, 1, c);
                return;
            }
            if (w == 0) {
                if (h > 0)
                    fillRect(img, x0, y0, 1, h + 1, c);
                else
                    fillRect(img, x0, y1, 1, -h + 1, c);
                return;
            }
            if (x1 < 0 || x0 >= img._width)
                return;
            if (x0 < 0) {
                y0 -= (h * x0 / w) | 0;
                x0 = 0;
            }
            if (x1 >= img._width) {
                let d = (img._width - 1) - x1;
                y1 += (h * d / w) | 0;
                x1 = img._width - 1;
            }
            if (y0 < y1) {
                if (y0 >= img._height || y1 < 0)
                    return;
                if (y0 < 0) {
                    x0 -= (w * y0 / h) | 0;
                    y0 = 0;
                }
                if (y1 >= img._height) {
                    let d = (img._height - 1) - y1;
                    x1 += (w * d / h) | 0;
                    y1 = img._height;
                }
            }
            else {
                if (y1 >= img._height || y0 < 0)
                    return;
                if (y1 < 0) {
                    x1 -= (w * y1 / h) | 0;
                    y1 = 0;
                }
                if (y0 >= img._height) {
                    let d = (img._height - 1) - y0;
                    x0 += (w * d / h) | 0;
                    y0 = img._height;
                }
            }
            img.makeWritable();
            if (h < 0) {
                h = -h;
                if (h < w)
                    drawLineLow(img, x0, y0, x1, y1, c);
                else
                    drawLineHigh(img, x1, y1, x0, y0, c);
            }
            else {
                if (h < w)
                    drawLineLow(img, x0, y0, x1, y1, c);
                else
                    drawLineHigh(img, x0, y0, x1, y1, c);
            }
        }
function drawImageCore(img, from, x, y, clear, check) {
            x |= 0;
            y |= 0;
            const w = from._width;
            let h = from._height;
            const sh = img._height;
            const sw = img._width;
            if (x + w <= 0)
                return false;
            if (x >= sw)
                return false;
            if (y + h <= 0)
                return false;
            if (y >= sh)
                return false;
            if (clear)
                fillRect(img, x, y, from._width, from._height, 0);
            else if (!check)
                img.makeWritable();
            const len = x < 0 ? Math.min(sw, w + x) : Math.min(sw - x, w);
            const fdata = from.data;
            const tdata = img.data;
            for (let p = 0; h--; y++, p += w) {
                if (0 <= y && y < sh) {
                    let dst = y * sw;
                    let src = p;
                    if (x < 0)
                        src += -x;
                    else
                        dst += x;
                    for (let i = 0; i < len; ++i) {
                        const v = fdata[src++];
                        if (v) {
                            if (check) {
                                if (tdata[dst])
                                    return true;
                            }
                            else {
                                tdata[dst] = v;
                            }
                        }
                        dst++;
                    }
                }
            }
            return false;
        }
function drawImage(img, from, x, y) {
            drawImageCore(img, from, x, y, true, false);
        }
function drawTransparentImage(img, from, x, y) {
            drawImageCore(img, from, x, y, false, false);
        }
function overlapsWith(img, other, x, y) {
            return drawImageCore(img, other, x, y, false, true);
        }
const TWO_PI = 2 * Math.PI;
        const HALF_PI = Math.PI / 2;
        const THREE_HALF_PI = 3 * Math.PI / 2;
        const FX_ONE = 1;
        function fxMul(a, b) {
            return (a * b);
        }
        function fxDiv(a, b) {
            return a / b;
        }
        function fxToInt(v) {
            return v;
        }
        function fxFloor(v) {
            return v | 0;
        }
        function parseShearArgs(src, args, argIndex) {
            const parsed = {
                sx: 0,
                sy: 0,
                scaledWidth: 0,
                scaledHeight: 0,
                minX: 0,
                minY: 0,
                maxX: 0,
                maxY: 0,
                xShear: 0,
                yShear: 0,
                flip: false
            };
            const sx = (args.getAt(argIndex) * FX_ONE);
            const sy = (args.getAt(argIndex + 1) * FX_ONE);
            let angle = args.getAt(argIndex + 2);
            parsed.sx = sx;
            parsed.sy = sy;
            if (sx <= 0 || sy <= 0) {
                return parsed;
            }
            angle %= TWO_PI;
            if (angle < 0) {
                angle += TWO_PI;
            }
            let flip = false;
            if (angle > HALF_PI && angle <= THREE_HALF_PI) {
                flip = true;
                angle = (angle + Math.PI) % TWO_PI;
            }
            const xShear = (-Math.tan(angle / 2) * FX_ONE);
            const yShear = (Math.sin(angle) * FX_ONE);
            const scaledWidth = src._width * sx;
            const scaledHeight = src._height * sy;
            let shearedX = 0;
            let shearedY = 0;
            const SHEAR = (x, y) => {
                shearedX = fxFloor(x + fxMul(y, xShear));
                shearedY = fxFloor(y + fxMul(shearedX, yShear));
                shearedX = fxFloor(shearedX + fxMul(shearedY, xShear));
            };
            SHEAR(0, 0);
            let minX = shearedX;
            let minY = shearedY;
            let maxX = shearedX;
            let maxY = shearedY;
            SHEAR(scaledWidth - FX_ONE, 0);
            minX = Math.min(minX, shearedX);
            minY = Math.min(minY, shearedY);
            maxX = Math.max(maxX, shearedX);
            maxY = Math.max(maxY, shearedY);
            SHEAR(scaledWidth - FX_ONE, scaledHeight - FX_ONE);
            minX = Math.min(minX, shearedX);
            minY = Math.min(minY, shearedY);
            maxX = Math.max(maxX, shearedX);
            maxY = Math.max(maxY, shearedY);
            SHEAR(0, scaledHeight - FX_ONE);
            minX = Math.min(minX, shearedX);
            minY = Math.min(minY, shearedY);
            maxX = Math.max(maxX, shearedX);
            maxY = Math.max(maxY, shearedY);
            parsed.minX = minX;
            parsed.minY = minY;
            parsed.maxX = maxX;
            parsed.maxY = maxY;
            parsed.scaledWidth = scaledWidth;
            parsed.scaledHeight = scaledHeight;
            parsed.xShear = xShear;
            parsed.yShear = yShear;
            parsed.flip = flip;
            return parsed;
        }
        function _drawScaledRotatedImage(dst, src, args) {
            drawScaledRotatedImage(dst, src, args);
        }
        function drawScaledRotatedImage(dst, src, args) {
            const xDst = args.getAt(0);
            const yDst = args.getAt(1);
            if (xDst >= dst._width || yDst >= dst._height) {
                return;
            }
            const shearArgs = parseShearArgs(src, args, 2);
            if (shearArgs.sx <= 0 ||
                shearArgs.sy <= 0 ||
                xDst + fxToInt(shearArgs.maxX - shearArgs.minX) < 0 ||
                yDst + fxToInt(shearArgs.maxY - shearArgs.minY) < 0) {
                return;
            }
            let shearedX = 0;
            let shearedY = 0;
            const SHEAR = (x, y) => {
                shearedX = fxFloor(x + fxMul(y, shearArgs.xShear));
                shearedY = fxFloor(y + fxMul(shearedX, shearArgs.yShear));
                shearedX = fxFloor(shearedX + fxMul(shearedY, shearArgs.xShear));
            };
            dst.makeWritable();
            if (shearArgs.flip) {
                for (let y = 0; y < shearArgs.scaledHeight; y += FX_ONE) {
                    for (let x = 0; x < shearArgs.scaledWidth; x += FX_ONE) {
                        let color = getPixel(src, fxToInt(fxDiv((shearArgs.scaledWidth - x - FX_ONE), shearArgs.sx)), fxToInt(fxDiv((shearArgs.scaledHeight - y - FX_ONE), shearArgs.sy)));
                        if (!color)
                            continue;
                        SHEAR(x, y);
                        setPixel(dst, xDst + fxToInt(shearedX - shearArgs.minX), yDst + fxToInt(shearedY - shearArgs.minY), color);
                    }
                }
            }
            else {
                for (let y = 0; y < shearArgs.scaledHeight; y += FX_ONE) {
                    for (let x = 0; x < shearArgs.scaledWidth; x += FX_ONE) {
                        let color = getPixel(src, fxToInt(fxDiv(x, shearArgs.sx)), fxToInt(fxDiv(y, shearArgs.sy)));
                        if (!color)
                            continue;
                        SHEAR(x, y);
                        setPixel(dst, xDst + fxToInt(shearedX - shearArgs.minX), yDst + fxToInt(shearedY - shearArgs.minY), color);
                    }
                }
            }
        }
        function _checkOverlapsScaledRotatedImage(dst, src, args) {
            const xDst = args.getAt(0);
            const yDst = args.getAt(1);
            if (xDst >= dst._width || yDst >= dst._height) {
                return false;
            }
            const shearArgs = parseShearArgs(src, args, 2);
            if (shearArgs.sx <= 0 ||
                shearArgs.sy <= 0 ||
                xDst + fxToInt(shearArgs.maxX - shearArgs.minX) < 0 ||
                yDst + fxToInt(shearArgs.maxY - shearArgs.minY) < 0) {
                return false;
            }
            let shearedX = 0;
            let shearedY = 0;
            const SHEAR = (x, y) => {
                shearedX = fxFloor(x + fxMul(y, shearArgs.xShear));
                shearedY = fxFloor(y + fxMul(shearedX, shearArgs.yShear));
                shearedX = fxFloor(shearedX + fxMul(shearedY, shearArgs.xShear));
            };
            if (shearArgs.flip) {
                for (let y = 0; y < shearArgs.scaledHeight; y += FX_ONE) {
                    for (let x = 0; x < shearArgs.scaledWidth; x += FX_ONE) {
                        let color = getPixel(src, fxToInt(fxDiv((shearArgs.scaledWidth - x - FX_ONE), shearArgs.sx)), fxToInt(fxDiv((shearArgs.scaledHeight - y - FX_ONE), shearArgs.sy)));
                        if (!color)
                            continue;
                        SHEAR(x, y);
                        if (getPixel(dst, xDst + fxToInt(shearedX - shearArgs.minX), yDst + fxToInt(shearedY - shearArgs.minY))) {
                            return true;
                        }
                    }
                }
            }
            else {
                for (let y = 0; y < shearArgs.scaledHeight; y += FX_ONE) {
                    for (let x = 0; x < shearArgs.scaledWidth; x += FX_ONE) {
                        let color = getPixel(src, fxToInt(fxDiv(x, shearArgs.sx)), fxToInt(fxDiv(y, shearArgs.sy)));
                        if (!color)
                            continue;
                        SHEAR(x, y);
                        if (getPixel(dst, xDst + fxToInt(shearedX - shearArgs.minX), yDst + fxToInt(shearedY - shearArgs.minY))) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
        function _checkOverlapsTwoScaledRotatedImages(dst, src, args) {
            const xDst = args.getAt(0);
            const yDst = args.getAt(1);
            const dstArgs = parseShearArgs(dst, args, 2);
            if (dstArgs.sx <= 0 ||
                dstArgs.sy <= 0 ||
                xDst >= dstArgs.maxX - dstArgs.minX ||
                yDst >= dstArgs.maxY - dstArgs.minY) {
                return false;
            }
            const srcArgs = parseShearArgs(src, args, 5);
            if (srcArgs.sx <= 0 ||
                srcArgs.sy <= 0 ||
                xDst + srcArgs.maxX - srcArgs.minX < 0 ||
                yDst + srcArgs.maxY - srcArgs.minY < 0) {
                return false;
            }
            let shearedX = 0;
            let shearedY = 0;
            let unshearedX = 0;
            let unshearedY = 0;
            const SHEAR = (x, y, xShear, yShear) => {
                shearedX = fxFloor(x + fxMul(y, xShear));
                shearedY = fxFloor(y + fxMul(shearedX, yShear));
                shearedX = fxFloor(shearedX + fxMul(shearedY, xShear));
            };
            const REVERSE_SHEAR = (x, y, xShear, yShear) => {
                unshearedX = fxFloor(x - fxMul(y, xShear));
                unshearedY = fxFloor(y - fxMul(unshearedX, yShear));
                unshearedX = fxFloor(unshearedX - fxMul(unshearedY, xShear));
            };
            if (srcArgs.flip) {
                for (let y = 0; y < srcArgs.scaledHeight; y += FX_ONE) {
                    for (let x = 0; x < srcArgs.scaledWidth; x += FX_ONE) {
                        let color = getPixel(src, fxToInt(fxDiv((srcArgs.scaledWidth - x - FX_ONE), srcArgs.sx)), fxToInt(fxDiv((srcArgs.scaledHeight - y - FX_ONE), srcArgs.sy)));
                        if (!color)
                            continue;
                        SHEAR(x, y, srcArgs.xShear, srcArgs.yShear);
                        const screenX = xDst + shearedX - srcArgs.minX;
                        const screenY = yDst + shearedY - srcArgs.minY;
                        if (screenX < 0 ||
                            screenY < 0 ||
                            screenX >= dstArgs.maxX - dstArgs.minX ||
                            screenY >= dstArgs.maxY - dstArgs.minY) {
                            continue;
                        }
                        REVERSE_SHEAR(screenX + dstArgs.minX, screenY + dstArgs.minY, dstArgs.xShear, dstArgs.yShear);
                        if (dstArgs.flip) {
                            if (getPixel(dst, fxToInt(fxDiv(dstArgs.scaledWidth - unshearedX - FX_ONE, dstArgs.sx)), fxToInt(fxDiv(dstArgs.scaledHeight - unshearedY - FX_ONE, dstArgs.sy)))) {
                                return true;
                            }
                        }
                        else if (getPixel(dst, fxToInt(fxDiv(unshearedX, dstArgs.sx)), fxToInt(fxDiv(unshearedY, dstArgs.sy)))) {
                            return true;
                        }
                    }
                }
            }
            else {
                for (let y = 0; y < srcArgs.scaledHeight; y += FX_ONE) {
                    for (let x = 0; x < srcArgs.scaledWidth; x += FX_ONE) {
                        let color = getPixel(src, fxToInt(fxDiv(x, srcArgs.sx)), fxToInt(fxDiv(y, srcArgs.sy)));
                        if (!color)
                            continue;
                        SHEAR(x, y, srcArgs.xShear, srcArgs.yShear);
                        const screenX = xDst + shearedX - srcArgs.minX;
                        const screenY = yDst + shearedY - srcArgs.minY;
                        if (screenX < 0 ||
                            screenY < 0 ||
                            screenX >= dstArgs.maxX - dstArgs.minX ||
                            screenY >= dstArgs.maxY - dstArgs.minY) {
                            continue;
                        }
                        REVERSE_SHEAR(screenX + dstArgs.minX, screenY + dstArgs.minY, dstArgs.xShear, dstArgs.yShear);
                        if (dstArgs.flip) {
                            if (getPixel(dst, fxToInt(fxDiv(dstArgs.scaledWidth - unshearedX - FX_ONE, dstArgs.sx)), fxToInt(fxDiv(dstArgs.scaledHeight - unshearedY - FX_ONE, dstArgs.sy)))) {
                                return true;
                            }
                        }
                        else if (getPixel(dst, fxToInt(fxDiv(unshearedX, dstArgs.sx)), fxToInt(fxDiv(unshearedY, dstArgs.sy)))) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
return {setPixel, getPixel, fillRect, drawLine, drawImage, drawTransparentImage, overlapsWith,
    drawScaledRotatedImage, checkOverlapsScaledRotatedImage: _checkOverlapsScaledRotatedImage,
    checkOverlapsTwoScaledRotatedImages: _checkOverlapsTwoScaledRotatedImages};
};
