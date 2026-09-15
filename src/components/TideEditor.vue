<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../lib/store'
import { fmtClock, sortedPoints, validatePoints } from '../lib/tide'
import TimeInput from './TimeInput.vue'

const s = store.state

const sorted = computed(() => sortedPoints(s.tidePoints))
const pointError = computed(() => validatePoints(s.tidePoints))

const range = computed(() => {
  if (sorted.value.length < 2) return null
  return `${fmtClock(sorted.value[0].t)} 至 ${fmtClock(sorted.value[sorted.value.length - 1].t)}`
})

const gapError = computed(() => {
  for (const g of s.tideGaps) {
    if (g.end < g.start) return '存在起止颠倒的数据缺口'
  }
  return null
})

function begin() {
  store.snapshot()
}
function commit(fn: () => void) {
  store.setSilently(fn)
}
</script>

<template>
  <div>
    <div class="row" style="justify-content: space-between">
      <p class="subtle" style="margin: 0">
        抄录当地发布的潮高时刻点。相邻点之间按<b>直线线性插值</b>；首尾点之外不做任何推算。
        高程单位（厘米）请与路线“可通行高程”统一基准。
      </p>
      <button class="small" @click="store.addTidePoint()">＋ 添加潮点</button>
    </div>

    <div v-if="pointError" class="callout bad" style="margin-top: 10px">
      {{ pointError }}
    </div>
    <div v-else-if="range" class="subtle" style="margin: 8px 0">
      已抄录区间：<b>{{ range }}</b>，共 {{ sorted.length }} 点。只能在该区间内寻找出发时刻。
    </div>

    <table style="margin-top: 8px">
      <thead>
        <tr>
          <th>顺序</th>
          <th>时刻（HH:MM）</th>
          <th>潮高(cm)</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in sorted" :key="p.id">
          <td>{{ i + 1 }}</td>
          <td>
            <TimeInput
              :model-value="p.t"
              @begin="begin"
              @update:model-value="(v) => commit(() => (p.t = v))"
            />
          </td>
          <td>
            <input
              type="number"
              :value="p.h"
              @focus="begin"
              @input="commit(() => (p.h = Number(($event.target as HTMLInputElement).value)))"
            />
          </td>
          <td>
            <button class="small danger" @click="store.removeTidePoint(p.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <h3>数据缺口（如有发布中断/缺报时段）</h3>
    <p class="subtle">
      缺口时段内不插值；任何人的行程只要触及缺口即判为阻断，需补录后再核。
    </p>
    <div v-if="gapError" class="callout warn">{{ gapError }}</div>
    <table>
      <thead>
        <tr>
          <th>起</th>
          <th>止</th>
          <th>说明</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="g in s.tideGaps" :key="g.id">
          <td>
            <TimeInput
              :model-value="g.start"
              @begin="begin"
              @update:model-value="(v) => commit(() => (g.start = v))"
            />
          </td>
          <td>
            <TimeInput
              :model-value="g.end"
              @begin="begin"
              @update:model-value="(v) => commit(() => (g.end = v))"
            />
          </td>
          <td>
            <input
              type="text"
              :value="g.note"
              @focus="begin"
              @input="commit(() => (g.note = ($event.target as HTMLInputElement).value))"
            />
          </td>
          <td>
            <button class="small danger" @click="store.removeGap(g.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <button class="small" style="margin-top: 8px" @click="store.addGap()">＋ 标记数据缺口</button>
  </div>
</template>
