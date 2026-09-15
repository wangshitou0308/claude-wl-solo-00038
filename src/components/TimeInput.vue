<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fmtClock, parseClock } from '../lib/tide'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'begin'): void
}>()

const text = ref(fmtClock(props.modelValue))
const valid = ref(true)

watch(
  () => props.modelValue,
  (v) => {
    text.value = fmtClock(v)
    valid.value = true
  }
)

function onInput() {
  const parsed = parseClock(text.value)
  if (parsed === null) {
    valid.value = false
    return
  }
  valid.value = true
  emit('update:modelValue', parsed)
}

const hint = computed(() => (valid.value ? '' : '格式应为 HH:MM，跨日可写 08:30(+1日)'))
</script>

<template>
  <span>
    <input
      type="text"
      v-model="text"
      @focus="emit('begin')"
      @input="onInput"
      :style="{ borderColor: valid ? undefined : '#a32c2c', width: '132px' }"
    />
    <span v-if="hint" class="subtle" style="margin-left: 6px">{{ hint }}</span>
  </span>
</template>
