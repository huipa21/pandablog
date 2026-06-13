<template>
  <VisXYContainer :height="260" :margin="{ left: 48, right: 12, top: 12, bottom: 32 }">
    <VisLine :data="points" :x="x" :y="y" color="var(--pb-primary)" />
    <VisAxis type="x" :tick-format="formatX" />
    <VisAxis type="y" />
  </VisXYContainer>
</template>

<script setup lang="ts">
import { VisAxis, VisLine, VisXYContainer } from '@unovis/vue'

interface ChartPoint {
  index: number
  date: string
  pageViews: number
}

const props = defineProps<{
  points: ChartPoint[]
}>()

const x = (point: ChartPoint) => point.index
const y = (point: ChartPoint) => point.pageViews
const formatX = (value: number | Date) => props.points[Number(value)]?.date.slice(5) ?? ''
</script>
