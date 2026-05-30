interface PublicAuthSession {
  loggedIn: boolean
  user: unknown | null
}

export function usePublicAuthSession() {
  const fetchWithSession = import.meta.server ? useRequestFetch() : $fetch

  return useAsyncData<PublicAuthSession>(
    'public-auth-session',
    () => fetchWithSession<PublicAuthSession>('/api/auth/session').catch(() => ({ loggedIn: false, user: null })),
    { default: () => ({ loggedIn: false, user: null }) }
  )
}