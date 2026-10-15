// Native SDK Image ownership for the optional class/callable domain. This
// service issues no references and accepts no serialized producer metadata.
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const lengthOf = Object.getOwnPropertyDescriptor(typedArray, 'length').get;
const typedArrayKind = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag).get;
const nativeCollection = (value, weak) => {
    try {(weak ? WeakMap.prototype.has : Map.prototype.has).call(value, {}); return true;} catch (_) {return false;}
};
const ownData = (value, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
        !Object.prototype.hasOwnProperty.call(descriptors, key) || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))) return null;
    return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
};

module.exports = function createSdkImageOwner(runtime, values, currentState) {
    let expected = null, disposed = false;
    const fail = reason => {throw new Error('SDK Image value: ' + reason);};
    const state = () => {
        if (!runtime || !values || typeof currentState !== 'function') fail('inactive native owner');
        const value = currentState();
        if (!value || value.current !== true || value.extension?._runtime !== runtime ||
            !nativeCollection(value.images, false) || !nativeCollection(value.identities, true) || typeof value.resolve !== 'function')
            fail('current extension and image service are required');
        return value;
    };
    const current = () => {
        if (disposed || !expected) fail('inactive native owner');
        const value = state();
        if (value.extension !== expected.extension || value.images !== expected.images ||
            value.identities !== expected.identities || value.resolve !== expected.resolve)
            fail('image service or program epoch changed');
        return value;
    };
    const body = value => {
        const owner = current();
        // Inspect the transport before calling codec helpers: accessors and
        // custom coercion cannot manufacture a reference through reflection.
        const wrapper = ownData(value, ['bwReference']);
        const reference = wrapper && ownData(wrapper.bwReference, ['kind', 'id', 'scope']);
        if (!reference || reference.kind !== 'image' || typeof reference.id !== 'string' ||
            typeof reference.scope !== 'string') fail('an owned Image reference is required');
        const id = values.referenceId(runtime, value, 'image');
        if (id === null || id !== reference.id) fail('foreign or stale reference');
        const image = owner.images.get(id);
        if (!image || owner.identities.get(image) !== id || owner.resolve.call(owner.extension, value) !== image)
            fail('actual current Image body is missing');
        const descriptors = Object.getOwnPropertyDescriptors(image);
        const width = descriptors.width?.value, height = descriptors.height?.value, pixels = descriptors.pixels?.value;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0 ||
            width > 2000 || height > 2000 || typedArrayKind.call(pixels) !== 'Uint8Array' || lengthOf.call(pixels) !== width * height)
            fail('Image dimensions and pixel extent differ');
        return image;
    };
    return Object.freeze({
        start() {
            if (disposed) fail('disposed native owner');
            // Bind after the real extension has reset its Image maps. Merely
            // constructing this service (for getInfo, for example) is inert.
            const value = state();
            expected = {extension:value.extension, images:value.images, identities:value.identities, resolve:value.resolve};
        },
        body,
        assert(value) {body(value); return value;},
        dispose() {disposed = true; expected = null;}
    });
};
