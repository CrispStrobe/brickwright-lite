import log from './log.js';

const vendorId = 0x0d28;
const productId = 0x0204;
const loadUpdateImplementation = () => import(
    /* webpackChunkName: "microbit-update" */ './microbit-update-implementation.js'
);

// The production instance always loads the genuine existing updater. Each call
// owns its chooser/device/progress values; failed acquisition is not cached here.
// The optional current predicate fences only work that has not started a
// transport. An in-flight firmware update keeps its original cleanup contract.
export const createMicroBitUpdater = ({
    getNavigator = () => navigator,
    loadImplementation = loadUpdateImplementation
} = {}) => async (progress, {isCurrent = () => true} = {}) => {
    if (!isCurrent()) return;
    log.info('Selecting micro:bit');
    const ownerUSB = getNavigator().usb;
    // Keep this actual method invocation synchronous with user activation.
    const device = await ownerUSB.requestDevice({
        filters: [{vendorId, productId}]
    });
    if (!device) {
        log.info('No device selected');
        return;
    }
    if (!isCurrent()) return;
    const {updateMicroBit} = await loadImplementation();
    if (!isCurrent()) return;
    return updateMicroBit(device, progress);
};

/**
 * Select a micro:bit, then acquire the unchanged real update implementation.
 * Existing callers retain their progress callback and Promise<void> API.
 */
const selectAndUpdateMicroBit = createMicroBitUpdater();

/** Checks support without loading or starting an update. */
const isMicroBitUpdateSupported = () =>
    !!(navigator.usb && navigator.usb.requestDevice);

export {
    isMicroBitUpdateSupported,
    selectAndUpdateMicroBit
};
