import type { AppState } from './types'
import { uid } from './id'

/** 内置示例：仅用于快速上手，仍可自由修改。高程/潮高单位均为厘米。 */
export function buildSampleState(): AppState {
  const seg = (
    name: string,
    bedElev: number,
    passElev: number,
    outMin: number,
    outMax: number,
    backMin: number,
    backMax: number
  ) => ({
    id: uid('seg'),
    name,
    bedElev,
    passElev,
    outMin,
    outMax,
    backMin,
    backMax
  })

  return {
    settings: {
      place: '示例：东沙岙北岸潮滩',
      note: '潮高与高程请统一使用同一基准（厘米）。示例数据为演示用，出海前请替换为当地当日发布数据。'
    },
    tidePoints: [
      { id: uid('tp'), t: 360, h: 200 },
      { id: uid('tp'), t: 420, h: 150 },
      { id: uid('tp'), t: 480, h: 80 },
      { id: uid('tp'), t: 540, h: 30 },
      { id: uid('tp'), t: 600, h: -20 },
      { id: uid('tp'), t: 660, h: 0 },
      { id: uid('tp'), t: 720, h: 50 },
      { id: uid('tp'), t: 780, h: 120 },
      { id: uid('tp'), t: 840, h: 190 },
      { id: uid('tp'), t: 900, h: 250 },
      { id: uid('tp'), t: 960, h: 300 }
    ],
    tideGaps: [],
    segments: [
      seg('堤下光滩', 5, 120, 12, 20, 15, 25),
      seg('头道浅沟', -40, 65, 8, 15, 10, 18),
      seg('蛎礁斜坡', 10, 100, 12, 22, 15, 26),
      seg('外浅沟', -50, 50, 8, 14, 10, 18)
    ],
    restPoints: [
      { id: uid('rp'), boundary: 2, stayOut: 10, stayBack: 8, note: '土台（可落脚等候）' },
      { id: uid('rp'), boundary: 4, stayOut: 40, stayBack: 0, note: '采挖点（折返点）' }
    ],
    companions: [
      { id: uid('c'), name: '老周', pace: 0.35, margin: 15 },
      { id: uid('c'), name: '老吴', pace: 0.8, margin: 25 },
      { id: uid('c'), name: '阿婆', pace: 1, margin: 20 }
    ],
    selectedDeparture: -1
  }
}
