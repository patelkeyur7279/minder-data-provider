#!/usr/bin/env node
// Generates a practicalseries-style numbered documentation book from docs/ for
// the GitHub wiki mirror. docs/ is the single source of truth and is NEVER
// modified by this script — it only READS docs/**/*.md plus docs/wiki-book.json
// and WRITES the decorated book into --out.
//
// Usage: node scripts/build-wiki.mjs --out <dir> [--docs <dir>] [--manifest <file>]
//                                     [--repo <owner/name>] [--branch <name>]
//
// Determinism contract: identical input (docs/**, wiki-book.json, README.md,
// package.json) must produce byte-identical output. No timestamps, no random
// ids, no filesystem-iteration-order dependence (all listing order comes from
// the manifest; directory walks are sorted before use).
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync,
} from 'node:fs';
import { join, dirname, relative, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const eq = tok.indexOf('=');
    if (eq !== -1) {
      out[tok.slice(2, eq)] = tok.slice(eq + 1);
    } else {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small pure helpers (exported for tests via the `internal` object below)
// ---------------------------------------------------------------------------
const toPosix = (p) => p.split(sep).join('/');

/** Tokenize a filename/title into title-cased word parts (github-wiki-safe). */
function tokenize(input) {
  const stripped = input.replace(/^\d+[-_]+/, ''); // drop a leading "01-" page-order prefix
  const parts = stripped.split(/[^A-Za-z0-9.]+/).filter(Boolean);
  return parts.map((tok) => (/^\d/.test(tok) ? tok : tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase()));
}

function slugFromName(input) {
  return tokenize(input).join('-');
}

function displayFromName(input) {
  return tokenize(input).join(' ');
}

/** GitHub-heading-style anchor slug, with de-duplication support via `seen`. */
function githubSlug(text, seen) {
  let slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N} -]+/gu, '')
    .replace(/\s+/g, '-');
  if (seen) {
    if (seen.has(slug)) {
      let n = 1;
      while (seen.has(`${slug}-${n}`)) n += 1;
      seen.add(`${slug}-${n}`);
      slug = `${slug}-${n}`;
    } else {
      seen.add(slug);
    }
  }
  return slug;
}

function basenameNoExt(relPath) {
  const base = relPath.split('/').pop();
  return base.slice(0, base.length - extname(base).length);
}

/** Extract the literal first-line H1 (text after "# "), or null if absent. */
function extractH1(content) {
  const firstLine = content.split('\n', 1)[0];
  const m = /^#\s+(.*\S)\s*$/.exec(firstLine);
  return m ? m[1] : null;
}

/** First natural paragraph after the H1, collapsed to one line, truncated. */
function extractDescription(content) {
  const lines = content.split('\n');
  let i = 0;
  if (/^#\s+/.test(lines[0] ?? '')) i = 1;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const para = [];
  while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s+/.test(lines[i])) {
    para.push(lines[i].trim());
    i += 1;
  }
  let text = para.join(' ')
    .replace(/[`*_>#]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 160) text = `${text.slice(0, 157).trimEnd()}...`;
  return text;
}

function recursiveMdFiles(dir, base = dir) {
  const results = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (dirname(full) === base && (entry === 'development' || entry === 'superpowers')) continue;
      results.push(...recursiveMdFiles(full, base));
    } else if (st.isFile() && extname(entry) === '.md') {
      results.push(toPosix(relative(base, full)));
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Manifest validation + book-plan construction
// ---------------------------------------------------------------------------
function loadManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * A manifest page entry is either a plain string (docs-relative file path) or
 * an object { file, title } when the source H1 isn't fit for a book TOC.
 */
function normalizePage(entry) {
  if (typeof entry === 'string') return { relPath: entry, titleOverride: undefined };
  if (entry && typeof entry === 'object' && typeof entry.file === 'string') {
    return { relPath: entry.file, titleOverride: entry.title };
  }
  throw new Error(`invalid manifest page entry: ${JSON.stringify(entry)}`);
}

function buildPlan(manifest, docsDir) {
  const allFiles = recursiveMdFiles(docsDir);
  const listed = new Map(); // relPath -> { chapterNum, pageIndex, chapter }
  const errors = [];

  manifest.chapters.forEach((chapter) => {
    chapter.pages.forEach((entry, idx) => {
      let relPath;
      try {
        ({ relPath } = normalizePage(entry));
      } catch (e) {
        errors.push(e.message);
        return;
      }
      if (listed.has(relPath)) errors.push(`duplicate manifest listing: ${relPath}`);
      listed.set(relPath, { chapter, pageIndex: idx + 1 });
    });
  });

  const excluded = new Set(manifest.excluded ?? []);
  for (const relPath of excluded) {
    if (listed.has(relPath)) errors.push(`file is both listed and excluded: ${relPath}`);
  }

  for (const [relPath] of listed) {
    if (!existsSync(join(docsDir, relPath))) errors.push(`manifest lists a file that does not exist: ${relPath}`);
  }
  for (const relPath of excluded) {
    if (!existsSync(join(docsDir, relPath))) errors.push(`manifest excludes a file that does not exist: ${relPath}`);
  }

  const unaccounted = allFiles.filter((f) => !listed.has(f) && !excluded.has(f));
  if (unaccounted.length) {
    errors.push(
      `${unaccounted.length} docs file(s) are neither listed in a chapter nor excluded — ` +
      `add each to docs/wiki-book.json:\n  - ${unaccounted.join('\n  - ')}`,
    );
  }

  return { listed, excluded, errors };
}

// ---------------------------------------------------------------------------
// Page metadata (title/slug/filename) for every listed page + chapter index
// ---------------------------------------------------------------------------
function chapterIndexName(chapter) {
  return `${String(chapter.num).padStart(2, '0')}-${slugFromName(chapter.title)}`;
}

function pageBaseName(chapter, pageIndex, slug) {
  return `${String(chapter.num).padStart(2, '0')}.${pageIndex}-${slug}`;
}

function buildBook(manifest, docsDir) {
  const pages = []; // flat book-order list of { kind: 'chapter'|'page', ... }

  manifest.chapters.forEach((chapter) => {
    pages.push({
      kind: 'chapter',
      chapter,
      num: `${chapter.num}`,
      name: chapterIndexName(chapter),
      displayTitle: chapter.title,
    });

    chapter.pages.forEach((entry, idx) => {
      const { relPath, titleOverride } = normalizePage(entry);
      const pageIndex = idx + 1;
      const raw = readFileSync(join(docsDir, relPath), 'utf8').replace(/\r\n/g, '\n');
      const h1 = extractH1(raw);
      const slug = slugFromName(basenameNoExt(relPath));
      // Precedence: manifest title override > source H1 > filename-derived fallback.
      // The chosen title drives the page's H1, breadcrumb, sidebar, Home TOC, and
      // chapter index everywhere — description still comes from the page content.
      const displayTitle = titleOverride ?? h1 ?? displayFromName(basenameNoExt(relPath));
      const description = extractDescription(raw);
      pages.push({
        kind: 'page',
        chapter,
        relPath,
        raw,
        h1,
        pageIndex,
        num: `${chapter.num}.${pageIndex}`,
        name: pageBaseName(chapter, pageIndex, slug),
        displayTitle,
        description,
      });
    });
  });

  return pages;
}

// ---------------------------------------------------------------------------
// Link rewriting
// ---------------------------------------------------------------------------
function blobUrl(repo, branch, relRootPath, hash) {
  const anchor = hash ? `#${hash}` : '';
  return `https://github.com/${repo}/blob/${branch}/${relRootPath}${anchor}`;
}

/** Builds resolver(sourceRelPath, target) -> new link target string. */
function makeLinkResolver({
  docsDir, root, repo, branch, pageMap,
}) {
  return function resolveLink(sourceRelPath, target) {
    if (/^([a-z]+:)?\/\//i.test(target) || target.startsWith('mailto:')) return target;
    const hashIdx = target.indexOf('#');
    const pathPart = hashIdx === -1 ? target : target.slice(0, hashIdx);
    const hash = hashIdx === -1 ? '' : target.slice(hashIdx + 1);
    if (pathPart === '') return target; // pure same-page anchor

    const sourceAbsDir = dirname(join(docsDir, sourceRelPath));
    const absTarget = pathPart.startsWith('/') ? join(root, pathPart.slice(1)) : resolve(sourceAbsDir, pathPart);
    const relToDocs = toPosix(relative(docsDir, absTarget));
    const relToRoot = toPosix(relative(root, absTarget));

    if (!relToDocs.startsWith('..')) {
      const mapped = pageMap.get(relToDocs);
      if (mapped) return hash ? `${mapped}#${hash}` : mapped;
      return blobUrl(repo, branch, `docs/${relToDocs}`, hash);
    }
    return blobUrl(repo, branch, relToRoot, hash);
  };
}

const LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;

function rewriteLinks(content, sourceRelPath, resolveLink) {
  return content.replace(LINK_RE, (whole, bang, text, target) => {
    if (bang) return whole; // never touch image links
    const next = resolveLink(sourceRelPath, target);
    return `[${text}](${next})`;
  });
}

// ---------------------------------------------------------------------------
// TOC + header/footer + page assembly
// ---------------------------------------------------------------------------
function buildInPageToc(content) {
  const lines = content.split('\n');
  const seen = new Set();
  const items = [];
  for (const line of lines) {
    const m = /^(##|###)\s+(.*\S)\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length; // 2 or 3
    const text = m[2].replace(/[`*_]/g, '');
    const anchor = githubSlug(text, seen);
    items.push({ level, text, anchor });
  }
  if (!items.length) return null;
  const body = items
    .map((it) => `${it.level === 3 ? '  ' : ''}- [${it.text}](#${it.anchor})`)
    .join('\n');
  return `<details>\n<summary>Contents</summary>\n\n${body}\n\n</details>\n`;
}

function assemblePageBody(entry, resolveLink) {
  const {
    relPath, raw, h1, num, displayTitle,
  } = entry;
  const rewritten = rewriteLinks(raw, relPath, resolveLink);
  const lines = rewritten.split('\n');
  // displayTitle already encodes precedence (manifest override > source H1 >
  // filename fallback) — it, not the raw h1, is what goes in the new H1 text.
  // Whether the source's own first line is dropped or kept still depends on
  // whether it WAS an H1 (h1 !== null): that's a structural fact about the
  // original content, independent of which title text we render.
  const newH1Text = `${num} — ${displayTitle}`;
  let bodyLines;
  if (h1 !== null) {
    bodyLines = [`# ${newH1Text}`, ...lines.slice(1)];
  } else {
    bodyLines = [`# ${newH1Text}`, '', ...lines];
  }

  const isLong = bodyLines.length > 400;
  if (isLong) {
    const toc = buildInPageToc(bodyLines.slice(1).join('\n'));
    if (toc) bodyLines = [bodyLines[0], '', toc, ...bodyLines.slice(1)];
  }

  const seen = new Set();
  const backToTopAnchor = githubSlug(newH1Text, seen);
  return { body: bodyLines.join('\n'), backToTopAnchor };
}

function header({
  num, chapterNum, chapterName, chapterTitle, title, isChapterIndex,
}) {
  const crumb = isChapterIndex
    ? `[⌂ Home](Home) › ${chapterNum} ${chapterTitle}`
    : `[⌂ Home](Home) › [${chapterNum} ${chapterTitle}](${chapterName}) › ${num} ${title}`;
  const badge = `![docs](https://img.shields.io/badge/docs-${num}-blue)`;
  return `${crumb}\n\n${badge}\n\n* * *\n`;
}

function footer({ backToTopAnchor, prev, next }) {
  const nav = `◀ [prev](${prev}) · [⌂ Home](Home) · [next](${next}) ▶`;
  return (
    `\n\n* * *\n\n` +
    `[⬆ back to top](#${backToTopAnchor})\n\n` +
    `${nav}\n\n` +
    `<sub>minder-data-provider documentation · © 2026 Keyur Patel · MIT</sub>\n`
  );
}

// ---------------------------------------------------------------------------
// Home / Sidebar / Footer
// ---------------------------------------------------------------------------
function extractReadmePitch(readme) {
  const lines = readme.split('\n');
  const tagline = lines.find((l) => /^###\s+/.test(l));
  const boldPitch = lines.find((l) => /^\*\*.*\*\*$/.test(l.trim()));
  const idx = lines.indexOf(boldPitch ?? '');
  let para = '';
  if (idx !== -1) {
    let i = idx + 1;
    while (i < lines.length && lines[i].trim() === '') i += 1;
    const buf = [];
    while (i < lines.length && lines[i].trim() !== '') {
      buf.push(lines[i].trim());
      i += 1;
    }
    para = buf.join(' ');
  }
  return {
    tagline: tagline ? tagline.replace(/^###\s+/, '').trim() : 'The universal React data layer',
    pitch: (boldPitch ? boldPitch.trim().replace(/^\*\*|\*\*$/g, '') : '') + (para ? ` ${para}` : ''),
  };
}

function buildHome({
  pages, readme, repo, branch,
}) {
  const { tagline, pitch } = extractReadmePitch(readme);
  const npmBadge = 'https://img.shields.io/npm/v/minder-data-provider.svg';
  const ciBadge = `https://img.shields.io/github/actions/workflow/status/${repo}/ci.yml?branch=${branch}&label=tests`;

  const tocLines = [];
  let chapterN = 0;
  for (const entry of pages) {
    if (entry.kind === 'chapter') {
      chapterN += 1;
      tocLines.push(`${chapterN}. **[${entry.num} ${entry.displayTitle}](${entry.name})**`);
    } else {
      const desc = entry.description ? ` — ${entry.description}` : '';
      tocLines.push(`   ${entry.pageIndex}. [${entry.num} ${entry.displayTitle}](${entry.name})${desc}`);
    }
  }

  const usageEntry = pages.find((p) => p.kind === 'page' && p.relPath === 'USAGE_GUIDE.md');
  const apiEntry = pages.find((p) => p.kind === 'page' && p.relPath === 'API_REFERENCE.md');
  const providersEntry = pages.find((p) => p.kind === 'page' && p.relPath === 'providers/CATALOG.md');
  const quickLinks = [
    usageEntry ? `[Install](${usageEntry.name})` : null,
    usageEntry ? `[Quick start](${usageEntry.name})` : null,
    apiEntry ? `[API](${apiEntry.name})` : null,
    providersEntry ? `[Providers](${providersEntry.name})` : null,
  ].filter(Boolean).join(' · ');

  return (
    `# Minder Data Provider\n\n` +
    `[![npm version](${npmBadge})](https://www.npmjs.com/package/minder-data-provider)\n` +
    `[![CI](${ciBadge})](https://github.com/${repo}/actions/workflows/ci.yml)\n\n` +
    `### ${tagline}\n\n` +
    `${pitch}\n\n` +
    `* * *\n\n` +
    `## Table of Contents\n\n` +
    `${tocLines.join('\n')}\n\n` +
    `* * *\n\n` +
    `**Quick links:** ${quickLinks}\n\n` +
    `* * *\n\n` +
    `<sub>minder-data-provider documentation · © 2026 Keyur Patel · MIT — built from docs/, do not edit the wiki directly</sub>\n`
  );
}

function buildSidebar(pages) {
  const lines = ['**[⌂ Home](Home)**', ''];
  for (const entry of pages) {
    if (entry.kind === 'chapter') {
      lines.push(`**[${entry.num} ${entry.displayTitle}](${entry.name})**`);
    } else {
      lines.push(`  - [${entry.num} ${entry.displayTitle}](${entry.name})`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildFooterPage() {
  return '[⌂ Home](Home) · © 2026 Keyur Patel · MIT · built from docs/ — do not edit the wiki directly\n';
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------
function generate({
  docsDir, manifestPath, outDir, repo, branch, root,
}) {
  const manifest = loadManifest(manifestPath);
  const { errors } = buildPlan(manifest, docsDir);
  if (errors.length) return { ok: false, errors };

  const book = buildBook(manifest, docsDir);

  const pageMap = new Map(); // docs-relative path -> wiki link target (no .md)
  for (const entry of book) {
    if (entry.kind === 'page') pageMap.set(entry.relPath, entry.name);
  }

  const resolveLink = makeLinkResolver({
    docsDir, root, repo, branch, pageMap,
  });

  // Assemble every content page.
  const outputs = new Map(); // filename (no .md) -> content string
  const contentEntries = book.filter((e) => e.kind === 'page' || e.kind === 'chapter');

  const assembled = contentEntries.map((entry, i) => {
    const prevName = i === 0 ? 'Home' : contentEntries[i - 1].name;
    const nextName = i === contentEntries.length - 1 ? 'Home' : contentEntries[i + 1].name;

    if (entry.kind === 'chapter') {
      const pagesInChapter = entry.chapter.pages.map((rawEntry) => {
        const { relPath } = normalizePage(rawEntry);
        const p = book.find((b) => b.kind === 'page' && b.relPath === relPath);
        const desc = p.description ? ` — ${p.description}` : '';
        return `${p.pageIndex}. [${p.num} ${p.displayTitle}](${p.name})${desc}`;
      });
      const h = header({
        num: entry.num, chapterNum: entry.num, chapterName: entry.name, chapterTitle: entry.displayTitle, isChapterIndex: true,
      });
      const backToTopAnchor = githubSlug(`${entry.num} ${entry.displayTitle}`, new Set());
      const body = `# ${entry.num} — ${entry.displayTitle}\n\n${pagesInChapter.join('\n')}\n`;
      const f = footer({ backToTopAnchor, prev: prevName, next: nextName });
      return { name: entry.name, content: `${h}\n${body}${f}` };
    }

    const h = header({
      num: entry.num,
      chapterNum: entry.chapter.num,
      chapterName: chapterIndexName(entry.chapter),
      chapterTitle: entry.chapter.title,
      title: entry.displayTitle,
      isChapterIndex: false,
    });
    const { body, backToTopAnchor } = assemblePageBody(entry, resolveLink);
    const f = footer({ backToTopAnchor, prev: prevName, next: nextName });
    return { name: entry.name, content: `${h}\n${body}${f}` };
  });

  for (const { name, content } of assembled) {
    if (outputs.has(name)) {
      return { ok: false, errors: [`two sources map to the same output page name: ${name}`] };
    }
    outputs.set(name, content);
  }

  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const home = buildHome({
    pages: book, readme, repo, branch,
  });
  const sidebar = buildSidebar(book);
  const footerPage = buildFooterPage();

  for (const [name] of [['Home'], ['_Sidebar'], ['_Footer']]) {
    if (outputs.has(name)) return { ok: false, errors: [`two sources map to the same output page name: ${name}`] };
  }
  outputs.set('Home', home);
  outputs.set('_Sidebar', sidebar);
  outputs.set('_Footer', footerPage);

  // Link check: every wiki-internal link target must resolve to a real page.
  const brokenLinks = [];
  for (const [name, content] of outputs) {
    let match;
    LINK_RE.lastIndex = 0;
    while ((match = LINK_RE.exec(content))) {
      const [, bang, , target] = match;
      if (bang) continue;
      if (/^([a-z]+:)?\/\//i.test(target) || target.startsWith('mailto:')) continue;
      const hashIdx = target.indexOf('#');
      const targetName = hashIdx === -1 ? target : target.slice(0, hashIdx);
      if (targetName === '') continue; // same-page anchor
      if (!outputs.has(targetName)) brokenLinks.push(`${name}.md -> (${target})`);
    }
  }
  if (brokenLinks.length) {
    return { ok: false, errors: [`broken wiki-internal link(s):\n  - ${brokenLinks.join('\n  - ')}`] };
  }

  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of outputs) {
    writeFileSync(join(outDir, `${name}.md`), content, 'utf8');
  }

  const pageCount = contentEntries.filter((e) => e.kind === 'page').length;
  const chapterCount = contentEntries.filter((e) => e.kind === 'chapter').length;
  return {
    ok: true,
    pageCount,
    chapterCount,
    excludedCount: manifest.excluded?.length ?? 0,
    totalFiles: outputs.size,
  };
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) {
    console.error('build-wiki: --out <dir> is required');
    process.exit(1);
  }
  const docsDir = args.docs ? resolve(args.docs) : join(ROOT, 'docs');
  const manifestPath = args.manifest ? resolve(args.manifest) : join(docsDir, 'wiki-book.json');
  const outDir = resolve(args.out);
  const repo = args.repo || 'patelkeyur7279/minder-data-provider';
  const branch = args.branch || 'dev';
  const root = args.root ? resolve(args.root) : ROOT;

  const result = generate({
    docsDir, manifestPath, outDir, repo, branch, root,
  });

  if (!result.ok) {
    console.error('build-wiki: FAILED\n');
    for (const e of result.errors) console.error(`- ${e}\n`);
    process.exit(1);
  }

  console.log(
    `build-wiki: OK — ${result.pageCount} pages across ${result.chapterCount} chapters ` +
    `(${result.excludedCount} excluded), ${result.totalFiles} files written to ${outDir}`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

export const internal = {
  tokenize,
  slugFromName,
  displayFromName,
  githubSlug,
  basenameNoExt,
  extractH1,
  extractDescription,
  recursiveMdFiles,
  buildPlan,
  buildBook,
  makeLinkResolver,
  rewriteLinks,
  generate,
  chapterIndexName,
  pageBaseName,
};
