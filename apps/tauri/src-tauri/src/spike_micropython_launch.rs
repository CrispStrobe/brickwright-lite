// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//! Native-only direct application startup. No firmware is bundled or fetched.
use crate::renode_supervisor::{sha256, verify_micropython_manifest, SpikeTopology};
use crate::spike_local_image::{admit_raw, AdmittedImage};
use crate::spike_staged_image::StagedImage;
use serde_json::json;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub(crate) struct MicroPythonRecipe {
    root: PathBuf,
    manifest_hash: String,
    staging_root: PathBuf,
    admitted: AdmittedImage,
    topology: SpikeTopology,
}
static UART_GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
impl MicroPythonRecipe {
    pub(crate) fn new(
        root: PathBuf,
        manifest_hash: String,
        staging_root: PathBuf,
        admitted: AdmittedImage,
    ) -> Self {
        Self { root, manifest_hash, staging_root, admitted, topology: SpikeTopology::Default }
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
        MicroPythonLaunch::create_with_topology(
            &self.root, &self.manifest_hash, &self.staging_root, &self.admitted, generation, self.topology,
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
        check_assets(&root, manifest_hash)?;
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
        let mut commands = vec![
            format!("include {}",monitor_path(&root.join("models.cs"))?),
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
        ];
        if topology == SpikeTopology::SixMotors {
            commands.splice(5..5, ['C','D','E','F'].into_iter()
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
        })
    }
    pub(crate) fn identity(&self) -> (String,u64) {
        (self.image.image_sha256().into(),self.generation)
    }
    pub(crate) fn into_parts(self) -> Result<(PathBuf, Vec<String>, Vec<StagedImage>), String> {
        check_assets(&self.root, &self.manifest_hash)?;
        self.image.verify().map_err(|_| "staged image changed")?;
        self.config
            .verify()
            .map_err(|_| "staged configuration changed")?;
        Ok((self.root, self.arguments, vec![self.image, self.config]))
    }
}
fn check_assets(root: &Path, expected: &str) -> Result<(), String> {
    if expected.len() != 64
        || !expected.bytes().all(|b| b.is_ascii_hexdigit())
        || sha256(&root.join("manifest.json")).map_err(|_| "package manifest unavailable")?
            != expected
    {
        return Err("MicroPython package pin mismatch".into());
    }
    verify_micropython_manifest(root, &root.join("manifest.json"))
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
