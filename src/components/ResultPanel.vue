<script setup lang="ts">
import { computed } from 'vue'
import type { GroupResult, PlanReport } from '../lib/planner'
import type { RouteSegment } from '../lib/types'
import { fmtClock, fmtDur } from '../lib/tide'

const props = defineProps<{
  report: PlanReport
  group: GroupResult
  segments: RouteSegment[]
  departure: number
  rangeMin: number
  rangeMax: number
}>()

const emit = defineEmits<{
  (e: 'update:departure', v: number): void
}>()

const inWindow = computed(() =>
  props.report.windows.find((w) => props.departure >= w.start && props.departure <= w.end)
)

function reasonText(reason: 'tide' | 'gap' | 'outside'): string {
  if (reason === 'tide') return '潮位超通行高程（浅沟被截断）'
  if (reason === 'gap') return '行程落入数据缺口'
  return '行程超出已抄录潮点区间，不能外推'
}
</script>

<template>
  <div>
    <div v-if="report.setupError" class="callout warn">
      <b>暂不能核验：</b>{{ report.setupError }}
    </div>

    <template v-else>
      <div v-for="(g, i) in report.gapNotes" :key="'gn' + i" class="callout warn">
        {{ g }}
      </div>

      <h2>可出发区间（已按全组最慢者核验去返全程）</h2>
      <div v-if="report.windows.length === 0" class="callout bad">
        <b>在已抄录的潮点区间内没有可行出发时刻。</b>
        请核对潮点、通行高程、耗时或余量；应用不会向区间外推算。
      </div>
      <table v-else>
        <thead>
          <tr>
            <th>可出发区间</th>
            <th>最晚出发</th>
            <th>该时刻最晚开返（折返点）</th>
            <th>最晚到岸</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(w, i) in report.windows"
            :key="i"
            :style="departure >= w.start && departure <= w.end ? { background: 'var(--accent-soft)' } : {}"
          >
            <td>
              {{ fmtClock(w.start) }} – {{ fmtClock(w.end) }}
              <span class="subtle">（宽 {{ fmtDur(w.end - w.start) }}）</span>
            </td>
            <td>{{ fmtClock(w.end) }}</td>
            <td><b>{{ fmtClock(w.latestTurnaround) }}</b></td>
            <td>{{ fmtClock(w.latestHome) }}</td>
            <td>
              <button
                class="small"
                :class="{ primary: departure === w.end }"
                @click="emit('update:departure', w.end)"
              >
                取最晚出发
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <h3>拖动出发时刻核验</h3>
      <div class="slider-wrap">
        <input
          type="range"
          :min="rangeMin"
          :max="rangeMax"
          step="1"
          :value="departure"
          @input="emit('update:departure', Number(($event.target as HTMLInputElement).value))"
        />
        <div class="row" style="justify-content: space-between">
          <span class="subtle">{{ fmtClock(rangeMin) }}</span>
          <span style="font-size: 1.15rem">
            出发 <b>{{ fmtClock(departure) }}</b>
          </span>
          <span class="subtle">{{ fmtClock(rangeMax) }}</span>
        </div>
      </div>

      <div v-if="group.ok" class="callout ok">
        <span class="badge ok">可成行</span>
        全组最后一人须于 <b>{{ fmtClock(group.groupTurnaround) }}</b> 前离开折返点开返，
        约 <b>{{ fmtClock(group.groupHome) }}</b> 到岸。
        <template v-if="group.binding">
          最先吃紧：<b>{{ segments[group.binding.crossing.segIndex]?.name }}</b>
          （{{ group.binding.companionName }}
          {{ group.binding.crossing.dir === 'out' ? '去程' : '返程' }}穿越，净空仅
          {{ group.binding.crossing.clearance.toFixed(0) }}cm，峰值 {{ fmtClock(group.binding.crossing.peakAt) }}）
        </template>
        <div v-if="inWindow" class="subtle" style="margin-top: 4px">
          该出发时刻位于可行区间内，区间最晚出发 {{ fmtClock(inWindow.end) }}。
        </div>
      </div>

      <div v-else-if="group.firstFailure" class="callout bad">
        <span class="badge bad">阻断</span>
        <b>{{ segments[group.firstFailure.segIndex]?.name }}</b
        >（{{ group.firstFailure.dir === 'out' ? '去程' : '返程' }}）：{{
          reasonText(group.firstFailure.reason)
        }}
        <template v-if="group.firstFailure.reason === 'tide'">
          ，于 {{ fmtClock(group.firstFailure.at) }}
          潮高 {{ group.firstFailure.peak.toFixed(0) }}cm 已达阈值（含安全余量）。
        </template>
        <template v-else>，阻断时刻 {{ fmtClock(group.firstFailure.at) }}。</template>
        <div class="subtle" style="margin-top: 4px">
          涉及同行者：{{ group.firstFailure.companionName }}。此结论仅在当前潮点与路线数据下有效，改动数据后请重新核对。
        </div>
      </div>

      <h3 v-if="!group.ok || report.windows.length === 0">阻断段定位（按全程扫描统计）</h3>
      <table v-if="!group.ok || report.windows.length === 0">
        <thead>
          <tr>
            <th>路段</th>
            <th>潮位截断次数</th>
            <th>缺口阻断次数</th>
            <th>区间外次数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in report.blockers" :key="b.segIndex">
            <td>{{ segments[b.segIndex]?.name }}</td>
            <td :style="{ color: b.tideFails ? '#a32c2c' : undefined }">{{ b.tideFails }}</td>
            <td :style="{ color: b.gapFails ? '#5b4b8a' : undefined }">{{ b.gapFails }}</td>
            <td :style="{ color: b.outsideFails ? '#777' : undefined }">{{ b.outsideFails }}</td>
          </tr>
          <tr v-if="report.blockers.length === 0">
            <td colspan="4" class="subtle">无（多为所选时刻造成的区间外行程）</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
