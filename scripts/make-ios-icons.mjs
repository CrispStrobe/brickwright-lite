#!/usr/bin/env node
/**
 * Rebuild `apps/tauri/src-tauri/icons/ios/` from the robot artwork.
 *
 * Two things it fixes, both of which put a wrong icon on the home screen:
 *
 * 1. **The rounded corners are painted on.** The artwork is a rounded rectangle
 *    with the corners filled in OPAQUE WHITE — not transparent, which is what it
 *    looks like and what the alpha channel's presence suggests. That is right for
 *    macOS and Windows and wrong for iOS: iOS applies its own superellipse mask,
 *    so it wants a full-bleed square and a pre-rounded one shows white slivers
 *    where the two curves disagree. The corners are refilled here with the same
 *    background gradient, taken from a slightly enlarged copy of the artwork
 *    whose own corners have been cropped away — so it is the gradient continued,
 *    not a flat patch against it.
 *
 * 2. **The alpha channel.** It exists and is entirely opaque, which is enough for
 *    App Store Connect to answer ITMS-90717 ("The app icon can't be transparent
 *    nor contain an alpha channel"). Everything written here is RGB.
 *
 * The corner region is found from the image rather than from a hardcoded radius:
 * a flood fill inward from each corner over near-white pixels traces the exact
 * shape, antialiased edge included. Measuring the radius instead assumes a
 * circular arc, and this artwork uses a squircle — at 1024px the top row turns
 * over at x=139 where a circle of that radius would turn over at x=122.
 *
 * Run after changing the artwork, then commit `icons/ios/`:
 *   node scripts/make-ios-icons.mjs
 *
 * Getting these files into the app is a SEPARATE step — see
 * scripts/patch-ios-icons.mjs, because `tauri ios init` templates Tauri's own
 * logo into gen/apple and never looks at this directory.
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'apps/tauri/src-tauri/icons');
const outDir = join(iconsDir, 'ios');
/** The highest-resolution robot we have; every other size is derived from it. */
const source = join(outDir, 'AppIcon-512@2x.png');

/**
 * Exactly the filenames in the generated AppIcon.appiconset's Contents.json.
 * Sizes are the RENDERED pixel size (points x scale) — `-1` suffixed names are
 * Xcode's way of giving the iPad and iPhone entries distinct files at sizes
 * where both idioms want the same pixels.
 */
const SIZES = {
    'AppIcon-20x20@1x.png': 20,
    'AppIcon-20x20@2x.png': 40,
    'AppIcon-20x20@2x-1.png': 40,
    'AppIcon-20x20@3x.png': 60,
    'AppIcon-29x29@1x.png': 29,
    'AppIcon-29x29@2x.png': 58,
    'AppIcon-29x29@2x-1.png': 58,
    'AppIcon-29x29@3x.png': 87,
    'AppIcon-40x40@1x.png': 40,
    'AppIcon-40x40@2x.png': 80,
    'AppIcon-40x40@2x-1.png': 80,
    'AppIcon-40x40@3x.png': 120,
    'AppIcon-60x60@2x.png': 120,
    'AppIcon-60x60@3x.png': 180,
    'AppIcon-76x76@1x.png': 76,
    'AppIcon-76x76@2x.png': 152,
    'AppIcon-83.5x83.5@2x.png': 167,
    'AppIcon-512@2x.png': 1024
};

/** How much to enlarge the backing copy. 1.2 crops ~85px per side at 1024 — the
 *  corner cap of an ~18% radius is ~54px, so this clears it with room to spare. */
const BACKING_ZOOM = 1.2;

const python = `
from PIL import Image, ImageDraw, ImageFilter
import io, sys, json

src = Image.open(${JSON.stringify(source)}).convert('RGBA')
n = src.width
assert src.width == src.height, 'the source icon must be square'

# --- 1. where the painted-on corners are -------------------------------------
# Flood fill inward from each corner across near-white pixels. This traces the
# real curve, whatever it is, and stops at the gradient. The robot's own white
# eyes are nowhere near a corner, so they are never reached.
white = Image.new('L', src.size, 0)
wpx = white.load()
spx = src.load()
for y in range(n):
    for x in range(n):
        r, g, b, a = spx[x, y]
        if (r > 244 and g > 244 and b > 244) or a < 8:
            wpx[x, y] = 255

outside = Image.new('L', src.size, 0)
for corner in [(0, 0), (n - 1, 0), (0, n - 1), (n - 1, n - 1)]:
    if wpx[corner] != 255:
        continue                      # already a full-bleed square: nothing to do
    fill = white.copy()
    ImageDraw.floodfill(fill, corner, 128, thresh=0)
    mask = fill.point(lambda v: 255 if v == 128 else 0)
    outside = Image.eval(Image.merge('L', [outside]).point(lambda v: v), lambda v: v)
    outside.paste(255, (0, 0), mask)

# Grow by five pixels. Two is not enough: besides the antialiased rim there is a
# one-pixel DARKER line just inside the curve in this artwork (at 1024px the
# diagonal reads 255,255,255 -> 219,245,248 -> 79,206,221 -> 21,190,210 -> the
# gradient's 32,192,211), and leaving that behind draws a faint arc across each
# corner. Five costs nothing: the gradient is smooth, and the backing matches it
# to within a unit or two over that distance.
outside = outside.filter(ImageFilter.MaxFilter(11))

# --- 2. the gradient to put there --------------------------------------------
# The same artwork, enlarged and centre-cropped so its own corners fall outside
# the frame. Only the corner caps are ever taken from it; the robot in this copy
# is entirely covered by the original.
big = src.resize((round(n * ${BACKING_ZOOM}),) * 2, Image.LANCZOS)
off = (big.width - n) // 2
backing = big.crop((off, off, off + n, off + n))
bpx = backing.load()
for corner in [(0, 0), (n - 1, 0), (0, n - 1), (n - 1, n - 1)]:
    r, g, b, a = bpx[corner]
    assert a == 255 and not (r > 244 and g > 244 and b > 244), (
        'the enlarged copy still has a painted corner at %s - raise BACKING_ZOOM' % (corner,))

master = Image.composite(backing, src, outside).convert('RGB')

out = {}
for name, size in json.loads(sys.argv[1]).items():
    img = master if size == n else master.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    out[name] = buf.getvalue().hex()
print(json.dumps(out))
`;

const written = JSON.parse(execFileSync('python3', ['-c', python, JSON.stringify(SIZES)],
    {maxBuffer: 1 << 28}).toString());

mkdirSync(outDir, {recursive: true});
for (const [name, hex] of Object.entries(written)) {
    const bytes = Buffer.from(hex, 'hex');
    writeFileSync(join(outDir, name), bytes);
    console.log(`  ${name.padEnd(28)} ${SIZES[name]}px  ${bytes.length} bytes`);
}
console.log(`wrote ${Object.keys(written).length} opaque iOS icons to icons/ios/`);
