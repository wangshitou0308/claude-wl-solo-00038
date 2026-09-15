<script setup lang="ts">
import { store } from '../lib/store'

const s = store.state

function begin() {
  store.snapshot()
}
function commit(fn: () => void) {
  store.setSilently(fn)
}
function num(e: Event): number {
  return Number((e.target as HTMLInputElement).value)
}
</script>

<template>
  <div @focusin="begin">
    <h2>路线分段（从岸到折返点依次排列）</h2>
    <p class="subtle">
      “可通行高程”是安全阈值：穿越该段期间必须满足
      <b>潮高 + 个人安全余量 &lt; 可通行高程</b>。耗时按各人步速在“快—慢”范围内取值。
    </p>
    <div style="overflow-x: auto">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>段名（如头道浅沟）</th>
            <th>沟床高程(cm)</th>
            <th>通行高程(cm)</th>
            <th>去程 快–慢(分)</th>
            <th>返程 快–慢(分)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(seg, i) in s.segments" :key="seg.id">
            <td>{{ i + 1 }}</td>
            <td>
              <input
                type="text"
                :value="seg.name"
                @input="commit(() => (seg.name = ($event.target as HTMLInputElement).value))"
              />
            </td>
            <td>
              <input
                type="number"
                :value="seg.bedElev"
                @input="commit(() => (seg.bedElev = num($event)))"
              />
            </td>
            <td>
              <input
                type="number"
                :value="seg.passElev"
                @input="commit(() => (seg.passElev = num($event)))"
              />
            </td>
            <td>
              <input
                type="number"
                :value="seg.outMin"
                @input="commit(() => (seg.outMin = num($event)))"
              />
              –
              <input
                type="number"
                :value="seg.outMax"
                @input="commit(() => (seg.outMax = num($event)))"
              />
            </td>
            <td>
              <input
                type="number"
                :value="seg.backMin"
                @input="commit(() => (seg.backMin = num($event)))"
              />
              –
              <input
                type="number"
                :value="seg.backMax"
                @input="commit(() => (seg.backMax = num($event)))"
              />
            </td>
            <td>
              <button class="small danger" @click="store.removeSegment(seg.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button class="small" style="margin-top: 8px" @click="store.addSegment()">＋ 添加分段</button>

    <h2 style="margin-top: 20px">安全点 / 休息点</h2>
    <p class="subtle">
      全组停留<b>只允许</b>发生在这里标明的安全点（端点 {{ 0 }} 为出发岸，{{ s.segments.length }}
      为折返点）。未标明的沟中、滩面一律不得停留等候。
    </p>
    <table>
      <thead>
        <tr>
          <th>位置（端点）</th>
          <th>去程停留(分)</th>
          <th>返程停留(分)</th>
          <th>名称/说明</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in s.restPoints" :key="r.id">
          <td>
            <select
              :value="r.boundary"
              @change="commit(() => (r.boundary = Number(($event.target as HTMLSelectElement).value)))"
            >
              <option v-for="b in s.segments.length + 1" :key="b - 1" :value="b - 1">
                端点 {{ b - 1
                }}{{ b - 1 === 0 ? '（出发岸）' : b - 1 === s.segments.length ? '（折返点）' : '' }}
              </option>
            </select>
          </td>
          <td>
            <input
              type="number"
              min="0"
              :value="r.stayOut"
              @input="commit(() => (r.stayOut = Math.max(0, num($event))))"
            />
          </td>
          <td>
            <input
              type="number"
              min="0"
              :value="r.stayBack"
              @input="commit(() => (r.stayBack = Math.max(0, num($event))))"
            />
          </td>
          <td>
            <input
              type="text"
              :value="r.note"
              @input="commit(() => (r.note = ($event.target as HTMLInputElement).value))"
            />
          </td>
          <td>
            <button class="small danger" @click="store.removeRestPoint(r.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <button
      class="small"
      style="margin-top: 8px"
      :disabled="s.segments.length === 0"
      @click="store.addRestPoint()"
    >
      ＋ 添加安全点
    </button>

    <h2 style="margin-top: 20px">同行者（按最慢耗时核验全组）</h2>
    <table>
      <thead>
        <tr>
          <th>称呼</th>
          <th>步速（左快 右慢）</th>
          <th>涉水安全余量(cm)</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in s.companions" :key="c.id">
          <td>
            <input
              type="text"
              :value="c.name"
              @input="commit(() => (c.name = ($event.target as HTMLInputElement).value))"
            />
          </td>
          <td style="min-width: 220px">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="c.pace"
              @input="commit(() => (c.pace = num($event)))"
            />
            <span class="subtle">{{ Math.round(c.pace * 100) }}%</span>
          </td>
          <td>
            <input
              type="number"
              min="0"
              :value="c.margin"
              @input="commit(() => (c.margin = Math.max(0, num($event))))"
            />
          </td>
          <td>
            <button
              class="small danger"
              :disabled="s.companions.length <= 1"
              @click="store.removeCompanion(c.id)"
            >
              删除
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <button class="small" style="margin-top: 8px" @click="store.addCompanion()">
      ＋ 添加同行者
    </button>
  </div>
</template>
