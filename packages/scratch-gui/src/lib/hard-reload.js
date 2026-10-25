/**
 * Reload the BrickWright shell after removing caches that can keep an old
 * webpack entrypoint or chunk alive. Project and preference localStorage are
 * deliberately preserved.
 */
export async function hardReload () {
    try {
        if (typeof caches !== 'undefined') {
            const names = await caches.keys();
            await Promise.all(names.map(name => caches.delete(name)));
        }
    } catch { /* CacheStorage is unavailable in some webviews/private modes. */ }

    try {
        if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));
        }
    } catch { /* Service workers are optional in the native app. */ }

    if (typeof window === 'undefined' || !window.location) return;
    // A query stamp also bypasses an HTTP cache that is outside CacheStorage.
    const url = new URL(window.location.href);
    url.searchParams.set('bw-hard-reload', String(Date.now()));
    window.location.replace(url.href);
}

