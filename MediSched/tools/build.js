import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { publicFiles } from './public-files.js';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist');
const production = process.argv.includes('--production');
// Only this fixed generated directory is replaced; no source directory is removed.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [...publicFiles, '_headers']) {
  const source = path.resolve(root, name),
    target = path.resolve(output, name);
  if (!source.startsWith(root + path.sep) || !target.startsWith(output + path.sep))
    throw Error('Invalid public path');
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}
if (production)
  await copyFile(path.join(root, 'config.production.js'), path.join(output, 'config.js'));
console.log(
  `Built ${publicFiles.length + 1} public files in dist (${production ? 'original MediSched' : 'current config.js'} backend).`
);
