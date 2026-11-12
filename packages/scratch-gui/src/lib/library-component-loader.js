// A dialog request belongs to its mounted caller. Closing or replacing it must
// not publish a component/error from an older request. No load occurs on import.
export const requestLibraryComponent = (load, ready, failed) => {
    let current = true;
    Promise.resolve().then(() => current ? load() : null).then(module => {
        if (!current) return;
        if (!module || !module.default) throw new Error('Library component unavailable');
        ready(module.default);
    }).catch(error => {
        if (current) failed(error);
    });
    return () => { current = false; };
};
