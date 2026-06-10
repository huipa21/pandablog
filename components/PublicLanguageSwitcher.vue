<template>
  <div ref="switcherRef" class="relative" @click.stop @keydown.escape="menuOpen = false">
    <button
      ref="triggerRef"
      type="button"
      data-public-language-switcher
      :data-ready="hydrated ? 'true' : 'false'"
      class="inline-flex h-9 items-center gap-2 rounded-[var(--pb-radius-md)] px-3 text-sm font-medium text-[var(--pb-text-muted)] transition hover:bg-[var(--pb-surface-subtle)] hover:text-[var(--pb-text)]"
      :aria-label="t('public.languageSwitcher.title')"
      aria-haspopup="menu"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      :title="t('public.languageSwitcher.title')"
      @click="toggleMenu"
    >
      <UIcon name="i-lucide-languages" class="size-4 shrink-0" />
      <span class="hidden sm:inline">{{ currentLabel }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="menuOpen"
        ref="menuRef"
        role="menu"
        class="fixed z-[1000] min-w-44 overflow-hidden rounded-[var(--pb-radius-md)] border border-[var(--pb-border)] bg-[var(--pb-card-bg)] p-1 text-sm shadow-[var(--pb-shadow-md)]"
        :style="menuStyle"
        @click.stop
      >
        <button
          v-for="option in languageOptions"
          :key="option.value"
          type="button"
          role="menuitemradio"
          :aria-checked="option.value === locale"
          class="flex w-full items-center gap-2 rounded-[var(--pb-radius-sm)] px-3 py-2 text-left text-[var(--pb-text)] transition hover:bg-[var(--pb-surface-subtle)]"
          :class="option.value === locale ? 'bg-[var(--pb-selected-bg)] text-[var(--pb-primary)]' : ''"
          @click.stop="selectLocale(option.value)"
        >
          <UIcon :name="option.value === locale ? 'i-lucide-check' : 'i-lucide-languages'" class="size-4 shrink-0" />
          <span>{{ option.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { SupportedLocale } from '~/utils/adminLocale'

const { t, setLocale } = useI18n()
const { locale, setPublicLocale } = usePublicLocale()
const menuOpen = ref(false)
const hydrated = ref(false)
const switcherRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

const languageOptions = computed<Array<{ label: string, value: SupportedLocale }>>(() => [
  { label: t('common.english'), value: 'en' },
  { label: t('common.simplifiedChinese'), value: 'zh-CN' }
])
const currentLabel = computed(() => languageOptions.value.find((option) => option.value === locale.value)?.label ?? t('common.language'))

function positionMenu() {
  const trigger = triggerRef.value
  if (!trigger || import.meta.server) {
    return
  }

  const rect = trigger.getBoundingClientRect()
  const menuWidth = 176
  const menuHeight = 96
  const viewportPadding = 8
  const left = Math.min(
    Math.max(viewportPadding, rect.right - menuWidth),
    Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
  )
  const below = rect.bottom + viewportPadding
  const top = below + menuHeight > window.innerHeight - viewportPadding
    ? Math.max(viewportPadding, rect.top - menuHeight - viewportPadding)
    : below

  menuStyle.value = {
    left: `${left}px`,
    top: `${top}px`
  }
}

function toggleMenu() {
  if (menuOpen.value) {
    menuOpen.value = false
    return
  }

  positionMenu()
  menuOpen.value = true
}

async function selectLocale(value: SupportedLocale) {
  const nextLocale = setPublicLocale(value)
  await setLocale(nextLocale)
  menuOpen.value = false
}

function closeOnOutsideClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (target && !switcherRef.value?.contains(target) && !menuRef.value?.contains(target)) {
    menuOpen.value = false
  }
}

function repositionOpenMenu() {
  if (menuOpen.value) {
    positionMenu()
  }
}

onMounted(() => {
  hydrated.value = true
  document.addEventListener('click', closeOnOutsideClick)
  window.addEventListener('resize', repositionOpenMenu)
  window.addEventListener('scroll', repositionOpenMenu, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick)
  window.removeEventListener('resize', repositionOpenMenu)
  window.removeEventListener('scroll', repositionOpenMenu, true)
})
</script>