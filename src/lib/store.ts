import { computed, reactive, watch } from 'vue'
import type { AppState } from './types'
import { emptyState } from './types'
import { loadState, saveState } from './db'
import { buildSampleState } from './sample'
import { buildPlanReport } from './planner'
import { uid } from './id'

const MAX_HISTORY = 50

class Store {
  state = reactive<AppState>(emptyState())
  ready = false
  private past: AppState[] = []
  private future: AppState[] = []
  private suppressHistory = false

  async init() {
    if (this.ready) return
    const loaded = await loadState()
    Object.assign(this.state, loaded)
    this.ready = true
    // 持久化：本地潮汐抄录、路线与进度只写入浏览器 IndexedDB
    watch(
      this.state,
      (v) => {
        saveState(clone(v))
      },
      { deep: true }
    )
  }

  loadSample() {
    this.commit(() => {
      Object.assign(this.state, buildSampleState())
    })
  }

  resetAll() {
    this.commit(() => {
      Object.assign(this.state, emptyState())
    })
  }

  /** 带撤销快照地执行一次修改 */
  commit(fn: () => void) {
    if (this.suppressHistory) {
      fn()
      return
    }
    this.pushSnapshot()
    this.future = []
    fn()
  }

  /** 编辑开始前拍快照（输入框聚焦时）；与上一快照内容相同则不重复入栈 */
  snapshot() {
    this.pushSnapshot()
    this.future = []
  }

  private pushSnapshot() {
    const cur = JSON.stringify(this.state)
    const last = this.past[this.past.length - 1]
    if (last && JSON.stringify(last) === cur) return
    this.past.push(clone(this.state))
    if (this.past.length > MAX_HISTORY) this.past.shift()
  }

  /** 拖动滑块等高频更新：不入撤销栈但仍持久化 */
  setSilently(fn: () => void) {
    this.suppressHistory = true
    try {
      fn()
    } finally {
      this.suppressHistory = false
    }
  }

  undo() {
    const prev = this.past.pop()
    if (!prev) return
    this.future.push(clone(this.state))
    this.setSilently(() => Object.assign(this.state, prev))
  }

  redo() {
    const next = this.future.pop()
    if (!next) return
    this.past.push(clone(this.state))
    this.setSilently(() => Object.assign(this.state, next))
  }

  get canUndo() {
    return this.past.length > 0
  }
  get canRedo() {
    return this.future.length > 0
  }

  // —— 便捷编辑动作（全部经 commit，可撤销） ——
  addTidePoint() {
    this.commit(() => {
      const last = this.state.tidePoints[this.state.tidePoints.length - 1]
      this.state.tidePoints.push({
        id: uid('tp'),
        t: last ? last.t + 60 : 360,
        h: 100
      })
    })
  }
  removeTidePoint(id: string) {
    this.commit(() => {
      this.state.tidePoints = this.state.tidePoints.filter((p) => p.id !== id)
    })
  }
  addGap() {
    this.commit(() => {
      this.state.tideGaps.push({ id: uid('gap'), start: 600, end: 660, note: '' })
    })
  }
  removeGap(id: string) {
    this.commit(() => {
      this.state.tideGaps = this.state.tideGaps.filter((g) => g.id !== id)
    })
  }
  addSegment() {
    this.commit(() => {
      this.state.segments.push({
        id: uid('seg'),
        name: `第 ${this.state.segments.length + 1} 段`,
        bedElev: 0,
        passElev: 80,
        outMin: 10,
        outMax: 20,
        backMin: 12,
        backMax: 24
      })
    })
  }
  removeSegment(id: string) {
    this.commit(() => {
      const idx = this.state.segments.findIndex((s) => s.id === id)
      this.state.segments = this.state.segments.filter((s) => s.id !== id)
      // 删除第 idx 段后，端点 idx 与 idx+1 合并：
      // b<idx 不变；b==idx 保留；b==idx+1 并入 idx；b>idx+1 左移一位
      this.state.restPoints = this.state.restPoints
        .map((r) => {
          if (idx < 0) return r
          if (r.boundary === idx + 1) return { ...r, boundary: idx }
          if (r.boundary > idx + 1) return { ...r, boundary: r.boundary - 1 }
          return r
        })
    })
  }
  addRestPoint() {
    this.commit(() => {
      this.state.restPoints.push({
        id: uid('rp'),
        boundary: Math.min(1, this.state.segments.length),
        stayOut: 5,
        stayBack: 5,
        note: ''
      })
    })
  }
  removeRestPoint(id: string) {
    this.commit(() => {
      this.state.restPoints = this.state.restPoints.filter((r) => r.id !== id)
    })
  }
  addCompanion() {
    this.commit(() => {
      this.state.companions.push({
        id: uid('c'),
        name: `同行者${this.state.companions.length + 1}`,
        pace: 0.5,
        margin: 20
      })
    })
  }
  removeCompanion(id: string) {
    this.commit(() => {
      this.state.companions = this.state.companions.filter((c) => c.id !== id)
    })
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export const store = reactive(new Store()) as Store

/** 结论随潮点/路线改变自动重算（旧结论不缓存，即“改变即废止”） */
export function usePlan() {
  const report = computed(() =>
    buildPlanReport(
      store.state.tidePoints,
      store.state.tideGaps,
      store.state.segments,
      store.state.restPoints,
      store.state.companions
    )
  )
  return { report }
}
