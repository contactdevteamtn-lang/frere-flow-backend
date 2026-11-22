// Copie la logique métier du front dans le serveur (src/domain/domain.mjs).
// À relancer si vous modifiez src/services ou src/mock/seed.ts dans le front :
//   npm run sync-domain            (front attendu dans ../frere-flow)
//   FRONT_DIR=chemin/du/front npm run sync-domain
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const front = path.resolve(process.env.FRONT_DIR || path.join(ici, '../../frere-flow'));
await build({
  entryPoints: [path.join(ici, 'domain-entry.ts')],
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  outfile: path.join(ici, '../src/domain/domain.mjs'),
  alias: { '@': path.join(front, 'src') },
  external: ['date-fns'],
  banner: { js: `// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis ${path.basename(front)}/src — ne pas modifier à la main.` },
  logLevel: 'info',
});
