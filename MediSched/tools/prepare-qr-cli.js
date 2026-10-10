// Prepare data for Playwright CLI's sandbox; does not launch or automate a browser.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {mockModule}=require('../tests/browser-mock.cjs');
let source=await readFile(new URL('../tests/qr-cli-audit.js',import.meta.url),'utf8');
source=source.replace(" const fs=require('node:fs');",'').replace(" const {mockModule}=require(process.cwd()+'/tests/browser-mock.cjs');",' const mockModule='+JSON.stringify(mockModule)+';');
source=source.replace(/ fs\.writeFileSync\('evidence\/qr-cli-results.json'.*?;return \{checks:results.length,status:'pass',mode:'local synthetic fixtures'\};/," return {checks:results.length,status:'pass',mode:'local synthetic Supabase fixtures; no hosted mutations',results};");
await writeFile(new URL('../evidence/qr-cli-prepared.js',import.meta.url),source);
