// Generated from pinned pxt-common-packages simulator image algorithms (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Source algorithms SHA-256: b43e3b1d4cf864b82375e094edf26bdf31ff957d0d0c753172f65b999f39d4df
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
return {setPixel, getPixel, fillRect, drawLine, drawImage, drawTransparentImage, overlapsWith};
};
