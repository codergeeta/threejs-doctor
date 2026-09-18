export function instancedBufferBytes(obj: Record<string, unknown>): number | undefined {
  if (obj.isInstancedMesh !== true) return undefined
  let bytes = 0
  let known = false
  const matrix = obj.instanceMatrix as { array?: { byteLength?: unknown }; count?: unknown } | undefined
  if (typeof matrix?.array?.byteLength === 'number') {
    bytes += matrix.array.byteLength
    known = true
  } else if (typeof obj.count === 'number' && obj.count >= 0) {
    bytes += obj.count * 16 * 4
    known = true
  }
  const color = obj.instanceColor as { array?: { byteLength?: unknown } } | undefined
  if (typeof color?.array?.byteLength === 'number') {
    bytes += color.array.byteLength
    known = true
  }
  return known ? bytes : undefined
}

interface LeakRecord {
  bytes: number
  disposed: boolean
  leaked: boolean
}

/**
 * Tracks InstancedMesh objects that leave the scene graph without dispose().
 * Summing buffers still in the graph cannot see that leak: removal lowers the total.
 */
export class InstanceLeakTracker {
  private readonly known = new Map<object, LeakRecord>()
  private readonly alive = new Set<object>()

  beginScan(): void {
    this.alive.clear()
  }

  watch(obj: Record<string, unknown>): void {
    if (obj.isInstancedMesh !== true) return
    let rec = this.known.get(obj)
    if (!rec) {
      rec = { bytes: instancedBufferBytes(obj) ?? 0, disposed: false, leaked: false }
      this.known.set(obj, rec)
      if (typeof obj.addEventListener === 'function') {
        try {
          obj.addEventListener('dispose', () => {
            rec!.disposed = true
            rec!.leaked = false
          })
          obj.addEventListener('removed', () => {
            if (!rec!.disposed) rec!.leaked = true
          })
        } catch {
          // Host objects may not implement EventDispatcher.
        }
      }
    } else {
      rec.bytes = instancedBufferBytes(obj) ?? rec.bytes
    }
    this.alive.add(obj)
  }

  endScan(): void {
    for (const [obj, rec] of this.known) {
      if (this.alive.has(obj)) {
        rec.leaked = false
        continue
      }
      if (!rec.disposed) rec.leaked = true
    }
  }

  snapshot(): { count: number; bytes: number } {
    let count = 0
    let bytes = 0
    for (const rec of this.known.values()) {
      if (!rec.leaked) continue
      count += 1
      bytes += rec.bytes
    }
    return { count, bytes }
  }
}
