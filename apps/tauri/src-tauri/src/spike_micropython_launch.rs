// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//! Native-only direct application startup. No firmware is bundled or fetched.
use crate::renode_supervisor::{sha256, verify_micropython_manifest, SpikeTopology};
use crate::spike_local_image::{admit_raw, AdmittedImage};
use crate::spike_staged_image::StagedImage;
use serde_json::json;
use std::path::{Path, PathBuf};

/// Selected by native build pins, never by an editor or image DTO. The digest
/// binds the compiled-model platform/model contract as well as its runtime.
#[derive(Clone, Default)]
pub(crate) enum MicroPythonModels {
    #[default]
    SourceOverlay,
    Compiled { profile_sha256: String, runtime_sha256: String },
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompiledProfile {
    schema_version: u32,
    kind: String,
    runtime_sha256: String,
    platform_source_commit: String,
    model_contract_commit: String,
}

fn lowercase_digest(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

impl MicroPythonModels {
    pub(crate) fn from_package_pins() -> Result<Self, String> {
        match option_env!("BW_RENODE_MICROPYTHON_PROFILE_SHA256") {
            None => Ok(Self::SourceOverlay),
            Some(profile) => {
                let runtime = option_env!("BW_RENODE_SHA256").ok_or("compiled model runtime pin unavailable")?;
                if !lowercase_digest(profile, 64) || !lowercase_digest(runtime, 64) {
                    return Err("compiled model pins invalid".into());
                }
                Ok(Self::Compiled { profile_sha256: profile.into(), runtime_sha256: runtime.into() })
            }
        }
    }

    fn verify(&self, root: &Path) -> Result<(), String> {
        let path = root.join("profile.json");
        match self {
            Self::SourceOverlay => {
                // A compiled package must never fall back to the overlay path
                // when its native profile pin was omitted from the build.
                if path.try_exists().map_err(|_| "model profile unavailable")? {
                    return Err("compiled model profile requires a native package pin".into());
                }
            }
            Self::Compiled { profile_sha256, runtime_sha256 } => {
                let manifest: serde_json::Value = serde_json::from_slice(
                    &std::fs::read(root.join("manifest.json")).map_err(|_| "model manifest unavailable")?
                ).map_err(|_| "model manifest invalid")?;
                if manifest.get("profile.json").and_then(|v| v.as_str()) != Some(profile_sha256.as_str()) {
                    return Err("compiled model descriptor missing from support closure".into());
                }
                if !lowercase_digest(profile_sha256, 64) || !lowercase_digest(runtime_sha256, 64)
                    || sha256(&path).map_err(|_| "compiled model profile unavailable")? != *profile_sha256
                    || std::fs::metadata(&path).map_err(|_| "compiled model profile unavailable")?.len() > 4096
                {
                    return Err("compiled model profile pin mismatch".into());
                }
                let profile: CompiledProfile = serde_json::from_slice(
                    &std::fs::read(path).map_err(|_| "compiled model profile unavailable")?
                ).map_err(|_| "compiled model profile invalid")?;
                if profile.schema_version != 1 || profile.kind != "compiled-prime-models/v1"
                    || profile.runtime_sha256 != *runtime_sha256
                    || !lowercase_digest(&profile.platform_source_commit, 40)
                    || !lowercase_digest(&profile.model_contract_commit, 40)
                {
                    return Err("compiled model runtime/contract mismatch".into());
                }
            }
        }
        Ok(())
    }
}

#[derive(Clone)]
pub(crate) struct MicroPythonRecipe {
    root: PathBuf,
    manifest_hash: String,
    staging_root: PathBuf,
    admitted: AdmittedImage,
    topology: SpikeTopology,
    models: MicroPythonModels,
}
static UART_GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
impl MicroPythonRecipe {
    pub(crate) fn new(
        root: PathBuf,
        manifest_hash: String,
        staging_root: PathBuf,
        admitted: AdmittedImage,
    ) -> Self {
        Self { root, manifest_hash, staging_root, admitted, topology: SpikeTopology::Default,
            models: MicroPythonModels::SourceOverlay }
    }

    pub(crate) fn with_models(mut self, models: MicroPythonModels) -> Self {
        self.models = models;
        self
    }

    pub(crate) fn with_topology(mut self, topology: SpikeTopology) -> Self {
        self.topology = topology;
        self
    }
    pub(crate) fn topology(&self) -> SpikeTopology { self.topology }

    pub(crate) fn plan(&self) -> Result<MicroPythonLaunch, String> {
        use std::sync::atomic::Ordering;
        let mut generation = UART_GENERATION.load(Ordering::Acquire);
        loop {
            if generation >= 9_007_199_254_740_991 {
                return Err("native UART generations exhausted".into());
            }
            match UART_GENERATION.compare_exchange_weak(
                generation, generation + 1, Ordering::AcqRel, Ordering::Acquire,
            ) {
                Ok(_) => break,
                Err(current) => generation = current,
            }
        }
        MicroPythonLaunch::create_with_models(
            &self.root, &self.manifest_hash, &self.staging_root, &self.admitted, generation, self.topology,
            self.models.clone(),
        )
    }
}

pub(crate) struct MicroPythonLaunch {
    generation: u64,
    root: PathBuf,
    manifest_hash: String,
    arguments: Vec<String>,
    image: StagedImage,
    config: StagedImage,
    models: MicroPythonModels,
}
fn monitor_path(path: &Path) -> Result<String, String> {
    let path = path.to_str().ok_or("launch path is not UTF-8")?;
    if path.len() > 2048
        || path
            .chars()
            .any(|c| c.is_control() || matches!(c, ';' | '\'' | '"' | '\\'))
    {
        return Err("launch path is not monitor-safe".into());
    }
    Ok(format!("@{}", path.replace(' ', "\\ ")))
}
// Avoid embedding path text in Python/monitor string literals. Only numeric
// Unicode code points appear in this fixed expression, including for spaces.
fn python_path(path: &Path) -> Result<String, String> {
    let value = path.to_str().ok_or("launch path is not UTF-8")?;
    if value.chars().count() > 1024 {
        return Err("launch path exceeds bounds".into());
    }
    Ok(format!(
        "u''.join(map(unichr,[{}]))",
        value
            .chars()
            .map(|c| (c as u32).to_string())
            .collect::<Vec<_>>()
            .join(",")
    ))
}
impl MicroPythonLaunch {
    /// The owner supplies native package pins and a private staging root;
    /// none of these arguments are editor/broker DTOs.
    #[allow(dead_code)]
    pub(crate) fn create(
        root: &Path,
        manifest_hash: &str,
        staging_root: &Path,
        admitted: &AdmittedImage,
        generation: u64,
    ) -> Result<Self, String> {
        Self::create_with_topology(root, manifest_hash, staging_root, admitted, generation, SpikeTopology::Default)
    }

    pub(crate) fn create_with_topology(
        root: &Path, manifest_hash: &str, staging_root: &Path,
        admitted: &AdmittedImage, generation: u64, topology: SpikeTopology,
    ) -> Result<Self, String> {
        Self::create_with_models(root, manifest_hash, staging_root, admitted, generation,
            topology, MicroPythonModels::SourceOverlay)
    }

    fn create_with_models(
        root: &Path, manifest_hash: &str, staging_root: &Path,
        admitted: &AdmittedImage, generation: u64, topology: SpikeTopology, models: MicroPythonModels,
    ) -> Result<Self, String> {
        if !(1..=9_007_199_254_740_991).contains(&generation) {
            return Err("invalid native UART generation".into());
        }
        // Initial supported profile is a raw application based at 0x08010000.
        // Re-admit canonical bytes so mutable struct fields cannot forge vectors.
        if admitted.load_address != 0x08010000
            || admit_raw(&admitted.bytes).as_ref() != Ok(admitted)
        {
            return Err("unsupported MicroPython application geometry".into());
        }
        let root = root
            .canonicalize()
            .map_err(|_| "MicroPython package unavailable")?;
        check_assets(&root, manifest_hash, &models)?;
        let image = StagedImage::create(staging_root, &admitted.bytes)
            .map_err(|_| "image staging failed")?;
        let mut state_config = json!({
            "identity":{"board":"spike-prime","firmware":"micropython-prime","transport":"none","imageSha256":image.image_sha256()},
            "paths":{"programUart":"external:programUart","portA":"external:portA","portB":"external:portB","portC":"external:portC","portD":"external:portD","portE":"external:portE","portF":"external:portF","storage":"machine:sysbus.spi2.primeStorageMux.primeStorage","display":"machine:sysbus.spi1.display","imu":"machine:sysbus.i2c2.imu","speaker":"machine:sysbus.speaker","leftButton":"machine:sysbus.leftButton","centerButton":"machine:sysbus.centerButton","rightButton":"machine:sysbus.rightButton","bluetoothButton":"machine:sysbus.bluetoothButton"},
            "programUartGeneration":generation,"socketTimeoutSeconds":30
        });
        if topology == SpikeTopology::SixMotors { state_config["motorPorts"] = json!(6); }
        let config_bytes = serde_json::to_vec(&state_config).map_err(|_| "state configuration unavailable")?;
        let config = StagedImage::create(staging_root, &config_bytes)
            .map_err(|_| "configuration staging failed")?;
        let mut commands = Vec::new();
        if matches!(models, MicroPythonModels::SourceOverlay) {
            commands.push(format!("include {}", monitor_path(&root.join("models.cs"))?));
        }
        commands.extend(vec![
            format!("include {}",monitor_path(&root.join("program-uart.cs"))?),
            "mach create".into(),
            format!("machine LoadPlatformDescription {}",monitor_path(&root.join("platforms/boards/spike-prime.repl"))?),
            "emulation CreatePrimeElectricalPorts \"machine-0\"".into(),
            format!("sysbus LoadBinary {} 0x08010000",monitor_path(image.path())?),
            format!("python \"from System import Array, Byte; b=bytearray(open({},'rb').read()); self.Machine['sysbus.spi2.primeStorageMux.primeStorage'].UnderlyingMemory.WriteBytes(0x100000,Array[Byte](b),len(b))\"",python_path(&root.join("boot-seed.bin"))?),
            format!("python \"from System import AppDomain, Activator, Array, Object, Int64; types=[a.GetType('Antmicro.Renode.Tools.BrickwrightProgramUart') for a in AppDomain.CurrentDomain.GetAssemblies()]; t=next(t for t in types if t is not None); p=Activator.CreateInstance(t,Array[Object]([Int64({generation})])); emulationManager.CurrentEmulation.ExternalsManager.AddExternal(p,'programUart'); p.AttachTo(self.Machine['sysbus.usart2'])\""),
            "cpu VectorTableOffset 0x08010000".into(),
            format!("cpu SP {}",admitted.stack_pointer),format!("cpu PC {}",admitted.reset_pc),
            "python \"from Antmicro.Renode.Peripherals.CPU import RegisterValue; self.Machine['sysbus.cpu'].SetRegister(0,RegisterValue.Create(1,32))\"".into(),
            "emulation RunFor \"1\"".into(),
            "machine StartGdbServer {BW_GDB_PORT}".into(),
            format!("include {}",monitor_path(&root.join("scripts/spike-state-server.py"))?),
            format!("spike_state_start \"127.0.0.1\" {{BW_STATE_PORT}} {}",monitor_path(config.path())?),
            "start".into(),
        ]);
        if topology == SpikeTopology::SixMotors {
            let load = commands.iter().position(|c| c.starts_with("sysbus LoadBinary "))
                .ok_or("application load command unavailable")?;
            commands.splice(load..load, ['C','D','E','F'].into_iter()
                .map(|port| format!("port{port} Attach \"motor\"")));
        }
        let mut arguments = vec![
            "--disable-gui".into(),
            "--hide-log".into(),
            "-P".into(),
            "{BW_MONITOR_PORT}".into(),
        ];
        for command in commands {
            arguments.extend(["-e".into(), command]);
        }
        Ok(Self {
            generation,
            root,
            manifest_hash: manifest_hash.into(),
            arguments,
            image,
            config,
            models,
        })
    }
    pub(crate) fn identity(&self) -> (String,u64) {
        (self.image.image_sha256().into(),self.generation)
    }
    pub(crate) fn into_parts(self) -> Result<(PathBuf, Vec<String>, Vec<StagedImage>), String> {
        check_assets(&self.root, &self.manifest_hash, &self.models)?;
        self.image.verify().map_err(|_| "staged image changed")?;
        self.config
            .verify()
            .map_err(|_| "staged configuration changed")?;
        Ok((self.root, self.arguments, vec![self.image, self.config]))
    }
}
fn check_assets(root: &Path, expected: &str, models: &MicroPythonModels) -> Result<(), String> {
    if expected.len() != 64
        || !expected.bytes().all(|b| b.is_ascii_hexdigit())
        || sha256(&root.join("manifest.json")).map_err(|_| "package manifest unavailable")?
            != expected
    {
        return Err("MicroPython package pin mismatch".into());
    }
    verify_micropython_manifest(root, &root.join("manifest.json"))?;
    models.verify(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn monitor_paths_refuse_interpreted_characters_and_support_spaces() {
        assert_eq!(
            monitor_path(Path::new("/native/app data/image.bin")).unwrap(),
            "@/native/app\\ data/image.bin"
        );
        for path in ["/x;quit", "/x\ny", "/x'y", "/x\"y", "/x\\y"] {
            assert!(monitor_path(Path::new(path)).is_err());
        }
        assert_eq!(
            python_path(Path::new("/a b")).unwrap(),
            "u''.join(map(unichr,[47,97,32,98]))"
        );
    }
    #[cfg(unix)]
    #[test]
    fn assets_identity_and_configuration_are_owned_and_rechecked() {
        use std::os::unix::fs::PermissionsExt;
        let mut random = [0u8; 8];
        getrandom::getrandom(&mut random).unwrap();
        let root =
            std::env::temp_dir().join(format!("bw-micro-plan-{:x}", u64::from_le_bytes(random)));
        std::fs::create_dir(&root).unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        let assets = root.join("assets");
        let staging = root.join("staging");
        std::fs::create_dir(&assets).unwrap();
        std::fs::create_dir(&staging).unwrap();
        std::fs::set_permissions(&staging, std::fs::Permissions::from_mode(0o700)).unwrap();
        let names = [
            "models.cs",
            "program-uart.cs",
            "boot-seed.bin",
            "platforms/boards/spike-prime.repl",
            "platforms/boards/spike-prime-brick-devices.repl",
            "platforms/cpus/stm32f413vg.repl",
            "platforms/cpus/stm32f4.repl",
            "scripts/spike-state-server.py",
            "tools/spike_state_monitor_protocol.py",
            "tools/ev3_state_observer.py",
            "tools/spike_arena_inputs.py",
            "tools/spike_arena_mailbox.py",
            "tools/spike_nuttx_mailbox.py",
            "tools/spike_program_uart.py",
            "licenses/renode-models-MIT.txt",
            "licenses/brickwright-BSD-3-Clause.txt",
        ];
        let mut manifest = serde_json::Map::new();
        for name in names {
            let file = assets.join(name);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(
                &file,
                if name == "boot-seed.bin" {
                    vec![0; 65536]
                } else {
                    b"synthetic fixture".to_vec()
                },
            )
            .unwrap();
            manifest.insert(name.into(), sha256(&file).unwrap().into());
        }
        std::fs::write(
            assets.join("manifest.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        let pin = sha256(&assets.join("manifest.json")).unwrap();
        let mut bytes = Vec::new();
        bytes.extend(0x2004fff8u32.to_le_bytes());
        bytes.extend(0x08010009u32.to_le_bytes());
        bytes.extend([0, 0]);
        let admitted = admit_raw(&bytes).unwrap();
        for generation in [0, 9_007_199_254_740_992] {
            assert!(
                MicroPythonLaunch::create(&assets, &pin, &staging, &admitted, generation).is_err()
            );
        }
        let mut forged = admitted.clone();
        forged.reset_pc += 2;
        assert!(MicroPythonLaunch::create(&assets, &pin, &staging, &forged, 7).is_err());
        assert!(
            MicroPythonLaunch::create(&assets, &"0".repeat(64), &staging, &admitted, 7).is_err()
        );
        let recipe=MicroPythonRecipe::new(assets.clone(),pin.clone(),staging.clone(),admitted.clone());
        let first=recipe.plan().unwrap();let second=recipe.plan().unwrap();
        assert_ne!(first.identity().1,second.identity().1);
        assert_eq!(first.identity().0,second.identity().0);
        drop((first,second));
        let plan = MicroPythonLaunch::create(&assets, &pin, &staging, &admitted, 7).unwrap();
        let config: serde_json::Value =
            serde_json::from_slice(&std::fs::read(plan.config.path()).unwrap()).unwrap();
        assert_eq!(config["identity"]["imageSha256"], plan.image.image_sha256());
        assert_eq!(config["programUartGeneration"], 7);
        let image_path = plan.image.path().to_owned();
        let config_path = plan.config.path().to_owned();
        let (_, args, files) = plan.into_parts().unwrap();
        assert_eq!(files.len(), 2);
        let six_recipe=recipe.clone().with_topology(SpikeTopology::SixMotors);
        let six_first=six_recipe.plan().unwrap();let six_second=six_recipe.plan().unwrap();
        assert_eq!(six_recipe.topology(),SpikeTopology::SixMotors);
        assert_ne!(six_first.identity().1,six_second.identity().1);
        let config:serde_json::Value=serde_json::from_slice(&std::fs::read(six_first.config.path()).unwrap()).unwrap();
        assert_eq!(config["motorPorts"],6);
        let commands=&six_first.arguments;
        let create=commands.iter().position(|c|c.contains("CreatePrimeElectricalPorts")).unwrap();
        let load=commands.iter().position(|c|c.starts_with("sysbus LoadBinary")).unwrap();
        for port in ['C','D','E','F'] {
            let attach=commands.iter().position(|c|c==&format!("port{port} Attach \"motor\"")).unwrap();
            assert!(create<attach && attach<load);
        }
        drop((six_first,six_second));

        assert!(args.iter().any(|s| s.contains("{BW_STATE_PORT}")));
        assert!(image_path.exists() && config_path.exists());
        drop(files);
        assert!(!image_path.exists() && !config_path.exists());

        // Authored support/runtime contracts exercise the actual planner. They
        // do not stand in for an installed runtime or application execution.
        let profile = json!({
            "schemaVersion": 1, "kind": "compiled-prime-models/v1",
            "runtimeSha256": "a".repeat(64), "platformSourceCommit": "b".repeat(40),
            "modelContractCommit": "c".repeat(40)
        });
        let profile_path = assets.join("profile.json");
        std::fs::write(&profile_path, serde_json::to_vec(&profile).unwrap()).unwrap();
        let profile_pin = sha256(&profile_path).unwrap();
        let models = MicroPythonModels::Compiled {
            profile_sha256: profile_pin.clone(), runtime_sha256: "a".repeat(64),
        };
        // Descriptor presence alone cannot enable the compiled route; it must
        // be in the sealed manifest and selected by native package pins.
        assert!(recipe.clone().with_models(models.clone()).plan().is_err());
        assert!(recipe.plan().is_err());
        manifest.insert("profile.json".into(), profile_pin.clone().into());
        std::fs::write(assets.join("manifest.json"), serde_json::to_vec(&manifest).unwrap()).unwrap();
        let compiled_pin = sha256(&assets.join("manifest.json")).unwrap();
        let compiled_recipe = MicroPythonRecipe::new(assets.clone(), compiled_pin.clone(), staging.clone(), admitted.clone())
            .with_models(models.clone()).with_topology(SpikeTopology::SixMotors);
        let compiled = compiled_recipe.plan().unwrap();
        assert!(!compiled.arguments.iter().any(|c| c.starts_with("include ") && c.ends_with("/models.cs")));
        assert!(compiled.arguments.iter().any(|c| c.starts_with("include ") && c.ends_with("/program-uart.cs")));
        let create = compiled.arguments.iter().position(|c| c.contains("CreatePrimeElectricalPorts")).unwrap();
        let load = compiled.arguments.iter().position(|c| c.starts_with("sysbus LoadBinary ")).unwrap();
        for port in ['C', 'D', 'E', 'F'] {
            let attach = compiled.arguments.iter().position(|c| c == &format!("port{port} Attach \"motor\"")).unwrap();
            assert!(create < attach && attach < load);
        }
        let compiled_identity = compiled.identity();
        let fresh = compiled_recipe.plan().unwrap();
        assert_eq!(compiled_identity.0, fresh.identity().0);
        assert_ne!(compiled_identity.1, fresh.identity().1);
        drop(fresh);
        let wrong_runtime = MicroPythonModels::Compiled { profile_sha256: profile_pin, runtime_sha256: "d".repeat(64) };
        assert!(compiled_recipe.clone().with_models(wrong_runtime).plan().is_err());
        assert!(MicroPythonLaunch::create(&assets, &compiled_pin, &staging, &admitted, 7).is_err());
        for defect in ["unknown field", "wrong kind", "wrong version", "invalid source commit"] {
            let mut invalid = profile.clone();
            match defect {
                "unknown field" => invalid["includeModels"] = json!(true),
                "wrong kind" => invalid["kind"] = json!("source-overlay"),
                "wrong version" => invalid["schemaVersion"] = json!(2),
                _ => invalid["platformSourceCommit"] = json!("not-a-commit"),
            }
            std::fs::write(&profile_path, serde_json::to_vec(&invalid).unwrap()).unwrap();
            let bad_profile_pin = sha256(&profile_path).unwrap();
            manifest.insert("profile.json".into(), bad_profile_pin.clone().into());
            std::fs::write(assets.join("manifest.json"), serde_json::to_vec(&manifest).unwrap()).unwrap();
            let bad_pin = sha256(&assets.join("manifest.json")).unwrap();
            let bad_recipe = MicroPythonRecipe::new(assets.clone(), bad_pin, staging.clone(), admitted.clone())
                .with_models(MicroPythonModels::Compiled {
                    profile_sha256: bad_profile_pin, runtime_sha256: "a".repeat(64),
                });
            assert!(bad_recipe.plan().is_err(), "{defect} admitted");
        }
        std::fs::write(&profile_path, serde_json::to_vec(&profile).unwrap()).unwrap();
        manifest.insert("profile.json".into(), sha256(&profile_path).unwrap().into());
        std::fs::write(assets.join("manifest.json"), serde_json::to_vec(&manifest).unwrap()).unwrap();
        std::fs::write(&profile_path, b"changed profile").unwrap();
        assert!(compiled.into_parts().is_err());
        assert!(compiled_recipe.plan().is_err());
        assert_eq!(std::fs::read_dir(&staging).unwrap().count(), 0);
        std::fs::remove_file(profile_path).unwrap();
        manifest.remove("profile.json");
        std::fs::write(assets.join("manifest.json"), serde_json::to_vec(&manifest).unwrap()).unwrap();
        assert_eq!(sha256(&assets.join("manifest.json")).unwrap(), pin);

        let plan = MicroPythonLaunch::create(&assets, &pin, &staging, &admitted, 7).unwrap();
        std::fs::write(plan.config.path(), b"changed configuration").unwrap();
        assert!(plan.into_parts().is_err());
        let plan = MicroPythonLaunch::create(&assets, &pin, &staging, &admitted, 7).unwrap();
        std::fs::write(assets.join("models.cs"), b"changed model").unwrap();
        assert!(plan.into_parts().is_err());
        assert!(MicroPythonLaunch::create(&assets, &pin, &staging, &admitted, 7).is_err());
        assert_eq!(std::fs::read_dir(&staging).unwrap().count(), 0);
    }
}
