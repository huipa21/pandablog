import type { AccessHourlyBucket } from '~/types/logging'

/** Scale the server's complete series, without re-bucketing by the client clock. */
export function accessHourlyChartPoints(buckets: readonly AccessHourlyBucket[]) {
  const max = Math.max(1, ...buckets.map(bucket => bucket.count))
  return buckets.map(bucket => ({
    ...bucket,
    label: `${bucket.hour.slice(0, 10)} ${bucket.hour.slice(11, 13)}:00`,
    // Empty buckets must not look like traffic; keep nonzero bars visible.
    height: bucket.count === 0 ? 0 : Math.max(6, (bucket.count / max) * 100)
  }))
}
