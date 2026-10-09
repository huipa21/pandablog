import { afterEach } from 'vitest'

/** Isolate process-local realm state between unit/fixture cases. Production
 * has no reset/bypass API. A simulated new process inside one test must also
 * explicitly clear this slot before resetting/importing its runtime modules. */
afterEach(() => {Reflect.deleteProperty(globalThis, Symbol.for('pandablog.maintenance.barrier'))})
