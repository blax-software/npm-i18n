# AGENTS.md — @blax-software/i18n

> Audience: AI coding agents and human contributors. Source-verified reference for using
> this package; the README is the overview. When they disagree, this file wins.

## What it is

Two halves:

| Import | Runs where | Exports |
| --- | --- | --- |
| `@blax-software/i18n` | browser + node, zero deps | `TranslationMissing`, `TranslationFile`, `mergeMessages`, `fallbackChain`, `createLazyLoaders`, `checkTranslations`, `formatReport`, `walkKeys`, `deepMerge` |
| `@blax-software/i18n/node` | node only (esbuild) | `readSourceTree`, `buildMessages`, `writeMessages`, `checkSourceTree`, `loadModule` |
| bin `blax-i18n` | node | `build`, `check` (thin wrapper over `/node`) |

Source: `src/types.ts` (constants/types), `src/merge.ts`, `src/fallback.ts`, `src/lazy.ts`,
`src/check.ts` (pure check), `src/node.ts` (disk + esbuild), `src/cli-run.ts` (`runCli(argv, io)`),
`src/cli.ts` (bin entry, calls `runCli`).

## Source layout the package expects

```
<src>/locales/<locale>.ts   one locale per file: export default { ...messages }
<src>/pages/**/*.ts         all locales per file: export default { en: {...}, de: {...} } satisfies TranslationFile
```

Merge order (`mergeMessages`, `src/merge.ts`): seed each locale from `locales`, then deep-merge each
page's `[locale]` slice in the order given; nested objects merge, arrays/strings overwrite; last wins.
The CLI sorts files by path. Locales come from `Object.keys(locales)` — a locale that only exists in
a page is dropped. Inputs are cloned, never mutated.

## Rules for translation files

- Pure data. `loadModule` (`src/node.ts`) transpiles with esbuild and evaluates with a stub `require`:
  `@blax-software/i18n` → `{ TranslationMissing }`, relative paths → loaded the same way, anything else → `{}`.
  Importing app code (`~/`, `@/`, npm packages) silently yields `{}` — don't.
- Mark untranslated values with `TranslationMissing` (`'[missing]'`), never `''` or copied English.
  `check` flags any string (or array element) containing the marker.
- Every locale in `--locales` must have every key. A locale block missing from a page counts as every
  key of that page missing for that locale.

## CLI contract (`src/cli-run.ts`)

```
blax-i18n build --src i18n --out i18n/.messages --locales en,de,pl [--default en] [--json]
blax-i18n check --src i18n --locales en,de,pl [--default en] [--json]
```

- `build`: writes `<out>/<locale>.js` as `export default <JSON>\n`; `--default` is added to the
  emitted set. Exit 0.
- `check`: exit 1 when any locale has a missing key or marker, else 0. Unknown flags/commands exit 1.
  Reference key set = union of locales, or `--default`'s keys (then surplus keys are `extra`, not
  failing). `--json` prints `CheckReport`:
  `{ ok, problems, locales: { [locale]: { locale, missing: [{file,key}], markers: [...], extra: [...], keys } } }`.
  `file` is `locales/*` for base files, `pages/<relative path>` for pages.
- Omitting `--locales` uses every base file found under `<src>/locales/`.

## Wiring into a Nuxt app

- `i18n/messageloader.ts`: `import.meta.glob` both dirs (eager, `import: 'default'`), sort by path,
  `mergeMessages(locales, pages)`.
- `i18n.config.ts`: `fallbackLocale: fallbackChain(['en','de','pl'])`.
- `package.json`: `"i18n:check": "blax-i18n check --src i18n --locales en,de,pl"` in CI;
  `"i18n:build"` only if you lazy-load via `createLazyLoaders` (`.messages/` gitignored).
- `createLazyLoaders`: keep `import()` specifiers static (one chunk per locale), leave the default
  locale out and import it eagerly.

## Footguns

- `loadLocaleMessages` returns `null` (not `{}`) for unknown locales — seed the default eagerly.
- `mergeMessages` replaces arrays wholesale; a page cannot append to a base-file array.
- `check` compares leaf paths: `a: 'x'` in one locale vs `a: { b: 'y' }` in another reports `a` and
  `a.b` as missing on the respective sides.
- The CLI is ESM (`dist/cli.js`, shebang) and needs node ≥ 18.17.

## Development

`npm run build` (tsup, two configs: library ESM+CJS+d.ts, CLI ESM with shebang), `npm run typecheck`,
`npm test` (vitest; fixtures under `test/fixtures/i18n`). Add a test for every behaviour change;
keep the package additive — never change what an existing export returns.
