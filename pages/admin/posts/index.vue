<template>
  <section class="grid gap-6">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Content</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Posts</h1>
      </div>
      <UButton icon="i-lucide-plus" :loading="creating" @click="createPost">
        New post
      </UButton>
    </div>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load posts" />

    <div class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-12" />
      </div>

      <table v-else-if="posts.length" class="w-full border-collapse text-left text-sm">
        <thead class="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
          <tr>
            <th class="px-4 py-3 font-medium">Title</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Updated</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          <tr v-for="post in posts" :key="post.id" class="hover:bg-stone-50">
            <td class="px-4 py-3">
              <div class="font-medium text-stone-950">{{ post.title }}</div>
              <div class="text-xs text-stone-500">/{{ post.slug }}</div>
            </td>
            <td class="px-4 py-3">
              <UBadge :color="post.status === 'published' ? 'success' : 'neutral'" variant="subtle">
                {{ post.status }}
              </UBadge>
            </td>
            <td class="px-4 py-3 text-stone-600">{{ formatDate(post.updated_at) }}</td>
            <td class="px-4 py-3 text-right">
              <UButton :to="`/admin/posts/${encodeURIComponent(post.id)}`" icon="i-lucide-pencil" variant="ghost" color="neutral">
                Edit
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>

      <UEmpty v-else icon="i-lucide-file-text" title="No posts yet" description="Create your first draft to start building the knowledge base." class="py-12" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PostRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const creating = ref(false)
const { data, pending, error, refresh } = await useAsyncData('admin-posts', () => $fetch<{ posts: PostRecord[] }>('/api/admin/posts'))
const posts = computed(() => data.value?.posts ?? [])

async function createPost() {
  creating.value = true
  try {
    const post = await $fetch<PostRecord>('/api/admin/posts', {
      method: 'POST',
      body: {
        title: 'Untitled note'
      }
    })
    await navigateTo(`/admin/posts/${encodeURIComponent(post.id)}`)
  } finally {
    creating.value = false
    await refresh()
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>