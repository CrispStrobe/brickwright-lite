#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Loopback facade for the SAME configured hosted backend/admission; no local worker bypass.
import http from 'node:http';
import handler from './api/handler.mjs';
const port=Number(process.env.MODEL_API_PORT||8767);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Invalid loopback port');
const server=http.createServer(handler);
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({listening:server.address().port,mode:'loopback-configured-hosted-backend'})));
