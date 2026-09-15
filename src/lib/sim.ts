import type { PersonTimeline } from './planner'

export type PersonPhase =
  | { kind: 'not-started' }
  | { kind: 'moving'; segIndex: number; frac: number; dir: 'out' | 'back' }
  | { kind: 'rest'; boundary: number }
  | { kind: 'done' }

/** 求某人在时刻 t 的阶段（停留只能发生在已标明的安全点） */
export function positionAt(tl: PersonTimeline, t: number): PersonPhase {
  if (t < tl.depart) return { kind: 'not-started' }
  if (t >= tl.home) return { kind: 'done' }

  for (const s of tl.stays) {
    if (t >= s.t0 && t < s.t1) return { kind: 'rest', boundary: s.boundary }
  }
  for (const c of tl.crossings) {
    if (t >= c.t0 && t < c.t1) {
      const frac = Math.min(1, Math.max(0, (t - c.t0) / (c.t1 - c.t0)))
      return { kind: 'moving', segIndex: c.segIndex, frac, dir: c.dir }
    }
  }
  // 两段之间未安排停留：视为在端点
  return { kind: 'rest', boundary: t < tl.turnaround ? 0 : 0 }
}

/** 沿剖面进度 0..1（0 = 出发岸，1 = 折返点） */
export function progressOf(ph: PersonPhase, segCount: number): number | null {
  switch (ph.kind) {
    case 'moving':
      if (ph.dir === 'out') return (ph.segIndex + ph.frac) / segCount
      return (segCount - ph.segIndex - ph.frac) / segCount
    case 'rest':
      return ph.boundary / segCount
    case 'done':
      return 0
    default:
      return null
  }
}
