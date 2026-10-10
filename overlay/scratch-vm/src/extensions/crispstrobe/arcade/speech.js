// Pixel-image and clock bridge for PXT's speech renderers. This function is
// passed to the extension adapter with the generated PXT classes.
module.exports = function createSpeechEngine(initialize, fonts, initializeNativeLegacy) {
    let now = 0;
    let deltaTime = 0;
    const camera = {offsetX: 0, offsetY: 0, drawOffsetX: 0, drawOffsetY: 0};
    function setCamera(value) {
        for (const key of ['offsetX', 'offsetY', 'drawOffsetX', 'drawOffsetY']) {
            camera[key] = value ? Number(value[key]) || 0 : 0;
        }
    }
    const decoded = {};
    for (const key of ['font8', 'font12']) {
        const font = fonts[key];
        const data = Uint8Array.from(atob(font.data), c => c.charCodeAt(0));
        const stride = 2 + font.charWidth * Math.ceil(font.charHeight / 8);
        const glyphs = new Map();
        for (let offset = 0; offset + stride <= data.length; offset += stride) {
            glyphs.set(data[offset] | data[offset + 1] << 8, data.slice(offset + 2, offset + stride));
        }
        // The adapter retains this factory and its compiled dependency closure.
        decoded[key] = Object.assign({}, font, {glyphs});
    }
    class PixelImage {
        constructor(width, height) {
            this.width = Math.max(1, width | 0);
            this.height = Math.max(1, height | 0);
            this.pixels = new Uint8Array(this.width * this.height);
        }
        setPixel(x, y, color) {
            x |= 0; y |= 0;
            if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.pixels[y * this.width + x] = color & 15;
            if (this.writes && x >= 0 && x < this.width && y >= 0 && y < this.height) this.writes[y * this.width + x] = 1;
        }
        fill(color) { this.pixels.fill(color & 15); }
        fillRect(x, y, width, height, color) {
            x |= 0; y |= 0; width |= 0; height |= 0;
            for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row++) {
                for (let col = Math.max(0, x); col < Math.min(this.width, x + width); col++) {
                    this.pixels[row * this.width + col] = color & 15;
                    if (this.writes) this.writes[row * this.width + col] = 1;
                }
            }
        }
        print(text, x, y, color, font) {
            x |= 0; y |= 0;
            const origin = x;
            const byteHeight = Math.ceil(font.charHeight / 8);
            for (let i = 0; i < text.length; i++) {
                const code = text.charCodeAt(i);
                if (code === 10) { y += font.charHeight + 2; x = origin; }
                if (code < 32) continue;
                const glyph = font.glyphs.get(code) || font.glyphs.get(32);
                if (glyph) for (let col = 0; col < font.charWidth; col++) {
                    for (let row = 0; row < font.charHeight; row++) {
                        if (glyph[col * byteHeight + (row >> 3)] & (1 << (row & 7))) {
                            this.setPixel(x + col, y + row, color || 1);
                        }
                    }
                }
                x += font.charWidth;
            }
        }
        drawTransparentImage(source, x, y) {
            for (let row = 0; row < source.height; row++) for (let col = 0; col < source.width; col++) {
                const color = source.pixels[row * source.width + col];
                if (color) this.setPixel(x + col, y + row, color);
            }
        }
    }
    class BubbleSprite {
        constructor(image) { this.image = image; this.x = 0; this.y = 0; this.flags = 0; }
        get width() { return this.image.width; }
        get height() { return this.image.height; }
        get left() { return this.x - this.width / 2; }
        set left(value) { this.x = value + this.width / 2; }
        get right() { return this.x + this.width / 2; }
        set right(value) { this.x = value - this.width / 2; }
        get top() { return this.y - this.height / 2; }
        setImage(image) { this.image = image; }
        setFlag(flag, on) { this.flags = on ? this.flags | flag : this.flags & ~flag; }
        destroy() { this.destroyed = true; }
    }
    const image = {
        create: (width, height) => new PixelImage(width, height),
        getFontForText: text => /[\u2001-\uffff]/.test(text) ? decoded.font12 : decoded.font8
    };
    const screen = new PixelImage(160, 120);
    screen.writes = new Uint8Array(160 * 120);
    const game = {
        runtime: () => now,
        currentScene: () => ({camera, eventContext: {deltaTimeMillis: deltaTime * 1000}}),
        eventContext: () => ({deltaTime})
    };
    const inspect = text => typeof text === 'object' ? JSON.stringify(text) : String(text);
    const pxt = initialize(image, {millis: () => now}, game, screen,
        {Ghost: 4, RelativeToCamera: 2}, {toInt: value => value | 0}, inspect);
    pxt.Flag = {Destroyed: 1, RelativeToCamera: 2};
    pxt.create = img => new BubbleSprite(img);
    function ownerFor(sprite) {
        const owner = Object.assign({}, sprite, {flags: (sprite.flags & 512 ? 2 : 0) | (sprite._destroyed ? 1 : 0)});
        owner.left = owner.x - owner.width / 2;
        owner.top = owner.y - owner.height / 2;
        owner._hitbox = {oy: 0};
        if (sprite.mask) {
            const first = sprite.mask.findIndex(pixel => pixel !== 0);
            if (first >= 0) owner._hitbox.oy = Math.floor(first / sprite.width);
        }
        owner.isOutOfScreen = view => {
            const ox = owner.flags & 2 ? 0 : view.drawOffsetX;
            const oy = owner.flags & 2 ? 0 : view.drawOffsetY;
            return owner.left + owner.width - ox < 0 || owner.top + owner.height - oy < 0 ||
                owner.left - ox > 160 || owner.top - oy > 120;
        };
        return owner;
    }
    function renderRaster(renderer, sprite, time, dt, viewCamera) {
        setCamera(viewCamera);
        now = time; deltaTime = dt;
        screen.fill(0);
        screen.writes.fill(0);
        const owner = renderer._bwOwner;
        Object.assign(owner, ownerFor(sprite));
        renderer.update(dt, camera, owner);
        renderer.draw(screen, camera, owner);
        const bubble = renderer.sayBubbleSprite;
        if (bubble && !bubble.destroyed) {
            const ox = bubble.flags & 2 ? 0 : camera.drawOffsetX;
            const oy = bubble.flags & 2 ? 0 : camera.drawOffsetY;
            screen.drawTransparentImage(bubble.image, Math.floor(bubble.left - ox), Math.floor(bubble.top - oy));
        }
        return {width:160,height:120,pixels:screen.pixels.slice(),writes:screen.writes.slice()};
    }
    const imageViews = new WeakMap();
    function pixelImage(source) {
        if (source instanceof PixelImage) return source;
        let view = imageViews.get(source);
        if (!view) {view = new PixelImage(source.width, source.height); imageViews.set(source, view);}
        view.width = source.width; view.height = source.height; view.pixels = source.pixels;
        return view;
    }
    return {
        pixelImage,
        createNative(text, duration, foreground, background, sprite, context, allocate) {
            now = context.time(); setCamera(context.camera()); deltaTime = 0;
            const owner = ownerFor(sprite);
            // Native hitbox offsets are already floored pixels. Capture the
            // PXT scaled/rotated box before creation handlers can change it.
            const hitbox = context.hitbox && context.hitbox();
            if (hitbox) owner._hitbox = {oy: hitbox.top};
            const resume = bubble => {
                now = context.time(); setCamera(context.camera());
                Object.assign(owner, ownerFor(sprite));
                return bubble;
            };
            const create = initializeNativeLegacy(pxt, image, game, screen, inspect, value => value | 0,
                (img, kind) => {
                    const bubble = allocate(img, kind);
                    return bubble && typeof bubble.then === 'function' ? bubble.then(resume) : resume(bubble);
                });
            const finish = renderer => {
                if(renderer)renderer._bwOwner = owner;
                return renderer;
            };
            const renderer = create(text, duration < 0 ? undefined : duration, owner, foreground, background);
            return renderer && typeof renderer.then === 'function' ? renderer.then(finish) : finish(renderer);
        },
        create(text, duration, animated, foreground, background, legacy, sprite, time, viewCamera) {
            setCamera(viewCamera);
            now = time;
            const owner = ownerFor(sprite);
            const renderer = legacy ? new pxt.LegacySpriteSayRenderer(text, duration < 0 ? undefined : duration,
                owner, foreground, background) : new pxt.SpriteSayRenderer(text, foreground, background,
                animated, duration < 0 ? undefined : duration);
            renderer._bwOwner = owner;
            return renderer;
        },
        renderRaster,
        render: (renderer, sprite, time, dt, viewCamera) => renderRaster(renderer, sprite, time, dt, viewCamera).pixels
    };
};
