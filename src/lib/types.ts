// 核心数据类型：潮点、缺口、路线、同行者、设置

/** 当地发布的潮高时刻点（分钟为自当日 00:00 起的绝对分钟数） */
export interface TidePoint {
  id: string
  /** 自当地当日 00:00 起的分钟数，可跨日（>1440） */
  t: number
  /** 潮高，单位与“可通行高程”一致（厘米） */
  h: number
}

/** 潮汐数据缺口：该区段不插值，任何行程触及即阻断 */
export interface TideGap {
  id: string
  /** 起（含，分钟） */
  start: number
  /** 止（含，分钟） */
  end: number
  note: string
}

/** 路线分段：沿潮滩从岸到目的地依次排列 */
export interface RouteSegment {
  id: string
  name: string
  /** 沟床/滩面高程（厘米），仅用于剖面图绘制 */
  bedElev: number
  /** 可通行高程（厘米阈值）：潮高 + 个人余量 < 此值才可通过 */
  passElev: number
  /** 去程耗时范围 [快, 慢]（分钟） */
  outMin: number
  outMax: number
  /** 返程耗时范围 [快, 慢]（分钟） */
  backMin: number
  backMax: number
}

/** 休息点（即标明的安全点）：位于分段端点（0 = 出发岸，n = 目的地） */
export interface RestPoint {
  id: string
  /** 分段端点序号，0..segments.length */
  boundary: number
  /** 去程在此停留分钟（全组会合） */
  stayOut: number
  /** 返程在此停留分钟 */
  stayBack: number
  note: string
}

/** 同行者 */
export interface Companion {
  id: string
  name: string
  /** 步速系数 0(快)..1(慢)，在 [min,max] 间线性取值 */
  pace: number
  /** 个人涉水安全余量（厘米），与潮高相加后比对通行高程 */
  margin: number
}

export interface Settings {
  /** 出发岸/地点名称 */
  place: string
  /** 备注 */
  note: string
}

export interface AppState {
  tidePoints: TidePoint[]
  tideGaps: TideGap[]
  segments: RouteSegment[]
  restPoints: RestPoint[]
  companions: Companion[]
  settings: Settings
  /** 选择的出发时刻（绝对分钟），-1 表示跟随首个可出发区间起点 */
  selectedDeparture: number
}

export function emptyState(): AppState {
  return {
    tidePoints: [],
    tideGaps: [],
    segments: [],
    restPoints: [],
    companions: [
      { id: 'c1', name: '同行者一', pace: 0.5, margin: 15 },
      { id: 'c2', name: '同行者二', pace: 1, margin: 20 }
    ],
    settings: { place: '', note: '' },
    selectedDeparture: -1
  }
}
