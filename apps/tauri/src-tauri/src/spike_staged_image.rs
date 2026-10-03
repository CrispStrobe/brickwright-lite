// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors. All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors
//    may be used to endorse or promote products derived from this software
//    without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

//! Native-owned staging of an already admitted canonical image. No source
//! filenames or source bytes enter diagnostics. On Unix, retained directory
//! descriptors anchor file operations even if another process renames a path.
//! Non-Unix operations fail closed until stable file identities and private
//! ACL validation are implemented. The types remain available on every target.
use sha2::{Digest, Sha256};
use std::ffi::CString;
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const MAX_IMAGE: usize = 1024 * 1024;
const IMAGE_NAME: &str = "image.bin";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StageError {
    InvalidSize,
    InvalidRoot,
    RandomUnavailable,
    CollisionLimit,
    Io,
    ChangedDirectory,
    ChangedImage,
    CleanupFailed,
    UnsupportedPlatform,
}

impl std::fmt::Display for StageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::InvalidSize => "image size is outside the staging limit",
            Self::InvalidRoot => "staging root is not a private owned directory",
            Self::RandomUnavailable => "staging randomness is unavailable",
            Self::CollisionLimit => "staging directory collision limit reached",
            Self::Io => "staging operation failed",
            Self::ChangedDirectory => "staging directory identity changed",
            Self::ChangedImage => "staged image identity or content changed",
            Self::CleanupFailed => "staging capsule cleanup was incomplete",
            Self::UnsupportedPlatform => "private image staging is unavailable on this platform",
        })
    }
}
impl std::error::Error for StageError {}

pub struct StagedImage {
    root: PathBuf,
    root_metadata: Metadata,
    root_handle: File,
    directory_name: CString,
    directory: PathBuf,
    image: PathBuf,
    directory_metadata: Metadata,
    image_metadata: Option<Metadata>,
    directory_handle: File,
    hash: String,
    length: usize,
}

impl StagedImage {
    pub fn create(root: &Path, bytes: &[u8]) -> Result<Self, StageError> {
        #[cfg(not(unix))]
        {
            let _ = (root, bytes);
            Err(StageError::UnsupportedPlatform)
        }
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            if !(8..=MAX_IMAGE).contains(&bytes.len()) {
                return Err(StageError::InvalidSize);
            }
            let root_metadata = fs::symlink_metadata(root).map_err(|_| StageError::InvalidRoot)?;
            if !private_directory(&root_metadata) {
                return Err(StageError::InvalidRoot);
            }
            let root_handle = open_directory(root).map_err(|_| StageError::InvalidRoot)?;
            if !same_identity(
                &root_metadata,
                &root_handle
                    .metadata()
                    .map_err(|_| StageError::InvalidRoot)?,
            ) {
                return Err(StageError::InvalidRoot);
            }
            for _ in 0..8 {
                let mut random = [0u8; 16];
                getrandom::getrandom(&mut random).map_err(|_| StageError::RandomUnavailable)?;
                let name = hex(&random);
                let directory = root.join(&name);
                let directory_name = CString::new(name).map_err(|_| StageError::Io)?;
                // The retained native parent anchors creation, even if its path
                // is concurrently renamed or replaced with a symlink.
                let result = unsafe {
                    libc::mkdirat(root_handle.as_raw_fd(), directory_name.as_ptr(), 0o700)
                };
                if result != 0 {
                    let error = std::io::Error::last_os_error();
                    if error.kind() == std::io::ErrorKind::AlreadyExists {
                        continue;
                    }
                    return Err(StageError::Io);
                }
                // Inspect and open without following before changing permissions.
                let directory_handle = open_child_directory(&root_handle, &directory_name)
                    .map_err(|_| StageError::ChangedDirectory)?;
                let directory_metadata = directory_handle.metadata().map_err(|_| StageError::Io)?;
                if !directory_metadata.is_dir() || directory_metadata.file_type().is_symlink() {
                    return Err(StageError::ChangedDirectory);
                }
                let mut staged = Self {
                    root: root.to_owned(),
                    root_metadata,
                    root_handle,
                    directory_name,
                    image: directory.join(IMAGE_NAME),
                    directory,
                    directory_metadata,
                    image_metadata: None,
                    directory_handle,
                    hash: hex(&Sha256::digest(bytes)),
                    length: bytes.len(),
                };
                let result = (|| {
                    staged.check_directory()?;
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        staged
                            .directory_handle
                            .set_permissions(fs::Permissions::from_mode(0o700))
                            .map_err(|_| StageError::Io)?;
                    }
                    let mut file = staged.open_image(true).map_err(|_| StageError::Io)?;
                    staged.image_metadata = Some(file.metadata().map_err(|_| StageError::Io)?);
                    if !regular_single_file(staged.image_metadata.as_ref().unwrap()) {
                        return Err(StageError::ChangedImage);
                    }
                    staged.check_directory()?;
                    file.write_all(bytes).map_err(|_| StageError::Io)?;
                    file.sync_all().map_err(|_| StageError::Io)?;
                    staged.verify()
                })();
                if let Err(error) = result {
                    if staged.cleanup().is_err() {
                        return Err(StageError::CleanupFailed);
                    }
                    return Err(error);
                }
                return Ok(staged);
            }
            Err(StageError::CollisionLimit)
        }
    }

    pub fn path(&self) -> &Path {
        &self.image
    }
    pub fn image_sha256(&self) -> &str {
        &self.hash
    }
    pub fn len(&self) -> usize {
        self.length
    }
    pub fn is_empty(&self) -> bool {
        self.length == 0
    }

    pub fn verify(&self) -> Result<(), StageError> {
        #[cfg(not(unix))]
        {
            Err(StageError::UnsupportedPlatform)
        }
        #[cfg(unix)]
        {
            self.check_directory()?;
            if !private_directory(
                &self
                    .directory_handle
                    .metadata()
                    .map_err(|_| StageError::ChangedDirectory)?,
            ) {
                return Err(StageError::ChangedDirectory);
            }
            let mut file = self
                .open_image(false)
                .map_err(|_| StageError::ChangedImage)?;
            self.check_file(&file.metadata().map_err(|_| StageError::ChangedImage)?)?;
            let mut digest = Sha256::new();
            let mut total = 0usize;
            let mut buffer = [0u8; 8192];
            loop {
                let n = file
                    .read(&mut buffer)
                    .map_err(|_| StageError::ChangedImage)?;
                if n == 0 {
                    break;
                }
                total += n;
                if total > self.length {
                    return Err(StageError::ChangedImage);
                }
                digest.update(&buffer[..n]);
            }
            if total != self.length || hex(&digest.finalize()) != self.hash {
                return Err(StageError::ChangedImage);
            }
            self.check_file(&file.metadata().map_err(|_| StageError::ChangedImage)?)?;
            // A renamed open file must not certify the replacement at image.bin.
            self.check_file(
                &self
                    .open_image(false)
                    .map_err(|_| StageError::ChangedImage)?
                    .metadata()
                    .map_err(|_| StageError::ChangedImage)?,
            )?;
            self.check_directory()
        }
    }

    fn check_directory(&self) -> Result<(), StageError> {
        let root_metadata =
            fs::symlink_metadata(&self.root).map_err(|_| StageError::ChangedDirectory)?;
        if !private_directory(&root_metadata) || !same_identity(&self.root_metadata, &root_metadata)
        {
            return Err(StageError::ChangedDirectory);
        }
        let metadata =
            fs::symlink_metadata(&self.directory).map_err(|_| StageError::ChangedDirectory)?;
        if !metadata.is_dir()
            || metadata.file_type().is_symlink()
            || !same_identity(&self.directory_metadata, &metadata)
        {
            return Err(StageError::ChangedDirectory);
        }
        self.check_owned_directory()
    }

    fn check_owned_directory(&self) -> Result<(), StageError> {
        #[cfg(unix)]
        {
            let named = open_child_directory(&self.root_handle, &self.directory_name)
                .map_err(|_| StageError::ChangedDirectory)?;
            if !same_identity(
                &self.directory_metadata,
                &named.metadata().map_err(|_| StageError::ChangedDirectory)?,
            ) {
                return Err(StageError::ChangedDirectory);
            }
            Ok(())
        }
        #[cfg(not(unix))]
        {
            Err(StageError::UnsupportedPlatform)
        }
    }
    fn check_file(&self, metadata: &Metadata) -> Result<(), StageError> {
        if !regular_single_file(metadata)
            || metadata.len() != self.length as u64
            || !self
                .image_metadata
                .as_ref()
                .map(|original| same_identity(original, metadata))
                .unwrap_or(false)
        {
            return Err(StageError::ChangedImage);
        }
        Ok(())
    }

    #[cfg(unix)]
    fn open_image(&self, create: bool) -> std::io::Result<File> {
        use std::os::fd::{AsRawFd, FromRawFd};
        let flags = libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | libc::O_NONBLOCK
            | if create {
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL
            } else {
                libc::O_RDONLY
            };
        // Fixed NUL-terminated name and a retained directory descriptor.
        let fd = unsafe {
            libc::openat(
                self.directory_handle.as_raw_fd(),
                c"image.bin".as_ptr(),
                flags,
                0o600 as libc::mode_t,
            )
        };
        if fd < 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(unsafe { File::from_raw_fd(fd) })
        }
    }
    #[cfg(not(unix))]
    fn open_image(&self, create: bool) -> std::io::Result<File> {
        if !create {
            let metadata = fs::symlink_metadata(&self.image)?;
            if !regular_single_file(&metadata) {
                return Err(std::io::ErrorKind::InvalidData.into());
            }
        }
        let mut options = OpenOptions::new();
        options.read(!create).write(create).create_new(create);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.custom_flags(0x00200000); // OPEN_REPARSE_POINT
        }
        options.open(&self.image)
    }

    fn cleanup(&mut self) -> Result<(), StageError> {
        #[cfg(not(unix))]
        {
            Err(StageError::UnsupportedPlatform)
        }
        #[cfg(unix)]
        {
            self.check_owned_directory()
                .map_err(|_| StageError::CleanupFailed)?;
            if let Some(original) = &self.image_metadata {
                let file = self
                    .open_image(false)
                    .map_err(|_| StageError::CleanupFailed)?;
                let current = file.metadata().map_err(|_| StageError::CleanupFailed)?;
                if !regular_single_file(&current) || !same_identity(original, &current) {
                    return Err(StageError::CleanupFailed);
                }
                #[cfg(unix)]
                {
                    use std::os::fd::AsRawFd;
                    if unsafe {
                        libc::unlinkat(self.directory_handle.as_raw_fd(), c"image.bin".as_ptr(), 0)
                    } != 0
                    {
                        return Err(StageError::CleanupFailed);
                    }
                }
                #[cfg(not(unix))]
                fs::remove_file(&self.image).map_err(|_| StageError::CleanupFailed)?;
                self.image_metadata = None;
            }
            self.check_owned_directory()
                .map_err(|_| StageError::CleanupFailed)?;
            use std::os::fd::AsRawFd;
            if unsafe {
                libc::unlinkat(
                    self.root_handle.as_raw_fd(),
                    self.directory_name.as_ptr(),
                    libc::AT_REMOVEDIR,
                )
            } != 0
            {
                return Err(StageError::CleanupFailed);
            }
            Ok(())
        }
    }
}
impl Drop for StagedImage {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 15) as usize] as char);
    }
    out
}
fn open_directory(path: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x02000000 | 0x00200000); // BACKUP_SEMANTICS | OPEN_REPARSE_POINT
    }
    options.open(path)
}
#[cfg(unix)]
fn open_child_directory(parent: &File, name: &CString) -> std::io::Result<File> {
    use std::os::fd::{AsRawFd, FromRawFd};
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}
fn private_directory(metadata: &Metadata) -> bool {
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        metadata.uid() == unsafe { libc::geteuid() } && metadata.mode() & 0o077 == 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
fn regular_single_file(metadata: &Metadata) -> bool {
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        metadata.nlink() == 1
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 == 0
    }
    #[cfg(not(any(unix, windows)))]
    {
        true
    }
}
fn same_identity(a: &Metadata, b: &Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        a.dev() == b.dev() && a.ino() == b.ino()
    }
    #[cfg(not(unix))]
    {
        let _ = (a, b);
        false
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    struct Root(PathBuf);
    impl Root {
        fn new() -> Self {
            let mut random = [0; 16];
            getrandom::getrandom(&mut random).unwrap();
            let path =
                std::env::temp_dir().join(format!("brickwright-image-test-{}", hex(&random)));
            fs::create_dir(&path).unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
            }
            Self(path)
        }
    }
    impl Drop for Root {
        fn drop(&mut self) {
            let _ = fs::remove_dir(&self.0);
        }
    }

    #[test]
    fn success_hash_verify_and_drop() {
        let root = Root::new();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        assert_eq!(image.len(), 8);
        assert_eq!(
            image.image_sha256(),
            "9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab"
        );
        assert_eq!(fs::read(image.path()).unwrap(), b"abcdefgh");
        image.verify().unwrap();
        let path = image.path().to_owned();
        let directory = path.parent().unwrap().to_owned();
        assert_eq!(directory.file_name().unwrap().to_str().unwrap().len(), 32);
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            assert_eq!(fs::metadata(&directory).unwrap().mode() & 0o777, 0o700);
            assert_eq!(fs::metadata(&path).unwrap().mode() & 0o777, 0o600);
        }
        drop(image);
        assert!(!path.exists());
        assert!(!directory.exists());
    }

    #[test]
    fn capsules_are_distinct_and_sibling_is_preserved() {
        let root = Root::new();
        let sibling = root.0.join("sibling");
        fs::write(&sibling, b"safe").unwrap();
        let first = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let second = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        assert_ne!(first.path(), second.path());
        drop(first);
        second.verify().unwrap();
        drop(second);
        assert_eq!(fs::read(&sibling).unwrap(), b"safe");
        fs::remove_file(sibling).unwrap();
    }

    #[test]
    fn content_and_size_changes_are_rejected() {
        let root = Root::new();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        fs::write(image.path(), b"ABCDEFGH").unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedImage));
        fs::write(image.path(), b"short").unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedImage));
    }

    #[test]
    fn replaced_file_is_rejected_and_preserved() {
        let root = Root::new();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let path = image.path().to_owned();
        let original = path.with_file_name("original");
        fs::rename(&path, &original).unwrap();
        fs::write(&path, b"abcdefgh").unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedImage));
        let directory = path.parent().unwrap().to_owned();
        drop(image);
        assert!(path.exists());
        fs::remove_file(path).unwrap();
        fs::remove_file(original).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn size_and_root_validation() {
        let root = Root::new();
        assert!(matches!(
            StagedImage::create(&root.0, b"1234567"),
            Err(StageError::InvalidSize)
        ));
        assert!(matches!(
            StagedImage::create(&root.0, &vec![0; MAX_IMAGE + 1]),
            Err(StageError::InvalidSize)
        ));
        assert!(matches!(
            StagedImage::create(&root.0.join("missing"), b"abcdefgh"),
            Err(StageError::InvalidRoot)
        ));
        let file = root.0.join("file");
        fs::write(&file, b"safe").unwrap();
        assert!(matches!(
            StagedImage::create(&file, b"abcdefgh"),
            Err(StageError::InvalidRoot)
        ));
        fs::remove_file(file).unwrap();
        let max = StagedImage::create(&root.0, &vec![0; MAX_IMAGE]).unwrap();
        max.verify().unwrap();
        drop(max);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root.0, fs::Permissions::from_mode(0o750)).unwrap();
            assert!(matches!(
                StagedImage::create(&root.0, b"abcdefgh"),
                Err(StageError::InvalidRoot)
            ));
        }
    }

    #[test]
    fn unknown_extra_file_survives_cleanup() {
        let root = Root::new();
        let mut image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let path = image.path().to_owned();
        let extra = path.with_file_name("unknown");
        fs::write(&extra, b"safe").unwrap();
        assert_eq!(image.cleanup(), Err(StageError::CleanupFailed));
        drop(image);
        assert!(!path.exists());
        assert_eq!(fs::read(&extra).unwrap(), b"safe");
        let directory = extra.parent().unwrap().to_owned();
        fs::remove_file(extra).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlink_root_and_image_are_rejected() {
        use std::os::unix::fs::symlink;
        let root = Root::new();
        let alias = root.0.join("alias");
        symlink(&root.0, &alias).unwrap();
        assert!(matches!(
            StagedImage::create(&alias, b"abcdefgh"),
            Err(StageError::InvalidRoot)
        ));
        fs::remove_file(alias).unwrap();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let path = image.path().to_owned();
        let original = path.with_file_name("original");
        fs::rename(&path, &original).unwrap();
        symlink(&original, &path).unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedImage));
        drop(image);
        assert_eq!(fs::read(&original).unwrap(), b"abcdefgh");
        fs::remove_file(&path).unwrap();
        fs::remove_file(original).unwrap();
        fs::remove_dir(path.parent().unwrap()).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn hardlink_is_rejected() {
        let root = Root::new();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let path = image.path().to_owned();
        let alias = root.0.join("hardlink");
        fs::hard_link(&path, &alias).unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedImage));
        drop(image);
        assert!(path.exists());
        fs::remove_file(alias).unwrap();
        fs::remove_file(&path).unwrap();
        fs::remove_dir(path.parent().unwrap()).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn substituted_directory_preserves_target() {
        use std::os::unix::fs::symlink;
        let root = Root::new();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let directory = image.path().parent().unwrap().to_owned();
        let moved = root.0.join("moved");
        let target = root.0.join("target");
        fs::create_dir(&target).unwrap();
        fs::write(target.join(IMAGE_NAME), b"preserve").unwrap();
        fs::rename(&directory, &moved).unwrap();
        symlink(&target, &directory).unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedDirectory));
        drop(image);
        assert_eq!(fs::read(target.join(IMAGE_NAME)).unwrap(), b"preserve");
        assert_eq!(fs::read(moved.join(IMAGE_NAME)).unwrap(), b"abcdefgh");
        fs::remove_file(directory).unwrap();
        fs::remove_file(target.join(IMAGE_NAME)).unwrap();
        fs::remove_dir(target).unwrap();
        fs::remove_file(moved.join(IMAGE_NAME)).unwrap();
        fs::remove_dir(moved).unwrap();
    }

    #[test]
    fn renamed_root_cleanup_preserves_substituted_target() {
        use std::os::unix::fs::symlink;
        let root = Root::new();
        let outer = Root::new();
        let target = Root::new();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let name = image
            .path()
            .parent()
            .unwrap()
            .file_name()
            .unwrap()
            .to_owned();
        let unrelated = target.0.join(&name);
        fs::create_dir(&unrelated).unwrap();
        fs::write(unrelated.join(IMAGE_NAME), b"preserve").unwrap();
        let renamed_root = outer.0.join("renamed-root");
        fs::rename(&root.0, &renamed_root).unwrap();
        symlink(&target.0, &root.0).unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedDirectory));
        drop(image);
        assert!(!renamed_root.join(name).exists());
        assert_eq!(fs::read(unrelated.join(IMAGE_NAME)).unwrap(), b"preserve");
        fs::remove_file(&root.0).unwrap();
        fs::remove_dir(renamed_root).unwrap();
        fs::remove_file(unrelated.join(IMAGE_NAME)).unwrap();
        fs::remove_dir(unrelated).unwrap();
    }

    #[test]
    fn replacement_directory_and_nonregular_file_are_rejected() {
        let root = Root::new();
        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let directory = image.path().parent().unwrap().to_owned();
        let moved = root.0.join("moved");
        fs::rename(&directory, &moved).unwrap();
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join(IMAGE_NAME), b"preserve").unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedDirectory));
        drop(image);
        assert_eq!(fs::read(directory.join(IMAGE_NAME)).unwrap(), b"preserve");
        fs::remove_file(directory.join(IMAGE_NAME)).unwrap();
        fs::remove_dir(directory).unwrap();
        fs::remove_file(moved.join(IMAGE_NAME)).unwrap();
        fs::remove_dir(moved).unwrap();

        let image = StagedImage::create(&root.0, b"abcdefgh").unwrap();
        let path = image.path().to_owned();
        let original = path.with_file_name("original");
        fs::rename(&path, &original).unwrap();
        fs::create_dir(&path).unwrap();
        assert_eq!(image.verify(), Err(StageError::ChangedImage));
        drop(image);
        assert!(path.is_dir());
        fs::remove_dir(&path).unwrap();
        fs::remove_file(original).unwrap();
        fs::remove_dir(path.parent().unwrap()).unwrap();
    }
}
