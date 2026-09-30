import { parseArgs } from 'node:util'
import { formatReport } from './check'
import { checkSourceTree, writeMessages } from './node'

const USAGE = `blax-i18n — build and check per-page translation sources

Usage:
  blax-i18n build [--src i18n] [--out <src>/.messages] [--locales en,de,pl] [--default en] [--packages auto|a,b]
  blax-i18n check [--src i18n] [--locales en,de,pl] [--default en] [--packages auto|a,b] [--json]

build   Merge <src>/locales/*.ts + <src>/pages/**/*.ts into one ESM module per
        locale at <out>/<locale>.js. --default is always emitted.
check   Report keys missing in any locale and values still marked '[missing]'.
        Exit code 1 when anything is missing. With --default the reference key
        set is that locale's (extra keys elsewhere are listed, not counted);
        without it, the union of all locales' keys.

--packages  Merge translations npm packages register through the "blax-i18n"
            field of their package.json, under the app's own. "auto" takes
            every dependency that declares it; otherwise a comma list of names.
            check then also verifies each package key in every locale.
--root      Directory of the app's package.json (default: nearest above --src).
`

export interface CliIo {
  log(line: string): void
  error(line: string): void
}

const splitList = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)

/** Run the CLI on `argv` (without node/script). Returns the exit code. */
export function runCli(argv: string[], io: CliIo = { log: console.log, error: console.error }): number {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    io.log(USAGE)
    return command ? 0 : 1
  }

  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        src: { type: 'string' },
        out: { type: 'string' },
        locales: { type: 'string' },
        default: { type: 'string' },
        packages: { type: 'string' },
        root: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      strict: true,
    })
  } catch (e: any) {
    io.error(e?.message ?? String(e))
    io.error(USAGE)
    return 1
  }
  const v = parsed.values as {
    src?: string; out?: string; locales?: string; default?: string; packages?: string; root?: string; json?: boolean
  }
  const packages = v.packages === 'auto' ? 'auto' : splitList(v.packages)

  if (command === 'build') {
    const t0 = Date.now()
    const written = writeMessages({ src: v.src, out: v.out, locales: splitList(v.locales), defaultLocale: v.default, packages, root: v.root })
    if (v.json) {
      io.log(JSON.stringify(written))
    } else {
      for (const w of written) io.log(`${w.locale}: ${Math.round(w.bytes / 1024)}KB -> ${w.file}`)
      io.log(`generated ${written.length} locale${written.length === 1 ? '' : 's'} in ${Date.now() - t0}ms`)
    }
    return 0
  }

  if (command === 'check') {
    const report = checkSourceTree({ src: v.src, locales: splitList(v.locales), reference: v.default, packages, root: v.root })
    io.log(v.json ? JSON.stringify(report) : formatReport(report))
    return report.ok ? 0 : 1
  }

  io.error(`unknown command: ${command}`)
  io.error(USAGE)
  return 1
}

