let counter = 0

/** 生成本地唯一 ID（带随机后缀，避免不同标签页冲突） */
export function uid(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random()
    .toString(36)
    .slice(2, 7)}`
}
