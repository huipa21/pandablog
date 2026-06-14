<template>
  <NodeViewWrapper
    class="video-embed-nodeview"
    data-type="video-embed"
    :data-provider="provider"
    :data-video-id="videoId"
    :data-start="start"
    contenteditable="false"
  >
    <div v-if="hasVideo" class="video-embed-shell">
      <div class="video-embed-frame">
        <button
          v-if="!loaded"
          type="button"
          class="video-embed-facade"
          :aria-label="playLabel"
          @click="loadVideo"
        >
          <img class="video-embed-thumb" :src="thumbnailSrc" :alt="playLabel" loading="lazy">
          <span class="video-embed-play" aria-hidden="true">
            <UIcon name="i-lucide-play" class="video-embed-play-icon" />
          </span>
        </button>
        <iframe
          v-else
          class="video-embed-iframe"
          :src="iframeSrc"
          :title="title"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
        />
      </div>
      <a class="video-embed-fallback" :href="watchUrl" target="_blank" rel="noopener noreferrer">
        <UIcon name="i-lucide-external-link" class="video-embed-fallback-icon" />
        <span>{{ t('admin.editor.blocks.openOnYouTube') }}</span>
      </a>
    </div>
    <div v-else class="video-embed-empty">
      <UIcon name="i-lucide-circle-alert" class="video-embed-empty-icon" />
      <span>{{ t('admin.editor.blocks.videoEmbedEmpty') }}</span>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { buildYouTubeEmbedSrc, buildYouTubeThumbnail, buildYouTubeWatchUrl } from '~/utils/videoEmbed'

const props = defineProps(nodeViewProps)
const { t } = useI18n()

const loaded = ref(false)
const provider = computed(() => String(props.node.attrs.provider || 'youtube'))
const videoId = computed(() => String(props.node.attrs.videoId || ''))
const start = computed(() => Number(props.node.attrs.start || 0))
const hasVideo = computed(() => provider.value === 'youtube' && videoId.value.length > 0)
const title = computed(() => t('admin.editor.blocks.youtubeVideo'))
const playLabel = computed(() => t('admin.editor.blocks.playVideo'))
const thumbnailSrc = computed(() => buildYouTubeThumbnail(videoId.value))
const iframeSrc = computed(() => buildYouTubeEmbedSrc(videoId.value, start.value))
const watchUrl = computed(() => buildYouTubeWatchUrl(videoId.value, start.value))

function loadVideo() {
  loaded.value = true
}
</script>

<style scoped>
.video-embed-nodeview {
  display: block;
  margin: 1rem 0;
}

.video-embed-frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-md);
  background: var(--pb-card-bg);
  box-shadow: var(--pb-shadow-md);
}

.video-embed-shell {
  display: grid;
  gap: 0.5rem;
}

.video-embed-facade {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: var(--pb-card-bg);
  border: 0;
}

.video-embed-thumb,
.video-embed-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.video-embed-thumb {
  object-fit: cover;
  transition: transform 180ms ease, filter 180ms ease;
}

.video-embed-facade::after {
  position: absolute;
  inset: 0;
  content: '';
  background: color-mix(in srgb, var(--pb-text) 18%, transparent);
  transition: background 180ms ease;
}

.video-embed-facade:hover .video-embed-thumb,
.video-embed-facade:focus-visible .video-embed-thumb {
  filter: saturate(1.08);
  transform: scale(1.015);
}

.video-embed-facade:hover::after,
.video-embed-facade:focus-visible::after {
  background: color-mix(in srgb, var(--pb-text) 10%, transparent);
}

.video-embed-facade:focus-visible {
  outline: 3px solid var(--pb-focus-ring);
  outline-offset: -3px;
}

.video-embed-play {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 4.25rem;
  height: 4.25rem;
  color: var(--pb-primary-contrast);
  background: color-mix(in srgb, var(--pb-primary) 88%, transparent);
  border-radius: 999px;
  box-shadow: var(--pb-shadow-lg);
  transform: translate(-50%, -50%);
  transition: transform 180ms ease, background 180ms ease;
}

.video-embed-facade:hover .video-embed-play,
.video-embed-facade:focus-visible .video-embed-play {
  background: var(--pb-primary);
  transform: translate(-50%, -50%) scale(1.04);
}

.video-embed-play-icon {
  width: 1.65rem;
  height: 1.65rem;
  margin-left: 0.2rem;
}

.video-embed-empty {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 1rem;
  color: var(--pb-text-subtle);
  background: var(--pb-card-bg);
  border: 1px dashed var(--pb-divider);
  border-radius: var(--pb-radius-md);
}

.video-embed-empty-icon {
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  margin-top: 0.1rem;
  color: var(--pb-icon-muted);
}

.video-embed-fallback {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  justify-self: start;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--pb-link);
  text-decoration: none;
}

.video-embed-fallback:hover,
.video-embed-fallback:focus-visible {
  color: var(--pb-link-hover);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.video-embed-fallback-icon {
  flex: 0 0 auto;
  width: 0.95rem;
  height: 0.95rem;
}
</style>