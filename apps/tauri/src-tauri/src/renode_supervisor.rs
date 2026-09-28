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
}

impl RenodeEndpoint {
    pub(crate) fn token(&self) -> &str {
        &self.token
    }
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
        self.start_verified(
            Path::new(executable),
            digest,
            arguments,
            working_directory,
            MAX_SESSION_TIME,
            MAX_OUTPUT_BYTES,
        )
    }

    /// Launch the packaged SPIKE Prime machine and public simulation image.
    /// Every path and digest is fixed at build time; editor data cannot enter
    /// the Renode command line or monitor language.
    #[allow(dead_code)]
    pub(crate) fn start_spike(&self) -> Result<RenodeEndpoint, String> {
        let root = pinned_path(
            "SPIKE model root",
            option_env!("BW_RENODE_SPIKE_ROOT"),
            None,
        )?;
        let scenario = pinned_file(
            "SPIKE scenario",
            option_env!("BW_RENODE_SPIKE_SCENARIO"),
            option_env!("BW_RENODE_SPIKE_SCENARIO_SHA256"),
        )?;
        let firmware = pinned_file(
            "SPIKE firmware",
            option_env!("BW_RENODE_SPIKE_FIRMWARE"),
            option_env!("BW_RENODE_SPIKE_FIRMWARE_SHA256"),
        )?;
        let state_script = pinned_file(
            "SPIKE state service",
            option_env!("BW_RENODE_SPIKE_STATE_SCRIPT"),
            option_env!("BW_RENODE_SPIKE_STATE_SCRIPT_SHA256"),
        )?;
        let state_config = pinned_file(
            "SPIKE state config",
            option_env!("BW_RENODE_SPIKE_STATE_CONFIG"),
            option_env!("BW_RENODE_SPIKE_STATE_CONFIG_SHA256"),
        )?;
        for path in [&scenario, &state_script, &state_config] {
            if !path.starts_with(&root) {
                return Err("SPIKE model artifact escaped its packaged root".into());
            }
        }
        let arguments = spike_arguments(&scenario, &firmware, &state_script, &state_config)?;
        self.start(&arguments, &root)
    }

    fn start_verified(
        &self,
        executable: &Path,
        expected_digest: &str,
        arguments: &[String],
        working_directory: &Path,
        timeout: Duration,
        output_limit: usize,
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

        let arguments: Vec<String> = arguments
            .iter()
            .map(|argument| {
                argument
                    .replace("{BW_MONITOR_PORT}", &port.to_string())
                    .replace("{BW_GDB_PORT}", &gdb_port.to_string())
                    .replace("{BW_STATE_PORT}", &state_port.to_string())
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
            output_limit,
        );
        let stderr_reader = drain_bounded(
            stderr,
            Arc::clone(&total),
            Arc::clone(&overflow),
            output_limit,
        );
        let worker_stop = Arc::clone(&stop);
        let worker_done = Arc::clone(&done);
        thread::spawn(move || {
            let started = Instant::now();
            loop {
                let terminate = worker_stop.load(Ordering::SeqCst)
                    || overflow.load(Ordering::SeqCst)
                    || started.elapsed() >= timeout;
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

fn monitor_path(path: &Path) -> Result<String, String> {
    let value = path
        .to_str()
        .ok_or_else(|| "SPIKE package path is not UTF-8".to_owned())?;
    if value.contains(['"', '\n', '\r']) {
        return Err("SPIKE package path is not monitor-safe".into());
    }
    Ok(format!("@\"{value}\""))
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
    }
}
