// ============================================================
// Server-side authoritative challenge data (Avengers: Doomsday CTF)
// ------------------------------------------------------------
// Backend-only. Holds the real flags/portal answers (hashed at seed time) and
// the artifact registry served by /artifacts/:challengeId/:artifactId.
//
// Design goals (challenge rework):
//  • Flags are non-guessable random tokens — NOT derivable from title/narrative.
//  • Each challenge is solvable via a real investigation:
//      - Webverse: source hex clue → decode → backend artifact URL → pick the
//        one correct candidate record → its reference token is the flag inner.
//      - Osintverse: coordinates / social trail → backend dossier artifact →
//        identify the correct record → reference token is the flag inner.
//      - Darknet: encoded artifact (hex / base64 / binary) → decode → token.
//  • Player-visible fields NEVER contain the literal flag; only encoded material
//    or references that require the intended solve.
// ============================================================

export interface ArtifactRecord {
  label: string;
  fields: Record<string, string>;
}
export interface ArtifactDef {
  id: string;            // random, unguessable path segment
  title: string;
  intro: string;
  records: ArtifactRecord[];
}

export interface SeedChallenge {
  id: string;
  title: string;
  category: string;
  universe: string;
  difficulty: string;
  description: string;
  narrative: string;
  hints: string[];
  portalType: string;
  portalPuzzle: { type: string; title: string; icon: string; description: string; clue: string };
  clueContent: { label: string; body: string; format: string } | null;
  type: string;
  stone: string;
  points: number;
  author: string;
  nextChallengeId: string | null;
  orderIndex: number;
  universeOrder: number;
  isHidden: boolean;
  hiddenReward?: number;
  hiddenPenalty?: number;
  revealText?: string;

  // Backend-served artifact (webverse/osint). Not shipped to the bundle.
  artifact?: ArtifactDef;

  // Secrets — hashed at seed time, never persisted in plaintext.
  _flag: string;
  _portalAnswer?: string;
}

// Artifact URLs are built from a configurable origin (ARTIFACT_BASE_URL /
// PUBLIC_API_URL, else local API). No production URL is hardcoded; re-seed after
// changing it. Webverse clues hex-encode the URL; OSINT clues show it plaintext.
const ARTIFACT_BASE =
  process.env.ARTIFACT_BASE_URL ??
  process.env.PUBLIC_API_URL ??
  `http://localhost:${process.env.PORT ?? '4000'}`;
const artifactUrl = (path: string): string => `${ARTIFACT_BASE}${path}`;
const hexBytes = (s: string): string =>
  Buffer.from(s, 'utf8').toString('hex').match(/../g)!.join(' ');

export const seedChallenges: SeedChallenge[] = [
  // ── WEBVERSE ──────────────────────────────────────────────
  {
    id: 'wv-01',
    title: 'The Broken Multiverse',
    category: 'web',
    universe: 'webverse',
    difficulty: 'moderate',
    description: 'A gateway override console is locked. The page hides a machine trace that leads to the override registry — recover the correct override code.',
    narrative: 'Thanos sealed the multiverse gateway. Fury left a breadcrumb in the page for whoever came looking.',
    hints: [
      'Pages often carry developer breadcrumbs that never render. Read what the browser ignores.',
      'The breadcrumb isn\'t text yet — it\'s a run of byte values. Work out the encoding before you follow it.',
      'The registry lists several nodes. Authorisation depends on WHO and WHERE the briefing points to — not on the order they appear.',
    ],
    portalType: 'hidden-pixel',
    portalPuzzle: {
      type: 'hidden-pixel', title: 'Hidden Pixel Portal', icon: '⚡',
      description: 'A single black pixel holds the truth. The page is dark — but the pixel is not what it seems.',
      clue: 'The pixel\'s RGB is (13, 37, 50). Convert the RGB channels to a single hex value to recover the response code.',
    },
    clueContent: {
      label: '<!-- SOURCE COMMENT -->',
      body: `<!-- GATEWAY DEBUG: override registry trace =\n${hexBytes(artifactUrl('/artifacts/wv-01/7f3a9c2e'))}\n— decode to continue. — J.R. -->`,
      format: 'code',
    },
    type: 'static', stone: 'mind', points: 100, author: 'Nick Fury',
    nextChallengeId: 'wv-02', orderIndex: 0, universeOrder: 0, isHidden: false,
    artifact: {
      id: '7f3a9c2e',
      title: 'GATEWAY OVERRIDE REGISTRY',
      intro: 'Registered multiverse gateway override nodes. Only the node bound to the correct operator and sector authorises an override.',
      records: [
        { label: 'NODE GW-01', fields: { Sector: '199999', Operator: 'V. von Doom', 'Override-Ref': '5c1a8f22', Status: 'REVOKED' } },
        { label: 'NODE GW-02', fields: { Sector: '616', Operator: 'J. Fury', 'Override-Ref': 'a3f19c2b', Status: 'AUTHORISED' } },
        { label: 'NODE GW-03', fields: { Sector: '838', Operator: 'S. Strange', 'Override-Ref': '77b0e4d9', Status: 'AUTHORISED' } },
      ],
    },
    _flag: 'DOOM{a3f19c2b}',
    _portalAnswer: '0D2532',
  },
  {
    id: 'wv-02',
    title: 'Portal Chain',
    category: 'custom',
    universe: 'webverse',
    difficulty: 'moderate',
    description: 'A redirect chain loops endlessly. Only one endpoint truly exits the loop. Trace the chain log and find the real exit.',
    narrative: 'Every wrong turn sends you deeper. The exit responds differently from the traps.',
    hints: [
      'The log is a map, not a dead end — something in it points elsewhere.',
      'One field is encoded. Convert it before you decide where to go.',
      'Endpoints answer differently. A loop is not an exit — judge each endpoint by how it responds.',
    ],
    portalType: 'recursive-loop',
    portalPuzzle: {
      type: 'recursive-loop', title: 'Recursive Portal', icon: '🌀',
      description: 'You\'re caught in a loop. The portal says: "To return, solve the sequence."',
      clue: 'The numbers repeat: 1, 1, 2, 3, 5, 8, 13, 21... Fibonacci. Sum the first six terms of the sequence to recover the return code.',
    },
    clueContent: {
      label: 'CHAIN LOG',
      body: `REDIRECT TRACE (follow the map):\n${hexBytes(artifactUrl('/artifacts/wv-02/b1d84f60'))}\nSTATUS: 308 Permanent Redirect (loop)\nX-Multiverse-Warning: "The exit answers 200."`,
      format: 'metadata',
    },
    type: 'custom', stone: 'space', points: 150, author: 'Strange',
    nextChallengeId: 'wv-03', orderIndex: 1, universeOrder: 0, isHidden: false,
    artifact: {
      id: 'b1d84f60',
      title: 'PORTAL REDIRECT MAP',
      intro: 'Live status of the portal redirect endpoints. Traps loop or dead-end; the true exit answers 200 OK.',
      records: [
        { label: '/portal', fields: { Response: '308 Permanent Redirect', Target: '/portal2', 'Exit-Ref': '—' } },
        { label: '/portal2', fields: { Response: '404 Not Found', Target: '(dead-end)', 'Exit-Ref': '—' } },
        { label: '/portal-return', fields: { Response: '308 Permanent Redirect', Target: '/portal', 'Exit-Ref': '—' } },
        { label: '/portal-exit', fields: { Response: '200 OK', Target: '(stable)', 'Exit-Ref': '7d4e0a91' } },
      ],
    },
    _flag: 'DOOM{7d4e0a91}',
    _portalAnswer: '20',
  },
  {
    id: 'wv-03',
    title: 'The Auth Matrix',
    category: 'web',
    universe: 'webverse',
    difficulty: 'moderate',
    description: 'The Multiverse Gate issues several bearer tokens, but only one is currently valid for its realm. Recover the reference of the valid token.',
    narrative: 'Authentication is a matrix of decoys. Pick the one token that still holds.',
    hints: [
      'Authentication leaves traces in the exchange, not just the body. Inspect everything the server sends back.',
      'One header value isn\'t meant to be read directly — determine its encoding first.',
      'Several tokens exist. Validity depends on matching the gate\'s realm AND still being live — not every candidate qualifies.',
    ],
    portalType: 'time-based',
    portalPuzzle: {
      type: 'time-based', title: 'Time-Based Portal', icon: '⏰',
      description: 'The clock ticks. The portal shows the time. The clue is what the time MEANS.',
      clue: 'The time is 18:42 — the last transmission timestamp. Base64-encode the time value to recover the answer.',
    },
    clueContent: {
      label: 'HTTP RESPONSE HEADERS',
      body: `Content-Type: application/json\nServer: Multiverse-Gateway/2.0\nWWW-Authenticate: Bearer realm="multiverse"\nX-Trace: ${hexBytes(artifactUrl('/artifacts/wv-03/4e9a7c13'))}`,
      format: 'metadata',
    },
    type: 'interactive', stone: 'reality', points: 200, author: 'Romanoff',
    nextChallengeId: null, orderIndex: 2, universeOrder: 0, isHidden: false,
    artifact: {
      id: '4e9a7c13',
      title: 'BEARER TOKEN VAULT',
      intro: 'Issued bearer tokens. A token authorises only if it matches the gate realm ("multiverse") and is still ACTIVE.',
      records: [
        { label: 'TOKEN T-A', fields: { Realm: 'battleworld', Status: 'ACTIVE', 'Token-Ref': '9d51c7e0' } },
        { label: 'TOKEN T-B', fields: { Realm: 'multiverse', Status: 'EXPIRED', 'Token-Ref': 'c4a20b8f' } },
        { label: 'TOKEN T-C', fields: { Realm: 'multiverse', Status: 'ACTIVE', 'Token-Ref': '2f8b6c05' } },
      ],
    },
    _flag: 'DOOM{2f8b6c05}',
    _portalAnswer: 'MTg6NDI=',
  },

  // ── OSINTVERSE ────────────────────────────────────────────
  {
    id: 'os-01',
    title: 'Where Did He Go?',
    category: 'osint',
    universe: 'osintverse',
    difficulty: 'moderate',
    description: 'An intercepted signal carries only coordinates. Identify the real-world monument at those coordinates, then pull its record reference from the intel dossier.',
    narrative: 'An Avenger went dark beside a monument. The coordinates do not lie.',
    hints: [
      'The intercept is almost empty on purpose. What little it contains is a form of location.',
      'Turn the location into a real place before you open anything else.',
      'The dossier holds several places. Let the intercepted location decide which record matters — match it, don\'t trust the label.',
    ],
    portalType: 'osint-redirect',
    portalPuzzle: {
      type: 'osint-redirect', title: 'OSINT Redirect', icon: '🔍',
      description: 'You\'re redirected through fake social profiles. Find the real one.',
      clue: 'The fake profile handle carries a numeric suffix. Strip the suffix to recover the real codename.',
    },
    clueContent: {
      label: 'INTERCEPTED SIGNAL',
      body: `LAT: 28.6129\nLON: 77.2295\nTRANSMISSION: "I was here. Standing under the arch."\nINTEL DOSSIER: ${artifactUrl('/artifacts/os-01/c72f0a95')}`,
      format: 'code',
    },
    type: 'decoder', stone: 'power', points: 120, author: 'Fury',
    nextChallengeId: 'os-02', orderIndex: 0, universeOrder: 1, isHidden: false,
    artifact: {
      id: 'c72f0a95',
      title: 'FIELD INTEL DOSSIER — MONUMENTS',
      intro: 'Monuments cross-referenced by coordinates. Match the intercepted coordinates to the correct monument record.',
      records: [
        { label: 'REC-01', fields: { Monument: 'Gateway of India', City: 'Mumbai', Coordinates: '18.9220, 72.8347', 'Record-Ref': 'a70f31cc' } },
        { label: 'REC-02', fields: { Monument: 'India Gate', City: 'New Delhi', Coordinates: '28.6129, 77.2295', 'Record-Ref': 'c1e94a7f' } },
        { label: 'REC-03', fields: { Monument: 'Red Fort', City: 'New Delhi', Coordinates: '28.6562, 77.2410', 'Record-Ref': '2b8d05a1' } },
      ],
    },
    _flag: 'DOOM{c1e94a7f}',
    _portalAnswer: 'w1dow_gh0st',
  },
  {
    id: 'os-02',
    title: 'Social Ghost',
    category: 'osint',
    universe: 'osintverse',
    difficulty: 'moderate',
    description: 'A trail of look-alike social profiles hides one authentic, verified account. Identify the genuine profile and recover its account reference.',
    narrative: 'Imposters copied the handle. Only one account is verified and original.',
    hints: [
      'Identity can be copied. Look for what distinguishes an original from a copy.',
      'Copies leave tells — handles, timestamps, verification status. Compare them.',
      'The anchor is the earliest, verified identity; impersonators arrive later and unverified.',
    ],
    portalType: 'document-rabbit',
    portalPuzzle: {
      type: 'document-rabbit', title: 'Document Rabbit Hole', icon: '📄',
      description: 'A fake classified document is in front of you. It\'s not the real one.',
      clue: 'The document is redacted with black bars. Reveal the phrase hidden behind the bars to recover the passphrase.',
    },
    clueContent: {
      label: 'SOCIAL POST METADATA',
      body: `DISPLAY NAME: "Natasha R."\nHANDLE SEEN: @n4t4sh4_r0m4n0ff\nNOTE: multiple impersonators detected.\nSOCIAL ARCHIVE: ${artifactUrl('/artifacts/os-02/18d3b6e4')}`,
      format: 'code',
    },
    type: 'static', stone: 'soul', points: 130, author: 'Widow',
    nextChallengeId: 'os-03', orderIndex: 1, universeOrder: 1, isHidden: false,
    artifact: {
      id: '18d3b6e4',
      title: 'SOCIAL ARCHIVE — PROFILE MATCHES',
      intro: 'Profiles matching the display name "Natasha R." Only one is the verified original.',
      records: [
        { label: 'PROFILE P1', fields: { Handle: '@n4t4sh4_r0m4n0ff_1995', Verified: 'NO', Joined: '2019-04-02', 'Account-Ref': '61f0a2dd' } },
        { label: 'PROFILE P2', fields: { Handle: '@n4t4sh4.r0m4n0ff', Verified: 'NO', Joined: '2021-11-20', 'Account-Ref': 'd9c4137b' } },
        { label: 'PROFILE P3', fields: { Handle: '@n4t4sh4_r0m4n0ff', Verified: 'YES', Joined: '2011-05-01', 'Account-Ref': '5b2d8e63' } },
      ],
    },
    _flag: 'DOOM{5b2d8e63}',
    _portalAnswer: 'AVENGER DOWN',
  },
  {
    id: 'os-03',
    title: 'The Paper Trail',
    category: 'forensics',
    universe: 'osintverse',
    difficulty: 'moderate',
    description: 'A leaked cache of recovered documents contains decoys. Only the authentic, unredacted, cross-verified document carries the true reference.',
    narrative: 'A paper trail was left behind. Most of it is noise; one page is the signal.',
    hints: [
      'Most of the recovered material is noise. Authenticity is something you can prove.',
      'Each page carries a state and a checksum — use them to separate signal from forgery.',
      'Only one page is both untampered and validated; the others advertise their own doubt.',
    ],
    portalType: 'rabbit-hole',
    portalPuzzle: {
      type: 'rabbit-hole', title: 'Rabbit Hole', icon: '🕳️',
      description: 'You find a fake classified document. "Congratulations!" it says. But the flag is invalid.',
      clue: 'The decoy document shows a fake flag. The real value is hidden in the document\'s "paper trail" text — read it carefully.',
    },
    clueContent: {
      label: 'IMAGE PIXEL ANALYSIS',
      body: `IMG: classified-doc.png (1024x1024)\nRECOVERY NOTE: several pages recovered; most are forgeries.\nRECOVERY ARCHIVE: ${artifactUrl('/artifacts/os-03/9f5c2a70')}`,
      format: 'code',
    },
    type: 'forensics', stone: 'time', points: 140, author: 'Banner',
    nextChallengeId: null, orderIndex: 2, universeOrder: 1, isHidden: false,
    artifact: {
      id: '9f5c2a70',
      title: 'RECOVERED DOCUMENT ARCHIVE',
      intro: 'Recovered document pages. Forged/redacted pages are decoys; only the VERIFIED page with a VALID checksum is authentic.',
      records: [
        { label: 'PAGE D1', fields: { Serial: 'DOC-4471', State: 'FORGED', Checksum: 'INVALID', 'Doc-Ref': 'ee0142cd' } },
        { label: 'PAGE D2', fields: { Serial: 'DOC-8890', State: 'REDACTED', Checksum: 'UNKNOWN', 'Doc-Ref': '7c33bb90' } },
        { label: 'PAGE D3', fields: { Serial: 'DOC-1207', State: 'VERIFIED', Checksum: 'VALID', 'Doc-Ref': '9a0f4c18' } },
      ],
    },
    _flag: 'DOOM{9a0f4c18}',
    _portalAnswer: 'p4per_tr4il',
  },

  // ── DARKNET (encoded artifacts — decode in place with the Multiverse Decoder) ──
  {
    id: 'dn-01',
    title: 'Pixel Whisper',
    category: 'forensics',
    universe: 'darknet',
    difficulty: 'moderate',
    description: 'The LSB plane of an image was extracted to a byte stream. Decode the bytes to recover the hidden token.',
    narrative: 'Thanos left a message in the pixels. The bytes are already lifted — you just have to read them.',
    hints: [
      'The data has already been lifted from the image; you only need to read it.',
      'It isn\'t text yet — identify the numeric base before converting.',
      'Carry the bytes through to plain ASCII to reveal the string.',
    ],
    portalType: 'signal',
    portalPuzzle: { type: 'signal', title: 'Signal Portal', icon: '📡', description: 'A waveform pulses before you. Decode the binary signal.', clue: 'Decode the binary signal, then combine it with the anomalous pixel sequence to recover the passphrase.' },
    clueContent: {
      label: 'PIXEL DATA (LSB extracted)',
      body: 'IMG: whisper.png (100x100)\nLSB BYTE STREAM (hex):\n65 36 33 62 31 64 37 61\nDecode the bytes to ASCII to reveal the token.',
      format: 'code',
    },
    type: 'forensics', stone: 'space', points: 150, author: 'Strange',
    nextChallengeId: 'dn-02', orderIndex: 0, universeOrder: 2, isHidden: false,
    _flag: 'DOOM{e63b1d7a}',
    _portalAnswer: 'p1x3l',
  },
  {
    id: 'dn-02',
    title: 'The Cipher Lab',
    category: 'crypto',
    universe: 'darknet',
    difficulty: 'moderate',
    description: 'A message left the lab base64-encoded. Reverse the final encoding to recover the token.',
    narrative: 'The lab encoded its last transmission. Undo the wrapper.',
    hints: [
      'The lab\'s output is wrapped, not encrypted — recognise the wrapper.',
      'The final line uses a common transport encoding. Name it, then reverse it.',
      'Undo the last encoding stage to read the payload.',
    ],
    portalType: 'cipher-loop',
    portalPuzzle: { type: 'cipher-loop', title: 'Cipher Loop', icon: '🔐', description: 'A cipher wheel spins. The encoded text is shown — decode it.', clue: 'Decode the encoded stream through the hex → binary → base64 chain to recover the flag.' },
    clueContent: {
      label: 'ENCODED MESSAGE',
      body: 'CIPHER LAB OUTPUT\nFINAL STAGE (base64): NGM5ZjIwODE=\nDecode to recover the token.',
      format: 'code',
    },
    type: 'decoder', stone: 'mind', points: 160, author: 'Banner',
    nextChallengeId: 'dn-03', orderIndex: 1, universeOrder: 2, isHidden: false,
    _flag: 'DOOM{4c9f2081}',
    _portalAnswer: '4c9f2081',
  },
  {
    id: 'dn-03',
    title: 'Hidden Signal',
    category: 'steganography',
    universe: 'darknet',
    difficulty: 'moderate',
    description: 'A signal was buried in an LSB bit plane and dumped as raw binary. Decode the binary to recover the token.',
    narrative: 'The signal is buried in ones and zeroes. Lift it out.',
    hints: [
      'The signal is raw — ones and zeroes are not the final form.',
      'Group the bits into bytes and interpret them.',
      'Carry the binary through to ASCII to read the buried string.',
    ],
    portalType: 'signal',
    portalPuzzle: { type: 'signal', title: 'Signal Portal', icon: '📡', description: 'A waveform pulses before you. Decode the binary signal.', clue: 'Extract the least-significant-bit plane and decode the binary to recover the passphrase.' },
    clueContent: {
      label: 'LSB EXTRACTION',
      body: 'IMG: signal.png\nCHANNEL R, BIT 0 (binary):\n01100010 00110111 01100101 00110101 00110011 00110000 00110100 01100011\nDecode the binary to ASCII to reveal the token.',
      format: 'code',
    },
    type: 'forensics', stone: 'reality', points: 170, author: 'Romanoff',
    nextChallengeId: 'dn-04', orderIndex: 2, universeOrder: 2, isHidden: false,
    _flag: 'DOOM{b7e5304c}',
    _portalAnswer: 'HIDDEN_SIGNAL',
  },
  {
    id: 'dn-04',
    title: 'Packet Capture',
    category: 'pcap',
    universe: 'darknet',
    difficulty: 'moderate',
    description: 'A capture holds one HTTP response whose body carries a base64 token. Find the right packet and decode its body.',
    narrative: 'The network spoke once. Find the packet that answered.',
    hints: [
      'A capture has many lines but only one answer — not every packet is a response.',
      'Find the response that actually returned content, then look at its body.',
      'The body is encoded for transport; reverse that encoding to read it.',
    ],
    portalType: 'packet',
    portalPuzzle: { type: 'packet', title: 'Packet Portal', icon: '🌐', description: 'A scrolling packet table. One packet holds the answer.', clue: 'One packet holds the answer. Inspect the HTTP request/response to find the packet number that carries the flag.' },
    clueContent: {
      label: 'PCAP PACKET LIST',
      body: '#   SRC          DST          PROTO  INFO\n40  10.0.0.1     10.0.0.42    TCP    SYN\n41  10.0.0.1     10.0.0.42    HTTP   GET /key\n42  10.0.0.42    10.0.0.1     HTTP   200 OK  body(base64)=MWY4YTZkMjk=\n43  10.0.0.1     10.0.0.42    TCP    FIN\nDecode the packet #42 body to reveal the token.',
      format: 'code',
    },
    type: 'pcap', stone: 'power', points: 180, author: 'Romanoff',
    nextChallengeId: 'dn-05', orderIndex: 3, universeOrder: 2, isHidden: false,
    _flag: 'DOOM{1f8a6d29}',
    _portalAnswer: '42',
  },
  {
    id: 'dn-05',
    title: 'Android Core',
    category: 'reverse',
    universe: 'darknet',
    difficulty: 'moderate',
    description: 'A recovered binary stores its key as a hex constant in .rodata. Identify the key string and decode it.',
    narrative: 'The binary hides its key in plain sight — if you can read section data.',
    hints: [
      'Binaries hide constants in plain sight — section data is readable.',
      'Most strings are labels; one is explicitly the key, and it\'s stored as bytes.',
      'Convert the key\'s bytes to characters to recover it.',
    ],
    portalType: 'reverse-loop',
    portalPuzzle: { type: 'reverse-loop', title: 'Reverse Loop', icon: '⚙️', description: 'Disassembly scrolls. Find the function with the key.', clue: 'Inspect the .rodata section. Find the string tagged as the key to recover the passphrase.' },
    clueContent: {
      label: 'DISASSEMBLY (.rodata)',
      body: '0x00001234: "multiverse_init_v2"\n0x00001248: "android_core_v3"\n0x00001260: KEY (hex) = 33 64 30 63 37 62 39 34\n0x00001280: "MIND_STONE = ACTIVATED"\nDecode the KEY hex to ASCII to reveal the token.',
      format: 'code',
    },
    type: 'reverse', stone: 'soul', points: 190, author: 'Banner',
    nextChallengeId: 'dn-06', orderIndex: 4, universeOrder: 2, isHidden: false,
    _flag: 'DOOM{3d0c7b94}',
    _portalAnswer: '4ndr01d_c0r3',
  },
  {
    id: 'dn-06',
    title: 'Buffer Overflow',
    category: 'pwn',
    universe: 'darknet',
    difficulty: 'moderate',
    description: 'A format-string leak dumped stack bytes as hex. Reassemble the leaked bytes into text to recover the token.',
    narrative: 'The vulnerable program leaked its own secret. Read what spilled out.',
    hints: [
      'The program leaks its own memory — read what spilled out.',
      'The leak is a sequence of raw bytes, not text yet.',
      'Interpret the leaked bytes as ASCII to reconstruct the value.',
    ],
    portalType: 'pwn-terminal',
    portalPuzzle: { type: 'pwn-terminal', title: 'Pwn Terminal', icon: '💻', description: 'A vulnerable terminal. Exploit the format string to leak the flag.', clue: 'Exploit the format string to leak the stack; the leaked bytes decode to a short ASCII tag.' },
    clueContent: {
      label: 'VULNERABLE PROGRAM',
      body: '#include <stdio.h>\nint main(int argc, char *argv[]) {\n  printf(argv[1]);  // format-string vuln\n  return 0;\n}\nLEAKED MEMORY (hex): 38 65 32 31 34 35 61 66\nDecode the leaked bytes to ASCII to reveal the token.',
      format: 'terminal',
    },
    type: 'pwn', stone: 'time', points: 200, author: 'Romanoff',
    nextChallengeId: null, orderIndex: 5, universeOrder: 2, isHidden: false,
    _flag: 'DOOM{8e2145af}',
    _portalAnswer: 'BOFF',
  },

  // ── HIDDEN RANDOM LEVEL ─────────────────────────────────────
  {
    id: 'hidden-01',
    title: 'The Doom Anomaly',
    category: 'anomaly',
    universe: 'anomaly',
    difficulty: 'moderate',
    description:
      'A rift tears open across every sector at once. One operative per team is pulled in. Decode the anomaly beacon — a wrong move collapses your team\'s reality.',
    narrative:
      'Doctor Doom seeded a trap in the fabric of the multiverse. Only one operative per team can reach it: glory or ruin for the whole squad.',
    hints: [
      'The beacon is wrapped in a common encoding — recognise it before you read it.',
      'Reverse that encoding to reveal the payload.',
      'One attempt per team: +500 or -400. Decode fully and be certain before you submit.',
    ],
    portalType: 'signal',
    portalPuzzle: { type: 'signal', title: 'Anomaly', icon: '☢', description: 'The anomaly resists analysis.', clue: 'The anomaly resonates on a frequency only the worthy can decode.' },
    clueContent: {
      label: 'ANOMALY BEACON',
      body: 'SIGNAL ORIGIN: UNKNOWN\nAMPLITUDE: CRITICAL\nBEACON (base64): ZDAwZDVmM2E=\nDecode the beacon to recover the token.',
      format: 'code',
    },
    type: 'custom', stone: 'reality', points: 0, author: 'Doctor Doom',
    nextChallengeId: null, orderIndex: 0, universeOrder: 99, isHidden: true,
    hiddenReward: 500, hiddenPenalty: 400,
    _flag: 'DOOM{d00d5f3a}',
  },

  // ── FINAL BOSS (server-side completion reveal) ──────────────
  {
    id: 'final-boss',
    title: 'Doctor Doom',
    category: 'boss',
    universe: 'boss',
    difficulty: 'moderate',
    description: 'The final chamber. Synchronize all six stones to face Doom.',
    narrative: 'You think yourself a god. But gods die. — Doctor Doom',
    hints: [],
    portalType: 'signal',
    portalPuzzle: { type: 'signal', title: 'Doom Core', icon: '◆', description: 'The Doom Core awaits.', clue: 'Collect all six Infinity Stones to unlock the Doom Protocol.' },
    clueContent: null,
    type: 'custom', stone: 'reality', points: 0, author: 'Doctor Doom',
    nextChallengeId: null, orderIndex: 1, universeOrder: 99, isHidden: true,
    revealText: 'DOOM{f9c3a71e}',
    _flag: 'DOOM{f9c3a71e}',
  },
];

// Registry lookup used by the artifacts route.
export function findArtifact(challengeId: string, artifactId: string): ArtifactDef | null {
  const c = seedChallenges.find((x) => x.id === challengeId);
  if (!c?.artifact) return null;
  if (c.artifact.id !== artifactId) return null;
  return c.artifact;
}
