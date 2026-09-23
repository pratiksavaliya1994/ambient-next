/**
 * Splits `items` into `columnCount` contiguous groups whose weights are as
 * even as possible, minimising the heaviest group's total weight (the "book
 * allocation" problem). CSS multi-column layout forces every column to the
 * same height, so one tall, unsplittable card sets the height for the whole
 * row and leaves lighter columns full of empty space underneath — this is
 * what lets a caller bucket by estimated height instead and avoid that.
 */
export function balancedColumns<T>(items: T[], weights: number[], columnCount: number): T[][] {
  if (items.length === 0 || columnCount <= 1) {
    return [items]
  }

  const columnsNeeded = (maxWeight: number) => {
    let columns = 1
    let current = 0
    for (const weight of weights) {
      if (current + weight > maxWeight && current > 0) {
        columns++
        current = weight
      } else {
        current += weight
      }
    }
    return columns
  }

  let lo = Math.max(...weights)
  let hi = weights.reduce((sum, weight) => sum + weight, 0)
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (columnsNeeded(mid) <= columnCount) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  const columns: T[][] = []
  let current: T[] = []
  let currentWeight = 0
  for (let i = 0; i < items.length; i++) {
    if (currentWeight + weights[i] > lo && current.length > 0) {
      columns.push(current)
      current = []
      currentWeight = 0
    }
    current.push(items[i])
    currentWeight += weights[i]
  }
  if (current.length > 0) {
    columns.push(current)
  }

  return columns
}
