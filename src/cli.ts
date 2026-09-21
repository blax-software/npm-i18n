import { runCli } from './cli-run'

let code: number
try {
  code = runCli(process.argv.slice(2))
} catch (e: any) {
  console.error(e?.stack ?? String(e))
  code = 1
}
process.exitCode = code
