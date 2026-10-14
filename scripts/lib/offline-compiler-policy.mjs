export function isHostedCompilerRequest (request, appUrl) {
    if (!request || String(request.method()).toUpperCase() !== 'POST') return false;
    try {
        const requestUrl = new URL(request.url());
        const app = new URL(appUrl);
        return requestUrl.origin !== app.origin && /\/compile\/?$/.test(requestUrl.pathname);
    } catch {
        return false;
    }
}
