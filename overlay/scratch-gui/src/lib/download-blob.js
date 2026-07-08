// Brickwright: under Tauri, route "downloads" (project .sb3 export, sprite/costume/
// sound exports) through a native Save dialog instead of a browser download. Falls
// back to the normal browser download everywhere else.
export default (filename, blob) => {
    const tauri = typeof window !== 'undefined' && window.__TAURI__;
    if (tauri && tauri.core && typeof tauri.core.invoke === 'function') {
        blob.arrayBuffer()
            .then(buf => tauri.core.invoke('save_project', {
                filename,
                bytes: Array.from(new Uint8Array(buf))
            }))
            // eslint-disable-next-line no-console
            .catch(e => console.error('[brickwright] native save failed', e));
        return;
    }

    const downloadLink = document.createElement('a');
    document.body.appendChild(downloadLink);

    // Use special ms version if available to get it working on Edge.
    if (navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, filename);
        return;
    }

    if ('download' in HTMLAnchorElement.prototype) {
        const url = window.URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.type = blob.type;
        downloadLink.click();
        // remove the link after a timeout to prevent a crash on iOS 13 Safari
        window.setTimeout(() => {
            document.body.removeChild(downloadLink);
            window.URL.revokeObjectURL(url);
        }, 1000);
    } else {
        // iOS 12 Safari, open a new page and set href to data-uri
        let popup = window.open('', '_blank');
        const reader = new FileReader();
        reader.onloadend = function () {
            popup.location.href = reader.result;
            popup = null;
        };
        reader.readAsDataURL(blob);
    }

};
