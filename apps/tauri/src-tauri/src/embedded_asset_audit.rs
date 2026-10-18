//! Opt-in observation of the installed simulator's actual asset resolver.
//! Embedded iterator bytes may be compressed; served bytes may include HTML/CSP
//! transformations. Neither identity is labelled as the original web file.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{borrow::Cow, collections::BTreeMap};

const ENTRIES: usize = 8192;
const KEY_BYTES: usize = 512;
const FILE_BYTES: usize = 64 * 1024 * 1024;
const TOTAL_BYTES: usize = 512 * 1024 * 1024;
const OUTPUT_BYTES: usize = 8 * 1024 * 1024;
const DEADLINE_NS: u64 = 60_000_000_000;

#[derive(Serialize)]
struct Entry {
    key: String,
    embedded_bytes: usize,
    embedded_sha256: String,
    served_bytes: usize,
    served_sha256: String,
    csp_header_sha256: Option<String>,
}

#[derive(Serialize)]
struct EmbeddedEntry {
    key: String,
    bytes: usize,
    sha256: String,
}

#[derive(Serialize)]
struct Receipt {
    schema: &'static str,
    status: &'static str,
    refusal: Option<&'static str>,
    enumerated_entries: usize,
    embedded_entries: Vec<EmbeddedEntry>,
    completed_entries: Vec<Entry>,
    embedded_total_bytes: usize,
    served_total_bytes: usize,
    elapsed_ns: u64,
    embedded_encoding: &'static str,
    served_encoding: &'static str,
    original_web_identity_proved: bool,
    signed_map_identity_proved: bool,
    callback_lifetime_bounded: bool,
}

pub(crate) struct Served {
    bytes: Vec<u8>,
    csp_header: Option<String>,
}

fn canonical_key(key: &str) -> bool {
    key.len() <= KEY_BYTES
        && key.starts_with('/')
        && key[1..]
            .split('/')
            .all(|part| !matches!(part, "" | "." | ".."))
        && !key
            .chars()
            .any(|c| c.is_control() || matches!(c, '%' | '?' | '#' | '\\'))
}

fn clock<C: FnMut() -> u64>(now: &mut C, last: &mut u64) -> Result<(), &'static str> {
    let tick = now();
    if tick < *last || tick > DEADLINE_NS {
        return Err("clock-reversed-or-deadline");
    }
    *last = tick;
    Ok(())
}

fn hash<C: FnMut() -> u64>(
    bytes: &[u8],
    now: &mut C,
    last: &mut u64,
) -> Result<String, &'static str> {
    let mut digest = Sha256::new();
    clock(now, last)?;
    for chunk in bytes.chunks(65536) {
        digest.update(chunk);
        clock(now, last)?;
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn collect<'a, I, F, C>(assets: I, mut resolve: F, mut now: C) -> Receipt
where
    I: Iterator<Item = (Cow<'a, str>, Cow<'a, [u8]>)>,
    F: FnMut(String) -> Option<Served>,
    C: FnMut() -> u64,
{
    let mut result = Receipt {
        schema: "brickwright.installed-asset-observation.v1",
        status: "partial",
        refusal: None,
        enumerated_entries: 0,
        embedded_entries: Vec::new(),
        completed_entries: Vec::new(),
        embedded_total_bytes: 0,
        served_total_bytes: 0,
        elapsed_ns: 0,
        embedded_encoding: "actual-assets-iterator-storage-bytes",
        served_encoding: "actual-resolver-with-current-html-and-csp-handling",
        original_web_identity_proved: false,
        signed_map_identity_proved: false,
        callback_lifetime_bounded: false,
    };
    let mut last = 0;
    let mut index = BTreeMap::new();
    let mut output = 4096usize;
    let run = (|| {
        for (key, raw) in assets {
            clock(&mut now, &mut last)?;
            if index.len() >= ENTRIES || !canonical_key(&key) || index.contains_key(key.as_ref()) {
                return Err("entry-count-key-or-duplicate");
            }
            if raw.len() > FILE_BYTES || raw.len() > TOTAL_BYTES - result.embedded_total_bytes {
                return Err("embedded-byte-budget");
            }
            let digest = hash(&raw, &mut now, &mut last)?;
            let metadata = EmbeddedEntry {
                key: key.into_owned(),
                bytes: raw.len(),
                sha256: digest,
            };
            let metadata_bytes =
                serde_json::to_vec(&metadata).map_err(|_| "metadata-serialization")?;
            if metadata_bytes.len() + 1 > OUTPUT_BYTES - output {
                return Err("output-byte-budget");
            }
            output += metadata_bytes.len() + 1;
            result.embedded_total_bytes += raw.len();
            index.insert(metadata.key.clone(), metadata);
            result.enumerated_entries = index.len();
        }
        if index.is_empty() {
            return Err("empty-embedded-map");
        }
        // Reserve the fixed receipt fields before retaining individual rows.
        for (key, metadata) in &index {
            clock(&mut now, &mut last)?;
            // Only enumerated canonical keys reach get(): no URL aliases,
            // percent decoding or invented missing-key fallback probes.
            let served = resolve(key.clone()).ok_or("enumerated-key-not-served")?;
            clock(&mut now, &mut last)?;
            if served.bytes.len() > FILE_BYTES
                || served.bytes.len() > TOTAL_BYTES - result.served_total_bytes
            {
                return Err("served-byte-budget");
            }
            if served
                .csp_header
                .as_ref()
                .is_some_and(|header| header.len() > 8192)
            {
                return Err("csp-header-budget");
            }
            let served_sha256 = hash(&served.bytes, &mut now, &mut last)?;
            let csp_header_sha256 = served
                .csp_header
                .as_ref()
                .map(|header| hash(header.as_bytes(), &mut now, &mut last))
                .transpose()?;
            let row = Entry {
                key: key.clone(),
                embedded_bytes: metadata.bytes,
                embedded_sha256: metadata.sha256.clone(),
                served_bytes: served.bytes.len(),
                served_sha256,
                csp_header_sha256,
            };
            let row_bytes = serde_json::to_vec(&row).map_err(|_| "row-serialization")?;
            if row_bytes.len() + 1 > OUTPUT_BYTES - output {
                return Err("output-byte-budget");
            }
            output += row_bytes.len() + 1;
            result.served_total_bytes += served.bytes.len();
            result.completed_entries.push(row);
        }
        clock(&mut now, &mut last)?;
        Ok(())
    })();
    result.embedded_entries = index.into_values().collect();
    result.elapsed_ns = last;
    match run {
        Ok(()) => result.status = "complete-observation-only",
        Err(code) => result.refusal = Some(code),
    }
    result
}

const CONFIG_BYTES: usize = 1024 * 1024;
const CONFIG_PROFILE: &str = "tauri-2.11.5-utils-2.9.3-codegen-2.6.3-asset-config.v1";

#[derive(Serialize)]
struct AssetConfigValues {
    dev_url_absent: bool,
    csp_absent: bool,
    dev_csp_absent: bool,
    pattern: &'static str,
    freeze_prototype: bool,
    disable_asset_csp_modification: bool,
    asset_protocol_enabled: bool,
}

#[derive(Serialize)]
struct AssetConfigProjection {
    schema: &'static str,
    status: &'static str,
    refusal: Option<&'static str>,
    profile: &'static str,
    runtime_config_sha256: Option<String>,
    values: Option<AssetConfigValues>,
    full_configuration_joined: bool,
    raw_configuration_exposed: bool,
    compiler_inputs_proved: bool,
}

fn asset_config_projection(raw: Option<&[u8]>) -> AssetConfigProjection {
    let mut result = AssetConfigProjection {
        schema: "brickwright.asset-config-projection.v1",
        status: "partial",
        refusal: None,
        profile: CONFIG_PROFILE,
        runtime_config_sha256: None,
        values: None,
        full_configuration_joined: false,
        raw_configuration_exposed: false,
        compiler_inputs_proved: false,
    };
    let run = (|| -> Result<AssetConfigValues, &'static str> {
        let raw = raw.ok_or("config-serialization")?;
        if raw.len() > CONFIG_BYTES {
            return Err("config-byte-budget");
        }
        result.runtime_config_sha256 = Some(format!("{:x}", Sha256::digest(raw)));
        let value: serde_json::Value = serde_json::from_slice(raw).map_err(|_| "config-json")?;
        let build = value
            .get("build")
            .and_then(|v| v.as_object())
            .ok_or("config-build")?;
        let security = value
            .get("app")
            .and_then(|v| v.get("security"))
            .and_then(|v| v.as_object())
            .ok_or("config-security")?;
        let absent = |map: &serde_json::Map<String, serde_json::Value>, key: &str| {
            map.get(key).map_or(true, |value| value.is_null())
        };
        if !absent(build, "devUrl") {
            return Err("configured-dev-url");
        }
        if !absent(security, "csp") {
            return Err("configured-csp");
        }
        if !absent(security, "devCsp") {
            return Err("configured-dev-csp");
        }
        let pattern = security
            .get("pattern")
            .and_then(|v| v.as_object())
            .ok_or("config-pattern")?;
        if pattern.len() != 1 || pattern.get("use").and_then(|v| v.as_str()) != Some("brownfield") {
            return Err("unsupported-pattern");
        }
        if security.get("freezePrototype").and_then(|v| v.as_bool()) != Some(false) {
            return Err("unsupported-freeze-prototype");
        }
        if security
            .get("dangerousDisableAssetCspModification")
            .and_then(|v| v.as_bool())
            != Some(false)
        {
            return Err("unsupported-csp-modification");
        }
        if security
            .get("assetProtocol")
            .and_then(|v| v.get("enable"))
            .and_then(|v| v.as_bool())
            != Some(false)
        {
            return Err("unsupported-asset-protocol");
        }
        Ok(AssetConfigValues {
            dev_url_absent: true,
            csp_absent: true,
            dev_csp_absent: true,
            pattern: "brownfield",
            freeze_prototype: false,
            disable_asset_csp_modification: false,
            asset_protocol_enabled: false,
        })
    })();
    match run {
        Ok(values) => {
            result.status = "complete-projection-only";
            result.values = Some(values);
        }
        Err(code) => result.refusal = Some(code),
    }
    result
}

fn encode_envelope(envelope: &serde_json::Value) -> Vec<u8> {
    let (code, length, digest) = match serde_json::to_vec(envelope) {
        Ok(bytes) if bytes.len() <= OUTPUT_BYTES => return bytes,
        Ok(bytes) => (
            "envelope-output-budget",
            Some(bytes.len()),
            Some(format!("{:x}", Sha256::digest(&bytes))),
        ),
        Err(_) => ("envelope-serialization", None, None),
    };
    // Retain an explicit bounded refusal, not an empty file or a truncated map.
    serde_json::to_vec(&serde_json::json!({
        "schema": "brickwright.installed-asset-refusal.v1",
        "status": "partial", "refusal": code,
        "candidate_output_bytes": length, "candidate_output_sha256": digest,
        "map_body_retained": false, "actual_app_qualified": false
    })).unwrap_or_else(|_| br#"{"schema":"brickwright.installed-asset-refusal.v1","status":"partial","refusal":"refusal-serialization"}"#.to_vec())
}

// No runtime trigger exists on desktop, devices or development builds.
#[cfg(all(target_os = "ios", target_abi = "sim", not(dev)))]
pub(crate) fn observe<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use std::{fs::OpenOptions, io::Write, time::Instant};
    let Some(path) = std::env::var_os("BW_EMBEDDED_ASSET_AUDIT_PATH") else {
        return;
    };
    // create_new refuses an existing target, including a symlink. No overwrites.
    let Ok(mut file) = OpenOptions::new().write(true).create_new(true).open(path) else {
        return;
    };
    let started = Instant::now();
    let resolver = app.asset_resolver();
    let observation = collect(
        resolver.iter(),
        |key| {
            resolver.get(key).map(|asset| Served {
                bytes: asset.bytes,
                csp_header: asset.csp_header,
            })
        },
        || started.elapsed().as_nanos().min(u64::MAX as u128) as u64,
    );
    let config = serde_json::to_vec(app.config()).ok();
    let projection = asset_config_projection(config.as_deref());
    let envelope = serde_json::json!({
        "schema": "brickwright.installed-asset-envelope.v2",
        "observation": observation,
        "asset_config_projection": projection,
        "source_label": option_env!("GITHUB_SHA"),
        "source_label_is_build_proof": false,
        "effective_config_sha256": config.map(|bytes| format!("{:x}", Sha256::digest(bytes))),
        "base_config_sha256": format!("{:x}", Sha256::digest(include_bytes!("../tauri.conf.json"))),
        "executable_and_artifact_join": "required-external-independent-qualification",
        "development_filesystem_fallback": false,
        "resolver_internal_fallback_excluded": false,
        "signed_target_map_joined": false,
        "resource_and_process_lifetime_admitted": false
    });
    let bytes = encode_envelope(&envelope);
    let _ = file.write_all(&bytes).and_then(|_| file.sync_all());
}

#[cfg(test)]
mod tests {
    use super::*;
    fn typed_config() -> serde_json::Value {
        serde_json::json!({
            "build": {"devUrl": null, "frontendDist": "AUTHORED-PRIVATE-PATH"},
            "app": {"windows": [{"width": 1280.0}], "security": {
                "csp": null, "devCsp": null, "pattern": {"use": "brownfield"},
                "freezePrototype": false, "dangerousDisableAssetCspModification": false,
                "assetProtocol": {"enable": false, "scope": ["AUTHORED-PRIVATE-PATH"]}
            }},
            "plugins": {"authored": "AUTHORED-PRIVATE-TOKEN"}
        })
    }

    #[test]
    fn runtime_config_projection_is_narrow_and_private_values_are_not_emitted() {
        let raw = serde_json::to_vec(&typed_config()).unwrap();
        let result = asset_config_projection(Some(&raw));
        assert_eq!(result.status, "complete-projection-only");
        assert!(result.refusal.is_none());
        assert_eq!(
            result.runtime_config_sha256,
            Some(format!("{:x}", Sha256::digest(&raw)))
        );
        let output = String::from_utf8(serde_json::to_vec(&result).unwrap()).unwrap();
        assert!(!output.contains("AUTHORED-PRIVATE"));
        assert!(
            !result.full_configuration_joined
                && !result.raw_configuration_exposed
                && !result.compiler_inputs_proved
        );
        let values = result.values.unwrap();
        assert!(values.csp_absent && values.dev_csp_absent && values.dev_url_absent);
        assert_eq!(values.pattern, "brownfield");
        assert!(
            !values.freeze_prototype
                && !values.disable_asset_csp_modification
                && !values.asset_protocol_enabled
        );
    }

    #[test]
    fn runtime_config_projection_preserves_unsupported_profiles_as_refusals() {
        for (pointer, replacement) in [
            (
                "/build/devUrl",
                serde_json::json!("https://authored.invalid"),
            ),
            ("/app/security/csp", serde_json::json!("default-src 'none'")),
            (
                "/app/security/devCsp",
                serde_json::json!({"default-src": ["'none'"]}),
            ),
            (
                "/app/security/pattern",
                serde_json::json!({"use": "isolation"}),
            ),
            ("/app/security/freezePrototype", serde_json::json!(true)),
            (
                "/app/security/dangerousDisableAssetCspModification",
                serde_json::json!([]),
            ),
            (
                "/app/security/assetProtocol/enable",
                serde_json::json!(true),
            ),
        ] {
            let mut config = typed_config();
            *config.pointer_mut(pointer).unwrap() = replacement;
            let result = asset_config_projection(Some(&serde_json::to_vec(&config).unwrap()));
            assert_eq!(result.status, "partial", "{pointer}");
            assert!(result.refusal.is_some() && result.values.is_none());
        }
    }

    #[test]
    fn runtime_config_projection_refuses_missing_malformed_and_over_budget_inputs() {
        for raw in [None, Some(&b"not json"[..]), Some(&b"{}"[..])] {
            let result = asset_config_projection(raw);
            assert_eq!(result.status, "partial");
            assert!(result.refusal.is_some() && result.values.is_none());
        }
        let raw = vec![b' '; CONFIG_BYTES + 1];
        let result = asset_config_projection(Some(&raw));
        assert_eq!(result.refusal, Some("config-byte-budget"));
        assert!(result.runtime_config_sha256.is_none());
        let mut config = typed_config();
        config["app"]["security"]
            .as_object_mut()
            .unwrap()
            .remove("freezePrototype");
        assert_eq!(
            asset_config_projection(Some(&serde_json::to_vec(&config).unwrap())).status,
            "partial"
        );
    }

    #[test]
    fn envelope_output_budget_is_an_explicit_refusal_not_a_truncated_success() {
        let small = serde_json::json!({"authored": true});
        assert_eq!(encode_envelope(&small), serde_json::to_vec(&small).unwrap());
        let large = serde_json::json!({"authored": "x".repeat(OUTPUT_BYTES)});
        let original = serde_json::to_vec(&large).unwrap();
        let encoded = encode_envelope(&large);
        assert!(encoded.len() <= OUTPUT_BYTES);
        let refusal: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(refusal["schema"], "brickwright.installed-asset-refusal.v1");
        assert_eq!(refusal["refusal"], "envelope-output-budget");
        assert_eq!(refusal["candidate_output_bytes"], original.len());
        assert_eq!(
            refusal["candidate_output_sha256"],
            format!("{:x}", Sha256::digest(&original))
        );
        assert_eq!(refusal["map_body_retained"], false);
        assert_eq!(refusal["actual_app_qualified"], false);
    }

    fn assets(
        rows: &[(&'static str, &'static [u8])],
    ) -> impl Iterator<Item = (Cow<'static, str>, Cow<'static, [u8]>)> {
        rows.iter()
            .map(|(key, bytes)| (Cow::Borrowed(*key), Cow::Borrowed(*bytes)))
            .collect::<Vec<_>>()
            .into_iter()
    }
    #[test]
    fn actual_storage_and_served_bytes_are_separate_sorted_observations() {
        let r = collect(
            assets(&[("/z.js", b"compressed"), ("/index.html", b"stored")]),
            |key| {
                Some(Served {
                    bytes: key.into_bytes(),
                    csp_header: Some("script-src 'self'".into()),
                })
            },
            || 0,
        );
        assert_eq!(r.status, "complete-observation-only");
        assert_eq!(r.completed_entries[0].key, "/index.html");
        assert_ne!(
            r.completed_entries[0].embedded_sha256,
            r.completed_entries[0].served_sha256
        );
        assert!(r.completed_entries[0].csp_header_sha256.is_some());
        assert!(
            !r.original_web_identity_proved
                && !r.signed_map_identity_proved
                && !r.callback_lifetime_bounded
        );
        assert!(serde_json::to_vec(&r).unwrap().len() <= OUTPUT_BYTES);
    }
    #[test]
    fn invalid_aliases_duplicates_and_empty_maps_refuse_before_lookup() {
        for key in [
            "",
            "/",
            "index.html",
            "//a",
            "/a/../b",
            "/a%20b",
            "/a?x",
            "/a#x",
            "/a\\b",
            "/a\n",
        ] {
            let r = collect(
                assets(&[(key, b"")]),
                |_| panic!("no lookup for invalid key"),
                || 0,
            );
            assert_eq!(r.refusal, Some("entry-count-key-or-duplicate"));
        }
        let r = collect(
            assets(&[("/a", b"x"), ("/a", b"y")]),
            |_| panic!("duplicate"),
            || 0,
        );
        assert_eq!(r.refusal, Some("entry-count-key-or-duplicate"));
        assert_eq!(
            collect(assets(&[]), |_| None, || 0).refusal,
            Some("empty-embedded-map")
        );
    }
    #[test]
    fn missing_lookup_preserves_partial_rows_and_refuses() {
        let r = collect(
            assets(&[("/b", b"x"), ("/a", b"x")]),
            |key| {
                (key == "/a").then(|| Served {
                    bytes: b"actual".to_vec(),
                    csp_header: None,
                })
            },
            || 0,
        );
        assert_eq!(r.refusal, Some("enumerated-key-not-served"));
        assert_eq!(r.completed_entries.len(), 1);
        assert_eq!(r.completed_entries[0].key, "/a");
    }
    #[test]
    fn deadline_and_reversal_refuse_including_after_real_lookup_return() {
        let mut n = 0;
        let r = collect(
            assets(&[("/a", b"x")]),
            |_| {
                Some(Served {
                    bytes: vec![],
                    csp_header: None,
                })
            },
            || {
                n += 1;
                if n > 4 {
                    DEADLINE_NS + 1
                } else {
                    0
                }
            },
        );
        assert_eq!(r.refusal, Some("clock-reversed-or-deadline"));
        let mut ticks = [2, 1].into_iter();
        assert_eq!(
            collect(
                assets(&[("/a", b"x")]),
                |_| None,
                || ticks.next().unwrap_or(1)
            )
            .refusal,
            Some("clock-reversed-or-deadline")
        );
    }
    #[test]
    fn entry_and_file_caps_refuse_before_unadmitted_lookup_or_hash() {
        let rows = (0..=ENTRIES).map(|n| (Cow::Owned(format!("/{n}")), Cow::Borrowed(&b""[..])));
        let r = collect(rows, |_| panic!("entry cap must precede lookup"), || 0);
        assert_eq!(r.refusal, Some("entry-count-key-or-duplicate"));
        assert_eq!(r.embedded_entries.len(), ENTRIES);
        let rows = std::iter::once((Cow::Borrowed("/a"), Cow::Owned(vec![0; FILE_BYTES + 1])));
        assert_eq!(
            collect(rows, |_| panic!("embedded cap"), || 0).refusal,
            Some("embedded-byte-budget")
        );
        let r = collect(
            assets(&[("/a", b"")]),
            |_| {
                Some(Served {
                    bytes: vec![0; FILE_BYTES + 1],
                    csp_header: None,
                })
            },
            || 0,
        );
        assert_eq!(r.refusal, Some("served-byte-budget"));
    }
    #[test]
    fn output_cap_accounts_for_complete_embedded_inventory_and_partial_served_rows() {
        let rows = (0..ENTRIES).map(|n| {
            (
                Cow::Owned(format!("/{n:08}{}", "x".repeat(490))),
                Cow::Borrowed(&b""[..]),
            )
        });
        let r = collect(
            rows,
            |_| {
                Some(Served {
                    bytes: b"observed".to_vec(),
                    csp_header: None,
                })
            },
            || 0,
        );
        assert_eq!(r.refusal, Some("output-byte-budget"));
        assert_eq!(r.embedded_entries.len(), ENTRIES);
        assert!(!r.completed_entries.is_empty() && r.completed_entries.len() < ENTRIES);
        assert!(serde_json::to_vec(&r).unwrap().len() <= OUTPUT_BYTES);
    }
    #[test]
    fn keys_csp_and_partial_inventory_remain_bounded() {
        let key = format!("/{}", "x".repeat(KEY_BYTES));
        let r = collect(
            std::iter::once((Cow::Owned(key), Cow::Borrowed(&b""[..]))),
            |_| panic!("key cap"),
            || 0,
        );
        assert_eq!(r.refusal, Some("entry-count-key-or-duplicate"));
        let r = collect(
            assets(&[("/a", b"x")]),
            |_| {
                Some(Served {
                    bytes: vec![],
                    csp_header: Some("x".repeat(8193)),
                })
            },
            || 0,
        );
        assert_eq!(r.refusal, Some("csp-header-budget"));
        assert_eq!(r.embedded_entries.len(), 1);
        assert_eq!(r.embedded_entries[0].key, "/a");
        assert!(r.completed_entries.is_empty());
    }
    #[test]
    fn hash_is_not_a_filename_or_length_placeholder() {
        let r = collect(
            assets(&[("/a", b"a")]),
            |_| {
                Some(Served {
                    bytes: b"abc".to_vec(),
                    csp_header: None,
                })
            },
            || 0,
        );
        assert_eq!(
            r.completed_entries[0].served_sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
