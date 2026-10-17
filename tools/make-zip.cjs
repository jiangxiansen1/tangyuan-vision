/**
 * make-zip.cjs — build a portable ZIP of the project.
 *
 * WHY NOT Compress-Archive
 * PowerShell's Compress-Archive writes entry paths with WINDOWS BACKSLASHES. The
 * ZIP specification requires forward slashes, and every non-Windows extractor
 * treats a backslash as a literal filename character — so on macOS or Linux the
 * archive unpacks into a pile of files named `src\app\routes.ts` instead of a
 * directory tree. That was measured here: 195 backslashed entries, 0 forwards.
 *
 * So this writes the archive directly. zlib already ships with Node, so deflate
 * needs no dependency, and Path Separators and filenames are emitted exactly as
 * they should be: forward slashes, UTF-8, with the language-encoding flag (0x0800)
 * set so non-ASCII names are read correctly rather than through a legacy codepage.
 *
 * Usage: node tools/make-zip.cjs <sourceDir> <outputZip> [--include-dist]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const srcDir = path.resolve(process.argv[2] || '.');
const outZip = path.resolve(process.argv[3] || 'project.zip');
const includeDist = process.argv.includes('--include-dist');

/* ------------------------------------------------------------------ crc -- */

/**
 * CRC-32 as ZIP requires it.
 *
 * Declared at the top because the writer below calls it: a `const` declared after
 * its use sits in the temporal dead zone and throws, which is a mistake worth not
 * repeating.
 *
 * The table is built lazily, once. The alternative — running the polynomial bit by
 * bit — multiplies the cost by eight across a file set this size.
 */
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  // `>>> 0` is load-bearing. Bitwise operators in JavaScript produce SIGNED 32-bit
  // results, so `crc ^ -1` can be negative, and writeUInt32LE rejects a negative
  // value. Coercing to unsigned here is what makes the CRC spec-correct.
  return (crc ^ -1) >>> 0;
}

/**
 * Directories excluded from the source archive.
 *
 * node_modules and dist are regenerable from the lockfile and are large enough to
 * dominate the download. tools/_verify holds ~31 MB of screenshots produced by the
 * verification scripts, and .git is not part of the source distribution.
 * dotted cache dirs (for example a local CMS/CLI .temp) are local state, not source.
 */
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'dist-ssr', '_verify', '.git', '.vite', '.temp']);
const EXCLUDED_FILES = [/\.tsbuildinfo$/, /^\.env$/, /^\.env\.local$/, /^\.env\.production$/, /^\.env\.development$/];

function shouldSkip(relPath, name) {
  if (EXCLUDED_FILES.some((re) => re.test(name))) return true;
  const parts = relPath.split('/');
  if (parts.some((p) => EXCLUDED_DIRS.has(p))) return true;
  void includeDist;
  return false;
}

/* ------------------------------------------------------------------ walk -- */

const entries = [];

function walk(absDir, relDir) {
  let dirents;
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of dirents) {
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    const abs = path.join(absDir, ent.name);
    if (shouldSkip(rel, ent.name)) continue;
    if (ent.isDirectory()) {
      walk(abs, rel);
    } else if (ent.isFile()) {
      entries.push({ rel, abs });
    }
  }
}

walk(srcDir, '');

/* ------------------------------------------------------------- zip build -- */

/**
 * MS-DOS date/time, as the ZIP format wants it. Second resolution is 2 s, which
 * is all the format carries.
 */
function dosDateTime(date) {
  const y = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

const localChunks = [];
const centralChunks = [];
let offset = 0;

for (const entry of entries) {
  const data = fs.readFileSync(entry.abs);
  const stat = fs.statSync(entry.abs);
  const { dosDate, dosTime } = dosDateTime(stat.mtime);

  // Deflate when it helps; store when it does not, so already-compressed content
  // (JPEG, PNG, WAV, ZIP) is not wastefully re-encoded.
  let method = 8;
  let payload = zlib.deflateRawSync(data, { level: 9 });
  if (payload.length >= data.length) {
    method = 0;
    payload = data;
  }

  // Always forward slashes — this is the whole point of the exercise.
  const nameBuf = Buffer.from(entry.rel, 'utf8');
  const crc = crc32(data);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed
  // Bit 11 (0x0800) declares the filename is UTF-8. Without it, an extractor may
  // read a Chinese filename through the local codepage and mangle it.
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(method, 8);
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(payload.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);

  localChunks.push(localHeader, nameBuf, payload);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
  centralHeader.writeUInt16LE(method, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(payload.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra
  centralHeader.writeUInt16LE(0, 32); // comment
  centralHeader.writeUInt16LE(0, 34); // disk
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  // External file attributes. The high 16 bits carry the POSIX mode; 0644 marks a
  // regular, non-executable file, which is inert on Windows and correct elsewhere.
  //
  // `>>> 0` is required: 0644 shifted left 16 exceeds 2^31, and JavaScript's `<<`
  // produces a SIGNED 32-bit result, so the value arrives negative and
  // writeUInt32LE rejects it. Coercing to unsigned is what makes it spec-correct.
  centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  centralHeader.writeUInt32LE(offset, 42);

  centralChunks.push(centralHeader, nameBuf);

  offset += localHeader.length + nameBuf.length + payload.length;
}

const centralDir = Buffer.concat(centralChunks);
const localPart = Buffer.concat(localChunks);

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(entries.length, 8);
eocd.writeUInt16LE(entries.length, 10);
eocd.writeUInt32LE(centralDir.length, 12);
eocd.writeUInt32LE(localPart.length, 16);
eocd.writeUInt16LE(0, 20);

fs.mkdirSync(path.dirname(outZip), { recursive: true });
fs.writeFileSync(outZip, Buffer.concat([localPart, centralDir, eocd]));

const totalBytes = entries.reduce((s, e) => s + fs.statSync(e.abs).size, 0);
console.log(`  entries : ${entries.length}`);
console.log(`  raw     : ${(totalBytes / 1048576).toFixed(2)} MB`);
console.log(`  zip     : ${(fs.statSync(outZip).size / 1048576).toFixed(2)} MB`);
console.log(`  output  : ${outZip}`);
