//! Bounded native Renode process ownership.
//!
//! This module deliberately exposes no Tauri command. CP04 establishes the
//! process boundary; CP05 attaches the already-isolated semantic broker to it.
//! The executable and digest are host/build inputs, never editor arguments.

use command_group::CommandGroup;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read};
use std::net::{Ipv4Addr, TcpListener};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const MAX_SESSION_TIME: Duration = Duration::from_secs(120);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TeardownReason {
    Reset,
    ProjectClose,
    AppExit,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RenodeEndpoint {
    /// Renode monitor endpoint. It remains native-only and is never returned
    /// through the capability broker.
    pub(crate) port: u16,
    pub(crate) gdb_port: u16,
    pub(crate) state_port: u16,
    token: String,
    uart_evidence: Option<PathBuf>,
}

impl RenodeEndpoint {
    #[cfg(test)]
    pub(crate) fn token(&self) -> &str {
        &self.token
    }

    pub(crate) fn uart_evidence(&self) -> Option<&Path> {
        self.uart_evidence.as_deref()
    }
}

#[derive(Clone, Copy)]
struct LaunchBounds {
    timeout: Duration,
    output_limit: usize,
    capture_uart: bool,
}

#[derive(Clone)]
struct SessionControl {
    stop: Arc<AtomicBool>,
    done: Arc<(Mutex<bool>, Condvar)>,
}

impl SessionControl {
    fn request_stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        let (lock, wake) = &*self.done;
        if let Ok(done) = lock.lock() {
            let _ = wake.wait_timeout_while(done, Duration::from_secs(5), |value| !*value);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SpikeTopology { Default, SixMotors }
impl SpikeTopology {
    pub(crate) fn parse(value: Option<&str>) -> Result<Self, String> {
        match value { None | Some("default") => Ok(Self::Default), Some("six-motors") => Ok(Self::SixMotors),
            _ => Err("unknown SPIKE topology".into()) }
    }
}
fn topology_commands(config: &serde_json::Value, topology: SpikeTopology) -> Result<Vec<String>, String> {
    if config.get("motorPorts").is_some() && config["motorPorts"].as_u64() != Some(6) {
        return Err("invalid packaged motor-port declaration".into());
    }
    if topology == SpikeTopology::Default { return Ok(Vec::new()); }
    if config["identity"]["firmware"] != "brickwright-nuttx" || config["motorPorts"].as_u64() != Some(6) {
        return Err("six-motor topology is not supported by this own firmware package".into());
    }
    Ok(['A', 'B', 'C', 'D', 'E', 'F'].into_iter().map(|port| format!("port{port} Attach \"motor\"")).collect())
}

fn insert_topology_commands(arguments: &mut Vec<String>, firmware: &Path, config: &serde_json::Value,
    topology: SpikeTopology) -> Result<(), String> {
    let attachments = topology_commands(config, topology)?;
    let user_load = format!("sysbus LoadELF {}", monitor_path(firmware)?);
    let index = arguments.iter().position(|arg| arg == &user_load)
        .ok_or("SPIKE firmware load sequence unavailable")? - 1;
    for command in attachments.into_iter().rev() { arguments.splice(index..index, ["-e".to_owned(), command]); }
    Ok(())
}

pub(crate) struct RenodeSupervisor {
    session: Mutex<Option<SessionControl>>,
}

impl RenodeSupervisor {
    pub(crate) fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }

    /// Start the build-pinned Renode executable. Arguments are supplied by the
    /// native target adapter, never copied from a project or webview request.
    #[allow(dead_code)]
    pub(crate) fn start(
        &self,
        arguments: &[String],
        working_directory: &Path,
    ) -> Result<RenodeEndpoint, String> {
        let executable = option_env!("BW_RENODE_EXECUTABLE")
            .ok_or_else(|| "Renode backend is not packaged in this build".to_owned())?;
        let digest = option_env!("BW_RENODE_SHA256")
            .ok_or_else(|| "Renode backend digest is not packaged in this build".to_owned())?;
        self.start_verified_with_evidence(
            Path::new(executable),
            digest,
            arguments,
            working_directory,
            LaunchBounds {
                timeout: MAX_SESSION_TIME,
                output_limit: MAX_OUTPUT_BYTES,
                capture_uart: false,
            },
        )
    }

    /// Launch the packaged SPIKE Prime machine and public simulation image.
    /// Every path and digest is fixed at build time; editor data cannot enter
    /// the Renode command line or monitor language.
    #[allow(dead_code)]
    pub(crate) fn start_spike(&self) -> Result<RenodeEndpoint, String> {
        self.start_spike_backend(None)
    }

    pub(crate) fn start_spike_backend(&self, backend: Option<&str>) -> Result<RenodeEndpoint, String> {
        self.start_spike_profile(backend, SpikeTopology::Default)
    }

    pub(crate) fn start_spike_profile(&self, backend: Option<&str>, topology: SpikeTopology) -> Result<RenodeEndpoint, String> {
        if topology == SpikeTopology::SixMotors && backend != Some("nuttx") {
            return Err("six-motor topology requires own NuttX firmware".into());
        }
        if backend.is_some_and(|name| !matches!(name, "guest" | "nuttx")) {
            return Err("unknown SPIKE execution backend".into());
        }
        let nuttx = backend == Some("nuttx") && option_env!("BW_RENODE_NUTTX_ROOT").is_some();
        let (root_pin, scenario_pin, scenario_hash, firmware_pin, firmware_hash,
             script_pin, script_hash, config_pin, config_hash, manifest_pin, manifest_hash) = if nuttx {
            (option_env!("BW_RENODE_NUTTX_ROOT"), option_env!("BW_RENODE_NUTTX_SCENARIO"), option_env!("BW_RENODE_NUTTX_SCENARIO_SHA256"),
             option_env!("BW_RENODE_NUTTX_FIRMWARE"), option_env!("BW_RENODE_NUTTX_FIRMWARE_SHA256"),
             option_env!("BW_RENODE_NUTTX_STATE_SCRIPT"), option_env!("BW_RENODE_NUTTX_STATE_SCRIPT_SHA256"),
             option_env!("BW_RENODE_NUTTX_STATE_CONFIG"), option_env!("BW_RENODE_NUTTX_STATE_CONFIG_SHA256"),
             option_env!("BW_RENODE_NUTTX_MANIFEST"), option_env!("BW_RENODE_NUTTX_MANIFEST_SHA256"))
        } else {
            (option_env!("BW_RENODE_SPIKE_ROOT"), option_env!("BW_RENODE_SPIKE_SCENARIO"), option_env!("BW_RENODE_SPIKE_SCENARIO_SHA256"),
             option_env!("BW_RENODE_SPIKE_FIRMWARE"), option_env!("BW_RENODE_SPIKE_FIRMWARE_SHA256"),
             option_env!("BW_RENODE_SPIKE_STATE_SCRIPT"), option_env!("BW_RENODE_SPIKE_STATE_SCRIPT_SHA256"),
             option_env!("BW_RENODE_SPIKE_STATE_CONFIG"), option_env!("BW_RENODE_SPIKE_STATE_CONFIG_SHA256"),
             option_env!("BW_RENODE_SPIKE_MANIFEST"), option_env!("BW_RENODE_SPIKE_MANIFEST_SHA256"))
        };
        let root = pinned_path(
            "SPIKE model root",
            root_pin,
            None,
        )?;
        let scenario = pinned_file(
            "SPIKE scenario",
            scenario_pin,
            scenario_hash,
        )?;
        let firmware = pinned_file(
            "SPIKE firmware",
            firmware_pin,
            firmware_hash,
        )?;
        let state_script = pinned_file(
            "SPIKE state service",
            script_pin,
            script_hash,
        )?;
        let state_config = pinned_file(
            "SPIKE state config",
            config_pin,
            config_hash,
        )?;
        for path in [&scenario, &state_script, &state_config] {
            if !path.starts_with(&root) {
                return Err("SPIKE model artifact escaped its packaged root".into());
            }
        }
        let mut arguments = spike_arguments(&scenario, &firmware, &state_script, &state_config)?;
        let config: serde_json::Value = serde_json::from_slice(
            &std::fs::read(&state_config)
                .map_err(|_| "SPIKE state config unavailable".to_owned())?,
        )
        .map_err(|_| "SPIKE state config malformed".to_owned())?;
        if backend.is_some_and(|name| config["identity"]["firmware"].as_str() != Some(if name == "nuttx" {"brickwright-nuttx"} else {"brickwright-arena-demo"})) {
            return Err("requested SPIKE backend is not packaged in this desktop build".into());
        }
        if topology == SpikeTopology::SixMotors && (config["identity"]["firmware"] != "brickwright-nuttx" || config.get("programMailbox").is_none()) {
            return Err("six-motor topology requires own full NuttX firmware".into());
        }
        if config["identity"]["firmware"] == "brickwright-arena-demo" {
            let manifest = pinned_file(
                "arena package manifest",
                manifest_pin,
                manifest_hash,
            )?;
            verify_arena_manifest(&root, &manifest)?;
            let mut header = [0u8; 52];
            File::open(&firmware)
                .and_then(|mut file| file.read_exact(&mut header))
                .map_err(|_| "arena ELF header unavailable".to_owned())?;
            if &header[..6] != b"\x7fELF\x01\x01" || header[18..20] != [40, 0] {
                return Err("arena guest must be a little-endian ARM ELF32".into());
            }
            let entry = u32::from_le_bytes(header[24..28].try_into().unwrap());
            if !(0x08008000..0x08010000).contains(&entry) {
                return Err("arena guest entry outside demo flash".into());
            }
            let commands = [
                "cpu VectorTableOffset 0x08008000".to_owned(),
                "cpu SP 0x20050000".to_owned(),
                format!("cpu PC {entry}"),
                "emulation RunFor \"0.002\"".to_owned(),
            ];
            let index = arguments
                .iter()
                .position(|arg| arg == "machine StartGdbServer {BW_GDB_PORT}")
                .ok_or_else(|| "SPIKE startup sequence unavailable".to_owned())?
                - 1;
            for command in commands.into_iter().rev() {
                arguments.splice(index..index, ["-e".to_owned(), command.to_owned()]);
            }
        }

        if config["identity"]["firmware"] == "brickwright-nuttx" && config.get("programMailbox").is_some() {
            let manifest = pinned_file("full firmware package manifest", manifest_pin, manifest_hash)?;
            verify_nuttx_manifest(&root, &manifest)?;
            if firmware != root.join("nuttx-user.elf") || config["identity"]["imageSha256"].as_str() != Some(sha256(&firmware).map_err(|_| "full firmware image unavailable")?.as_str()) {
                return Err("full firmware package identity mismatch".into());
            }
            let base = config["programMailbox"].as_u64().ok_or("full firmware mailbox unavailable")?;
            if base % 4 != 0 || !(0x20020000..=0x20040000-112).contains(&base) {
                return Err("full firmware mailbox outside userspace RAM".into());
            }
            let sp = config["boot"]["stack"].as_u64().ok_or("full firmware reset stack unavailable")?;
            let pc = config["boot"]["reset"].as_u64().ok_or("full firmware reset entry unavailable")?;
            if sp % 8 != 0 || !(0x20000008..=0x20020000).contains(&sp) || pc & 1 != 1 || !(0x08008000..0x08060000).contains(&pc) {
                return Err("full firmware reset vector outside protected kernel".into());
            }
            insert_topology_commands(&mut arguments, &firmware, &config, topology)?;
            let commands = [format!("sysbus LoadELF {}", monitor_path(&root.join("nuttx-kernel.elf"))?),
                "cpu VectorTableOffset 0x08008000".to_owned(), format!("cpu SP {sp}"), format!("cpu PC {pc}"),
                "emulation RunFor \"1.0\"".to_owned()];
            let index = arguments.iter().position(|arg| arg == "machine StartGdbServer {BW_GDB_PORT}")
                .ok_or("SPIKE startup sequence unavailable")? - 1;
            for command in commands.into_iter().rev() {arguments.splice(index..index, ["-e".to_owned(), command]);}
        }

        self.start(&arguments, &root)
    }

    /// Launch the exact public AM1808 model and source-built permissive smoke
    /// image. Every executable input remains a build-time pin.
    #[allow(dead_code)]
    pub(crate) fn start_ev3(&self) -> Result<RenodeEndpoint, String> {
        let root = pinned_path("EV3 model root", option_env!("BW_RENODE_EV3_ROOT"), None)?;
        let platform = pinned_file(
            "EV3 platform",
            option_env!("BW_RENODE_EV3_PLATFORM"),
            option_env!("BW_RENODE_EV3_PLATFORM_SHA256"),
        )?;
        let firmware = pinned_file(
            "EV3 firmware",
            option_env!("BW_RENODE_EV3_FIRMWARE"),
            option_env!("BW_RENODE_EV3_FIRMWARE_SHA256"),
        )?;
        let state_script = pinned_file(
            "EV3 state service",
            option_env!("BW_RENODE_EV3_STATE_SCRIPT"),
            option_env!("BW_RENODE_EV3_STATE_SCRIPT_SHA256"),
        )?;
        let state_config = pinned_file(
            "EV3 state config",
            option_env!("BW_RENODE_EV3_STATE_CONFIG"),
            option_env!("BW_RENODE_EV3_STATE_CONFIG_SHA256"),
        )?;
        for path in [&platform, &firmware, &state_script, &state_config] {
            if !path.starts_with(&root) {
                return Err("EV3 model artifact escaped its packaged root".into());
            }
        }
        let arguments =
            ev3_arguments_with_state(&platform, &firmware, &state_script, &state_config)?;
        let executable = option_env!("BW_RENODE_EXECUTABLE")
            .ok_or_else(|| "Renode backend is not packaged in this build".to_owned())?;
        let digest = option_env!("BW_RENODE_SHA256")
            .ok_or_else(|| "Renode backend digest is not packaged in this build".to_owned())?;
        self.start_verified_with_evidence(
            Path::new(executable),
            digest,
            &arguments,
            &root,
            LaunchBounds {
                timeout: MAX_SESSION_TIME,
                output_limit: MAX_OUTPUT_BYTES,
                capture_uart: true,
            },
        )
    }

    #[cfg(test)]
    fn start_verified(
        &self,
        executable: &Path,
        expected_digest: &str,
        arguments: &[String],
        working_directory: &Path,
        timeout: Duration,
        output_limit: usize,
    ) -> Result<RenodeEndpoint, String> {
        self.start_verified_with_evidence(
            executable,
            expected_digest,
            arguments,
            working_directory,
            LaunchBounds {
                timeout,
                output_limit,
                capture_uart: false,
            },
        )
    }

    fn start_verified_with_evidence(
        &self,
        executable: &Path,
        expected_digest: &str,
        arguments: &[String],
        working_directory: &Path,
        bounds: LaunchBounds,
    ) -> Result<RenodeEndpoint, String> {
        if arguments.len() > 64 || arguments.iter().any(|value| value.len() > 16 * 1024) {
            return Err("Renode launch plan exceeds its bounds".into());
        }
        let executable = executable
            .canonicalize()
            .map_err(|_| "Renode executable is unavailable")?;
        let working_directory = working_directory
            .canonicalize()
            .map_err(|_| "Renode working directory is unavailable")?;
        let actual_digest =
            sha256(&executable).map_err(|_| "Renode executable cannot be verified")?;
        if expected_digest.len() != 64
            || !expected_digest.bytes().all(|byte| byte.is_ascii_hexdigit())
            || !actual_digest.eq_ignore_ascii_case(expected_digest)
        {
            return Err("Renode executable digest mismatch".into());
        }

        let mut slot = self
            .session
            .lock()
            .map_err(|_| "Renode supervisor unavailable")?;
        if slot.is_some() {
            return Err("Renode session already active".into());
        }
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "Renode loopback endpoint unavailable")?;
        let gdb_listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "Renode loopback endpoint unavailable")?;
        let state_listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "Renode loopback endpoint unavailable")?;
        let port = listener
            .local_addr()
            .map_err(|_| "Renode loopback endpoint unavailable")?
            .port();
        let gdb_port = gdb_listener
            .local_addr()
            .map_err(|_| "Renode loopback endpoint unavailable")?
            .port();
        let state_port = state_listener
            .local_addr()
            .map_err(|_| "Renode loopback endpoint unavailable")?
            .port();
        let token = random_token()?;
        let uart_evidence = bounds
            .capture_uart
            .then(|| std::env::temp_dir().join(format!("brickwright-ev3-{token}.uart")));
        let uart_monitor_path = uart_evidence
            .as_deref()
            .map(monitor_path)
            .transpose()?
            .unwrap_or_default();

        let arguments: Vec<String> = arguments
            .iter()
            .map(|argument| {
                argument
                    .replace("{BW_MONITOR_PORT}", &port.to_string())
                    .replace("{BW_GDB_PORT}", &gdb_port.to_string())
                    .replace("{BW_STATE_PORT}", &state_port.to_string())
                    .replace("{BW_UART_PATH}", &uart_monitor_path)
            })
            .collect();

        let mut command = Command::new(&executable);
        command
            .args(&arguments)
            .current_dir(working_directory)
            .env("BW_RENODE_LOOPBACK_HOST", "127.0.0.1")
            .env("BW_RENODE_LOOPBACK_PORT", port.to_string())
            .env("BW_RENODE_GDB_PORT", gdb_port.to_string())
            .env("BW_RENODE_STATE_PORT", state_port.to_string())
            .env("BW_RENODE_SESSION_TOKEN", &token)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // The reserved socket closes immediately before spawn. Renode is only
        // ever told the selected loopback address; it cannot be redirected to
        // a LAN interface by project input.
        drop(listener);
        drop(gdb_listener);
        drop(state_listener);
        let mut child = command
            .group_spawn()
            .map_err(|_| "Renode process failed to start")?;
        let stdout = child
            .inner()
            .stdout
            .take()
            .ok_or_else(|| "Renode stdout unavailable".to_owned())?;
        let stderr = child
            .inner()
            .stderr
            .take()
            .ok_or_else(|| "Renode stderr unavailable".to_owned())?;
        let stop = Arc::new(AtomicBool::new(false));
        let overflow = Arc::new(AtomicBool::new(false));
        let total = Arc::new(AtomicUsize::new(0));
        let done = Arc::new((Mutex::new(false), Condvar::new()));
        let stdout_reader = drain_bounded(
            stdout,
            Arc::clone(&total),
            Arc::clone(&overflow),
            bounds.output_limit,
        );
        let stderr_reader = drain_bounded(
            stderr,
            Arc::clone(&total),
            Arc::clone(&overflow),
            bounds.output_limit,
        );
        let worker_stop = Arc::clone(&stop);
        let worker_done = Arc::clone(&done);
        let worker_uart_evidence = uart_evidence.clone();
        thread::spawn(move || {
            let started = Instant::now();
            loop {
                let terminate = worker_stop.load(Ordering::SeqCst)
                    || overflow.load(Ordering::SeqCst)
                    || started.elapsed() >= bounds.timeout;
                if terminate {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) => thread::sleep(Duration::from_millis(10)),
                    Err(_) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                }
            }
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            if let Some(path) = worker_uart_evidence {
                let _ = std::fs::remove_file(path);
            }
            let (lock, wake) = &*worker_done;
            if let Ok(mut finished) = lock.lock() {
                *finished = true;
                wake.notify_all();
            }
        });
        *slot = Some(SessionControl { stop, done });
        Ok(RenodeEndpoint {
            port,
            gdb_port,
            state_port,
            token,
            uart_evidence,
        })
    }

    pub(crate) fn teardown(&self, _reason: TeardownReason) {
        if let Ok(mut slot) = self.session.lock() {
            if let Some(session) = slot.take() {
                session.request_stop();
            }
        }
    }
}

impl Drop for RenodeSupervisor {
    fn drop(&mut self) {
        self.teardown(TeardownReason::AppExit);
    }
}

fn sha256(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn pinned_path(
    label: &str,
    path: Option<&'static str>,
    expected_digest: Option<&'static str>,
) -> Result<PathBuf, String> {
    let path = path.ok_or_else(|| format!("{label} is not packaged in this build"))?;
    let path = Path::new(path)
        .canonicalize()
        .map_err(|_| format!("{label} is unavailable"))?;
    if let Some(expected) = expected_digest {
        let actual = sha256(&path).map_err(|_| format!("{label} cannot be verified"))?;
        if expected.len() != 64
            || !expected.bytes().all(|byte| byte.is_ascii_hexdigit())
            || !actual.eq_ignore_ascii_case(expected)
        {
            return Err(format!("{label} digest mismatch"));
        }
    }
    Ok(path)
}

fn pinned_file(
    label: &str,
    path: Option<&'static str>,
    expected_digest: Option<&'static str>,
) -> Result<PathBuf, String> {
    let expected_digest =
        expected_digest.ok_or_else(|| format!("{label} digest is not packaged in this build"))?;
    pinned_path(label, path, Some(expected_digest))
}

// All executable support files are verified before starting this optional demo.
fn verify_arena_manifest(root: &Path, manifest: &Path) -> Result<(), String> {
    const REQUIRED: &[&str] = &[
        "arena-demo.elf",
        "arena-demo.repl",
        "arena-demo.resc",
        "state-config.json",
        "scripts/spike-state-server.py",
        "tools/spike_state_monitor_protocol.py",
        "tools/ev3_state_observer.py",
        "tools/spike_arena_inputs.py",
        "tools/spike_arena_mailbox.py",
    ];
    verify_support_manifest(root, manifest, REQUIRED,
        &["licenses/renode-MIT.txt", "licenses/arena-BSD-3-Clause.txt", "tools/spike_nuttx_mailbox.py"], 32)
}
fn verify_nuttx_manifest(root: &Path, manifest: &Path) -> Result<(), String> {
    verify_support_manifest(root, manifest, &[
        "nuttx-kernel.elf", "nuttx-user.elf", "nuttx.resc", "models.cs", "state-config.json",
        "platforms/boards/spike-prime.repl", "platforms/boards/spike-prime-brick-devices.repl",
        "platforms/cpus/stm32f413vg.repl", "platforms/cpus/stm32f4.repl",
        "scripts/spike-state-server.py", "tools/spike_state_monitor_protocol.py",
        "tools/ev3_state_observer.py", "tools/spike_arena_inputs.py", "tools/spike_arena_mailbox.py",
        "tools/spike_nuttx_mailbox.py"], &[
        "licenses/renode-models-MIT.txt", "licenses/brickwright-BSD-3-Clause.txt",
        "licenses/firmware-LICENSE", "licenses/NuttX-Apache-2.0.txt", "licenses/NuttX-NOTICE.txt",
        "licenses/NuttX-apps-Apache-2.0.txt", "licenses/littlefs-BSD-3-Clause.txt", "licenses/Zephyr-Apache-2.0.txt",
        "licenses/firmware-source-NOTICES.txt", "licenses/MicroPython-MIT.txt", "licenses/hubprogram-BSD-3-Clause.txt",
        "licenses/Apache-2.0.txt", "licenses/firmware-NuttX-NOTICE.txt", "licenses/NuttX-Apps-NOTICE.txt",
        "licenses/firmware-Brickwright-BSD-3-Clause.txt", "licenses/NuttX-Tickless-BSD-3-Clause.txt",
        "licenses/Simulation-Firmware-NOTICES.txt", "initial-flash.bin"], 33)
}
fn verify_support_manifest(root: &Path, manifest: &Path, required: &[&str], allowed: &[&str], max_files: usize) -> Result<(), String> {
    if !manifest.starts_with(root) {
        return Err("arena manifest escaped its package".into());
    }
    let mut bytes = Vec::new();
    File::open(manifest)
        .and_then(|file| file.take(65537).read_to_end(&mut bytes))
        .map_err(|_| "arena manifest unavailable".to_owned())?;
    if bytes.len() > 65536 {
        return Err("arena manifest exceeds bounds".into());
    }
    let map: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "arena manifest malformed".to_owned())?;
    let map = map.as_object().ok_or("arena manifest malformed")?;
    if map.len() > max_files || !required.iter().all(|name| map.contains_key(*name)) {
        return Err("arena manifest is incomplete".into());
    }
    let backport_notices = ["licenses/Apache-2.0.txt", "licenses/firmware-NuttX-NOTICE.txt",
        "licenses/NuttX-Apps-NOTICE.txt", "licenses/firmware-Brickwright-BSD-3-Clause.txt",
        "licenses/NuttX-Tickless-BSD-3-Clause.txt"];
    if backport_notices.iter().any(|name| map.contains_key(*name))
        && (!backport_notices.iter().all(|name| map.contains_key(*name))
            || !map.contains_key("licenses/Simulation-Firmware-NOTICES.txt")) {
        return Err("firmware backport notices are incomplete".into());
    }
    if allowed.contains(&"initial-flash.bin") {
        let mut scenario = Vec::new();
        File::open(root.join("nuttx.resc"))
            .and_then(|file| file.take(65537).read_to_end(&mut scenario))
            .map_err(|_| "full firmware scenario unavailable".to_owned())?;
        if scenario.len() > 65536 { return Err("full firmware scenario exceeds bounds".into()); }
        let requires_seed = scenario.windows(b"initial-flash.bin".len()).any(|part| part == b"initial-flash.bin");
        let has_seed = map.contains_key("initial-flash.bin");
        if requires_seed != has_seed || (backport_notices.iter().any(|name| map.contains_key(*name)) && !has_seed) {
            return Err("full firmware initial flash seed is incomplete".into());
        }
        if has_seed && std::fs::metadata(root.join("initial-flash.bin"))
            .map_err(|_| "initial flash seed unavailable".to_owned())?.len() != 8192 {
            return Err("initial flash seed exceeds exact geometry".into());
        }
    }
    for (name, digest) in map {
        if !required.contains(&name.as_str()) && !allowed.contains(&name.as_str())
        {
            return Err("arena manifest contains an unsupported file".into());
        }
        let file = root
            .join(name)
            .canonicalize()
            .map_err(|_| "arena package file unavailable".to_owned())?;
        if !file.starts_with(root) {
            return Err("arena package file escaped its root".into());
        }
        let expected = digest.as_str().ok_or("arena digest malformed")?;
        if expected.len() != 64
            || !expected.bytes().all(|c| c.is_ascii_hexdigit())
            || !sha256(&file)
                .map_err(|_| "arena file cannot be verified".to_owned())?
                .eq_ignore_ascii_case(expected)
        {
            return Err("arena support file digest mismatch".into());
        }
    }
    Ok(())
}

fn monitor_path(path: &Path) -> Result<String, String> {
    let value = path
        .to_str()
        .ok_or_else(|| "SPIKE package path is not UTF-8".to_owned())?;
    if value.contains([';', '\n', '\r', '\t']) {
        return Err("SPIKE package path is not monitor-safe".into());
    }
    // Renode's ReadFilePath token is `@path`, not `@"path"`. Its tokenizer
    // supports spaces only as `\ `; quoting the path changes the token type
    // and makes LoadELF/include reject it.
    Ok(format!("@{}", value.replace(' ', "\\ ")))
}

fn spike_arguments(
    scenario: &Path,
    firmware: &Path,
    state_script: &Path,
    state_config: &Path,
) -> Result<Vec<String>, String> {
    Ok(vec![
        "--disable-gui".into(),
        "--hide-log".into(),
        "-P".into(),
        "{BW_MONITOR_PORT}".into(),
        scenario
            .to_str()
            .ok_or_else(|| "SPIKE scenario path is not UTF-8".to_owned())?
            .into(),
        "-e".into(),
        format!("sysbus LoadELF {}", monitor_path(firmware)?),
        "-e".into(),
        "machine StartGdbServer {BW_GDB_PORT}".into(),
        "-e".into(),
        format!("include {}", monitor_path(state_script)?),
        "-e".into(),
        format!(
            "spike_state_start \"127.0.0.1\" {{BW_STATE_PORT}} {}",
            monitor_path(state_config)?
        ),
    ])
}

fn ev3_arguments(platform: &Path, firmware: &Path) -> Result<Vec<String>, String> {
    Ok(vec![
        "--disable-gui".into(),
        "--hide-log".into(),
        "-P".into(),
        "{BW_MONITOR_PORT}".into(),
        "-e".into(),
        "mach create".into(),
        "-e".into(),
        format!(
            "machine LoadPlatformDescription {}",
            monitor_path(platform)?
        ),
        "-e".into(),
        format!("sysbus LoadELF {}", monitor_path(firmware)?),
        "-e".into(),
        "uart1 CreateFileBackend {BW_UART_PATH} true".into(),
        "-e".into(),
        "machine StartGdbServer {BW_GDB_PORT}".into(),
    ])
}

fn ev3_arguments_with_state(
    platform: &Path,
    firmware: &Path,
    script: &Path,
    config: &Path,
) -> Result<Vec<String>, String> {
    let mut arguments = ev3_arguments(platform, firmware)?;
    arguments.extend([
        "-e".into(),
        format!("include {}", monitor_path(script)?),
        "-e".into(),
        format!(
            "spike_state_start \"127.0.0.1\" {{BW_STATE_PORT}} {}",
            monitor_path(config)?
        ),
    ]);
    Ok(arguments)
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|_| "Renode session token unavailable".to_owned())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn drain_bounded(
    mut stream: impl Read + Send + 'static,
    total: Arc<AtomicUsize>,
    overflow: Arc<AtomicBool>,
    limit: usize,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        while let Ok(count) = stream.read(&mut buffer) {
            if count == 0 {
                break;
            }
            let previous = total.fetch_add(count, Ordering::SeqCst);
            if previous.saturating_add(count) > limit {
                overflow.store(true, Ordering::SeqCst);
                break;
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn six_motor_launch_is_gated_and_precedes_both_firmware_loads() {
        let old = serde_json::json!({"identity":{"firmware":"brickwright-nuttx"}});
        assert!(topology_commands(&old, SpikeTopology::Default).unwrap().is_empty());
        assert!(topology_commands(&old, SpikeTopology::SixMotors).is_err());
        for value in [serde_json::json!(true),serde_json::json!("6"),serde_json::json!(5)] {
            let config = serde_json::json!({"identity":{"firmware":"brickwright-nuttx"},"motorPorts":value});
            assert!(topology_commands(&config, SpikeTopology::SixMotors).is_err());
        }
        let config = serde_json::json!({"identity":{"firmware":"brickwright-nuttx"},"motorPorts":6});
        let user = Path::new("/trusted/nuttx-user.elf");
        let mut args = spike_arguments(Path::new("/trusted/nuttx.resc"),user,
            Path::new("/trusted/scripts/state.py"),Path::new("/trusted/state-config.json")).unwrap();
        args.extend(["-e".to_owned(),"sysbus LoadELF /trusted/nuttx-kernel.elf".to_owned()]);
        insert_topology_commands(&mut args,user,&config,SpikeTopology::SixMotors).unwrap();
        let first_load = args.iter().position(|arg| arg.starts_with("sysbus LoadELF")).unwrap();
        for port in ['A','B','C','D','E','F'] {
            assert!(args.iter().position(|arg| arg == &format!("port{port} Attach \"motor\"")).unwrap() < first_load);
        }
        let demo = serde_json::json!({"identity":{"firmware":"brickwright-arena-demo"},"motorPorts":6});
        assert!(topology_commands(&demo,SpikeTopology::SixMotors).is_err());
        assert_eq!(SpikeTopology::parse(None).unwrap(),SpikeTopology::Default);
        assert_eq!(SpikeTopology::parse(Some("six-motors")).unwrap(),SpikeTopology::SixMotors);
        assert!(SpikeTopology::parse(Some("six-motors;quit")).is_err());
        let supervisor = RenodeSupervisor::new();
        assert!(supervisor.start_spike_profile(Some("guest"),SpikeTopology::SixMotors).is_err());
        assert!(supervisor.start_spike_profile(None,SpikeTopology::SixMotors).is_err());
        assert!(supervisor.session.lock().unwrap().is_none(), "unsupported profiles must fail before process creation");
    }

    #[test]
    fn tokens_are_secret_sized_and_unique() {
        let first = random_token().unwrap();
        let second = random_token().unwrap();
        assert_eq!(first.len(), 64);
        assert!(first
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()));
        assert_ne!(first, second);
    }

    #[test]
    fn refuses_an_unpinned_executable_before_spawn() {
        let supervisor = RenodeSupervisor::new();
        let executable = std::env::current_exe().unwrap();
        let error = supervisor
            .start_verified(
                &executable,
                &"0".repeat(64),
                &[],
                Path::new("."),
                Duration::from_secs(1),
                1024,
            )
            .unwrap_err();
        assert_eq!(error, "Renode executable digest mismatch");
    }

    #[cfg(unix)]
    #[test]
    fn reset_project_close_and_drop_tear_down_the_process_group() {
        let executable = PathBuf::from("/bin/sh");
        let digest = sha256(&executable).unwrap();
        for reason in [
            TeardownReason::Reset,
            TeardownReason::ProjectClose,
            TeardownReason::AppExit,
        ] {
            let supervisor = RenodeSupervisor::new();
            let endpoint = supervisor
                .start_verified(
                    &executable,
                    &digest,
                    &["-c".into(), "sleep 30 & wait".into()],
                    Path::new("."),
                    Duration::from_secs(30),
                    1024,
                )
                .unwrap();
            assert!(endpoint.port > 0);
            assert!(endpoint.gdb_port > 0);
            assert!(endpoint.state_port > 0);
            assert_ne!(endpoint.port, endpoint.gdb_port);
            assert_ne!(endpoint.port, endpoint.state_port);
            assert_ne!(endpoint.gdb_port, endpoint.state_port);
            assert_eq!(endpoint.token().len(), 64);
            supervisor.teardown(reason);
            assert!(supervisor.session.lock().unwrap().is_none());
        }
    }

    #[cfg(unix)]
    #[test]
    fn output_and_time_limits_stop_the_group() {
        let executable = PathBuf::from("/bin/sh");
        let digest = sha256(&executable).unwrap();
        for (script, timeout, limit) in [
            (
                "while :; do printf 0123456789; done",
                Duration::from_secs(5),
                256,
            ),
            ("sleep 30", Duration::from_millis(40), 1024),
        ] {
            let supervisor = RenodeSupervisor::new();
            supervisor
                .start_verified(
                    &executable,
                    &digest,
                    &["-c".into(), script.into()],
                    Path::new("."),
                    timeout,
                    limit,
                )
                .unwrap();
            thread::sleep(Duration::from_millis(150));
            supervisor.teardown(TeardownReason::Reset);
            assert!(supervisor.session.lock().unwrap().is_none());
        }
    }

    #[test]
    fn spike_launch_plan_is_fixed_loopback_and_shell_free() {
        let arguments = spike_arguments(
            Path::new("/package/spike-prime.resc"),
            Path::new("/package/nuttx"),
            Path::new("/package/spike-state-server.py"),
            Path::new("/package/renode-prime.json"),
        )
        .unwrap();
        assert_eq!(
            &arguments[..4],
            ["--disable-gui", "--hide-log", "-P", "{BW_MONITOR_PORT}"]
        );
        assert!(arguments
            .iter()
            .any(|value| value == "machine StartGdbServer {BW_GDB_PORT}"));
        assert!(arguments
            .iter()
            .any(|value| value.contains("spike_state_start \"127.0.0.1\" {BW_STATE_PORT}")));
        assert!(!arguments
            .iter()
            .any(|value| matches!(value.as_str(), "sh" | "bash" | "cmd" | "powershell")));
        assert_eq!(
            monitor_path(Path::new("/package with spaces/image.elf")).unwrap(),
            "@/package\\ with\\ spaces/image.elf"
        );
        assert_eq!(
            monitor_path(Path::new("/package/image.elf;quit")).unwrap_err(),
            "SPIKE package path is not monitor-safe"
        );
    }

    #[test]
    fn ev3_launch_plan_is_fixed_loopback_and_shell_free() {
        let arguments = ev3_arguments(
            Path::new("/package/platforms/boards/lego-ev3.repl"),
            Path::new("/package/am1808-smoke.elf"),
        )
        .unwrap();
        assert_eq!(
            &arguments[..4],
            ["--disable-gui", "--hide-log", "-P", "{BW_MONITOR_PORT}"]
        );
        assert!(arguments
            .iter()
            .any(|value| value.contains("machine LoadPlatformDescription @/package/")));
        assert!(arguments
            .iter()
            .any(|value| value == "uart1 CreateFileBackend {BW_UART_PATH} true"));
        assert!(arguments
            .iter()
            .any(|value| value == "machine StartGdbServer {BW_GDB_PORT}"));
        assert!(!arguments
            .iter()
            .any(|value| matches!(value.as_str(), "sh" | "bash" | "cmd" | "powershell")));
    }
    #[test]
    fn initial_flash_manifest_requires_exact_seed_even_with_matching_digest() {
        let root = std::env::temp_dir().join(format!("bw-initial-flash-manifest-{}", random_token().unwrap()));
        std::fs::create_dir(&root).unwrap();
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let root = root.canonicalize().unwrap();
        let manifest = root.join("manifest.json");
        let mut names = vec!["nuttx.resc".to_owned(), "initial-flash.bin".to_owned()];
        names.extend((0..31).map(|i| format!("bounded-component-{i}")));
        for name in &names { std::fs::write(root.join(name), b"synthetic fixture").unwrap(); }
        std::fs::write(root.join("nuttx.resc"), b"trusted fixed initial-flash.bin boot initialization").unwrap();
        std::fs::write(root.join("initial-flash.bin"), vec![0xff; 8192]).unwrap();
        let allowed: Vec<&str> = names.iter().map(String::as_str).collect();
        let write_manifest = || {
            let entries: serde_json::Map<String, serde_json::Value> = names.iter().map(|name|
                (name.clone(), serde_json::Value::String(sha256(&root.join(name)).unwrap()))).collect();
            std::fs::write(&manifest, serde_json::to_vec(&entries).unwrap()).unwrap();
        };
        write_manifest();
        assert!(verify_support_manifest(&root, &manifest, &[], &allowed, 33).is_ok());
        assert_eq!(verify_support_manifest(&root, &manifest, &[], &allowed, 32).unwrap_err(), "arena manifest is incomplete");
        std::fs::write(root.join("initial-flash.bin"), vec![0xff; 8193]).unwrap();
        write_manifest(); // Correct hash must not bypass the geometry guard.
        assert_eq!(verify_support_manifest(&root, &manifest, &[], &allowed, 33).unwrap_err(), "initial flash seed exceeds exact geometry");
        std::fs::write(root.join("initial-flash.bin"), vec![0xff; 8192]).unwrap();
        write_manifest();
        let mut entries: serde_json::Value = serde_json::from_slice(&std::fs::read(&manifest).unwrap()).unwrap();
        entries.as_object_mut().unwrap().remove("initial-flash.bin");
        std::fs::write(&manifest, serde_json::to_vec(&entries).unwrap()).unwrap();
        assert_eq!(verify_support_manifest(&root, &manifest, &[], &allowed, 33).unwrap_err(), "full firmware initial flash seed is incomplete");
        std::fs::write(root.join("nuttx.resc"), b"old seedless baseline scenario").unwrap();
        entries["nuttx.resc"] = sha256(&root.join("nuttx.resc")).unwrap().into();
        std::fs::write(&manifest, serde_json::to_vec(&entries).unwrap()).unwrap();
        assert!(verify_support_manifest(&root, &manifest, &[], &allowed, 33).is_ok());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn arena_support_manifest_detects_changed_helpers_and_escaped_names() {
        let root =
            std::env::temp_dir().join(format!("bw-arena-manifest-{}", random_token().unwrap()));
        std::fs::create_dir(&root).unwrap();
        let names = [
            "arena-demo.elf",
            "arena-demo.repl",
            "arena-demo.resc",
            "state-config.json",
            "scripts/spike-state-server.py",
            "tools/spike_state_monitor_protocol.py",
            "tools/ev3_state_observer.py",
            "tools/spike_arena_inputs.py",
            "tools/spike_arena_mailbox.py",
        ];
        let mut map = serde_json::Map::new();
        for name in names {
            let file = root.join(name);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(&file, b"synthetic fixture").unwrap();
            map.insert(
                name.to_owned(),
                serde_json::Value::String(sha256(&file).unwrap()),
            );
        }
        let manifest = root.join("manifest.json");
        std::fs::write(&manifest, serde_json::to_vec(&map).unwrap()).unwrap();
        assert!(verify_arena_manifest(&root, &manifest).is_ok());
        std::fs::write(root.join("tools/spike_arena_mailbox.py"), b"changed helper").unwrap();
        assert_eq!(
            verify_arena_manifest(&root, &manifest).unwrap_err(),
            "arena support file digest mismatch"
        );
        map.insert(
            "../outside.py".to_owned(),
            serde_json::Value::String("a".repeat(64)),
        );
        std::fs::write(&manifest, serde_json::to_vec(&map).unwrap()).unwrap();
        assert_eq!(
            verify_arena_manifest(&root, &manifest).unwrap_err(),
            "arena manifest contains an unsupported file"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
