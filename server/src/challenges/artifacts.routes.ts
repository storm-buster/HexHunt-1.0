import type { FastifyInstance } from 'fastify';
import { type ArtifactDef } from './challenge-data.js';
import { requireAuth } from '../auth/guards.js';
import { prisma } from '../db/prisma.js';
import { getCurrentSession } from '../events/event.service.js';
import { getInstanceArtifact } from './challenge-instance.service.js';

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

// Challenge artifacts (webverse/osint investigation material). These are now
// AUTHORIZED, not public: a request must carry a valid session cookie, belong to
// a team, and run during a LIVE session. The flag is never present verbatim; the
// correct record must still be deduced from the challenge clue. This blocks
// unauthenticated external tooling (e.g. an AI with browsing) from fetching the
// record data straight from a screenshot of the clue URL.
export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/artifacts/:challengeId/:artifactId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { challengeId, artifactId } = request.params as { challengeId: string; artifactId: string };

      // Must be during a LIVE session…
      const session = await getCurrentSession();
      if (!session) {
        reply.status(409).type('text/html').send('<!doctype html><title>unavailable</title><h1>Artifact unavailable — no live session.</h1>');
        return;
      }
      // …and the requester must belong to a team (derived server-side; never
      // trusted from the client).
      const membership = await prisma.teamMembership.findUnique({ where: { userId: request.user!.sub } });
      if (!membership) {
        reply.status(403).type('text/html').send('<!doctype html><title>forbidden</title><h1>403 — join a team to access artifacts.</h1>');
        return;
      }

      // Serve ONLY this team's own per-instance artifact. The artifactId must
      // match the requester's instance for this challenge, so another team's
      // artifactId (or an enumerated/guessed id) resolves to nothing.
      const art = await getInstanceArtifact(session.id, membership.teamId, challengeId, artifactId);
      if (!art) {
        reply.status(404).type('text/html').send('<!doctype html><title>404</title><h1>404 — no such artifact</h1>');
        return;
      }
      reply.type('text/html').send(renderArtifact(art));
    },
  );
}
