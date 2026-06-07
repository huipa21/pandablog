type PublicUserRole = 'superadmin' | 'admin' | 'author' | 'viewer'

interface PublicSessionUser {
  id: string
  username: string
  role: PublicUserRole
  display_name?: string | null
}

interface PublicAuthSession {
  loggedIn: boolean
  user: PublicSessionUser | null
}

type PublicFetch = <T>(url: string) => Promise<T>

export function usePublicAuthSession() {
  return useAsyncData<PublicAuthSession>(
    'public-auth-session',
    () => fetchWithSession<PublicAuthSession>('/api/auth/session').catch(() => ({ loggedIn: false, user: null })),
    { default: () => ({ loggedIn: false, user: null }) }
  )
}

function fetchWithSession<T>(url: string): Promise<T> {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch<T>(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch<T>(url)
}