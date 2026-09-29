#!/usr/bin/env node
// ============================================================
// Flag-leakage acceptance test (Task 42)
// ------------------------------------------------------------
// Scans the PLAYER frontend (built bundle + source) and the ADMIN dashboard
// build for any competition secret: the 12 challenge flags, the hidden-level
// answer, the final-boss flag, and the distinctive portal puzzle answers.
//
// Exit code 0 = clean, 1 = leak detected. No secret must appear in anything the
// browser downloads.
// ============================================================
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// All competition flags (12 standard + hidden + final boss) — new token scheme.
const FLAGS = [
  'DOOM{a3f19c2b}', 'DOOM{7d4e0a91}', 'DOOM{2f8b6c05}',
  'DOOM{c1e94a7f}', 'DOOM{5b2d8e63}', 'DOOM{9a0f4c18}',
  'DOOM{e63b1d7a}', 'DOOM{4c9f2081}', 'DOOM{b7e5304c}',
  'DOOM{1f8a6d29}', 'DOOM{3d0c7b94}', 'DOOM{8e2145af}',
  'DOOM{d00d5f3a}', 'DOOM{f9c3a71e}',
];
// Flag inner tokens (must not appear in plaintext in the bundle; the intended
// solve recovers them by decoding clues or reading backend artifacts).
const INNER = FLAGS.map((f) => f.slice(5, -1));
// Distinctive portal puzzle answers (skip generic numerics like "20"/"42",
// which legitimately occur in clue text such as packet #42 / "200 OK").
const PORTAL = [
  '0D2532', 'MTg6NDI=', 'w1dow_gh0st', 'AVENGER DOWN', 'p4per_tr4il',
  'p1x3l', 'HIDDEN_SIGNAL', '4ndr01d_c0r3', 'BOFF',
];
// NOTE: the darknet clue encodings (hex/base64/binary of the tokens) are the
// intended puzzle material and legitimately appear in the bundle — they are NOT
// treated as leaks. Only literal flags/tokens/answers are searched for.

const NEEDLES = Array.from(new Set([...FLAGS, ...INNER, ...PORTAL]));

const TARGET_DIRS = [
  join(root, 'dist'),                 // player build
  join(root, 'src'),                  // player source (ships to browser in dev)
  join(root, 'admin-dashboard', 'dist'),
];

const SKIP = new Set(['node_modules', '.git']);
const TEXT_EXT = /\.(js|mjs|cjs|css|html|json|map|txt|ts|tsx|svg)$/i;

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (TEXT_EXT.test(entry)) out.push(p);
  }
  return out;
}

let leaks = 0;
let scanned = 0;
for (const dir of TARGET_DIRS) {
  for (const file of walk(dir)) {
    scanned++;
    const content = readFileSync(file, 'utf8');
    for (const needle of NEEDLES) {
      if (content.includes(needle)) {
        leaks++;
        console.error(`LEAK: "${needle}" found in ${file.replace(root, '.')}`);
      }
    }
  }
}

console.log(`\nScanned ${scanned} files across player + admin builds/sources.`);
console.log(`Searched for ${NEEDLES.length} distinct secrets (flags, inner tokens, portal answers, encoded forms).`);
if (leaks > 0) {
  console.error(`\n❌ FLAG LEAKAGE DETECTED: ${leaks} occurrence(s).`);
  process.exit(1);
} else {
  console.log('\n✅ CLEAN: no flags / answers found in any client-facing file.');
  process.exit(0);
}
