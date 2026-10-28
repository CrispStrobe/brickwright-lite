// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

//! Admission of local raw, Intel HEX and DfuSe application images.

use std::collections::BTreeMap;
use std::fmt;

const INPUT_LIMIT: usize = 4 * 1024 * 1024;
const FLASH_START: u32 = 0x0800_0000;
const FLASH_END: u32 = 0x0810_0000;
const VECTOR_ADDRESS: u32 = 0x0801_0000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdmittedImage {
    pub bytes: Vec<u8>,
    pub load_address: u32,
    pub stack_pointer: u32,
    pub reset_pc: u32,
    pub vector_address: u32,
}

#[cfg(desktop)]
impl AdmittedImage {
    /// Only a native owner supplies this private staging root. The staged hash
    /// identifies canonical bytes, rather than the original HEX text. Retain
    /// the returned capsule until its owned emulator has fully stopped.
    pub(crate) fn stage(
        &self,
        root: &std::path::Path,
    ) -> Result<crate::spike_staged_image::StagedImage, crate::spike_staged_image::StageError> {
        crate::spike_staged_image::StagedImage::create(root, &self.bytes)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageError {
    InputTooLarge,
    RawTooShort,
    NonAscii,
    InvalidHexLine,
    RecordLengthMismatch,
    ChecksumMismatch,
    MalformedRecord,
    UnsupportedRecordType,
    RecordsAfterEof,
    MissingEof,
    EmptyData,
    AddressOverflow,
    OutsideFlash,
    ConflictingWrite,
    MissingVector,
    InvalidStackPointer,
    InvalidResetPc,
    MissingResetOpcode,
    MalformedDfu,
    UnsupportedDfuLayout,
    DfuChecksumMismatch,
}

impl fmt::Display for ImageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InputTooLarge => "input exceeds size limit",
            Self::RawTooShort => "raw image is shorter than the vectors",
            Self::NonAscii => "HEX input is not ASCII",
            Self::InvalidHexLine => "invalid HEX record syntax",
            Self::RecordLengthMismatch => "HEX record length does not match its count",
            Self::ChecksumMismatch => "HEX checksum does not match",
            Self::MalformedRecord => "malformed HEX record",
            Self::UnsupportedRecordType => "unsupported HEX record type",
            Self::RecordsAfterEof => "nonblank record follows EOF",
            Self::MissingEof => "HEX EOF is missing",
            Self::EmptyData => "HEX data is empty",
            Self::AddressOverflow => "loaded address arithmetic overflowed",
            Self::OutsideFlash => "loaded bytes are outside supported flash",
            Self::ConflictingWrite => "loaded byte writes conflict",
            Self::MissingVector => "application vector bytes are missing",
            Self::InvalidStackPointer => "application stack pointer is invalid",
            Self::InvalidResetPc => "application reset PC lacks the Thumb flag",
            Self::MissingResetOpcode => "application reset opcode bytes are missing",
            Self::MalformedDfu => "malformed DfuSe container",
            Self::UnsupportedDfuLayout => {
                "DfuSe requires one application element at 0x08010000 on target 0"
            }
            Self::DfuChecksumMismatch => "DfuSe CRC does not match",
        };
        f.write_str(message)
    }
}

impl std::error::Error for ImageError {}

fn check_size(input: &[u8]) -> Result<(), ImageError> {
    if input.len() > INPUT_LIMIT {
        Err(ImageError::InputTooLarge)
    } else {
        Ok(())
    }
}

fn vectors(mut byte_at: impl FnMut(u32) -> Option<u8>) -> Result<(u32, u32), ImageError> {
    let mut bytes = [0; 8];
    for (offset, byte) in bytes.iter_mut().enumerate() {
        *byte = byte_at(VECTOR_ADDRESS + offset as u32).ok_or(ImageError::MissingVector)?;
    }
    let sp = u32::from_le_bytes(bytes[..4].try_into().expect("four vector bytes"));
    let pc = u32::from_le_bytes(bytes[4..].try_into().expect("four vector bytes"));
    if sp <= 0x2000_0000 || sp > 0x2005_0000 || sp % 8 != 0 {
        return Err(ImageError::InvalidStackPointer);
    }
    if pc & 1 == 0 {
        return Err(ImageError::InvalidResetPc);
    }
    let instruction = pc & !1;
    if byte_at(instruction).is_none() || byte_at(instruction + 1).is_none() {
        return Err(ImageError::MissingResetOpcode);
    }
    Ok((sp, pc))
}

pub fn admit_raw(input: &[u8]) -> Result<AdmittedImage, ImageError> {
    check_size(input)?;
    if input.len() < 8 {
        return Err(ImageError::RawTooShort);
    }
    let end = VECTOR_ADDRESS
        .checked_add(input.len() as u32)
        .ok_or(ImageError::AddressOverflow)?;
    if end > FLASH_END {
        return Err(ImageError::OutsideFlash);
    }
    let (stack_pointer, reset_pc) = vectors(|address| {
        address
            .checked_sub(VECTOR_ADDRESS)
            .and_then(|offset| input.get(offset as usize).copied())
    })?;
    Ok(AdmittedImage {
        bytes: input.to_vec(),
        load_address: VECTOR_ADDRESS,
        stack_pointer,
        reset_pc,
        vector_address: VECTOR_ADDRESS,
    })
}

// DfuSe uses the reflected CRC-32 register, initialized to all ones, without
// the final complement used by ordinary CRC-32. This is a format integrity
// check, not a signature or an assertion about the application's provenance.
fn dfu_crc(input: &[u8]) -> u32 {
    let mut register = u32::MAX;
    for byte in input {
        register ^= u32::from(*byte);
        for _ in 0..8 {
            register = (register >> 1) ^ if register & 1 == 0 { 0 } else { 0xedb8_8320 };
        }
    }
    register
}

/// Decode a local DfuSe application, never bootloaders or additional regions.
/// Target labels and USB identifiers are metadata; none are used as paths.
pub fn admit_dfu(input: &[u8]) -> Result<AdmittedImage, ImageError> {
    check_size(input)?;
    // Prefix 11, target header 274, element header 8, vectors 8, suffix 16.
    if input.len() < 317 || &input[..5] != b"DfuSe" || input[5] != 1 {
        return Err(ImageError::MalformedDfu);
    }
    let word = |offset: usize| {
        u32::from_le_bytes(
            input[offset..offset + 4]
                .try_into()
                .expect("bounded DFU field"),
        )
    };
    let suffix = input.len() - 16;
    // MicroPython's writer counts prefix + targets, excluding the suffix.
    // DfuSe writers also use a whole-file count; accept only those two exact sizes.
    if ![suffix, input.len()].contains(&(word(6) as usize))
        || &input[suffix + 6..suffix + 12] != b"\x1a\x01UFD\x10"
        || &input[11..17] != b"Target"
        || word(18) > 1
    {
        return Err(ImageError::MalformedDfu);
    }
    if dfu_crc(&input[..input.len() - 4]) != word(input.len() - 4) {
        return Err(ImageError::DfuChecksumMismatch);
    }
    if input[10] != 1 || input[17] != 0 || word(281) != 1 || word(285) != VECTOR_ADDRESS {
        return Err(ImageError::UnsupportedDfuLayout);
    }
    let target_size = word(277) as usize;
    let element_size = word(289) as usize;
    // Compare against actual bounded slices instead of trusting declared counts
    // for allocation or offset arithmetic. No trailing/ignored bytes are allowed.
    if target_size != suffix - 285 || element_size != suffix - 293 {
        return Err(ImageError::MalformedDfu);
    }
    admit_raw(&input[293..suffix])
}

fn nibble(byte: u8) -> Result<u8, ImageError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(ImageError::InvalidHexLine),
    }
}

fn decode_record(line: &[u8]) -> Result<Vec<u8>, ImageError> {
    if line.first() != Some(&b':') || line.len() % 2 != 1 {
        return Err(ImageError::InvalidHexLine);
    }
    // The count field is one byte: no legitimate record needs more than 260 bytes.
    if line.len() < 11 || line.len() > 521 {
        return Err(ImageError::RecordLengthMismatch);
    }
    let mut record = Vec::with_capacity((line.len() - 1) / 2);
    for pair in line[1..].chunks_exact(2) {
        record.push(nibble(pair[0])? * 16 + nibble(pair[1])?);
    }
    if record.len() != usize::from(record[0]) + 5 {
        return Err(ImageError::RecordLengthMismatch);
    }
    if record.iter().fold(0u8, |sum, byte| sum.wrapping_add(*byte)) != 0 {
        return Err(ImageError::ChecksumMismatch);
    }
    Ok(record)
}

pub fn admit_hex(input: &[u8]) -> Result<AdmittedImage, ImageError> {
    check_size(input)?;
    if !input.is_ascii() {
        return Err(ImageError::NonAscii);
    }
    let mut loaded = BTreeMap::new();
    let mut upper = 0u32;
    let mut eof = false;
    for line in input.split(|byte| *byte == b'\n') {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        if eof {
            return Err(ImageError::RecordsAfterEof);
        }
        let record = decode_record(line)?;
        let count = usize::from(record[0]);
        let address = u32::from(u16::from_be_bytes([record[1], record[2]]));
        let payload = &record[4..4 + count];
        match record[3] {
            0 => {
                let base = upper
                    .checked_add(address)
                    .ok_or(ImageError::AddressOverflow)?;
                if count != 0 {
                    base.checked_add((count - 1) as u32)
                        .ok_or(ImageError::AddressOverflow)?;
                }
                for (offset, value) in payload.iter().copied().enumerate() {
                    let target = base
                        .checked_add(offset as u32)
                        .ok_or(ImageError::AddressOverflow)?;
                    if !(FLASH_START..FLASH_END).contains(&target) {
                        return Err(ImageError::OutsideFlash);
                    }
                    if let Some(previous) = loaded.insert(target, value) {
                        if previous != value {
                            return Err(ImageError::ConflictingWrite);
                        }
                    }
                }
            }
            1 => {
                if count != 0 || address != 0 {
                    return Err(ImageError::MalformedRecord);
                }
                eof = true;
            }
            2 | 4 => {
                if count != 2 || address != 0 {
                    return Err(ImageError::MalformedRecord);
                }
                let value = u32::from(u16::from_be_bytes([payload[0], payload[1]]));
                upper = value << if record[3] == 2 { 4 } else { 16 };
            }
            3 | 5 => {
                if count != 4 || address != 0 {
                    return Err(ImageError::MalformedRecord);
                }
            }
            _ => return Err(ImageError::UnsupportedRecordType),
        }
    }
    if !eof {
        return Err(ImageError::MissingEof);
    }
    let (&load_address, _) = loaded.first_key_value().ok_or(ImageError::EmptyData)?;
    let (&last_address, _) = loaded.last_key_value().ok_or(ImageError::EmptyData)?;
    let (stack_pointer, reset_pc) = vectors(|address| loaded.get(&address).copied())?;
    let mut bytes = vec![0xff; (last_address - load_address + 1) as usize];
    for (address, value) in loaded {
        bytes[(address - load_address) as usize] = value;
    }
    Ok(AdmittedImage {
        bytes,
        load_address,
        stack_pointer,
        reset_pc,
        vector_address: VECTOR_ADDRESS,
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    // Test records are assembled from numeric fields, independently of the decoder.
    fn record(kind: u8, address: u16, data: &[u8]) -> String {
        assert!(data.len() <= 255);
        let mut fields = vec![data.len() as u8, (address >> 8) as u8, address as u8, kind];
        fields.extend_from_slice(data);
        let sum: u32 = fields.iter().map(|byte| u32::from(*byte)).sum();
        fields.push((0u32.wrapping_sub(sum) & 255) as u8);
        let mut text = String::from(":");
        for byte in fields {
            use std::fmt::Write;
            write!(text, "{byte:02X}").unwrap();
        }
        text.push('\n');
        text
    }

    fn raw(sp: u32, pc: u32) -> Vec<u8> {
        let mut bytes = Vec::from(sp.to_le_bytes());
        bytes.extend_from_slice(&pc.to_le_bytes());
        bytes.extend_from_slice(&[0x70, 0x47]);
        bytes
    }

    fn valid_raw() -> Vec<u8> {
        raw(0x2005_0000, VECTOR_ADDRESS + 9)
    }

    // Fixture CRC uses the forward polynomial and reflected input/output,
    // independently of the production right-shifting register implementation.
    fn seal_dfu(input: &mut [u8]) {
        let checksum_at = input.len() - 4;
        let mut state = u32::MAX;
        for byte in &input[..checksum_at] {
            state ^= u32::from(byte.reverse_bits()) << 24;
            for _ in 0..8 {
                let top = state >> 31;
                state = (state << 1) ^ if top == 0 { 0 } else { 0x04c1_1db7 };
            }
        }
        input[checksum_at..].copy_from_slice(&state.reverse_bits().to_le_bytes());
    }

    pub(crate) fn fixture_dfu(payload: &[u8]) -> Vec<u8> {
        let mut bytes = b"DfuSe\x01".to_vec();
        bytes.extend_from_slice(&(293u32 + payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(b"\x01Target\x00");
        bytes.resize(277, 0); // unnamed target, inert 255-byte name
        bytes.extend_from_slice(&(8u32 + payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&VECTOR_ADDRESS.to_le_bytes());
        bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(payload);
        bytes.extend_from_slice(b"\x00\x00\x08\x00\x94\x06\x1a\x01UFD\x10\x00\x00\x00\x00");
        seal_dfu(&mut bytes);
        bytes
    }

    #[test]
    fn dfu_crc_known_answers_and_canonical_application() {
        assert_eq!(dfu_crc(b"123456789"), 0x340b_c6d9);
        let input = fixture_dfu(&valid_raw());
        // Fixed external Python/zlib fixture checksum, not derived by the decoder.
        assert_eq!(&input[input.len() - 4..], &0x9389_81eau32.to_le_bytes());
        assert_eq!(admit_dfu(&input), admit_raw(&valid_raw()));
        let mut whole_file_size = input.clone();
        whole_file_size[6..10].copy_from_slice(&(input.len() as u32).to_le_bytes());
        seal_dfu(&mut whole_file_size);
        assert_eq!(admit_dfu(&whole_file_size), admit_raw(&valid_raw()));
    }

    #[test]
    fn dfu_corruption_truncation_and_input_bound() {
        let input = fixture_dfu(&valid_raw());
        for end in 0..input.len() {
            assert!(admit_dfu(&input[..end]).is_err(), "length {end}");
        }
        for offset in [22, 293, input.len() - 1] {
            let mut corrupt = input.clone();
            corrupt[offset] ^= 1;
            assert_eq!(admit_dfu(&corrupt), Err(ImageError::DfuChecksumMismatch));
        }
        let mut trailing = input;
        trailing.push(0);
        assert_eq!(admit_dfu(&trailing), Err(ImageError::MalformedDfu));
        assert_eq!(
            admit_dfu(&vec![0; INPUT_LIMIT + 1]),
            Err(ImageError::InputTooLarge)
        );
    }

    #[test]
    fn dfu_valid_crc_does_not_authorize_other_targets_or_boot_regions() {
        for (offset, value) in [
            (10, 0),
            (10, 2),
            (17, 1),
            (281, 0),
            (281, 2),
            (285, 0x0800_8000),
        ] {
            let mut input = fixture_dfu(&valid_raw());
            if [10, 17].contains(&offset) {
                input[offset] = value as u8;
            } else {
                input[offset..offset + 4].copy_from_slice(&(value as u32).to_le_bytes());
            }
            seal_dfu(&mut input);
            assert_eq!(admit_dfu(&input), Err(ImageError::UnsupportedDfuLayout));
        }
    }

    #[test]
    fn dfu_declared_geometry_and_signatures_are_strict() {
        for (offset, value) in [(6, 0), (18, 2), (277, u32::MAX), (289, 0), (289, u32::MAX)] {
            let mut input = fixture_dfu(&valid_raw());
            input[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
            seal_dfu(&mut input);
            assert_eq!(admit_dfu(&input), Err(ImageError::MalformedDfu));
        }
        for offset in [0, 5, 11, 303 + 6, 303 + 8, 303 + 11] {
            let mut input = fixture_dfu(&valid_raw());
            input[offset] ^= 1;
            seal_dfu(&mut input);
            assert_eq!(admit_dfu(&input), Err(ImageError::MalformedDfu));
        }
    }

    #[test]
    fn dfu_labels_and_usb_identifiers_are_inert_metadata() {
        let mut input = fixture_dfu(&valid_raw());
        input[18..22].copy_from_slice(&1u32.to_le_bytes());
        let label = b"../../not-an-input-path";
        input[22..22 + label.len()].copy_from_slice(label);
        let suffix = input.len() - 16;
        input[suffix..suffix + 6].fill(0xff);
        seal_dfu(&mut input);
        assert_eq!(admit_dfu(&input), admit_raw(&valid_raw()));
    }

    #[test]
    fn dfu_application_uses_existing_vector_and_flash_validation() {
        for (payload, error) in [
            (raw(0, VECTOR_ADDRESS + 9), ImageError::InvalidStackPointer),
            (
                raw(0x2005_0000, VECTOR_ADDRESS + 8),
                ImageError::InvalidResetPc,
            ),
            (
                raw(0x2005_0000, VECTOR_ADDRESS + 11),
                ImageError::MissingResetOpcode,
            ),
        ] {
            assert_eq!(admit_dfu(&fixture_dfu(&payload)), Err(error));
        }
        let mut payload = valid_raw();
        payload.resize((FLASH_END - VECTOR_ADDRESS) as usize, 0xff);
        assert_eq!(admit_dfu(&fixture_dfu(&payload)), admit_raw(&payload));
        payload.push(0);
        assert_eq!(
            admit_dfu(&fixture_dfu(&payload)),
            Err(ImageError::OutsideFlash)
        );
    }

    fn hex_with(records: &[(u8, u16, &[u8])]) -> Vec<u8> {
        records
            .iter()
            .map(|(kind, address, data)| record(*kind, *address, data))
            .collect::<String>()
            .into_bytes()
    }

    fn valid_hex() -> Vec<u8> {
        hex_with(&[(4, 0, &[8, 1]), (0, 0, &valid_raw()), (1, 0, &[])])
    }

    #[test]
    fn raw_preserves_bytes_and_vectors() {
        let input = valid_raw();
        let admitted = admit_raw(&input).unwrap();
        assert_eq!(admitted.bytes, input);
        assert_eq!(admitted.load_address, VECTOR_ADDRESS);
        assert_eq!(admitted.vector_address, VECTOR_ADDRESS);
        assert_eq!(admitted.stack_pointer, 0x2005_0000);
        assert_eq!(admitted.reset_pc, VECTOR_ADDRESS + 9);
        let only_vectors = raw(0x2000_0008, VECTOR_ADDRESS + 1);
        assert!(admit_raw(&only_vectors[..8]).is_ok());
    }

    #[test]
    fn raw_sizes_and_flash_boundary() {
        for length in 0..8 {
            assert_eq!(admit_raw(&vec![0; length]), Err(ImageError::RawTooShort));
        }
        let mut input = valid_raw();
        input.resize((FLASH_END - VECTOR_ADDRESS) as usize, 0xa5);
        assert_eq!(admit_raw(&input).unwrap().bytes, input);
        input.push(0);
        assert_eq!(admit_raw(&input), Err(ImageError::OutsideFlash));
        input.resize(INPUT_LIMIT, 0);
        assert_eq!(admit_raw(&input), Err(ImageError::OutsideFlash));
        input.push(0);
        assert_eq!(admit_raw(&input), Err(ImageError::InputTooLarge));
    }

    #[test]
    fn stack_and_pc_rules() {
        for sp in [
            0,
            0x2000_0000,
            0x2000_0001,
            0x2000_0004,
            0x2005_0008,
            u32::MAX,
        ] {
            assert_eq!(
                admit_raw(&raw(sp, VECTOR_ADDRESS + 9)),
                Err(ImageError::InvalidStackPointer)
            );
        }
        assert!(admit_raw(&raw(0x2000_0008, VECTOR_ADDRESS + 9)).is_ok());
        for pc in [0, VECTOR_ADDRESS + 8, u32::MAX - 1] {
            assert_eq!(
                admit_raw(&raw(0x2000_0008, pc)),
                Err(ImageError::InvalidResetPc)
            );
        }
        for pc in [1, VECTOR_ADDRESS - 1, VECTOR_ADDRESS + 11, u32::MAX] {
            assert_eq!(
                admit_raw(&raw(0x2000_0008, pc)),
                Err(ImageError::MissingResetOpcode)
            );
        }
        assert_eq!(
            admit_raw(&valid_raw()[..9]),
            Err(ImageError::MissingResetOpcode)
        );
    }

    #[test]
    fn hex_syntax_checksum_and_length() {
        assert_eq!(admit_hex(&[0xff]), Err(ImageError::NonAscii));
        for input in [b"00000001FF".as_slice(), b":0\n", b":00000001FG\n"] {
            assert_eq!(admit_hex(input), Err(ImageError::InvalidHexLine));
        }
        assert_eq!(
            admit_hex(b":01000001FF\n"),
            Err(ImageError::RecordLengthMismatch)
        );
        assert_eq!(
            admit_hex(b":00000001FE\n"),
            Err(ImageError::ChecksumMismatch)
        );
        assert_eq!(admit_hex(b":\n"), Err(ImageError::RecordLengthMismatch));
        let mut input = b"\n \t\r\n".to_vec();
        input.extend(
            String::from_utf8(valid_hex())
                .unwrap()
                .to_lowercase()
                .replace('\n', "\r\n")
                .as_bytes(),
        );
        assert_eq!(admit_hex(&input).unwrap().bytes, valid_raw());
    }

    #[test]
    fn eof_order_and_empty_data() {
        assert_eq!(admit_hex(b""), Err(ImageError::MissingEof));
        assert_eq!(
            admit_hex(record(1, 0, &[]).as_bytes()),
            Err(ImageError::EmptyData)
        );
        assert_eq!(
            admit_hex(&hex_with(&[(0, 0, &[]), (1, 0, &[])])),
            Err(ImageError::EmptyData)
        );
        let mut missing = valid_hex();
        missing.truncate(missing.len() - record(1, 0, &[]).len());
        assert_eq!(admit_hex(&missing), Err(ImageError::MissingEof));
        for tail in [
            record(1, 0, &[]),
            record(0, 0, &[1]),
            String::from("invalid\n"),
        ] {
            let mut input = valid_hex();
            input.extend(tail.as_bytes());
            assert_eq!(admit_hex(&input), Err(ImageError::RecordsAfterEof));
        }
    }

    #[test]
    fn record_types_and_metadata() {
        for kind in [1, 2, 3, 4, 5] {
            let wrong_count = if kind == 1 { vec![0] } else { vec![] };
            assert_eq!(
                admit_hex(record(kind, 0, &wrong_count).as_bytes()),
                Err(ImageError::MalformedRecord)
            );
            let proper_count = match kind {
                1 => 0,
                2 | 4 => 2,
                _ => 4,
            };
            assert_eq!(
                admit_hex(record(kind, 1, &vec![0; proper_count]).as_bytes()),
                Err(ImageError::MalformedRecord)
            );
        }
        assert_eq!(
            admit_hex(record(6, 0, &[]).as_bytes()),
            Err(ImageError::UnsupportedRecordType)
        );
        let input = hex_with(&[
            (4, 0, &[8, 1]),
            (3, 0, &[0xff; 4]),
            (5, 0, &[0; 4]),
            (0, 0, &valid_raw()),
            (1, 0, &[]),
        ]);
        assert_eq!(admit_hex(&input).unwrap().reset_pc, VECTOR_ADDRESS + 9);
        let invalid = raw(0x2000_0008, VECTOR_ADDRESS + 8);
        let input = hex_with(&[
            (4, 0, &[8, 1]),
            (0, 0, &invalid),
            (5, 0, &(VECTOR_ADDRESS + 9).to_be_bytes()),
            (1, 0, &[]),
        ]);
        assert_eq!(admit_hex(&input), Err(ImageError::InvalidResetPc));
    }

    #[test]
    fn address_bounds_and_checked_arithmetic() {
        for (upper, address, data, error) in [
            ([7, 255], 0xffff, vec![1], ImageError::OutsideFlash),
            ([8, 16], 0, vec![1], ImageError::OutsideFlash),
            ([8, 15], 0xffff, vec![1, 2], ImageError::OutsideFlash),
            ([255, 255], 0xffff, vec![1, 2], ImageError::AddressOverflow),
        ] {
            let input = hex_with(&[(4, 0, &upper), (0, address, &data), (1, 0, &[])]);
            assert_eq!(admit_hex(&input), Err(error));
        }
        let input = hex_with(&[
            (4, 0, &[8, 0]),
            (0, 0, &[0x12]),
            (4, 0, &[8, 1]),
            (0, 0, &valid_raw()),
            (4, 0, &[8, 15]),
            (0, 0xffff, &[0x34]),
            (1, 0, &[]),
        ]);
        let admitted = admit_hex(&input).unwrap();
        assert_eq!(admitted.load_address, FLASH_START);
        assert_eq!(admitted.bytes.len(), (FLASH_END - FLASH_START) as usize);
        assert_eq!(admitted.bytes[0], 0x12);
        assert_eq!(admitted.bytes.last(), Some(&0x34));
        // Segment mode cannot reach this platform's supported flash interval.
        let input = hex_with(&[(2, 0, &[0x80, 0]), (0, 0, &[1]), (1, 0, &[])]);
        assert_eq!(admit_hex(&input), Err(ImageError::OutsideFlash));
    }

    #[test]
    fn overlap_and_hole_fill_preserve_data() {
        let vectors = valid_raw();
        let input = hex_with(&[
            (4, 0, &[8, 1]),
            (0, 20, &[0x23, 0xff]),
            (0, 0, &vectors),
            (0, 2, &vectors[2..7]),
            (1, 0, &[]),
        ]);
        let admitted = admit_hex(&input).unwrap();
        assert_eq!(&admitted.bytes[..10], vectors);
        assert_eq!(&admitted.bytes[10..20], &[0xff; 10]);
        assert_eq!(&admitted.bytes[20..], &[0x23, 0xff]);
        let input = hex_with(&[
            (4, 0, &[8, 1]),
            (0, 0, &vectors),
            (0, 8, &[0x71]),
            (1, 0, &[]),
        ]);
        assert_eq!(admit_hex(&input), Err(ImageError::ConflictingWrite));
    }

    #[test]
    fn missing_vectors_and_opcode_are_not_filled() {
        let original = valid_raw();
        for omitted in 0..8 {
            let mut input = record(4, 0, &[8, 1]);
            for (offset, byte) in original.iter().enumerate() {
                if offset != omitted {
                    input.push_str(&record(0, offset as u16, &[*byte]));
                }
            }
            input.push_str(&record(1, 0, &[]));
            assert_eq!(admit_hex(input.as_bytes()), Err(ImageError::MissingVector));
        }
        for data in [&original[..8], &original[..9]] {
            let input = hex_with(&[(4, 0, &[8, 1]), (0, 0, data), (0, 20, &[0]), (1, 0, &[])]);
            assert_eq!(admit_hex(&input), Err(ImageError::MissingResetOpcode));
        }
        let input = hex_with(&[
            (4, 0, &[8, 1]),
            (0, 0, &original[..8]),
            (0, 8, &[0xff, 0xff]),
            (1, 0, &[]),
        ]);
        assert_eq!(admit_hex(&input).unwrap().bytes[8..], [0xff, 0xff]);
    }

    #[test]
    fn hex_input_limit_is_checked_first() {
        let mut input = valid_hex();
        input.resize(INPUT_LIMIT, b'\n');
        assert!(admit_hex(&input).is_ok());
        input.push(0xff);
        assert_eq!(admit_hex(&input), Err(ImageError::InputTooLarge));
    }
}
