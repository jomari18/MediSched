import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {mockModule}=require('../tests/browser-mock.cjs');
const source=(await readFile('tests/early-consultation-cli.js','utf8')).replace("const {mockModule}=require(process.cwd()+'/tests/browser-mock.cjs');",'const mockModule='+JSON.stringify(mockModule)+';');
await writeFile('evidence/early-consultation-cli-prepared.js',source);
