import type { TideGap, TidePoint } from './types'

export interface TideSource {
  points: TidePoint[]
  gaps: TideGap[]
}

export type TideResult =
  | { ok: true; h: number }
  | { ok: false; reason: 'outside' | 'gap'; at: number }

/** 排序后的潮点（不修改原数组） */
export function sortedPoints(points: TidePoint[]): TidePoint[] {
  return [...points].sort((a, b) => a.t - b.t)
}

/** 潮点时刻是否合法（需有至少两个点、时刻互异） */
export function validatePoints(points: TidePoint[]): string | null {
  if (points.length === 0) return '尚未抄录任何潮高时刻点'
  if (points.length < 2) return '至少需要两个潮点才能线性插值'
  const sp = sortedPoints(points)
  for (let i = 1; i < sp.length; i++) {
    if (sp[i].t === sp[i - 1].t) return `存在重复时刻：${fmtClock(sp[i].t)}`
  }
  return null
}

/** 潮位插值：仅在相邻已发布潮点之间线性插值；区间外一律不推算 */
export function tideAt(src: TideSource, t: number): TideResult {
  const sp = sortedPoints(src.points)
  if (sp.length < 2) return { ok: false, reason: 'outside', at: t }
  const first = sp[0].t
  const last = sp[sp.length - 1].t
  // 严格不向区间外推算（端点本身可用）
  if (t < first || t > last) return { ok: false, reason: 'outside', at: t }
  for (const g of src.gaps) {
    if (t >= g.start && t <= g.end) return { ok: false, reason: 'gap', at: t }
  }
  // 找相邻两点
  let lo = sp[0]
  let hi = sp[sp.length - 1]
  for (let i = 0; i < sp.length - 1; i++) {
    if (t >= sp[i].t && t <= sp[i + 1].t) {
      lo = sp[i]
      hi = sp[i + 1]
      break
    }
  }
  if (lo.t === hi.t) return { ok: true, h: lo.h }
  if (t === lo.t) return { ok: true, h: lo.h }
  if (t === hi.t) return { ok: true, h: hi.h }
  const r = (t - lo.t) / (hi.t - lo.t)
  return { ok: true, h: lo.h + (hi.h - lo.h) * r }
}

export interface MaxTideResult {
  max: number
  /** 取得最高潮位的时刻 */
  at: number
}

/**
 * 时段内最高潮位。潮位在相邻潮点间为线性，
 * 故最高值只可能出现在时段端点或落入时段内部的潮点时刻。
 * 任一处落在缺口/区间外即阻断，返回最早阻断时刻。
 */
export function maxTideOver(
  src: TideSource,
  t0: number,
  t1: number
): MaxTideResult | { blocked: true; reason: 'outside' | 'gap'; at: number } {
  const a = Math.min(t0, t1)
  const b = Math.max(t0, t1)
  // 与显式缺口相交即阻断
  for (const g of src.gaps) {
    if (g.end >= a && g.start <= b) {
      return { blocked: true, reason: 'gap', at: Math.max(a, g.start) }
    }
  }
  const sp = sortedPoints(src.points)
  const samples: number[] = [a, b]
  for (const p of sp) {
    if (p.t > a && p.t < b) samples.push(p.t)
  }
  let max = -Infinity
  let at = a
  for (const s of samples) {
    const r = tideAt(src, s)
    if (!r.ok) return { blocked: true, reason: r.reason, at: r.at }
    if (r.h > max) {
      max = r.h
      at = s
    }
  }
  return { max, at }
}

/** 分钟数格式化为 HH:MM（跨日自动 +1 日标记由 fmtClockDay 处理） */
export function fmtClock(t: number): string {
  const tt = Math.round(t)
  const day = Math.floor(tt / 1440)
  const m = ((tt % 1440) + 1440) % 1440
  const hh = Math.floor(m / 60)
  const mm = m % 60
  const base = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  return day > 0 ? `${base}(+${day}日)` : base
}

export function fmtDur(min: number): string {
  const m = Math.round(min)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}分`
  return r === 0 ? `${h}时` : `${h}时${r}分`
}

/** "HH:MM" 或 "HH:MM(+1日)" 解析为分钟；失败返回 null */
export function parseClock(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{1,2})(?:\(\+(\d+)日\))?$/)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  const day = m[3] ? Number(m[3]) : 0
  if (h > 23 || mm > 59) return null
  return day * 1440 + h * 60 + mm
}
