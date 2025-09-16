#!/usr/bin/env node
/**
 * Simple circular import detector for TS/TSX in frontend/src.
 * Resolves relative paths and '@/' alias to build a module graph.
 * Prints cycles it finds.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'frontend', 'src');

/** Collect files recursively */
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

/** Basic import/export-from regex */
const importRe = /^(?:import|export)\s+[^'"`]*?from\s+['"`]([^'"`]+)['"`]/gm;

/** Resolve an import specifier to an absolute file path (best effort). */
function resolveSpec(fromFile, spec) {
  if (!spec) return null;
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const base = path.resolve(path.dirname(fromFile), spec);
    const candidates = [
      base,
      base + '.ts',
      base + '.tsx',
      base + '.js',
      base + '.jsx',
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
      path.join(base, 'index.js'),
      path.join(base, 'index.jsx'),
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch {}
    }
    return null;
  }
  // Alias '@/...' → frontend/src/...
  if (spec.startsWith('@/')) {
    const base = path.join(SRC, spec.slice(2));
    const candidates = [
      base + '.ts', base + '.tsx', base + '.js', base + '.jsx',
      path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
      path.join(base, 'index.js'), path.join(base, 'index.jsx'),
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch {}
    }
    return null;
  }
  // External package → ignore
  return null;
}

/** Build graph */
const files = walk(SRC);
const graph = new Map(); // file -> Set(deps)

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const deps = new Set();
  let m;
  importRe.lastIndex = 0;
  while ((m = importRe.exec(src))) {
    const spec = m[1];
    const resolved = resolveSpec(f, spec);
    if (resolved) deps.add(path.normalize(resolved));
  }
  graph.set(path.normalize(f), deps);
}

/** Detect cycles via DFS */
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map();
const parent = new Map();
const cycles = [];

function dfs(u) {
  color.set(u, GRAY);
  for (const v of graph.get(u) || []) {
    if (!graph.has(v)) continue;
    if ((color.get(v) || WHITE) === WHITE) {
      parent.set(v, u);
      dfs(v);
    } else if (color.get(v) === GRAY) {
      // Found a back-edge: reconstruct the cycle
      const cyc = [v];
      let x = u;
      while (x && x !== v) { cyc.push(x); x = parent.get(x); }
      cyc.reverse();
      cycles.push(cyc);
    }
  }
  color.set(u, BLACK);
}

for (const f of graph.keys()) {
  if ((color.get(f) || WHITE) === WHITE) dfs(f);
}

if (cycles.length === 0) {
  console.log('No cycles detected.');
  process.exit(0);
}

console.log(`Detected ${cycles.length} cycle(s):`);
for (const cyc of cycles) {
  console.log('\n---');
  for (let i = 0; i < cyc.length; i++) {
    const rel = path.relative(ROOT, cyc[i]);
    console.log(`${i === 0 ? 'start' : '  -> '} ${rel}`);
  }
}

