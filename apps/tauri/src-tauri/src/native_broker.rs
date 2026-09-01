//! Inert desktop shell for the future native capability broker.
//!
//! There are deliberately no commands, policy hooks, or runtime privileges in
//! this module. It only establishes a hidden, local, non-navigable webview.

use tauri::{webview::NewWindowResponse, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::native_policy::NativePolicyState;

const LABEL: &str = "capability-broker";
const DOCUMENT: &str = "capability-broker.html";
const PROTOCOL_SOURCE: &str =
    include_str!("../../../../overlay/scratch-vm/src/extension-support/native-broker-protocol.js");
const BOOTSTRAP_SOURCE: &str = include_str!("native_broker_bootstrap.js");
#[cfg(windows)]
const EXPECTED_ORIGIN: &str = "https://tauri.localhost";
#[cfg(not(windows))]
const EXPECTED_ORIGIN: &str = "tauri://localhost";

fn initialization_script() -> String {
    // C5 stages a one-shot host factory entrypoint. It is intentionally not invoked until the
    // authenticated worker host lands; therefore no receiver exists in production yet.
    format!(
        r#"(()=>{{const l=globalThis.location,expectedOrigin='{EXPECTED_ORIGIN}';if(globalThis.top!==globalThis||l.origin!==expectedOrigin||l.pathname!=='/capability-broker.html'||l.search!==''||l.hash!=='')throw new TypeError('Invalid broker realm');const protocolModule=(()=>{{const module={{exports:{{}}}};{{{PROTOCOL_SOURCE}}};return module.exports;}})();const bootstrapModule=(()=>{{const module={{exports:{{}}}};{{{BOOTSTRAP_SOURCE}}};return module.exports;}})();const install=bootstrapModule.installNativeBrokerReceiver;let installed=false;Object.defineProperty(globalThis,'__brickwrightInstallBrokerHost',{{value:host=>{{if(installed)throw new TypeError('Broker already initialized');installed=true;delete globalThis.__brickwrightInstallBrokerHost;return install({{NativeBrokerProtocol:protocolModule.NativeBrokerProtocol,BrokerProtocolError:protocolModule.BrokerProtocolError,invoke:globalThis.__TAURI_INTERNALS__.invoke,createProtocol:host,expectedOrigin}});}},configurable:true}});}})();"#
    )
}

pub(crate) fn create(app: &tauri::App, policy: NativePolicyState) -> tauri::Result<()> {
    let navigation_policy = policy.clone();
    let navigation_app = app.handle().clone();
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
        .incognito(true)
        .on_navigation(move |url| {
            handle_navigation(url, || {
                let _ = navigation_policy.revoke_all(LABEL);
                navigation_app
                    .state::<crate::native_broker_adapter::NativeBrokerAdapter>()
                    .revoke_broker();
            })
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
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
    let allowed = is_exact_local_document(url);
    if !allowed {
        revoke();
    }
    allowed
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
        assert!(script.contains("configurable: false"));
        assert!(!script.contains("native_broker_open"));
        assert!(!script.contains("platform.kind.read"));
    }
}
