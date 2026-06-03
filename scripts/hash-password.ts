/**
 * Hash a password with argon2id for emergency admin password recovery.
 *
 * Usage:
 *   npx tsx scripts/hash-password.ts "your-plaintext-password"
 *
 * Normal setup and password rotation happen in the admin UI.
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

  console.log('\nEmergency password hash:\n')
  console.log(hash)
  console.log('\nStore this in app_settings:admin_password_hash only if you cannot use the admin UI.\n')
}

main().catch((err) => {
  console.error('Failed to hash password:', err)
  process.exit(1)
})
