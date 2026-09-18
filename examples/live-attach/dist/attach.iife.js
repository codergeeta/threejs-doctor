/* @threejs-doctor/live-attach-example unpublished. Paste into DevTools. Do not invent metrics. */
"use strict";
(() => {
  // ../ocean-adapter/src/pelagic-adapter.ts
  var ADAPTER_ID = "ocean-pelagic";
  var FULL_CAPABILITIES = [
    "fftSize",
    "rtScale",
    "meshLod",
    "deferredHdr",
    "simPassCount"
  ];
  var DESKTOP_RT = {
    reflection: 768,
    refraction: 768,
    causticWide: 1024,
    causticDetail: 1536
  };
  var MESH_LOD = {
    0: { water: [192, 128], terrain: 192, detailCaustics: false },
    1: { water: [288, 256], terrain: 320, detailCaustics: true },
    2: { water: [448, 256], terrain: 432, detailCaustics: true }
  };
  function getPelagicDebug(root = globalThis) {
    return root.pelagic?.debug;
  }
  function createOceanAdapter(debug) {
    const handle = debug ?? void 0;
    let simPassCount;
    if (handle?.runPass) {
      const original = handle.runPass;
      handle.runPass = (...args) => {
        simPassCount = (simPassCount ?? 0) + 1;
        return original.apply(handle, args);
      };
    }
    const available = handle != null && hasOceanSurface(handle);
    return {
      id: ADAPTER_ID,
      capabilities() {
        return available ? [...FULL_CAPABILITIES] : [];
      },
      snapshot() {
        return snapshotKnobs(handle);
      },
      apply(_tier, knobs) {
        if (!handle) return { rollback() {
        } };
        return applyKnobs(handle, knobs);
      },
      readExtras() {
        if (simPassCount === void 0) return {};
        return { simPassCount };
      },
      takeExclusiveControl() {
        if (!handle) return { release() {
        } };
        return takeExclusive(handle);
      }
    };
  }
  function hasOceanSurface(debug) {
    if (debug.cascades?.some((cascade) => cascade != null)) return true;
    return Boolean(
      debug.reflectionTarget || debug.refractionTarget || debug.causticWide || debug.causticDetail
    );
  }
  function snapshotKnobs(debug) {
    if (!debug || !hasOceanSurface(debug)) return {};
    const knobs = {};
    if (debug.cascades) {
      knobs.fftSize = debug.cascades.map((cascade) => cascade?.size ?? 0);
    }
    if (debug.reflectionTarget) {
      knobs.rtScale = debug.reflectionTarget.width / DESKTOP_RT.reflection;
    }
    const bag = debug;
    if (bag.waterSegments) {
      const match = [0, 1, 2].find(
        (lod) => MESH_LOD[lod].water[0] === bag.waterSegments[0] && MESH_LOD[lod].water[1] === bag.waterSegments[1]
      );
      if (match !== void 0) knobs.meshLod = match;
    }
    if (bag.hdrDeferred === true) knobs.deferredHdr = true;
    else if (bag.hdrDeferred === false) knobs.deferredHdr = false;
    return knobs;
  }
  function applyKnobs(debug, knobs) {
    const rollbacks = [];
    try {
      if (knobs.fftSize) rollbacks.push(applyFft(debug, knobs.fftSize));
      if (knobs.rtScale !== void 0) rollbacks.push(applyRtScale(debug, knobs.rtScale));
      if (knobs.meshLod !== void 0) rollbacks.push(applyMeshLod(debug, knobs.meshLod));
      if (knobs.deferredHdr !== void 0) rollbacks.push(applyHdr(debug, knobs.deferredHdr));
      if (knobs.spectrumEveryNFrames !== void 0) {
        rollbacks.push(applySpectrumCadence(debug, knobs.spectrumEveryNFrames));
      }
      if (knobs.effectQuality !== void 0) {
        rollbacks.push(applyEffectQuality(debug, knobs.effectQuality));
      }
    } catch (err) {
      for (let i = rollbacks.length - 1; i >= 0; i--) {
        try {
          rollbacks[i]();
        } catch {
        }
      }
      throw err;
    }
    return {
      rollback() {
        for (let i = rollbacks.length - 1; i >= 0; i--) rollbacks[i]();
      }
    };
  }
  function applySpectrumCadence(debug, everyN) {
    if (everyN === 1) return () => {
    };
    const origUpdate = debug.updateSpectrum;
    const origRunPass = debug.runPass;
    const pause = !Number.isFinite(everyN) || everyN <= 0;
    let frames = 0;
    let skipping = false;
    const due = () => {
      if (pause) return false;
      const run = frames % everyN === 0;
      frames += 1;
      return run;
    };
    if (origUpdate) {
      debug.updateSpectrum = () => {
        if (!due()) {
          skipping = true;
          return;
        }
        skipping = false;
        return origUpdate.call(debug);
      };
    }
    if (origRunPass) {
      debug.runPass = (...args) => {
        if (origUpdate) {
          if (skipping || pause) return;
          return origRunPass.apply(debug, args);
        }
        if (!due()) return;
        return origRunPass.apply(debug, args);
      };
    }
    return () => {
      if (origUpdate) debug.updateSpectrum = origUpdate;
      else delete debug.updateSpectrum;
      if (origRunPass) debug.runPass = origRunPass;
      else delete debug.runPass;
    };
  }
  function isCascadeTouchSafe(cascade) {
    if (cascade == null) return false;
    const bag = cascade;
    if (bag.texture === null) return false;
    if (Object.prototype.hasOwnProperty.call(bag, "framebuffer") && bag.framebuffer === null) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(bag, "pack") && bag.pack === null) return false;
    return true;
  }
  function isRtTouchSafe(target) {
    const bag = target;
    if (bag.texture === null) return false;
    if (Object.prototype.hasOwnProperty.call(bag, "framebuffer") && bag.framebuffer === null) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(bag, "pack") && bag.pack === null) return false;
    return true;
  }
  function applyFft(debug, fftSize) {
    const cascades = debug.cascades;
    if (!cascades) return () => {
    };
    const freezeAll = fftSize.length > 0 && fftSize.every((n) => n === 0);
    const count = freezeAll ? cascades.length : fftSize.length;
    const snaps = Array.from({ length: count }, (_, i) => {
      const cascade = cascades[i];
      return {
        cascade,
        size: cascade?.size,
        update: cascade?.update,
        hadUpdate: cascade != null && Object.prototype.hasOwnProperty.call(cascade, "update")
      };
    });
    const restore = () => {
      snaps.forEach((snap, i) => {
        const cascade = snap.cascade;
        if (!cascade || cascades[i] !== cascade) {
          if (i < cascades.length) cascades[i] = snap.cascade ?? null;
        }
        if (!cascade) return;
        if (snap.hadUpdate && snap.update) cascade.update = snap.update;
        else delete cascade.update;
        if (snap.size === void 0) return;
        if (typeof cascade.resize === "function") {
          try {
            cascade.resize(snap.size);
          } catch {
            cascade.size = snap.size;
          }
        }
      });
    };
    try {
      for (let i = 0; i < count; i++) {
        const n = freezeAll ? 0 : fftSize[i];
        const cascade = cascades[i];
        if (!isCascadeTouchSafe(cascade)) continue;
        if (n === 0) {
          if (typeof cascade.update === "function") {
            cascade.update = () => {
            };
          }
          continue;
        }
        if (typeof cascade.resize === "function") {
          cascade.resize(n);
        }
      }
    } catch (err) {
      restore();
      throw err;
    }
    return restore;
  }
  function applyEffectQuality(debug, value) {
    if (!("effectQuality" in debug) && debug.effectQuality === void 0) return () => {
    };
    const existing = Object.getOwnPropertyDescriptor(debug, "effectQuality");
    Object.defineProperty(debug, "effectQuality", {
      configurable: true,
      enumerable: existing?.enumerable ?? true,
      writable: true,
      value
    });
    return () => {
      if (existing) {
        Object.defineProperty(debug, "effectQuality", existing);
        return;
      }
      delete debug.effectQuality;
    };
  }
  function applyRtScale(debug, scale) {
    const ops = [];
    try {
      scaleRt(debug.reflectionTarget, "reflectionTarget", DESKTOP_RT.reflection, scale, ops);
      scaleRt(debug.refractionTarget, "refractionTarget", DESKTOP_RT.refraction, scale, ops);
      scaleRt(debug.causticWide, "causticWide", DESKTOP_RT.causticWide, scale, ops);
      scaleRt(debug.causticDetail, "causticDetail", DESKTOP_RT.causticDetail, scale, ops);
    } catch (err) {
      for (let i = ops.length - 1; i >= 0; i--) {
        try {
          ops[i]();
        } catch {
        }
      }
      throw err;
    }
    return () => {
      for (let i = ops.length - 1; i >= 0; i--) ops[i]();
    };
  }
  function scaleRt(target, name, desktop, scale, ops) {
    if (target == null) return;
    if (typeof target.setSize !== "function") {
      throw new Error(`setSize missing on ${name}`);
    }
    if (!isRtTouchSafe(target)) return;
    const prevW = target.width;
    const prevH = target.height;
    const bag = target;
    const hadFb = Object.prototype.hasOwnProperty.call(bag, "framebuffer");
    const prevFb = bag.framebuffer;
    const next = Math.round(desktop * scale);
    try {
      target.setSize(next, next);
    } catch {
      return;
    }
    if (!isRtTouchSafe(target)) {
      try {
        target.setSize(prevW, prevH);
      } catch {
      }
      if (hadFb) bag.framebuffer = prevFb;
      return;
    }
    ops.push(() => {
      target.setSize(prevW, prevH);
    });
  }
  function applyMeshLod(debug, _lod) {
    const prevWaterGeom = debug.waterMesh?.geometry;
    const prevTerrainGeom = debug.terrainMesh?.geometry;
    return () => {
      if (debug.waterMesh) {
        if (prevWaterGeom !== void 0) debug.waterMesh.geometry = prevWaterGeom;
        else delete debug.waterMesh.geometry;
      }
      if (debug.terrainMesh) {
        if (prevTerrainGeom !== void 0) debug.terrainMesh.geometry = prevTerrainGeom;
        else delete debug.terrainMesh.geometry;
      }
    };
  }
  function applyHdr(debug, deferred) {
    const bag = debug;
    const had = Object.prototype.hasOwnProperty.call(bag, "hdrDeferred");
    const prev = bag.hdrDeferred;
    bag.hdrDeferred = deferred;
    return () => {
      if (had && prev === true) bag.hdrDeferred = true;
      else if (had && prev === false) bag.hdrDeferred = false;
      else delete bag.hdrDeferred;
    };
  }
  function takeExclusive(debug) {
    const restoreQuality = freezeEffectQuality(debug);
    const loop = debug.dprLoop;
    const prevEnabled = loop?.enabled;
    if (loop) loop.enabled = false;
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        restoreQuality();
        if (loop && prevEnabled !== void 0) loop.enabled = prevEnabled;
      }
    };
  }
  function freezeEffectQuality(debug) {
    const frozen = debug.effectQuality;
    const existing = Object.getOwnPropertyDescriptor(debug, "effectQuality");
    Object.defineProperty(debug, "effectQuality", {
      configurable: true,
      enumerable: existing?.enumerable ?? true,
      get() {
        return frozen;
      },
      set() {
      }
    });
    return () => {
      if (existing) {
        Object.defineProperty(debug, "effectQuality", existing);
        return;
      }
      Object.defineProperty(debug, "effectQuality", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: frozen
      });
    };
  }

  // ../../packages/core/src/types.ts
  var SAFE_PASSES = [
    "dpr-cap",
    "pixel-budget",
    "shadow-budget",
    "postfx-budget",
    "tone-map-lite",
    "anisotropy-cap"
  ];
  var AGGRESSIVE_PASSES = ["distance-cull"];
  function isStaticDemandProfile(profile) {
    return profile === "marketing" || profile === "product";
  }
  function safePassesFor(profile) {
    if (isStaticDemandProfile(profile)) {
      return [...SAFE_PASSES, "frameloop-demand"];
    }
    return [...SAFE_PASSES];
  }

  // ../../packages/core/src/device-probe.ts
  var GL_MAX_TEXTURE_SIZE = 3379;
  var GL_MAX_RENDERBUFFER_SIZE = 34024;
  function classifyTier(input) {
    const score = (input.hardwareConcurrency >= 12 ? 2 : input.hardwareConcurrency >= 8 ? 1 : 0) + (input.maxTextureSize >= 8192 ? 2 : input.maxTextureSize >= 4096 ? 1 : 0) + (input.devicePixelRatio <= 1.5 ? 1 : 0) + (input.webgpu ? 1 : 0);
    if (score >= 5) return "high";
    if (score >= 3) return "mid";
    return "low";
  }
  function assignOptional(caps, partial) {
    if (partial.deviceMemory !== void 0) caps.deviceMemory = partial.deviceMemory;
    if (partial.maxTouchPoints !== void 0) caps.maxTouchPoints = partial.maxTouchPoints;
    if (partial.coarsePointer !== void 0) caps.coarsePointer = partial.coarsePointer;
    if (partial.prefersReducedData !== void 0) {
      caps.prefersReducedData = partial.prefersReducedData;
    }
    if (partial.colorBufferFloat !== void 0) caps.colorBufferFloat = partial.colorBufferFloat;
    if (partial.floatLinear !== void 0) caps.floatLinear = partial.floatLinear;
    if (partial.maxRenderbufferSize !== void 0) {
      caps.maxRenderbufferSize = partial.maxRenderbufferSize;
    }
  }
  function probeDevice(partial = {}) {
    const input = {
      devicePixelRatio: partial.devicePixelRatio ?? 1,
      hardwareConcurrency: partial.hardwareConcurrency ?? 4,
      maxTextureSize: partial.maxTextureSize ?? 2048,
      webgl: partial.webgl ?? false,
      webgpu: partial.webgpu ?? false
    };
    const caps = {
      tier: classifyTier(input),
      maxTextureSize: input.maxTextureSize,
      webgl: input.webgl,
      webgpu: input.webgpu,
      devicePixelRatio: input.devicePixelRatio,
      hardwareConcurrency: input.hardwareConcurrency
    };
    assignOptional(caps, partial);
    return caps;
  }
  function readPositiveParam(gl, constant, fallbackPname) {
    if (typeof gl.getParameter !== "function") return void 0;
    const pname = typeof constant === "number" ? constant : fallbackPname;
    try {
      const value = gl.getParameter(pname);
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    } catch {
      return void 0;
    }
    return void 0;
  }
  function readWebglQualitySignals(gl) {
    if (!gl) return {};
    const signals = {
      colorBufferFloat: Boolean(gl.getExtension("EXT_color_buffer_float")),
      floatLinear: Boolean(gl.getExtension("OES_texture_float_linear"))
    };
    const maxTextureSize = readPositiveParam(gl, gl.MAX_TEXTURE_SIZE, GL_MAX_TEXTURE_SIZE);
    if (maxTextureSize !== void 0) signals.maxTextureSize = maxTextureSize;
    const maxRenderbufferSize = readPositiveParam(
      gl,
      gl.MAX_RENDERBUFFER_SIZE,
      GL_MAX_RENDERBUFFER_SIZE
    );
    if (maxRenderbufferSize !== void 0) signals.maxRenderbufferSize = maxRenderbufferSize;
    return signals;
  }

  // ../../packages/core/src/scene-snapshot.ts
  function snapshotScene(input) {
    const geometryIds = new Set(input.geometries.map((g2) => g2.uuid));
    const materialIds = new Set(input.materials.map((m) => m.uuid));
    const textureIds = new Set(input.textures.map((t) => t.uuid));
    let estimatedVramBytes = 0;
    let maxTextureDimension = 0;
    for (const tex of input.textures) {
      estimatedVramBytes += tex.width * tex.height * tex.bytesPerPixel;
      maxTextureDimension = Math.max(maxTextureDimension, tex.width, tex.height);
    }
    return {
      objectCount: input.objectCount,
      meshCount: input.meshCount,
      geometryCount: geometryIds.size,
      materialCount: materialIds.size,
      textureCount: textureIds.size,
      estimatedVramBytes,
      lightCount: input.lights.length,
      shadowCastingLightCount: input.lights.filter((l) => l.castShadow).length,
      drawCalls: input.drawCalls,
      triangles: input.triangles,
      maxTextureDimension,
      continuousFrameloop: input.continuousFrameloop,
      matrixAutoUpdateCount: input.matrixAutoUpdateCount,
      rendererPixelRatio: input.rendererPixelRatio,
      antialias: input.antialias
    };
  }

  // ../../packages/core/src/metrics-collector.ts
  function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
  }
  var MetricsCollector = class {
    constructor(opts2) {
      this.opts = opts2;
    }
    frameTimesMs = [];
    openStart = null;
    beginFrame(nowMs) {
      this.openStart = nowMs;
    }
    endFrame(nowMs) {
      if (this.openStart === null) return;
      this.frameTimesMs.push(Math.max(0, nowMs - this.openStart));
      this.openStart = null;
    }
    sample() {
      const times = [...this.frameTimesMs].sort((a, b) => a - b);
      const avgFrame = times.length === 0 ? 0 : times.reduce((a, b) => a + b, 0) / times.length;
      const info = this.opts.getRendererInfo();
      const scene = this.opts.getSceneStats();
      const sample = {
        avgFps: avgFrame <= 0 ? 0 : 1e3 / avgFrame,
        p95FrameTimeMs: percentile(times, 95),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        textureCount: scene.textureCount,
        geometryCount: scene.geometryCount,
        lightCount: scene.lightCount,
        shadowCastingLightCount: scene.shadowCastingLightCount
      };
      if (scene.estimatedVramBytes !== void 0) {
        sample.estimatedVramBytes = scene.estimatedVramBytes;
      }
      return sample;
    }
    frameTimes() {
      return this.frameTimesMs;
    }
  };

  // ../../packages/core/src/quality-caps.ts
  var TIER_ORDER = ["potato", "low", "mid", "high"];
  var HYSTERESIS = {
    emergencyP95Ms: 50,
    dropP95Ms: 33.4,
    climbP95Ms: 22,
    dropWindows: 2,
    climbWindows: 3,
    cooldownWindows: 2,
    windowFrames: 90,
    ttfiBudgetMs: 3e3,
    targetFps: 30
  };
  var GENERIC_CAPS = {
    potato: {
      pixelRatio: 1,
      drawingBufferPixels: 12e5,
      shadowCasters: 0,
      postfxOff: true,
      toneMapping: 0,
      anisotropy: 1
    },
    low: {
      pixelRatio: 1.25,
      drawingBufferPixels: 2e6,
      shadowCasters: 1,
      postfxOff: true,
      toneMapping: 1,
      anisotropy: 1
    },
    mid: {
      pixelRatio: 1.5,
      drawingBufferPixels: 27e5,
      postfxOff: false,
      anisotropy: 4
    },
    high: {
      pixelRatio: 2,
      postfxOff: false
    }
  };
  var POTATO_FLOOR_CAPS = {
    pixelRatio: 0.5,
    drawingBufferPixels: 6e5,
    shadowCasters: 0,
    postfxOff: true
  };
  var POTATO_NEAR_MISS_CAPS = {
    pixelRatio: 0.4,
    drawingBufferPixels: 5e5,
    shadowCasters: 0,
    postfxOff: true
  };
  var POTATO_NEAR_MISS_MIN_AVG_FPS = 24;
  var POTATO_HOPELESS_CAPS = {
    pixelRatio: 0.35,
    drawingBufferPixels: 4e5,
    shadowCasters: 0,
    postfxOff: true
  };
  var POTATO_HOPELESS_MAX_AVG_FPS = 10;
  var POTATO_OCEAN_FREEZE_MAX_AVG_FPS = 5;
  var POTATO_OCEAN_FREEZE_FFT_SIZE = [0, 0, 0];
  var POTATO_OCEAN_FREEZE_EFFECT_QUALITY = 0;
  var SPECTRUM_PAUSE_EVERY_N = 0;
  var ADAPTER_KNOBS = {
    potato: {
      fftSize: [64, 0, 0],
      spectrumEveryNFrames: 8,
      deferredHdr: true
    },
    low: {
      fftSize: [128, 128, 128],
      spectrumEveryNFrames: 1,
      rtScale: 0.5,
      meshLod: 1,
      deferredHdr: true
    },
    mid: {
      fftSize: [128, 256, 128],
      spectrumEveryNFrames: 1,
      rtScale: 0.7,
      meshLod: 2,
      deferredHdr: false
    },
    high: {
      fftSize: [128, 256, 128],
      spectrumEveryNFrames: 1,
      rtScale: 1,
      meshLod: 2,
      deferredHdr: false
    }
  };

  // ../../packages/core/src/hysteresis.ts
  function createHysteresisState(init) {
    return {
      tier: init.tier,
      maxTier: init.maxTier,
      phase: init.phase,
      consecutiveSlow: 0,
      consecutiveFast: 0,
      cooldownRemaining: 0
    };
  }
  function stepTier(tier, delta) {
    const i = TIER_ORDER.indexOf(tier);
    const next = Math.max(0, Math.min(TIER_ORDER.length - 1, i + delta));
    return TIER_ORDER[next];
  }
  function rank(tier) {
    return TIER_ORDER.indexOf(tier);
  }
  function evaluateWindow(state, p95FrameTimeMs, opts2 = {}) {
    let cooldownRemaining = state.cooldownRemaining;
    if (opts2.applyFailed) cooldownRemaining = HYSTERESIS.cooldownWindows;
    const atFloor = rank(state.tier) <= 0;
    const atCeiling = rank(state.tier) >= rank(state.maxTier);
    const dropTo = (reason) => {
      if (atFloor) {
        return {
          action: "hold",
          reason: "floor",
          next: {
            ...state,
            consecutiveSlow: 0,
            consecutiveFast: 0,
            cooldownRemaining: HYSTERESIS.cooldownWindows
          }
        };
      }
      return {
        action: "drop",
        reason,
        next: {
          ...state,
          tier: stepTier(state.tier, -1),
          consecutiveSlow: 0,
          consecutiveFast: 0,
          cooldownRemaining: HYSTERESIS.cooldownWindows
        }
      };
    };
    if (p95FrameTimeMs >= HYSTERESIS.emergencyP95Ms) return dropTo("emergency");
    if (opts2.applyFailed && p95FrameTimeMs > HYSTERESIS.dropP95Ms) return dropTo("below-target");
    let consecutiveSlow = state.consecutiveSlow;
    let consecutiveFast = state.consecutiveFast;
    if (p95FrameTimeMs > HYSTERESIS.dropP95Ms) {
      consecutiveSlow += 1;
      consecutiveFast = 0;
    } else if (p95FrameTimeMs <= HYSTERESIS.climbP95Ms) {
      consecutiveFast = cooldownRemaining > 0 ? 0 : consecutiveFast + 1;
      consecutiveSlow = 0;
    } else {
      consecutiveSlow = 0;
      consecutiveFast = 0;
    }
    if (consecutiveSlow >= HYSTERESIS.dropWindows) return dropTo("below-target");
    if (p95FrameTimeMs <= HYSTERESIS.climbP95Ms && consecutiveFast >= HYSTERESIS.climbWindows) {
      if (state.phase !== "runtime") {
        return {
          action: "hold",
          reason: "boot-no-climb",
          next: {
            ...state,
            consecutiveSlow,
            consecutiveFast,
            cooldownRemaining: Math.max(0, cooldownRemaining - 1)
          }
        };
      }
      if (cooldownRemaining > 0) {
        return {
          action: "hold",
          reason: "cooldown",
          next: {
            ...state,
            consecutiveSlow,
            consecutiveFast,
            cooldownRemaining: cooldownRemaining - 1
          }
        };
      }
      if (atCeiling) {
        return {
          action: "hold",
          reason: "ceiling",
          next: {
            ...state,
            consecutiveSlow,
            consecutiveFast: 0,
            cooldownRemaining: 0
          }
        };
      }
      return {
        action: "climb",
        reason: "headroom",
        next: {
          ...state,
          tier: stepTier(state.tier, 1),
          consecutiveSlow: 0,
          consecutiveFast: 0,
          cooldownRemaining: 0
        }
      };
    }
    return {
      action: "hold",
      reason: "neutral",
      next: {
        ...state,
        consecutiveSlow,
        consecutiveFast,
        cooldownRemaining: Math.max(0, cooldownRemaining - 1)
      }
    };
  }

  // ../../packages/core/src/start-tier.ts
  function isMobileSignal(input) {
    if ((input.maxTouchPoints ?? 0) >= 1) return true;
    if (input.coarsePointer === true) return true;
    if (input.deviceMemory !== void 0 && input.deviceMemory <= 8 && input.devicePixelRatio >= 2 && input.hardwareConcurrency <= 8) {
      return true;
    }
    return false;
  }
  function resolveStartTier(caps, opts2 = {}) {
    const deviceMemory = opts2.deviceMemory ?? caps.deviceMemory;
    const maxTouchPoints = opts2.maxTouchPoints ?? caps.maxTouchPoints;
    const coarsePointer = opts2.coarsePointer ?? caps.coarsePointer;
    const colorBufferFloat = opts2.colorBufferFloat ?? caps.colorBufferFloat;
    const floatLinear = opts2.floatLinear ?? caps.floatLinear;
    const devicePixelRatio = opts2.devicePixelRatio ?? caps.devicePixelRatio;
    const hardwareConcurrency = opts2.hardwareConcurrency ?? caps.hardwareConcurrency;
    const webgl = opts2.webgl ?? caps.webgl;
    if (!webgl) {
      throw new Error("webgl required for quality ladder");
    }
    const mobileInput = {
      devicePixelRatio,
      hardwareConcurrency
    };
    if (maxTouchPoints !== void 0) mobileInput.maxTouchPoints = maxTouchPoints;
    if (coarsePointer !== void 0) mobileInput.coarsePointer = coarsePointer;
    if (deviceMemory !== void 0) mobileInput.deviceMemory = deviceMemory;
    const mobile = isMobileSignal(mobileInput);
    if (colorBufferFloat === false) {
      return { startTier: "potato", maxTier: "potato", mobile, noFloatRt: true };
    }
    if (mobile) {
      const potatoClass = deviceMemory === void 0 || deviceMemory <= 4 || hardwareConcurrency <= 4 || floatLinear === false;
      if (potatoClass) {
        return { startTier: "potato", maxTier: "mid", mobile: true, noFloatRt: false };
      }
      return { startTier: "low", maxTier: "mid", mobile: true, noFloatRt: false };
    }
    if (caps.tier === "low") {
      return { startTier: "low", maxTier: "high", mobile: false, noFloatRt: false };
    }
    if (caps.tier === "mid") {
      return { startTier: "mid", maxTier: "high", mobile: false, noFloatRt: false };
    }
    return { startTier: "high", maxTier: "high", mobile: false, noFloatRt: false };
  }

  // ../../packages/core/src/ab-compare.ts
  var LOWER_BETTER = [
    "p95FrameTimeMs",
    "drawCalls",
    "triangles",
    "textureCount",
    "estimatedVramBytes",
    "geometryCount",
    "lightCount",
    "shadowCastingLightCount",
    "gpuFrameTimeMs",
    "drawingBufferPixels"
  ];
  var HIGHER_BETTER = ["avgFps"];
  function claimAbDelta(before, after, band, direction) {
    const threshold = Math.max(band.abs, Math.abs(before) * band.rel);
    const delta = after - before;
    if (Math.abs(delta) <= threshold) return "inside-noise";
    if (direction === "lower-better") return delta < 0 ? "win" : "loss";
    return delta > 0 ? "win" : "loss";
  }
  function mean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  function noiseFromControl(values) {
    const avg = mean(values);
    const halfRange = (Math.max(...values) - Math.min(...values)) / 2;
    const abs = Math.max(halfRange, 0);
    const rel = Math.abs(avg) > 0 ? abs / Math.abs(avg) : 0;
    return { abs, rel };
  }
  function numericSeries(samples, key) {
    const values = [];
    for (const sample of samples) {
      const value = sample[key];
      if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
      values.push(value);
    }
    return values.length > 0 ? values : void 0;
  }
  function averageSample(samples) {
    const keys = Object.keys(samples[0]);
    const out = { ...samples[0] };
    for (const key of keys) {
      const series = numericSeries(samples, key);
      if (!series) {
        delete out[key];
        continue;
      }
      ;
      out[key] = mean(series);
    }
    return out;
  }
  function compareAbSamples(input) {
    const before = averageSample(input.a);
    const after = averageSample(input.b);
    const deltas = {};
    const noiseBand = {};
    const claimed = {};
    const keys = /* @__PURE__ */ new Set([
      ...Object.keys(before),
      ...Object.keys(after)
    ]);
    for (const key of keys) {
      const aSeries = numericSeries(input.a, key);
      const bSeries = numericSeries(input.b, key);
      const bVal = after[key];
      const aVal = before[key];
      if (typeof aVal !== "number" || typeof bVal !== "number" || !aSeries || !bSeries) continue;
      deltas[key] = bVal - aVal;
      const band = noiseFromControl(aSeries);
      noiseBand[key] = band;
      const direction = HIGHER_BETTER.includes(key) ? "higher-better" : "lower-better";
      if (!LOWER_BETTER.includes(key) && !HIGHER_BETTER.includes(key)) continue;
      claimed[key] = claimAbDelta(aVal, bVal, band, direction);
    }
    const result = { before, after, deltas, noiseBand, claimed };
    const invalidSample = input.a.find((s) => s.invalid) ?? input.b.find((s) => s.invalid);
    if (invalidSample) {
      result.invalid = true;
      if (invalidSample.invalidReason) result.invalidReason = invalidSample.invalidReason;
    }
    return result;
  }

  // ../../packages/core/src/pixel-diff.ts
  function pixelChangedRatio(a, b, channelThreshold = 8) {
    const len = Math.min(a.length, b.length);
    if (len < 4) return a.length === b.length ? 0 : 1;
    const pixels = Math.floor(len / 4);
    let changed = 0;
    for (let i = 0; i < pixels; i++) {
      const o = i * 4;
      const dr = Math.abs(Number(a[o]) - Number(b[o]));
      const dg = Math.abs(Number(a[o + 1]) - Number(b[o + 1]));
      const db = Math.abs(Number(a[o + 2]) - Number(b[o + 2]));
      const da = Math.abs(Number(a[o + 3]) - Number(b[o + 3]));
      if (Math.max(dr, dg, db, da) > channelThreshold) changed += 1;
    }
    if (a.length !== b.length) return 1;
    return changed / pixels;
  }
  function classifyVisualSafety(opts2) {
    const maxChangedRatio = opts2.maxChangedRatio ?? 0.02;
    const floor = Math.max(maxChangedRatio, opts2.controlChangedRatio);
    const visualDelta = opts2.candidateChangedRatio > floor;
    return { safe: !visualDelta, visualDelta };
  }

  // ../../packages/core/src/measure-validity.ts
  function classifyMeasureValidity(input) {
    if (input.visibilityState === "hidden") {
      return { invalid: true, reason: "hidden" };
    }
    const throttleMs = input.throttleMs ?? 250;
    const throttled = input.frameTimesMs.filter((ms) => ms >= throttleMs);
    if (throttled.some((ms) => ms >= 1e3) || throttled.length >= 2) {
      return { invalid: true, reason: "throttled-raf" };
    }
    return { invalid: false };
  }

  // ../../packages/rules/src/profiles.ts
  var PROFILE_BUDGETS = {
    marketing: {
      maxDrawCalls: 80,
      maxShadowCasters: 1,
      maxDpr: 1.5,
      maxLights: 3,
      maxEstimatedVramBytes: 64e6,
      maxTriangles: 8e4,
      maxShadowTriangles: 5e4
    },
    product: {
      maxDrawCalls: 100,
      maxShadowCasters: 2,
      maxDpr: 2,
      maxLights: 4,
      maxEstimatedVramBytes: 128e6,
      maxTriangles: 15e4,
      maxShadowTriangles: 1e5
    },
    game: {
      maxDrawCalls: 150,
      maxShadowCasters: 3,
      maxDpr: 2,
      maxLights: 6,
      maxEstimatedVramBytes: 256e6,
      maxTriangles: 3e5,
      maxShadowTriangles: 2e5
    },
    cad: {
      maxDrawCalls: 120,
      maxShadowCasters: 2,
      maxDpr: 2,
      maxLights: 4,
      maxEstimatedVramBytes: 256e6,
      maxTriangles: 5e5,
      maxShadowTriangles: 3e5
    }
  };
  function resolveProfile(profile, snapshot) {
    if (profile !== "auto") return profile;
    const continuous = snapshot.continuousFrameloop;
    const highDraw = snapshot.drawCalls >= 80;
    const substantialMesh = snapshot.meshCount >= 50;
    if (continuous && (substantialMesh || snapshot.drawCalls >= 30)) return "game";
    if (highDraw && snapshot.meshCount >= 30) return "game";
    if (snapshot.lightCount >= 4 && snapshot.meshCount > 50) return "game";
    if (!continuous && snapshot.lightCount < 4 && snapshot.meshCount > 200 && !highDraw) {
      return "cad";
    }
    if (!continuous && snapshot.lightCount < 3 && snapshot.drawCalls > 150 && snapshot.meshCount <= 50) {
      return "cad";
    }
    if (snapshot.textureCount <= 6 && snapshot.meshCount <= 20 && snapshot.drawCalls <= 40) {
      return "product";
    }
    return "marketing";
  }

  // ../../packages/rules/src/score.ts
  var SEVERITY_PENALTY = { info: 2, warn: 8, error: 18 };
  function computeDoctorScore(findings, snapshot, profile, previous) {
    let score = 100;
    for (const f of findings) score -= SEVERITY_PENALTY[f.severity];
    const budgets = PROFILE_BUDGETS[profile];
    if (snapshot.drawCalls > budgets.maxDrawCalls) {
      score -= Math.min(15, Math.floor((snapshot.drawCalls / budgets.maxDrawCalls - 1) * 10));
    }
    if (typeof snapshot.estimatedVramBytes === "number" && snapshot.estimatedVramBytes > budgets.maxEstimatedVramBytes) {
      score -= 10;
    }
    const triCost = snapshot.geometryTriangleCount ?? snapshot.triangles;
    if (typeof triCost === "number" && triCost > budgets.maxTriangles) {
      score -= Math.min(15, Math.floor((triCost / budgets.maxTriangles - 1) * 10));
    }
    if (previous) {
      const prevTri = previous.geometryTriangleCount ?? previous.triangles;
      const nextTri = snapshot.geometryTriangleCount ?? snapshot.triangles;
      if (typeof prevTri === "number" && typeof nextTri === "number" && prevTri > 0 && nextTri < prevTri * 0.8) {
        score += Math.min(10, Math.round((1 - nextTri / prevTri) * 12));
      }
      const prevGpu = previous.gpuFrameTimeMs;
      const nextGpu = snapshot.gpuFrameTimeMs;
      if (typeof prevGpu === "number" && typeof nextGpu === "number" && prevGpu > 0 && nextGpu < prevGpu * 0.9) {
        score += Math.min(8, Math.round((1 - nextGpu / prevGpu) * 20));
      }
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ../../packages/rules/src/rules/draw-calls.ts
  var drawCallsRule = {
    id: "draw-calls",
    run(ctx) {
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      const budget = PROFILE_BUDGETS[profile].maxDrawCalls;
      if (ctx.snapshot.drawCalls <= budget) return [];
      const severity = ctx.snapshot.drawCalls > budget * 1.5 ? "error" : "warn";
      return [
        {
          id: "draw-calls/too-many",
          severity,
          evidence: { drawCalls: ctx.snapshot.drawCalls, budget, profile },
          message: `Draw calls ${ctx.snapshot.drawCalls} exceed ${profile} budget ${budget}`,
          suggestedFix: "Use InstancedMesh, BatchedMesh, or merge static geometries"
        }
      ];
    }
  };

  // ../../packages/rules/src/rules/lights-shadows.ts
  var lightsShadowsRule = {
    id: "lights-shadows",
    run(ctx) {
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      const budgets = PROFILE_BUDGETS[profile];
      const findings = [];
      if (ctx.snapshot.lightCount > budgets.maxLights) {
        findings.push({
          id: "lights/too-many",
          severity: "warn",
          evidence: { lightCount: ctx.snapshot.lightCount, budget: budgets.maxLights },
          message: `Active lights ${ctx.snapshot.lightCount} exceed budget ${budgets.maxLights}`,
          suggestedFix: "Bake lighting or reduce dynamic lights"
        });
      }
      if (ctx.snapshot.shadowCastingLightCount > budgets.maxShadowCasters) {
        findings.push({
          id: "shadows/too-many-casters",
          severity: "error",
          evidence: {
            shadowCastingLightCount: ctx.snapshot.shadowCastingLightCount,
            budget: budgets.maxShadowCasters
          },
          message: `Shadow-casting lights ${ctx.snapshot.shadowCastingLightCount} exceed budget ${budgets.maxShadowCasters}`,
          suggestedFix: "Disable extra shadows or freeze shadow autoUpdate",
          autoFix: "shadow-budget"
        });
      }
      const shadowTris = ctx.snapshot.shadowTriangleCount;
      if (typeof shadowTris === "number" && shadowTris > budgets.maxShadowTriangles) {
        findings.push({
          id: "shadows/expensive-pass",
          severity: shadowTris > budgets.maxShadowTriangles * 1.5 ? "error" : "warn",
          evidence: { shadowTriangleCount: shadowTris, budget: budgets.maxShadowTriangles },
          message: `Shadow-pass triangles ${shadowTris} exceed budget ${budgets.maxShadowTriangles}`,
          suggestedFix: "Disable castShadow on heavy InstancedMeshes or tighten the shadow camera"
        });
      }
      const outside = ctx.snapshot.shadowCastersOutsideFrustum;
      if (typeof outside === "number" && outside > 0) {
        findings.push({
          id: "shadows/casters-outside-frustum",
          severity: "info",
          evidence: { shadowCastersOutsideFrustum: outside },
          message: `${outside} shadow caster(s) sit outside every detectable shadow camera`,
          suggestedFix: "Disable castShadow on objects that never intersect the shadow camera"
        });
      }
      const zero = ctx.snapshot.zeroIntensityLightCount;
      if (typeof zero === "number" && zero > 0) {
        findings.push({
          id: "lights/zero-intensity",
          severity: "warn",
          evidence: { zeroIntensityLightCount: zero },
          message: `${zero} visible light(s) have intensity 0 but still participate in lighting`,
          suggestedFix: "Remove or disable lights instead of leaving intensity at 0"
        });
      }
      return findings;
    }
  };

  // ../../packages/rules/src/rules/dpr.ts
  var dprRule = {
    id: "dpr",
    run(ctx) {
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      const maxDpr = Math.min(
        PROFILE_BUDGETS[profile].maxDpr,
        ctx.device.tier === "low" ? 1.5 : PROFILE_BUDGETS[profile].maxDpr
      );
      const dpr = ctx.snapshot.rendererPixelRatio;
      if (typeof dpr !== "number" || !Number.isFinite(dpr)) return [];
      if (dpr <= maxDpr) return [];
      return [
        {
          id: "renderer/uncapped-dpr",
          severity: ctx.device.tier === "low" ? "error" : "warn",
          evidence: {
            rendererPixelRatio: dpr,
            maxDpr,
            tier: ctx.device.tier
          },
          message: `Renderer pixel ratio ${dpr} exceeds cap ${maxDpr}`,
          suggestedFix: "Cap setPixelRatio for the active device tier",
          autoFix: "dpr-cap"
        }
      ];
    }
  };

  // ../../packages/rules/src/rules/materials.ts
  var materialsRule = {
    id: "materials",
    run(ctx) {
      const { materialCount, meshCount } = ctx.snapshot;
      if (!(materialCount > 20 && materialCount > meshCount * 0.8)) return [];
      return [
        {
          id: "materials/too-unique",
          severity: "warn",
          evidence: { materialCount, meshCount },
          message: `High unique material count ${materialCount} relative to meshes ${meshCount}`,
          suggestedFix: "Share materials across meshes or atlas textures"
        }
      ];
    }
  };

  // ../../packages/rules/src/rules/textures.ts
  var texturesRule = {
    id: "textures",
    run(ctx) {
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      const findings = [];
      const vramBudget = PROFILE_BUDGETS[profile].maxEstimatedVramBytes;
      if (typeof ctx.snapshot.estimatedVramBytes === "number" && ctx.snapshot.estimatedVramBytes > vramBudget) {
        findings.push({
          id: "textures/high-vram",
          severity: "error",
          evidence: { estimatedVramBytes: ctx.snapshot.estimatedVramBytes, budget: vramBudget },
          message: `Estimated VRAM ${ctx.snapshot.estimatedVramBytes} exceeds budget ${vramBudget}`,
          suggestedFix: "Downscale textures, use compression, or reduce texture count"
        });
      }
      if (ctx.device.tier === "low" && ctx.snapshot.maxTextureDimension > 2048) {
        findings.push({
          id: "textures/oversized",
          severity: "warn",
          evidence: { maxTextureDimension: ctx.snapshot.maxTextureDimension },
          message: `Max texture dimension ${ctx.snapshot.maxTextureDimension} is oversized for low-tier devices`,
          suggestedFix: "Cap texture sizes at 1024\u20132048 on mobile"
        });
      }
      return findings;
    }
  };

  // ../../packages/rules/src/rules/renderer-setup.ts
  function composerResolutionMismatch(snapshot) {
    const detected = snapshot.composerWidth !== void 0 || snapshot.composerHeight !== void 0 || snapshot.composerPixelRatio !== void 0;
    if (!detected) return false;
    const cpr = snapshot.composerPixelRatio;
    const rpr = snapshot.rendererPixelRatio;
    if (typeof cpr === "number" && typeof rpr === "number" && Math.abs(cpr - rpr) > 0.05) {
      return true;
    }
    const cw = snapshot.composerWidth;
    const ch = snapshot.composerHeight;
    const dw = snapshot.drawingBufferWidth;
    const dh = snapshot.drawingBufferHeight;
    if (typeof cw === "number" && typeof ch === "number" && typeof dw === "number" && typeof dh === "number" && dw > 0 && dh > 0) {
      const ratio = cw * ch / (dw * dh);
      if (ratio < 0.9 || ratio > 1.1) return true;
    }
    return false;
  }
  var rendererSetupRule = {
    id: "renderer-setup",
    run(ctx) {
      const findings = [];
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      if (ctx.snapshot.antialias && ctx.device.tier === "low" && (profile === "marketing" || profile === "product")) {
        findings.push({
          id: "renderer/antialias-postfx-risk",
          severity: "warn",
          evidence: { antialias: true, tier: ctx.device.tier, profile },
          message: "Antialias on low-tier marketing/product scenes risks costly post stacks",
          suggestedFix: "Disable MSAA on low tier or reduce postfx via postfx-budget",
          autoFix: "postfx-budget"
        });
      }
      if (composerResolutionMismatch(ctx.snapshot)) {
        const evidence = {};
        if (typeof ctx.snapshot.composerWidth === "number") evidence.composerWidth = ctx.snapshot.composerWidth;
        if (typeof ctx.snapshot.composerHeight === "number") evidence.composerHeight = ctx.snapshot.composerHeight;
        if (typeof ctx.snapshot.composerPixelRatio === "number") {
          evidence.composerPixelRatio = ctx.snapshot.composerPixelRatio;
        }
        if (typeof ctx.snapshot.drawingBufferWidth === "number") {
          evidence.drawingBufferWidth = ctx.snapshot.drawingBufferWidth;
        }
        if (typeof ctx.snapshot.drawingBufferHeight === "number") {
          evidence.drawingBufferHeight = ctx.snapshot.drawingBufferHeight;
        }
        if (typeof ctx.snapshot.rendererPixelRatio === "number") {
          evidence.rendererPixelRatio = ctx.snapshot.rendererPixelRatio;
        }
        findings.push({
          id: "renderer/composer-resolution-mismatch",
          severity: "warn",
          evidence,
          message: "EffectComposer internal size/pixel ratio is stale vs the renderer drawing buffer",
          suggestedFix: "Call composer.setSize / setPixelRatio whenever the renderer resizes or DPR changes"
        });
      }
      return findings;
    }
  };

  // ../../packages/rules/src/rules/lifecycle.ts
  var lifecycleRule = {
    id: "lifecycle",
    run(ctx) {
      if (!ctx.previousSnapshot) return [];
      const findings = [];
      const geoGrowth = ctx.snapshot.geometryCount - ctx.previousSnapshot.geometryCount;
      const texGrowth = ctx.snapshot.textureCount - ctx.previousSnapshot.textureCount;
      if (geoGrowth > 0 || texGrowth > 0) {
        findings.push({
          id: "lifecycle/resource-growth",
          severity: "warn",
          evidence: { geoGrowth, texGrowth },
          message: "Geometry/texture counts climbed between measures (possible leak)",
          suggestedFix: "Ensure dispose() on removed geometries, materials, and textures"
        });
      }
      const prevBytes = ctx.previousSnapshot.instancedBufferBytes;
      const bytes = ctx.snapshot.instancedBufferBytes;
      if (typeof prevBytes === "number" && typeof bytes === "number" && bytes > prevBytes) {
        findings.push({
          id: "lifecycle/instance-buffer-growth",
          severity: "warn",
          evidence: { prevBytes, bytes },
          message: "InstancedMesh instance buffers grew between measures (possible leak)",
          suggestedFix: "Call InstancedMesh.dispose() (instanceMatrix / instanceColor) when replacing or restarting instances"
        });
      }
      return findings;
    }
  };

  // ../../packages/rules/src/rules/transforms.ts
  var transformsRule = {
    id: "transforms",
    run(ctx) {
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      if (profile === "game") return [];
      if (ctx.snapshot.matrixAutoUpdateCount <= 10) return [];
      return [
        {
          id: "transforms/matrix-autoupdate",
          severity: "info",
          evidence: { matrixAutoUpdateCount: ctx.snapshot.matrixAutoUpdateCount, profile },
          message: `${ctx.snapshot.matrixAutoUpdateCount} objects still use matrixAutoUpdate on a mostly static profile`,
          suggestedFix: "Set matrixAutoUpdate=false and updateMatrix() once for static meshes"
        }
      ];
    }
  };

  // ../../packages/rules/src/rules/frameloop.ts
  var frameloopRule = {
    id: "frameloop",
    run(ctx) {
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      if (!ctx.snapshot.continuousFrameloop) return [];
      if (profile !== "marketing" && profile !== "product") return [];
      return [
        {
          id: "frameloop/continuous-static",
          severity: "warn",
          evidence: { continuousFrameloop: true, profile },
          message: "Continuous frameloop on a mostly static scene profile",
          suggestedFix: "Switch to demand/invalidation rendering",
          autoFix: "frameloop-demand"
        }
      ];
    }
  };

  // ../../packages/rules/src/rules/triangles.ts
  var trianglesRule = {
    id: "triangles",
    run(ctx) {
      const count = ctx.snapshot.geometryTriangleCount;
      if (typeof count !== "number" || !Number.isFinite(count)) return [];
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      const budget = PROFILE_BUDGETS[profile].maxTriangles;
      if (count <= budget) return [];
      const share = ctx.snapshot.topContributorShare;
      const summary = ctx.snapshot.triangleContributorSummary;
      const percent = typeof share === "number" && Number.isFinite(share) ? Math.round(share * 100) : void 0;
      const evidence = {
        geometryTriangleCount: count,
        budget,
        profile
      };
      if (typeof summary === "string") evidence.topContributor = summary;
      if (typeof share === "number") evidence.topContributorShare = share;
      const shareNote = percent !== void 0 && summary ? ` (${summary} is ${percent}%)` : "";
      return [
        {
          id: "triangles/too-many",
          severity: count > budget * 1.5 ? "error" : "warn",
          evidence,
          message: `Scene triangles ${count} exceed ${profile} budget ${budget}${shareNote}`,
          suggestedFix: "Chunk or simplify the heaviest InstancedMesh/Mesh (instance count \xD7 index count / 3)"
        }
      ];
    }
  };

  // ../../packages/rules/src/rules/culling.ts
  var cullingRule = {
    id: "culling",
    run(ctx) {
      const findings = [];
      const disabled = ctx.snapshot.frustumCulledDisabledCount;
      if (typeof disabled === "number" && disabled > 0) {
        findings.push({
          id: "culling/frustum-disabled",
          severity: "warn",
          evidence: { frustumCulledDisabledCount: disabled },
          message: `${disabled} mesh(es) have frustumCulled === false and always draw`,
          suggestedFix: "Enable frustumCulled when safe, or chunk large world meshes so they can cull"
        });
      }
      const oversized = ctx.snapshot.oversizedBoundCount;
      if (typeof oversized === "number" && oversized > 0) {
        findings.push({
          id: "culling/oversized-bounds",
          severity: "warn",
          evidence: { oversizedBoundCount: oversized },
          message: `${oversized} mesh(es) have world bounds larger than the camera far plane (never frustum-rejected)`,
          suggestedFix: "Split oversized geometry into chunks with tighter bounds; keep frustumCulled enabled"
        });
      }
      return findings;
    }
  };

  // ../../packages/rules/src/rule.ts
  var defaultRules = [
    drawCallsRule,
    trianglesRule,
    lightsShadowsRule,
    dprRule,
    materialsRule,
    texturesRule,
    rendererSetupRule,
    lifecycleRule,
    transformsRule,
    cullingRule,
    frameloopRule
  ];
  function runRules(ctx, rules = defaultRules) {
    return rules.flatMap((rule) => rule.run(ctx));
  }

  // ../../packages/runtime/src/renderer-read.ts
  function readRendererPixelRatio(renderer) {
    if (typeof renderer.getPixelRatio === "function") {
      try {
        const value = renderer.getPixelRatio();
        if (Number.isFinite(value)) return value;
      } catch {
      }
    }
    if (typeof renderer.pixelRatio === "number" && Number.isFinite(renderer.pixelRatio)) {
      return renderer.pixelRatio;
    }
    return void 0;
  }
  function readRendererAntialias(renderer) {
    if (typeof renderer.getContext === "function") {
      try {
        const attrs = renderer.getContext()?.getContextAttributes?.();
        if (attrs && typeof attrs.antialias === "boolean") return attrs.antialias;
      } catch {
      }
    }
    if (typeof renderer.antialias === "boolean") return renderer.antialias;
    return void 0;
  }

  // ../../packages/runtime/src/passes/dpr-cap.ts
  function restorePixelRatio(setPixelRatio, prev) {
    try {
      setPixelRatio(prev);
    } catch {
    }
  }
  function capFor(ctx, prev) {
    if (ctx.qualityTier) {
      return ctx.qualityTier === "potato" ? 1 : ctx.qualityTier === "low" ? 1.25 : ctx.qualityTier === "mid" ? 1.5 : 2;
    }
    return ctx.device.tier === "low" ? 1.5 : ctx.device.tier === "mid" ? 2 : Math.min(prev, 2);
  }
  var dprCapPass = {
    id: "dpr-cap",
    apply(ctx) {
      const prev = readRendererPixelRatio(ctx.renderer);
      if (prev === void 0) return { rollback() {
      } };
      const cap = capFor(ctx, prev);
      const next = Math.min(prev, cap);
      if (!Number.isFinite(next)) return { rollback() {
      } };
      try {
        ctx.renderer.setPixelRatio(next);
      } catch (err) {
        restorePixelRatio(ctx.renderer.setPixelRatio.bind(ctx.renderer), prev);
        throw err;
      }
      return {
        rollback() {
          ctx.renderer.setPixelRatio(prev);
        }
      };
    }
  };

  // ../../packages/runtime/src/passes/pixel-budget.ts
  function cssFromDrawingBuffer(devicePixels, pixelRatio) {
    return devicePixels / pixelRatio;
  }
  function drawingBufferPixelsOf(renderer) {
    const width = renderer.drawingBufferWidth;
    const height = renderer.drawingBufferHeight;
    if (width === void 0 || height === void 0) return void 0;
    return width * height;
  }
  function restoreDrawingBuffer(renderer, cssW, cssH, prevRatio) {
    try {
      if (renderer.setDrawingBufferSize) {
        renderer.setDrawingBufferSize(cssW, cssH, prevRatio);
      } else {
        renderer.setPixelRatio(prevRatio);
      }
    } catch {
    }
  }
  var pixelBudgetPass = {
    id: "pixel-budget",
    apply(ctx) {
      if (ctx.qualityTier === void 0) return { rollback() {
      } };
      const renderer = ctx.renderer;
      const prevRatio = readRendererPixelRatio(renderer);
      if (prevRatio === void 0 || !(prevRatio > 0)) return { rollback() {
      } };
      const prevW = renderer.drawingBufferWidth;
      const prevH = renderer.drawingBufferHeight;
      const capPixels = GENERIC_CAPS[ctx.qualityTier].drawingBufferPixels;
      if (capPixels === void 0) {
        return { rollback() {
        } };
      }
      if (prevW === void 0 || prevH === void 0) {
        return { rollback() {
        } };
      }
      const current = prevW * prevH;
      if (current <= capPixels) {
        return { rollback() {
        } };
      }
      const scale = Math.sqrt(capPixels / current);
      const newRatio = Math.min(prevRatio, prevRatio * scale);
      if (!Number.isFinite(newRatio) || newRatio >= prevRatio) {
        return { rollback() {
        } };
      }
      const cssW = cssFromDrawingBuffer(prevW, prevRatio);
      const cssH = cssFromDrawingBuffer(prevH, prevRatio);
      const restore = () => restoreDrawingBuffer(renderer, cssW, cssH, prevRatio);
      try {
        if (renderer.setDrawingBufferSize) {
          renderer.setDrawingBufferSize(cssW, cssH, newRatio);
        } else {
          renderer.setPixelRatio(newRatio);
        }
      } catch (err) {
        restore();
        throw err;
      }
      const nextPixels = drawingBufferPixelsOf(renderer);
      if (nextPixels !== void 0 && nextPixels > current) {
        restore();
        return { rollback() {
        } };
      }
      return { rollback: restore };
    }
  };

  // ../../packages/runtime/src/passes/shadow-budget.ts
  var shadowBudgetPass = {
    id: "shadow-budget",
    apply(ctx) {
      const maxCasters = ctx.qualityTier === "potato" ? 0 : ctx.qualityTier === "low" ? 1 : ctx.qualityTier === "mid" ? 2 : ctx.profile === "marketing" ? 1 : 2;
      const touched = [];
      const shadowMap = ctx.qualityTier === "potato" ? ctx.renderer.shadowMap : void 0;
      const prevShadowMapEnabled = shadowMap?.enabled;
      let kept = 0;
      const rollbackTouched = () => {
        for (const t of touched) t.obj.castShadow = t.prev;
        if (shadowMap !== void 0 && prevShadowMapEnabled !== void 0) {
          shadowMap.enabled = prevShadowMapEnabled;
        }
      };
      try {
        ctx.scene.traverse((obj) => {
          if (!obj.castShadow) return;
          if (obj.isMesh && !obj.isLight) return;
          if (kept < maxCasters) {
            kept += 1;
            return;
          }
          touched.push({ obj, prev: true });
          obj.castShadow = false;
        });
        if (shadowMap !== void 0) {
          shadowMap.enabled = false;
        }
      } catch (err) {
        rollbackTouched();
        throw err;
      }
      return {
        rollback() {
          rollbackTouched();
        }
      };
    }
  };

  // ../../packages/runtime/src/passes/postfx-budget.ts
  var postfxBudgetPass = {
    id: "postfx-budget",
    apply(ctx) {
      const prev = ctx.postfxEnabled;
      const restore = () => {
        ctx.postfxEnabled = prev;
        try {
          ctx.setPostfxEnabled?.(prev);
        } catch {
        }
      };
      const forceOff = ctx.qualityTier ? ctx.qualityTier === "potato" || ctx.qualityTier === "low" : ctx.device.tier === "low";
      if (forceOff && ctx.postfxEnabled) {
        try {
          ctx.setPostfxEnabled?.(false);
          ctx.postfxEnabled = false;
        } catch (err) {
          restore();
          throw err;
        }
      }
      return {
        rollback() {
          restore();
        }
      };
    }
  };

  // ../../packages/runtime/src/passes/tone-map-lite.ts
  var toneMapLitePass = {
    id: "tone-map-lite",
    apply(ctx) {
      if (ctx.qualityTier === void 0) return { rollback() {
      } };
      if (ctx.renderer.toneMapping === void 0) return { rollback() {
      } };
      const target = GENERIC_CAPS[ctx.qualityTier].toneMapping;
      if (target === void 0) return { rollback() {
      } };
      const prev = ctx.renderer.toneMapping;
      if (prev <= target) return { rollback() {
      } };
      try {
        ctx.renderer.toneMapping = target;
      } catch (err) {
        ctx.renderer.toneMapping = prev;
        throw err;
      }
      return {
        rollback() {
          ctx.renderer.toneMapping = prev;
        }
      };
    }
  };

  // ../../packages/runtime/src/passes/anisotropy-cap.ts
  var MAP_KEYS = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "bumpMap"
  ];
  var anisotropyCapPass = {
    id: "anisotropy-cap",
    apply(ctx) {
      if (ctx.qualityTier === void 0) return { rollback() {
      } };
      const cap = GENERIC_CAPS[ctx.qualityTier].anisotropy;
      if (cap === void 0) return { rollback() {
      } };
      const touched = [];
      const restore = () => {
        for (const t of touched) t.tex.anisotropy = t.prev;
      };
      try {
        ctx.scene.traverse((obj) => {
          const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
          for (const mat of mats) {
            if (!mat || typeof mat !== "object") continue;
            for (const key of MAP_KEYS) {
              const tex = mat[key];
              if (!tex || typeof tex.anisotropy !== "number") continue;
              if (tex.anisotropy <= cap) continue;
              touched.push({ tex, prev: tex.anisotropy });
              tex.anisotropy = cap;
            }
          }
        });
      } catch (err) {
        restore();
        throw err;
      }
      return { rollback: restore };
    }
  };

  // ../../packages/runtime/src/passes/frameloop-demand.ts
  var frameloopDemandPass = {
    id: "frameloop-demand",
    apply(ctx) {
      const prev = ctx.frameloop;
      const restore = () => {
        try {
          ctx.setFrameloop(prev);
        } catch {
        }
      };
      if (ctx.profile === "marketing" || ctx.profile === "product") {
        try {
          ctx.setFrameloop("demand");
        } catch (err) {
          restore();
          throw err;
        }
      }
      return {
        rollback() {
          ctx.setFrameloop(prev);
        }
      };
    }
  };

  // ../../packages/runtime/src/passes/distance-cull.ts
  function isFiniteVec(v) {
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  }
  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  function transformPoint(elements, p) {
    const x = p.x;
    const y = p.y;
    const z = p.z;
    const w = elements[3] * x + elements[7] * y + elements[11] * z + elements[15];
    const invW = w !== 0 && Number.isFinite(w) ? 1 / w : 1;
    return {
      x: (elements[0] * x + elements[4] * y + elements[8] * z + elements[12]) * invW,
      y: (elements[1] * x + elements[5] * y + elements[9] * z + elements[13]) * invW,
      z: (elements[2] * x + elements[6] * y + elements[10] * z + elements[14]) * invW
    };
  }
  function worldAabb(obj) {
    const geom = obj.geometry;
    if (!geom) return void 0;
    if (!geom.boundingBox && typeof geom.computeBoundingBox === "function") {
      try {
        geom.computeBoundingBox();
      } catch {
      }
    }
    const box = geom.boundingBox;
    if (!box?.min || !box?.max || !isFiniteVec(box.min) || !isFiniteVec(box.max)) return void 0;
    const corners = [
      { x: box.min.x, y: box.min.y, z: box.min.z },
      { x: box.min.x, y: box.min.y, z: box.max.z },
      { x: box.min.x, y: box.max.y, z: box.min.z },
      { x: box.min.x, y: box.max.y, z: box.max.z },
      { x: box.max.x, y: box.min.y, z: box.min.z },
      { x: box.max.x, y: box.min.y, z: box.max.z },
      { x: box.max.x, y: box.max.y, z: box.min.z },
      { x: box.max.x, y: box.max.y, z: box.max.z }
    ];
    const elements = obj.matrixWorld?.elements;
    const worldCorners = elements && elements.length >= 16 ? corners.map((c) => transformPoint(elements, c)) : void 0;
    if (!worldCorners) return void 0;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const c of worldCorners) {
      if (!isFiniteVec(c)) return void 0;
      min.x = Math.min(min.x, c.x);
      min.y = Math.min(min.y, c.y);
      min.z = Math.min(min.z, c.z);
      max.x = Math.max(max.x, c.x);
      max.y = Math.max(max.y, c.y);
      max.z = Math.max(max.z, c.z);
    }
    return { min, max };
  }
  function worldDistanceToCamera(obj, cam) {
    const aabb = worldAabb(obj);
    if (aabb) {
      const closest = {
        x: Math.min(aabb.max.x, Math.max(aabb.min.x, cam.x)),
        y: Math.min(aabb.max.y, Math.max(aabb.min.y, cam.y)),
        z: Math.min(aabb.max.z, Math.max(aabb.min.z, cam.z))
      };
      return distance(closest, cam);
    }
    if (typeof obj.getWorldPosition !== "function") return void 0;
    const pos = { x: 0, y: 0, z: 0 };
    try {
      obj.getWorldPosition(pos);
    } catch {
      return void 0;
    }
    if (!isFiniteVec(pos)) return void 0;
    const radius = obj.geometry?.boundingSphere?.radius;
    const dist = distance(pos, cam);
    if (typeof radius === "number" && Number.isFinite(radius) && radius > 0) {
      return Math.max(0, dist - radius);
    }
    return dist;
  }
  var distanceCullPass = {
    id: "distance-cull",
    apply(ctx) {
      const cam = ctx.cameraPosition ?? { x: 0, y: 0, z: 0 };
      const maxDist = ctx.cullDistance ?? 80;
      const touched = [];
      const rollbackTouched = () => {
        for (const t of touched) t.obj.visible = t.prev;
      };
      try {
        ctx.scene.traverse((obj) => {
          if (!obj.isMesh) return;
          const dist = worldDistanceToCamera(obj, cam);
          if (dist === void 0 || !Number.isFinite(dist)) return;
          const wasVisible = obj.visible !== false;
          if (dist > maxDist && wasVisible) {
            touched.push({ obj, prev: wasVisible });
            obj.visible = false;
          }
        });
      } catch (err) {
        rollbackTouched();
        throw err;
      }
      return {
        rollback() {
          rollbackTouched();
        }
      };
    }
  };

  // ../../packages/runtime/src/passes/material-downgrade.ts
  var materialDowngradePass = {
    id: "material-downgrade",
    apply(_ctx) {
      return { rollback() {
      } };
    }
  };

  // ../../packages/runtime/src/overlay/format-quality-hud.ts
  function formatQualityHud(state) {
    const tierPath = state.startTier === state.tier ? state.tier : `${state.startTier}\u2192${state.tier}`;
    let line1 = `Doctor Score ${state.score} \xB7 ${state.profile} \xB7 ${state.qualityMode} \xB7 ${tierPath}`;
    if (state.floorFailed) line1 = `FLOOR FAILED \xB7 ${line1}`;
    if (state.qualityMode === "advise") line1 = `ADVISE ${line1}`;
    if (state.qualityMode === "takeover" && state.exclusive) line1 += " \xB7 exclusive";
    const parts = [];
    if (state.ttfiMs !== void 0) parts.push(`TTFI ${Math.round(state.ttfiMs)}ms`);
    if (state.avgFps !== void 0 && state.p95FrameTimeMs !== void 0) {
      parts.push(`${Math.round(state.avgFps)} FPS p95=${Math.round(state.p95FrameTimeMs)}ms`);
    }
    if (state.simPassCount !== void 0) parts.push(`simPasses ${state.simPassCount}`);
    if (state.bytesLoaded !== void 0) {
      const mb = state.bytesLoaded / 1e6;
      parts.push(`bytes ${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)}MB`);
    }
    return { line1, line2: parts.join(" \xB7 ") };
  }

  // ../../packages/runtime/src/overlay/mount-overlay.ts
  function formatDeltas(baseline, after) {
    if (!baseline || !after) return "No after metrics";
    const keys = [
      "avgFps",
      "p95FrameTimeMs",
      "drawCalls",
      "triangles",
      "textureCount",
      "estimatedVramBytes",
      "geometryCount",
      "lightCount",
      "shadowCastingLightCount"
    ];
    return keys.map((k) => {
      const next = after[k];
      const prev = baseline[k];
      if (typeof next !== "number" || typeof prev !== "number") return void 0;
      const delta = next - prev;
      return `${String(k)}: ${delta >= 0 ? "+" : ""}${delta}`;
    }).filter((line) => line !== void 0).join(" \xB7 ");
  }
  function mountOverlay(opts2) {
    const parent = opts2.root ?? document.body;
    document.getElementById("threejs-doctor-overlay")?.remove();
    const el = document.createElement("div");
    el.id = "threejs-doctor-overlay";
    el.style.cssText = "position:fixed;z-index:99999;left:8px;bottom:8px;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.75);color:#fff;font:12px/1.4 ui-monospace,monospace;max-width:420px";
    const paint = () => {
      const hud = opts2.getQualityHud?.();
      if (hud) {
        const { line1, line2 } = formatQualityHud(hud);
        el.textContent = line2 ? `${line1}
${line2}` : line1;
        return;
      }
      const score = opts2.getScore();
      const deltas = formatDeltas(opts2.getBaseline(), opts2.getAfter?.());
      el.textContent = `Doctor Score ${score} | ${deltas}`;
    };
    paint();
    parent.appendChild(el);
    return {
      refresh: paint,
      unmount() {
        el.remove();
      }
    };
  }

  // ../../packages/runtime/src/scene-stats.ts
  var MATERIAL_MAP_KEYS = [
    "map",
    "lightMap",
    "aoMap",
    "emissiveMap",
    "bumpMap",
    "normalMap",
    "displacementMap",
    "roughnessMap",
    "metalnessMap",
    "alphaMap",
    "envMap",
    "specularMap",
    "gradientMap",
    "matcap"
  ];
  var BYTES_PER_PIXEL = 4;
  function finiteSize(width, height) {
    if (typeof width !== "number" || typeof height !== "number") return void 0;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return void 0;
    return { width, height };
  }
  function textureSize(tex) {
    const direct = finiteSize(tex.width, tex.height);
    if (direct) return direct;
    const image = tex.image;
    const fromImage = image ? finiteSize(image.width, image.height) : void 0;
    if (fromImage) return fromImage;
    const source = tex.source;
    if (source?.data) return finiteSize(source.data.width, source.data.height);
    return void 0;
  }
  function rememberTexture(seen, tex, fallbackId) {
    if (!tex || typeof tex !== "object") return;
    const rec = tex;
    const uuid = typeof rec.uuid === "string" ? rec.uuid : fallbackId;
    if (seen.has(uuid)) return;
    const size = textureSize(rec);
    if (!size) {
      seen.set(uuid, { uuid, width: 0, height: 0, bytesPerPixel: BYTES_PER_PIXEL });
      return;
    }
    seen.set(uuid, {
      uuid,
      width: size.width,
      height: size.height,
      bytesPerPixel: BYTES_PER_PIXEL
    });
  }
  function collectMaterialTextures(material, seen, id) {
    if (!material || typeof material !== "object") return;
    const rec = material;
    for (const key of MATERIAL_MAP_KEYS) {
      rememberTexture(seen, rec[key], `${id}:${key}`);
    }
  }
  function isRenderTarget(value) {
    if (!value || typeof value !== "object") return false;
    const rec = value;
    if (rec.isWebGLRenderTarget === true) return true;
    return Boolean(rec.texture) && finiteSize(rec.width, rec.height) !== void 0;
  }
  function rememberRenderTarget(seen, value, fallbackId) {
    if (!isRenderTarget(value)) return;
    const tex = value.texture;
    const uuid = tex && typeof tex === "object" && typeof tex.uuid === "string" ? tex.uuid : fallbackId;
    if (seen.has(uuid)) return;
    const size = finiteSize(value.width, value.height) ?? (tex ? textureSize(tex) : void 0);
    if (!size) return;
    seen.set(uuid, {
      uuid,
      width: size.width,
      height: size.height,
      bytesPerPixel: BYTES_PER_PIXEL
    });
  }
  function scanObjectForRenderTargets(obj, seen, prefix) {
    if (!obj || typeof obj !== "object") return;
    const rec = obj;
    rememberRenderTarget(seen, rec, prefix);
    rememberRenderTarget(seen, rec.renderTarget, `${prefix}:renderTarget`);
    const shadow = rec.shadow;
    if (shadow) rememberRenderTarget(seen, shadow.map, `${prefix}:shadow`);
  }
  function geometryTriangles(geo) {
    if (!geo || typeof geo !== "object") return void 0;
    const rec = geo;
    if (typeof rec.index?.count === "number" && Number.isFinite(rec.index.count) && rec.index.count >= 3) {
      return Math.floor(rec.index.count / 3);
    }
    const pos = rec.attributes?.position?.count;
    if (typeof pos === "number" && Number.isFinite(pos) && pos >= 3) {
      return Math.floor(pos / 3);
    }
    return void 0;
  }
  function meshTriangles(obj) {
    const base = geometryTriangles(obj.geometry);
    if (base === void 0) return void 0;
    if (obj.isInstancedMesh === true) {
      const count = typeof obj.count === "number" && Number.isFinite(obj.count) && obj.count > 0 ? obj.count : 1;
      return base * count;
    }
    return base;
  }
  function meshLabel(obj, fallback) {
    if (typeof obj.name === "string" && obj.name.length > 0) return obj.name;
    if (typeof obj.uuid === "string" && obj.uuid.length > 0) return obj.uuid;
    return fallback;
  }
  function instancedBufferBytes(obj) {
    if (obj.isInstancedMesh !== true) return void 0;
    let bytes = 0;
    let known = false;
    const matrix = obj.instanceMatrix;
    if (typeof matrix?.array?.byteLength === "number") {
      bytes += matrix.array.byteLength;
      known = true;
    } else if (typeof obj.count === "number" && obj.count >= 0) {
      bytes += obj.count * 16 * 4;
      known = true;
    }
    const color = obj.instanceColor;
    if (typeof color?.array?.byteLength === "number") {
      bytes += color.array.byteLength;
      known = true;
    }
    return known ? bytes : void 0;
  }
  function worldScale(elements) {
    const sx = Math.hypot(Number(elements[0]), Number(elements[1]), Number(elements[2]));
    const sy = Math.hypot(Number(elements[4]), Number(elements[5]), Number(elements[6]));
    const sz = Math.hypot(Number(elements[8]), Number(elements[9]), Number(elements[10]));
    return Math.max(sx, sy, sz, 0);
  }
  function worldRadius(obj) {
    const geo = obj.geometry;
    const radius = geo?.boundingSphere?.radius;
    if (typeof radius !== "number" || !Number.isFinite(radius) || radius <= 0) return void 0;
    const elements = obj.matrixWorld?.elements;
    const scale = elements && elements.length >= 12 ? worldScale(elements) : 1;
    return radius * (scale > 0 ? scale : 1);
  }
  function worldCenter(obj) {
    const elements = obj.matrixWorld?.elements;
    if (!elements || elements.length < 16) return void 0;
    const local = obj.geometry?.boundingSphere?.center;
    if (local && typeof local.x === "number" && typeof local.y === "number" && typeof local.z === "number") {
      return transformPoint2(elements, local.x, local.y, local.z);
    }
    return [Number(elements[12]), Number(elements[13]), Number(elements[14])];
  }
  function transformPoint2(m, x, y, z) {
    const w = Number(m[3]) * x + Number(m[7]) * y + Number(m[11]) * z + Number(m[15]) || 1;
    return [
      (Number(m[0]) * x + Number(m[4]) * y + Number(m[8]) * z + Number(m[12])) / w,
      (Number(m[1]) * x + Number(m[5]) * y + Number(m[9]) * z + Number(m[13])) / w,
      (Number(m[2]) * x + Number(m[6]) * y + Number(m[10]) * z + Number(m[14])) / w
    ];
  }
  function invert4(m) {
    if (m.length < 16) return void 0;
    const a00 = Number(m[0]);
    const a01 = Number(m[1]);
    const a02 = Number(m[2]);
    const a03 = Number(m[3]);
    const a10 = Number(m[4]);
    const a11 = Number(m[5]);
    const a12 = Number(m[6]);
    const a13 = Number(m[7]);
    const a20 = Number(m[8]);
    const a21 = Number(m[9]);
    const a22 = Number(m[10]);
    const a23 = Number(m[11]);
    const a30 = Number(m[12]);
    const a31 = Number(m[13]);
    const a32 = Number(m[14]);
    const a33 = Number(m[15]);
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return void 0;
    const invDet = 1 / det;
    return [
      (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
      (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
      (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
      (a22 * b04 - a21 * b05 - a23 * b03) * invDet,
      (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
      (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
      (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
      (a20 * b05 - a22 * b02 + a23 * b01) * invDet,
      (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
      (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
      (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
      (a21 * b02 - a20 * b04 - a23 * b00) * invDet,
      (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
      (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
      (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
      (a20 * b03 - a21 * b01 + a22 * b00) * invDet
    ];
  }
  function readShadowCamera(light) {
    const shadow = light.shadow;
    const cam = shadow?.camera;
    if (!cam) return void 0;
    const near = cam.near;
    const far = cam.far;
    if (typeof near !== "number" || typeof far !== "number") return void 0;
    const elements = cam.matrixWorld?.elements;
    if (!elements) return void 0;
    const invWorld = invert4(elements);
    if (!invWorld) return void 0;
    if (cam.isOrthographicCamera === true || typeof cam.left === "number" && typeof cam.right === "number" && typeof cam.top === "number" && typeof cam.bottom === "number") {
      if (typeof cam.left !== "number" || typeof cam.right !== "number" || typeof cam.top !== "number" || typeof cam.bottom !== "number") {
        return void 0;
      }
      return {
        kind: "ortho",
        invWorld,
        left: cam.left,
        right: cam.right,
        top: cam.top,
        bottom: cam.bottom,
        near,
        far
      };
    }
    if (typeof cam.fov === "number" && typeof cam.aspect === "number") {
      return { kind: "perspective", invWorld, near, far, fov: cam.fov, aspect: cam.aspect };
    }
    return void 0;
  }
  function sphereOutsideShadowCamera(cx, cy, cz, radius, cam) {
    const [x, y, z] = transformPoint2(cam.invWorld, cx, cy, cz);
    if (cam.kind === "ortho") {
      const left = cam.left;
      const right = cam.right;
      const top = cam.top;
      const bottom = cam.bottom;
      const zMin = Math.min(-cam.near, -cam.far);
      const zMax = Math.max(-cam.near, -cam.far);
      if (x + radius < left || x - radius > right) return true;
      if (y + radius < bottom || y - radius > top) return true;
      if (z + radius < zMin || z - radius > zMax) return true;
      return false;
    }
    const dist = -z;
    if (dist + radius < cam.near || dist - radius > cam.far) return true;
    const vFov = (cam.fov ?? 75) * Math.PI / 180;
    const hy = Math.tan(vFov / 2) * Math.max(dist, cam.near);
    const hx = hy * (cam.aspect ?? 1);
    if (Math.abs(x) - radius > hx || Math.abs(y) - radius > hy) return true;
    return false;
  }
  function isComposerLike(value) {
    if (!value || typeof value !== "object") return false;
    const rec = value;
    if (rec.isEffectComposer === true) return true;
    const hasPasses = Array.isArray(rec.passes);
    const hasTarget = rec.renderTarget1 !== void 0 || rec.writeBuffer !== void 0;
    return hasPasses && hasTarget;
  }
  function rememberComposer(target, value) {
    if (target.current || !isComposerLike(value)) return;
    target.current = value;
  }
  function readComposerSize(composer) {
    const rt = composer.renderTarget1 ?? composer.writeBuffer;
    const size = rt ? finiteSize(rt.width, rt.height) : void 0;
    const pr = composer.pixelRatio ?? composer._pixelRatio;
    const out = {};
    if (size) {
      out.width = size.width;
      out.height = size.height;
    }
    if (typeof pr === "number" && Number.isFinite(pr) && pr > 0) out.pixelRatio = pr;
    return out;
  }
  function assignDefined(target, key, value) {
    if (value !== void 0) target[key] = value;
  }
  function collectHostSceneStats(scene, renderer, camera) {
    const lights = [];
    const seen = /* @__PURE__ */ new Map();
    const insights = {};
    const contributors = [];
    const shadowCameras = [];
    const casters = [];
    const composerRef = {};
    let frustumCulledDisabledCount = 0;
    let oversizedBoundCount = 0;
    let oversizedMeasured = false;
    let zeroIntensityLightCount = 0;
    let instancedBytes = 0;
    let instancedKnown = false;
    let shadowTriangles = 0;
    let shadowTriKnown = false;
    const camFar = camera && typeof camera === "object" && typeof camera.far === "number" ? camera.far : void 0;
    const traversable = scene;
    if (typeof traversable.traverse === "function") {
      let index = 0;
      traversable.traverse((obj) => {
        index += 1;
        rememberComposer(composerRef, obj);
        if (obj.isLight === true) {
          lights.push({ castShadow: obj.castShadow === true });
          if (obj.visible !== false && typeof obj.intensity === "number" && obj.intensity <= 0) {
            zeroIntensityLightCount += 1;
          }
          if (obj.castShadow === true) {
            const shadowCam = readShadowCamera(obj);
            if (shadowCam) shadowCameras.push(shadowCam);
          }
        }
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((mat, i) => collectMaterialTextures(mat, seen, `m${index}-${i}`));
        scanObjectForRenderTargets(obj, seen, `obj${index}`);
        if (obj.isMesh === true) {
          if (obj.frustumCulled === false) frustumCulledDisabledCount += 1;
          const tris = meshTriangles(obj);
          if (tris !== void 0) {
            contributors.push({
              id: meshLabel(obj, `mesh${index}`),
              triangles: tris,
              castShadow: obj.castShadow === true
            });
            if (obj.castShadow === true) {
              shadowTriangles += tris;
              shadowTriKnown = true;
            }
          }
          const radius = worldRadius(obj);
          if (typeof camFar === "number" && camFar > 0 && radius !== void 0) {
            oversizedMeasured = true;
            if (radius > camFar) oversizedBoundCount += 1;
          }
          if (obj.castShadow === true) {
            const center = worldCenter(obj);
            if (center && radius !== void 0) casters.push({ center, radius });
          }
          const bytes = instancedBufferBytes(obj);
          if (bytes !== void 0) {
            instancedBytes += bytes;
            instancedKnown = true;
          }
        }
      });
    }
    if (renderer && typeof renderer === "object") {
      const rec = renderer;
      rememberComposer(composerRef, rec);
      for (const [key, value] of Object.entries(rec)) {
        rememberRenderTarget(seen, value, `renderer:${key}`);
        rememberComposer(composerRef, value);
      }
      scanObjectForRenderTargets(rec.shadowMap, seen, "renderer:shadowMap");
      if (typeof rec.drawingBufferWidth === "number") insights.drawingBufferWidth = rec.drawingBufferWidth;
      if (typeof rec.drawingBufferHeight === "number") insights.drawingBufferHeight = rec.drawingBufferHeight;
    }
    const sized = [...seen.values()].filter((t) => t.width > 0 && t.height > 0);
    const stats = {
      textureCount: seen.size,
      geometryCount: renderer?.info?.memory?.geometries ?? 0,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length
    };
    if (stats.geometryCount === 0) {
      const mem = renderer?.info?.memory?.geometries;
      if (typeof mem === "number") stats.geometryCount = mem;
    }
    if (sized.length > 0) {
      stats.estimatedVramBytes = sized.reduce(
        (sum, t) => sum + t.width * t.height * t.bytesPerPixel,
        0
      );
    }
    if (stats.textureCount === 0) {
      const memTex = renderer?.info?.memory?.textures;
      if (typeof memTex === "number") stats.textureCount = memTex;
    }
    if (contributors.length > 0) {
      const total = contributors.reduce((sum, c) => sum + c.triangles, 0);
      insights.geometryTriangleCount = total;
      contributors.sort((a, b) => b.triangles - a.triangles);
      const top = contributors[0];
      if (top && total > 0) {
        insights.triangleContributorSummary = `${top.id}:${top.triangles}`;
        insights.topContributorShare = top.triangles / total;
      }
    }
    insights.frustumCulledDisabledCount = frustumCulledDisabledCount;
    if (oversizedMeasured) insights.oversizedBoundCount = oversizedBoundCount;
    if (shadowTriKnown) insights.shadowTriangleCount = shadowTriangles;
    if (shadowCameras.length > 0) {
      let outside = 0;
      for (const caster of casters) {
        const missesAll = shadowCameras.every(
          (cam) => sphereOutsideShadowCamera(caster.center[0], caster.center[1], caster.center[2], caster.radius, cam)
        );
        if (missesAll) outside += 1;
      }
      insights.shadowCastersOutsideFrustum = outside;
    }
    insights.zeroIntensityLightCount = zeroIntensityLightCount;
    if (instancedKnown) insights.instancedBufferBytes = instancedBytes;
    if (composerRef.current) {
      const size = readComposerSize(composerRef.current);
      assignDefined(insights, "composerWidth", size.width);
      assignDefined(insights, "composerHeight", size.height);
      assignDefined(insights, "composerPixelRatio", size.pixelRatio);
    }
    return { stats, lights, textures: sized, insights };
  }
  var INSIGHT_KEYS = [
    "geometryTriangleCount",
    "triangleContributorSummary",
    "topContributorShare",
    "frustumCulledDisabledCount",
    "oversizedBoundCount",
    "shadowTriangleCount",
    "shadowCastersOutsideFrustum",
    "zeroIntensityLightCount",
    "instancedBufferBytes",
    "composerPixelRatio",
    "composerWidth",
    "composerHeight",
    "drawingBufferWidth",
    "drawingBufferHeight"
  ];
  function applyHostInsights(snapshot, insights) {
    const next = { ...snapshot };
    for (const key of INSIGHT_KEYS) {
      const value = insights[key];
      if (value !== void 0) {
        ;
        next[key] = value;
      }
    }
    return next;
  }

  // ../../packages/runtime/src/gpu-timer.ts
  function createGpuFrameSampler(renderer) {
    const gl = renderer.getContext?.();
    const extName = "EXT_disjoint_timer_query_webgl2";
    let ext;
    try {
      ext = renderer.getExtension?.(extName) ?? gl?.getExtension?.(extName);
    } catch {
      ext = void 0;
    }
    if (!ext || typeof ext !== "object") return void 0;
    const api = ext;
    if (typeof api.createQuery !== "function" || typeof api.beginQuery !== "function") return void 0;
    const target = api.TIME_ELAPSED_EXT;
    if (typeof target !== "number") return void 0;
    let query;
    return {
      begin() {
        try {
          query = api.createQuery?.();
          if (query) api.beginQuery?.(target, query);
        } catch {
          query = void 0;
        }
      },
      end() {
        try {
          api.endQuery?.(target);
          if (!query || typeof api.getQueryParameter !== "function") return void 0;
          const available = api.getQueryParameter(query, api.QUERY_RESULT_AVAILABLE ?? 34919);
          if (available !== true) return void 0;
          const ns = api.getQueryParameter(query, api.QUERY_RESULT ?? 34918);
          if (typeof ns !== "number" || !Number.isFinite(ns)) return void 0;
          return ns / 1e6;
        } catch {
          return void 0;
        }
      }
    };
  }

  // ../../packages/runtime/src/doctor.ts
  var PASS_REGISTRY = {
    "dpr-cap": dprCapPass,
    "pixel-budget": pixelBudgetPass,
    "shadow-budget": shadowBudgetPass,
    "postfx-budget": postfxBudgetPass,
    "tone-map-lite": toneMapLitePass,
    "anisotropy-cap": anisotropyCapPass,
    "frameloop-demand": frameloopDemandPass,
    "distance-cull": distanceCullPass,
    "material-downgrade": materialDowngradePass
  };
  function diffMetrics(baseline, after) {
    const deltas = {};
    Object.keys(baseline).forEach((key) => {
      const before = baseline[key];
      const next = after[key];
      if (typeof before === "number" && typeof next === "number") {
        deltas[key] = next - before;
      }
    });
    return deltas;
  }
  function snapshotFrom(sample, renderer, scene, continuousFrameloop, camera) {
    let objectCount = 0;
    let meshCount = 0;
    let matrixAutoUpdateCount = 0;
    const geometries = [];
    const materials = [];
    scene.traverse((obj) => {
      objectCount += 1;
      if (obj.isMesh) meshCount += 1;
      if (obj.matrixAutoUpdate) matrixAutoUpdateCount += 1;
      if (obj.geometry?.uuid) geometries.push({ uuid: obj.geometry.uuid });
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const mat of mats) {
        if (mat.uuid) materials.push({ uuid: mat.uuid });
      }
    });
    const collected = collectHostSceneStats(scene, renderer, camera);
    const walked = snapshotScene({
      objectCount,
      meshCount,
      geometries,
      materials,
      textures: collected.textures,
      lights: collected.lights,
      drawCalls: sample.drawCalls,
      triangles: sample.triangles,
      continuousFrameloop,
      matrixAutoUpdateCount,
      rendererPixelRatio: readRendererPixelRatio(renderer),
      antialias: readRendererAntialias(renderer)
    });
    const merged = {
      ...walked,
      geometryCount: sample.geometryCount,
      textureCount: sample.textureCount,
      estimatedVramBytes: sample.estimatedVramBytes ?? walked.estimatedVramBytes,
      lightCount: sample.lightCount,
      shadowCastingLightCount: sample.shadowCastingLightCount
    };
    if (sample.gpuFrameTimeMs !== void 0) merged.gpuFrameTimeMs = sample.gpuFrameTimeMs;
    return applyHostInsights(merged, collected.insights);
  }
  function applyCameraPose(camera, pose) {
    if (!camera || typeof camera !== "object") return;
    const pos = camera.position;
    if (!pos || typeof pos !== "object") return;
    pos.x = pose.x;
    pos.y = pose.y;
    pos.z = pose.z;
  }
  function readVisibilityState() {
    if (typeof document === "undefined") return void 0;
    return document.visibilityState;
  }
  function markReportValidity(report, sample) {
    if (!sample?.invalid) return;
    report.invalid = true;
    report.incomplete = true;
    if (sample.invalidReason) report.invalidReason = sample.invalidReason;
  }
  function cameraPositionOf(camera) {
    if (!camera || typeof camera !== "object") return void 0;
    const pos = camera.position;
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" || typeof pos.z !== "number") {
      return void 0;
    }
    return { x: pos.x, y: pos.y, z: pos.z };
  }
  function resolvePassIds(tokens, profile) {
    const ids = [];
    const seen = /* @__PURE__ */ new Set();
    for (const token of tokens) {
      const chunk = token === "safe" ? safePassesFor(profile) : token === "aggressive" ? AGGRESSIVE_PASSES : [token];
      for (const id of chunk) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  }
  var Doctor = class {
    constructor(opts2) {
      this.opts = opts2;
      this.frameloop = opts2.frameloop ?? "always";
      this.postfxEnabled = opts2.postfxEnabled ?? false;
    }
    baseline;
    lastSnapshot;
    previousSnapshot;
    lastReport;
    handles = [];
    overlay;
    qualityHudGetter;
    frameloop;
    postfxEnabled;
    pinnedAutoProfile;
    device() {
      if (this.opts.device) return this.opts.device;
      const windowDpr = typeof globalThis !== "undefined" && typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : void 0;
      const rendererDpr = readRendererPixelRatio(this.opts.renderer);
      const hostDpr = windowDpr ?? rendererDpr;
      const probe = {
        webgl: true
      };
      if (typeof hostDpr === "number" && Number.isFinite(hostDpr)) {
        probe.devicePixelRatio = hostDpr;
      }
      if (typeof navigator !== "undefined") {
        if (typeof navigator.hardwareConcurrency === "number") {
          probe.hardwareConcurrency = navigator.hardwareConcurrency;
        }
        const nav = navigator;
        if (typeof nav.deviceMemory === "number") {
          probe.deviceMemory = nav.deviceMemory;
        }
        if (typeof nav.maxTouchPoints === "number") {
          probe.maxTouchPoints = nav.maxTouchPoints;
        }
      }
      if (typeof matchMedia === "function") {
        probe.coarsePointer = matchMedia("(pointer: coarse)").matches;
      }
      const getExtension = this.opts.renderer.getExtension;
      const gl = typeof this.opts.renderer.getContext === "function" ? this.opts.renderer.getContext() : void 0;
      if (typeof getExtension === "function") {
        const signals = readWebglQualitySignals({
          getExtension: (name) => getExtension.call(this.opts.renderer, name)
        });
        if (signals.colorBufferFloat !== void 0) {
          probe.colorBufferFloat = signals.colorBufferFloat;
        }
        if (signals.floatLinear !== void 0) {
          probe.floatLinear = signals.floatLinear;
        }
      }
      if (gl) {
        const gpuSource = {
          getExtension: (name) => gl.getExtension?.(name)
        };
        if (typeof gl.getParameter === "function") {
          gpuSource.getParameter = gl.getParameter.bind(gl);
        }
        if (typeof gl.MAX_TEXTURE_SIZE === "number") {
          gpuSource.MAX_TEXTURE_SIZE = gl.MAX_TEXTURE_SIZE;
        }
        if (typeof gl.MAX_RENDERBUFFER_SIZE === "number") {
          gpuSource.MAX_RENDERBUFFER_SIZE = gl.MAX_RENDERBUFFER_SIZE;
        }
        const gpuLimits = readWebglQualitySignals(gpuSource);
        if (gpuLimits.maxTextureSize !== void 0) {
          probe.maxTextureSize = gpuLimits.maxTextureSize;
        }
        if (gpuLimits.maxRenderbufferSize !== void 0) {
          probe.maxRenderbufferSize = gpuLimits.maxRenderbufferSize;
        }
      }
      return probeDevice(probe);
    }
    collector() {
      return new MetricsCollector({
        getRendererInfo: () => this.opts.renderer.info,
        getSceneStats: this.opts.getSceneStats ?? (() => collectHostSceneStats(this.opts.scene, this.opts.renderer).stats)
      });
    }
    currentSnapshot(sample) {
      return snapshotFrom(
        sample,
        this.opts.renderer,
        this.opts.scene,
        this.frameloop === "always",
        this.opts.camera
      );
    }
    ruleContext(snapshot, device, profile) {
      const ctx = { snapshot, device, profile };
      if (this.previousSnapshot) ctx.previousSnapshot = this.previousSnapshot;
      return ctx;
    }
    concreteProfile(snap) {
      const requested = this.opts.profile ?? "auto";
      if (requested !== "auto") return requested;
      if (this.pinnedAutoProfile) return this.pinnedAutoProfile;
      this.pinnedAutoProfile = resolveProfile("auto", snap);
      return this.pinnedAutoProfile;
    }
    /**
     * Profile used for generic caps. Defaults to `game` when unset so safe-auto
     * never demand-loops a continuous RAF host by assuming marketing/static.
     */
    resolvedProfile() {
      if (this.lastSnapshot) return this.concreteProfile(this.lastSnapshot);
      if (this.opts.profile && this.opts.profile !== "auto") return this.opts.profile;
      return this.lastReport?.profile ?? "game";
    }
    genericSafePasses() {
      return safePassesFor(this.resolvedProfile());
    }
    hostRenderPath() {
      if (this.opts.renderFrame) return this.opts.renderFrame;
      const render = this.opts.renderer.render;
      if (typeof render === "function") {
        return () => render.call(this.opts.renderer, this.opts.scene, this.opts.camera);
      }
      return void 0;
    }
    getDevice() {
      return this.device();
    }
    async measure(frameCount) {
      const frames = frameCount ?? this.opts.measureFrames ?? 30;
      const now = this.opts.now ?? (() => performance.now());
      const waitFrame = this.opts.waitFrame;
      const renderFrame = waitFrame ? void 0 : this.hostRenderPath();
      const collector = this.collector();
      const info = this.opts.renderer.info;
      const hadAutoReset = Object.prototype.hasOwnProperty.call(info, "autoReset");
      const prevAutoReset = info.autoReset;
      const gpu = createGpuFrameSampler(this.opts.renderer);
      info.autoReset = false;
      let lastCalls = info.render.calls;
      let lastTriangles = info.render.triangles;
      const gpuTimes = [];
      try {
        for (let i = 0; i < frames; i++) {
          info.reset?.();
          const start = now();
          collector.beginFrame(start);
          gpu?.begin();
          if (waitFrame) await waitFrame();
          else if (renderFrame) await renderFrame();
          const gpuMs = gpu?.end();
          if (gpuMs !== void 0) gpuTimes.push(gpuMs);
          collector.endFrame(now());
          lastCalls = info.render.calls;
          lastTriangles = info.render.triangles;
        }
      } finally {
        if (hadAutoReset) info.autoReset = prevAutoReset;
        else delete info.autoReset;
      }
      const sample = collector.sample();
      sample.drawCalls = lastCalls;
      sample.triangles = lastTriangles;
      if (gpuTimes.length > 0) {
        sample.gpuFrameTimeMs = gpuTimes.reduce((a, b) => a + b, 0) / gpuTimes.length;
      }
      const liveClock = this.opts.now === void 0;
      const validityInput = {
        frameTimesMs: [...collector.frameTimes()]
      };
      const visibility = liveClock ? readVisibilityState() : "visible";
      if (visibility !== void 0) validityInput.visibilityState = visibility;
      const validity = classifyMeasureValidity(validityInput);
      if (validity.invalid) {
        sample.invalid = true;
        if (validity.reason) sample.invalidReason = validity.reason;
      }
      const width = this.opts.renderer.drawingBufferWidth;
      const height = this.opts.renderer.drawingBufferHeight;
      const measured = typeof width === "number" && typeof height === "number" ? { ...sample, drawingBufferPixels: width * height } : sample;
      this.previousSnapshot = this.lastSnapshot;
      this.lastSnapshot = this.currentSnapshot(measured);
      this.baseline = measured;
      return measured;
    }
    async buildDiagnoseReport() {
      const baseline = this.baseline ?? await this.measure();
      const device = this.device();
      const snap = this.currentSnapshot(baseline);
      const profile = this.concreteProfile(snap);
      const findings = runRules(this.ruleContext(snap, device, profile));
      const score = computeDoctorScore(findings, snap, profile, this.previousSnapshot);
      const report = {
        profile,
        mode: this.opts.mode ?? "diagnose",
        score,
        findings,
        baseline,
        appliedPasses: [],
        failedPasses: [],
        incomplete: false
      };
      markReportValidity(report, baseline);
      return report;
    }
    async diagnose() {
      const report = await this.buildDiagnoseReport();
      this.lastReport = report;
      this.overlay?.refresh();
      return report;
    }
    applyPassesImmediate(passIds, extras) {
      const device = this.device();
      const cameraPosition = cameraPositionOf(this.opts.camera);
      const profile = this.resolvedProfile();
      const ctx = {
        renderer: this.opts.renderer,
        scene: this.opts.scene,
        device,
        profile,
        postfxEnabled: this.postfxEnabled,
        setPostfxEnabled: (enabled) => {
          this.postfxEnabled = enabled;
          this.opts.setPostfxEnabled?.(enabled);
        },
        frameloop: this.frameloop,
        setFrameloop: (mode) => {
          if (!this.opts.setFrameloop) return;
          this.frameloop = mode;
          this.opts.setFrameloop(mode);
        }
      };
      if (cameraPosition) ctx.cameraPosition = cameraPosition;
      if (extras?.qualityTier) ctx.qualityTier = extras.qualityTier;
      const appliedPasses = [];
      const failedPasses = [];
      for (const id of passIds) {
        let handle;
        try {
          const pass = PASS_REGISTRY[id];
          handle = pass.apply(ctx);
          this.handles.push(handle);
          appliedPasses.push(id);
        } catch (err) {
          try {
            handle?.rollback();
          } catch {
          }
          failedPasses.push({
            id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      return { appliedPasses, failedPasses };
    }
    rollbackAll() {
      for (let i = this.handles.length - 1; i >= 0; i--) {
        try {
          this.handles[i].rollback();
        } catch {
        }
      }
      this.handles = [];
    }
    attachQualityHud(getter) {
      this.qualityHudGetter = getter;
      this.overlay?.refresh();
    }
    refreshOverlay() {
      this.overlay?.refresh();
    }
    reclampPixelRatioCeiling(maxRatio) {
      const current = readRendererPixelRatio(this.opts.renderer);
      if (current !== void 0 && current > maxRatio) {
        this.opts.renderer.setPixelRatio(maxRatio);
      }
    }
    forceDrawingBufferPixels(maxPixels) {
      const renderer = this.opts.renderer;
      const width = renderer.drawingBufferWidth;
      const height = renderer.drawingBufferHeight;
      if (width === void 0 || height === void 0) return;
      const current = width * height;
      if (!(current > maxPixels)) return;
      if (typeof renderer.setDrawingBufferSize !== "function") return;
      const scale = Math.sqrt(maxPixels / current);
      const newW = Math.max(1, Math.floor(width * scale));
      const newH = Math.max(1, Math.floor(height * scale));
      const prevRatio = readRendererPixelRatio(renderer);
      if (prevRatio === void 0 || !(prevRatio > 0)) return;
      const pr = prevRatio;
      try {
        renderer.setDrawingBufferSize(newW / pr, newH / pr, pr);
      } catch {
        try {
          renderer.setDrawingBufferSize(width / pr, height / pr, pr);
        } catch {
        }
      }
    }
    forcePostfxOff() {
      this.postfxEnabled = false;
      try {
        this.opts.setPostfxEnabled?.(false);
      } catch {
      }
    }
    forceShadowsOff() {
      try {
        if (this.opts.renderer.shadowMap) {
          this.opts.renderer.shadowMap.enabled = false;
        }
        this.opts.scene.traverse((obj) => {
          if (obj.castShadow) obj.castShadow = false;
        });
      } catch {
      }
    }
    async compareAb(opts2 = {}) {
      const rounds = opts2.rounds ?? 2;
      const pose = opts2.poses?.[0];
      const a = [];
      const b = [];
      for (let i = 0; i < rounds; i++) {
        if (pose) applyCameraPose(this.opts.camera, pose);
        a.push(await this.measure(opts2.frames));
        await opts2.applyB?.();
        if (pose) applyCameraPose(this.opts.camera, pose);
        b.push(await this.measure(opts2.frames));
        await opts2.restoreA?.();
      }
      return compareAbSamples({ a, b });
    }
    async optimize(options = {}) {
      const diagnosed = await this.buildDiagnoseReport();
      let controlChangedRatio = 0;
      let baselinePixels;
      if (options.visualGate) {
        const first = await options.visualGate.capture();
        const second = await options.visualGate.capture();
        baselinePixels = first;
        controlChangedRatio = pixelChangedRatio(first, second, options.visualGate.channelThreshold);
      }
      const passIds = resolvePassIds(options.apply ?? ["safe"], diagnosed.profile);
      const { appliedPasses, failedPasses } = this.applyPassesImmediate(passIds);
      const device = this.device();
      let after;
      let incomplete = false;
      try {
        after = await this.measure();
      } catch {
        incomplete = true;
        after = void 0;
      }
      const sampleForRules = after ?? diagnosed.baseline;
      const snap = this.currentSnapshot(sampleForRules);
      const findings = runRules(this.ruleContext(snap, device, diagnosed.profile));
      const score = computeDoctorScore(findings, snap, diagnosed.profile, this.previousSnapshot);
      const report = {
        profile: diagnosed.profile,
        mode: "optimize",
        score,
        findings,
        baseline: diagnosed.baseline,
        appliedPasses,
        failedPasses,
        incomplete
      };
      if (after) {
        report.after = after;
        report.deltas = diffMetrics(diagnosed.baseline, after);
      }
      markReportValidity(report, after ?? diagnosed.baseline);
      if (options.visualGate && baselinePixels) {
        const candidate = await options.visualGate.capture();
        const candidateChangedRatio = pixelChangedRatio(
          baselinePixels,
          candidate,
          options.visualGate.channelThreshold
        );
        const verdictOpts = { controlChangedRatio, candidateChangedRatio };
        if (options.visualGate.maxChangedRatio !== void 0) {
          verdictOpts.maxChangedRatio = options.visualGate.maxChangedRatio;
        }
        const verdict = classifyVisualSafety(verdictOpts);
        if (verdict.visualDelta) report.visualDelta = true;
      }
      this.lastReport = report;
      this.overlay?.refresh();
      return report;
    }
    mountOverlay() {
      if (this.overlay) return;
      this.overlay = mountOverlay({
        getScore: () => this.lastReport?.score ?? 0,
        getBaseline: () => this.lastReport?.baseline ?? this.baseline,
        getAfter: () => this.lastReport?.after,
        getQualityHud: () => this.qualityHudGetter?.()
      });
    }
    unmountOverlay() {
      this.overlay?.unmount();
      this.overlay = void 0;
    }
  };

  // ../../packages/runtime/src/quality-controller.ts
  function knobsFor(tier, capabilities) {
    const table = ADAPTER_KNOBS[tier];
    const knobs = {};
    const applied = [];
    const advertised = new Set(capabilities);
    const unsupported = [];
    const maybeSet = (key, cap) => {
      const value = table[key];
      if (value === void 0) return;
      if (!advertised.has(cap)) {
        if (!unsupported.includes(cap)) unsupported.push(cap);
        return;
      }
      knobs[key] = value;
      applied.push({ capability: cap, value });
    };
    maybeSet("fftSize", "fftSize");
    maybeSet("spectrumEveryNFrames", "fftSize");
    maybeSet("rtScale", "rtScale");
    maybeSet("meshLod", "meshLod");
    maybeSet("deferredHdr", "deferredHdr");
    return { knobs, applied, unsupported };
  }
  function copyExtras(sample, extras) {
    if (!extras) return sample;
    const next = { ...sample };
    if (typeof extras.simPassCount === "number") next.simPassCount = extras.simPassCount;
    if (typeof extras.bytesLoaded === "number") next.bytesLoaded = extras.bytesLoaded;
    if (typeof extras.compileMs === "number") next.compileMs = extras.compileMs;
    return next;
  }
  function isUsableSample(sample) {
    return !!sample && sample.p95FrameTimeMs > 0;
  }
  function isBrokenAfterGeometry(baseline, after) {
    const hadGeometry = baseline.drawCalls > 0 || baseline.triangles > 0;
    return hadGeometry && after.drawCalls === 0 && after.triangles === 0;
  }
  function floorFailedFinding(sample) {
    const evidence = {
      floorFailed: true,
      targetFps: HYSTERESIS.targetFps
    };
    if (sample && typeof sample.p95FrameTimeMs === "number") {
      evidence.p95FrameTimeMs = sample.p95FrameTimeMs;
    }
    if (sample && typeof sample.avgFps === "number") {
      evidence.avgFps = sample.avgFps;
    }
    return {
      id: "quality/floor-failed",
      severity: "warn",
      evidence,
      message: "Quality ladder floor failed; still below target FPS after potato caps",
      suggestedFix: "Prefer FPS recovery over fidelity: skip RT resizes, raise spectrumEveryNFrames, keep generic caps tight"
    };
  }
  function withFloorFailedFinding(findings, sample) {
    if (findings.some((f) => f.id === "quality/floor-failed")) return findings;
    return [...findings, floorFailedFinding(sample)];
  }
  function withoutFloorFailedFinding(findings) {
    return findings.filter((f) => f.id !== "quality/floor-failed");
  }
  function meetsFpsTarget(sample) {
    return sample.p95FrameTimeMs <= HYSTERESIS.dropP95Ms && sample.avgFps >= HYSTERESIS.targetFps;
  }
  function hasGeometry(sample) {
    return sample.drawCalls > 0 || sample.triangles > 0;
  }
  function diffMetrics2(baseline, after) {
    const deltas = {};
    Object.keys(baseline).forEach((key) => {
      const before = baseline[key];
      const next = after[key];
      if (typeof before === "number" && typeof next === "number") {
        deltas[key] = next - before;
      }
    });
    return deltas;
  }
  var QualityController = class {
    constructor(doctor, options = {}) {
      this.doctor = doctor;
      this.options = options;
      this.mode = options.mode ?? "safe-auto";
      this.doctor.attachQualityHud(() => this.hudState());
    }
    mode;
    adapter;
    booted = false;
    knobHandles = [];
    exclusive;
    last;
    potatoFloorTightened = false;
    potatoFloorNudged = false;
    potatoFloorHopeless = false;
    potatoOceanFrozen = false;
    registerAdapter(adapter) {
      this.adapter = adapter;
    }
    setMode(mode) {
      this.mode = mode;
    }
    async boot() {
      const now = this.options.now ?? (() => performance.now());
      const bootStart = now();
      const device = this.doctor.getDevice();
      const resolved = resolveStartTier(device);
      const startTier = this.options.startTier && this.options.startTier !== "auto" ? this.options.startTier : resolved.startTier;
      const maxTier = this.options.maxTier && this.options.maxTier !== "auto" ? this.options.maxTier : resolved.maxTier;
      const findings = [];
      if (resolved.noFloatRt) {
        findings.push({
          id: "quality/no-float-rt",
          severity: "warn",
          evidence: { colorBufferFloat: false },
          message: "Floating-point color buffers unavailable; ladder locked to potato",
          suggestedFix: "Use a WebGL context with EXT_color_buffer_float, or stay on potato generic caps"
        });
      }
      const appliedPasses = [];
      const failedPasses = [];
      const appliedKnobs = [];
      let unsupportedKnobs = [];
      let applyFailed = false;
      let adapterUnavailable = false;
      if (this.mode !== "advise") {
        if (this.mode === "takeover") {
          try {
            this.exclusive = this.adapter?.takeExclusiveControl?.();
          } catch {
            this.exclusive = void 0;
            applyFailed = true;
          }
        }
        const result = this.doctor.applyPassesImmediate(this.doctor.genericSafePasses(), {
          qualityTier: startTier
        });
        appliedPasses.push(...result.appliedPasses);
        failedPasses.push(...result.failedPasses);
        if (failedPasses.length > 0) applyFailed = true;
        if (this.adapter) {
          let caps;
          try {
            caps = this.adapter.capabilities();
          } catch {
            caps = [];
            adapterUnavailable = true;
          }
          if (caps.length === 0) {
            adapterUnavailable = true;
          } else {
            const filtered = knobsFor(startTier, caps);
            unsupportedKnobs = filtered.unsupported;
            let handle;
            try {
              handle = this.adapter.apply(startTier, filtered.knobs);
              this.knobHandles.push(handle);
              appliedKnobs.push(...filtered.applied);
            } catch {
              try {
                handle?.rollback();
              } catch {
              }
              applyFailed = true;
            }
          }
        }
      }
      let ttfiMs;
      let incomplete = false;
      const waitInteractive = this.options.waitForFirstInteractive;
      if (waitInteractive) {
        try {
          await waitInteractive();
          ttfiMs = now() - bootStart;
        } catch {
          incomplete = true;
        }
      }
      const diagnosed = await this.doctor.diagnose();
      let extras;
      try {
        extras = this.adapter?.readExtras?.();
      } catch {
        extras = void 0;
      }
      let baseline = copyExtras(diagnosed.baseline, extras);
      const bytesLoaded = this.maybeBytesLoaded(bootStart);
      if (typeof bytesLoaded === "number" && typeof extras?.bytesLoaded !== "number") {
        baseline = { ...baseline, bytesLoaded };
      }
      if (typeof extras?.simPassCount === "number") {
        findings.push({
          id: "quality/heavy-sim-passes",
          severity: "info",
          evidence: { simPassCount: extras.simPassCount },
          message: `Adapter reported ${extras.simPassCount} simulation passes`,
          suggestedFix: "Lower fftSize or skip spectrum frames on this tier"
        });
      }
      const report = {
        profile: diagnosed.profile,
        mode: diagnosed.mode,
        qualityMode: this.mode,
        phase: "runtime",
        tier: startTier,
        startTier,
        maxTier,
        score: diagnosed.score,
        findings: [...diagnosed.findings, ...findings],
        baseline,
        appliedPasses,
        appliedKnobs,
        failedPasses,
        unsupportedKnobs,
        floorFailed: false,
        applyFailed,
        incomplete
      };
      if (ttfiMs !== void 0) report.ttfiMs = ttfiMs;
      if (adapterUnavailable) report.adapterUnavailable = true;
      if (this.mode === "advise") report.recommendedTier = startTier;
      this.booted = true;
      this.publish(report);
      return report;
    }
    async runLadder() {
      if (!this.booted) await this.boot();
      const windowFrames = this.options.windowFrames ?? HYSTERESIS.windowFrames;
      let state = createHysteresisState({
        tier: this.last.tier,
        maxTier: this.last.maxTier,
        phase: "runtime"
      });
      let baseline;
      let after;
      let incomplete = this.last.incomplete;
      let holdsAtTarget = 0;
      let pendingApplyFailed = this.last.applyFailed;
      const bootSample = this.mergeExtras(this.last.baseline);
      if (isUsableSample(bootSample) && this.shouldSeedBootWindow(bootSample, pendingApplyFailed)) {
        baseline = bootSample;
        const seeded = this.applyWindowDecision(state, bootSample, pendingApplyFailed, baseline, incomplete, {
          allowStop: false,
          holdsAtTarget
        });
        state = seeded.state;
        pendingApplyFailed = seeded.pendingApplyFailed;
        holdsAtTarget = seeded.holdsAtTarget;
      }
      const maxWindows = 12;
      try {
        for (let w = 0; w < maxWindows; w++) {
          if (this.mode !== "advise") this.clampCeiling(state.tier);
          let sample;
          try {
            sample = this.mergeExtras(await this.doctor.measure(windowFrames));
          } catch {
            const fallback = after ?? baseline ?? this.last?.baseline;
            if (isUsableSample(fallback)) {
              if (!baseline) baseline = fallback;
              const recovered = this.applyWindowDecision(
                state,
                fallback,
                pendingApplyFailed,
                baseline,
                true,
                { holdsAtTarget }
              );
              state = recovered.state;
            }
            incomplete = true;
            after = void 0;
            break;
          }
          if (!isUsableSample(sample)) {
            continue;
          }
          const geometryRef = baseline ?? this.last?.baseline;
          if (geometryRef && isBrokenAfterGeometry(geometryRef, sample)) {
            this.markCollapsedAfter(geometryRef);
            incomplete = true;
            after = void 0;
            baseline = geometryRef;
            break;
          }
          if (!baseline) baseline = sample;
          after = sample;
          const stepped = this.applyWindowDecision(state, sample, pendingApplyFailed, baseline, incomplete, {
            holdsAtTarget
          });
          state = stepped.state;
          pendingApplyFailed = stepped.pendingApplyFailed;
          holdsAtTarget = stepped.holdsAtTarget;
          if (stepped.stop) break;
        }
      } catch {
        incomplete = true;
        after = void 0;
      }
      const report = this.finalize(state, baseline ?? this.last.baseline, after, incomplete, holdsAtTarget);
      this.publish(report);
      return report;
    }
    dispose() {
      for (let i = this.knobHandles.length - 1; i >= 0; i--) {
        try {
          this.knobHandles[i].rollback();
        } catch {
        }
      }
      this.knobHandles = [];
      this.doctor.rollbackAll();
      try {
        this.exclusive?.release();
      } catch {
      }
      this.exclusive = void 0;
    }
    publish(report) {
      this.last = report;
      this.doctor.refreshOverlay();
      this.options.onReport?.(report);
    }
    shouldSeedBootWindow(sample, applyFailed) {
      if (sample.p95FrameTimeMs >= HYSTERESIS.emergencyP95Ms) return true;
      return applyFailed && sample.p95FrameTimeMs > HYSTERESIS.dropP95Ms;
    }
    applyWindowDecision(state, sample, pendingApplyFailed, baseline, incomplete, opts2 = {}) {
      const allowStop = opts2.allowStop !== false;
      let holdsAtTarget = opts2.holdsAtTarget ?? 0;
      const decision = evaluateWindow(state, sample.p95FrameTimeMs, {
        applyFailed: pendingApplyFailed
      });
      const last = this.last;
      const broken = isBrokenAfterGeometry(baseline, sample);
      const reportIncomplete = incomplete || broken;
      if (this.mode === "advise") {
        const nextState = { ...decision.next, tier: state.tier };
        const advised = {
          ...last,
          recommendedTier: decision.next.tier,
          baseline,
          incomplete: reportIncomplete
        };
        if (!reportIncomplete) {
          advised.after = sample;
          advised.deltas = diffMetrics2(baseline, sample);
        } else {
          delete advised.after;
          delete advised.deltas;
        }
        this.publish(advised);
        holdsAtTarget = sample.p95FrameTimeMs <= HYSTERESIS.dropP95Ms ? holdsAtTarget + 1 : 0;
        const stop = allowStop && (holdsAtTarget >= 3 || decision.reason === "floor");
        return { state: nextState, pendingApplyFailed: false, holdsAtTarget, stop };
      }
      if (decision.action === "drop" || decision.action === "climb") {
        if (decision.action === "climb" && last.floorFailed && meetsFpsTarget(sample)) {
          const nextHolds = (opts2.holdsAtTarget ?? 0) + 1;
          const published = {
            ...last,
            tier: state.tier,
            baseline,
            incomplete: reportIncomplete
          };
          if (!reportIncomplete) {
            published.after = sample;
            published.deltas = diffMetrics2(baseline, sample);
          } else {
            delete published.after;
            delete published.deltas;
          }
          this.publish(published);
          return {
            state,
            pendingApplyFailed: false,
            holdsAtTarget: nextHolds,
            stop: allowStop && nextHolds >= 3
          };
        }
        const rungFailed = this.applyRung(decision.next.tier);
        if (this.last) {
          const published = {
            ...this.last,
            baseline,
            incomplete: reportIncomplete
          };
          if (!reportIncomplete) {
            published.after = sample;
            published.deltas = diffMetrics2(baseline, sample);
          } else {
            delete published.after;
            delete published.deltas;
          }
          this.publish(published);
        }
        return {
          state: decision.next,
          pendingApplyFailed: rungFailed,
          holdsAtTarget: 0,
          stop: false
        };
      }
      const nextLast = {
        ...last,
        tier: decision.next.tier,
        baseline,
        incomplete: reportIncomplete
      };
      if (decision.reason === "floor") {
        nextLast.floorFailed = true;
        nextLast.tier = "potato";
        nextLast.findings = withFloorFailedFinding(nextLast.findings, sample);
      }
      if (!reportIncomplete) {
        nextLast.after = sample;
        nextLast.deltas = diffMetrics2(baseline, sample);
      } else {
        delete nextLast.after;
        delete nextLast.deltas;
      }
      this.publish(nextLast);
      if (decision.reason === "floor") {
        if (!this.potatoFloorTightened && sample.p95FrameTimeMs > HYSTERESIS.dropP95Ms) {
          this.tightenPotatoFloor(POTATO_FLOOR_CAPS);
          this.potatoFloorTightened = true;
          return {
            state: decision.next,
            pendingApplyFailed: false,
            holdsAtTarget: 0,
            stop: false
          };
        }
        if (this.potatoFloorTightened && !this.potatoFloorHopeless && sample.p95FrameTimeMs > HYSTERESIS.dropP95Ms && sample.avgFps < POTATO_HOPELESS_MAX_AVG_FPS) {
          this.tightenPotatoFloor(POTATO_HOPELESS_CAPS);
          const freezeCascades = sample.avgFps < POTATO_OCEAN_FREEZE_MAX_AVG_FPS;
          this.pausePotatoSpectrum({ freezeCascades });
          this.potatoFloorHopeless = true;
          this.potatoOceanFrozen = freezeCascades;
          return {
            state: decision.next,
            pendingApplyFailed: false,
            holdsAtTarget: 0,
            stop: false
          };
        }
        if (this.potatoFloorTightened && this.potatoFloorHopeless && !this.potatoOceanFrozen && sample.p95FrameTimeMs > HYSTERESIS.dropP95Ms && sample.avgFps < POTATO_OCEAN_FREEZE_MAX_AVG_FPS) {
          this.pausePotatoSpectrum({ freezeCascades: true });
          this.potatoOceanFrozen = true;
          return {
            state: decision.next,
            pendingApplyFailed: false,
            holdsAtTarget: 0,
            stop: false
          };
        }
        if (this.potatoFloorTightened && !this.potatoFloorNudged && !this.potatoFloorHopeless && sample.p95FrameTimeMs > HYSTERESIS.dropP95Ms && sample.avgFps >= POTATO_NEAR_MISS_MIN_AVG_FPS && sample.avgFps < HYSTERESIS.targetFps) {
          this.tightenPotatoFloor(POTATO_NEAR_MISS_CAPS);
          this.potatoFloorNudged = true;
          return {
            state: decision.next,
            pendingApplyFailed: false,
            holdsAtTarget: 0,
            stop: false
          };
        }
        return {
          state: decision.next,
          pendingApplyFailed: false,
          holdsAtTarget: 0,
          stop: allowStop
        };
      }
      const atTarget = meetsFpsTarget(sample);
      const waitingToClimb = sample.p95FrameTimeMs <= HYSTERESIS.climbP95Ms && decision.reason !== "ceiling";
      holdsAtTarget = atTarget && (!waitingToClimb || last.floorFailed) ? holdsAtTarget + 1 : 0;
      return {
        state: decision.next,
        pendingApplyFailed: false,
        holdsAtTarget,
        stop: allowStop && holdsAtTarget >= 3
      };
    }
    hudState() {
      if (!this.last) return void 0;
      const sample = this.last.after ?? this.last.baseline;
      const state = {
        score: this.last.score,
        profile: this.last.profile,
        qualityMode: this.last.qualityMode,
        startTier: this.last.startTier,
        tier: this.last.tier
      };
      if (this.last.ttfiMs !== void 0) state.ttfiMs = this.last.ttfiMs;
      if (typeof sample.avgFps === "number") state.avgFps = sample.avgFps;
      if (typeof sample.p95FrameTimeMs === "number") state.p95FrameTimeMs = sample.p95FrameTimeMs;
      if (typeof sample.simPassCount === "number") state.simPassCount = sample.simPassCount;
      if (typeof sample.bytesLoaded === "number") state.bytesLoaded = sample.bytesLoaded;
      if (this.exclusive) state.exclusive = true;
      if (this.last.floorFailed) state.floorFailed = true;
      return state;
    }
    mergeExtras(sample) {
      let extras;
      try {
        extras = this.adapter?.readExtras?.();
      } catch {
        extras = void 0;
      }
      return copyExtras(sample, extras);
    }
    potatoPixelCeiling() {
      if (this.potatoFloorHopeless) return POTATO_HOPELESS_CAPS.pixelRatio;
      if (this.potatoFloorNudged) return POTATO_NEAR_MISS_CAPS.pixelRatio;
      if (this.potatoFloorTightened) return POTATO_FLOOR_CAPS.pixelRatio;
      return void 0;
    }
    clampCeiling(tier) {
      const floorCap = this.potatoPixelCeiling();
      const cap = floorCap !== void 0 && tier === "potato" ? floorCap : GENERIC_CAPS[tier].pixelRatio;
      this.doctor.reclampPixelRatioCeiling(cap);
    }
    tightenPotatoFloor(caps) {
      this.doctor.reclampPixelRatioCeiling(caps.pixelRatio);
      this.doctor.forceDrawingBufferPixels(caps.drawingBufferPixels);
      this.doctor.forcePostfxOff();
      this.doctor.forceShadowsOff();
    }
    pausePotatoSpectrum(opts2 = {}) {
      if (!this.adapter || this.mode === "advise") return;
      let caps;
      try {
        caps = this.adapter.capabilities();
      } catch {
        return;
      }
      if (caps.length === 0) return;
      const filtered = knobsFor("potato", caps);
      if (filtered.knobs.spectrumEveryNFrames === void 0) return;
      filtered.knobs.spectrumEveryNFrames = SPECTRUM_PAUSE_EVERY_N;
      if (opts2.freezeCascades) {
        const len = filtered.knobs.fftSize?.length ?? POTATO_OCEAN_FREEZE_FFT_SIZE.length;
        filtered.knobs.fftSize = Array.from({ length: len }, () => 0);
        filtered.knobs.effectQuality = POTATO_OCEAN_FREEZE_EFFECT_QUALITY;
      }
      const applied = filtered.applied.map((knob) => {
        if (knob.capability === "fftSize" && knob.value === ADAPTER_KNOBS.potato.spectrumEveryNFrames) {
          return { capability: knob.capability, value: SPECTRUM_PAUSE_EVERY_N };
        }
        if (opts2.freezeCascades && knob.capability === "fftSize" && Array.isArray(knob.value)) {
          return { capability: knob.capability, value: filtered.knobs.fftSize };
        }
        return knob;
      });
      if (!opts2.freezeCascades) this.rollbackAdapterKnobs();
      try {
        const handle = this.adapter.apply("potato", filtered.knobs);
        this.knobHandles.push(handle);
        if (this.last) this.last = { ...this.last, appliedKnobs: applied };
      } catch {
      }
    }
    rollbackAdapterKnobs() {
      for (let i = this.knobHandles.length - 1; i >= 0; i--) {
        try {
          this.knobHandles[i].rollback();
        } catch {
        }
      }
      this.knobHandles = [];
    }
    markCollapsedAfter(geometryBaseline) {
      this.rollbackAdapterKnobs();
      if (!this.last) return;
      const floorFailed = this.last.floorFailed || this.last.tier === "potato";
      const next = {
        ...this.last,
        baseline: geometryBaseline,
        applyFailed: true,
        incomplete: true,
        appliedKnobs: [],
        floorFailed
      };
      if (floorFailed) {
        next.findings = withFloorFailedFinding(
          this.last.findings,
          this.last.after ?? geometryBaseline
        );
      }
      delete next.after;
      delete next.deltas;
      this.last = next;
    }
    applyRung(tier) {
      this.rollbackAdapterKnobs();
      this.doctor.rollbackAll();
      const appliedPasses = [];
      const failedPasses = [];
      const appliedKnobs = [];
      let unsupportedKnobs = [];
      let thisRungFailed = false;
      let applyFailed = this.last?.applyFailed ?? false;
      let adapterUnavailable = this.last?.adapterUnavailable ?? false;
      const result = this.doctor.applyPassesImmediate(this.doctor.genericSafePasses(), {
        qualityTier: tier
      });
      appliedPasses.push(...result.appliedPasses);
      failedPasses.push(...result.failedPasses);
      if (failedPasses.length > 0) {
        applyFailed = true;
        thisRungFailed = true;
      }
      if (this.adapter && this.mode !== "advise") {
        let caps;
        try {
          caps = this.adapter.capabilities();
        } catch {
          caps = [];
          adapterUnavailable = true;
        }
        if (caps.length === 0) {
          adapterUnavailable = true;
        } else {
          const filtered = knobsFor(tier, caps);
          unsupportedKnobs = filtered.unsupported;
          let handle;
          try {
            handle = this.adapter.apply(tier, filtered.knobs);
            this.knobHandles.push(handle);
            appliedKnobs.push(...filtered.applied);
          } catch {
            try {
              handle?.rollback();
            } catch {
            }
            applyFailed = true;
            thisRungFailed = true;
          }
        }
      }
      if (this.last) {
        const next = {
          ...this.last,
          tier,
          appliedPasses,
          appliedKnobs,
          failedPasses,
          unsupportedKnobs,
          applyFailed
        };
        if (adapterUnavailable) next.adapterUnavailable = true;
        this.last = next;
      }
      return thisRungFailed;
    }
    finalize(state, baseline, after, incomplete, holdsAtTarget = 0) {
      const last = this.last;
      const geometryBaseline = hasGeometry(baseline) ? baseline : hasGeometry(last.baseline) ? last.baseline : baseline;
      let applyFailed = last.applyFailed;
      let appliedKnobs = last.appliedKnobs;
      let floorFailed = last.floorFailed;
      if (after !== void 0 && isBrokenAfterGeometry(geometryBaseline, after)) {
        this.markCollapsedAfter(geometryBaseline);
        incomplete = true;
        after = void 0;
        baseline = geometryBaseline;
        applyFailed = true;
        appliedKnobs = [];
        floorFailed = floorFailed || last.tier === "potato" || state.tier === "potato";
      }
      if (!incomplete && after !== void 0 && holdsAtTarget >= 3 && meetsFpsTarget(after)) {
        floorFailed = false;
      }
      const findings = floorFailed ? withFloorFailedFinding(last.findings, after ?? baseline) : withoutFloorFailedFinding(last.findings);
      const report = {
        profile: last.profile,
        mode: last.mode,
        qualityMode: this.mode,
        phase: "runtime",
        tier: floorFailed ? "potato" : state.tier,
        startTier: last.startTier,
        maxTier: last.maxTier,
        score: last.score,
        findings,
        baseline,
        appliedPasses: last.appliedPasses,
        appliedKnobs,
        failedPasses: last.failedPasses,
        unsupportedKnobs: last.unsupportedKnobs,
        floorFailed,
        applyFailed,
        incomplete
      };
      if (last.ttfiMs !== void 0) report.ttfiMs = last.ttfiMs;
      if (last.adapterUnavailable) report.adapterUnavailable = true;
      if (last.recommendedTier !== void 0) report.recommendedTier = last.recommendedTier;
      if (!incomplete && after !== void 0) {
        report.after = after;
        report.deltas = diffMetrics2(baseline, after);
      }
      return report;
    }
    maybeBytesLoaded(bootStart) {
      const perf = globalThis.performance;
      const entries = perf?.getEntriesByType?.("resource");
      if (!entries) return void 0;
      let sum = 0;
      let any = false;
      for (const e of entries) {
        if (e.startTime < bootStart) continue;
        if (typeof e.transferSize === "number" && e.transferSize > 0) {
          sum += e.transferSize;
          any = true;
        }
      }
      if (!any) return void 0;
      return sum;
    }
  };

  // src/discover.ts
  var DOCTOR_HOST_KEY = "__THREEJS_DOCTOR_HOST__";
  var DEEP_WALK_MAX_NODES = 5e3;
  var DEEP_WALK_MAX_DEPTH = 8;
  var DEEP_WALK_MAX_MS = 80;
  var SKIP_KEYS = /* @__PURE__ */ new Set([
    "document",
    "location",
    "navigation",
    "window",
    "self",
    "frames",
    "parent",
    "top",
    "navigator",
    "performance",
    "console",
    "localStorage",
    "sessionStorage",
    "history",
    "screen",
    "visualViewport",
    "crypto",
    "indexedDB",
    "chrome",
    "external",
    "css"
  ]);
  var CANVAS_SKIP_KEYS = /* @__PURE__ */ new Set([
    ...SKIP_KEYS,
    "parentNode",
    "parentElement",
    "offsetParent",
    "ownerDocument",
    "style",
    "classList",
    "dataset",
    "attributes",
    "childNodes",
    "children",
    "firstChild",
    "lastChild",
    "nextSibling",
    "previousSibling",
    "nextElementSibling",
    "previousElementSibling"
  ]);
  var BUNDLE_ROOT_KEYS = [
    "app",
    "game",
    "Game",
    "__ccGame",
    "engine",
    "Engine",
    "THREE",
    "__THREE__",
    "three",
    "__three__",
    "viewer",
    "world",
    "main",
    "Main",
    "experience",
    "application",
    "Application",
    "instance",
    "singleton"
  ];
  var CANVAS_HANDLE_KEYS = [
    "__THREE__",
    "userData",
    "__renderer",
    "_renderer",
    "renderer",
    "__webglRenderer"
  ];
  var RENDERER_SCENE_KEYS = ["scene", "_scene", "currentScene", "_currentScene"];
  var RENDERER_CAMERA_KEYS = ["camera", "_camera", "currentCamera", "_currentCamera"];
  var GL_CONTEXT_IDS = ["webgl2", "webgl", "experimental-webgl"];
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function constructorNameOf(value) {
    try {
      const name = value.constructor?.name;
      return typeof name === "string" ? name : void 0;
    } catch {
      return void 0;
    }
  }
  function isNamedWebGLRenderer(value) {
    return constructorNameOf(value) === "WebGLRenderer" && typeof value.render === "function";
  }
  function isDuckRenderer(value) {
    return typeof value.setPixelRatio === "function" && isRecord(value.info);
  }
  function isRenderer(value) {
    if (!isRecord(value)) return false;
    if (value.isWebGLRenderer === true) return true;
    if (isNamedWebGLRenderer(value)) return true;
    return isDuckRenderer(value);
  }
  function isScene(value) {
    if (!isRecord(value)) return false;
    if (value.isScene === true) return true;
    return typeof value.traverse === "function" && Array.isArray(value.children);
  }
  function isCamera(value) {
    if (!isRecord(value)) return false;
    return value.isCamera === true || value.isPerspectiveCamera === true || value.isOrthographicCamera === true;
  }
  function readKey(obj, key) {
    if (!isRecord(obj)) return void 0;
    try {
      return obj[key];
    } catch {
      return void 0;
    }
  }
  function pelagicDebug(root) {
    if (!isRecord(root)) return void 0;
    const pelagic = root.pelagic;
    if (!isRecord(pelagic)) return void 0;
    return isRecord(pelagic.debug) ? pelagic.debug : void 0;
  }
  function findCameraInScene(scene) {
    if (!isRecord(scene) || typeof scene.traverse !== "function") return void 0;
    let camera;
    scene.traverse((obj) => {
      if (!camera && isCamera(obj)) camera = obj;
    });
    return camera;
  }
  function fromDoctorHost(root) {
    if (!isRecord(root)) return void 0;
    const host = readKey(root, DOCTOR_HOST_KEY);
    if (!isRecord(host) || host.scene == null || host.renderer == null) return void 0;
    const camera = host.camera ?? findCameraInScene(host.scene) ?? {};
    return { scene: host.scene, camera, renderer: host.renderer, source: "host" };
  }
  function fromPelagic(root) {
    const debug = pelagicDebug(root);
    if (!debug || debug.scene == null || debug.renderer == null) return void 0;
    const camera = debug.camera ?? findCameraInScene(debug.scene) ?? {};
    return { scene: debug.scene, camera, renderer: debug.renderer, source: "pelagic" };
  }
  function mergeHandles(into, extra) {
    if (!extra) return;
    if (into.scene == null && extra.scene != null) into.scene = extra.scene;
    if (into.camera == null && extra.camera != null) into.camera = extra.camera;
    if (into.renderer == null && extra.renderer != null) into.renderer = extra.renderer;
  }
  function fillFromRenderer(renderer) {
    const out = {};
    if (!isRecord(renderer)) return out;
    for (const key of RENDERER_SCENE_KEYS) {
      const value = readKey(renderer, key);
      if (isScene(value)) {
        out.scene = value;
        break;
      }
    }
    for (const key of RENDERER_CAMERA_KEYS) {
      const value = readKey(renderer, key);
      if (isCamera(value)) {
        out.camera = value;
        break;
      }
    }
    const userData = readKey(renderer, "userData");
    if (out.scene == null) {
      const scene = readKey(userData, "scene");
      if (isScene(scene)) out.scene = scene;
    }
    if (out.camera == null) {
      const camera = readKey(userData, "camera");
      if (isCamera(camera)) out.camera = camera;
    }
    return out;
  }
  function keysToVisit(value, includeNonEnumerable) {
    const keys = /* @__PURE__ */ new Set();
    try {
      for (const key of Object.keys(value)) keys.add(key);
    } catch {
    }
    if (includeNonEnumerable) {
      try {
        for (const key of Object.getOwnPropertyNames(value)) keys.add(key);
      } catch {
      }
    }
    return [...keys];
  }
  function enqueueModuleLike(value, queue, depth, seen) {
    const looksLikeModule = value.__esModule === true || "default" in value || "exports" in value;
    if (!looksLikeModule) return;
    for (const key of ["default", "exports"]) {
      const child = readKey(value, key);
      if (!isRecord(child) || seen.has(child)) continue;
      queue.push({ value: child, depth: depth + 1 });
    }
  }
  function walk(root, limits) {
    if (!isRecord(root)) return void 0;
    const seen = /* @__PURE__ */ new Set();
    const queue = [{ value: root, depth: 0 }];
    const found = {};
    let visits = 0;
    while (queue.length > 0 && visits < limits.maxVisits) {
      const next = queue.shift();
      if (!next) break;
      const { value, depth } = next;
      if (!isRecord(value) || seen.has(value) || depth > limits.maxDepth) continue;
      if (typeof value.nodeType === "number") continue;
      seen.add(value);
      visits += 1;
      try {
        if (!found.renderer && isRenderer(value)) found.renderer = value;
        if (!found.scene && isScene(value)) found.scene = value;
        if (!found.camera && isCamera(value)) found.camera = value;
      } catch {
        continue;
      }
      if (found.scene && found.renderer && found.camera) break;
      enqueueModuleLike(value, queue, depth, seen);
      let keys = [];
      try {
        keys = keysToVisit(value, limits.includeNonEnumerable === true);
      } catch {
        continue;
      }
      for (const key of keys) {
        if (SKIP_KEYS.has(key)) continue;
        try {
          const child = value[key];
          if (!isRecord(child) || seen.has(child)) continue;
          queue.push({ value: child, depth: depth + 1 });
        } catch {
          continue;
        }
      }
    }
    if (found.renderer && found.scene == null) mergeHandles(found, fillFromRenderer(found.renderer));
    if (!found.scene && !found.renderer) return void 0;
    return found;
  }
  function getDocument(root) {
    const fromRoot = readKey(root, "document");
    if (fromRoot != null) return fromRoot;
    if (typeof document !== "undefined") return document;
    return void 0;
  }
  function listCanvases(root) {
    const doc = getDocument(root);
    if (!isRecord(doc) || typeof doc.querySelectorAll !== "function") return [];
    try {
      return Array.from(doc.querySelectorAll("canvas"));
    } catch {
      return [];
    }
  }
  function defaultNow() {
    try {
      if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
      }
    } catch {
    }
    return Date.now();
  }
  function clampDeepWalkOptions(options = {}) {
    const maxNodes = Math.min(options.maxNodes ?? DEEP_WALK_MAX_NODES, DEEP_WALK_MAX_NODES);
    const maxDepth = Math.min(options.maxDepth ?? DEEP_WALK_MAX_DEPTH, DEEP_WALK_MAX_DEPTH);
    const maxMs = Math.min(options.maxMs ?? DEEP_WALK_MAX_MS, 100);
    return {
      maxNodes: maxNodes > 0 ? maxNodes : DEEP_WALK_MAX_NODES,
      maxDepth: maxDepth >= 0 ? maxDepth : DEEP_WALK_MAX_DEPTH,
      maxMs: maxMs > 0 ? maxMs : DEEP_WALK_MAX_MS,
      now: options.now ?? defaultNow
    };
  }
  function isDeepWalkEnabled(root, option) {
    if (option === true) return true;
    if (option === false) return false;
    const bag = readKey(root, "__THREEJS_DOCTOR_ATTACH__");
    return isRecord(bag) && bag.deepWalk === true;
  }
  var DEEP_SKIP_KEYS = /* @__PURE__ */ new Set([
    ...SKIP_KEYS,
    ...CANVAS_SKIP_KEYS,
    "children",
    "parent",
    "geometry",
    "attributes",
    "morphAttributes",
    "index",
    "__THREEJS_DOCTOR_HOST__",
    "__THREEJS_DOCTOR_LAST_REPORT__",
    "__THREEJS_DOCTOR_ATTACH__"
  ]);
  function isCanvasElement(value) {
    const tag = value.tagName;
    if (typeof tag === "string" && tag.toUpperCase() === "CANVAS") return true;
    return typeof value.nodeType === "number" && typeof value.getContext === "function";
  }
  function isIFrameElement(value) {
    const tag = value.tagName;
    return typeof tag === "string" && tag.toUpperCase() === "IFRAME";
  }
  function isDomNode(value) {
    return typeof value.nodeType === "number";
  }
  function isInaccessibleWindow(value) {
    try {
      if (value.window === value || value.self === value) {
        void value.location?.href;
      }
      return false;
    } catch {
      return true;
    }
  }
  function isCrossOriginIFrame(value) {
    if (!isIFrameElement(value)) return false;
    try {
      const w = value.contentWindow;
      if (w == null || typeof w !== "object") return false;
      void w.location.href;
      return false;
    } catch {
      return true;
    }
  }
  function isTypedArrayOrBuffer(value) {
    return ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
  }
  function shouldExpandDeep(value, isSeed) {
    if (isSeed) return true;
    if (isInaccessibleWindow(value) || isCrossOriginIFrame(value)) return false;
    if (isIFrameElement(value)) return true;
    if (isDomNode(value)) return isCanvasElement(value);
    return !isTypedArrayOrBuffer(value);
  }
  function findRendererDeep(root, options = {}) {
    const { maxNodes, maxDepth, maxMs, now } = clampDeepWalkOptions(options);
    const seen = /* @__PURE__ */ new Set();
    const queue = [];
    let head = 0;
    let visits = 0;
    const started = now();
    let aborted = false;
    const overBudget = () => now() - started >= maxMs;
    const enqueue = (value, depth, seed) => {
      if (value == null || typeof value !== "object") return;
      if (seen.has(value) || depth > maxDepth) return;
      if (visits + (queue.length - head) >= maxNodes) return;
      seen.add(value);
      queue.push({ value, depth, seed });
    };
    enqueue(root, 0, true);
    enqueue(getDocument(root), 0, true);
    for (const canvas of listCanvases(root)) enqueue(canvas, 0, true);
    let named;
    let duck;
    while (head < queue.length && visits < maxNodes) {
      if (overBudget()) {
        aborted = true;
        break;
      }
      const next = queue[head];
      head += 1;
      if (!next) break;
      const { value, depth, seed } = next;
      if (!isRecord(value)) continue;
      visits += 1;
      if (isInaccessibleWindow(value) || isCrossOriginIFrame(value)) continue;
      try {
        if (value.isWebGLRenderer === true) return value;
        if (named == null && isNamedWebGLRenderer(value)) named = value;
        else if (duck == null && isDuckRenderer(value)) duck = value;
      } catch {
        continue;
      }
      if (depth >= maxDepth) continue;
      if (!shouldExpandDeep(value, seed)) continue;
      if (isIFrameElement(value)) {
        try {
          enqueue(value.contentWindow, depth + 1, true);
          enqueue(value.contentDocument, depth + 1, true);
        } catch {
          continue;
        }
      }
      let keys = [];
      try {
        keys = keysToVisit(value, true);
      } catch {
        continue;
      }
      for (const key of keys) {
        if (overBudget()) {
          aborted = true;
          break;
        }
        if (DEEP_SKIP_KEYS.has(key)) continue;
        try {
          const child = value[key];
          if (child == null || typeof child !== "object" || seen.has(child)) continue;
          if (!isRecord(child)) continue;
          if (isTypedArrayOrBuffer(child)) continue;
          if (isCrossOriginIFrame(child) || isInaccessibleWindow(child)) continue;
          const childSeed = isCanvasElement(child) || isIFrameElement(child);
          if (isDomNode(child) && !childSeed) continue;
          enqueue(child, depth + 1, childSeed);
        } catch {
          continue;
        }
      }
      if (aborted) break;
    }
    if (aborted) return void 0;
    return named ?? duck;
  }
  function peekWebGLContext(canvas) {
    if (!isRecord(canvas) || typeof canvas.getContext !== "function") return void 0;
    const getContext = canvas.getContext;
    for (const id of GL_CONTEXT_IDS) {
      try {
        const gl = getContext.call(canvas, id);
        if (gl) return gl;
      } catch {
        continue;
      }
    }
    return void 0;
  }
  function considerValue(into, value, limits) {
    if (value == null) return;
    if (isRenderer(value)) into.renderer ??= value;
    if (isScene(value)) into.scene ??= value;
    if (isCamera(value)) into.camera ??= value;
    if (isRecord(value) && typeof value.nodeType !== "number") {
      mergeHandles(into, walk(value, limits));
    }
  }
  function inspectCanvas(canvas) {
    const found = {};
    const limits = { maxDepth: 4, maxVisits: 200, includeNonEnumerable: true };
    for (const key of CANVAS_HANDLE_KEYS) {
      considerValue(found, readKey(canvas, key), limits);
    }
    if (isRecord(canvas)) {
      let names = [];
      try {
        names = Object.getOwnPropertyNames(canvas);
      } catch {
        try {
          names = Object.keys(canvas);
        } catch {
          names = [];
        }
      }
      for (const key of names) {
        if (SKIP_KEYS.has(key) || CANVAS_SKIP_KEYS.has(key)) continue;
        if (CANVAS_HANDLE_KEYS.includes(key)) continue;
        considerValue(found, readKey(canvas, key), limits);
      }
    }
    const gl = peekWebGLContext(canvas);
    considerValue(found, gl, limits);
    considerValue(found, readKey(gl, "__THREE__"), limits);
    considerValue(found, readKey(gl, "userData"), limits);
    considerValue(found, readKey(gl, "renderer"), limits);
    considerValue(found, readKey(gl, "__renderer"), limits);
    if (found.renderer && found.scene == null) mergeHandles(found, fillFromRenderer(found.renderer));
    return found;
  }
  function fromCanvases(root) {
    const found = {};
    for (const canvas of listCanvases(root)) {
      mergeHandles(found, inspectCanvas(canvas));
      if (found.scene && found.renderer) break;
    }
    if (!found.scene && !found.renderer) return void 0;
    return found;
  }
  function fromBundleRoots(root, probe) {
    if (!isRecord(root)) return void 0;
    const found = {};
    const limits = { maxDepth: 8, maxVisits: 800, includeNonEnumerable: true };
    for (const key of BUNDLE_ROOT_KEYS) {
      const value = readKey(root, key);
      if (value === void 0) continue;
      probe.bundleRootsPresent.push(key);
      considerValue(found, value, limits);
      if (found.scene && found.renderer) break;
    }
    if (!found.scene && !found.renderer) return void 0;
    return found;
  }
  function emptyProbe() {
    return {
      canvasCount: 0,
      webglContextCount: 0,
      foundRenderer: false,
      foundScene: false,
      foundCamera: false,
      bundleRootsPresent: [],
      tried: []
    };
  }
  function refreshProbe(probe, found) {
    probe.foundRenderer = found.renderer != null;
    probe.foundScene = found.scene != null;
    probe.foundCamera = isCamera(found.camera);
  }
  function formatDiscoveryError(probe) {
    const webgl = probe.canvasCount === 0 ? "n/a" : probe.webglContextCount > 0 ? "yes" : "no";
    const canvasLabel = `${probe.canvasCount} canvas${probe.canvasCount === 1 ? "" : "es"}`;
    const parts = [];
    if (probe.foundRenderer && !probe.foundScene) {
      parts.push("threejs-doctor live-attach: found WebGLRenderer but not scene/camera.");
    } else {
      parts.push("threejs-doctor live-attach: could not find scene/camera/renderer.");
    }
    parts.push(
      `Found: ${canvasLabel}, WebGL context: ${webgl}, renderer: ${probe.foundRenderer ? "yes" : "no"}, scene: ${probe.foundScene ? "yes" : "no"}, camera: ${probe.foundCamera ? "yes" : "no"}.`
    );
    if (probe.bundleRootsPresent.length > 0) {
      parts.push(`Bundle roots present: ${probe.bundleRootsPresent.join(", ")}.`);
    } else {
      parts.push("Bundle roots present: none (checked app, game, __THREE__, and module-like singletons).");
    }
    if (probe.foundRenderer && !probe.foundScene) {
      parts.push(
        "Tried renderer properties and render() hook; still missing. Bundled games often close over scene/camera."
      );
    } else if (probe.tried.length > 0) {
      parts.push(`Tried: ${probe.tried.join(", ")}.`);
    }
    parts.push("Pass them explicitly from this page's console once located:");
    parts.push("  await ThreejsDoctorLiveAttach.attachQualityLadder({ scene, camera, renderer })");
    parts.push("Or expose window.__THREEJS_DOCTOR_HOST__ = { scene, camera, renderer } before pasting.");
    parts.push(
      "Default paste skips the deep graph walk. For bundled hosts opt in with window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true } (bounded; aborts if the graph is too large)."
    );
    return parts.join(" ");
  }
  function attemptDiscovery(root = globalThis, explicit = {}, options = {}) {
    const probe = emptyProbe();
    const canvases = listCanvases(root);
    probe.canvasCount = canvases.length;
    for (const canvas of canvases) {
      if (peekWebGLContext(canvas)) probe.webglContextCount += 1;
    }
    const deepWalk = isDeepWalkEnabled(root, options.deepWalk);
    probe.tried.push(
      "__THREEJS_DOCTOR_HOST__",
      "pelagic.debug",
      "canvas (__THREE__/userData/internals)",
      "bundle roots (app, game, __THREE__)",
      "global walk"
    );
    if (deepWalk) {
      probe.tried.push("deep walk (window/document/canvas, bounded)");
    } else {
      probe.tried.push("deep walk skipped (set __THREEJS_DOCTOR_ATTACH__.deepWalk)");
    }
    if (explicit.scene != null && explicit.camera != null && explicit.renderer != null) {
      const found2 = { scene: explicit.scene, camera: explicit.camera, renderer: explicit.renderer };
      refreshProbe(probe, found2);
      return { ...found2, source: "explicit", probe };
    }
    const found = {
      scene: explicit.scene,
      camera: explicit.camera,
      renderer: explicit.renderer
    };
    let source = found.scene != null && found.renderer != null ? "explicit" : void 0;
    const host = fromDoctorHost(root);
    if (host) {
      mergeHandles(found, host);
      source ??= "host";
    }
    if (found.scene == null || found.renderer == null) {
      const pelagic = fromPelagic(root);
      if (pelagic) {
        mergeHandles(found, pelagic);
        source ??= "pelagic";
      }
    }
    if (found.scene == null || found.renderer == null) {
      const canvasFound = fromCanvases(root);
      if (canvasFound) {
        const had = found.scene != null && found.renderer != null;
        mergeHandles(found, canvasFound);
        if (!had && found.scene != null && found.renderer != null) source ??= "canvas";
        else if (canvasFound.renderer != null || canvasFound.scene != null) source ??= "canvas";
      }
    }
    if (found.scene == null || found.renderer == null) {
      const bundleFound = fromBundleRoots(root, probe);
      if (bundleFound) {
        mergeHandles(found, bundleFound);
        source ??= "walk";
      }
    }
    if (found.scene == null || found.renderer == null) {
      const walked = walk(root, { maxDepth: 4, maxVisits: 400 });
      if (walked) {
        mergeHandles(found, walked);
        source ??= "walk";
      }
    }
    if (found.renderer == null && deepWalk) {
      const deep = findRendererDeep(root);
      if (deep) {
        found.renderer = deep;
        mergeHandles(found, fillFromRenderer(deep));
        source ??= "walk";
      }
    }
    if (found.renderer != null && found.scene == null) {
      mergeHandles(found, fillFromRenderer(found.renderer));
    }
    if (found.scene != null && found.camera == null) {
      found.camera = findCameraInScene(found.scene);
    }
    refreshProbe(probe, found);
    return { ...found, probe, ...source ? { source } : {} };
  }
  async function waitForSceneCameraFromRenderer(renderer, options = {}) {
    if (!isRecord(renderer)) return void 0;
    const extra = fillFromRenderer(renderer);
    if (extra.scene != null) {
      return {
        scene: extra.scene,
        camera: extra.camera ?? findCameraInScene(extra.scene) ?? {}
      };
    }
    if (typeof renderer.render !== "function") return void 0;
    const hadOwn = Object.prototype.hasOwnProperty.call(renderer, "render");
    const original = renderer.render;
    let captured;
    renderer.render = function(scene, camera, ...rest) {
      if (isScene(scene)) {
        captured = {
          scene,
          camera: isCamera(camera) ? camera : findCameraInScene(scene) ?? camera ?? {}
        };
      }
      return original.apply(this, [scene, camera, ...rest]);
    };
    const wait = options.waitFrame ?? (async () => {
    });
    const maxAttempts = options.maxAttempts ?? 32;
    try {
      for (let i = 0; i < maxAttempts && !captured; i += 1) {
        await wait();
      }
    } finally {
      if (hadOwn) {
        ;
        renderer.render = original;
      } else {
        try {
          delete renderer.render;
        } catch {
          ;
          renderer.render = original;
        }
      }
    }
    return captured;
  }
  function discoverThreeHandles(root = globalThis, explicit = {}) {
    const attempt = attemptDiscovery(root, explicit);
    if (attempt.scene == null || attempt.renderer == null) return void 0;
    return {
      scene: attempt.scene,
      camera: attempt.camera ?? {},
      renderer: attempt.renderer,
      source: attempt.source ?? "explicit"
    };
  }

  // src/scene-stats.ts
  function collectSceneStats(scene, renderer) {
    return collectHostSceneStats(scene, renderer).stats;
  }

  // src/wrap-renderer.ts
  function readPixelRatio(raw) {
    return readRendererPixelRatio(raw);
  }
  function readDrawingBufferWidth(raw) {
    if (typeof raw.drawingBufferWidth === "number") return raw.drawingBufferWidth;
    const gl = typeof raw.getContext === "function" ? raw.getContext() : void 0;
    if (gl && typeof gl.drawingBufferWidth === "number") return gl.drawingBufferWidth;
    if (typeof raw.domElement?.width === "number") return raw.domElement.width;
    return void 0;
  }
  function readDrawingBufferHeight(raw) {
    if (typeof raw.drawingBufferHeight === "number") return raw.drawingBufferHeight;
    const gl = typeof raw.getContext === "function" ? raw.getContext() : void 0;
    if (gl && typeof gl.drawingBufferHeight === "number") return gl.drawingBufferHeight;
    if (typeof raw.domElement?.height === "number") return raw.domElement.height;
    return void 0;
  }
  function defineOptional(target, key, descriptor) {
    Object.defineProperty(target, key, { configurable: true, enumerable: true, ...descriptor });
  }
  function wrapRenderer(raw) {
    const r = raw;
    const wrapped = {
      get info() {
        return r.info;
      },
      get pixelRatio() {
        return readPixelRatio(r);
      },
      set pixelRatio(value) {
        if (typeof value === "number" && Number.isFinite(value)) r.setPixelRatio(value);
      },
      getPixelRatio() {
        return readPixelRatio(r);
      },
      setPixelRatio(value) {
        r.setPixelRatio(value);
      },
      setDrawingBufferSize(width, height, pixelRatio) {
        if (typeof r.setDrawingBufferSize === "function") {
          r.setDrawingBufferSize(width, height, pixelRatio);
          return;
        }
        r.setPixelRatio(pixelRatio);
        if (typeof r.setSize === "function") {
          const cssW = r.domElement?.clientWidth ?? width;
          const cssH = r.domElement?.clientHeight ?? height;
          r.setSize(cssW, cssH, false);
        }
      },
      getExtension(name) {
        if (typeof r.getExtension === "function") return r.getExtension(name);
        const gl = typeof r.getContext === "function" ? r.getContext() : void 0;
        if (gl && typeof gl.getExtension === "function") return gl.getExtension(name);
        return r.extensions?.get?.(name);
      }
    };
    if (typeof r.getContext === "function") {
      wrapped.getContext = () => r.getContext();
    }
    if (typeof r.render === "function") {
      wrapped.render = (scene, camera) => r.render(scene, camera);
    }
    defineOptional(wrapped, "antialias", {
      get: () => readRendererAntialias(r)
    });
    defineOptional(wrapped, "toneMapping", {
      get: () => r.toneMapping,
      set: (value) => {
        r.toneMapping = value;
      }
    });
    defineOptional(wrapped, "shadowMap", {
      get: () => r.shadowMap
    });
    defineOptional(wrapped, "drawingBufferWidth", {
      get: () => readDrawingBufferWidth(r)
    });
    defineOptional(wrapped, "drawingBufferHeight", {
      get: () => readDrawingBufferHeight(r)
    });
    return wrapped;
  }

  // src/wait-frame.ts
  function readRenderFrame(renderer) {
    const frame = renderer?.info?.render?.frame;
    return typeof frame === "number" ? frame : void 0;
  }
  function waitLiveFrame(renderer, schedule = (cb) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => cb());
    else cb();
  }, maxTicks = 180) {
    return () => new Promise((resolve) => {
      const start = readRenderFrame(renderer);
      if (start === void 0) {
        schedule(() => resolve());
        return;
      }
      let ticks = 0;
      const tick = () => {
        const current = readRenderFrame(renderer);
        if (current !== void 0 && current !== start) {
          resolve();
          return;
        }
        ticks += 1;
        if (ticks >= maxTicks) {
          resolve();
          return;
        }
        schedule(tick);
      };
      schedule(tick);
    });
  }

  // src/attach-device.ts
  var PHONE_CLASS_PROBE = {
    maxTouchPoints: 5,
    coarsePointer: true,
    deviceMemory: 4,
    devicePixelRatio: 3,
    webgpu: false
  };
  var BLOCKED_GL_EXTENSIONS = /* @__PURE__ */ new Set([
    "WEBGL_debug_renderer_info",
    "UNMASKED_RENDERER_WEBGL",
    "UNMASKED_VENDOR_WEBGL"
  ]);
  function collectLiveProbe(renderer) {
    const partial = { webgl: true };
    const hostDpr = globalThis.devicePixelRatio;
    if (typeof hostDpr === "number") partial.devicePixelRatio = hostDpr;
    else {
      const rendererDpr = readRendererPixelRatio(renderer ?? {});
      if (rendererDpr !== void 0) partial.devicePixelRatio = rendererDpr;
    }
    if (typeof navigator !== "undefined") {
      if (typeof navigator.hardwareConcurrency === "number") {
        partial.hardwareConcurrency = navigator.hardwareConcurrency;
      }
      const nav = navigator;
      if (typeof nav.deviceMemory === "number") partial.deviceMemory = nav.deviceMemory;
      if (typeof nav.maxTouchPoints === "number") partial.maxTouchPoints = nav.maxTouchPoints;
    }
    if (typeof matchMedia === "function") {
      try {
        partial.coarsePointer = matchMedia("(pointer: coarse)").matches;
      } catch {
      }
    }
    const getExtension = renderer?.getExtension;
    if (typeof getExtension === "function") {
      const signals = readWebglQualitySignals({
        getExtension(name) {
          if (BLOCKED_GL_EXTENSIONS.has(name)) return null;
          return getExtension.call(renderer, name);
        }
      });
      if (signals.colorBufferFloat !== void 0) partial.colorBufferFloat = signals.colorBufferFloat;
      if (signals.floatLinear !== void 0) partial.floatLinear = signals.floatLinear;
    }
    const gl = typeof renderer?.getContext === "function" ? renderer.getContext() : void 0;
    if (gl) {
      const gpuSource = {
        getExtension(name) {
          if (BLOCKED_GL_EXTENSIONS.has(name)) return null;
          return gl.getExtension?.(name);
        }
      };
      if (typeof gl.getParameter === "function") {
        gpuSource.getParameter = gl.getParameter.bind(gl);
      }
      if (typeof gl.MAX_TEXTURE_SIZE === "number") {
        gpuSource.MAX_TEXTURE_SIZE = gl.MAX_TEXTURE_SIZE;
      }
      if (typeof gl.MAX_RENDERBUFFER_SIZE === "number") {
        gpuSource.MAX_RENDERBUFFER_SIZE = gl.MAX_RENDERBUFFER_SIZE;
      }
      const gpuLimits = readWebglQualitySignals(gpuSource);
      if (gpuLimits.maxTextureSize !== void 0) partial.maxTextureSize = gpuLimits.maxTextureSize;
      if (gpuLimits.maxRenderbufferSize !== void 0) {
        partial.maxRenderbufferSize = gpuLimits.maxRenderbufferSize;
      }
    }
    return partial;
  }
  function resolveAttachDevice(option, renderer) {
    if (option === void 0) return void 0;
    const overlay = option === "phone" ? { ...PHONE_CLASS_PROBE } : { ...option };
    const live = collectLiveProbe(renderer);
    const merged = {
      ...live,
      ...overlay,
      webgl: overlay.webgl ?? live.webgl ?? true
    };
    return probeDevice(merged);
  }

  // src/capture-host.ts
  function isRecord2(value) {
    return typeof value === "object" && value !== null;
  }
  function isScene2(value) {
    if (!isRecord2(value)) return false;
    if (value.isScene === true) return true;
    return typeof value.traverse === "function" && Array.isArray(value.children);
  }
  function isCamera2(value) {
    if (!isRecord2(value)) return false;
    return value.isCamera === true || value.isPerspectiveCamera === true || value.isOrthographicCamera === true;
  }
  function isRendererCtor(value) {
    if (typeof value !== "function") return false;
    const proto = value.prototype;
    return !!proto && typeof proto.render === "function";
  }
  function readKey2(obj, key) {
    if (!isRecord2(obj)) return void 0;
    try {
      return obj[key];
    } catch {
      return void 0;
    }
  }
  function findThreeWebGLRendererCtor(root) {
    const direct = readKey2(root, "WebGLRenderer");
    if (isRendererCtor(direct)) return direct;
    for (const key of ["THREE", "three", "__THREE__"]) {
      const ns = readKey2(root, key);
      const ctor = readKey2(ns, "WebGLRenderer");
      if (isRendererCtor(ctor)) return ctor;
      if (isRendererCtor(ns)) return ns;
    }
    return void 0;
  }
  function writeHost(root, host) {
    const assign = (target) => {
      if (!target || typeof target !== "object") return;
      try {
        ;
        target[DOCTOR_HOST_KEY] = host;
      } catch {
      }
    };
    if (isRecord2(root)) assign(root);
    assign(globalThis);
    const win = globalThis.window;
    if (win) assign(win);
  }
  var idleCapture = {
    installed: false,
    uninstall() {
    },
    getCaptured() {
      return void 0;
    }
  };
  function hookRenderMethod(root, target) {
    const hadOwn = Object.prototype.hasOwnProperty.call(target, "render");
    const original = target.render;
    if (typeof original !== "function") return idleCapture;
    let captured;
    let active = true;
    const restore = () => {
      if (!active) return;
      active = false;
      if (hadOwn) {
        target.render = original;
        return;
      }
      try {
        delete target.render;
      } catch {
        target.render = original;
      }
    };
    target.render = function(scene, camera, ...rest) {
      if (active && isScene2(scene)) {
        captured = {
          scene,
          camera: isCamera2(camera) ? camera : camera ?? {},
          renderer: this
        };
        writeHost(root, captured);
        restore();
      }
      return original.apply(this, [scene, camera, ...rest]);
    };
    return {
      installed: true,
      uninstall: restore,
      getCaptured() {
        return captured;
      }
    };
  }
  function installRendererRenderCapture(root = globalThis, options = {}) {
    const ctor = findThreeWebGLRendererCtor(root);
    if (ctor) return hookRenderMethod(root, ctor.prototype);
    const instance = isRecord2(options.instance) ? options.instance : options.skipDeepWalk || !isDeepWalkEnabled(root, options.deepWalk) ? void 0 : findRendererDeep(root);
    if (!isRecord2(instance)) return idleCapture;
    const fromInstance = instance.constructor;
    if (isRendererCtor(fromInstance)) return hookRenderMethod(root, fromInstance.prototype);
    if (typeof instance.render === "function") {
      return hookRenderMethod(root, instance);
    }
    return idleCapture;
  }

  // src/attach.ts
  function waitAnimationTick() {
    return new Promise((resolve) => {
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === "function") {
        raf(() => resolve());
        return;
      }
      setTimeout(resolve, 16);
    });
  }
  async function attachQualityLadder(options = {}) {
    const root = options.root ?? globalThis;
    const persist = (report2) => {
      const assign = (target) => {
        if (!target || typeof target !== "object") return;
        try {
          ;
          target.__THREEJS_DOCTOR_LAST_REPORT__ = report2;
        } catch {
        }
      };
      assign(globalThis);
      if (root !== globalThis) assign(root);
      const win = globalThis.window;
      if (win) assign(win);
      if (typeof window !== "undefined") assign(window);
    };
    const explicit = {};
    if (options.scene !== void 0) explicit.scene = options.scene;
    if (options.camera !== void 0) explicit.camera = options.camera;
    if (options.renderer !== void 0) explicit.renderer = options.renderer;
    const discoveryOpts = options.deepWalk !== void 0 ? { deepWalk: options.deepWalk } : {};
    let attempt = attemptDiscovery(root, explicit, discoveryOpts);
    let scene = attempt.scene;
    let camera = attempt.camera;
    let rendererHandle = attempt.renderer;
    if (scene == null || rendererHandle == null) {
      const protoCapture = installRendererRenderCapture(root, {
        skipDeepWalk: true,
        ...rendererHandle != null ? { instance: rendererHandle } : {}
      });
      if (protoCapture.installed) {
        const captureWait = options.waitFrame ?? (options.now === void 0 ? waitAnimationTick : void 0);
        const maxAttempts = captureWait ? 32 : 1;
        const wait = captureWait ?? (async () => {
        });
        try {
          for (let i = 0; i < maxAttempts && !protoCapture.getCaptured(); i += 1) {
            await wait();
          }
        } finally {
          protoCapture.uninstall();
        }
        attempt = attemptDiscovery(root, explicit, discoveryOpts);
        scene = attempt.scene;
        camera = attempt.camera ?? camera;
        rendererHandle = attempt.renderer;
      }
    }
    if (rendererHandle != null && scene == null) {
      const waitFrameForHook = options.waitFrame ?? (options.now === void 0 ? waitLiveFrame(rendererHandle) : void 0);
      const captured = await waitForSceneCameraFromRenderer(rendererHandle, {
        maxAttempts: waitFrameForHook ? 32 : 1,
        ...waitFrameForHook ? { waitFrame: waitFrameForHook } : {}
      });
      if (captured?.scene != null) {
        scene = captured.scene;
        camera = captured.camera ?? camera;
      }
    }
    if (scene == null || rendererHandle == null) {
      attempt.probe.foundRenderer = rendererHandle != null;
      attempt.probe.foundScene = scene != null;
      throw new Error(formatDiscoveryError(attempt.probe));
    }
    const found = {
      scene,
      camera: camera ?? {},
      renderer: rendererHandle
    };
    const renderer = wrapRenderer(found.renderer);
    const sceneForDoctor = found.scene;
    const cameraForDoctor = found.camera ?? {};
    const useLiveClock = options.now === void 0;
    const waitFrame = options.waitFrame ?? (useLiveClock ? waitLiveFrame(found.renderer) : void 0);
    const doctorOpts = {
      scene: sceneForDoctor,
      camera: cameraForDoctor,
      renderer,
      profile: options.profile ?? "game",
      getSceneStats: () => collectSceneStats(found.scene, found.renderer)
    };
    if (options.now) doctorOpts.now = options.now;
    if (options.measureFrames !== void 0) doctorOpts.measureFrames = options.measureFrames;
    if (waitFrame) doctorOpts.waitFrame = waitFrame;
    const device = resolveAttachDevice(options.device, renderer);
    if (device) doctorOpts.device = device;
    const doctor = new Doctor(doctorOpts);
    const qcOpts = {
      mode: options.mode ?? "advise"
    };
    if (options.now) qcOpts.now = options.now;
    if (options.windowFrames !== void 0) qcOpts.windowFrames = options.windowFrames;
    if (options.waitForFirstInteractive) {
      qcOpts.waitForFirstInteractive = options.waitForFirstInteractive;
    }
    qcOpts.onReport = persist;
    const ladder = new QualityController(doctor, qcOpts);
    const debug = getPelagicDebug(root);
    if (debug && (found.scene === debug.scene || found.renderer === debug.renderer)) {
      ladder.registerAdapter(createOceanAdapter(debug));
    }
    if (options.mountOverlay !== false && typeof document !== "undefined" && document.body) {
      doctor.mountOverlay();
    }
    let report;
    try {
      await ladder.boot();
      report = await ladder.runLadder();
      return report;
    } finally {
      const last = report ?? globalThis.__THREEJS_DOCTOR_LAST_REPORT__;
      if (last) {
        persist(last);
        try {
          const line = JSON.stringify(last);
          (options.log ?? console.log)(line);
        } catch {
        }
      }
    }
  }

  // src/browser.ts
  var g = globalThis;
  g.ThreejsDoctorLiveAttach = {
    attachQualityLadder,
    discoverThreeHandles,
    installRendererRenderCapture,
    PHONE_CLASS_PROBE
  };
  var opts = g.__THREEJS_DOCTOR_ATTACH__ ?? {};
  if (opts.autoRun !== false) {
    void attachQualityLadder(opts).catch((err) => {
      console.error("[threejs-doctor live-attach]", err);
    });
  }
})();
