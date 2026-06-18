<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const route = useRoute()

await navigateTo({ path: '/admin/dashboard/logs/activity', query: route.query, hash: route.hash }, { replace: true })
</script>
