//! Inert desktop shell for the future native capability broker.
//!
//! There are deliberately no registered commands or runtime privileges in this
//! module. It establishes the hidden local webview and fail-closed lifecycle hooks.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

use crate::native_policy::NativePolicyState;

const LABEL: &str = "capability-broker";
const DOCUMENT: &str = "capability-broker.html";
const PROTOCOL_SOURCE: &str =
    include_str!("../../../../overlay/scratch-vm/src/extension-support/native-broker-protocol.js");
const BOOTSTRAP_SOURCE: &str = include_str!("native_broker_bootstrap.js");
const HOST_SOURCE: &str = include_str!(
    "../../../../overlay/scratch-gui/static/native-broker/native-broker-host.js"
);
#[cfg(windows)]
const EXPECTED_ORIGIN: &str = "https://tauri.localhost";
#[cfg(not(windows))]
const EXPECTED_ORIGIN: &str = "tauri://localhost";

fn initialization_script() -> String {
    // The generated host consumes the one-shot factory in the same document-start script. No
    // editor-realm script or document subresource receives the factory or its protocol owner.
    format!(
        r#"(()=>{{try{{const l=globalThis.location,expectedOrigin='{EXPECTED_ORIGIN}';if(globalThis.top!==globalThis||l.origin!==expectedOrigin||l.pathname!=='/capability-broker.html'||l.search!==''||l.hash!=='')throw new TypeError('Invalid broker realm');const protocolModule=(()=>{{const module={{exports:{{}}}};{{{PROTOCOL_SOURCE}}};return module.exports;}})();const bootstrapModule=(()=>{{const module={{exports:{{}}}};{{{BOOTSTRAP_SOURCE}}};return module.exports;}})();const install=bootstrapModule.installNativeBrokerReceiver;let installed=false;Object.defineProperty(globalThis,'__brickwrightInstallBrokerHost',{{value:host=>{{if(installed)throw new TypeError('Broker already initialized');installed=true;delete globalThis.__brickwrightInstallBrokerHost;return install({{NativeBrokerProtocol:protocolModule.NativeBrokerProtocol,BrokerProtocolError:protocolModule.BrokerProtocolError,invoke:(...a)=>globalThis.__TAURI_INTERNALS__.invoke(...a),createProtocol:host,expectedOrigin}});}},configurable:true}});{HOST_SOURCE}}}catch(e){{try{{document.title='BROKER-ERR '+String((e&&e.message)||e);}}catch(_){{}}throw e;}}}})();"#
    )
}

pub(crate) fn create(app: &tauri::App, policy: NativePolicyState) -> tauri::Result<()> {
    let navigation_policy = policy.clone();
    let navigation_app = app.handle().clone();
    let page_policy = policy.clone();
    let page_app = app.handle().clone();
    let page_seen = AtomicBool::new(false);
    // NOT `.incognito(true)`, and the reason is a two-crate interaction that costs a whole
    // realm on Linux. Read together:
    //
    //   tauri-runtime-wry/src/lib.rs:5188 — on Linux a custom protocol is bound to the WEB
    //     CONTEXT, so Tauri skips registering a scheme it has already registered on that
    //     context. The main window registered `tauri://` first, so for this webview the
    //     protocol list is empty by the time wry sees it.
    //   wry/src/webkitgtk/mod.rs:255 — when `incognito` is set, wry DISCARDS the passed
    //     context and builds a fresh `WebContext::new_ephemeral()`.
    //
    // So Tauri declines to register the scheme because it believes it already did, and wry
    // then hands this webview a brand-new context that never had it. The realm loads no
    // document at all: WebKit renders "The URL can't be shown", which reads exactly like an
    // empty frontend and is why six hypotheses (CSP, custom-protocol, stale assets, the
    // working directory, a same-document hash navigation, an eager invoke capture) all
    // measured a symptom of this and none of them touched it.
    //
    // The realm loads one static document, holds no storage and is destroyed with the app, so
    // an ephemeral context bought hardening we do not depend on. Correctness wins. Do not add
    // it back without checking whether the upstream interaction still holds.
    let broker = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(DOCUMENT.into()))
        .initialization_script(initialization_script())
        .visible(false)
        .focused(false)
        .focusable(false)
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .skip_taskbar(true)
        .devtools(false)
        .on_navigation(move |url| {
            handle_navigation(url, || {
                let _ = navigation_policy.revoke_all(LABEL);
                navigation_app
                    .state::<crate::native_broker_adapter::NativeBrokerAdapter>()
                    .revoke_broker();
            })
        })
        .on_page_load(move |webview, payload| {
            // NOTE: this reports the WINDOW title, which Tauri does not sync from document.title —
            // measured, it stays "Tauri App" no matter what the page sets. The init script still
            // records its error there for a future channel that can read it, but this line cannot,
            // so do not read a plain title here as "the script succeeded".
            // Kept: this is how the empty realm was first seen. The title is the WINDOW's and
            // Tauri never syncs it from document.title, so never read it as "the script ran".
            eprintln!("[broker] page-load {:?} url={} title={}", payload.event(),
                webview.url().map(|u| u.to_string()).unwrap_or_else(|_| "<none>".into()),
                webview.title().unwrap_or_else(|_| "<none>".into()));
            handle_page_load(payload.event(), &page_seen, || {
                let _ = page_policy.revoke_all(LABEL);
                page_app
                    .state::<crate::native_broker_adapter::NativeBrokerAdapter>()
                    .revoke_broker();
            });
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
    // Observability, not diagnostics-in-production: the e2e harness could tell that the
    // acknowledgement had not arrived but not whether the realm existed, because WebKitWebDriver
    // exposes only the window it attached to. One line each side of the chain makes the app's own
    // output answer that. Neither carries a lease, a digest, a correlation id or any argument.
    // stderr, not log::info!, and deliberately. Under the e2e harness the app is a grandchild
    // of tauri-driver and only its stderr propagates — the BLE panic arrived, the info line
    // did not. A lifecycle line nobody can read is not observability.
    eprintln!("[broker] capability broker realm created");
    let window_app = app.handle().clone();
    broker.on_window_event(move |event| {
        handle_window_event(event, || {
            let _ = policy.revoke_all(LABEL);
            window_app
                .state::<crate::native_broker_adapter::NativeBrokerAdapter>()
                .revoke_broker();
        });
    });
    Ok(())
}

fn handle_navigation(url: &tauri::Url, revoke: impl FnOnce()) -> bool {
    eprintln!("[broker] navigation attempt url={url}");
    let allowed = is_exact_local_document(url);
    if !allowed {
        revoke();
    }
    allowed
}

fn handle_page_load(event: PageLoadEvent, seen: &AtomicBool, revoke: impl FnOnce()) {
    if matches!(event, PageLoadEvent::Started) && seen.swap(true, Ordering::SeqCst) {
        revoke();
    }
}

fn handle_window_event(event: &WindowEvent, revoke: impl FnOnce()) {
    if matches!(event, WindowEvent::Destroyed) {
        revoke();
    }
}

fn is_exact_local_document(url: &tauri::Url) -> bool {
    if url.path() != format!("/{DOCUMENT}")
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return false;
    }

    #[cfg(windows)]
    {
        url.scheme() == "https" && url.host_str() == Some("tauri.localhost")
    }
    #[cfg(not(windows))]
    {
        url.scheme() == "tauri" && url.host_str() == Some("localhost")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canonical() -> tauri::Url {
        #[cfg(windows)]
        let value = "https://tauri.localhost/capability-broker.html";
        #[cfg(not(windows))]
        let value = "tauri://localhost/capability-broker.html";
        tauri::Url::parse(value).unwrap()
    }

    #[test]
    fn accepts_only_the_exact_bundled_document() {
        assert!(is_exact_local_document(&canonical()));
    }

    #[test]
    fn rejects_remote_and_lookalike_origins() {
        for value in [
            "https://example.com/capability-broker.html",
            "https://tauri.localhost.evil/capability-broker.html",
            "tauri://evil/capability-broker.html",
            "file:///capability-broker.html",
            "data:text/html,capability-broker",
            "blob:https://tauri.localhost/id",
        ] {
            assert!(
                !is_exact_local_document(&tauri::Url::parse(value).unwrap()),
                "{value}"
            );
        }
    }

    #[test]
    fn rejects_path_query_fragment_credentials_and_port_variants() {
        let base = canonical().to_string();
        for value in [
            base.replace("capability-broker.html", "other.html"),
            format!("{base}/suffix"),
            format!("{base}?next=https://example.com"),
            format!("{base}#fragment"),
        ] {
            assert!(
                !is_exact_local_document(&tauri::Url::parse(&value).unwrap()),
                "{value}"
            );
        }

        #[cfg(windows)]
        let authority_variants = [
            "https://user@tauri.localhost/capability-broker.html",
            "https://tauri.localhost:4443/capability-broker.html",
        ];
        #[cfg(not(windows))]
        let authority_variants = [
            "tauri://user@localhost/capability-broker.html",
            "tauri://localhost:1234/capability-broker.html",
        ];
        for value in authority_variants {
            assert!(
                !is_exact_local_document(&tauri::Url::parse(value).unwrap()),
                "{value}"
            );
        }
    }

    #[test]
    fn denied_navigation_revokes_before_returning_false() {
        let denied = tauri::Url::parse("https://example.com/").unwrap();
        let mut revoked = false;
        assert!(!handle_navigation(&denied, || revoked = true));
        assert!(revoked);
    }

    #[test]
    fn allowed_navigation_does_not_revoke() {
        let mut revoked = false;
        assert!(handle_navigation(&canonical(), || revoked = true));
        assert!(!revoked);
    }

    #[test]
    fn only_destroyed_window_event_revokes() {
        let mut destroyed_revocations = 0;
        handle_window_event(&WindowEvent::Destroyed, || destroyed_revocations += 1);
        assert_eq!(destroyed_revocations, 1);

        let mut focus_revocations = 0;
        handle_window_event(&WindowEvent::Focused(false), || focus_revocations += 1);
        assert_eq!(focus_revocations, 0);
    }

    #[test]
    fn initialization_is_local_one_shot_and_does_not_register_commands() {
        let script = initialization_script();
        assert!(script.contains(EXPECTED_ORIGIN));
        assert!(script.contains("l.search!==''||l.hash!==''"));
        assert!(script.contains("globalThis.top!==globalThis"));
        assert!(script.contains("Broker already initialized"));
        assert!(script.contains("AUTO-GENERATED by scripts/package-native-broker-assets.mjs"));
        assert!(script.contains("__brickwrightInstallBrokerHost(createProtocol)"));
        assert!(script.contains("configurable: false"));
        // MAIN-side commands must never be reachable from this realm. This is the assertion
        // that protects a boundary: the broker must not be able to open a session or send
        // itself a request.
        assert!(script.contains("native_broker_ready"));
        assert!(!script.contains("native_broker_open"));
        assert!(!script.contains("native_broker_request"));

        // The realm's OWN commands, which it gained when capability requests started being
        // served here rather than relayed to a worker.
        assert!(script.contains("native_broker_lease"));
        assert!(script.contains("native_broker_invoke"));

        // This replaced `assert!(!script.contains("platform.kind.read"))`, which was written when
        // the realm had no semantic role and could not survive giving it one. Losing it costs
        // nothing, because it never protected a capability: a lease declares exactly
        // `[(PlatformKindRead, PlatformDefault)]`, fixed by the HOST at issue time, and
        // `authorize_broker_call` refuses any other pair as Undeclared. The realm knowing the
        // name buys an attacker nothing it could not already attempt.
        //
        // What DOES need pinning is the property the vocabulary here exists to provide: the
        // resource is LOOKED UP from a closed table, never taken from the editor's payload. If
        // that ever became `fields.resource`, the editor would choose what it touches.
        assert!(script.contains("CAPABILITY_RESOURCE[envelope.operation]"));
        assert!(!script.contains("fields.resource"));
        assert!(!script.contains("envelope.resource"));
    }

    #[test]
    fn canonical_reload_revokes_before_allowing_fresh_document() {
        let seen = AtomicBool::new(false);
        let mut revocations = 0;
        handle_page_load(PageLoadEvent::Started, &seen, || revocations += 1);
        assert_eq!(revocations, 0);
        handle_page_load(PageLoadEvent::Finished, &seen, || revocations += 1);
        assert_eq!(revocations, 0);
        handle_page_load(PageLoadEvent::Started, &seen, || revocations += 1);
        assert_eq!(revocations, 1);
    }
}
