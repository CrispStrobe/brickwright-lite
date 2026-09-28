//! Bounded, loopback-only GDB Remote Serial Protocol client for Renode.
//!
//! This is transport, not a Tauri command. The CP05 semantic adapter owns it
//! and exposes only debugger operations from the closed native vocabulary.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::mpsc::SyncSender;
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

pub(crate) struct RenodeRspInterrupt {
    stream: TcpStream,
}

impl RenodeRspInterrupt {
    pub(crate) fn request(&mut self) -> Result<(), String> {
        self.stream
            .write_all(&[0x03])
            .map_err(|_| "Renode debugger interrupt failed".to_owned())
    }
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
        let mut rsp = Self { stream };
        // Renode reports the initial halted state immediately after accepting
        // the connection, before it will acknowledge the first request.
        // Consume and acknowledge that bounded stop frame so it cannot be
        // mistaken for the acknowledgement to `g`.
        let initial = rsp.read_packet()?;
        if !matches!(initial.first(), Some(b'S' | b'T')) {
            return Err("Renode debugger returned an invalid initial state".into());
        }
        Ok(rsp)
    }

    pub(crate) fn interrupt_handle(&self) -> Result<RenodeRspInterrupt, String> {
        self.stream
            .try_clone()
            .map(|stream| RenodeRspInterrupt { stream })
            .map_err(|_| "Renode debugger unavailable".to_owned())
    }

    pub(crate) fn registers(&mut self) -> Result<CortexMRegisters, String> {
        let payload = self.exchange(b"g")?;
        // Renode's Cortex-M `g` frame contains the sixteen core registers.
        // xPSR is a non-general register (GDB register 25 / 0x19) and must be
        // requested separately with `p`.
        let bytes = decode_hex(&payload, 16 * 4, MAX_PACKET_BYTES)?;
        if bytes.len() < 16 * 4 {
            return Err("Renode debugger returned a short register frame".into());
        }
        let mut r = [0u32; 16];
        for (index, value) in r.iter_mut().enumerate() {
            let offset = index * 4;
            *value = u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        }
        let xpsr_payload = self.exchange(b"p19")?;
        let xpsr_bytes = decode_hex(&xpsr_payload, 4, 4)?;
        let xpsr = u32::from_le_bytes(xpsr_bytes.try_into().unwrap());
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
        self.resume_started(None)
    }

    pub(crate) fn resume_started(
        &mut self,
        started: Option<SyncSender<()>>,
    ) -> Result<Vec<u8>, String> {
        let result = self.send_packet(b"c").and_then(|()| {
            self.stream
                .set_read_timeout(None)
                .map_err(|_| "Renode debugger unavailable".to_owned())?;
            if let Some(started) = started {
                let _ = started.send(());
            }
            self.read_packet()
        });
        let restore = self.stream.set_read_timeout(Some(IO_TIMEOUT));
        if restore.is_err() {
            return Err("Renode debugger unavailable".into());
        }
        result
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
        self.send_packet(payload)?;
        self.read_packet()
    }

    fn send_packet(&mut self, payload: &[u8]) -> Result<(), String> {
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
        // A model observer can briefly pause the machine while we are idle.
        // Renode reports that as an asynchronous stop packet, which can race
        // the acknowledgement for this request. Acknowledge bounded async
        // packets, then continue waiting for the request ACK.
        for _ in 0..=4 {
            self.stream
                .read_exact(&mut ack)
                .map_err(|_| "Renode debugger acknowledgement failed".to_owned())?;
            match ack[0] {
                b'+' => return Ok(()),
                b'-' => return Err("Renode debugger rejected the packet".into()),
                b'$' => {
                    self.read_packet_after_start()?;
                }
                _ => {}
            }
        }
        Err("Renode debugger acknowledgement was not received".into())
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
        self.read_packet_after_start()
    }

    fn read_packet_after_start(&mut self) -> Result<Vec<u8>, String> {
        let mut byte = [0u8; 1];
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
            stream.write_all(&packet(b"S05")).unwrap();
            let mut initial_ack = [0u8; 1];
            stream.read_exact(&mut initial_ack).unwrap();
            assert_eq!(initial_ack[0], b'+');
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
        let register_bytes: Vec<u8> = (0u32..16).flat_map(u32::to_le_bytes).collect();
        let register_hex = register_bytes
            .iter()
            .flat_map(|byte| format!("{byte:02x}").into_bytes())
            .collect();
        let (endpoint, server) = serve(vec![
            register_hex,
            b"10000000".to_vec(),
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
                b"p19".to_vec(),
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

    #[test]
    fn cloned_interrupt_stops_an_acknowledged_continue() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.write_all(&packet(b"S05")).unwrap();
            let mut initial_ack = [0u8; 1];
            stream.read_exact(&mut initial_ack).unwrap();
            assert_eq!(initial_ack, [b'+']);
            let mut request = [0u8; 5];
            stream.read_exact(&mut request).unwrap();
            assert_eq!(&request[..2], b"$c");
            stream.write_all(b"+").unwrap();
            let mut interrupt = [0u8; 1];
            stream.read_exact(&mut interrupt).unwrap();
            assert_eq!(interrupt, [0x03]);
            stream.write_all(&packet(b"S02")).unwrap();
            let mut ack = [0u8; 1];
            stream.read_exact(&mut ack).unwrap();
            assert_eq!(ack, [b'+']);
        });
        let mut rsp = RenodeRsp::connect(endpoint).unwrap();
        let mut interrupt = rsp.interrupt_handle().unwrap();
        let (started_tx, started_rx) = std::sync::mpsc::sync_channel(0);
        let interrupter = thread::spawn(move || {
            started_rx.recv().unwrap();
            interrupt.request().unwrap();
        });
        assert_eq!(rsp.resume_started(Some(started_tx)).unwrap(), b"S02");
        interrupter.join().unwrap();
        server.join().unwrap();
    }

    #[test]
    fn acknowledges_an_async_stop_before_the_request_ack() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.write_all(&packet(b"S05")).unwrap();
            let mut byte = [0u8; 1];
            stream.read_exact(&mut byte).unwrap();
            assert_eq!(byte, [b'+']);

            let mut request = [0u8; 5];
            stream.read_exact(&mut request).unwrap();
            assert_eq!(&request[..2], b"$g");
            stream.write_all(&packet(b"T05")).unwrap();
            stream.read_exact(&mut byte).unwrap();
            assert_eq!(byte, [b'+']);
            stream.write_all(b"+").unwrap();
            stream.write_all(&packet(&vec![b'0'; 16 * 8])).unwrap();
            stream.read_exact(&mut byte).unwrap();
            assert_eq!(byte, [b'+']);
            let mut xpsr = [0u8; 7];
            stream.read_exact(&mut xpsr).unwrap();
            assert_eq!(&xpsr[..4], b"$p19");
            stream.write_all(b"+").unwrap();
            stream.write_all(&packet(b"00000000")).unwrap();
            stream.read_exact(&mut byte).unwrap();
            assert_eq!(byte, [b'+']);
        });
        let mut rsp = RenodeRsp::connect(endpoint).unwrap();
        assert_eq!(rsp.registers().unwrap().r, [0; 16]);
        server.join().unwrap();
    }
}
