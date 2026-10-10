// Generated from PXT Arcade 4.2.1, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// fixed.ts: 44171fe3d5a0d1f9ca7eec09b5f48814eec22ac46d5586b4636fe4cc17f643cd
// mathUtil.ts: 168dd8623e80bfd6966a511eade074aa2c2552673f24efbbbf31848d8f6c4e14
// effects.ts: 897933f9729e7ca57d42c1bb6a3326eb22cf90eee1c95e41ac55ca9f39df9898
// particlefactories.ts: 86917a94948adb055755db7f85463da1d280dabfa604fea80b2d21db99217e7d
// particles.ts: 76b509d68ba13dbf8b36d688c1303365110fa4af0e2b876e609a20d90524fe8c
// particleeffects.ts: 6c014f6dc67be1e900b7779d3cbce8841a7584dad34424459aefb3ad8967b607
// Regenerate: node scripts/generate-arcade-particles.mjs
module.exports = function initializePxtParticles(host) {
const {game, control, screen, img, scene, SpriteFlag, pause} = host;
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
Math.randomRange = host.randomRange;
const sprites = {Flag: {Destroyed: 2, RelativeToCamera: 512}, BaseSprite: host.BaseSprite};
const __removeElement = (array, element) => { const index = array ? array.indexOf(element) : -1; if (index >= 0) array.splice(index, 1); return index >= 0; };
function Fx8(v) {
    return ((v * 256) | 0);
}
var Fx;
(function (Fx) {
    Fx.zeroFx8 = 0;
    Fx.oneHalfFx8 = 128;
    Fx.oneFx8 = 256;
    Fx.twoFx8 = 512;
    function neg(a) {
        return (-a);
    }
    Fx.neg = neg;
    function toIntShifted(a, n) {
        return a >> (n + 8);
    }
    Fx.toIntShifted = toIntShifted;
    function add(a, b) {
        return (a + b);
    }
    Fx.add = add;
    function iadd(a, b) {
        return ((a << 8) + b);
    }
    Fx.iadd = iadd;
    function sub(a, b) {
        return (a - b);
    }
    Fx.sub = sub;
    function mul(a, b) {
        return (Math.imul(a, b) >> 8);
    }
    Fx.mul = mul;
    function imul(a, b) {
        return Math.imul(a, b);
    }
    Fx.imul = imul;
    function div(a, b) {
        return Math.idiv(a << 8, b);
    }
    Fx.div = div;
    function idiv(a, b) {
        return Math.idiv(a, b);
    }
    Fx.idiv = idiv;
    function compare(a, b) {
        return a - b;
    }
    Fx.compare = compare;
    function abs(a) {
        if (a < 0)
            return (-a);
        else
            return a;
    }
    Fx.abs = abs;
    function min(a, b) {
        if (a < b)
            return a;
        else
            return b;
    }
    Fx.min = min;
    function max(a, b) {
        if (a > b)
            return a;
        else
            return b;
    }
    Fx.max = max;
    function floor(v) {
        return (v & ~0xff);
    }
    Fx.floor = floor;
    function ceil(v) {
        return v & 0xff ? Fx.floor(Fx.add(v, Fx.oneFx8)) : v;
    }
    Fx.ceil = ceil;
    function leftShift(a, n) {
        return (a << n);
    }
    Fx.leftShift = leftShift;
    function rightShift(a, n) {
        return (a >> n);
    }
    Fx.rightShift = rightShift;
    function toInt(v) {
        return (v + 128) >> 8;
    }
    Fx.toInt = toInt;
    function toFloat(v) {
        return v / 256;
    }
    Fx.toFloat = toFloat;
})(Fx || (Fx = {}));
var PxtMath;
(function (PxtMath) {
    /**
     * Returns a random boolean that is true the given percentage of the time.
     * @param percentage The percentage chance that the returned value will be true from 0 - 100
     */
    //% weight=2
    //% blockId=percentchance block="%percentage|\\% chance"
    //% percentage.min=0 percentage.max=100;
    //% help=math/percent-chance
    function percentChance(percentage) {
        if (percentage >= 100) {
            return true;
        }
        else if (percentage <= 0) {
            return false;
        }
        return Math.randomRange(0, 99) < percentage;
    }
    PxtMath.percentChance = percentChance;
    /**
     * Returns a random element from the given list
     * @param list The list to choose an element from
     */
    //% weight=1
    function pickRandom(list) {
        if (!list || list.length == 0) {
            return undefined;
        }
        return list[Math.randomRange(0, list.length - 1)];
    }
    PxtMath.pickRandom = pickRandom;
    /**
     * Fast, 16 bit, seedable (pseudo) random generator.
     */
    class FastRandom {
        /**
         * Create a new Fast Random generator
         * @param seed [Optional] initial seed between 0x0001 and 0xFFFF.
         */
        constructor(seed) {
            if (seed === undefined)
                seed = Math.randomRange(0x0001, 0xFFFF);
            this.seed = seed;
            this.lfsr = seed;
        }
        /**
         * @returns the next random number between 0x0001 and 0xFFFF inclusive
         */
        next() {
            return this.lfsr = (this.lfsr >> 1) ^ ((-(this.lfsr & 1)) & 0xb400);
        }
        /**
         * @param min the minimum value to generate
         * @param max the maximum value to generate
         * @returns a random value between min and max (inclusive). If min is greater than or equal to max, returns min.
         */
        randomRange(min, max) {
            return min + (max > min ? this.next() % (max - min + 1) : 0);
        }
        /**
         * Returns a random element from the given list
         * @param list The list to choose an element from
         */
        pickRandom(list) {
            if (!list || list.length == 0) {
                return undefined;
            }
            return list[this.randomRange(0, list.length - 1)];
        }
        /**
         * @returns a random boolean value
         */
        randomBool() {
            return !(this.next() & 1);
        }
        /**
         * @param percent the percentage chance that the returned value will be true from 0 - 100
         * @returns a boolean with approximately the given percent chance to be true or false
         */
        percentChance(percent) {
            return this.randomRange(0, 100) < percent;
        }
        /**
         * Reset the state to the current seed
         */
        reset() {
            this.lfsr = this.seed;
        }
    }
    PxtMath.FastRandom = FastRandom;
})(PxtMath || (PxtMath = {}));
Object.assign(Math, PxtMath);
var effects;
(function (effects) {
    //% fixedInstances
    class ImageEffect {
        constructor(defaultRate, effectFactory) {
            this.effect = effectFactory;
            this.fastRandom = new Math.FastRandom();
            this.preferredDelay = defaultRate;
            this.times = undefined;
        }
        /**
         * Apply this effect to the image of the current sprite
         * @param sprite
         */
        applyTo(sprite) {
            if (!sprite || !sprite.image)
                return;
            const clonedImage = sprite.image.clone();
            this.change(clonedImage);
            sprite.setImage(clonedImage);
        }
        /**
         * Change the given image with this effect
         * @param input
         */
        change(input) {
            this.effect(input, this.fastRandom);
        }
        /**
         * Make this effect occur repeatedly on the background image
         * @param times number of times effect should occur
         * @param delay delay between instances of the effect
         */
        startScreenEffect(times, delay) {
            if (!game.currentScene().background.hasBackgroundImage())
                return;
            const wasRunning = this.times != undefined;
            this.times = times ? times : 15;
            if (!wasRunning) {
                control.runInParallel((function* () {
                    while (this.times > 0) {
                        this.change(scene.backgroundImage());
                        (yield* pause(delay ? delay : this.preferredDelay));
                        --this.times;
                    }
                    this.times = undefined;
                }).bind(this));
            }
        }
    }
    effects.ImageEffect = ImageEffect;
    //% fixedInstance whenUsed block="dissolve"
    effects.dissolve = new ImageEffect(100, (input, r) => {
        for (let i = (input.width * input.height) >> 5; i > 0; --i) {
            const x = r.randomRange(0, input.width);
            const y = r.randomRange(0, input.height);
            const w = r.randomRange(1, 3);
            const h = r.randomRange(1, 3);
            input.drawRect(x, y, w, h, 0);
        }
    });
    //% fixedInstance whenUsed block="melt"
    effects.melt = new ImageEffect(125, (input, r) => {
        const rounds = (input.width * input.height) >> 5;
        for (let j = 0; j < rounds; ++j) {
            let x = r.randomRange(0, input.width - 1);
            let y = r.randomRange(0, input.height - 3);
            let c = input.getPixel(x, y);
            input.setPixel(x, y + 1, c);
            input.setPixel(x, y + 2, c);
        }
    });
    //% fixedInstance whenUsed block="slash"
    effects.slash = new ImageEffect(125, (input, r) => {
        const rounds = 12;
        for (let j = 0; j < rounds; ++j) {
            let horizontal = r.randomBool();
            let length = r.randomRange(5, 50);
            let x = r.randomRange(0, input.width - (horizontal ? length : 1));
            let y = r.randomRange(0, input.height - (horizontal ? 3 : length));
            input.drawLine(x, y, horizontal ? x + length : x, horizontal ? y : y + length, 1);
        }
    });
    //% fixedInstance whenUsed block="splatter"
    effects.splatter = new ImageEffect(125, (input, r) => {
        const imgs = [
            img `
            . 1 .
            1 1 1
            . 1 1`,
            img `
            . 1 1 .
            1 1 1 1
            . 1 1 .`,
            img `
            . 1 1 1 .
            1 1 1 1 1
            1 1 1 1 1
            1 1 1 1 1
            . 1 1 1 .`,
            img `
            . . 1 1 . .
            . 1 1 1 1 .
            1 1 1 1 1 1
            1 1 1 1 1 1
            . 1 1 1 1 .
            . . 1 1 . .`,
            img `
            . . 1 1 1. .
            . 1 1 1 1 1 .
            1 1 1 1 1 1 1
            1 1 1 1 1 1 1
            1 1 1 1 1 1 1
            . 1 1 1 1 1 .
            . . 1 1 1. .`,
            img `
            . . 1 1 1 1 . .
            . 1 1 1 1 1 1 .
            1 1 1 1 1 1 1 1
            1 1 1 1 1 1 1 1
            1 1 1 1 1 1 1 1
            1 1 1 1 1 1 1 1
            . 1 1 1 1 1 1 .
            . . 1 1 1 1 . .`,
            img `
            . . . 1 1 1 . . .
            . . 1 1 1 1 1 . .
            . 1 1 1 1 1 1 1 .
            1 1 1 1 1 1 1 1 1
            1 1 1 1 1 1 1 1 1
            1 1 1 1 1 1 1 1 1
            . 1 1 1 1 1 1 1 .
            . . 1 1 1 1 1 . .
            . . . 1 1 1 . . .`,
        ];
        const rounds = 12;
        for (let j = 0; j < rounds; ++j) {
            const im = imgs[r.randomRange(0, imgs.length - 1)];
            const x = r.randomRange(0, input.width - im.width / 2);
            const y = r.randomRange(0, input.height - im.height / 2);
            input.drawTransparentImage(im, x, y);
        }
    });
})(effects || (effects = {}));
var particles;
(function (particles) {
    let cachedSin;
    let cachedCos;
    const NUM_SLICES = 100;
    const galois = new Math.FastRandom();
    let angleSlice = 2 * Math.PI / NUM_SLICES;
    /**
     * Initialize sin and cos values for each slice to minimize recomputation
     */
    function initTrig() {
        if (!cachedSin) {
            cachedSin = cacheSin(NUM_SLICES);
            cachedCos = cacheCos(NUM_SLICES);
        }
    }
    /**
     * @param slices number of cached sin values to make
     * @returns array of cached sin values between 0 and 360 degrees
     */
    function cacheSin(slices) {
        let sin = [];
        let anglePerSlice = 2 * Math.PI / slices;
        for (let i = 0; i < slices; i++) {
            sin.push(Fx8(Math.sin(i * anglePerSlice)));
        }
        return sin;
    }
    particles.cacheSin = cacheSin;
    /**
     * @param slices number of cached cos values to make
     * @returns array of cached cos values between 0 and 360 degrees
     */
    function cacheCos(slices) {
        let cos = [];
        let anglePerSlice = 2 * Math.PI / slices;
        for (let i = 0; i < slices; i++) {
            cos.push(Fx8(Math.cos(i * anglePerSlice)));
        }
        return cos;
    }
    particles.cacheCos = cacheCos;
    const ratio = Math.PI / 180;
    function toRadians(degrees) {
        if (degrees < 0)
            degrees = 360 - (Math.abs(degrees) % 360);
        else
            degrees = degrees % 360;
        return degrees * ratio;
    }
    /**
     * A factory for generating particles
     */
    class ParticleFactory {
        constructor() {
            // Compiler errors if this doesn't exist
        }
        /**
         * Generate a particle at the position of the given anchor
         * @param anchor
         */
        createParticle(anchor) {
            const p = new particles.Particle();
            p._x = Fx8(anchor.x);
            p._y = Fx8(anchor.y);
            p.vx = Fx.zeroFx8;
            p.vy = Fx.zeroFx8;
            p.lifespan = 500;
            return p;
        }
        /**
         * Draw the given particle at the given location
         * @param particle
         * @param x
         * @param y
         */
        drawParticle(particle, x, y) {
            screen.setPixel(Fx.toInt(x), Fx.toInt(y), 1);
        }
    }
    particles.ParticleFactory = ParticleFactory;
    /**
     * A factory for creating a spray of particles
     */
    class SprayFactory extends ParticleFactory {
        constructor(speed, centerDegrees, arcDegrees) {
            super();
            initTrig();
            this.setSpeed(speed);
            this.setDirection(centerDegrees, arcDegrees);
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            const angle = (this.minAngle + galois.randomRange(0, this.spread)) % NUM_SLICES;
            p.vx = Fx.mul(cachedSin[angle], this.speed);
            p.vy = Fx.mul(cachedCos[angle], this.speed);
            return p;
        }
        drawParticle(particle, x, y) {
            screen.setPixel(Fx.toInt(x), Fx.toInt(y), 1);
        }
        setSpeed(pixelsPerSecond) {
            this.speed = Fx8(pixelsPerSecond);
        }
        setDirection(centerDegrees, arcDegrees) {
            this.minAngle = (toRadians(centerDegrees - (arcDegrees >> 1)) / angleSlice) | 0;
            this.spread = (toRadians(arcDegrees) / angleSlice) | 0;
        }
    }
    particles.SprayFactory = SprayFactory;
    /**
     * A factory for creating particles within rectangular area
     */
    class AreaFactory extends SprayFactory {
        constructor(xRange, yRange, minLifespan, maxLifespan) {
            super(40, 0, 90);
            this.xRange = xRange;
            this.yRange = yRange;
            this.minLifespan = minLifespan ? minLifespan : 150;
            this.maxLifespan = maxLifespan ? maxLifespan : 850;
            this.galois = new Math.FastRandom();
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            p.lifespan = this.galois.randomRange(this.minLifespan, this.maxLifespan);
            p._x = Fx.iadd(this.galois.randomRange(0, this.xRange) - (this.xRange >> 1), p._x);
            p._y = Fx.iadd(this.galois.randomRange(0, this.yRange) - (anchor.height ? anchor.height >> 1 : 0), p._y);
            return p;
        }
        drawParticle(p, x, y) {
            const col = p.lifespan > 500 ?
                4 : p.lifespan > 250 ?
                5 : 1;
            screen.setPixel(Fx.toInt(x), Fx.toInt(y), col);
        }
    }
    particles.AreaFactory = AreaFactory;
    /**
     * A factory for creating a trail that is emitted by sprites.
     */
    class TrailFactory extends ParticleFactory {
        constructor(sprite, minLifespan, maxLifespan) {
            super();
            this.xRange = sprite.width ? sprite.width >> 1 : 8;
            this.yRange = sprite.height ? sprite.height >> 1 : 8;
            this.minLifespan = minLifespan;
            this.maxLifespan = maxLifespan;
            this.galois = new Math.FastRandom();
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            p.lifespan = this.galois.randomRange(this.minLifespan, this.maxLifespan);
            p._x = Fx.iadd(this.galois.randomRange(0, this.xRange) - (this.xRange >> 1), p._x);
            p._y = Fx.iadd(this.galois.randomRange(0, this.yRange) - (this.yRange >> 1), p._y);
            p.color = this.galois.randomRange(0x1, 0xF);
            return p;
        }
        drawParticle(p, x, y) {
            screen.setPixel(Fx.toInt(x), Fx.toInt(y), p.color);
        }
    }
    particles.TrailFactory = TrailFactory;
    /**
     * A factory for creating particles with the provided shapes fall down the screen.
     *
     * Any pixels assigned to 0xF (black) in the provided shape will be replaced with a
     * random color for each particle.
     */
    class ShapeFactory extends AreaFactory {
        constructor(xRange, yRange, source) {
            super(xRange, yRange);
            this.sources = [source];
            // Base offsets off of initial shape
            this.ox = Fx8(source.width >> 1);
            this.oy = Fx8(source.height >> 1);
        }
        /**
         * Add another possible shape for a particle to display as
         * @param shape
         */
        addShape(shape) {
            if (shape)
                this.sources.push(shape);
        }
        drawParticle(p, x, y) {
            const pImage = this.galois.pickRandom(this.sources).clone();
            pImage.replace(0xF, p.color);
            screen.drawTransparentImage(pImage, Fx.toInt(Fx.sub(x, this.ox)), Fx.toInt(Fx.sub(y, this.oy)));
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            p.color = this.galois.randomRange(1, 14);
            return p;
        }
    }
    particles.ShapeFactory = ShapeFactory;
    class ConfettiFactory extends ShapeFactory {
        constructor(xRange, yRange) {
            const confetti = [
                img `
                    F
                `,
                img `
                    F
                    F
                `,
                img `
                    F F
                `,
                img `
                    F F
                    F .
                `,
                img `
                    F F
                    . F
            `
            ];
            super(xRange, yRange, confetti[0]);
            for (let i = 1; i < confetti.length; i++) {
                this.addShape(confetti[i]);
            }
            this.minLifespan = 1000;
            this.maxLifespan = 4500;
        }
    }
    particles.ConfettiFactory = ConfettiFactory;
    class FireFactory extends ParticleFactory {
        constructor(radius) {
            super();
            initTrig();
            this.galois = new Math.FastRandom();
            this.minRadius = radius >> 1;
            this.maxRadius = radius;
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            p.color = this.galois.randomBool() ?
                2 : this.galois.randomBool() ?
                4 : 5;
            const i = this.galois.randomRange(0, cachedCos.length);
            const r = this.galois.randomRange(this.minRadius, this.maxRadius);
            p._x = Fx.iadd(anchor.x, Fx.mul(Fx8(r), cachedCos[i]));
            p._y = Fx.iadd(anchor.y, Fx.mul(Fx8(r), cachedSin[i]));
            p.vy = Fx8(Math.randomRange(0, 10));
            p.vx = Fx8(Math.randomRange(-5, 5));
            p.lifespan = 1500;
            return p;
        }
        drawParticle(p, x, y) {
            screen.setPixel(Fx.toInt(x), Fx.toInt(y), p.color);
        }
    }
    particles.FireFactory = FireFactory;
    class RadialFactory extends ParticleFactory {
        constructor(radius, speed, spread, colors) {
            super();
            initTrig();
            if (colors && colors.length != 0)
                this.colors = colors;
            else
                this.colors = [0x2, 0x3, 0x4, 0x5];
            this.setRadius(radius);
            this.speed = Fx8(-speed);
            this.spread = spread;
            this.t = 0;
            this.galois = new Math.FastRandom();
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            const time = ++this.t % cachedCos.length;
            const offsetTime = (time + this.galois.randomRange(0, this.spread)) % cachedCos.length;
            p._x = Fx.iadd(anchor.x, Fx.mul(this.r, cachedCos[time]));
            p._y = Fx.iadd(anchor.y, Fx.mul(this.r, cachedSin[time]));
            p.vx = Fx.mul(this.speed, Fx.neg(cachedSin[offsetTime]));
            p.vy = Fx.mul(this.speed, cachedCos[offsetTime]);
            p.lifespan = this.galois.randomRange(200, 1500);
            p.color = this.galois.pickRandom(this.colors);
            return p;
        }
        drawParticle(p, x, y) {
            screen.setPixel(Fx.toInt(x), Fx.toInt(y), p.color);
        }
        setRadius(r) {
            this.r = Fx8(r >> 1);
        }
        setSpeed(s) {
            this.speed = Fx8(-s);
        }
        setSpread(s) {
            this.spread = s;
        }
    }
    particles.RadialFactory = RadialFactory;
    class ColorCount {
        constructor(color, count) {
            this.color = color;
            this.count = count;
        }
    }
    class AshFactory extends AreaFactory {
        constructor(anchor, updateImage, percentKept = 20) {
            super(anchor.width ? anchor.width : 8, anchor.height ? anchor.height >> 1 : 8, 300, 700);
            if (!anchor.image) {
                this.colors = [new ColorCount(1, 20)];
                return;
            }
            let counts = [];
            for (let i = 0x0; i <= 0xF; i++) {
                counts[i] = 0;
            }
            let result = anchor.image.clone();
            for (let x = 0; x < result.width; x++) {
                for (let y = 0; y < result.height; y++) {
                    const c = result.getPixel(x, y);
                    if (c && this.galois.percentChance(percentKept)) {
                        counts[c]++;
                        result.setPixel(x, y, 0x0);
                    }
                }
            }
            /** TODO: The following should be:
             * if (updateImage && anchor.setImage) {
             *     anchor.setImage(result);
             * }
             * but this fails due to https://github.com/Microsoft/pxt-arcade/issues/515 .
             * This is a temporary workaround.
             */
            if (updateImage) {
                anchor.setImage(result);
            }
            this.colors = counts
                .map((value, index) => new ColorCount(index, value))
                .filter(v => v.count != 0);
        }
        createParticle(anchor) {
            if (this.colors.length === 0)
                return undefined;
            const index = this.galois.randomRange(0, this.colors.length - 1);
            const choice = this.colors[index];
            const p = super.createParticle(anchor);
            choice.count--;
            if (choice.count === 0)
                this.colors.removeAt(index);
            p.color = choice.color;
            p._y = Fx.iadd(this.galois.randomRange(this.yRange >> 1, this.yRange), p._y);
            p.vx = anchor.vx ? Fx.neg(Fx8(anchor.vx >> 2)) : Fx.zeroFx8;
            p.vy = Fx8(this.galois.randomRange(-150, -50));
            return p;
        }
        drawParticle(p, x, y) {
            screen.setPixel(Fx.toInt(x), Fx.toInt(y), p.color);
        }
    }
    particles.AshFactory = AshFactory;
    class BubbleFactory extends ParticleFactory {
        constructor(sprite, minLifespan, maxLifespan) {
            super();
            initTrig();
            this.galois = new Math.FastRandom();
            this.xRange = sprite.width ? sprite.width : 16;
            this.yRange = 8;
            this.minLifespan = minLifespan;
            this.maxLifespan = maxLifespan;
            this.states = [
                img `
                    F
                `, img `
                    F F
                `, img `
                    F F
                    F F
                `, img `
                    F F F
                    F . F
                    F F F
                `, img `
                    . F F .
                    F . . F
                    F . . F
                    . F F .
                `, img `
                    . F F F .
                    F . . . F
                    F . . . F
                    . F F F .
                `
            ];
        }
        get stateCount() {
            return this.states.length;
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            p.lifespan = this.galois.randomRange(this.minLifespan, this.maxLifespan);
            p._x = Fx.iadd(this.galois.randomRange(0, this.xRange) - (this.xRange >> 1), p._x);
            p._y = Fx.iadd(this.galois.randomRange(-this.yRange, 0) + (anchor.height ? anchor.height >> 1 : 0), p._y);
            p.vy = Fx8(Math.randomRange(-30, -5));
            p.vx = Fx8(Math.randomRange(-10, 10));
            p.data = this.galois.percentChance(80) ? 0 : 2;
            p.color = this.galois.percentChance(90) ?
                0x9 : (this.galois.percentChance(50) ?
                0x6 : 0x8);
            return p;
        }
        drawParticle(p, x, y) {
            const toDraw = this.states[p.data].clone();
            toDraw.replace(0xF, p.color);
            screen.drawTransparentImage(toDraw, Fx.toInt(x), Fx.toInt(y));
        }
    }
    particles.BubbleFactory = BubbleFactory;
    class StarFactory extends ParticleFactory {
        constructor(possibleColors, minRate = 15, maxRate = 25) {
            super();
            this.galois = new Math.FastRandom();
            this.minRate = minRate;
            this.maxRate = maxRate;
            this.images = [
                img `
                    1
                `,
                img `
                    1 . 1
                    . 1 .
                    1 . 1
                `, img `
                    . 1 .
                    1 1 1
                    . 1 .
                `
            ];
            if (possibleColors && possibleColors.length)
                this.possibleColors = possibleColors;
            else
                this.possibleColors = [1];
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            const xRange = anchor.width ? anchor.width >> 1 : 8;
            p._x = Fx8(this.galois.randomRange(anchor.x - xRange, anchor.x + xRange));
            p._y = Fx8(anchor.height ? anchor.y - (anchor.height >> 1) : anchor.y);
            p.vy = Fx8(this.galois.randomRange(this.minRate, this.maxRate));
            // set lifespan based off velocity and screen height (plus a little to make sure it doesn't disappear early)
            p.lifespan = Fx.toInt(Fx.mul(Fx.div(Fx8(screen.height + 20), p.vy), Fx8(1000)));
            const length = this.possibleColors.length - 1;
            p.color = this.possibleColors[this.possibleColors.length - 1];
            for (let i = 0; i < length; ++i) {
                if (this.galois.percentChance(80 - (i * 10))) {
                    p.color = this.possibleColors[i];
                    break;
                }
            }
            // images besides the first one are only used on occasion
            p.data = this.galois.percentChance(15) ? this.galois.randomRange(1, this.images.length - 1) : 0;
            return p;
        }
        drawParticle(p, x, y) {
            // on occasion, twinkle from white to yellow
            const twinkleFlag = 0x8000;
            const rest = 0x7FFF;
            if (twinkleFlag && p.data) {
                if (this.galois.percentChance(10)) {
                    p.color = 1;
                    p.data &= rest;
                }
            }
            else if (p.color === 1 && this.galois.percentChance(1)) {
                p.color = 5;
                p.data |= twinkleFlag;
            }
            const selected = this.images[rest & p.data].clone();
            selected.replace(0x1, p.color);
            screen.drawTransparentImage(selected, Fx.toInt(x), Fx.toInt(y));
        }
    }
    particles.StarFactory = StarFactory;
    class CloudFactory extends ParticleFactory {
        constructor(minRate = 8, maxRate = 12) {
            super();
            this.minRate = minRate;
            this.maxRate = maxRate;
            this.camera = game.currentScene().camera;
            this.clouds = [
                img `
                    . . . . . . . . . . f f f . . .
                    . . . . . . . . . f f 9 f f . .
                    . f f f . f f f . f 9 9 9 f f .
                    f f 1 f f f 1 f f f 1 1 1 9 f f
                    f 1 9 1 9 9 1 9 9 1 1 1 1 9 9 f
                    f 9 1 9 9 1 9 1 1 9 1 1 1 1 1 f
                    f f 1 1 1 1 1 1 1 1 1 1 1 1 1 f
                    . f 1 1 1 1 9 9 1 f f f 1 1 1 f
                    . f 1 f f f 9 f f f . f f 1 f f
                    . f f f . f f f . . . . f f f .
                `, img `
                    . . . . . f f f f f . .
                    . . f f . f 1 1 1 f f .
                    f f f 1 f f 9 9 1 1 f .
                    f 9 9 1 1 1 1 1 9 9 f f
                    . f 1 9 9 1 9 1 1 1 1 f
                    f 1 f f f 1 1 1 1 9 9 f
                    f f f . f f f f 9 f f f
                    . . . . . . . f f f . .
                `, img `
                    . . . . . . . . f f f . .
                    . . . . . . . f f 1 f . .
                    . f f f . . . f 1 9 f f .
                    f f 1 f f . f f 1 1 1 f f
                    f 1 9 1 f f f 1 9 1 1 1 f
                    f f 1 9 1 1 1 9 1 1 1 1 f
                    . f f 9 1 1 9 9 1 1 1 f f
                    . . f 1 1 9 9 1 1 1 f f .
                    . . f f 1 1 1 1 1 f f . .
                    . . . f f 1 f f f f . . .
                    . . . . f f f . . . . . .
                `, img `
                    . f f f .
                    f 1 9 1 f
                    f 9 1 1 f
                    f f 1 f f
                    . f f f .
                `, img `
                    . . . . . f f f f f f .
                    . . . f f f 1 1 1 1 f f
                    . f f f 1 9 1 1 9 1 1 f
                    f f 1 1 9 1 1 1 9 1 1 f
                    f 1 1 9 1 1 1 9 1 1 1 f
                    f f 1 9 1 1 1 1 1 1 1 f
                    . f f 1 1 1 1 1 1 1 f f
                    . . f f f f f f f f f .
                `, img `
                    . f f f . .
                    f f 1 f . .
                    f 1 1 f f f
                    f 1 9 9 1 f
                    f 9 1 1 1 f
                    f f 1 1 1 f
                    . f 1 1 1 f
                    . f f f f f
                `, img `
                    . . . . . . . . . . . . f f f
                    . . . . . . . . . . f f f 1 f
                    f f f f f . f f f . f 1 1 1 f
                    f 1 1 1 f f f 1 f . f 1 1 1 f
                    f f 1 1 1 f 1 1 f f f 1 1 1 f
                    . f f 1 9 1 1 9 1 1 1 1 1 1 f
                    . . f 9 1 1 1 9 1 1 1 1 1 f f
                    . . f 1 1 1 9 9 1 1 1 1 1 f .
                    . . f 1 1 9 9 1 1 1 1 1 f f .
                    . . f f f 1 1 1 1 f f f f . .
                    . . . . f f 1 f f f . . . . .
                    . . . . . f f f . . . . . . .
                `
            ];
        }
        createParticle(anchor) {
            const p = super.createParticle(anchor);
            const yRange = anchor.height ? anchor.height >> 1 : 8;
            p.data = Math.randomRange(0, this.clouds.length - 1);
            p._x = Fx8(anchor.width ? anchor.x + (anchor.width >> 1) : anchor.x);
            p._y = Fx.add(Fx8(Math.randomRange(anchor.y - yRange, anchor.y + yRange)), Fx8(this.clouds[p.data].width >> 1));
            p.vx = Fx8(-Math.randomRange(this.minRate, this.maxRate));
            // p.color stores information on conjoined clouds
            p.color = 0;
            if (Math.percentChance(30)) {
                const isConjoined = 1 << 0;
                const isOffsetX = Math.randomRange(0, 1) << 1;
                const isOffsetY = Math.randomRange(0, 1) << 2;
                const selection = Math.randomRange(0, this.clouds.length - 1) << 3;
                p.color = isConjoined | isOffsetX | isOffsetY | selection;
            }
            p.lifespan = Fx.toInt(Fx.mul(Fx.div(Fx8(screen.width + 30), Fx.abs(p.vx)), Fx8(1000)));
            return p;
        }
        drawParticle(p, x, y) {
            const mainImage = this.clouds[p.data];
            screen.drawTransparentImage(mainImage, Fx.toInt(x), Fx.toInt(y));
            if (p.color & 1) {
                const isOffsetX = (p.color >> 1) & 1;
                const isOffsetY = (p.color >> 2) & 1;
                const selection = this.clouds[p.color >> 3];
                const xOffset = isOffsetX ? Fx8(mainImage.width >> 2) : Fx.zeroFx8;
                const yOffset = isOffsetY ? Fx8(mainImage.height >> 2) : Fx.zeroFx8;
                screen.drawTransparentImage(selection, Fx.toInt(Fx.add(x, xOffset)), Fx.toInt(Fx.add(y, yOffset)));
            }
        }
    }
    particles.CloudFactory = CloudFactory;
})(particles || (particles = {}));
(function (particles) {
    let Flag;
    (function (Flag) {
        Flag[Flag["enabled"] = 1] = "enabled";
        Flag[Flag["destroyed"] = 2] = "destroyed";
        Flag[Flag["relativeToCamera"] = 4] = "relativeToCamera";
    })(Flag || (Flag = {}));
    // maximum count of sources before removing previous sources
    //% whenUsed
    const MAX_SOURCES = (() => {
        const sz = control.ramSize();
        if (sz <= 1024 * 100) {
            return 8;
        }
        else if (sz <= 1024 * 200) {
            return 16;
        }
        else {
            return 50;
        }
    })();
    const TIME_PRECISION = 10; // time goes down to down to the 1<<10 seconds
    let lastUpdate;
    /**
     * A single particle
     */
    //% maxBgInstances=200
    class Particle {
    }
    particles.Particle = Particle;
    /**
     * A source of particles
     */
    class ParticleSource extends sprites.BaseSprite {
        /**
         * @param anchor to emit particles from
         * @param particlesPerSecond rate at which particles are emitted
         * @param factory [optional] factory to generate particles with; otherwise,
         */
        constructor(anchor, particlesPerSecond, factory) {
            super(scene.SPRITE_Z);
            init();
            const sources = particleSources();
            // remove and immediately destroy oldest source if over MAX_SOURCES
            if (sources.length >= MAX_SOURCES) {
                sortSources(sources);
                const removedSource = sources.shift();
                removedSource.clear();
                removedSource.destroy();
            }
            this.pFlags = 0;
            this.setRate(particlesPerSecond);
            this.setAcceleration(0, 0);
            this.setAnchor(anchor);
            this.lifespan = undefined;
            this._dt = 0;
            this.priority = 0;
            this.setFactory(factory || particles.defaultFactory);
            sources.push(this);
            this.enabled = true;
        }
        __draw(camera) {
            let current = this.head;
            const left = (this.pFlags & Flag.relativeToCamera) ? Fx.zeroFx8 : Fx8(camera.drawOffsetX);
            const top = (this.pFlags & Flag.relativeToCamera) ? Fx.zeroFx8 : Fx8(camera.drawOffsetY);
            while (current) {
                if (current.lifespan > 0)
                    this.drawParticle(current, left, top);
                current = current.next;
            }
        }
        _update(dt) {
            this.timer -= dt;
            if (this.lifespan !== undefined) {
                this.lifespan -= dt;
                if (this.lifespan <= 0) {
                    this.lifespan = undefined;
                    this.destroy();
                }
            }
            else if (this.anchor && this.anchor.flags !== undefined && (this.anchor.flags & sprites.Flag.Destroyed)) {
                this.lifespan = 750;
            }
            while (this.timer < 0 && this.enabled) {
                this.timer += this.period;
                const p = this._factory.createParticle(this.anchor);
                if (!p)
                    continue; // some factories can decide to not produce a particle
                p.next = this.head;
                this.head = p;
            }
            if (!this.head)
                return;
            let current = this.head;
            this._dt += dt;
            let fixedDt = Fx8(this._dt);
            if (fixedDt) {
                do {
                    if (current.lifespan > 0) {
                        current.lifespan -= dt;
                        this.updateParticle(current, fixedDt);
                    }
                } while (current = current.next);
                this._dt = 0;
            }
            else {
                do {
                    current.lifespan -= dt;
                } while (current = current.next);
            }
        }
        _prune() {
            while (this.head && this.head.lifespan <= 0) {
                this.head = this.head.next;
            }
            if ((this.pFlags & Flag.destroyed) && !this.head) {
                const scene = game.currentScene();
                if (scene)
                    __removeElement(scene.allSprites, this);
                const sources = particleSources();
                if (sources && sources.length)
                    __removeElement(sources, this);
                this.anchor == undefined;
            }
            let current = this.head;
            while (current && current.next) {
                if (current.next.lifespan <= 0) {
                    current.next = current.next.next;
                }
                else {
                    current = current.next;
                }
            }
        }
        /**
         * Sets the acceleration applied to the particles
         */
        setAcceleration(ax, ay) {
            this.ax = Fx8(ax);
            this.ay = Fx8(ay);
        }
        /**
         * Enables or disables particles
         * @param on
         */
        setEnabled(on) {
            this.enabled = on;
        }
        /**
         * Sets whether the particle source is drawn relative to the camera or not
         * @param on
         */
        setRelativeToCamera(on) {
            if (on)
                this.pFlags |= Flag.relativeToCamera;
            else
                this.pFlags = ~(~this.pFlags | Flag.relativeToCamera);
        }
        get enabled() {
            return !!(this.pFlags & Flag.enabled);
        }
        /**
         * Set whether this source is currently enabled (emitting particles) or not
         */
        set enabled(v) {
            if (v !== this.enabled) {
                this.pFlags = v ? (this.pFlags | Flag.enabled) : (this.pFlags ^ Flag.enabled);
                this.timer = 0;
            }
        }
        /**
         * Destroy the source
         */
        destroy() {
            // The `_prune` step will finishing destroying this Source once all emitted particles finish rendering
            this.enabled = false;
            this.pFlags |= Flag.destroyed;
            this._prune();
        }
        /**
         * Clear all particles emitted from this source
         */
        clear() {
            this.head = undefined;
        }
        /**
         * Set a anchor for particles to be emitted from
         * @param anchor
         */
        setAnchor(anchor) {
            this.anchor = anchor;
        }
        /**
         * Sets the number of particle created per second
         * @param particlesPerSecond
         */
        setRate(particlesPerSecond) {
            this.period = Math.ceil(1000 / particlesPerSecond);
            this.timer = 0;
        }
        get factory() {
            return this._factory;
        }
        /**
         * Sets the particle factory
         * @param factory
         */
        setFactory(factory) {
            if (factory)
                this._factory = factory;
        }
        updateParticle(p, fixedDt) {
            fixedDt = Fx.rightShift(fixedDt, TIME_PRECISION);
            p.vx = Fx.add(p.vx, Fx.mul(this.ax, fixedDt));
            p.vy = Fx.add(p.vy, Fx.mul(this.ay, fixedDt));
            p._x = Fx.add(p._x, Fx.mul(p.vx, fixedDt));
            p._y = Fx.add(p._y, Fx.mul(p.vy, fixedDt));
        }
        drawParticle(p, screenLeft, screenTop) {
            this._factory.drawParticle(p, Fx.sub(p._x, screenLeft), Fx.sub(p._y, screenTop));
        }
    }
    particles.ParticleSource = ParticleSource;
    //% whenUsed
    particles.defaultFactory = new particles.SprayFactory(20, 0, 60);
    /**
     * Creates a new source of particles attached to a sprite
     * @param sprite
     * @param particlesPerSecond number of particles created per second
     */
    function createParticleSource(sprite, particlesPerSecond) {
        return new ParticleSource(sprite, particlesPerSecond);
    }
    particles.createParticleSource = createParticleSource;
    function init() {
        const scene = game.currentScene();
        if (scene.particleSources)
            return;
        scene.particleSources = [];
        lastUpdate = control.millis();
        game.onUpdate(updateParticles);
        game.onUpdateInterval(250, pruneParticles);
    }
    function updateParticles() {
        const sources = particleSources();
        if (!sources)
            return;
        sortSources(sources);
        const time = control.millis();
        const dt = time - lastUpdate;
        lastUpdate = time;
        for (let i = 0; i < sources.length; i++) {
            sources[i]._update(dt);
        }
    }
    function pruneParticles() {
        const sources = particleSources();
        if (sources)
            sources.slice(0, sources.length).forEach(s => s._prune());
    }
    function sortSources(sources) {
        sources.sort((a, b) => (a.priority - b.priority || a.id - b.id));
    }
    /**
     * A source of particles where particles will occasionally change speed based off of each other
     */
    class FireSource extends ParticleSource {
        constructor(anchor, particlesPerSecond, factory) {
            super(anchor, particlesPerSecond, factory);
            this.galois = new Math.FastRandom();
            this.z = 20;
        }
        updateParticle(p, fixedDt) {
            super.updateParticle(p, fixedDt);
            if (p.next && this.galois.percentChance(30)) {
                p.vx = p.next.vx;
                p.vy = p.next.vy;
            }
        }
    }
    particles.FireSource = FireSource;
    /**
     * A source of particles where the particles oscillate horizontally, and occasionally change
     * between a given number of defined states
     */
    class BubbleSource extends ParticleSource {
        constructor(anchor, particlesPerSecond, maxState, factory) {
            super(anchor, particlesPerSecond, factory);
            this.galois = new Math.FastRandom();
            this.maxState = maxState;
            this.stateChangePercentage = 3;
            this.oscillationPercentage = 4;
        }
        updateParticle(p, fixedDt) {
            super.updateParticle(p, fixedDt);
            if (this.galois.percentChance(this.stateChangePercentage)) {
                if (p.data < this.maxState) {
                    p.data++;
                }
                else if (p.data > 0) {
                    p.data--;
                }
            }
            if (this.galois.percentChance(this.oscillationPercentage)) {
                p.vx = Fx.neg(p.vx);
            }
        }
    }
    particles.BubbleSource = BubbleSource;
    function clearAll() {
        const sources = particleSources();
        if (sources) {
            sources.forEach(s => s.clear());
            pruneParticles();
        }
    }
    particles.clearAll = clearAll;
    /**
     * Stop all particle sources from creating any new particles
     */
    function disableAll() {
        const sources = particleSources();
        if (sources) {
            sources.forEach(s => s.enabled = false);
            pruneParticles();
        }
    }
    particles.disableAll = disableAll;
    /**
     * Allow all particle sources to create any new particles
     */
    function enableAll() {
        const sources = particleSources();
        if (sources) {
            sources.forEach(s => s.enabled = true);
            pruneParticles();
        }
    }
    particles.enableAll = enableAll;
    function particleSources() {
        const sources = game.currentScene().particleSources;
        return sources;
    }
})(particles || (particles = {}));
(function (effects) {
    //% fixedInstances
    class ParticleEffect {
        constructor(defaultParticlesPerSecond, defaultLifespan, sourceFactory) {
            this.sourceFactory = sourceFactory;
            this.defaultRate = defaultParticlesPerSecond;
            this.defaultLifespan = defaultLifespan;
        }
        /**
         * Attaches a new particle animation to the sprite or anchor for a short period of time
         * @param anchor
         * @param duration
         * @param particlesPerSecond
         */
        start(anchor, duration, particlesPerSecond, relativeToCamera) {
            if (!this.sourceFactory)
                return;
            const src = this.sourceFactory(anchor, particlesPerSecond ? particlesPerSecond : this.defaultRate);
            src.setRelativeToCamera(!!relativeToCamera);
            if (duration)
                src.lifespan = duration > 0 ? duration : this.defaultLifespan;
        }
        /**
         * Destroy the provided sprite with an effect
         * @param sprite
         * @param duration how long the sprite will remain on the screen. If set to 0 or undefined,
         *                  uses the default rate for this effect.
         * @param particlesPerSecond
         */
        destroy(anchor, duration, particlesPerSecond) {
            anchor.setFlag(SpriteFlag.Ghost, true);
            this.start(anchor, particlesPerSecond, null, !!(anchor.flags & sprites.Flag.RelativeToCamera));
            anchor.lifespan = duration ? duration : this.defaultLifespan >> 2;
            effects.dissolve.applyTo(anchor);
        }
    }
    effects.ParticleEffect = ParticleEffect;
    /**
     * Anchor used for effects that occur across the screen.
     */
    class SceneAnchor {
        constructor() {
            this.camera = game.currentScene().camera;
        }
        get x() {
            return this.camera.offsetX + (screen.width >> 1);
        }
        get y() {
            return this.camera.offsetY + (screen.height >> 1);
        }
        get width() {
            return screen.width;
        }
        get height() {
            return screen.height;
        }
    }
    //% fixedInstances
    class ScreenEffect extends ParticleEffect {
        constructor(anchorDefault, sceneDefault, defaultLifespan, sourceFactory) {
            super(anchorDefault, defaultLifespan, sourceFactory);
            this.sceneDefaultRate = sceneDefault;
        }
        /**
         * Creates a new effect that occurs over the entire screen
         * @param particlesPerSecond
         * @param duration
         */
        //% blockId=particlesStartScreenAnimation block="start screen %effect effect || for %duration ms"
        //% duration.shadow=timePicker
        //% blockNamespace=scene
        //% group="Effects" blockGap=8
        //% weight=90 help=effects/start-screen-effect
        startScreenEffect(duration, particlesPerSecond) {
            if (!this.sourceFactory)
                return;
            if (this.source && this.source.enabled) {
                if (duration)
                    this.source.lifespan = duration;
                return;
            }
            this.endScreenEffect();
            this.source = this.sourceFactory(new SceneAnchor(), particlesPerSecond ? particlesPerSecond : this.sceneDefaultRate);
            this.source.priority = 10;
            if (duration)
                this.source.lifespan = duration;
        }
        /**
         * If this effect is currently occurring as a full screen effect, stop producing particles and end the effect
         * @param particlesPerSecond
         */
        //% blockId=particlesEndScreenAnimation block="end screen %effect effect"
        //% blockNamespace=scene
        //% group="Effects" blockGap=8
        //% weight=80 help=effects/end-screen-effect
        endScreenEffect() {
            if (this.source) {
                this.source.destroy();
                this.source = undefined;
            }
        }
    }
    effects.ScreenEffect = ScreenEffect;
    /**
     * Removes all effects attached to the given anchor
     * @param anchor the anchor to remove effects from
     */
    //% blockId=particlesclearparticles block="clear effects on %anchor=variables_get(mySprite)"
    //% blockNamespace=sprites
    //% anchor.defl=mySprite
    //% group="Effects" weight=89
    //% help=effects/clear-particles
    function clearParticles(anchor) {
        const sources = game.currentScene().particleSources;
        if (!sources)
            return;
        sources
            .filter(ps => ps.anchor === anchor)
            .forEach(ps => ps.destroy());
    }
    effects.clearParticles = clearParticles;
    function createEffect(defaultParticlesPerSecond, defaultLifespan, factoryFactory) {
        return new ParticleEffect(defaultParticlesPerSecond, defaultLifespan, (anchor, pps) => new particles.ParticleSource(anchor, pps, factoryFactory()));
    }
    //% fixedInstance whenUsed block="spray"
    effects.spray = createEffect(20, 2000, function () { return new particles.SprayFactory(100, 0, 120); });
    //% fixedInstance whenUsed block="trail"
    effects.trail = new ParticleEffect(20, 4000, function (anchor, particlesPerSecond) {
        const factory = new particles.TrailFactory(anchor, 250, 1000);
        return new particles.ParticleSource(anchor, particlesPerSecond, factory);
    });
    //% fixedInstance whenUsed block="fountain"
    effects.fountain = new ParticleEffect(20, 3000, function (anchor, particlesPerSecond) {
        class FountainFactory extends particles.SprayFactory {
            constructor() {
                super(40, 180, 90);
                this.galois = new Math.FastRandom(1234);
            }
            createParticle(anchor) {
                const p = super.createParticle(anchor);
                p.color = this.galois.randomBool() ? 8 : 9;
                p.lifespan = 1500;
                return p;
            }
            drawParticle(p, x, y) {
                screen.setPixel(Fx.toInt(x), Fx.toInt(y), p.color);
            }
        }
        const factory = new FountainFactory();
        const source = new particles.ParticleSource(anchor, particlesPerSecond, factory);
        source.setAcceleration(0, 40);
        return source;
    });
    //% fixedInstance whenUsed block="confetti"
    effects.confetti = new ScreenEffect(10, 40, 4000, function (anchor, particlesPerSecond) {
        const factory = new particles.ConfettiFactory(anchor.width ? anchor.width : 16, 16);
        factory.setSpeed(30);
        return new particles.ParticleSource(anchor, particlesPerSecond, factory);
    });
    //% fixedInstance whenUsed block="hearts"
    effects.hearts = new ScreenEffect(5, 20, 2000, function (anchor, particlesPerSecond) {
        const factory = new particles.ShapeFactory(anchor.width ? anchor.width : 16, 16, img `
            . F . F .
            F . F . F
            F . . . F
            . F . F .
            . . F . .
        `);
        // if large anchor, increase lifespan
        if (factory.xRange > 50) {
            factory.minLifespan = 1000;
            factory.maxLifespan = 2000;
        }
        factory.setSpeed(90);
        return new particles.ParticleSource(anchor, particlesPerSecond, factory);
    });
    //% fixedInstance whenUsed block="smiles"
    effects.smiles = new ScreenEffect(5, 25, 1500, function (anchor, particlesPerSecond) {
        const factory = new particles.ShapeFactory(anchor.width ? anchor.width : 16, 16, img `
            . f . f .
            . f . f .
            . . . . .
            f . . . f
            . f f f .
        `);
        // if large anchor, increase lifespan
        if (factory.xRange > 50) {
            factory.minLifespan = 1250;
            factory.maxLifespan = 2500;
        }
        factory.setSpeed(50);
        return new particles.ParticleSource(anchor, particlesPerSecond, factory);
    });
    //% fixedInstance whenUsed block="rings"
    effects.rings = createEffect(5, 1000, function () {
        return new particles.ShapeFactory(16, 16, img `
            . F F F .
            F . . . F
            F . . . F
            f . . . f
            . f f f .
        `);
    });
    //% fixedInstance whenUsed block="fire"
    effects.fire = new ParticleEffect(50, 5000, function (anchor, particlesPerSecond) {
        const factory = new particles.FireFactory(5);
        const src = new particles.FireSource(anchor, particlesPerSecond, factory);
        src.setAcceleration(0, -20);
        return src;
    });
    //% fixedInstance whenUsed block="warm radial"
    effects.warmRadial = createEffect(30, 2500, function () { return new particles.RadialFactory(0, 30, 10); });
    //% fixedInstance whenUsed block="cool radial"
    effects.coolRadial = createEffect(30, 2000, function () { return new particles.RadialFactory(0, 30, 10, [0x6, 0x7, 0x8, 0x9, 0xA]); });
    //% fixedInstance whenUsed block="halo"
    effects.halo = createEffect(70, 3000, function () {
        class RingFactory extends particles.RadialFactory {
            createParticle(anchor) {
                const p = super.createParticle(anchor);
                p.lifespan = this.galois.randomRange(200, 350);
                return p;
            }
        }
        return new RingFactory(30, 40, 10, [0x4, 0x4, 0x5]);
    });
    //% fixedInstance whenUsed block="ashes"
    effects.ashes = new ParticleEffect(60, 2000, function (anchor, particlesPerSecond) {
        const factory = new particles.AshFactory(anchor);
        const src = new particles.ParticleSource(anchor, particlesPerSecond, factory);
        src.setAcceleration(0, 500);
        return src;
    });
    //% fixedInstance whenUsed block="disintegrate"
    effects.disintegrate = new ParticleEffect(60, 1250, function (anchor, particlesPerSecond) {
        const factory = new particles.AshFactory(anchor, true, 30);
        factory.minLifespan = 200;
        factory.maxLifespan = 500;
        const src = new particles.ParticleSource(anchor, particlesPerSecond, factory);
        src.setAcceleration(0, 750);
        return src;
    });
    //% fixedInstance whenUsed block="blizzard"
    effects.blizzard = new ScreenEffect(15, 50, 3000, function (anchor, particlesPerSecond) {
        class SnowFactory extends particles.ShapeFactory {
            constructor(xRange, yRange) {
                super(xRange, yRange, img `F`);
                this.addShape(img `
                    F
                    F`);
                this.minLifespan = 200;
                this.maxLifespan = this.xRange > 50 ? 1200 : 700;
            }
            createParticle(anchor) {
                const p = super.createParticle(anchor);
                p.color = this.galois.percentChance(80) ? 0x1 : 0x9;
                return p;
            }
        }
        const factory = new SnowFactory(anchor.width ? anchor.width : 16, anchor.height ? anchor.height : 16);
        const src = new particles.ParticleSource(anchor, particlesPerSecond, factory);
        src.setAcceleration(-300, -100);
        return src;
    });
    //% fixedInstance whenUsed block="bubbles"
    effects.bubbles = new ScreenEffect(15, 40, 5000, function (anchor, particlesPerSecond) {
        const min = anchor.width > 50 ? 2000 : 500;
        const factory = new particles.BubbleFactory(anchor, min, min * 2.5);
        return new particles.BubbleSource(anchor, particlesPerSecond, factory.stateCount - 1, factory);
    });
    //% fixedInstance whenUsed block="star field"
    effects.starField = new ScreenEffect(2, 5, 5000, function (anchor, particlesPerSecond) {
        const factory = new particles.StarFactory([0x1, 0x3, 0x5, 0x9, 0xC]);
        return new particles.ParticleSource(anchor, particlesPerSecond, factory);
    });
    //% fixedInstance whenUsed block="clouds"
    effects.clouds = new ScreenEffect(.5, 1.5, 5000, function (anchor, particlesPerSecond) {
        const factory = new particles.CloudFactory();
        const source = new particles.ParticleSource(anchor, particlesPerSecond, factory);
        // render behind tile map
        source.z = -2;
        return source;
    });
    //% fixedInstance whenUsed block="none"
    effects.none = new ScreenEffect(0, 0, 0, function (anchor, particlesPerSecond) {
        class NullParticleSource extends particles.ParticleSource {
            constructor() {
                super(null, 0);
                this._prune();
            }
            __draw(camera) { }
            _update(dt) { }
            // remove self at next opportunity
            _prune() {
                const scene = game.currentScene();
                if (!scene)
                    return;
                __removeElement(scene.allSprites, this);
                const sources = scene.particleSources;
                if (sources && sources.length)
                    __removeElement(sources, this);
            }
            destroy() { this._prune(); }
            clear() { this.head = undefined; }
        }
        const source = new NullParticleSource();
        return source;
    });
})(effects || (effects = {}));
return {particles, effects, Fx, Fx8, FastRandom: Math.FastRandom};
};
