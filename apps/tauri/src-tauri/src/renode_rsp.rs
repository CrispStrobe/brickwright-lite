//! Bounded, loopback-only GDB Remote Serial Protocol client for Renode.
//!
//! This is transport, not a Tauri command. The CP05 semantic adapter owns it
//! and exposes only debugger operations from the closed native vocabulary.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

const MAX_PACKET_BYTES: usize = 64 * 1024;
const MAX_MEMORY_BYTES: usize = 4096;
const IO_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct CortexMRegisters {
    pub(crate) r: [u32; 16],
    pub(crate) xpsr: u32,
}

pub(crate) struct RenodeRsp {
    stream: TcpStream,
}

impl RenodeRsp {
    pub(crate) fn connect(endpoint: SocketAddr) -> Result<Self, String> {
        if !endpoint.ip().is_loopback() {
            return Err("Renode debugger endpoint must be loopback".into());
        }
        let stream = TcpStream::connect_timeout(&endpoint, IO_TIMEOUT)
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        stream
            .set_read_timeout(Some(IO_TIMEOUT))
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        stream
            .set_write_timeout(Some(IO_TIMEOUT))
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        Ok(Self { stream })
    }

    pub(crate) fn registers(&mut self) -> Result<CortexMRegisters, String> {
        let payload = self.exchange(b"g")?;
        let bytes = decode_hex(&payload, 17 * 4, MAX_PACKET_BYTES)?;
        if bytes.len() < 17 * 4 {
            return Err("Renode debugger returned a short register frame".into());
        }
        let mut r = [0u32; 16];
        for (index, value) in r.iter_mut().enumerate() {
            let offset = index * 4;
            *value = u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        }
        let xpsr = u32::from_le_bytes(bytes[64..68].try_into().unwrap());
        Ok(CortexMRegisters { r, xpsr })
    }

    pub(crate) fn read_memory(&mut self, address: u32, length: usize) -> Result<Vec<u8>, String> {
        if length == 0 || length > MAX_MEMORY_BYTES {
            return Err("Renode memory read exceeds its bounds".into());
        }
        let request = format!("m{address:x},{length:x}");
        let payload = self.exchange(request.as_bytes())?;
        decode_hex(&payload, length, MAX_MEMORY_BYTES)
    }

    pub(crate) fn set_breakpoint(&mut self, address: u32) -> Result<(), String> {
        self.expect_ok(format!("Z0,{address:x},2").as_bytes())
    }

    pub(crate) fn clear_breakpoint(&mut self, address: u32) -> Result<(), String> {
        self.expect_ok(format!("z0,{address:x},2").as_bytes())
    }

    pub(crate) fn step(&mut self) -> Result<Vec<u8>, String> {
        self.exchange(b"s")
    }

    pub(crate) fn resume(&mut self) -> Result<Vec<u8>, String> {
        self.exchange(b"c")
    }

    pub(crate) fn interrupt(&mut self) -> Result<Vec<u8>, String> {
        self.stream
            .write_all(&[0x03])
            .map_err(|_| "Renode debugger write failed".to_owned())?;
        self.read_packet()
    }

    fn expect_ok(&mut self, request: &[u8]) -> Result<(), String> {
        match self.exchange(request)?.as_slice() {
            b"OK" => Ok(()),
            _ => Err("Renode debugger refused the operation".into()),
        }
    }

    fn exchange(&mut self, payload: &[u8]) -> Result<Vec<u8>, String> {
        if payload.len() > MAX_PACKET_BYTES {
            return Err("Renode debugger request exceeds its bounds".into());
        }
        let checksum = payload
            .iter()
            .fold(0u8, |sum, byte| sum.wrapping_add(*byte));
        write!(
            self.stream,
            "${}#{checksum:02x}",
            String::from_utf8_lossy(payload)
        )
        .map_err(|_| "Renode debugger write failed".to_owned())?;
        let mut ack = [0u8; 1];
        self.stream
            .read_exact(&mut ack)
            .map_err(|_| "Renode debugger acknowledgement failed".to_owned())?;
        if ack[0] != b'+' {
            return Err("Renode debugger rejected the packet".into());
        }
        self.read_packet()
    }

    fn read_packet(&mut self) -> Result<Vec<u8>, String> {
        let mut byte = [0u8; 1];
        loop {
            self.stream
                .read_exact(&mut byte)
                .map_err(|_| "Renode debugger response failed".to_owned())?;
            if byte[0] == b'$' {
                break;
            }
        }
        let mut payload = Vec::new();
        loop {
            self.stream
                .read_exact(&mut byte)
                .map_err(|_| "Renode debugger response failed".to_owned())?;
            if byte[0] == b'#' {
                break;
            }
            if payload.len() >= MAX_PACKET_BYTES {
                return Err("Renode debugger response exceeds its bounds".into());
            }
            payload.push(byte[0]);
        }
        let mut checksum = [0u8; 2];
        self.stream
            .read_exact(&mut checksum)
            .map_err(|_| "Renode debugger response failed".to_owned())?;
        let claimed = parse_hex_byte(checksum[0], checksum[1])
            .ok_or_else(|| "Renode debugger checksum is malformed".to_owned())?;
        let actual = payload
            .iter()
            .fold(0u8, |sum, value| sum.wrapping_add(*value));
        if claimed != actual {
            let _ = self.stream.write_all(b"-");
            return Err("Renode debugger checksum mismatch".into());
        }
        self.stream
            .write_all(b"+")
            .map_err(|_| "Renode debugger acknowledgement failed".to_owned())?;
        Ok(payload)
    }
}

fn parse_hex_byte(high: u8, low: u8) -> Option<u8> {
    let digit = |value: u8| match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    };
    Some(digit(high)? * 16 + digit(low)?)
}

fn decode_hex(payload: &[u8], expected: usize, limit: usize) -> Result<Vec<u8>, String> {
    if expected > limit || payload.len() != expected.saturating_mul(2) {
        return Err("Renode debugger returned an invalid byte frame".into());
    }
    payload
        .chunks_exact(2)
        .map(|pair| {
            parse_hex_byte(pair[0], pair[1])
                .ok_or_else(|| "Renode debugger returned non-hex data".to_owned())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, TcpListener};
    use std::thread;

    fn packet(payload: &[u8]) -> Vec<u8> {
        let checksum = payload
            .iter()
            .fold(0u8, |sum, byte| sum.wrapping_add(*byte));
        format!("${}#{checksum:02x}", String::from_utf8_lossy(payload)).into_bytes()
    }

    fn serve(responses: Vec<Vec<u8>>) -> (SocketAddr, thread::JoinHandle<Vec<Vec<u8>>>) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut requests = Vec::new();
            for response in responses {
                let mut start = [0u8; 1];
                stream.read_exact(&mut start).unwrap();
                while start[0] != b'$' && start[0] != 0x03 {
                    stream.read_exact(&mut start).unwrap();
                }
                if start[0] == 0x03 {
                    requests.push(vec![0x03]);
                } else {
                    let mut request = Vec::new();
                    loop {
                        stream.read_exact(&mut start).unwrap();
                        if start[0] == b'#' {
                            break;
                        }
                        request.push(start[0]);
                    }
                    let mut sum = [0u8; 2];
                    stream.read_exact(&mut sum).unwrap();
                    requests.push(request);
                    stream.write_all(b"+").unwrap();
                }
                stream.write_all(&packet(&response)).unwrap();
                let mut ack = [0u8; 1];
                stream.read_exact(&mut ack).unwrap();
                assert_eq!(ack[0], b'+');
            }
            requests
        });
        (endpoint, handle)
    }

    #[test]
    fn drives_register_memory_breakpoint_step_resume_and_pause() {
        let register_bytes: Vec<u8> = (0u32..17).flat_map(u32::to_le_bytes).collect();
        let register_hex = register_bytes
            .iter()
            .flat_map(|byte| format!("{byte:02x}").into_bytes())
            .collect();
        let (endpoint, server) = serve(vec![
            register_hex,
            b"01020304".to_vec(),
            b"OK".to_vec(),
            b"OK".to_vec(),
            b"S05".to_vec(),
            b"S05".to_vec(),
            b"S02".to_vec(),
        ]);
        let mut rsp = RenodeRsp::connect(endpoint).unwrap();
        let registers = rsp.registers().unwrap();
        assert_eq!(registers.r[15], 15);
        assert_eq!(registers.xpsr, 16);
        assert_eq!(rsp.read_memory(0x2000_0000, 4).unwrap(), [1, 2, 3, 4]);
        rsp.set_breakpoint(0x0800_0120).unwrap();
        rsp.clear_breakpoint(0x0800_0120).unwrap();
        assert_eq!(rsp.step().unwrap(), b"S05");
        assert_eq!(rsp.resume().unwrap(), b"S05");
        assert_eq!(rsp.interrupt().unwrap(), b"S02");
        assert_eq!(
            server.join().unwrap(),
            vec![
                b"g".to_vec(),
                b"m20000000,4".to_vec(),
                b"Z0,8000120,2".to_vec(),
                b"z0,8000120,2".to_vec(),
                b"s".to_vec(),
                b"c".to_vec(),
                vec![0x03],
            ]
        );
    }

    #[test]
    fn refuses_non_loopback_and_unbounded_memory() {
        let endpoint = SocketAddr::new(std::net::IpAddr::from([192, 0, 2, 1]), 3333);
        assert!(matches!(RenodeRsp::connect(endpoint),
            Err(error) if error == "Renode debugger endpoint must be loopback"));
        let (endpoint, server) = serve(Vec::new());
        let mut rsp = RenodeRsp::connect(endpoint).unwrap();
        assert!(rsp.read_memory(0, MAX_MEMORY_BYTES + 1).is_err());
        assert!(rsp.read_memory(0, 0).is_err());
        server.join().unwrap();
    }
}
