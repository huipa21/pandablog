import { emitKeypressEvents } from 'node:readline'

export class PasswordResetError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message) }
}

/** Read from a real terminal in raw mode so neither passwords nor masks echo. */
export function readHiddenPassword(
  label: string,
  input = process.stdin,
  output = process.stdout
): Promise<string> {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new PasswordResetError('Password reset requires an interactive terminal (use docker exec -it).'))
  }

  return new Promise((resolve, reject) => {
    let password = ''
    const wasRaw = input.isRaw
    const wasPaused = input.isPaused()
    const cleanup = () => {
      input.removeListener('keypress', onKey)
      input.removeListener('end', cancel)
      input.removeListener('error', cancel)
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
      input.setRawMode(wasRaw)
      if (wasPaused) input.pause()
      output.write('\n')
    }
    const cancel = () => {
      cleanup()
      password = ''
      reject(new PasswordResetError('Password reset cancelled.'))
    }
    const onKey = (text: string | undefined, key: { name?: string, ctrl?: boolean, meta?: boolean }) => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) return cancel()
      if (key.name === 'return' || key.name === 'enter') {
        cleanup()
        resolve(password)
        password = ''
      } else if (key.name === 'backspace') {
        password = Array.from(password).slice(0, -1).join('')
      } else if (key.ctrl && key.name === 'u') {
        password = ''
      } else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) {
        password += text
        if (password.length > 200) {
          cleanup()
          password = ''
          reject(new PasswordResetError('Password is too long (maximum 200 characters).'))
        }
      }
    }

    emitKeypressEvents(input)
    input.setRawMode(true)
    input.on('keypress', onKey)
    input.once('end', cancel)
    input.once('error', cancel)
    process.once('SIGINT', cancel)
    process.once('SIGTERM', cancel)
    output.write(label)
    input.resume()
  })
}
