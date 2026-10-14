/**
 * Apply synchronous editor languages immediately while allowing heavyweight
 * languages to arrive out of order. Only the newest deferred request owns the
 * language compartment; callers continue to own the editor document and its
 * selection/decorations.
 */
class LatestLanguageRequest {
    constructor ({getImmediate, loadDeferred, apply, fallback, onError}) {
        this._getImmediate = getImmediate;
        this._loadDeferred = loadDeferred;
        this._apply = apply;
        this._fallback = fallback;
        this._onError = onError;
        this._generation = 0;
        this._disposed = false;
    }

    select (language) {
        const generation = ++this._generation;
        const immediate = this._getImmediate(language);
        if (immediate !== undefined) {
            this._apply(immediate, language);
            return null;
        }

        // A compartment reconfiguration leaves CodeMirror's document,
        // selection and debugger decorations in the existing state.
        this._apply(this._fallback, language);
        let pending;
        try {
            pending = this._loadDeferred(language);
        } catch (error) {
            if (!this._disposed && generation === this._generation && this._onError) {
                this._onError(error, language);
            }
            return Promise.resolve(false);
        }
        return Promise.resolve(pending).then(extension => {
            if (this._disposed || generation !== this._generation) return false;
            this._apply(extension, language);
            return true;
        }, error => {
            if (!this._disposed && generation === this._generation && this._onError) {
                this._onError(error, language);
            }
            return false;
        });
    }

    dispose () {
        this._disposed = true;
        this._generation++;
    }
}

export default LatestLanguageRequest;
