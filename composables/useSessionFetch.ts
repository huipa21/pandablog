type SessionFetchOptions = Record<string, unknown>

type SessionFetch = <T>(url: string, options?: SessionFetchOptions) => Promise<T>

export function useSessionFetch(): SessionFetch {
  if (import.meta.server) {
    return useRequestFetch() as unknown as SessionFetch
  }

  return $fetch as unknown as SessionFetch
}