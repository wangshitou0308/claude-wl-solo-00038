// 撤销历史的单步语义测试（不依赖 DOM/IndexedDB，不调用 init）
import { store } from '../src/lib/store'

store.resetAll()
// resetAll 会 push 一个快照，清干净再测
;(store as any).past = []
;(store as any).future = []

const h0 = JSON.stringify(store.state)

// A) 只聚焦不改值：不应产生撤销步
store.snapshot()
store.setSilently(() => {})
console.assert((store as any).past.length === 0, 'bare focus must not create history')
console.assert(store.canUndo === false, 'nothing to undo after focus-only')

// B) 聚焦后连续键入（多次 setSilently）应只产生一个撤销步
store.snapshot()
store.setSilently(() => {
  store.state.settings.place = '东'
})
store.setSilently(() => {
  store.state.settings.place = '东沙'
})
store.setSilently(() => {
  store.state.settings.place = '东沙岙'
})
console.assert((store as any).past.length === 1, 'one edit session = one undo step')
store.undo()
console.assert(JSON.stringify(store.state) === h0, 'single undo restores pre-edit state')
console.assert(store.state.settings.place === '', 'place should be empty after undo')

// C) 离散操作（载入示例 → 清空）各占一步，一次撤销只退一步
store.loadSample()
const afterSample = JSON.stringify(store.state)
console.assert(afterSample !== h0, 'sample changes state')
store.resetAll()
console.assert(JSON.stringify(store.state) === h0, 'reset restores empty')
console.assert((store as any).past.length >= 2, 'two discrete steps')
store.undo()
console.assert(JSON.stringify(store.state) === afterSample, 'one undo after reset brings sample back, not more')

// D) 撤销后可重做回来
store.redo()
console.assert(JSON.stringify(store.state) === h0, 'redo returns to post-reset state')

// E) 空栈撤销必须是无操作（不能抛出或改状态）
;(store as any).past = []
;(store as any).future = []
store.undo()
console.assert(JSON.stringify(store.state) === h0, 'undo with empty stack is a no-op')

console.log('HISTORY CHECKS PASSED')
