/**
 * Capabilities selected when webpack builds a distribution.
 *
 * `BW_REMOTE_CODE_POLICY` remains the convenient umbrella. The three narrower
 * build variables may override it independently, so a store artifact can refuse
 * URL extensions without also hiding pinned machine lessons or the separately
 * disclosed optional compiler download. Webpack replaces every expression with
 * a string literal: none of these policies can be changed at runtime.
 */
const policy = value => value === 'deny' ? 'deny' : 'allow';

export const remoteExtensionsPolicy = () =>
    policy(process.env.BW_REMOTE_EXTENSIONS_POLICY || process.env.BW_REMOTE_CODE_POLICY);
export const remoteToolchainsPolicy = () =>
    policy(process.env.BW_REMOTE_TOOLCHAINS_POLICY || process.env.BW_REMOTE_CODE_POLICY);
export const remoteMachineImagesPolicy = () =>
    policy(process.env.BW_REMOTE_MACHINE_IMAGES_POLICY || process.env.BW_REMOTE_CODE_POLICY);

export const remoteExtensionsAllowed = () => remoteExtensionsPolicy() === 'allow';
export const remoteToolchainsAllowed = () => remoteToolchainsPolicy() === 'allow';
export const remoteMachineImagesAllowed = () => remoteMachineImagesPolicy() === 'allow';

// Compatibility helpers describe the aggregate profile. New call sites should
// ask for the particular capability they use.
export const remoteCodeAllowed = () => remoteExtensionsAllowed() &&
    remoteToolchainsAllowed() && remoteMachineImagesAllowed();
export const remoteCodeRestricted = () => !remoteCodeAllowed();
export const remoteCodePolicy = () => remoteCodeAllowed() ? 'allow' : 'deny';
