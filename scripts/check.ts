import { buildSampleState } from '../src/lib/sample'
import { buildPlanReport, evaluateGroup } from '../src/lib/planner'
import { tideAt, fmtClock } from '../src/lib/tide'

const st = buildSampleState()

// 1) 插值与不外推
const mid = tideAt({ points: st.tidePoints, gaps: st.tideGaps }, 570)
console.assert(mid.ok === true && Math.abs((mid as any).h - 5) < 1e-9, 'linear interp failed', mid)
const before = tideAt({ points: st.tidePoints, gaps: st.tideGaps }, 300)
console.assert(before.ok === false && (before as any).reason === 'outside', 'outside before failed')
const after = tideAt({ points: st.tidePoints, gaps: st.tideGaps }, 1000)
console.assert(after.ok === false && (after as any).reason === 'outside', 'outside after failed')

// 2) 可行窗口
const rep = buildPlanReport(st.tidePoints, st.tideGaps, st.segments, st.restPoints, st.companions)
console.log('setupError:', rep.setupError)
console.log('windows:', rep.windows.map((w) => `${fmtClock(w.start)}-${fmtClock(w.end)} turn=${fmtClock(w.latestTurnaround)} home=${fmtClock(w.latestHome)}`))
console.assert(rep.windows.length > 0, 'sample should have feasible windows')
console.assert(rep.windows.every((w) => w.start >= 360 && w.end <= 960), 'windows inside tide range')

// 3) 最晚出发可行，晚一分钟不可行（窗口边界性质）
const w = rep.windows[rep.windows.length - 1]
const atEnd = evaluateGroup(st.tidePoints, st.tideGaps, st.segments, st.restPoints, st.companions, w.end)
console.assert(atEnd.ok === true, 'window end must be feasible')
const afterEnd = evaluateGroup(st.tidePoints, st.tideGaps, st.segments, st.restPoints, st.companions, w.end + 1)
if (w.end < 960) console.assert(afterEnd.ok === false, 'after window end must fail')

// 4) 最慢者决定全程：找到 home 最大的人应是 pace=1 那位
let maxPaceHome = -1
for (const tl of atEnd.timelines) {
  if (tl.companion.pace === 1) maxPaceHome = tl.home
}
const groupHome = atEnd.groupHome
console.assert(Math.abs(maxPaceHome - groupHome) < 1e-9, 'slowest must define groupHome')

// 5) 缺口阻断：缺口覆盖一段必经过的时段，选可行窗口出发即应阻断
const withGap = buildSampleState()
withGap.tideGaps.push({ id: 'g1', start: 560, end: 600, note: 'test' })
const g = evaluateGroup(withGap.tidePoints, withGap.tideGaps, withGap.segments, withGap.restPoints, withGap.companions, 520)
const gapTouched = g.timelines.some((tl) => tl.crossings.some((c) => c.blocked?.reason === 'gap'))
console.assert(!g.ok && gapTouched, 'gap should block crossings that overlap it')
const rep2 = buildPlanReport(withGap.tidePoints, withGap.tideGaps, withGap.segments, withGap.restPoints, withGap.companions)
console.log('gap windows:', rep2.windows.length, 'gapFails blockers:', rep2.blockers.map((b) => `${b.segIndex}:${b.gapFails}`))
console.assert(rep2.blockers.some((b) => b.gapFails > 0), 'gap diagnostics should appear')

// 6) 无解定位：把所有通行高程设为极低
const bad = buildSampleState()
bad.segments.forEach((seg) => (seg.passElev = -1000))
const rep3 = buildPlanReport(bad.tidePoints, bad.tideGaps, bad.segments, bad.restPoints, bad.companions)
console.assert(rep3.windows.length === 0, 'no windows expected')
console.assert(rep3.blockers.every((b) => b.tideFails > 0), 'all segments tide-blocked')
console.log('no-solution blockers:', rep3.blockers.length)

// 7) 安全余量抬升会缩小窗口
const lo = buildSampleState()
lo.companions.forEach((c) => (c.margin = 0))
const hi = buildSampleState()
const repLo = buildPlanReport(lo.tidePoints, lo.tideGaps, lo.segments, lo.restPoints, lo.companions)
const repHi = buildPlanReport(hi.tidePoints, hi.tideGaps, hi.segments, hi.restPoints, hi.companions)
const totalLo = repLo.windows.reduce((a, x) => a + (x.end - x.start), 0)
const totalHi = repHi.windows.reduce((a, x) => a + (x.end - x.start), 0)
console.assert(totalLo >= totalHi, 'zero margin should not shrink windows')
console.log('window minutes margin0:', totalLo, 'margin-sample:', totalHi)

console.log('ALL CHECKS PASSED')
