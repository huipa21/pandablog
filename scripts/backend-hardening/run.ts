import { spawn } from 'node:child_process'
import { dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertOptIn, assertRuntime, fixtureEnvironment } from './fixture'

// No endpoint, credential, namespace, storage or dotenv arguments exist.
// The runner gives the isolated tests only the explicit binary and opt-in.
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--fixture' || !args[1]?.startsWith('--surreal-bin=')) {
  throw new Error('Usage: npm run test:backend:integration -- --fixture --surreal-bin=/absolute/path/to/surreal')
}
assertOptIn('1')
assertRuntime()
const binary = args[1].slice('--surreal-bin='.length)
if (!isAbsolute(binary)) throw new Error('SurrealDB binary path must be absolute')
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.backend.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...fixtureEnvironment(), PB_BACKEND_FIXTURE: '1', PB_BACKEND_SURREAL_BIN: binary }
})
child.on('error', () => { process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
// The test owns cleanup in finally. Keep the parent alive to allow Vitest's
// graceful shutdown; hard-kill/crash recovery is a separate later fault gate.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => child.kill(signal))
