export function useAdminToast() {
  const toast = useToast()

  function success(title: string, description?: string) {
    toast.add({
      title,
      description,
      icon: 'i-lucide-check',
      color: 'success'
    })
  }

  function info(title: string, description?: string) {
    toast.add({
      title,
      description,
      icon: 'i-lucide-info',
      color: 'info'
    })
  }

  function error(err: unknown, fallback: string) {
    toast.add({
      title: errorMessage(err, fallback),
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  }

  return { success, info, error }
}

function errorMessage(err: unknown, fallback: string) {
  const source = typeof err === 'object' && err !== null
    ? err as {
        data?: { message?: unknown, statusMessage?: unknown }
        statusMessage?: unknown
        message?: unknown
      }
    : null
  const message = source?.data?.message ?? source?.data?.statusMessage ?? source?.statusMessage ?? source?.message

  return typeof message === 'string' && message.trim() ? message : fallback
}