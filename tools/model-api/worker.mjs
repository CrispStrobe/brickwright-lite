#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';import {measureSubmission} from './native-runner.mjs';
const[inputPath,resultPath]=process.argv.slice(2);if(!inputPath||!resultPath)throw Error('worker needs fixed input and output paths');
try{const report=await measureSubmission(JSON.parse(readFileSync(inputPath,'utf8')),{runtimeRevision:process.env.MODEL_API_RUNTIME_REVISION||'local',measurementRevision:process.env.MODEL_API_RUNTIME_REVISION||'local'});writeFileSync(resultPath,JSON.stringify(report)+'\n');if(report.status==='failed')process.exitCode=1;}
catch(e){writeFileSync(resultPath,JSON.stringify({version:1,status:'failed',error:{code:e.code||'execution-failed',message:e.code?e.message:'Native execution failed',...(e.details?{details:e.details}:{})},qualification:{status:'not-evaluated'}})+'\n');process.exitCode=1;}
