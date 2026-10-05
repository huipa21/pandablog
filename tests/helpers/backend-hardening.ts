export function manualClock(initial = 0) {
  if (!Number.isFinite(initial)) throw new Error('Invalid initial clock')
  let value = initial
  return {
    now: () => value,
    advance(ms: number) {
      if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(value + ms)) throw new Error('Invalid clock advancement')
      value += ms
    }
  }
}

/** One-shot rendezvous: all readers take a snapshot before any writer proceeds. */
export function barrier(parties: number) {
  if (!Number.isSafeInteger(parties) || parties < 1) throw new Error('Invalid barrier size')
  let count = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  return {
    wait() {
      count++
      if (count > parties) throw new Error('Barrier already full')
      if (count === parties) release()
      return gate
    }
  }
}
