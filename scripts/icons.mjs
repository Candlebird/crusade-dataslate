// Writes src/components/iconData.ts: every icon named in src as 'g:<name>' (game-icons.net) or 'l:<name>' (Lucide),
// taken from the Iconify sets in node_modules. Run `npm run icons` after using a new icon.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sets = {
  g: JSON.parse(readFileSync('node_modules/@iconify-json/game-icons/icons.json', 'utf8')),
  l: JSON.parse(readFileSync('node_modules/@iconify-json/lucide/icons.json', 'utf8')),
};
const OUT = 'src/components/iconData.ts';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !p.endsWith('iconData.ts') ? [p] : [];
});
const names = new Set();
for (const f of files('src')) for (const m of readFileSync(f, 'utf8').matchAll(/['"]([gl]):([a-z0-9-]+)['"]/g)) names.add(`${m[1]}:${m[2]}`);

const rows = [...names].sort().map((n) => {
  const [p, id] = n.split(':');
  const set = sets[p];
  const icon = set.icons[id];
  if (!icon) throw new Error(`No icon ${n}`);
  const box = icon.width ?? set.width ?? 24;
  // game-icons are one filled path, so keep just its d; Lucide icons keep their stroked markup.
  const body = p === 'g' ? icon.body.match(/ d="([^"]+)"/)[1] : icon.body;
  return `  '${n}': [${box}, '${body}'],`;
});

writeFileSync(OUT, `// Written by scripts/icons.mjs: don't edit by hand.
export const ICONS = {
${rows.join('\n')}
} as const satisfies Record<string, readonly [number, string]>;

export type IconName = keyof typeof ICONS;
`);
console.log(`${OUT}: ${rows.length} icons`);
