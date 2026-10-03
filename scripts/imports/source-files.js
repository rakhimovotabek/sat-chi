import { readdir, realpath, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join, extname, isAbsolute } from 'node:path';
export const PARSER_VERSION = '2026-10-03.2';
export function contained(root, file) {
  const rel = relative(resolve(root), resolve(file));
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}
export async function sourcePath(root, name) {
  const path = resolve(root, name);
  if (!contained(root, path) || isAbsolute(name)) throw new Error('Source path escapes the authorized folder.');
  const actual = await realpath(path);
  if (!contained(await realpath(root), actual)) throw new Error('Source symlink escapes the authorized folder.');
  return actual;
}
export async function findSources(root) {
  const files = [], skipped = [];
  const walk = async (directory) => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) { skipped.push(relative(root, path)); continue; }
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(pdf|txt|json|docx|epub)$/i.test(extname(entry.name))) files.push(relative(root, path));
    }
  };
  await walk(root);
  return { files, skipped };
}
export async function fingerprintFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function atomicJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, path);
}
export async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export function classifySource(name) {
 if (/vocab/i.test(name)) return 'Vocabulary';
 if (/math/i.test(name)) return 'Math';
 if (/reading|writing|grammar|central ideas|dual texts|apostrophe|verbs|modifiers|pronoun|punctuation|agreement|tense|transition/i.test(name)) return 'Reading & Writing';
 return 'Other';
}
