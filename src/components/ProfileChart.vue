<script setup lang="ts">
import { computed } from 'vue'
import type { GroupResult } from '../lib/planner'
import type { RestPoint, RouteSegment, TideGap, TidePoint } from '../lib/types'
import { tideAt } from '../lib/tide'
import { positionAt, progressOf } from '../lib/sim'
import { fmtClock } from '../lib/tide'

const props = defineProps<{
  group: GroupResult
  segments: RouteSegment[]
  restPoints: RestPoint[]
  points: TidePoint[]
  gaps: TideGap[]
  cursor: number
}>()

const W = 940
const PAD_L = 58
const PAD_R = 24
const TOP_Y0 = 34
const TOP_Y1 = 200
const LANE_Y0 = 222
const BOT_Y0 = 356
const BOT_Y1 = 510
const H = 560

const COLORS = ['#14665a', '#b3541e', '#39579a', '#7a3b8f', '#0f7b83', '#8a6d1a']

const n = computed(() => props.segments.length)

const domain = computed(() => {
  const d = props.group.departure
  const home = props.group.groupHome
  return { t0: d - 10, t1: home + 10 }
})

const xT = computed(() => {
  const { t0, t1 } = domain.value
  const span = Math.max(1, t1 - t0)
  return (t: number) => PAD_L + ((t - t0) / span) * (W - PAD_L - PAD_R)
})

const elevRange = computed(() => {
  let lo = Infinity
  let hi = -Infinity
  for (const seg of props.segments) {
    lo = Math.min(lo, seg.bedElev, seg.passElev)
    hi = Math.max(hi, seg.bedElev, seg.passElev)
  }
  // 遍历时间域采样潮高
  const { t0, t1 } = domain.value
  for (let t = t0; t <= t1; t += 2) {
    const r = tideAt({ points: props.points, gaps: props.gaps }, t)
    if (r.ok) {
      lo = Math.min(lo, r.h)
      hi = Math.max(hi, r.h)
    }
  }
  if (!isFinite(lo)) {
    lo = -50
    hi = 300
  }
  return { lo: lo - 25, hi: hi + 25 }
})

const yE = computed(() => {
  const { lo, hi } = elevRange.value
  const span = hi - lo || 1
  return (e: number) => TOP_Y1 - ((e - lo) / span) * (TOP_Y1 - TOP_Y0)
})

/** 上图潮位折线点（仅在已抄录区间内生成） */
const tidePath = computed(() => {
  const pts: string[] = []
  const { t0, t1 } = domain.value
  let pen = false
  for (let t = Math.floor(t0); t <= Math.ceil(t1); t += 2) {
    const r = tideAt({ points: props.points, gaps: props.gaps }, t)
    if (r.ok) {
      pts.push(`${pen ? 'L' : 'M'}${xT.value(t).toFixed(1)},${yE.value(r.h).toFixed(1)}`)
      pen = true
    } else {
      pen = false
    }
  }
  return pts.join(' ')
})

const tickHours = computed(() => {
  const { t0, t1 } = domain.value
  const out: number[] = []
  const span = t1 - t0
  const step = span > 600 ? 120 : span > 300 ? 60 : 30
  const start = Math.ceil(t0 / step) * step
  for (let t = start; t <= t1; t += step) out.push(t)
  return out
})

/** 时间域与缺口/区间外的相交片段（上图阴影片） */
const shadeRects = computed(() => {
  const rects: { x: number; w: number; cls: 'gap' | 'outside'; label: string }[] = []
  const { t0, t1 } = domain.value
  if (props.points.length >= 2) {
    const sorted = [...props.points].sort((a, b) => a.t - b.t)
    const pf = sorted[0].t
    const pl = sorted[sorted.length - 1].t
    if (pf > t0) rects.push(mk(t0, Math.min(t1, pf), 'outside', '区间外·不推算'))
    if (pl < t1) rects.push(mk(Math.max(t0, pl), t1, 'outside', '区间外·不推算'))
  }
  for (const g of props.gaps) {
    if (g.end >= t0 && g.start <= t1) {
      rects.push(mk(Math.max(t0, g.start), Math.min(t1, g.end), 'gap', '数据缺口'))
    }
  }
  return rects
})

function mk(a: number, b: number, cls: 'gap' | 'outside', label: string) {
  const x0 = xT.value(a)
  const x1 = xT.value(b)
  return { x: x0, w: Math.max(2, x1 - x0), cls, label }
}

const people = computed(() => props.group.timelines.length)
const laneH = computed(() => Math.max(9, Math.min(17, 78 / Math.max(1, people.value))))

const binding = computed(() => props.group.binding)

/** 下图各段在所选出发时刻下、全组最小净空 */
const segStatus = computed(() =>
  props.segments.map((_, i) => {
    let worst = Infinity
    let blocked: 'gap' | 'outside' | null = null
    for (const tl of props.group.timelines) {
      for (const c of tl.crossings) {
        if (c.segIndex !== i) continue
        if (c.blocked) blocked = c.blocked.reason
        else worst = Math.min(worst, c.clearance)
      }
    }
    return { worst, blocked }
  })
)

const cursorTide = computed(() =>
  tideAt({ points: props.points, gaps: props.gaps }, props.cursor)
)

// 下图空间坐标
const xS = computed(() => (dist: number) =>
  PAD_L + (dist / Math.max(1, n.value)) * (W - PAD_L - PAD_R)
)
const yS = computed(() => {
  const { lo, hi } = elevRange.value
  const span = hi - lo || 1
  return (e: number) => BOT_Y1 - ((e - lo) / span) * (BOT_Y1 - BOT_Y0)
})

const bedPath = computed(() => {
  const segs = props.segments
  if (!segs.length) return ''
  const pts: string[] = [`M${xS.value(0)},${yS.value(segs[0].bedElev)}`]
  for (let i = 0; i < segs.length; i++) {
    pts.push(`L${xS.value(i)},${yS.value(segs[i].bedElev)}`)
    pts.push(`L${xS.value(i + 1)},${yS.value(segs[i + 1]?.bedElev ?? segs[i].bedElev)}`)
  }
  return pts.join(' ')
})

const markers = computed(() =>
  props.group.timelines.map((tl, idx) => {
    const ph = positionAt(tl, props.cursor)
    const p = progressOf(ph, Math.max(1, n.value))
    return {
      name: tl.companion.name,
      color: COLORS[idx % COLORS.length],
      x: p === null ? null : xS.value(p * n.value),
      resting: ph.kind === 'rest',
      done: ph.kind === 'done',
      notStarted: ph.kind === 'not-started'
    }
  })
)

function passColor(i: number): string {
  const st = segStatus.value[i]
  if (st.blocked) return '#5b4b8a'
  if (!isFinite(st.worst)) return '#999'
  if (st.worst <= 0) return '#a32c2c'
  if (st.worst <= 15) return '#b3541e'
  return '#2f7d32'
}

const cursorInDomain = computed(
  () => props.cursor >= domain.value.t0 && props.cursor <= domain.value.t1
)
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    width="100%"
    role="img"
    aria-label="潮位时间图与潮滩剖面图"
    style="background: #fcfbf7; border: 1px solid var(--line); border-radius: 8px"
  >
    <defs>
      <pattern id="hatch-gap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#e7e1f2" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#8d7bb5" stroke-width="3" />
      </pattern>
      <pattern id="hatch-out" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#ececec" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#b5b5b5" stroke-width="2" />
      </pattern>
      <pattern id="water" width="14" height="10" patternUnits="userSpaceOnUse">
        <rect width="14" height="10" fill="#bcd9e8" />
        <path d="M0 6 Q3.5 2 7 6 T14 6" fill="none" stroke="#7fb4cc" stroke-width="1.2" />
      </pattern>
    </defs>

    <!-- ===== 上图：时间-潮位 ===== -->
    <text :x="PAD_L" y="20" font-size="13" font-weight="700" fill="#14665a">
      潮位随时间（阴影＝不插值区域）
    </text>
    <rect
      v-for="(r, i) in shadeRects"
      :key="'sh' + i"
      :x="r.x"
      :y="TOP_Y0"
      :width="r.w"
      :height="TOP_Y1 - TOP_Y0"
      :fill="r.cls === 'gap' ? 'url(#hatch-gap)' : 'url(#hatch-out)'"
      :opacity="0.7"
    />
    <line :x1="PAD_L" :x2="W - PAD_R" :y1="yE(0)" :y2="yE(0)" stroke="#999" stroke-dasharray="3 3" />
    <text :x="6" :y="yE(0) + 4" font-size="10" fill="#777">0cm</text>

    <!-- 各段通行高程阈值参考线（取最低，帮助看哪条沟先关） -->
    <line
      v-for="(seg, i) in segments"
      :key="'pl' + i"
      :x1="PAD_L"
      :x2="W - PAD_R"
      :y1="yE(seg.passElev)"
      :y2="yE(seg.passElev)"
      :stroke="passColor(i)"
      stroke-width="1"
      stroke-dasharray="6 4"
      :opacity="0.55"
    />
    <text
      v-for="(seg, i) in segments"
      :key="'pll' + i"
      :x="W - PAD_R + 1"
      :y="yE(seg.passElev) + 3"
      font-size="9"
      :fill="passColor(i)"
    >
      {{ seg.name.slice(0, 4) }}{{ seg.passElev }}
    </text>

    <path :d="tidePath" fill="none" stroke="#1f5c8a" stroke-width="2.4" />

    <!-- 最先吃紧穿越的峰值标记 -->
    <g v-if="binding">
      <line
        :x1="xT(binding.crossing.peakAt)"
        :x2="xT(binding.crossing.peakAt)"
        :y1="TOP_Y0"
        :y2="BOT_Y1"
        stroke="#a32c2c"
        stroke-width="1.4"
        stroke-dasharray="5 4"
      />
      <circle
        :cx="xT(binding.crossing.peakAt)"
        :cy="yE(binding.crossing.peak)"
        r="4.5"
        fill="#a32c2c"
      />
      <text
        :x="xT(binding.crossing.peakAt) + 6"
        :y="TOP_Y0 + 12"
        font-size="11"
        fill="#a32c2c"
      >
        最先关闭：{{ segments[binding.crossing.segIndex]?.name }}
        （{{ binding.companionName }}，净空 {{ binding.crossing.clearance.toFixed(0) }}cm）
      </text>
    </g>

    <!-- 时间刻度 -->
    <g v-for="t in tickHours" :key="'tk' + t">
      <line :x1="xT(t)" :x2="xT(t)" :y1="TOP_Y1" :y2="TOP_Y1 + 4" stroke="#888" />
      <text :x="xT(t)" :y="TOP_Y1 + 16" font-size="10" text-anchor="middle" fill="#555">
        {{ fmtClock(t) }}
      </text>
    </g>

    <!-- ===== 各人行程泳道 ===== -->
    <text :x="PAD_L" :y="LANE_Y0 - 6" font-size="12" font-weight="700" fill="#14665a">
      各人去返行程（条＝涉水穿越，圆＝安全点停留）
    </text>
    <g v-for="(tl, idx) in group.timelines" :key="tl.companion.id">
      <text :x="4" :y="LANE_Y0 + idx * laneH + 10" font-size="10" :fill="COLORS[idx % COLORS.length]">
        {{ tl.companion.name }}
      </text>
      <rect
        v-for="(c, ci) in tl.crossings"
        :key="idx + '-' + ci"
        :x="xT(c.t0)"
        :y="LANE_Y0 + idx * laneH + 1"
        :width="Math.max(2, xT(c.t1) - xT(c.t0))"
        :height="laneH - 3"
        :rx="3"
        :fill="c.blocked ? 'url(#hatch-gap)' : c.clearance <= 0 ? '#a32c2c' : c.clearance <= 15 ? '#d98a3d' : '#3f9d6a'"
        :opacity="c.blocked ? 0.85 : 0.85"
      />
      <circle
        v-for="(st, si) in tl.stays"
        :key="'st' + idx + '-' + si"
        :cx="(xT(st.t0) + xT(st.t1)) / 2"
        :cy="LANE_Y0 + idx * laneH + laneH / 2 - 1"
        :r="laneH / 2 - 1"
        fill="#e8c25a"
        stroke="#8a6d1a"
        stroke-width="1"
      />
    </g>

    <!-- 当前时刻游标 -->
    <g v-if="cursorInDomain">
      <line
        :x1="xT(cursor)"
        :x2="xT(cursor)"
        :y1="TOP_Y0 - 4"
        :y2="BOT_Y1 + 4"
        stroke="#111"
        stroke-width="1.6"
      />
      <rect :x="xT(cursor) - 30" :y="BOT_Y1 + 8" width="60" height="16" rx="3" fill="#111" />
      <text :x="xT(cursor)" :y="BOT_Y1 + 20" font-size="10" fill="#fff" text-anchor="middle">
        {{ fmtClock(cursor) }}
      </text>
    </g>

    <!-- ===== 下图：潮滩剖面 ===== -->
    <text :x="PAD_L" :y="BOT_Y0 - 24" font-size="13" font-weight="700" fill="#14665a">
      潮滩剖面与各人位置（岸在左，折返点在右）
    </text>

    <!-- 段底色：被选中最先关闭段描红 -->
    <rect
      v-for="(seg, i) in segments"
      :key="'sb' + i"
      :x="xS(i)"
      :y="BOT_Y0"
      :width="xS(i + 1) - xS(i)"
      :height="BOT_Y1 - BOT_Y0"
      :fill="binding && binding.crossing.segIndex === i ? '#f4dada' : '#f3efe6'"
      :stroke="binding && binding.crossing.segIndex === i ? '#a32c2c' : 'none'"
      stroke-width="2"
    />

    <!-- 当前潮水 -->
    <rect
      v-if="cursorTide.ok"
      :x="PAD_L"
      :y="yS(cursorTide.h)"
      :width="W - PAD_L - PAD_R"
      :height="BOT_Y1 - yS(cursorTide.h)"
      fill="url(#water)"
      :opacity="0.8"
    />
    <g v-else>
      <rect
        :x="PAD_L"
        :y="BOT_Y0"
        :width="W - PAD_L - PAD_R"
        :height="BOT_Y1 - BOT_Y0"
        fill="url(#hatch-out)"
        opacity="0.5"
      />
      <text :x="(W) / 2" :y="BOT_Y0 + 18" font-size="12" fill="#666" text-anchor="middle">
        当前时刻{{ cursorTide.ok ? '' : '无潮位数据（区间外或缺口内，不推算）' }}
      </text>
    </g>

    <!-- 沟床线 -->
    <path :d="bedPath" fill="none" stroke="#6b5b3e" stroke-width="2.5" />

    <!-- 各段通行高程阈值短横线 -->
    <g v-for="(seg, i) in segments" :key="'ps' + i">
      <line
        :x1="xS(i) + 4"
        :x2="xS(i + 1) - 4"
        :y1="yS(seg.passElev)"
        :y2="yS(seg.passElev)"
        :stroke="passColor(i)"
        stroke-width="3"
      />
      <text
        :x="(xS(i) + xS(i + 1)) / 2"
        :y="yS(seg.passElev) - 5"
        font-size="10"
        text-anchor="middle"
        :fill="passColor(i)"
      >
        {{ seg.name }} 阈{{ seg.passElev }}
      </text>
    </g>

    <!-- 端点标注 -->
    <g v-for="b in (segments.length + 1)" :key="'bd' + (b - 1)">
      <line
        :x1="xS(b - 1)"
        :x2="xS(b - 1)"
        :y1="BOT_Y1"
        :y2="BOT_Y1 + 5"
        stroke="#888"
      />
      <text :x="xS(b - 1)" :y="BOT_Y1 + 18" font-size="10" text-anchor="middle" fill="#555">
        {{ b - 1 === 0 ? '岸' : b - 1 === segments.length ? '折返点' : '端点' + (b - 1) }}
      </text>
    </g>

    <!-- 安全点 -->
    <g v-for="r in restPoints" :key="r.id">
      <polygon
        :points="`${xS(r.boundary)},${BOT_Y0 + 4} ${xS(r.boundary) + 7},${BOT_Y0 + 12} ${xS(r.boundary)},${BOT_Y0 + 20} ${xS(r.boundary) - 7},${BOT_Y0 + 12}`"
        fill="#2f7d32"
      />
      <text :x="xS(r.boundary)" :y="BOT_Y0 - 2" font-size="9" text-anchor="middle" fill="#2f7d32">
        安全点
      </text>
    </g>

    <!-- 各人位置 -->
    <g v-for="(m, idx) in markers" :key="'mk' + idx">
      <g v-if="m.x !== null">
        <circle
          :cx="m.x"
          :cy="BOT_Y1 - 40 - (idx % 3) * 20"
          :r="m.resting ? 7 : 6"
          :fill="m.color"
          :stroke="m.resting ? '#e8c25a' : '#fff'"
          stroke-width="2.5"
        />
        <text
          :x="m.x + 9"
          :y="BOT_Y1 - 36 - (idx % 3) * 20"
          font-size="11"
          :fill="m.color"
        >
          {{ m.name }}{{ m.done ? '（已到岸）' : m.resting ? '（停留）' : '' }}
        </text>
      </g>
      <text v-else :x="PAD_L + 6" :y="BOT_Y0 + 40 + idx * 14" font-size="10" :fill="m.color">
        {{ m.name }}：{{ m.notStarted ? '尚未出发' : '' }}
      </text>
    </g>
  </svg>
</template>
