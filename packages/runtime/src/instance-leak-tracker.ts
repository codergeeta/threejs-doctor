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
  ref: WeakRef<object>
  bytes: number
  disposed: boolean
  leaked: boolean
  missingScans: number
}

const LEAK_AFTER_MISSING_SCANS = 2

/**
 * Tracks InstancedMesh objects that leave the scene graph without dispose().
 * Summing buffers still in the graph cannot see that leak: removal lowers the total.
 *
 * Holds WeakRefs so a Doctor instance does not pin pooled meshes. `added` clears a
 * detach; a mesh must be missing for two scans (pooling grace) before it counts as a leak.
 */
export class InstanceLeakTracker {
  private readonly known: LeakRecord[] = []
  private readonly alive = new Set<object>()

  private recordFor(obj: object): LeakRecord | undefined {
    this.prune()
    for (const rec of this.known) {
      if (rec.ref.deref() === obj) return rec
    }
    return undefined
  }

  private prune(): void {
    for (let i = this.known.length - 1; i >= 0; i--) {
      if (this.known[i]!.ref.deref() === undefined) this.known.splice(i, 1)
    }
  }

  beginScan(): void {
    this.alive.clear()
  }

  watch(obj: Record<string, unknown>): void {
    if (obj.isInstancedMesh !== true) return
    let rec = this.recordFor(obj)
    if (!rec) {
      rec = {
        ref: new WeakRef(obj),
        bytes: instancedBufferBytes(obj) ?? 0,
        disposed: false,
        leaked: false,
        missingScans: 0,
      }
      this.known.push(rec)
      if (typeof obj.addEventListener === 'function') {
        try {
          obj.addEventListener('dispose', () => {
            rec!.disposed = true
            rec!.leaked = false
            rec!.missingScans = 0
          })
          obj.addEventListener('added', () => {
            rec!.leaked = false
            rec!.missingScans = 0
          })
        } catch {
          // Host objects may not implement EventDispatcher.
        }
      }
    } else {
      rec.bytes = instancedBufferBytes(obj) ?? rec.bytes
      rec.missingScans = 0
      rec.leaked = false
    }
    this.alive.add(obj)
  }

  endScan(): void {
    this.prune()
    for (const rec of this.known) {
      const obj = rec.ref.deref()
      if (obj === undefined) continue
      if (this.alive.has(obj)) {
        rec.missingScans = 0
        rec.leaked = false
        continue
      }
      if (rec.disposed) {
        rec.leaked = false
        continue
      }
      rec.missingScans += 1
      rec.leaked = rec.missingScans >= LEAK_AFTER_MISSING_SCANS
    }
  }

  snapshot(): { count: number; bytes: number } {
    this.prune()
    let count = 0
    let bytes = 0
    for (const rec of this.known) {
      if (!rec.leaked) continue
      count += 1
      bytes += rec.bytes
    }
    return { count, bytes }
  }
}
