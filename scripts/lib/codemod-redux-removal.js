'use strict';

/**
 * `minder codemod redux-removal` — auto-migrate off the Redux integration
 * removed in v3.0 (Task C). Pure logic module: no `fs`/`process` here (same
 * division of labor as scripts/lib/openapi-codegen.js) — `src/cli/index.cjs`
 * does the directory walk + file I/O + --dry-run preview.
 *
 * WHAT THIS MIGRATES — see docs/MIGRATION_GUIDE.md ("v2.x -> v3.0 — Redux
 * integration removed") and CHANGELOG.md's [3.0.0] Unreleased "Removed"
 * section for the authoritative, human-facing description. The removed
 * surface, exactly as those docs describe it:
 *   1. `useStore()` hook                                    -> FLAG ONLY
 *   2. `useReduxSlice(route)` hook                           -> AUTO-FIX (rename to useMinder) + review TODO
 *   3. `ReduxConfig` type                                    -> FLAG ONLY
 *   4. `configureMinder({ redux })` / `MinderConfig.redux`   -> AUTO-FIX (field removed)
 *   5. MinderDataProvider's Redux <Provider> wrapper /
 *      `useMinderContext().store`                            -> FLAG ONLY
 *   6. `DynamicLoader` redux members (loadRedux/getStore/
 *      isReduxLoaded/addReducer, 'redux' preload, .redux
 *      field on getLoadingStatus()/getBundleSavings())        -> FLAG ONLY
 *   7. `@reduxjs/toolkit` / `react-redux` peer deps           -> informational only (no code to rewrite)
 *
 * STRATEGY — text/regex transforms, NOT the TypeScript compiler API. Recorded
 * tradeoff (P11 native-first + this CLI's own constraints):
 *   - `src/cli/index.cjs` ships as plain source and runs via `npx minder`
 *     directly inside a CONSUMER's project (see that file's header — no
 *     build step, required straight from bin/minder.js). `typescript` is a
 *     devDependency of THIS repo only, never a runtime dep or peer — a
 *     consumer project has no guarantee it's resolvable from their
 *     node_modules (plain-JS projects, or TS via a non-`typescript`-package
 *     toolchain). A ts.transform-based codemod would have to `require('typescript')`
 *     at runtime and could hard-fail for a large fraction of real consumers.
 *   - The v3.0 removal is a small, FIXED, fully-enumerated set of import
 *     specifiers/identifiers/object keys (the table above) — not general JS/TS
 *     semantics. Regexes anchored on actual import bindings (so a generic name
 *     like `useStore` — also exported by zustand — is only touched when it's
 *     really bound to a `minder-data-provider*` import in THIS file) are
 *     precise enough for this bounded problem and need zero new dependencies.
 *   - Accepted limitation: this does not parse a full JS/TS grammar. Unusual
 *     formatting a human wouldn't write (computed keys, `import * as ns`
 *     namespace imports, CommonJS `require()` destructuring, braces/commas
 *     hidden inside template literals doing something exotic) can defeat a
 *     regex where an AST would not. Every transform here is narrow, and
 *     anything it isn't confident about is left BYTE-UNTOUCHED and surfaced
 *     as a manual TODO instead of silently mis-rewritten (honesty over
 *     magic — see the per-category table above). Always review a `--dry-run`
 *     before trusting the write.
 */

const MINDER_SPECIFIER_RE = /^minder-data-provider(\/[A-Za-z0-9_-]+)?$/;

const TODO = {
  useStore:
    "// TODO(minder-codemod): useStore() was removed in v3.0 -- use your own react-redux store " +
    'instead (see docs/MIGRATION_GUIDE.md, "v2.x -> v3.0").',
  reduxSliceShape:
    '// TODO(minder-codemod): review this useMinder() call -- useReduxSlice() returned ' +
    '{ state, actions, selectors, dispatch }; useMinder() returns { data, loading, error, mutate } ' +
    '(see docs/MIGRATION_GUIDE.md).',
  reduxConfigType:
    '// TODO(minder-codemod): ReduxConfig was removed in v3.0 -- remove this type usage ' +
    '(see docs/MIGRATION_GUIDE.md).',
  providerStore:
    "// TODO(minder-codemod): MinderDataProvider no longer creates a Redux store in v3.0 -- " +
    'useMinderContext().store is gone; wrap your own <Provider> from react-redux if you still need one ' +
    '(see docs/MIGRATION_GUIDE.md).',
  dynamicLoader:
    "// TODO(minder-codemod): DynamicLoader's Redux members (loadRedux/getStore/isReduxLoaded/" +
    "addReducer, the 'redux' preload option) were removed in v3.0 (see docs/MIGRATION_GUIDE.md).",
};

// ============================================================================
// Small text-scanning primitives (string/comment aware bracket matching --
// no AST, but not naive either).
// ============================================================================

/**
 * Advance `idx` past a string/template literal or comment starting at `idx`
 * (idx must point at the opening quote/slash), or return -1 if `idx` isn't
 * the start of one. Used by `findMatchingClose`/value scanners so braces
 * inside strings/comments never desync the depth counter.
 */
function skipStringOrComment(source, idx) {
  const ch = source[idx];
  if (ch === '"' || ch === "'" || ch === '`') {
    let i = idx + 1;
    while (i < source.length) {
      if (source[i] === '\\') {
        i += 2;
        continue;
      }
      if (source[i] === ch) return i + 1;
      i += 1;
    }
    return source.length;
  }
  if (ch === '/' && source[idx + 1] === '/') {
    const nl = source.indexOf('\n', idx);
    return nl === -1 ? source.length : nl;
  }
  if (ch === '/' && source[idx + 1] === '*') {
    const end = source.indexOf('*/', idx + 2);
    return end === -1 ? source.length : end + 2;
  }
  return -1;
}

/**
 * Given `openIdx` pointing at an opening bracket (`{`, `[`, or `(`), return
 * the index of its matching close, string/comment-aware. Returns -1 if
 * unterminated (malformed input -- caller treats as "don't touch").
 */
function findMatchingClose(source, openIdx) {
  const open = source[openIdx];
  const close = open === '{' ? '}' : open === '[' ? ']' : ')';
  let depth = 1;
  let i = openIdx + 1;
  while (i < source.length) {
    const skip = skipStringOrComment(source, i);
    if (skip !== -1) {
      i = skip;
      continue;
    }
    const ch = source[i];
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) return ch === close ? i : -1;
    }
    i += 1;
  }
  return -1;
}

/**
 * Locate a top-level `key:` inside an object literal body (the text strictly
 * between its `{` and matching `}`), and the full span of its value (up to
 * the next top-level comma, or the object's own close). Returns
 * `{ keyStart, valueEnd, hasTrailingComma }` (offsets into `source`) or
 * `null` if `key` isn't present at the top level of this object.
 */
function findObjectKey(source, bodyStart, bodyEnd, key) {
  const keyRe = new RegExp('(^|[,{\\s])(' + key + ')\\s*:', 'g');
  keyRe.lastIndex = bodyStart;
  let m;
  while ((m = keyRe.exec(source))) {
    const keyStart = m.index + m[1].length;
    if (keyStart >= bodyEnd) return null;
    // Confirm this match is at the object's TOP level (depth 0 relative to
    // bodyStart) -- walk from bodyStart to keyStart tracking depth; skip if
    // we're actually nested inside a sub-object/array/call.
    let depth = 0;
    let i = bodyStart;
    while (i < keyStart) {
      const skip = skipStringOrComment(source, i);
      if (skip !== -1) {
        i = skip;
        continue;
      }
      const ch = source[i];
      if (ch === '{' || ch === '[' || ch === '(') depth += 1;
      else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
      i += 1;
    }
    if (depth !== 0) continue; // nested -- not our key, keep scanning

    // Found the key at top level. Scan its value to find where it ends.
    const colonIdx = source.indexOf(':', keyStart + key.length);
    let vi = colonIdx + 1;
    let vdepth = 0;
    let valueEnd = -1;
    let hasTrailingComma = false;
    while (vi < bodyEnd) {
      const skip = skipStringOrComment(source, vi);
      if (skip !== -1) {
        vi = skip;
        continue;
      }
      const ch = source[vi];
      if (vdepth === 0 && ch === ',') {
        valueEnd = vi;
        hasTrailingComma = true;
        break;
      }
      if (ch === '{' || ch === '[' || ch === '(') vdepth += 1;
      else if (ch === '}' || ch === ']' || ch === ')') {
        if (vdepth === 0) {
          // Hit the enclosing object's own close -- this was the last property.
          valueEnd = vi;
          break;
        }
        vdepth -= 1;
      }
      vi += 1;
    }
    if (valueEnd === -1) valueEnd = bodyEnd;
    return { keyStart, valueEnd, hasTrailingComma };
  }
  return null;
}

/**
 * Compute the [start, end) span to delete in order to remove `key: value`
 * (plus its delimiting comma and, when the property occupied its own line,
 * that whole line) from the object literal whose body is [bodyStart, bodyEnd).
 * Returns null when `key` isn't present.
 */
function planObjectKeyRemoval(source, bodyStart, bodyEnd, key) {
  const found = findObjectKey(source, bodyStart, bodyEnd, key);
  if (!found) return null;
  let { keyStart, valueEnd, hasTrailingComma } = found;

  let removeStart = keyStart;
  let removeEnd = valueEnd + (hasTrailingComma ? 1 : 0); // consume "," if present

  if (!hasTrailingComma) {
    // Last property -- absorb a PRECEDING comma instead, so we don't leave
    // a dangling leading comma behind (e.g. "{ a: 1, redux: false }" -> "{ a: 1 }").
    let p = removeStart - 1;
    while (p >= bodyStart && /\s/.test(source[p])) p -= 1;
    if (p >= bodyStart && source[p] === ',') removeStart = p;
  }

  // If the property (plus its comma) is alone on its line, remove the whole
  // line (indentation + trailing newline) for clean output.
  let lineStart = source.lastIndexOf('\n', removeStart) + 1;
  if (source.slice(lineStart, removeStart).trim() === '') {
    let afterEnd = removeEnd;
    while (afterEnd < bodyEnd && /[ \t]/.test(source[afterEnd])) afterEnd += 1;
    if (source[afterEnd] === '\n') {
      removeStart = lineStart;
      removeEnd = afterEnd + 1;
    }
  }

  return { start: removeStart, end: removeEnd };
}

// ============================================================================
// Import-binding collection (identifies which local names, in THIS file,
// are actually bound to which symbol from a `minder-data-provider*` import
// -- everything downstream is gated on these bindings so a generic name
// like `useStore` isn't falsely flagged unless it really came from minder).
// ============================================================================

const IMPORT_RE = /import\s+(type\s+)?\{([\s\S]*?)\}\s*from\s*(['"])([^'"]+)\3\s*;?/g;

function parseImportNames(namesRaw) {
  return namesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const asMatch = entry.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      if (asMatch) return { imported: asMatch[1], local: asMatch[2] };
      return { imported: entry, local: entry };
    });
}

/**
 * Find every `import { ... } from 'minder-data-provider[/subpath]'` (named
 * imports only -- namespace imports (`import * as ns`) and CommonJS
 * `require()` destructuring are out of scope, see module header) statement
 * in `source`. Returns an array of
 * `{ start, end, specifier, entries: [{imported, local, start, end}] }`
 * where each entry's start/end locate that specific name inside the import
 * statement (for precise in-place renames).
 */
function findMinderImports(source) {
  const results = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(source))) {
    const specifier = m[4];
    if (!MINDER_SPECIFIER_RE.test(specifier)) continue;
    const namesRaw = m[2];
    const namesStart = m.index + m[0].indexOf(namesRaw, m[0].indexOf('{'));
    const entries = parseImportNames(namesRaw).map((e) => {
      // Locate this specific entry's offset within namesRaw (first match wins;
      // acceptable since duplicate identical entries in one import are invalid JS anyway).
      const entryIdx = namesRaw.indexOf(e.imported === e.local ? e.imported : e.imported + ' as ' + e.local);
      return { ...e, start: namesStart + entryIdx, end: namesStart + entryIdx + (e.imported === e.local ? e.imported.length : e.imported.length + 4 + e.local.length) };
    });
    results.push({ start: m.index, end: m.index + m[0].length, specifier, entries, raw: m[0], namesRaw, namesStart });
  }
  return results;
}

/** Local (in-file) name bound to `symbol` via a minder import, or null. */
function bindingFor(minderImports, symbol) {
  for (const imp of minderImports) {
    const entry = imp.entries.find((e) => e.imported === symbol);
    if (entry) return { local: entry.local, entry, imp };
  }
  return null;
}

/** Local name `Provider` is bound to via `import { Provider } from 'react-redux'`, or null. */
function reactReduxProviderBinding(source) {
  const re = /import\s+(type\s+)?\{([\s\S]*?)\}\s*from\s*(['"])react-redux\3\s*;?/g;
  let m;
  while ((m = re.exec(source))) {
    const entry = parseImportNames(m[2]).find((e) => e.imported === 'Provider');
    if (entry) return entry.local;
  }
  return null;
}

// ============================================================================
// Edit collection -- every detector below appends {start, end, text, kind}
// edits (text === '' for a pure deletion) against the ORIGINAL, unmodified
// `source` string. All edits are applied in one final pass (see applyEdits),
// so detectors never see each other's output and offsets never desync.
// ============================================================================

const OWN_COMMENT_MARKER = '// TODO(minder-codemod):';

/**
 * Line-span ranges of every already-inserted `// TODO(minder-codemod): ...`
 * comment in `source`. Several TODO messages necessarily *mention* the very
 * identifiers/patterns their own detector looks for in prose (e.g. the
 * useStore TODO literally contains the substring "useStore()", the
 * providerStore TODO contains "<Provider" and "useMinderContext().store") --
 * without this exclusion, re-running the codemod over a file it already
 * flagged would match its own comment text and insert a duplicate TODO on
 * every run, breaking idempotency. Every detector below is scoped to skip
 * matches whose index falls inside one of these ranges.
 */
function computeOwnCommentRanges(source) {
  const ranges = [];
  let pos = 0;
  while (pos <= source.length) {
    const nl = source.indexOf('\n', pos);
    const lineEnd = nl === -1 ? source.length : nl;
    if (source.slice(pos, lineEnd).trimStart().startsWith(OWN_COMMENT_MARKER)) {
      ranges.push([pos, lineEnd]);
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return ranges;
}

function insideRanges(ranges, idx) {
  for (const [s, e] of ranges) {
    if (idx >= s && idx < e) return true;
  }
  return false;
}

function lineStartOf(source, idx) {
  return source.lastIndexOf('\n', idx - 1) + 1;
}

function indentOf(source, idx) {
  const ls = lineStartOf(source, idx);
  const m = /^[ \t]*/.exec(source.slice(ls, idx));
  return m ? m[0] : '';
}

/**
 * Already-flagged guard for idempotency: flag-only detectors re-fire on
 * every run (nothing about the underlying import/usage changes), so before
 * queuing a TODO insertion above `targetIdx`'s line we check whether the
 * immediately preceding non-blank line is already exactly this TODO -- if
 * so, skip (re-running produces zero further changes).
 */
function alreadyFlagged(source, targetIdx, todoText) {
  const ls = lineStartOf(source, targetIdx);
  let prevEnd = ls - 1; // the newline before this line, or -1
  while (prevEnd >= 0 && source[prevEnd] === '\n') prevEnd -= 1;
  if (prevEnd < 0) return false;
  const prevLineStart = lineStartOf(source, prevEnd + 1);
  return source.slice(prevLineStart, prevEnd + 1).trim() === todoText.trim();
}

function queueTodoAbove(edits, source, targetIdx, todoText) {
  if (alreadyFlagged(source, targetIdx, todoText)) return;
  const ls = lineStartOf(source, targetIdx);
  const indent = indentOf(source, targetIdx);
  edits.push({ start: ls, end: ls, text: indent + todoText + '\n', kind: 'todo' });
}

/**
 * All top-level (word-boundary) call-site occurrences of `name(` in `source`,
 * excluding `[skipStart, skipEnd)` (typically the binding's own import
 * statement) and excluding anything inside an already-inserted TODO comment
 * (see `computeOwnCommentRanges` -- required for idempotency).
 */
function findCallSites(source, name, skipStart, skipEnd, ownCommentRanges) {
  const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
  const hits = [];
  let m;
  while ((m = re.exec(source))) {
    if (m.index >= skipStart && m.index < skipEnd) continue;
    if (insideRanges(ownCommentRanges, m.index)) continue;
    hits.push(m.index);
  }
  return hits;
}

/** All word-boundary occurrences of `name` in `source`, same exclusions as `findCallSites`. */
function findWordOccurrences(source, name, skipStart, skipEnd, ownCommentRanges) {
  const re = new RegExp('\\b' + name + '\\b', 'g');
  const hits = [];
  let m;
  while ((m = re.exec(source))) {
    if (m.index >= skipStart && m.index < skipEnd) continue;
    if (insideRanges(ownCommentRanges, m.index)) continue;
    hits.push(m.index);
  }
  return hits;
}

function applyEdits(source, edits) {
  if (edits.length === 0) return source;
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.order - a.order);
  let out = source;
  for (const e of sorted) {
    out = out.slice(0, e.start) + (e.text || '') + out.slice(e.end);
  }
  return out;
}

// ============================================================================
// Main transform
// ============================================================================

/**
 * Transform one file's source. Returns:
 *   { output, changed, transforms: [{kind, count}], todos: [{kind, line}] }
 * `transforms` counts AUTO-FIXED edits; `todos` lists every manual-TODO
 * inserted (1-indexed line number in the ORIGINAL source, for the summary).
 */
function transformSource(source) {
  const edits = [];
  let order = 0;
  const transformCounts = new Map();
  const todoList = [];

  const bumpTransform = (kind) => transformCounts.set(kind, (transformCounts.get(kind) || 0) + 1);

  const minderImports = findMinderImports(source);
  const ownCommentRanges = computeOwnCommentRanges(source);

  const bUseStore = bindingFor(minderImports, 'useStore');
  const bUseReduxSlice = bindingFor(minderImports, 'useReduxSlice');
  const bReduxConfig = bindingFor(minderImports, 'ReduxConfig');
  const bConfigureMinder = bindingFor(minderImports, 'configureMinder');
  const bMinderConfigType = bindingFor(minderImports, 'MinderConfig');
  const bMinderDataProvider = bindingFor(minderImports, 'MinderDataProvider');
  const bUseMinderContext = bindingFor(minderImports, 'useMinderContext');
  const bUseMinder = bindingFor(minderImports, 'useMinder');
  const bDynamicLoader = bindingFor(minderImports, 'DynamicLoader');
  const bGetDynamicLoader = bindingFor(minderImports, 'getDynamicLoader');
  const bCreateDynamicLoader = bindingFor(minderImports, 'createDynamicLoader');
  const reactReduxProviderLocal = reactReduxProviderBinding(source);

  // ---- 2. useReduxSlice -> useMinder (AUTO-FIX) + review TODO -------------
  if (bUseReduxSlice) {
    const { local, entry, imp } = bUseReduxSlice;
    if (bUseMinder) {
      // useMinder already imported under some local name -- drop the
      // useReduxSlice entry entirely and rename call sites to the existing
      // local useMinder name.
      const target = bUseMinder.local;
      const entries = imp.entries;
      const idx = entries.indexOf(entry);
      const isFirst = idx === 0;
      const isLast = idx === entries.length - 1;
      let delStart = entry.start;
      let delEnd = entry.end;
      if (!isLast) {
        // consume trailing ", "
        let e = delEnd;
        while (e < imp.namesRaw.length + imp.namesStart && /[,\s]/.test(source[e])) {
          if (source[e] === ',') {
            e += 1;
            while (/\s/.test(source[e])) e += 1;
            break;
          }
          e += 1;
        }
        delEnd = e;
      } else if (!isFirst) {
        // consume preceding ", "
        let s = delStart;
        while (s > imp.namesStart && /\s/.test(source[s - 1])) s -= 1;
        if (source[s - 1] === ',') s -= 1;
        delStart = s;
      }
      edits.push({ start: delStart, end: delEnd, text: '', kind: 'redux-slice-rename', order: order++ });
      bumpTransform('useReduxSlice -> useMinder (import entry removed, useMinder already imported)');
      for (const idx2 of findCallSites(source, local, imp.start, imp.end, ownCommentRanges)) {
        edits.push({ start: idx2, end: idx2 + local.length, text: target, kind: 'redux-slice-rename', order: order++ });
        bumpTransform('useReduxSlice -> useMinder (call site renamed)');
        queueTodoAboveTracked();
        function queueTodoAboveTracked() {
          const before = edits.length;
          queueTodoAbove(edits, source, idx2, TODO.reduxSliceShape);
          if (edits.length > before) {
            edits[edits.length - 1].order = order++;
            todoList.push({ kind: 'reduxSliceShape', line: lineNumberOf(source, idx2) });
          }
        }
      }
    } else {
      // Rename the import entry in place (alias preserved if present) and
      // rename every call site from `local` to `useMinder`.
      const importedRe = new RegExp('^useReduxSlice\\b');
      const entryText = source.slice(entry.start, entry.end);
      const renamedEntryText = entryText.replace(importedRe, 'useMinder');
      edits.push({ start: entry.start, end: entry.end, text: renamedEntryText, kind: 'redux-slice-rename', order: order++ });
      bumpTransform('useReduxSlice -> useMinder (import renamed)');
      const target = local === 'useReduxSlice' ? 'useMinder' : local; // aliased imports keep their local call-site name
      if (target !== local) {
        for (const idx2 of findCallSites(source, local, imp.start, imp.end, ownCommentRanges)) {
          edits.push({ start: idx2, end: idx2 + local.length, text: target, kind: 'redux-slice-rename', order: order++ });
          bumpTransform('useReduxSlice -> useMinder (call site renamed)');
        }
      }
      for (const idx2 of findCallSites(source, local, imp.start, imp.end, ownCommentRanges)) {
        const before = edits.length;
        queueTodoAbove(edits, source, idx2, TODO.reduxSliceShape);
        if (edits.length > before) {
          edits[edits.length - 1].order = order++;
          todoList.push({ kind: 'reduxSliceShape', line: lineNumberOf(source, idx2) });
        }
      }
    }
  }

  // ---- 1. useStore (FLAG ONLY) ---------------------------------------------
  if (bUseStore) {
    const { local, imp } = bUseStore;
    const before1 = edits.length;
    queueTodoAbove(edits, source, imp.start, TODO.useStore);
    if (edits.length > before1) {
      edits[edits.length - 1].order = order++;
      todoList.push({ kind: 'useStore', line: lineNumberOf(source, imp.start) });
    }
    for (const idx2 of findCallSites(source, local, imp.start, imp.end, ownCommentRanges)) {
      const before = edits.length;
      queueTodoAbove(edits, source, idx2, TODO.useStore);
      if (edits.length > before) {
        edits[edits.length - 1].order = order++;
        todoList.push({ kind: 'useStore', line: lineNumberOf(source, idx2) });
      }
    }
  }

  // ---- 3. ReduxConfig type (FLAG ONLY) --------------------------------------
  if (bReduxConfig) {
    const { local, imp } = bReduxConfig;
    const before1 = edits.length;
    queueTodoAbove(edits, source, imp.start, TODO.reduxConfigType);
    if (edits.length > before1) {
      edits[edits.length - 1].order = order++;
      todoList.push({ kind: 'reduxConfigType', line: lineNumberOf(source, imp.start) });
    }
    for (const idx2 of findWordOccurrences(source, local, imp.start, imp.end, ownCommentRanges)) {
      const before = edits.length;
      queueTodoAbove(edits, source, idx2, TODO.reduxConfigType);
      if (edits.length > before) {
        edits[edits.length - 1].order = order++;
        todoList.push({ kind: 'reduxConfigType', line: lineNumberOf(source, idx2) });
      }
    }
  }

  // ---- 4. redux field removal from config object literals (AUTO-FIX) -----
  const objectTriggers = [];
  if (bConfigureMinder) {
    for (const callIdx of findCallSites(source, bConfigureMinder.local, bConfigureMinder.imp.start, bConfigureMinder.imp.end, ownCommentRanges)) {
      const parenIdx = source.indexOf('(', callIdx);
      let i = parenIdx + 1;
      while (i < source.length && /\s/.test(source[i])) i += 1;
      if (source[i] === '{') objectTriggers.push(i);
    }
  }
  if (bMinderConfigType) {
    const re = new RegExp(':\\s*' + bMinderConfigType.local + '\\s*=\\s*\\{', 'g');
    let m;
    while ((m = re.exec(source))) {
      objectTriggers.push(m.index + m[0].length - 1);
    }
  }
  if (bMinderDataProvider && new RegExp('<\\s*' + bMinderDataProvider.local + '\\b').test(source)) {
    const re = /config=\{\{/g;
    let m;
    while ((m = re.exec(source))) {
      objectTriggers.push(m.index + m[0].length - 1);
    }
  }
  for (const openIdx of objectTriggers) {
    const closeIdx = findMatchingClose(source, openIdx);
    if (closeIdx === -1) continue;
    const plan = planObjectKeyRemoval(source, openIdx + 1, closeIdx, 'redux');
    if (!plan) continue;
    edits.push({ start: plan.start, end: plan.end, text: '', kind: 'redux-field-removed', order: order++ });
    bumpTransform('redux field removed from config object');
  }

  // ---- 5. Provider wrapper / useMinderContext().store (FLAG ONLY) ---------
  if (bUseMinderContext) {
    const local = bUseMinderContext.local;
    const destructureRe = new RegExp('\\{[^}]*\\bstore\\b[^}]*\\}\\s*=\\s*' + local + '\\s*\\(', 'g');
    const chainRe = new RegExp(local + '\\s*\\(\\s*\\)\\s*\\.\\s*store\\b', 'g');
    for (const re of [destructureRe, chainRe]) {
      let m;
      while ((m = re.exec(source))) {
        if (insideRanges(ownCommentRanges, m.index)) continue;
        const before = edits.length;
        queueTodoAbove(edits, source, m.index, TODO.providerStore);
        if (edits.length > before) {
          edits[edits.length - 1].order = order++;
          todoList.push({ kind: 'providerStore', line: lineNumberOf(source, m.index) });
        }
      }
    }
  }
  if (reactReduxProviderLocal && bMinderDataProvider) {
    const re = new RegExp('<\\s*' + reactReduxProviderLocal + '\\b', 'g');
    let m;
    while ((m = re.exec(source))) {
      if (insideRanges(ownCommentRanges, m.index)) continue;
      const before = edits.length;
      queueTodoAbove(edits, source, m.index, TODO.providerStore);
      if (edits.length > before) {
        edits[edits.length - 1].order = order++;
        todoList.push({ kind: 'providerStore', line: lineNumberOf(source, m.index) });
      }
    }
  }

  // ---- 6. DynamicLoader redux members (FLAG ONLY) --------------------------
  if (bDynamicLoader || bGetDynamicLoader || bCreateDynamicLoader) {
    const patterns = [
      /\.loadRedux\s*\(/g,
      /\.getStore\s*\(/g,
      /\.isReduxLoaded\s*\(/g,
      /\.addReducer\s*\(/g,
      /preload\s*:\s*\[[^\]]*['"]redux['"][^\]]*\]/g,
      /(getLoadingStatus|getBundleSavings)\(\)[^;\n]*?\.redux\b/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(source))) {
        if (insideRanges(ownCommentRanges, m.index)) continue;
        const before = edits.length;
        queueTodoAbove(edits, source, m.index, TODO.dynamicLoader);
        if (edits.length > before) {
          edits[edits.length - 1].order = order++;
          todoList.push({ kind: 'dynamicLoader', line: lineNumberOf(source, m.index) });
        }
      }
    }
  }

  const output = applyEdits(source, edits);
  const transforms = [...transformCounts.entries()].map(([kind, count]) => ({ kind, count }));
  return { output, changed: output !== source, transforms, todos: todoList };
}

function lineNumberOf(source, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

module.exports = {
  transformSource,
  MINDER_SPECIFIER_RE,
  TODO,
  // exported for direct unit testing of the primitives:
  findMatchingClose,
  findObjectKey,
  planObjectKeyRemoval,
  findMinderImports,
  reactReduxProviderBinding,
};
