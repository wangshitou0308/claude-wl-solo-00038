<script setup lang="ts">
import type { GroupResult } from '../lib/planner'
import type { AppState } from '../lib/types'
import { fmtClock, fmtDur } from '../lib/tide'

const props = defineProps<{
  state: AppState
  group: GroupResult
  departure: number
}>()

function dirText(d: 'out' | 'back') {
  return d === 'out' ? '去' : '返'
}
</script>

<template>
  <div id="print-card">
    <h2 style="margin-top: 0">同行核对卡</h2>
    <p style="margin: 4px 0">
      <b>{{ state.settings.place || '（未填地点）' }}</b>
      &nbsp;｜&nbsp;计划出发 <b>{{ fmtClock(departure) }}</b>
    </p>

    <div v-if="!group.ok" style="border: 2px solid #a32c2c; padding: 8px; border-radius: 6px; margin: 8px 0">
      <b style="color: #a32c2c">该出发时刻不可成行，请改选可行区间后重新打印。</b>
    </div>

    <table>
      <thead>
        <tr>
          <th>同行者</th>
          <th>余量(cm)</th>
          <th>到达折返点</th>
          <th>开返（须不晚于）</th>
          <th>到岸</th>
          <th>全程</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="tl in group.timelines" :key="tl.companion.id">
          <td>{{ tl.companion.name }}</td>
          <td>{{ tl.companion.margin }}</td>
          <td>{{ fmtClock(tl.turnaround) }}</td>
          <td><b>{{ fmtClock(tl.turnaround) }}</b></td>
          <td>{{ fmtClock(tl.home) }}</td>
          <td>{{ fmtDur(tl.home - tl.depart) }}</td>
        </tr>
      </tbody>
    </table>

    <h3>分段阈值（潮高＋余量须始终低于该高程）</h3>
    <table>
      <thead>
        <tr>
          <th>路段</th>
          <th>通行高程(cm)</th>
          <th v-for="tl in group.timelines" :key="tl.companion.id">
            {{ tl.companion.name }} 去/返 峰值净空
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(seg, i) in state.segments" :key="seg.id">
          <td>{{ seg.name }}</td>
          <td>{{ seg.passElev }}</td>
          <td v-for="tl in group.timelines" :key="tl.companion.id">
            <template v-for="(c, k) in tl.crossings.filter((x) => x.segIndex === i)" :key="k">
              <span :style="{ color: c.blocked ? '#5b4b8a' : c.clearance <= 0 ? '#a32c2c' : c.clearance <= 15 ? '#b3541e' : '#2f7d32' }">
                {{ dirText(c.dir) }}：{{ c.blocked ? '无数据' : c.clearance.toFixed(0) + 'cm' }}
              </span>
              &nbsp;
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <h3>安全点（仅这些点允许停留）</h3>
    <ul style="margin: 4px 0">
      <li v-for="r in state.restPoints" :key="r.id">
        端点 {{ r.boundary }}
        {{ r.note ? `（${r.note}）` : '' }}：去程停留 {{ r.stayOut }} 分，返程停留
        {{ r.stayBack }} 分
      </li>
      <li v-if="state.restPoints.length === 0" class="subtle">未标明安全点，途中不得停留。</li>
    </ul>

    <p class="subtle" style="margin-top: 10px">
      全组最晚开返：<b style="color: #a32c2c">{{ fmtClock(group.groupTurnaround) }}</b>；
      最晚到岸：{{ fmtClock(group.groupHome) }}。结论仅依据已抄录潮点线性插值，不向区间外推算。
      打印日期：{{ new Date().toLocaleDateString('zh-CN') }}。
      <span v-if="state.settings.note">备注：{{ state.settings.note }}</span>
    </p>
  </div>
</template>
