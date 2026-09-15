<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { store, usePlan } from './lib/store'
import { evaluateGroup } from './lib/planner'
import { fmtClock } from './lib/tide'
import TideEditor from './components/TideEditor.vue'
import RouteEditor from './components/RouteEditor.vue'
import ResultPanel from './components/ResultPanel.vue'
import ProfileChart from './components/ProfileChart.vue'
import PrintCard from './components/PrintCard.vue'

const s = store.state
const { report } = usePlan()

const tab = ref<'tide' | 'route'>('tide')
onMounted(() => {
  store.init()
  window.addEventListener('keydown', (e) => {
    const z = e.key.toLowerCase() === 'z'
    if ((e.ctrlKey || e.metaKey) && z && !e.shiftKey) {
      e.preventDefault()
      store.undo()
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && z))) {
      e.preventDefault()
      store.redo()
    }
  })
})

const rangeMin = computed(() => report.value.tideRange?.first ?? 0)
const rangeMax = computed(() => report.value.tideRange?.last ?? 1440)

/** 生效出发时刻：未选时跟随首个可行区间起点；越界则夹回已抄录区间 */
const departure = computed(() => {
  if (report.value.setupError) return s.selectedDeparture >= 0 ? s.selectedDeparture : 0
  const d = s.selectedDeparture
  if (d >= rangeMin.value && d <= rangeMax.value) return d
  if (report.value.windows.length) return report.value.windows[0].start
  return rangeMin.value
})

function setDeparture(v: number) {
  store.setSilently(() => {
    s.selectedDeparture = v
  })
}

const group = computed(() => {
  if (report.value.setupError) return null
  return evaluateGroup(
    s.tidePoints,
    s.tideGaps,
    s.segments,
    s.restPoints,
    s.companions,
    departure.value
  )
})

// 时间游标：跟随出发时刻/最先吃紧峰值，也可自行拖动
const cursor = ref(0)
watch(
  [departure, () => group.value?.binding?.crossing.peakAt],
  ([d, peak]) => {
    cursor.value = typeof peak === 'number' ? peak : d
  },
  { immediate: true }
)
const cursorMin = computed(() => (group.value ? group.value.departure - 10 : 0))
const cursorMax = computed(() => (group.value ? group.value.groupHome + 10 : 1440))

function beginEdit() {
  store.snapshot()
}
function commitSetting(fn: () => void) {
  store.setSilently(fn)
}

function num(e: Event) {
  return Number((e.target as HTMLInputElement).value)
}

function doPrint() {
  window.print()
}

function confirmReset() {
  if (window.confirm('确定清空全部本地数据？此操作可用撤销恢复。')) store.resetAll()
}

/** 是否处在可编辑元素中：交给浏览器原生撤销，不做数据级撤销 */
function inEditable(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

function onKeyDown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  const undo = key === 'z' && !e.shiftKey
  const redo = key === 'y' || (key === 'z' && e.shiftKey)
  if (!undo && !redo) return
  // 按住连发只处理第一下，避免一次按住连退多步
  if (e.repeat) return
  // 输入框/文本域内不拦截，交给浏览器原生撤销
  if (inEditable(e.target)) return
  e.preventDefault()
  if (undo) store.undo()
  else store.redo()
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div v-if="!store.ready" class="subtle">正在从本机读取上次进度…</div>

  <div class="no-print">
    <div class="row" style="justify-content: space-between; align-items: flex-end">
      <div>
        <h1>潮滩返程窗口核对</h1>
        <p class="subtle" style="margin: 2px 0 0">
          结伴赶海专用：按最慢同行者核验去返全程，浅沟涨潮截断前必须通过。数据仅保存在本浏览器。
        </p>
      </div>
      <div class="row">
        <button class="small" :disabled="!store.canUndo" title="Ctrl+Z" @click="store.undo()">↶ 撤销误录</button>
        <button class="small" :disabled="!store.canRedo" title="Ctrl+Y" @click="store.redo()">↷ 重做</button>
        <button class="small" @click="store.loadSample()">载入示例</button>
        <button class="small danger" @click="confirmReset">
          清空
        </button>
      </div>
    </div>

    <div class="panel" @focusin="beginEdit">
      <h2>地点与备注</h2>
      <div class="grid2">
        <label class="inline">
          地点
          <input
            class="wide"
            type="text"
            :value="s.settings.place"
            @input="commitSetting(() => (s.settings.place = ($event.target as HTMLInputElement).value))"
          />
        </label>
        <label class="inline">
          备注
          <input
            class="wide"
            type="text"
            :value="s.settings.note"
            @input="commitSetting(() => (s.settings.note = ($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
    </div>

    <div class="panel">
      <div class="tabs">
        <button :class="{ active: tab === 'tide' }" @click="tab = 'tide'">① 潮汐抄录</button>
        <button :class="{ active: tab === 'route' }" @click="tab = 'route'">
          ② 路线 · 安全点 · 同行者
        </button>
      </div>
      <TideEditor v-if="tab === 'tide'" />
      <RouteEditor v-else />
    </div>

    <template v-if="group">
      <div class="panel">
        <ResultPanel
          :report="report"
          :group="group"
          :segments="s.segments"
          :departure="departure"
          :range-min="rangeMin"
          :range-max="rangeMax"
          @update:departure="setDeparture"
        />
      </div>

      <div class="panel">
        <h2>图示核验：位置 · 潮位 · 最先关闭路段</h2>
        <div class="slider-wrap">
          <input
            type="range"
            :min="cursorMin"
            :max="cursorMax"
            step="1"
            v-model.number="cursor"
          />
          <div class="row" style="justify-content: space-between">
            <span class="subtle">观察时刻</span>
            <span><b>{{ fmtClock(cursor) }}</b></span>
            <span class="subtle">
              <button class="small" @click="cursor = group.binding?.crossing.peakAt ?? cursor">
                跳到最先关闭时刻
              </button>
            </span>
          </div>
        </div>

        <ProfileChart
          :group="group"
          :segments="s.segments"
          :rest-points="s.restPoints"
          :points="s.tidePoints"
          :gaps="s.tideGaps"
          :cursor="cursor"
        />
        <div class="legend" style="margin-top: 8px">
          <span><i style="background: #3f9d6a"></i>净空充足</span>
          <span><i style="background: #d98a3d"></i>余量 ≤15cm 吃紧</span>
          <span><i style="background: #a32c2c"></i>已截断</span>
          <span><i style="background: url('') #8d7bb5"></i>数据缺口</span>
          <span><i style="background: #e8c25a; border-radius: 50%"></i>安全点停留</span>
        </div>
      </div>
    </template>

    <div v-else-if="report.setupError" class="panel">
      <div class="callout warn">
        <b>{{ report.setupError }}</b>
        <div class="subtle" style="margin-top: 4px">
          请先在上方两个标签页补齐数据；所有结论都会在数据改动后自动重算，旧结论立即作废。
        </div>
      </div>
    </div>
  </div>

  <div v-if="group" class="panel" style="margin-top: 16px">
    <div class="row no-print" style="justify-content: space-between">
      <h2 style="margin: 0">同行核对卡（可打印随身携带）</h2>
      <button class="primary" @click="doPrint()">打印核对卡</button>
    </div>
    <PrintCard :state="s" :group="group" :departure="departure" />
  </div>
</template>
