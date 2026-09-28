/**
 * Capabilities selected when webpack builds a distribution.
 *
 * `BW_REMOTE_CODE_POLICY=deny` produces a deliberately self-contained bundle.
 * Every other build, including ordinary Tauri, Android, Windows and web builds,
 * allows the reviewed remote-code and remote-machine paths. Webpack replaces the
 * environment expression with a string literal, so a packaged app cannot change
 * this policy through local storage, a URL parameter or runtime platform spoofing.
 */
export const remoteCodePolicy = () => process.env.BW_REMOTE_CODE_POLICY === 'deny' ? 'deny' : 'allow';
export const remoteCodeAllowed = () => remoteCodePolicy() === 'allow';
export const remoteCodeRestricted = () => !remoteCodeAllowed();
