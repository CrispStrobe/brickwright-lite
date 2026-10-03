// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
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
//
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

//! A closed, authored UART request/reply contract. This module makes no
//! firmware compatibility claim and performs no transport or device access.

use serde_json::{Map, Value};
use std::fmt;

const MAX_GENERATION: u64 = 9_007_199_254_740_991;
const MAX_WRITE_BYTES: usize = 32;
const MAX_READ_BYTES: usize = 4096;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UartRequest {
    Write { generation: u64, bytes: Vec<u8> },
    Read { generation: u64, max_bytes: usize },
    Close { generation: u64 },
}

impl UartRequest {
    pub fn generation(&self) -> u64 {
        match self {
            Self::Write { generation, .. }
            | Self::Read { generation, .. }
            | Self::Close { generation } => *generation,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UartReply {
    Written { generation: u64, count: usize },
    Bytes { generation: u64, bytes: Vec<u8> },
    Closed { generation: u64 },
}

/// Error variants and display strings never include supplied values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UartContractError {
    UnsupportedCommand,
    InvalidRequest,
    InvalidReply,
}

impl fmt::Display for UartContractError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::UnsupportedCommand => "unsupported UART command",
            Self::InvalidRequest => "invalid UART request",
            Self::InvalidReply => "invalid UART reply",
        })
    }
}

impl std::error::Error for UartContractError {}

fn exact_object<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Map<String, Value>> {
    let object = value.as_object()?;
    (object.len() == keys.len() && keys.iter().all(|key| object.contains_key(*key)))
        .then_some(object)
}

fn integer(value: &Value, min: u64, max: u64) -> Option<u64> {
    let number = value.as_u64()?;
    (min..=max).contains(&number).then_some(number)
}

fn generation(object: &Map<String, Value>) -> Option<u64> {
    integer(object.get("generation")?, 1, MAX_GENERATION)
}

fn bytes(value: &Value, min: usize, max: usize) -> Option<Vec<u8>> {
    let array = value.as_array()?;
    if !(min..=max).contains(&array.len()) {
        return None;
    }
    array
        .iter()
        .map(|byte| integer(byte, 0, 255).map(|n| n as u8))
        .collect()
}

pub fn parse_request(name: &str, args: &Value) -> Result<UartRequest, UartContractError> {
    let invalid = UartContractError::InvalidRequest;
    match name {
        "micropython.uart.write" => {
            let object = exact_object(args, &["generation", "bytes"]).ok_or(invalid)?;
            Ok(UartRequest::Write {
                generation: generation(object).ok_or(invalid)?,
                bytes: bytes(&object["bytes"], 1, MAX_WRITE_BYTES).ok_or(invalid)?,
            })
        }
        "micropython.uart.read" => {
            let object = exact_object(args, &["generation", "maxBytes"]).ok_or(invalid)?;
            Ok(UartRequest::Read {
                generation: generation(object).ok_or(invalid)?,
                max_bytes: integer(&object["maxBytes"], 1, MAX_READ_BYTES as u64).ok_or(invalid)?
                    as usize,
            })
        }
        "micropython.uart.close" => {
            let object = exact_object(args, &["generation"]).ok_or(invalid)?;
            Ok(UartRequest::Close {
                generation: generation(object).ok_or(invalid)?,
            })
        }
        _ => Err(UartContractError::UnsupportedCommand),
    }
}

pub fn parse_reply(request: &UartRequest, data: &Value) -> Result<UartReply, UartContractError> {
    let invalid = UartContractError::InvalidReply;
    let keys: &[&str] = match request {
        UartRequest::Write { .. } => &["generation", "count"],
        UartRequest::Read { .. } => &["generation", "bytes"],
        UartRequest::Close { .. } => &["generation", "closed"],
    };
    let object = exact_object(data, keys).ok_or(invalid)?;
    let reply_generation = generation(object).ok_or(invalid)?;
    if reply_generation != request.generation() {
        return Err(invalid);
    }
    match request {
        UartRequest::Write { bytes, .. } => {
            // Validate public enum values as well as requests made by parse_request.
            if !(1..=MAX_WRITE_BYTES).contains(&bytes.len()) {
                return Err(invalid);
            }
            let count =
                integer(&object["count"], 1, MAX_WRITE_BYTES as u64).ok_or(invalid)? as usize;
            if count != bytes.len() {
                return Err(invalid);
            }
            Ok(UartReply::Written {
                generation: reply_generation,
                count,
            })
        }
        UartRequest::Read { max_bytes, .. } => {
            if !(1..=MAX_READ_BYTES).contains(max_bytes) {
                return Err(invalid);
            }
            Ok(UartReply::Bytes {
                generation: reply_generation,
                bytes: bytes(&object["bytes"], 0, *max_bytes).ok_or(invalid)?,
            })
        }
        UartRequest::Close { .. } => {
            if object["closed"].as_bool() != Some(true) {
                return Err(invalid);
            }
            Ok(UartReply::Closed {
                generation: reply_generation,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn request_boundaries_and_accessors() {
        for generation in [1, MAX_GENERATION] {
            for len in [1, 32] {
                let payload = vec![255; len];
                let request = parse_request(
                    "micropython.uart.write",
                    &json!({"generation":generation,"bytes":payload}),
                )
                .unwrap();
                assert_eq!(request.generation(), generation);
                assert_eq!(
                    request,
                    UartRequest::Write {
                        generation,
                        bytes: payload
                    }
                );
            }
            for max_bytes in [1, 4096] {
                assert_eq!(
                    parse_request(
                        "micropython.uart.read",
                        &json!({"generation":generation,"maxBytes":max_bytes})
                    )
                    .unwrap(),
                    UartRequest::Read {
                        generation,
                        max_bytes
                    }
                );
            }
            assert_eq!(
                parse_request("micropython.uart.close", &json!({"generation":generation})).unwrap(),
                UartRequest::Close { generation }
            );
        }
        assert!(parse_request(
            "micropython.uart.write",
            &json!({"generation":1,"bytes":[0,255]})
        )
        .is_ok());
    }

    #[test]
    fn request_numbers_are_strict() {
        let bad = [
            json!(0),
            json!(MAX_GENERATION + 1),
            json!(-1),
            json!(1.0),
            json!(true),
            json!("1"),
            Value::Null,
        ];
        for value in bad {
            for (name, mut args) in [
                (
                    "micropython.uart.write",
                    json!({"generation":1,"bytes":[1]}),
                ),
                (
                    "micropython.uart.read",
                    json!({"generation":1,"maxBytes":1}),
                ),
                ("micropython.uart.close", json!({"generation":1})),
            ] {
                args["generation"] = value.clone();
                assert_eq!(
                    parse_request(name, &args),
                    Err(UartContractError::InvalidRequest)
                );
            }
        }
        for value in [
            json!(0),
            json!(4097),
            json!(-1),
            json!(1.0),
            json!(true),
            json!("1"),
            Value::Null,
        ] {
            assert!(parse_request(
                "micropython.uart.read",
                &json!({"generation":1,"maxBytes":value})
            )
            .is_err());
        }
        for value in [
            json!(-1),
            json!(256),
            json!(0.0),
            json!(true),
            json!("0"),
            Value::Null,
        ] {
            assert!(parse_request(
                "micropython.uart.write",
                &json!({"generation":1,"bytes":[value]})
            )
            .is_err());
        }
        for value in [
            json!([]),
            json!(vec![0; 33]),
            json!("bytes"),
            json!({}),
            Value::Null,
        ] {
            assert!(parse_request(
                "micropython.uart.write",
                &json!({"generation":1,"bytes":value})
            )
            .is_err());
        }
    }

    #[test]
    fn requests_are_closed_objects() {
        for (name, args) in [
            (
                "micropython.uart.write",
                json!({"generation":1,"bytes":[0]}),
            ),
            (
                "micropython.uart.read",
                json!({"generation":1,"maxBytes":1}),
            ),
            ("micropython.uart.close", json!({"generation":1})),
        ] {
            for key in ["port", "path", "code", "endpoint", "monitor", "extra"] {
                let mut extra = args.clone();
                extra[key] = json!("private-value");
                assert!(parse_request(name, &extra).is_err());
            }
            for key in args.as_object().unwrap().keys() {
                let mut missing = args.clone();
                missing.as_object_mut().unwrap().remove(key);
                assert!(parse_request(name, &missing).is_err());
            }
            for value in [json!([]), json!(1), json!(true), Value::Null] {
                assert!(parse_request(name, &value).is_err());
            }
        }
        for name in [
            "",
            "micropython.uart",
            "micropython.uart.open",
            "MICROPYTHON.UART.WRITE",
        ] {
            assert_eq!(
                parse_request(name, &json!({})),
                Err(UartContractError::UnsupportedCommand)
            );
        }
    }

    #[test]
    fn successful_reply_boundaries() {
        for generation in [1, MAX_GENERATION] {
            for count in [1, 32] {
                let request = UartRequest::Write {
                    generation,
                    bytes: vec![0; count],
                };
                assert_eq!(
                    parse_reply(&request, &json!({"generation":generation,"count":count})).unwrap(),
                    UartReply::Written { generation, count }
                );
            }
            for len in [0, 1, 4096] {
                let request = UartRequest::Read {
                    generation,
                    max_bytes: 4096,
                };
                let payload = vec![255; len];
                assert_eq!(
                    parse_reply(&request, &json!({"generation":generation,"bytes":payload}))
                        .unwrap(),
                    UartReply::Bytes {
                        generation,
                        bytes: payload
                    }
                );
            }
            assert_eq!(
                parse_reply(
                    &UartRequest::Close { generation },
                    &json!({"generation":generation,"closed":true})
                )
                .unwrap(),
                UartReply::Closed { generation }
            );
        }
    }

    #[test]
    fn replies_reject_mismatch_wrong_shape_and_types() {
        for (request, reply) in [
            (
                UartRequest::Write {
                    generation: 1,
                    bytes: vec![0, 1],
                },
                json!({"generation":1,"count":2}),
            ),
            (
                UartRequest::Read {
                    generation: 1,
                    max_bytes: 2,
                },
                json!({"generation":1,"bytes":[0,255]}),
            ),
            (
                UartRequest::Close { generation: 1 },
                json!({"generation":1,"closed":true}),
            ),
        ] {
            for value in [
                json!(2),
                json!(0),
                json!(-1),
                json!(1.0),
                json!("1"),
                json!(true),
                Value::Null,
            ] {
                let mut bad = reply.clone();
                bad["generation"] = value;
                assert_eq!(
                    parse_reply(&request, &bad),
                    Err(UartContractError::InvalidReply)
                );
            }
            for key in ["port", "path", "code", "endpoint", "monitor", "extra"] {
                let mut bad = reply.clone();
                bad[key] = json!("private-value");
                assert!(parse_reply(&request, &bad).is_err());
            }
            for key in reply.as_object().unwrap().keys() {
                let mut bad = reply.clone();
                bad.as_object_mut().unwrap().remove(key);
                assert!(parse_reply(&request, &bad).is_err());
            }
            for value in [json!([]), json!(true), json!(1), Value::Null] {
                assert!(parse_reply(&request, &value).is_err());
            }
        }
    }

    #[test]
    fn replies_reject_partial_writes_and_oversized_or_invalid_reads() {
        let write = UartRequest::Write {
            generation: 1,
            bytes: vec![0, 1],
        };
        for count in [
            json!(0),
            json!(1),
            json!(3),
            json!(33),
            json!(-1),
            json!(2.0),
            json!(true),
            json!("2"),
            Value::Null,
        ] {
            assert!(parse_reply(&write, &json!({"generation":1,"count":count})).is_err());
        }
        let read = UartRequest::Read {
            generation: 1,
            max_bytes: 2,
        };
        for payload in [
            json!([0, 1, 2]),
            json!(vec![0; 4097]),
            json!([-1]),
            json!([256]),
            json!([0.0]),
            json!([true]),
            json!(["0"]),
            json!([null]),
            json!("bytes"),
            Value::Null,
        ] {
            assert!(parse_reply(&read, &json!({"generation":1,"bytes":payload})).is_err());
        }
        for closed in [json!(false), json!(1), json!("true"), Value::Null] {
            assert!(parse_reply(
                &UartRequest::Close { generation: 1 },
                &json!({"generation":1,"closed":closed})
            )
            .is_err());
        }
    }

    #[test]
    fn forged_requests_and_error_messages_are_bounded() {
        for request in [
            UartRequest::Close { generation: 0 },
            UartRequest::Close {
                generation: MAX_GENERATION + 1,
            },
        ] {
            assert!(parse_reply(
                &request,
                &json!({"generation":request.generation(),"closed":true})
            )
            .is_err());
        }
        for len in [0, 33] {
            assert!(parse_reply(
                &UartRequest::Write {
                    generation: 1,
                    bytes: vec![0; len]
                },
                &json!({"generation":1,"count":len})
            )
            .is_err());
        }
        for max_bytes in [0, 4097] {
            assert!(parse_reply(
                &UartRequest::Read {
                    generation: 1,
                    max_bytes
                },
                &json!({"generation":1,"bytes":[]})
            )
            .is_err());
        }
        assert_eq!(
            UartContractError::UnsupportedCommand.to_string(),
            "unsupported UART command"
        );
        assert_eq!(
            UartContractError::InvalidRequest.to_string(),
            "invalid UART request"
        );
        assert_eq!(
            UartContractError::InvalidReply.to_string(),
            "invalid UART reply"
        );
    }
}
