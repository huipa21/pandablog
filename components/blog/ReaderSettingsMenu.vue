<template>
  <UPopover :content="{ side: 'bottom', align: 'end', sideOffset: 8, collisionPadding: 12 }" :ui="{ content: 'bg-transparent p-0 shadow-none ring-0' }">
    <span class="reader-settings-trigger">
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-lucide-type"
        size="xs"
        data-testid="reader-settings-toggle"
        :aria-label="t('public.post.reader.toggle')"
        :title="t('public.post.reader.toggle')"
      />
      <span v-if="isCustomized" class="reader-settings-dot" aria-hidden="true" />
    </span>

    <template #content>
      <div class="reader-settings-panel grid gap-4" data-testid="reader-settings-panel">
        <div class="flex items-center justify-between gap-2">
          <span class="reader-settings-title">{{ t('public.post.reader.title') }}</span>
          <UButton
            v-if="isCustomized"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-rotate-ccw"
            data-testid="reader-settings-reset"
            @click="reset"
          >
            {{ t('public.post.reader.reset') }}
          </UButton>
        </div>

        <section class="grid gap-1.5">
          <span class="reader-settings-label">{{ t('public.post.reader.fontSize') }}</span>
          <div class="reader-settings-segment" role="radiogroup" :aria-label="t('public.post.reader.fontSize')">
            <button
              v-for="size in fontSizes"
              :key="size"
              type="button"
              role="radio"
              :aria-checked="prefs.fontSize === size"
              :class="{ 'is-active': prefs.fontSize === size }"
              data-testid="reader-settings-font-size"
              :data-value="size"
              @click="setFontSize(size)"
            >
              <span class="reader-font-size-sample" :style="{ fontSize: fontSizeSample[size] }">{{ t('public.post.reader.fontSizeSample') }}</span>
            </button>
          </div>
        </section>

        <section class="grid gap-1.5">
          <span class="reader-settings-label">{{ t('public.post.reader.fontFamily') }}</span>
          <div class="reader-settings-segment" role="radiogroup" :aria-label="t('public.post.reader.fontFamily')">
            <button
              v-for="family in fontFamilies"
              :key="family"
              type="button"
              role="radio"
              :aria-checked="prefs.fontFamily === family"
              :class="{ 'is-active': prefs.fontFamily === family }"
              :style="{ fontFamily: family === 'serif' ? 'var(--pb-reader-serif-stack)' : 'var(--pb-font-text)' }"
              data-testid="reader-settings-font-family"
              :data-value="family"
              @click="setFontFamily(family)"
            >
              {{ t(`public.post.reader.fontFamilyOptions.${family}`) }}
            </button>
          </div>
        </section>

        <section class="grid gap-1.5">
          <span class="reader-settings-label">{{ t('public.post.reader.appearance') }}</span>
          <div class="reader-settings-segment reader-settings-swatches" role="radiogroup" :aria-label="t('public.post.reader.appearance')">
            <button
              v-for="option in appearances"
              :key="option"
              type="button"
              role="radio"
              :aria-checked="prefs.appearance === option"
              :class="['reader-appearance-swatch', `reader-appearance-${option}`, { 'is-active': prefs.appearance === option }]"
              :title="t(`public.post.reader.appearanceOptions.${option}`)"
              data-testid="reader-settings-appearance"
              :data-value="option"
              @click="setAppearance(option)"
            >
              <span class="sr-only">{{ t(`public.post.reader.appearanceOptions.${option}`) }}</span>
            </button>
          </div>
        </section>

        <section class="grid gap-1.5">
          <span class="reader-settings-label">{{ t('public.post.reader.lineWidth') }}</span>
          <div class="reader-settings-segment" role="radiogroup" :aria-label="t('public.post.reader.lineWidth')">
            <button
              v-for="width in lineWidths"
              :key="width"
              type="button"
              role="radio"
              :aria-checked="prefs.lineWidth === width"
              :class="{ 'is-active': prefs.lineWidth === width }"
              data-testid="reader-settings-line-width"
              :data-value="width"
              @click="setLineWidth(width)"
            >
              {{ t(`public.post.reader.lineWidthOptions.${width}`) }}
            </button>
          </div>
        </section>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import {
  READER_APPEARANCES,
  READER_FONT_FAMILIES,
  READER_FONT_SIZES,
  READER_LINE_WIDTHS
} from '~/utils/readerPrefs'

const { t } = useI18n()
const { prefs, isCustomized, setFontSize, setFontFamily, setAppearance, setLineWidth, reset } = useReaderPrefs()

const fontSizes = READER_FONT_SIZES
const fontFamilies = READER_FONT_FAMILIES
const appearances = READER_APPEARANCES
const lineWidths = READER_LINE_WIDTHS

const fontSizeSample: Record<typeof fontSizes[number], string> = {
  sm: '0.8rem',
  md: '0.95rem',
  lg: '1.1rem',
  xl: '1.25rem'
}
</script>

<style scoped>
.reader-settings-panel {
  width: 17rem;
  border-radius: var(--pb-radius-card-outer);
  border: 1px solid var(--pb-card-border);
  background: var(--pb-card-bg);
  padding: 1rem;
  color: var(--pb-text);
  box-shadow: var(--pb-shadow-lg);
}

.reader-settings-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--pb-text);
}

.reader-settings-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pb-text-subtle);
}

.reader-settings-segment {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 0.375rem;
}

.reader-settings-segment > button {
  display: grid;
  place-items: center;
  border-radius: var(--pb-radius-sm);
  border: 1px solid var(--pb-divider);
  background: var(--pb-surface-subtle);
  color: var(--pb-text-muted);
  padding: 0.375rem 0.25rem;
  font-size: 0.75rem;
  line-height: 1;
  transition: background var(--pb-transition-default), color var(--pb-transition-default), border-color var(--pb-transition-default);
}

.reader-settings-segment > button:hover {
  color: var(--pb-text);
}

.reader-settings-segment > button.is-active {
  border-color: var(--pb-selected-border);
  background: var(--pb-selected-bg);
  color: var(--pb-primary);
}

.reader-settings-swatches {
  grid-auto-columns: 2rem;
  justify-content: start;
}

.reader-appearance-swatch {
  height: 2rem;
  width: 2rem;
  border-radius: 9999px;
  border: 2px solid var(--pb-divider);
  padding: 0;
}

.reader-appearance-swatch.is-active {
  border-color: var(--pb-primary);
}

.reader-appearance-auto {
  background: linear-gradient(135deg, var(--pb-reader-light-card-bg) 50%, var(--pb-reader-dark-card-bg) 50%);
}

.reader-appearance-light {
  background: var(--pb-reader-light-card-bg);
}

.reader-appearance-sepia {
  background: var(--pb-reader-sepia-card-bg);
}

.reader-appearance-dark {
  background: var(--pb-reader-dark-card-bg);
}

.reader-settings-trigger {
  position: relative;
  display: inline-flex;
}

.reader-settings-dot {
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  height: 0.375rem;
  width: 0.375rem;
  border-radius: 9999px;
  background: var(--pb-primary);
}
</style>
