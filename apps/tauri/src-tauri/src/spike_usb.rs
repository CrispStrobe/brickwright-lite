//! Mobile/desktop transport for the Mac's USB bridge. Native HTTP avoids
//! WebView mixed-content restrictions when Brickwright runs on an iPad.

use std::time::Duration;

#[tauri::command]
pub async fn spike_usb_bridge_run(
    url: String,
    token: String,
    source: String,
) -> Result<serde_json::Value, String> {
    if source.len() > 65_536 {
        return Err("SPIKE USB program exceeds 64 KiB".into());
    }
    let mut endpoint = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(endpoint.scheme(), "http" | "https") {
        return Err("SPIKE USB bridge URL must use http or https".into());
    }
    endpoint.set_path("/run");
    endpoint.set_query(None);
    endpoint.set_fragment(None);
    let response = reqwest::Client::new()
        .post(endpoint)
        .timeout(Duration::from_secs(120))
        .header("Content-Type", "application/json")
        .header("X-Brickwright-Token", token)
        .body(serde_json::json!({"source": source}).to_string())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let body_text = response.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = serde_json::from_str(&body_text).map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(body["error"]
            .as_str()
            .unwrap_or("SPIKE USB bridge request failed")
            .into());
    }
    Ok(body)
}
