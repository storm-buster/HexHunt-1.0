import type { FastifyInstance } from 'fastify';
import { findArtifact, type ArtifactDef } from './challenge-data.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Renders a challenge artifact as a self-contained HTML page. The page shows
// several candidate records; the player must use the challenge clue to decide
// which record is correct. No record is labelled "answer"/"flag", and the flag
// string never appears verbatim — only a per-record reference token.
function renderArtifact(art: ArtifactDef): string {
  const cards = art.records
    .map((r) => {
      const rows = Object.entries(r.fields)
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
        .join('');
      return `<section class="rec"><h2>${esc(r.label)}</h2><table>${rows}</table></section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>${esc(art.title)}</title>
<style>
  body{background:#050705;color:#e8efe9;font-family:'Space Mono',ui-monospace,monospace;margin:0;padding:2rem;}
  h1{color:#2be066;letter-spacing:.06em;font-size:1.2rem;}
  .intro{color:#7d9585;max-width:720px;margin:.5rem 0 1.5rem;}
  .rec{border:1px solid #17381f;border-radius:6px;padding:1rem 1.25rem;margin-bottom:1rem;max-width:720px;background:#0c1a11;}
  .rec h2{color:#c9a45c;font-size:.95rem;margin:0 0 .5rem;}
  table{border-collapse:collapse;width:100%;}
  th{ text-align:left;color:#7d9585;font-weight:600;padding:3px 12px 3px 0;white-space:nowrap;vertical-align:top;}
  td{color:#e8efe9;padding:3px 0;}
  footer{color:#445048;margin-top:1.5rem;font-size:.75rem;}
</style></head>
<body>
  <h1>◆ ${esc(art.title)}</h1>
  <p class="intro">${esc(art.intro)}</p>
  ${cards}
  <footer>BATTLEWORLD ARCHIVE // read the challenge clue to identify the correct record.</footer>
</body></html>`;
}

// Public (unauthenticated) challenge artifacts. These are puzzle material, not
// secrets: the flag is never present verbatim and the correct record must be
// deduced from the challenge clue. The unguessable :artifactId gates access.
export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  app.get('/artifacts/:challengeId/:artifactId', async (request, reply) => {
    const { challengeId, artifactId } = request.params as { challengeId: string; artifactId: string };
    const art = findArtifact(challengeId, artifactId);
    if (!art) {
      reply.status(404).type('text/html').send('<!doctype html><title>404</title><h1>404 — no such artifact</h1>');
      return;
    }
    reply.type('text/html').send(renderArtifact(art));
  });
}
