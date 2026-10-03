// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//! Host-owned full-flash journal. No editor inputs, firmware paths, or topology keys.
//! The caller must verify the own firmware image before supplying its SHA and keep
//! this lease alive through the emulator process and checkpoint-worker cleanup.

use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

pub(crate) const FLASH_BYTES: u64 = 0x0200_0000;
const RECORD_BYTES: usize = 120;
const MAGIC: &[u8; 8] = b"BWFLASH1";

#[derive(Debug)]
pub(crate) enum StoreError {
    InvalidImage,
    Busy,
    Damaged,
    UnsafePath,
    WrongSize,
    GenerationExhausted,
    Io(io::Error),
}
impl From<io::Error> for StoreError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidImage => f.write_str("invalid verified firmware image identity"),
            Self::Busy => f.write_str("virtual hub flash is owned by another process"),
            Self::Damaged => f.write_str("virtual hub flash has no valid committed checkpoint"),
            Self::UnsafePath => {
                f.write_str("virtual hub flash path is not a private regular file/directory")
            }
            Self::WrongSize => f.write_str("virtual hub flash must contain exactly 32 MiB"),
            Self::GenerationExhausted => f.write_str("virtual hub flash generation exhausted"),
            Self::Io(error) => write!(f, "virtual hub flash I/O failed ({:?})", error.kind()),
        }
    }
}
impl std::error::Error for StoreError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Checkpoint {
    pub(crate) generation: u64,
    pub(crate) sha256: [u8; 32],
}
#[derive(Debug)]
pub(crate) enum RestoreReport {
    Absent,
    Restored {
        checkpoint: Checkpoint,
        recovered_previous: bool,
    },
}
struct ValidSlot {
    index: usize,
    checkpoint: Checkpoint,
}
struct Inspection {
    latest: Option<ValidSlot>,
    max_generation: u64,
    recovered_previous: bool,
}

pub(crate) struct FlashStore {
    directory: PathBuf,
    image: [u8; 32],
    lock: File,
}
impl FlashStore {
    /// `root` is exclusively a native app-data directory, never a project argument.
    pub(crate) fn open(root: &Path, verified_image_sha256: &str) -> Result<Self, StoreError> {
        let image = image_bytes(verified_image_sha256)?;
        private_directory(root)?;
        let directory = root.join(verified_image_sha256);
        private_directory(&directory)?;
        let lock_path = directory.join("store.lock");
        let lock = private_open(&lock_path, true, true)?;
        FileExt::try_lock_exclusive(&lock).map_err(|error| {
            if error.kind() == io::ErrorKind::WouldBlock || error.raw_os_error() == Some(33) {
                StoreError::Busy
            } else {
                StoreError::Io(error)
            }
        })?;
        Ok(Self {
            directory,
            image,
            lock,
        })
    }

    /// Restore to a *new*, native-created private session file before kernel boot.
    /// An absent journal writes nothing. A damaged journal never substitutes a seed.
    pub(crate) fn restore_to(&self, destination: &Path) -> Result<RestoreReport, StoreError> {
        let inspected = self.inspect()?;
        let Some(slot) = inspected.latest else {
            return Ok(RestoreReport::Absent);
        };
        let mut source = private_open(&self.payload(slot.index), false, false)?;
        let mut target = private_new(destination)?;
        let copied = io::copy(&mut source, &mut target)?;
        if copied != FLASH_BYTES {
            return Err(StoreError::WrongSize);
        }
        target.sync_all()?;
        Ok(RestoreReport::Restored {
            checkpoint: slot.checkpoint,
            recovered_previous: inspected.recovered_previous,
        })
    }

    /// Stream an actual emulator flash export. Publication succeeds only after both
    /// payload and integrity record are synced and the directory commit is synced.
    pub(crate) fn commit(&mut self, source: &mut impl Read) -> Result<Checkpoint, StoreError> {
        let inspected = self.inspect()?;
        let generation = inspected
            .max_generation
            .checked_add(1)
            .ok_or(StoreError::GenerationExhausted)?;
        let index = inspected.latest.map_or(0, |slot| 1 - slot.index);
        let pending = self.directory.join("checkpoint.pending");
        let record_pending = self.directory.join("record.pending");
        // Only our fixed staging files may be discarded, after the exclusive lock.
        remove_staging(&pending)?;
        remove_staging(&record_pending)?;
        let result = (|| {
            let mut file = private_new(&pending)?;
            let mut hasher = Sha256::new();
            let mut remaining = FLASH_BYTES;
            let mut buffer = [0u8; 64 * 1024];
            while remaining != 0 {
                let wanted = (remaining as usize).min(buffer.len());
                let count = source.read(&mut buffer[..wanted])?;
                if count == 0 {
                    return Err(StoreError::WrongSize);
                }
                file.write_all(&buffer[..count])?;
                hasher.update(&buffer[..count]);
                remaining -= count as u64;
            }
            if source.read(&mut buffer[..1])? != 0 {
                return Err(StoreError::WrongSize);
            }
            file.sync_all()?;
            drop(file);
            let checkpoint = Checkpoint {
                generation,
                sha256: hasher.finalize().into(),
            };
            let bytes = record_bytes(&checkpoint, &self.image);
            let mut record = private_new(&record_pending)?;
            record.write_all(&bytes)?;
            record.sync_all()?;
            drop(record);
            safe_replace(&pending, &self.payload(index))?;
            sync_directory(&self.directory)?;
            safe_replace(&record_pending, &self.record(index))?;
            sync_directory(&self.directory)?;
            Ok(checkpoint)
        })();
        if result.is_err() {
            // The opposite committed slot remains intact even if replacement failed.
            let _ = remove_staging(&pending);
            let _ = remove_staging(&record_pending);
        }
        result
    }

    fn payload(&self, index: usize) -> PathBuf {
        self.directory.join(format!("flash-{index}.bin"))
    }
    fn record(&self, index: usize) -> PathBuf {
        self.directory.join(format!("flash-{index}.record"))
    }
    fn inspect(&self) -> Result<Inspection, StoreError> {
        let mut valid = Vec::new();
        let mut present = false;
        let mut damaged = false;
        let mut max_generation = 0;
        for index in 0..2 {
            let payload = self.payload(index);
            let record = self.record(index);
            let exists = present_path(&payload)? | present_path(&record)?;
            if !exists {
                continue;
            }
            present = true;
            let candidate = (|| {
                let mut bytes = [0u8; RECORD_BYTES];
                let mut meta = private_open(&record, false, false)?;
                if meta.metadata()?.len() != RECORD_BYTES as u64 {
                    return Err(StoreError::Damaged);
                }
                meta.read_exact(&mut bytes)?;
                let checkpoint = parse_record(&bytes, &self.image)?;
                max_generation = max_generation.max(checkpoint.generation);
                let mut file = private_open(&payload, false, false)?;
                if file.metadata()?.len() != FLASH_BYTES {
                    return Err(StoreError::Damaged);
                }
                let mut hash = Sha256::new();
                let mut buffer = [0u8; 64 * 1024];
                loop {
                    let count = file.read(&mut buffer)?;
                    if count == 0 {
                        break;
                    }
                    hash.update(&buffer[..count]);
                }
                if <[u8; 32]>::from(hash.finalize()) != checkpoint.sha256 {
                    return Err(StoreError::Damaged);
                }
                Ok(ValidSlot { index, checkpoint })
            })();
            match candidate {
                Ok(slot) => valid.push(slot),
                Err(_) => damaged = true,
            }
        }
        for name in ["checkpoint.pending", "record.pending"] {
            if present_path(&self.directory.join(name))? {
                present = true;
                damaged = true;
            }
        }
        valid.sort_by_key(|slot| slot.checkpoint.generation);
        if valid.len() == 2 && valid[0].checkpoint.generation == valid[1].checkpoint.generation {
            return Err(StoreError::Damaged);
        }
        let latest = valid.pop();
        if latest.is_none() && present {
            return Err(StoreError::Damaged);
        }
        Ok(Inspection {
            latest,
            max_generation,
            recovered_previous: damaged,
        })
    }
}
impl Drop for FlashStore {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.lock);
    }
}

fn image_bytes(hex: &str) -> Result<[u8; 32], StoreError> {
    if hex.len() != 64
        || !hex
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err(StoreError::InvalidImage);
    }
    let mut image = [0; 32];
    for (index, byte) in image.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16)
            .map_err(|_| StoreError::InvalidImage)?;
    }
    Ok(image)
}
fn record_bytes(checkpoint: &Checkpoint, image: &[u8; 32]) -> [u8; RECORD_BYTES] {
    let mut bytes = [0; RECORD_BYTES];
    bytes[..8].copy_from_slice(MAGIC);
    bytes[8..16].copy_from_slice(&checkpoint.generation.to_le_bytes());
    bytes[16..24].copy_from_slice(&FLASH_BYTES.to_le_bytes());
    bytes[24..56].copy_from_slice(image);
    bytes[56..88].copy_from_slice(&checkpoint.sha256);
    let hash = Sha256::digest(&bytes[..88]);
    bytes[88..].copy_from_slice(&hash);
    bytes
}
fn parse_record(bytes: &[u8; RECORD_BYTES], image: &[u8; 32]) -> Result<Checkpoint, StoreError> {
    if &bytes[..8] != MAGIC
        || &bytes[24..56] != image
        || u64::from_le_bytes(bytes[16..24].try_into().unwrap()) != FLASH_BYTES
        || Sha256::digest(&bytes[..88]).as_slice() != &bytes[88..]
    {
        return Err(StoreError::Damaged);
    }
    let generation = u64::from_le_bytes(bytes[8..16].try_into().unwrap());
    if generation == 0 {
        return Err(StoreError::Damaged);
    }
    Ok(Checkpoint {
        generation,
        sha256: bytes[56..88].try_into().unwrap(),
    })
}
fn present_path(path: &Path) -> Result<bool, StoreError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}
fn safe_metadata(meta: &fs::Metadata, directory: bool) -> bool {
    if meta.file_type().is_symlink()
        || (if directory {
            !meta.is_dir()
        } else {
            !meta.is_file()
        })
    {
        return false;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return false;
        } // Reparse point.
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.uid() != unsafe { libc::geteuid() } {
            return false;
        }
        if !directory && (meta.nlink() != 1 || meta.mode() & 0o077 != 0) {
            return false;
        }
    }
    true
}
pub(crate) fn private_directory(path: &Path) -> Result<(), StoreError> {
    fs::create_dir_all(path)?;
    if !safe_metadata(&fs::symlink_metadata(path)?, true) {
        return Err(StoreError::UnsafePath);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Seek, SeekFrom};
    use std::sync::atomic::{AtomicUsize, Ordering};
    const IMAGE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const OTHER: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let root = std::env::var_os("BW_FLASH_TEST_ROOT")
                .map(PathBuf::from)
                .unwrap_or_else(std::env::temp_dir);
            let path = root.join(format!(
                "flash-journal-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            ));
            private_directory(&path).unwrap();
            Self(path)
        }
        fn open(&self) -> FlashStore {
            FlashStore::open(&self.0, IMAGE).unwrap()
        }
        fn commit(&self, store: &mut FlashStore, byte: u8) -> Checkpoint {
            store
                .commit(&mut io::repeat(byte).take(FLASH_BYTES))
                .unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn full_flash_round_trip_image_separation_and_shared_profile_lease() {
        let fixture = Fixture::new();
        let mut store = fixture.open();
        assert!(matches!(
            store.restore_to(&fixture.0.join("absent.bin")).unwrap(),
            RestoreReport::Absent
        ));
        assert!(!fixture.0.join("absent.bin").exists());
        let first = fixture.commit(&mut store, 0xa5);
        assert_eq!(first.generation, 1);
        let destination = fixture.0.join("restore.bin");
        match store.restore_to(&destination).unwrap() {
            RestoreReport::Restored {
                checkpoint,
                recovered_previous,
            } => {
                assert_eq!(checkpoint, first);
                assert!(!recovered_previous);
            }
            RestoreReport::Absent => panic!("committed full flash disappeared"),
        }
        let mut file = File::open(&destination).unwrap();
        assert_eq!(file.metadata().unwrap().len(), FLASH_BYTES);
        let mut byte = [0];
        file.read_exact(&mut byte).unwrap();
        assert_eq!(byte, [0xa5]);
        file.seek(SeekFrom::End(-1)).unwrap();
        file.read_exact(&mut byte).unwrap();
        assert_eq!(byte, [0xa5]);
        assert!(
            matches!(FlashStore::open(&fixture.0, IMAGE), Err(StoreError::Busy)),
            "profile changes must share the same image lock"
        );
        let other = FlashStore::open(&fixture.0, OTHER).unwrap();
        assert!(matches!(
            other.restore_to(&fixture.0.join("other.bin")).unwrap(),
            RestoreReport::Absent
        ));
        drop(store);
        let reopened = fixture.open();
        assert!(matches!(
            reopened
                .restore_to(&fixture.0.join("reopened.bin"))
                .unwrap(),
            RestoreReport::Restored { .. }
        ));
    }
    #[test]
    fn corrupted_latest_recovers_previous_and_generation_never_reuses_corrupt_commit() {
        let fixture = Fixture::new();
        let mut store = fixture.open();
        fixture.commit(&mut store, 1);
        fixture.commit(&mut store, 2);
        let mut damaged = private_open(&store.payload(1), true, false).unwrap();
        damaged.seek(SeekFrom::Start(12345)).unwrap();
        damaged.write_all(&[99]).unwrap();
        damaged.sync_all().unwrap();
        match store.restore_to(&fixture.0.join("recover.bin")).unwrap() {
            RestoreReport::Restored {
                checkpoint,
                recovered_previous,
            } => {
                assert_eq!(checkpoint.generation, 1);
                assert!(recovered_previous);
            }
            RestoreReport::Absent => panic!("corrupt journal silently reformatted"),
        }
        assert_eq!(fixture.commit(&mut store, 3).generation, 3);
    }
    #[test]
    fn truncation_bad_metadata_and_orphaned_first_commit_fail_closed() {
        let fixture = Fixture::new();
        let mut store = fixture.open();
        fixture.commit(&mut store, 7);
        private_open(&store.payload(0), true, false)
            .unwrap()
            .set_len(FLASH_BYTES - 1)
            .unwrap();
        assert!(matches!(
            store.restore_to(&fixture.0.join("truncated.bin")),
            Err(StoreError::Damaged)
        ));
        let record = store.record(0);
        let mut bytes = fs::read(&record).unwrap();
        bytes[24] ^= 1;
        fs::write(&record, bytes).unwrap();
        assert!(matches!(
            store.restore_to(&fixture.0.join("bad-record.bin")),
            Err(StoreError::Damaged)
        ));
        fs::remove_file(record).unwrap();
        assert!(matches!(
            store.restore_to(&fixture.0.join("orphan.bin")),
            Err(StoreError::Damaged)
        ));
        assert!(!fixture.0.join("orphan.bin").exists());
    }
    struct FailingReader {
        remaining: usize,
    }
    impl Read for FailingReader {
        fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
            if self.remaining == 0 {
                return Err(io::Error::new(
                    io::ErrorKind::Other,
                    "synthetic export failure",
                ));
            }
            let n = self.remaining.min(bytes.len());
            bytes[..n].fill(0xff);
            self.remaining -= n;
            Ok(n)
        }
    }
    #[test]
    fn failed_stream_wrong_size_and_failed_record_publication_preserve_last_good() {
        let fixture = Fixture::new();
        let mut store = fixture.open();
        let good = fixture.commit(&mut store, 4);
        assert!(store
            .commit(&mut FailingReader {
                remaining: 1024 * 1024
            })
            .is_err());
        for length in [FLASH_BYTES - 1, FLASH_BYTES + 1] {
            assert!(matches!(
                store.commit(&mut io::repeat(5).take(length)),
                Err(StoreError::WrongSize)
            ));
        }
        private_directory(&store.record(1)).unwrap(); // Payload publication can succeed, record replacement must fail.
        assert!(store.commit(&mut io::repeat(6).take(FLASH_BYTES)).is_err());
        match store.restore_to(&fixture.0.join("preserved.bin")).unwrap() {
            RestoreReport::Restored {
                checkpoint,
                recovered_previous,
            } => {
                assert_eq!(checkpoint, good);
                assert!(recovered_previous);
            }
            RestoreReport::Absent => panic!("failed publication lost last good"),
        }
    }
    #[test]
    fn invalid_image_symlinks_and_permissions_are_not_followed() {
        let fixture = Fixture::new();
        for image in [
            "../escape",
            "",
            "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ] {
            assert!(matches!(
                FlashStore::open(&fixture.0, image),
                Err(StoreError::InvalidImage)
            ));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::{symlink, PermissionsExt};
            let store = fixture.open();
            assert_eq!(
                fs::metadata(&store.directory).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                store.lock.metadata().unwrap().permissions().mode() & 0o777,
                0o600
            );
            let target = fixture.0.join("untouched");
            fs::write(&target, b"private").unwrap();
            symlink(&target, store.payload(0)).unwrap();
            assert!(matches!(
                store.restore_to(&fixture.0.join("unsafe.bin")),
                Err(StoreError::Damaged)
            ));
            assert_eq!(fs::read(target).unwrap(), b"private");
        }
    }
    #[test]
    fn lock_child() {
        let Some(root) = std::env::var_os("BW_FLASH_LOCK_CHILD_ROOT") else {
            return;
        };
        assert!(matches!(
            FlashStore::open(Path::new(&root), IMAGE),
            Err(StoreError::Busy)
        ));
    }
    #[test]
    fn independent_process_is_locked_out_and_lease_releases_after_drop() {
        let fixture = Fixture::new();
        let store = fixture.open();
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "spike_flash_store::tests::lock_child",
                "--nocapture",
            ])
            .env("BW_FLASH_LOCK_CHILD_ROOT", &fixture.0)
            .status()
            .unwrap();
        assert!(status.success());
        drop(store);
        assert!(FlashStore::open(&fixture.0, IMAGE).is_ok());
    }
}
pub(crate) fn private_open(path: &Path, write: bool, create: bool) -> Result<File, StoreError> {
    if present_path(path)? && !safe_metadata(&fs::symlink_metadata(path)?, false) {
        return Err(StoreError::UnsafePath);
    }
    let mut options = OpenOptions::new();
    options.read(true).write(write).create(create).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(path)?;
    if !safe_metadata(&file.metadata()?, false) {
        return Err(StoreError::UnsafePath);
    }
    Ok(file)
}
pub(crate) fn private_new(path: &Path) -> Result<File, StoreError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    Ok(options.open(path)?)
}
pub(crate) fn safe_replace(source: &Path, destination: &Path) -> Result<(), StoreError> {
    if present_path(destination)? && !safe_metadata(&fs::symlink_metadata(destination)?, false) {
        return Err(StoreError::UnsafePath);
    }
    fs::rename(source, destination)?;
    Ok(())
}
fn remove_staging(path: &Path) -> Result<(), StoreError> {
    if present_path(path)? {
        if !safe_metadata(&fs::symlink_metadata(path)?, false) {
            return Err(StoreError::UnsafePath);
        }
        fs::remove_file(path)?;
    }
    Ok(())
}
pub(crate) fn sync_directory(path: &Path) -> Result<(), StoreError> {
    #[cfg(unix)]
    {
        File::open(path)?.sync_all()?;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        OpenOptions::new()
            .read(true)
            .custom_flags(0x0200_0000)
            .open(path)?
            .sync_all()?;
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = path;
        return Err(StoreError::Io(io::Error::new(
            io::ErrorKind::Unsupported,
            "directory durability unsupported",
        )));
    }
    Ok(())
}
