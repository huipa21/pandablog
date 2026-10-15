<template>
  <Teleport to="body">
    <Transition name="resume-prompt">
      <div
        v-if="visible"
        class="resume-prompt"
        role="dialog"
        aria-live="polite"
        :aria-label="t('public.post.resume.title')"
        data-resume-prompt
        data-testid="resume-prompt"
      >
        <UIcon name="i-lucide-bookmark" class="size-4 shrink-0 text-[var(--pb-icon-muted)]" />
        <span class="min-w-0 text-sm text-[var(--pb-text)]">{{ t('public.post.resume.title') }}</span>
        <UButton size="xs" data-testid="resume-prompt-accept" @click="emit('resume')">
          {{ t('public.post.resume.resume') }}
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          :aria-label="t('public.post.resume.dismiss')"
          data-testid="resume-prompt-close"
          @click="emit('close')"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  resume: []
  close: []
}>()

const { t } = useI18n()
</script>

<style scoped>
.resume-prompt {
  position: fixed;
  left: 50%;
  bottom: 1.25rem;
  z-index: 50;
  display: flex;
  max-width: calc(100vw - 2rem);
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem 0.5rem 0.875rem;
  border: 1px solid var(--pb-card-border);
  border-radius: var(--pb-radius-card-outer);
  background: var(--pb-card-bg);
  box-shadow: var(--pb-shadow-sm);
  transform: translateX(-50%);
}

.resume-prompt-enter-active,
.resume-prompt-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.resume-prompt-enter-from,
.resume-prompt-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .resume-prompt-enter-active,
  .resume-prompt-leave-active {
    transition: none;
  }
}
</style>
