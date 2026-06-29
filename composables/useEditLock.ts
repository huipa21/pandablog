interface EditLockResponse {
  can_edit: boolean
  locked: boolean
  holder_username?: string
  holder_display?: string
}

export function useEditLock(postId: MaybeRefOrGetter<string>, fetcher: typeof $fetch = $fetch) {
  const canEdit = ref(false)
  const locked = ref(false)
  const holderName = ref('')
  const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)

  const endpoint = computed(() => `/api/admin/posts/${encodeURIComponent(toValue(postId))}/lock`)

  async function acquire() {
    const response = await fetcher<EditLockResponse>(endpoint.value, { method: 'POST' })
    canEdit.value = response.can_edit
    locked.value = response.locked
    holderName.value = response.holder_display || response.holder_username || ''
    if (response.can_edit) {
      startHeartbeat()
    } else {
      stopHeartbeat()
    }
    return response
  }

  async function release(options: { force?: boolean } = {}) {
    stopHeartbeat()
    if (!toValue(postId)) return
    await fetcher(endpoint.value, { method: 'DELETE', body: options })
    canEdit.value = false
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer.value = setInterval(() => {
      void acquire().catch(() => {
        canEdit.value = false
        locked.value = true
        stopHeartbeat()
      })
    }, 30_000)
  }

  function stopHeartbeat() {
    if (heartbeatTimer.value) {
      clearInterval(heartbeatTimer.value)
      heartbeatTimer.value = null
    }
  }

  function releaseWithBeacon() {
    stopHeartbeat()
    if (!canEdit.value || typeof fetch === 'undefined') return
    void fetch(endpoint.value, {
      method: 'DELETE',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
      keepalive: true
    }).catch(() => undefined)
  }

  onBeforeUnmount(() => {
    void release().catch(() => undefined)
  })

  if (import.meta.client) {
    window.addEventListener('beforeunload', releaseWithBeacon)
    onBeforeUnmount(() => window.removeEventListener('beforeunload', releaseWithBeacon))
  }

  return {
    canEdit,
    locked,
    holderName,
    acquire,
    release
  }
}
