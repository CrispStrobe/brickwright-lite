// Presentation only: keep the VM's retained block descriptions theme independent.
const LEGACY_LOOP_IMAGE = './static/blocks-media/repeat.svg';
const IMAGE_KEYS = ['alt', 'flip_rtl', 'height', 'src', 'type', 'width'];

const injectLoopBlockMedia = (json, media, info) => {
    if (info?.blockType !== 'loop' || info.isDynamic ||
        typeof media !== 'string' || media.length === 0 || !json) return json;

    // Runtime._convertBlockForScratchBlocks appends this final dummy row only
    // for static LOOP blocks. A similarly named third-party icon is unrelated.
    const rows = Object.keys(json).filter(key => /^message(?:0|[1-9][0-9]*)$/.test(key));
    if (!rows.length) return json;
    const indices = rows.map(key => Number(key.slice(7)));
    if (indices.some(index => !Number.isSafeInteger(index))) return json;
    const index = Math.max(...indices);
    const argsKey = `args${index}`;
    const args = json[argsKey];
    if (json[`message${index}`] !== '%1' || json[`lastDummyAlign${index}`] !== 'RIGHT' ||
        !Array.isArray(args) || args.length !== 1) return json;
    const image = args[0];
    if (!image || typeof image !== 'object' || Array.isArray(image) ||
        Object.keys(image).sort().length !== IMAGE_KEYS.length ||
        Object.keys(image).sort().some((key, i) => key !== IMAGE_KEYS[i]) ||
        image.type !== 'field_image' || image.src !== LEGACY_LOOP_IMAGE ||
        image.width !== 24 || image.height !== 24 || image.alt !== '*' || image.flip_rtl !== true) return json;

    const src = `${media.endsWith('/') ? media : `${media}/`}repeat.svg`;
    return {...json, [argsKey]: [{...image, src}]};
};

export {injectLoopBlockMedia};
