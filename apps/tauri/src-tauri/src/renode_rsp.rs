//! Bounded, loopback-only ARM GDB Remote Serial Protocol client for Renode.
//!
//! This is transport, not a Tauri command. The CP05 semantic adapter owns it
//! and exposes only debugger operations from the closed native vocabulary.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::mpsc::SyncSender;
use std::time::{Duration, Instant};

const MAX_PACKET_BYTES: usize = 64 * 1024;
const MAX_MEMORY_BYTES: usize = 4096;
const IO_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_ACK_STOP_FRAMES: usize = 32;
const MAX_ACK_BYTES: usize = 4096;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Arm32Architecture {
    CortexM,
    Arm,
}

impl Arm32Architecture {
    fn breakpoint_bytes(self) -> u8 {
        match self {
            Self::CortexM => 2,
            Self::Arm => 4,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Arm32Registers {
    pub(crate) r: [u32; 16],
    pub(crate) status: u32,
}

pub(crate) struct RenodeRsp {
    stream: TcpStream,
    architecture: Arm32Architecture,
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
    #[cfg(test)]
    pub(crate) fn connect(endpoint: SocketAddr) -> Result<Self, String> {
        Self::connect_for_architecture(endpoint, Arm32Architecture::CortexM)
    }

    pub(crate) fn connect_for_architecture(
        endpoint: SocketAddr,
        architecture: Arm32Architecture,
    ) -> Result<Self, String> {
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
        let mut rsp = Self {
            stream,
            architecture,
        };
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

    pub(crate) fn registers(&mut self) -> Result<Arm32Registers, String> {
        let payload = self.exchange(b"g")?;
        // Renode's Cortex-M `g` frame contains the sixteen core registers.
        // xPSR is a non-general register (GDB register 25 / 0x19) and must be
        // requested separately with `p`.
        let bytes = decode_hex_prefix(&payload, 16 * 4, MAX_PACKET_BYTES)?;
        if bytes.len() != 16 * 4 {
            return Err("Renode debugger returned a short register frame".into());
        }
        let mut r = [0u32; 16];
        for (index, value) in r.iter_mut().enumerate() {
            let offset = index * 4;
            *value = u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        }
        // GDB register 25 (hex 19) is xPSR on Cortex-M and CPSR on ARM.
        let status_payload = self.exchange(b"p19")?;
        let status_bytes = decode_hex(&status_payload, 4, 4)?;
        let status = u32::from_le_bytes(status_bytes.try_into().unwrap());
        Ok(Arm32Registers { r, status })
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
        self.expect_ok(
            format!("Z0,{address:x},{}", self.architecture.breakpoint_bytes()).as_bytes(),
        )
    }

    pub(crate) fn clear_breakpoint(&mut self, address: u32) -> Result<(), String> {
        self.expect_ok(
            format!("z0,{address:x},{}", self.architecture.breakpoint_bytes()).as_bytes(),
        )
    }

    pub(crate) fn step(&mut self) -> Result<Vec<u8>, String> {
        self.exchange(b"s")
    }

    #[cfg(test)]
    pub(crate) fn resume(&mut self) -> Result<Vec<u8>, String> {
        self.resume_started(None)
    }

    pub(crate) fn resume_started(
        &mut self,
        started: Option<SyncSender<Result<(), String>>>,
    ) -> Result<Vec<u8>, String> {
        let starting = self.send_packet(b"c").and_then(|()| {
            self.stream
                .set_read_timeout(None)
                .map_err(|_| "Renode debugger unavailable".to_owned())
        });
        if let Some(started) = started {
            let _ = started.send(starting.clone());
        }
        let result = starting.and_then(|()| self.read_packet());
        let restore = self.stream.set_read_timeout(Some(IO_TIMEOUT));
        if restore.is_err() {
            return Err("Renode debugger unavailable".into());
        }
        result
    }

    #[cfg(test)]
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
        let result = self.await_request_ack(Instant::now() + IO_TIMEOUT);
        // A continue removes the timeout only after this bounded handshake.
        let read_restore = self.stream.set_read_timeout(Some(IO_TIMEOUT));
        let write_restore = self.stream.set_write_timeout(Some(IO_TIMEOUT));
        if read_restore.is_err() || write_restore.is_err() {
            return Err("Renode debugger unavailable".into());
        }
        result
    }

    fn await_request_ack(&mut self, deadline: Instant) -> Result<(), String> {
        let mut consumed = 0;
        let mut stops = 0;
        loop {
            let mut byte = [0u8; 1];
            self.read_ack_bytes(&mut byte, deadline, &mut consumed)?;
            match byte[0] {
                b'+' => return Ok(()),
                b'-' => return Err("Renode debugger rejected the packet".into()),
                b'$' => {
                    if stops == MAX_ACK_STOP_FRAMES {
                        return Err("Renode debugger asynchronous stop frame limit exceeded".into());
                    }
                    let mut payload = Vec::new();
                    loop {
                        self.read_ack_bytes(&mut byte, deadline, &mut consumed)?;
                        if byte[0] == b'#' {
                            break;
                        }
                        payload.push(byte[0]);
                    }
                    let mut checksum = [0u8; 2];
                    self.read_ack_bytes(&mut checksum, deadline, &mut consumed)?;
                    let claimed = parse_hex_byte(checksum[0], checksum[1])
                        .ok_or_else(|| "Renode debugger checksum is malformed".to_owned())?;
                    let actual = payload
                        .iter()
                        .fold(0u8, |sum, value| sum.wrapping_add(*value));
                    if claimed != actual {
                        return Err("Renode debugger checksum mismatch".into());
                    }
                    if !is_async_stop(&payload) {
                        return Err(
                            "Renode debugger unexpected packet before acknowledgement".into()
                        );
                    }
                    let remaining = deadline
                        .checked_duration_since(Instant::now())
                        .filter(|remaining| !remaining.is_zero())
                        .ok_or_else(|| "Renode debugger acknowledgement timed out".to_owned())?;
                    self.stream
                        .set_write_timeout(Some(remaining))
                        .map_err(|_| "Renode debugger unavailable".to_owned())?;
                    self.stream
                        .write_all(b"+")
                        .map_err(|_| "Renode debugger acknowledgement failed".to_owned())?;
                    stops += 1;
                }
                _ => return Err("Renode debugger unexpected acknowledgement byte".into()),
            }
        }
    }

    fn read_ack_bytes(
        &mut self,
        mut bytes: &mut [u8],
        deadline: Instant,
        consumed: &mut usize,
    ) -> Result<(), String> {
        if bytes.len() > MAX_ACK_BYTES.saturating_sub(*consumed) {
            return Err("Renode debugger acknowledgement byte limit exceeded".into());
        }
        while !bytes.is_empty() {
            let remaining = deadline
                .checked_duration_since(Instant::now())
                .filter(|remaining| !remaining.is_zero())
                .ok_or_else(|| "Renode debugger acknowledgement timed out".to_owned())?;
            self.stream
                .set_read_timeout(Some(remaining))
                .map_err(|_| "Renode debugger unavailable".to_owned())?;
            match self.stream.read(bytes) {
                Ok(0) => return Err("Renode debugger acknowledgement failed".into()),
                Ok(count) => {
                    *consumed += count;
                    bytes = &mut bytes[count..];
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                    ) =>
                {
                    return Err("Renode debugger acknowledgement timed out".into());
                }
                Err(_) => return Err("Renode debugger acknowledgement failed".into()),
            }
        }
        Ok(())
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

fn is_async_stop(payload: &[u8]) -> bool {
    if payload.len() < 3 || parse_hex_byte(payload[1], payload[2]).is_none() {
        return false;
    }
    match payload[0] {
        b'S' => payload.len() == 3,
        b'T' => {
            let fields = &payload[3..];
            if fields.is_empty() {
                return true;
            }
            if !fields.ends_with(b";") {
                return false;
            }
            fields[..fields.len() - 1]
                .split(|byte| *byte == b';')
                .all(|field| {
                    let Some(split) = field.iter().position(|byte| *byte == b':') else {
                        return false;
                    };
                    let (key, value) = (&field[..split], &field[split + 1..]);
                    let hex =
                        |part: &[u8]| !part.is_empty() && part.iter().all(u8::is_ascii_hexdigit);
                    if key == b"thread" {
                        hex(value)
                            || value.strip_prefix(b"p").is_some_and(|ids| {
                                let parts: Vec<_> = ids.split(|byte| *byte == b'.').collect();
                                parts.len() == 2 && parts.iter().all(|part| hex(part))
                            })
                    } else {
                        (hex(key) || matches!(key, b"core" | b"watch" | b"rwatch" | b"awatch"))
                            && hex(value)
                    }
                })
        }
        _ => false,
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

fn decode_hex_prefix(payload: &[u8], expected: usize, limit: usize) -> Result<Vec<u8>, String> {
    let prefix = expected.saturating_mul(2);
    if expected > limit || payload.len() < prefix || payload.len() > limit.saturating_mul(2) {
        return Err("Renode debugger returned an invalid byte frame".into());
    }
    decode_hex(&payload[..prefix], expected, limit)
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
        assert_eq!(registers.status, 16);
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
    fn arm_breakpoints_use_full_width_instructions() {
        let (endpoint, server) = serve(vec![b"OK".to_vec(), b"OK".to_vec()]);
        let mut rsp =
            RenodeRsp::connect_for_architecture(endpoint, Arm32Architecture::Arm).unwrap();
        rsp.set_breakpoint(0xffff_0040).unwrap();
        rsp.clear_breakpoint(0xffff_0040).unwrap();
        assert_eq!(
            server.join().unwrap(),
            vec![b"Z0,ffff0040,4".to_vec(), b"z0,ffff0040,4".to_vec()]
        );
    }

    #[test]
    fn arm_registers_read_core_prefix_and_cpsr_from_extended_frame() {
        let register_bytes: Vec<u8> = (0x10u32..0x20).flat_map(u32::to_le_bytes).collect();
        let mut register_hex: Vec<u8> = register_bytes
            .iter()
            .flat_map(|byte| format!("{byte:02x}").into_bytes())
            .collect();
        // ARM's GDB frame may carry floating-point slots after r15. Their availability does not
        // affect the exact core-register prefix used by the semantic contract.
        register_hex.extend_from_slice(b"xxxxxxxxxxxxxxxx");
        let (endpoint, server) = serve(vec![register_hex, b"13000060".to_vec()]);
        let mut rsp =
            RenodeRsp::connect_for_architecture(endpoint, Arm32Architecture::Arm).unwrap();
        let registers = rsp.registers().unwrap();
        assert_eq!(registers.r[0], 0x10);
        assert_eq!(registers.r[15], 0x1f);
        assert_eq!(registers.status, 0x6000_0013);
        assert_eq!(server.join().unwrap(), vec![b"g".to_vec(), b"p19".to_vec()]);
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
        let (started_tx, started_rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(0);
        let interrupter = thread::spawn(move || {
            started_rx.recv().unwrap().unwrap();
            interrupt.request().unwrap();
        });
        assert_eq!(rsp.resume_started(Some(started_tx)).unwrap(), b"S02");
        interrupter.join().unwrap();
        server.join().unwrap();
    }

    #[test]
    fn reports_continue_rejection_and_closed_connection_before_started() {
        for rejection in [true, false] {
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
                assert_eq!(&request, b"$c#63");
                if rejection { stream.write_all(b"-").unwrap(); }
            });
            let mut rsp = RenodeRsp::connect(endpoint).unwrap();
            let (started_tx, started_rx) = std::sync::mpsc::sync_channel(1);
            let expected = if rejection { "Renode debugger rejected the packet" }
                else { "Renode debugger acknowledgement failed" };
            assert_eq!(rsp.resume_started(Some(started_tx)).unwrap_err(), expected);
            assert_eq!(started_rx.recv_timeout(Duration::from_millis(250)).unwrap(), Err(expected.to_owned()));
            assert_eq!(rsp.stream.read_timeout().unwrap(), Some(IO_TIMEOUT));
            assert!(matches!(started_rx.try_recv(), Err(std::sync::mpsc::TryRecvError::Disconnected)),
                "pre-start error must not also publish successful start");
            server.join().unwrap();
        }
    }

    #[test]
    fn synthetic_continue_ack_after_four_valid_stop_frames() {
        synthetic_continue_ack_after_stop_frames(4);
    }

    #[test]
    fn synthetic_continue_ack_after_five_valid_stop_frames() {
        synthetic_continue_ack_after_stop_frames(5);
    }

    #[test]
    fn synthetic_continue_ack_after_larger_valid_stop_burst() {
        synthetic_continue_ack_after_stop_frames(24);
    }

    fn synthetic_ack_wire(
        wire: Vec<u8>,
        delay: Option<Duration>,
    ) -> (Result<(), String>, Duration) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(IO_TIMEOUT)).unwrap();
            stream.write_all(&packet(b"S05")).unwrap();
            let mut ack = [0u8; 1];
            stream.read_exact(&mut ack).unwrap();
            assert_eq!(ack, [b'+']);
            let mut request = [0u8; 5];
            stream.read_exact(&mut request).unwrap();
            assert_eq!(&request, b"$c#63");
            if let Some(delay) = delay {
                for byte in wire {
                    if stream.write_all(&[byte]).is_err() {
                        break;
                    }
                    thread::sleep(delay);
                }
            } else {
                stream.write_all(&wire).unwrap();
                // Keep the peer alive while the client acknowledges a burst;
                // closing with those ACKs unread can reset the TCP connection.
                let mut acknowledgements = Vec::new();
                let _ = stream.read_to_end(&mut acknowledgements);
            }
        });
        let mut rsp = RenodeRsp::connect(endpoint).unwrap();
        let start = Instant::now();
        let result = rsp.send_packet(b"c");
        let elapsed = start.elapsed();
        assert_eq!(rsp.stream.read_timeout().unwrap(), Some(IO_TIMEOUT));
        assert_eq!(rsp.stream.write_timeout().unwrap(), Some(IO_TIMEOUT));
        drop(rsp);
        server.join().unwrap();
        (result, elapsed)
    }

    #[test]
    fn synthetic_ack_rejects_noise_nonstop_and_invalid_stop_frames() {
        for payload in [
            b"OK".as_slice(),
            b"O6869",
            b"S0z",
            b"S05extra",
            b"T05thread:;",
            b"T05thread:1",
            b"T05unknown:1;",
        ] {
            let (result, _) = synthetic_ack_wire(packet(payload), None);
            assert_eq!(
                result,
                Err("Renode debugger unexpected packet before acknowledgement".into()),
                "payload {payload:?}"
            );
        }
        assert_eq!(
            synthetic_ack_wire(b"?".to_vec(), None).0,
            Err("Renode debugger unexpected acknowledgement byte".into())
        );
        assert_eq!(
            synthetic_ack_wire(b"$S05#zz".to_vec(), None).0,
            Err("Renode debugger checksum is malformed".into())
        );
        assert_eq!(
            synthetic_ack_wire(b"$S05#00".to_vec(), None).0,
            Err("Renode debugger checksum mismatch".into())
        );
    }

    #[test]
    fn synthetic_ack_stop_and_byte_floods_are_bounded() {
        let wire = packet(b"S05").repeat(MAX_ACK_STOP_FRAMES + 1);
        assert_eq!(
            synthetic_ack_wire(wire, None).0,
            Err("Renode debugger asynchronous stop frame limit exceeded".into())
        );
        let mut wire = vec![b'$'];
        wire.extend(vec![b'x'; MAX_ACK_BYTES]);
        assert_eq!(
            synthetic_ack_wire(wire, None).0,
            Err("Renode debugger acknowledgement byte limit exceeded".into())
        );
    }

    #[test]
    fn synthetic_slow_ack_framing_uses_one_absolute_deadline() {
        // Every individual gap is below 2s, but the full frame takes longer.
        let (result, elapsed) =
            synthetic_ack_wire(packet(b"S05"), Some(Duration::from_millis(400)));
        assert_eq!(
            result,
            Err("Renode debugger acknowledgement timed out".into())
        );
        assert!(
            elapsed >= Duration::from_millis(1700),
            "elapsed {elapsed:?}"
        );
        assert!(
            elapsed < Duration::from_millis(2600),
            "deadline restarted during framing: {elapsed:?}"
        );
    }

    #[test]
    fn validates_stop_reply_fields() {
        for payload in [
            b"S05".as_slice(),
            b"T05",
            b"T05thread:1;",
            b"T05thread:p1.2;core:0;0f:00ab;watch:20000000;",
        ] {
            assert!(is_async_stop(payload), "valid stop {payload:?}");
        }
        for payload in [
            b"".as_slice(),
            b"S",
            b"T00;",
            b"T05thread:p1.;",
            b"T05thread:1;;",
            b"W00",
        ] {
            assert!(!is_async_stop(payload), "invalid stop {payload:?}");
        }
    }

    fn synthetic_continue_ack_after_stop_frames(count: usize) {
        // This models queued observer stops, not an actual Renode observation.
        // Each stop has a valid checksum and is acknowledged before the peer
        // emits the continue request's ACK. No delay or host load is needed.
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(IO_TIMEOUT)).unwrap();
            stream.set_write_timeout(Some(IO_TIMEOUT)).unwrap();
            stream.write_all(&packet(b"S05")).unwrap();
            let mut ack = [0u8; 1];
            stream.read_exact(&mut ack).unwrap();
            assert_eq!(ack, [b'+']);
            let mut request = [0u8; 5];
            stream.read_exact(&mut request).unwrap();
            assert_eq!(&request, b"$c#63");
            for index in 0..count {
                let stop: &[u8] = if index % 2 == 0 { b"S05" } else { b"T05" };
                stream.write_all(&packet(stop)).unwrap();
                stream.read_exact(&mut ack).unwrap();
                assert_eq!(ack, [b'+'], "stop frame {index} was not acknowledged");
            }
            stream.write_all(b"+").unwrap();
            count
        });
        let mut rsp = RenodeRsp::connect(endpoint).unwrap();
        let result = rsp.send_packet(b"c");
        assert_eq!(server.join().unwrap(), count);
        assert_eq!(rsp.stream.read_timeout().unwrap(), Some(IO_TIMEOUT));
        assert_eq!(rsp.stream.write_timeout().unwrap(), Some(IO_TIMEOUT));
        if result.is_err() {
            let mut unread_ack = [0u8; 1];
            rsp.stream.read_exact(&mut unread_ack).unwrap();
            assert_eq!(
                unread_ack,
                [b'+'],
                "peer's request ACK must really follow the stops"
            );
        }
        assert_eq!(
            result,
            Ok(()),
            "valid synthetic stop frames must not hide the continue ACK"
        );
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
