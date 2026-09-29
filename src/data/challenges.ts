// ============================================================
// Avengers: Doomsday CTF — Player-safe Challenge Metadata
// ============================================================
// Ships in the player bundle. Contains NO flags, NO portal answers, and NO
// literal answer values — only the investigation clues (encoded data, artifact
// URLs, coordinates) required to solve. Flags are validated by the backend.
// Kept in sync with server/src/challenges/challenge-data.ts (player-visible
// fields only).
// ============================================================

export type ChallengeCategory =
  | 'web' | 'osint' | 'forensics' | 'crypto' | 'steganography'
  | 'pcap' | 'reverse' | 'pwn' | 'static' | 'custom' | 'decoder' | 'interactive'

export type Universe = 'webverse' | 'osintverse' | 'darknet'
export type Stone = 'space' | 'mind' | 'reality' | 'power' | 'time' | 'soul'

export type PortalType =
  | 'hidden-pixel' | 'recursive-loop' | 'time-based' | 'rabbit-hole' | 'signal'
  | 'cipher-loop' | 'packet' | 'reverse-loop' | 'pwn-terminal' | 'osint-redirect' | 'document-rabbit'

export interface PortalPuzzleData {
  type: PortalType
  title: string
  icon: string
  description: string
  clue: string
}

export interface ChallengeData {
  id: string
  title: string
  category: ChallengeCategory
  universe: Universe
  difficulty: 'moderate'
  description: string
  narrative: string
  nextChallengeId: string | null
  portalType: PortalType
  portalPuzzle: PortalPuzzleData
  hints: string[]
  type: ChallengeCategory
  clueContent?: { label: string; body: string; format?: 'code' | 'image' | 'terminal' | 'metadata' }
  stone: Stone
  points: number
  author: string
}

const webverseChallenges: ChallengeData[] = [
  {
    id: 'wv-01', title: 'The Broken Multiverse', category: 'web', universe: 'webverse', difficulty: 'moderate',
    description: 'A gateway override console is locked. The page hides a machine trace that leads to the override registry — recover the correct override code.',
    narrative: 'Thanos sealed the multiverse gateway. Fury left a breadcrumb in the page for whoever came looking.',
    nextChallengeId: 'wv-02', portalType: 'hidden-pixel',
    portalPuzzle: { type: 'hidden-pixel', title: 'Hidden Pixel Portal', icon: '⚡', description: 'A single black pixel holds the truth. The page is dark — but the pixel is not what it seems.', clue: 'The pixel\'s RGB is (13, 37, 50). Convert the RGB channels to a single hex value to recover the response code.' },
    hints: [
      'Pages often carry developer breadcrumbs that never render. Read what the browser ignores.',
      'The breadcrumb isn\'t text yet — it\'s a run of byte values. Work out the encoding before you follow it.',
      'The registry lists several nodes. Authorisation depends on WHO and WHERE the briefing points to — not on the order they appear.',
    ],
    type: 'static',
    clueContent: { label: '<!-- SOURCE COMMENT -->', body: '<!-- GATEWAY DEBUG: override registry trace =\n68 74 74 70 3a 2f 2f 6c 6f 63 61 6c 68 6f 73 74 3a 34 30 30 30 2f 61 72 74 69 66 61 63 74 73 2f 77 76 2d 30 31 2f 37 66 33 61 39 63 32 65\n— decode to continue. — J.R. -->', format: 'code' },
    stone: 'mind', points: 100, author: 'Nick Fury',
  },
  {
    id: 'wv-02', title: 'Portal Chain', category: 'custom', universe: 'webverse', difficulty: 'moderate',
    description: 'A redirect chain loops endlessly. Only one endpoint truly exits the loop. Trace the chain log and find the real exit.',
    narrative: 'Every wrong turn sends you deeper. The exit responds differently from the traps.',
    nextChallengeId: 'wv-03', portalType: 'recursive-loop',
    portalPuzzle: { type: 'recursive-loop', title: 'Recursive Portal', icon: '🌀', description: 'You\'re caught in a loop. The portal says: "To return, solve the sequence."', clue: 'The numbers repeat: 1, 1, 2, 3, 5, 8, 13, 21... Fibonacci. Sum the first six terms of the sequence to recover the return code.' },
    hints: [
      'The log is a map, not a dead end — something in it points elsewhere.',
      'One field is encoded. Convert it before you decide where to go.',
      'Endpoints answer differently. A loop is not an exit — judge each endpoint by how it responds.',
    ],
    type: 'custom',
    clueContent: { label: 'CHAIN LOG', body: 'REDIRECT TRACE (follow the map):\n68 74 74 70 3a 2f 2f 6c 6f 63 61 6c 68 6f 73 74 3a 34 30 30 30 2f 61 72 74 69 66 61 63 74 73 2f 77 76 2d 30 32 2f 62 31 64 38 34 66 36 30\nSTATUS: 308 Permanent Redirect (loop)\nX-Multiverse-Warning: "The exit answers 200."', format: 'metadata' },
    stone: 'space', points: 150, author: 'Strange',
  },
  {
    id: 'wv-03', title: 'The Auth Matrix', category: 'web', universe: 'webverse', difficulty: 'moderate',
    description: 'The Multiverse Gate issues several bearer tokens, but only one is currently valid for its realm. Recover the reference of the valid token.',
    narrative: 'Authentication is a matrix of decoys. Pick the one token that still holds.',
    nextChallengeId: null, portalType: 'time-based',
    portalPuzzle: { type: 'time-based', title: 'Time-Based Portal', icon: '⏰', description: 'The clock ticks. The portal shows the time. The clue is what the time MEANS.', clue: 'The time is 18:42 — the last transmission timestamp. Base64-encode the time value to recover the answer.' },
    hints: [
      'Authentication leaves traces in the exchange, not just the body. Inspect everything the server sends back.',
      'One header value isn\'t meant to be read directly — determine its encoding first.',
      'Several tokens exist. Validity depends on matching the gate\'s realm AND still being live — not every candidate qualifies.',
    ],
    type: 'interactive',
    clueContent: { label: 'HTTP RESPONSE HEADERS', body: 'Content-Type: application/json\nServer: Multiverse-Gateway/2.0\nWWW-Authenticate: Bearer realm="multiverse"\nX-Trace: 68 74 74 70 3a 2f 2f 6c 6f 63 61 6c 68 6f 73 74 3a 34 30 30 30 2f 61 72 74 69 66 61 63 74 73 2f 77 76 2d 30 33 2f 34 65 39 61 37 63 31 33', format: 'metadata' },
    stone: 'reality', points: 200, author: 'Romanoff',
  },
]

const osintverseChallenges: ChallengeData[] = [
  {
    id: 'os-01', title: 'Where Did He Go?', category: 'osint', universe: 'osintverse', difficulty: 'moderate',
    description: 'An intercepted signal carries only coordinates. Identify the real-world monument at those coordinates, then pull its record reference from the intel dossier.',
    narrative: 'An Avenger went dark beside a monument. The coordinates do not lie.',
    nextChallengeId: 'os-02', portalType: 'osint-redirect',
    portalPuzzle: { type: 'osint-redirect', title: 'OSINT Redirect', icon: '🔍', description: 'You\'re redirected through fake social profiles. Find the real one.', clue: 'The fake profile handle carries a numeric suffix. Strip the suffix to recover the real codename.' },
    hints: [
      'The intercept is almost empty on purpose. What little it contains is a form of location.',
      'Turn the location into a real place before you open anything else.',
      'The dossier holds several places. Let the intercepted location decide which record matters — match it, don\'t trust the label.',
    ],
    type: 'decoder',
    clueContent: { label: 'INTERCEPTED SIGNAL', body: 'LAT: 28.6129\nLON: 77.2295\nTRANSMISSION: "I was here. Standing under the arch."\nINTEL DOSSIER: http://localhost:4000/artifacts/os-01/c72f0a95', format: 'code' },
    stone: 'power', points: 120, author: 'Fury',
  },
  {
    id: 'os-02', title: 'Social Ghost', category: 'osint', universe: 'osintverse', difficulty: 'moderate',
    description: 'A trail of look-alike social profiles hides one authentic, verified account. Identify the genuine profile and recover its account reference.',
    narrative: 'Imposters copied the handle. Only one account is verified and original.',
    nextChallengeId: 'os-03', portalType: 'document-rabbit',
    portalPuzzle: { type: 'document-rabbit', title: 'Document Rabbit Hole', icon: '📄', description: 'A fake classified document is in front of you. It\'s not the real one.', clue: 'The document is redacted with black bars. Reveal the phrase hidden behind the bars to recover the passphrase.' },
    hints: [
      'Identity can be copied. Look for what distinguishes an original from a copy.',
      'Copies leave tells — handles, timestamps, verification status. Compare them.',
      'The anchor is the earliest, verified identity; impersonators arrive later and unverified.',
    ],
    type: 'static',
    clueContent: { label: 'SOCIAL POST METADATA', body: 'DISPLAY NAME: "Natasha R."\nHANDLE SEEN: @n4t4sh4_r0m4n0ff\nNOTE: multiple impersonators detected.\nSOCIAL ARCHIVE: http://localhost:4000/artifacts/os-02/18d3b6e4', format: 'code' },
    stone: 'soul', points: 130, author: 'Widow',
  },
  {
    id: 'os-03', title: 'The Paper Trail', category: 'forensics', universe: 'osintverse', difficulty: 'moderate',
    description: 'A leaked cache of recovered documents contains decoys. Only the authentic, unredacted, cross-verified document carries the true reference.',
    narrative: 'A paper trail was left behind. Most of it is noise; one page is the signal.',
    nextChallengeId: null, portalType: 'rabbit-hole',
    portalPuzzle: { type: 'rabbit-hole', title: 'Rabbit Hole', icon: '🕳️', description: 'You find a fake classified document. "Congratulations!" it says. But the flag is invalid.', clue: 'The decoy document shows a fake flag. The real value is hidden in the document\'s "paper trail" text — read it carefully.' },
    hints: [
      'Most of the recovered material is noise. Authenticity is something you can prove.',
      'Each page carries a state and a checksum — use them to separate signal from forgery.',
      'Only one page is both untampered and validated; the others advertise their own doubt.',
    ],
    type: 'forensics',
    clueContent: { label: 'IMAGE PIXEL ANALYSIS', body: 'IMG: classified-doc.png (1024x1024)\nRECOVERY NOTE: several pages recovered; most are forgeries.\nRECOVERY ARCHIVE: http://localhost:4000/artifacts/os-03/9f5c2a70', format: 'code' },
    stone: 'time', points: 140, author: 'Banner',
  },
]

const darknetChallenges: ChallengeData[] = [
  {
    id: 'dn-01', title: 'Pixel Whisper', category: 'forensics', universe: 'darknet', difficulty: 'moderate',
    description: 'The LSB plane of an image was extracted to a byte stream. Decode the bytes to recover the hidden token.',
    narrative: 'Thanos left a message in the pixels. The bytes are already lifted — you just have to read them.',
    nextChallengeId: 'dn-02', portalType: 'signal',
    portalPuzzle: { type: 'signal', title: 'Signal Portal', icon: '📡', description: 'A waveform pulses before you. Decode the binary signal.', clue: 'Decode the binary signal, then combine it with the anomalous pixel sequence to recover the passphrase.' },
    hints: [
      'The data has already been lifted from the image; you only need to read it.',
      'It isn\'t text yet — identify the numeric base before converting.',
      'Carry the bytes through to plain ASCII to reveal the string.',
    ],
    type: 'forensics',
    clueContent: { label: 'PIXEL DATA (LSB extracted)', body: 'IMG: whisper.png (100x100)\nLSB BYTE STREAM (hex):\n65 36 33 62 31 64 37 61\nDecode the bytes to ASCII to reveal the token.', format: 'code' },
    stone: 'space', points: 150, author: 'Strange',
  },
  {
    id: 'dn-02', title: 'The Cipher Lab', category: 'crypto', universe: 'darknet', difficulty: 'moderate',
    description: 'A message left the lab base64-encoded. Reverse the final encoding to recover the token.',
    narrative: 'The lab encoded its last transmission. Undo the wrapper.',
    nextChallengeId: 'dn-03', portalType: 'cipher-loop',
    portalPuzzle: { type: 'cipher-loop', title: 'Cipher Loop', icon: '🔐', description: 'A cipher wheel spins. The encoded text is shown — decode it.', clue: 'Decode the encoded stream through the hex → binary → base64 chain to recover the flag.' },
    hints: [
      'The lab\'s output is wrapped, not encrypted — recognise the wrapper.',
      'The final line uses a common transport encoding. Name it, then reverse it.',
      'Undo the last encoding stage to read the payload.',
    ],
    type: 'decoder',
    clueContent: { label: 'ENCODED MESSAGE', body: 'CIPHER LAB OUTPUT\nFINAL STAGE (base64): NGM5ZjIwODE=\nDecode to recover the token.', format: 'code' },
    stone: 'mind', points: 160, author: 'Banner',
  },
  {
    id: 'dn-03', title: 'Hidden Signal', category: 'steganography', universe: 'darknet', difficulty: 'moderate',
    description: 'A signal was buried in an LSB bit plane and dumped as raw binary. Decode the binary to recover the token.',
    narrative: 'The signal is buried in ones and zeroes. Lift it out.',
    nextChallengeId: 'dn-04', portalType: 'signal',
    portalPuzzle: { type: 'signal', title: 'Signal Portal', icon: '📡', description: 'A waveform pulses before you. Decode the binary signal.', clue: 'Extract the least-significant-bit plane and decode the binary to recover the passphrase.' },
    hints: [
      'The signal is raw — ones and zeroes are not the final form.',
      'Group the bits into bytes and interpret them.',
      'Carry the binary through to ASCII to read the buried string.',
    ],
    type: 'forensics',
    clueContent: { label: 'LSB EXTRACTION', body: 'IMG: signal.png\nCHANNEL R, BIT 0 (binary):\n01100010 00110111 01100101 00110101 00110011 00110000 00110100 01100011\nDecode the binary to ASCII to reveal the token.', format: 'code' },
    stone: 'reality', points: 170, author: 'Romanoff',
  },
  {
    id: 'dn-04', title: 'Packet Capture', category: 'pcap', universe: 'darknet', difficulty: 'moderate',
    description: 'A capture holds one HTTP response whose body carries a base64 token. Find the right packet and decode its body.',
    narrative: 'The network spoke once. Find the packet that answered.',
    nextChallengeId: 'dn-05', portalType: 'packet',
    portalPuzzle: { type: 'packet', title: 'Packet Portal', icon: '🌐', description: 'A scrolling packet table. One packet holds the answer.', clue: 'One packet holds the answer. Inspect the HTTP request/response to find the packet number that carries the flag.' },
    hints: [
      'A capture has many lines but only one answer — not every packet is a response.',
      'Find the response that actually returned content, then look at its body.',
      'The body is encoded for transport; reverse that encoding to read it.',
    ],
    type: 'pcap',
    clueContent: { label: 'PCAP PACKET LIST', body: '#   SRC          DST          PROTO  INFO\n40  10.0.0.1     10.0.0.42    TCP    SYN\n41  10.0.0.1     10.0.0.42    HTTP   GET /key\n42  10.0.0.42    10.0.0.1     HTTP   200 OK  body(base64)=MWY4YTZkMjk=\n43  10.0.0.1     10.0.0.42    TCP    FIN\nInspect the response body to reveal the token.', format: 'code' },
    stone: 'power', points: 180, author: 'Romanoff',
  },
  {
    id: 'dn-05', title: 'Android Core', category: 'reverse', universe: 'darknet', difficulty: 'moderate',
    description: 'A recovered binary stores its key as a hex constant in .rodata. Identify the key string and decode it.',
    narrative: 'The binary hides its key in plain sight — if you can read section data.',
    nextChallengeId: 'dn-06', portalType: 'reverse-loop',
    portalPuzzle: { type: 'reverse-loop', title: 'Reverse Loop', icon: '⚙️', description: 'Disassembly scrolls. Find the function with the key.', clue: 'Inspect the .rodata section. Find the string tagged as the key to recover the passphrase.' },
    hints: [
      'Binaries hide constants in plain sight — section data is readable.',
      'Most strings are labels; one is explicitly the key, and it\'s stored as bytes.',
      'Convert the key\'s bytes to characters to recover it.',
    ],
    type: 'reverse',
    clueContent: { label: 'DISASSEMBLY (.rodata)', body: '0x00001234: "multiverse_init_v2"\n0x00001248: "android_core_v3"\n0x00001260: KEY (hex) = 33 64 30 63 37 62 39 34\n0x00001280: "MIND_STONE = ACTIVATED"\nDecode the KEY bytes to ASCII to reveal the token.', format: 'code' },
    stone: 'soul', points: 190, author: 'Banner',
  },
  {
    id: 'dn-06', title: 'Buffer Overflow', category: 'pwn', universe: 'darknet', difficulty: 'moderate',
    description: 'A format-string leak dumped stack bytes as hex. Reassemble the leaked bytes into text to recover the token.',
    narrative: 'The vulnerable program leaked its own secret. Read what spilled out.',
    nextChallengeId: null, portalType: 'pwn-terminal',
    portalPuzzle: { type: 'pwn-terminal', title: 'Pwn Terminal', icon: '💻', description: 'A vulnerable terminal. Exploit the format string to leak the flag.', clue: 'Exploit the format string to leak the stack; the leaked bytes decode to a short ASCII tag.' },
    hints: [
      'The program leaks its own memory — read what spilled out.',
      'The leak is a sequence of raw bytes, not text yet.',
      'Interpret the leaked bytes as ASCII to reconstruct the value.',
    ],
    type: 'pwn',
    clueContent: { label: 'VULNERABLE PROGRAM', body: '#include <stdio.h>\nint main(int argc, char *argv[]) {\n  printf(argv[1]);  // format-string vuln\n  return 0;\n}\nLEAKED MEMORY (hex): 38 65 32 31 34 35 61 66\nInterpret the leaked bytes as ASCII to reveal the token.', format: 'terminal' },
    stone: 'time', points: 200, author: 'Romanoff',
  },
]

export const challenges: ChallengeData[] = [
  ...webverseChallenges,
  ...osintverseChallenges,
  ...darknetChallenges,
]
