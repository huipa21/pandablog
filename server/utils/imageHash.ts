/**
 * Perceptual image hashing for detecting resized/recompressed images
 */

import phash from 'sharp-phash'
import distance from 'sharp-phash/distance.js'

/**
 * Compute perceptual hash for an image buffer
 */
export async function computePHash(buffer: Buffer): Promise<string> {
  try {
    const hash = await phash(buffer)
    return hash
  } catch {
    // If perceptual hashing fails (e.g., unsupported format), return empty string
    return ''
  }
}

/**
 * Calculate Hamming distance between two hashes
 */
function getHammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return Infinity
  }
  return distance(hash1, hash2)
}

/**
 * Check if two images are perceptually similar
 */
export function isSimilar(hash1: string, hash2: string, threshold: number): boolean {
  const dist = getHammingDistance(hash1, hash2)
  return dist <= threshold
}
