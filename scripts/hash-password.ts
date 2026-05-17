/**
 * Hash a password with argon2id for use in .env (APP_LOGIN_PASSWORD_HASH).
 *
 * Usage:
 *   npx tsx scripts/hash-password.ts "your-plaintext-password"
 *
 * Copy the output (the entire $argon2id$... string) into .env:
 *   APP_LOGIN_PASSWORD_HASH="$argon2id$v=19$m=65536,t=3,p=4$..."
 */

import argon2 from 'argon2'

async function main() {
  const password = process.argv[2]

  if (!password) {
    console.error('Usage: npx tsx scripts/hash-password.ts "<password>"')
    process.exit(1)
  }

  if (password.length < 8) {
    console.warn('⚠️  Warning: password is shorter than 8 characters')
  }

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 4
  })

  console.log('\nCopy this into .env as APP_LOGIN_PASSWORD_HASH:\n')
  console.log(hash)
  console.log('')
}

main().catch((err) => {
  console.error('Failed to hash password:', err)
  process.exit(1)
})
