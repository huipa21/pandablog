<template>
  <form
    ref="formRef"
    class="flex items-center gap-2"
    :class="formClass"
    role="search"
    @submit.prevent="submit"
  >
    <div v-if="variant === 'hero'" class="blog-search-hero-control">
      <UIcon name="i-lucide-search" class="size-5 shrink-0 text-[var(--pb-text-subtle)]" />
      <input
        :key="`hero-input-${renderedPlaceholder}`"
        v-model="query"
        class="blog-search-hero-input"
        :placeholder="renderedPlaceholder"
        type="search"
        autocomplete="off"
      >
      <button :key="`hero-submit-${renderedPlaceholder}`" type="submit" class="blog-search-hero-submit" :aria-label="renderedPlaceholder">
        <UIcon name="i-lucide-arrow-right" class="size-5" />
      </button>
    </div>

    <div v-else-if="variant === 'compact'" class="blog-search-compact-control">
      <UIcon name="i-lucide-search" class="size-4 shrink-0 text-[var(--pb-text-subtle)]" />
      <input
        :key="`compact-input-${renderedPlaceholder}`"
        v-model="query"
        class="blog-search-compact-input"
        :placeholder="renderedPlaceholder"
        type="search"
        autocomplete="off"
      >
    </div>

    <template v-else>
      <UInput
        :key="`search-input-${renderedPlaceholder}`"
        v-model="query"
        :placeholder="renderedPlaceholder"
        icon="i-lucide-search"
        :ui="{ root: 'w-full' }"
        type="search"
        autocomplete="off"
      />
      <UButton
        v-if="variant === 'sidebar'"
        :key="`search-submit-${renderedPlaceholder}`"
        type="submit"
        color="primary"
        icon="i-lucide-arrow-right"
        :aria-label="renderedPlaceholder"
      />
    </template>
  </form>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'sidebar' | 'header' | 'hero' | 'compact'
  placeholder?: string
}>(), {
  variant: 'sidebar',
  placeholder: ''
})

const { t } = useI18n()
const nuxtApp = useNuxtApp()
const { locale: publicLocale } = usePublicLocale()
const route = useRoute()
const formRef = ref<HTMLFormElement | null>(null)
const query = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')

watch(() => route.query.q, (q) => {
  if (typeof q === 'string') query.value = q
})

const formClass = computed(() => {
  if (props.variant === 'sidebar') return 'w-full'
  if (props.variant === 'hero') return 'w-full max-w-[min(36rem,100%)]'
  if (props.variant === 'compact') return 'w-56 lg:w-64'
  return 'w-72'
})
const resolvedPlaceholder = computed(() => {
  if (props.placeholder) {
    return props.placeholder
  }

  if (!route.path.startsWith('/admin')) {
    const i18n = nuxtApp.$i18n as { getLocaleMessage?: (locale: string) => any }
    const message = i18n.getLocaleMessage?.(publicLocale.value)?.public?.search?.placeholder
    if (typeof message === 'string') {
      return message
    }
  }

  return t('public.search.placeholder')
})
const hydratedPlaceholder = ref('')
const renderedPlaceholder = computed(() => hydratedPlaceholder.value || props.placeholder || t('public.search.placeholder'))

onMounted(() => {
  hydratedPlaceholder.value = resolvedPlaceholder.value
  syncSearchAttributes(resolvedPlaceholder.value)
})

watch(resolvedPlaceholder, (value) => {
  if (hydratedPlaceholder.value) {
    hydratedPlaceholder.value = value
  }
  syncSearchAttributes(value)
})

function syncSearchAttributes(value: string) {
  nextTick(() => {
    const form = formRef.value
    if (!form) return

    for (const input of form.querySelectorAll('input[type="search"]')) {
      input.setAttribute('placeholder', value)
    }

    for (const button of form.querySelectorAll('button[type="submit"]')) {
      button.setAttribute('aria-label', value)
    }
  })
}

function submit() {
  const q = query.value.trim()
  if (!q) return
  navigateTo({ path: '/search', query: { q } })
}
</script>

<style scoped>
.blog-search-hero-control {
  display: flex;
  min-height: 3.5rem;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--pb-surface) 72%, transparent);
  border-radius: calc(var(--pb-radius-card-outer) + 0.5rem);
  background: color-mix(in srgb, var(--pb-surface) 84%, transparent);
  padding: 0.375rem 0.375rem 0.375rem 1rem;
  box-shadow: var(--pb-shadow-md);
  backdrop-filter: blur(18px);
}

.blog-search-hero-input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--pb-text);
  font: inherit;
  outline: 0;
}

.blog-search-hero-input::placeholder {
  color: var(--pb-text-placeholder);
}

.blog-search-hero-submit {
  display: grid;
  height: 2.75rem;
  width: 2.75rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--pb-radius-card-inner);
  background: transparent;
  color: var(--pb-text-subtle);
  transition: background var(--pb-transition-default), color var(--pb-transition-default), transform var(--pb-transition-default);
}

.blog-search-hero-submit:hover {
  background: color-mix(in srgb, var(--pb-surface) 50%, transparent);
  color: var(--pb-link);
  transform: translateY(-1px);
}

.blog-search-compact-control {
  display: flex;
  width: 100%;
  min-height: 2rem;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--pb-surface) 70%, transparent);
  border-radius: var(--pb-radius-card-inner, 0.5rem);
  background: color-mix(in srgb, var(--pb-surface) 88%, transparent);
  padding: 0.25rem 0.625rem;
  color: var(--pb-text);
  transition: border-color var(--pb-transition-default), background var(--pb-transition-default), box-shadow var(--pb-transition-default);
  backdrop-filter: blur(8px);
}

.blog-search-compact-control:focus-within {
  border-color: color-mix(in srgb, var(--pb-primary) 60%, transparent);
  background: var(--pb-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pb-primary) 18%, transparent);
}

.blog-search-compact-input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--pb-text);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.25rem;
  outline: 0;
}

.blog-search-compact-input::placeholder {
  color: var(--pb-text-placeholder);
}
</style>
