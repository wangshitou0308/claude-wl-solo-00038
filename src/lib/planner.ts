import type {
  Companion,
  RestPoint,
  RouteSegment,
  TideGap,
  TidePoint
} from './types'
import { fmtClock, maxTideOver, sortedPoints } from './tide'

/** 一次涉水穿越（去程或返程经过某段） */
export interface Crossing {
  segIndex: number
  dir: 'out' | 'back'
  t0: number
  t1: number
  /** 该次穿越时段内最高潮位（阻断时为 NaN） */
  peak: number
  peakAt: number
  /** 净空 = 通行高程 - 个人余量 - 最高潮位（厘米，<0 表示已截断） */
  clearance: number
  feasible: boolean
  /** 非空表示该穿越落入数据缺口或已抄录区间之外，不做推算 */
  blocked: { reason: 'gap' | 'outside'; at: number } | null
}

export interface RestStay {
  boundary: number
  dir: 'out' | 'back'
  t0: number
  t1: number
  note: string
}

/** 单个同行者全程时间线（时间线本身与潮位无关） */
export interface PersonTimeline {
  companion: Companion
  depart: number
  turnaround: number
  home: number
  crossings: Crossing[]
  stays: RestStay[]
  failure: Failure | null
}

export interface Failure {
  segIndex: number
  dir: 'out' | 'back'
  /** 'tide' 潮位超阈值；'gap' 落入数据缺口；'outside' 超出已抄录潮点区间 */
  reason: 'tide' | 'gap' | 'outside'
  at: number
  peak: number
}

export interface GroupResult {
  ok: boolean
  departure: number
  timelines: PersonTimeline[]
  /** 最早发生的阻断（各组按时间比较） */
  firstFailure: (Failure & { companionId: string; companionName: string }) | null
  /** 全组净空最小、最先吃紧的穿越 */
  binding: { crossing: Crossing; companionId: string; companionName: string } | null
  /** 最后一人结束目的地停留、必须开返的时刻 */
  groupTurnaround: number
  /** 最后一人到岸时刻 */
  groupHome: number
}

export interface FeasibleWindow {
  start: number
  end: number
  /** 该窗口最晚出发时，最后一人的折返/到岸时刻 */
  latestTurnaround: number
  latestHome: number
}

export interface SegmentDiag {
  segIndex: number
  tideFails: number
  gapFails: number
  outsideFails: number
}

export interface PlanReport {
  /** 静态/数据层面的阻断说明，为空表示输入完整可算 */
  setupError: string | null
  windows: FeasibleWindow[]
  scanned: boolean
  /** 无解时的定位诊断 */
  blockers: SegmentDiag[]
  gapNotes: string[]
  tideRange: { first: number; last: number } | null
}

function paceDur(seg: RouteSegment, dir: 'out' | 'back', p: Companion): number {
  const [mn, mx] = dir === 'out' ? [seg.outMin, seg.outMax] : [seg.backMin, seg.backMax]
  return mn + (mx - mn) * p.pace
}

/** 构建某人时间线并逐次穿越做潮位核验 */
export function evaluateGroup(
  points: TidePoint[],
  gaps: TideGap[],
  segments: RouteSegment[],
  restPoints: RestPoint[],
  companions: Companion[],
  departure: number
): GroupResult {
  const src = { points, gaps }
  const restMap = new Map<number, RestPoint>()
  for (const r of restPoints) restMap.set(r.boundary, r)
  const n = segments.length

  const timelines: PersonTimeline[] = companions.map((c) => {
    const stays: RestStay[] = []
    const crossings: Crossing[] = []
    let cur = departure

    const applyStay = (b: number, dir: 'out' | 'back') => {
      const r = restMap.get(b)
      const dur = dir === 'out' ? r?.stayOut ?? 0 : r?.stayBack ?? 0
      if (r && dur > 0) {
        stays.push({ boundary: b, dir, t0: cur, t1: cur + dur, note: r.note })
        cur += dur
      }
    }

    let failure: Failure | null = null
    const fail = (f: Failure) => {
      if (!failure || f.at < failure.at) failure = f
    }

    // 去程
    applyStay(0, 'out')
    for (let i = 0; i < n; i++) {
      const t0 = cur
      const t1 = cur + paceDur(segments[i], 'out', c)
      const mt = maxTideOver(src, t0, t1)
      if ('blocked' in mt) {
        crossings.push({
          segIndex: i,
          dir: 'out',
          t0,
          t1,
          peak: NaN,
          peakAt: mt.at,
          clearance: NaN,
          feasible: false,
          blocked: { reason: mt.reason, at: mt.at }
        })
        fail({ segIndex: i, dir: 'out', reason: mt.reason, at: mt.at, peak: NaN })
      } else {
        const clearance = segments[i].passElev - c.margin - mt.max
        crossings.push({
          segIndex: i,
          dir: 'out',
          t0,
          t1,
          peak: mt.max,
          peakAt: mt.at,
          clearance,
          feasible: clearance > 0,
          blocked: null
        })
        if (clearance <= 0) {
          fail({ segIndex: i, dir: 'out', reason: 'tide', at: mt.at, peak: mt.max })
        }
      }
      cur = t1
      applyStay(i + 1, 'out')
    }
    const turnaround = cur

    // 返程
    for (let i = n - 1; i >= 0; i--) {
      const t0 = cur
      const t1 = cur + paceDur(segments[i], 'back', c)
      const mt = maxTideOver(src, t0, t1)
      if ('blocked' in mt) {
        crossings.push({
          segIndex: i,
          dir: 'back',
          t0,
          t1,
          peak: NaN,
          peakAt: mt.at,
          clearance: NaN,
          feasible: false,
          blocked: { reason: mt.reason, at: mt.at }
        })
        fail({ segIndex: i, dir: 'back', reason: mt.reason, at: mt.at, peak: NaN })
      } else {
        const clearance = segments[i].passElev - c.margin - mt.max
        crossings.push({
          segIndex: i,
          dir: 'back',
          t0,
          t1,
          peak: mt.max,
          peakAt: mt.at,
          clearance,
          feasible: clearance > 0,
          blocked: null
        })
        if (clearance <= 0) {
          fail({ segIndex: i, dir: 'back', reason: 'tide', at: mt.at, peak: mt.max })
        }
      }
      cur = t1
      applyStay(i, 'back')
    }

    return { companion: c, depart: departure, turnaround, home: cur, crossings, stays, failure }
  })

  let firstFailure: GroupResult['firstFailure'] = null
  for (const tl of timelines) {
    if (tl.failure && (!firstFailure || tl.failure.at < firstFailure.at)) {
      firstFailure = {
        ...tl.failure,
        companionId: tl.companion.id,
        companionName: tl.companion.name
      }
    }
  }

  let binding: GroupResult['binding'] = null
  for (const tl of timelines) {
    for (const cr of tl.crossings) {
      if (cr.blocked) continue
      if (!binding || cr.clearance < binding.crossing.clearance) {
        binding = { crossing: cr, companionId: tl.companion.id, companionName: tl.companion.name }
      }
    }
  }

  return {
    ok: !firstFailure,
    departure,
    timelines,
    firstFailure,
    binding,
    groupTurnaround: Math.max(...timelines.map((t) => t.turnaround)),
    groupHome: Math.max(...timelines.map((t) => t.home))
  }
}

export function validateSetup(
  points: TidePoint[],
  segments: RouteSegment[],
  companions: Companion[]
): string | null {
  if (points.length < 2) return '潮高时刻点不足两个，无法线性插值'
  const sp = sortedPoints(points)
  for (let i = 1; i < sp.length; i++) {
    if (sp[i].t === sp[i - 1].t) return `潮点时刻重复：${fmtClock(sp[i].t)}`
  }
  if (segments.length === 0) return '尚未标出任何路线分段'
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const tag = `第 ${i + 1} 段「${s.name || '未命名'}」`
    if (!Number.isFinite(s.bedElev) || !Number.isFinite(s.passElev)) return `${tag}高程缺失`
    const dur = [s.outMin, s.outMax, s.backMin, s.backMax]
    if (dur.some((v) => !Number.isFinite(v) || v < 0)) return `${tag}耗时无效`
    if (s.outMin > s.outMax || s.backMin > s.backMax) return `${tag}耗时范围“快”大于“慢”`
  }
  if (companions.length === 0) return '至少需要一位同行者'
  for (const c of companions) {
    if (!Number.isFinite(c.margin)) return `同行者「${c.name}」安全余量无效`
  }
  return null
}

const SCAN_STEP = 1 // 分钟

/** 扫描所有可出发分钟，提取可行区间；无解时给出阻断定位 */
export function buildPlanReport(
  points: TidePoint[],
  gaps: TideGap[],
  segments: RouteSegment[],
  restPoints: RestPoint[],
  companions: Companion[]
): PlanReport {
  const setupError = validateSetup(points, segments, companions)
  if (setupError) {
    return { setupError, windows: [], scanned: false, blockers: [], gapNotes: [], tideRange: null }
  }
  const sp = sortedPoints(points)
  const first = sp[0].t
  const last = sp[sp.length - 1].t

  const blockers: SegmentDiag[] = segments.map((_, i) => ({
    segIndex: i,
    tideFails: 0,
    gapFails: 0,
    outsideFails: 0
  }))

  const windows: FeasibleWindow[] = []
  let runStart: number | null = null
  let runEnd = -1

  for (let d = first; d <= last; d += SCAN_STEP) {
    const g = evaluateGroup(points, gaps, segments, restPoints, companions, d)
    if (g.ok) {
      if (runStart === null) runStart = d
      runEnd = d
    } else {
      if (runStart !== null) {
        windows.push(windowMeta(runStart, runEnd, points, gaps, segments, restPoints, companions))
        runStart = null
      }
      for (const tl of g.timelines) {
        if (tl.failure) {
          const b = blockers[tl.failure.segIndex]
          if (tl.failure.reason === 'tide') b.tideFails++
          else if (tl.failure.reason === 'gap') b.gapFails++
          else b.outsideFails++
        }
      }
    }
  }
  if (runStart !== null) {
    windows.push(windowMeta(runStart, runEnd, points, gaps, segments, restPoints, companions))
  }

  const gapNotes = gaps.map(
    (g) =>
      `数据缺口 ${fmtClock(g.start)}–${fmtClock(g.end)}${g.note ? `（${g.note}）` : ''}：该时段不插值，行程触及即阻断`
  )

  return {
    setupError: null,
    windows,
    scanned: true,
    blockers: blockers.filter((b) => b.tideFails + b.gapFails + b.outsideFails > 0),
    gapNotes,
    tideRange: { first, last }
  }
}

function windowMeta(
  start: number,
  end: number,
  points: TidePoint[],
  gaps: TideGap[],
  segments: RouteSegment[],
  restPoints: RestPoint[],
  companions: Companion[]
): FeasibleWindow {
  const g = evaluateGroup(points, gaps, segments, restPoints, companions, end)
  return { start, end, latestTurnaround: g.groupTurnaround, latestHome: g.groupHome }
}
