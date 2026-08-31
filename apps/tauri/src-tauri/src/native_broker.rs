//! Inert desktop shell for the future native capability broker.
//!
//! There are deliberately no commands, policy hooks, or runtime privileges in
//! this module. It only establishes a hidden, local, non-navigable webview.

use tauri::{webview::NewWindowResponse, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "capability-broker";
const DOCUMENT: &str = "capability-broker.html";

pub(crate) fn create(app: &tauri::App) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(DOCUMENT.into()))
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
        .on_navigation(is_exact_local_document)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
    Ok(())
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
}
