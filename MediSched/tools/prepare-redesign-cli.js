import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {mockModule}=require('../tests/browser-mock.cjs');
const source=await readFile(new URL('../tests/redesign-cli.js',import.meta.url),'utf8');
await writeFile(new URL('../evidence/redesign-cli-prepared.js',import.meta.url),source.replace('MOCK_MODULE',JSON.stringify(mockModule)));
