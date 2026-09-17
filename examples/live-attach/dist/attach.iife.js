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
    if (everyN <= 1) return () => {
    };
    const origUpdate = debug.updateSpectrum;
    const origRunPass = debug.runPass;
    let frames = 0;
    let skipping = false;
    const due = () => {
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
          if (skipping) return;
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
    const snaps = fftSize.map((_, i) => {
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
      fftSize.forEach((n, i) => {
        const cascade = cascades[i];
        if (!isCascadeTouchSafe(cascade)) return;
        if (n === 0) {
          if (typeof cascade.update === "function") {
            cascade.update = () => {
            };
          }
          return;
        }
        if (typeof cascade.resize === "function") {
          cascade.resize(n);
        }
      });
    } catch (err) {
      restore();
      throw err;
    }
    return restore;
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
    "anisotropy-cap",
    "frameloop-demand",
    "distance-cull"
  ];

  // ../../packages/core/src/device-probe.ts
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
  function readWebglQualitySignals(gl) {
    if (!gl) return {};
    return {
      colorBufferFloat: Boolean(gl.getExtension("EXT_color_buffer_float")),
      floatLinear: Boolean(gl.getExtension("OES_texture_float_linear"))
    };
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
      return {
        avgFps: avgFrame <= 0 ? 0 : 1e3 / avgFrame,
        p95FrameTimeMs: percentile(times, 95),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        textureCount: scene.textureCount,
        estimatedVramBytes: scene.estimatedVramBytes,
        geometryCount: scene.geometryCount,
        lightCount: scene.lightCount,
        shadowCastingLightCount: scene.shadowCastingLightCount
      };
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
  var ADAPTER_KNOBS = {
    potato: {
      fftSize: [64, 0, 0],
      spectrumEveryNFrames: 2,
      rtScale: 0.35,
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

  // ../../packages/rules/src/profiles.ts
  var PROFILE_BUDGETS = {
    marketing: { maxDrawCalls: 80, maxShadowCasters: 1, maxDpr: 1.5, maxLights: 3, maxEstimatedVramBytes: 64e6 },
    product: { maxDrawCalls: 100, maxShadowCasters: 2, maxDpr: 2, maxLights: 4, maxEstimatedVramBytes: 128e6 },
    game: { maxDrawCalls: 150, maxShadowCasters: 3, maxDpr: 2, maxLights: 6, maxEstimatedVramBytes: 256e6 },
    cad: { maxDrawCalls: 120, maxShadowCasters: 2, maxDpr: 2, maxLights: 4, maxEstimatedVramBytes: 256e6 }
  };
  function resolveProfile(profile, snapshot) {
    if (profile !== "auto") return profile;
    if (snapshot.meshCount > 200 || snapshot.drawCalls > 150) return "cad";
    if (snapshot.lightCount >= 4 && snapshot.meshCount > 50) return "game";
    if (snapshot.textureCount <= 6 && snapshot.meshCount <= 20) return "product";
    return "marketing";
  }

  // ../../packages/rules/src/score.ts
  var SEVERITY_PENALTY = { info: 2, warn: 8, error: 18 };
  function computeDoctorScore(findings, snapshot, profile) {
    let score = 100;
    for (const f of findings) score -= SEVERITY_PENALTY[f.severity];
    const budgets = PROFILE_BUDGETS[profile];
    if (snapshot.drawCalls > budgets.maxDrawCalls) {
      score -= Math.min(15, Math.floor((snapshot.drawCalls / budgets.maxDrawCalls - 1) * 10));
    }
    if (snapshot.estimatedVramBytes > budgets.maxEstimatedVramBytes) {
      score -= 10;
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
      if (ctx.snapshot.rendererPixelRatio <= maxDpr) return [];
      return [
        {
          id: "renderer/uncapped-dpr",
          severity: ctx.device.tier === "low" ? "error" : "warn",
          evidence: {
            rendererPixelRatio: ctx.snapshot.rendererPixelRatio,
            maxDpr,
            tier: ctx.device.tier
          },
          message: `Renderer pixel ratio ${ctx.snapshot.rendererPixelRatio} exceeds cap ${maxDpr}`,
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
      if (ctx.snapshot.estimatedVramBytes > vramBudget) {
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
  var rendererSetupRule = {
    id: "renderer-setup",
    run(ctx) {
      const profile = resolveProfile(ctx.profile, ctx.snapshot);
      if (!ctx.snapshot.antialias) return [];
      if (ctx.device.tier !== "low") return [];
      if (profile !== "marketing" && profile !== "product") return [];
      return [
        {
          id: "renderer/antialias-postfx-risk",
          severity: "warn",
          evidence: { antialias: true, tier: ctx.device.tier, profile },
          message: "Antialias on low-tier marketing/product scenes risks costly post stacks",
          suggestedFix: "Disable MSAA on low tier or reduce postfx via postfx-budget",
          autoFix: "postfx-budget"
        }
      ];
    }
  };

  // ../../packages/rules/src/rules/lifecycle.ts
  var lifecycleRule = {
    id: "lifecycle",
    run(ctx) {
      if (!ctx.previousSnapshot) return [];
      const geoGrowth = ctx.snapshot.geometryCount - ctx.previousSnapshot.geometryCount;
      const texGrowth = ctx.snapshot.textureCount - ctx.previousSnapshot.textureCount;
      if (geoGrowth <= 0 && texGrowth <= 0) return [];
      return [
        {
          id: "lifecycle/resource-growth",
          severity: "warn",
          evidence: { geoGrowth, texGrowth },
          message: "Geometry/texture counts climbed between measures (possible leak)",
          suggestedFix: "Ensure dispose() on removed geometries, materials, and textures"
        }
      ];
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

  // ../../packages/rules/src/rule.ts
  var defaultRules = [
    drawCallsRule,
    lightsShadowsRule,
    dprRule,
    materialsRule,
    texturesRule,
    rendererSetupRule,
    lifecycleRule,
    transformsRule,
    frameloopRule
  ];
  function runRules(ctx, rules = defaultRules) {
    return rules.flatMap((rule) => rule.run(ctx));
  }

  // ../../packages/runtime/src/passes/dpr-cap.ts
  function restorePixelRatio(setPixelRatio, prev) {
    try {
      setPixelRatio(prev);
    } catch {
    }
  }
  var dprCapPass = {
    id: "dpr-cap",
    apply(ctx) {
      const prev = ctx.renderer.pixelRatio;
      const cap = ctx.qualityTier ? ctx.qualityTier === "potato" ? 1 : ctx.qualityTier === "low" ? 1.25 : ctx.qualityTier === "mid" ? 1.5 : 2 : ctx.device.tier === "low" ? 1.5 : ctx.device.tier === "mid" ? 2 : Math.min(prev, 2);
      try {
        ctx.renderer.setPixelRatio(Math.min(prev, cap));
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
  var pixelBudgetPass = {
    id: "pixel-budget",
    apply(ctx) {
      if (ctx.qualityTier === void 0) return { rollback() {
      } };
      const renderer = ctx.renderer;
      const prevRatio = renderer.pixelRatio;
      const prevW = renderer.drawingBufferWidth;
      const prevH = renderer.drawingBufferHeight;
      const capPixels = GENERIC_CAPS[ctx.qualityTier].drawingBufferPixels;
      const restore = () => {
        try {
          if (renderer.setDrawingBufferSize && prevW !== void 0 && prevH !== void 0) {
            renderer.setDrawingBufferSize(prevW, prevH, prevRatio);
          } else {
            renderer.setPixelRatio(prevRatio);
          }
        } catch {
        }
      };
      if (capPixels === void 0) {
        return { rollback() {
        } };
      }
      const width = renderer.drawingBufferWidth;
      const height = renderer.drawingBufferHeight;
      if (width === void 0 || height === void 0) {
        return { rollback() {
        } };
      }
      const current = width * height;
      if (current <= capPixels) {
        return { rollback() {
        } };
      }
      const scale = Math.sqrt(capPixels / current);
      const newRatio = Math.min(prevRatio, prevRatio * scale);
      try {
        if (renderer.setDrawingBufferSize) {
          const newW = Math.max(1, Math.floor(width * scale));
          const newH = Math.max(1, Math.floor(height * scale));
          renderer.setDrawingBufferSize(newW, newH, prevRatio);
        } else {
          renderer.setPixelRatio(newRatio);
        }
      } catch (err) {
        restore();
        throw err;
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
          if (!obj.isMesh || !obj.position) return;
          const dist = obj.position.distanceTo(cam);
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
      const delta = after[k] - baseline[k];
      return `${String(k)}: ${delta >= 0 ? "+" : ""}${delta}`;
    }).join(" \xB7 ");
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
  function snapshotFrom(sample, renderer, scene, continuousFrameloop) {
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
    const walked = snapshotScene({
      objectCount,
      meshCount,
      geometries,
      materials,
      textures: [],
      lights: [],
      drawCalls: sample.drawCalls,
      triangles: sample.triangles,
      continuousFrameloop,
      matrixAutoUpdateCount,
      rendererPixelRatio: renderer.pixelRatio,
      antialias: Boolean(renderer.antialias)
    });
    return {
      ...walked,
      geometryCount: sample.geometryCount,
      textureCount: sample.textureCount,
      estimatedVramBytes: sample.estimatedVramBytes,
      lightCount: sample.lightCount,
      shadowCastingLightCount: sample.shadowCastingLightCount
    };
  }
  function cameraPositionOf(camera) {
    if (!camera || typeof camera !== "object") return void 0;
    const pos = camera.position;
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" || typeof pos.z !== "number") {
      return void 0;
    }
    return { x: pos.x, y: pos.y, z: pos.z };
  }
  function resolvePassIds(tokens) {
    const ids = [];
    const seen = /* @__PURE__ */ new Set();
    for (const token of tokens) {
      const chunk = token === "safe" ? SAFE_PASSES : [token];
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
    device() {
      if (this.opts.device) return this.opts.device;
      const hostDpr = typeof globalThis !== "undefined" && typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : this.opts.renderer.pixelRatio;
      const probe = {
        webgl: true,
        devicePixelRatio: hostDpr
      };
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
      return probeDevice(probe);
    }
    collector() {
      return new MetricsCollector({
        getRendererInfo: () => this.opts.renderer.info,
        getSceneStats: this.opts.getSceneStats ?? (() => ({
          textureCount: this.opts.renderer.info.memory.textures,
          estimatedVramBytes: 0,
          geometryCount: this.opts.renderer.info.memory.geometries,
          lightCount: 0,
          shadowCastingLightCount: 0
        }))
      });
    }
    currentSnapshot(sample) {
      return snapshotFrom(
        sample,
        this.opts.renderer,
        this.opts.scene,
        this.frameloop === "always"
      );
    }
    ruleContext(snapshot, device, profile) {
      const ctx = { snapshot, device, profile };
      if (this.previousSnapshot) ctx.previousSnapshot = this.previousSnapshot;
      return ctx;
    }
    getDevice() {
      return this.device();
    }
    async measure(frameCount) {
      const frames = frameCount ?? this.opts.measureFrames ?? 30;
      const now = this.opts.now ?? (() => performance.now());
      const waitFrame = this.opts.waitFrame;
      const collector = this.collector();
      for (let i = 0; i < frames; i++) {
        const start = now();
        collector.beginFrame(start);
        if (waitFrame) await waitFrame();
        collector.endFrame(now());
      }
      const sample = collector.sample();
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
      const profile = resolveProfile(this.opts.profile ?? "auto", snap);
      const findings = runRules(this.ruleContext(snap, device, profile));
      const score = computeDoctorScore(findings, snap, profile);
      return {
        profile,
        mode: this.opts.mode ?? "diagnose",
        score,
        findings,
        baseline,
        appliedPasses: [],
        failedPasses: [],
        incomplete: false
      };
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
      const requested = this.opts.profile ?? "auto";
      const profile = requested !== "auto" ? requested : this.lastReport?.profile ?? (this.lastSnapshot ? resolveProfile("auto", this.lastSnapshot) : "marketing");
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
      if (this.opts.renderer.pixelRatio > maxRatio) {
        this.opts.renderer.setPixelRatio(maxRatio);
      }
    }
    async optimize(options = {}) {
      const diagnosed = await this.buildDiagnoseReport();
      const passIds = resolvePassIds(options.apply ?? ["safe"]);
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
      const score = computeDoctorScore(findings, snap, diagnosed.profile);
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
        const result = this.doctor.applyPassesImmediate([...SAFE_PASSES], {
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
      const report = this.finalize(state, baseline ?? this.last.baseline, after, incomplete);
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
          this.tightenPotatoFloor();
          this.potatoFloorTightened = true;
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
      const atTarget = sample.p95FrameTimeMs <= HYSTERESIS.dropP95Ms;
      const waitingToClimb = sample.p95FrameTimeMs <= HYSTERESIS.climbP95Ms && decision.reason !== "ceiling";
      holdsAtTarget = atTarget && !waitingToClimb ? holdsAtTarget + 1 : 0;
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
    clampCeiling(tier) {
      this.doctor.reclampPixelRatioCeiling(GENERIC_CAPS[tier].pixelRatio);
    }
    tightenPotatoFloor() {
      this.doctor.reclampPixelRatioCeiling(0.5);
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
      const next = {
        ...this.last,
        baseline: geometryBaseline,
        applyFailed: true,
        incomplete: true,
        appliedKnobs: [],
        floorFailed: this.last.floorFailed || this.last.tier === "potato"
      };
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
      const result = this.doctor.applyPassesImmediate([...SAFE_PASSES], { qualityTier: tier });
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
    finalize(state, baseline, after, incomplete) {
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
      const report = {
        profile: last.profile,
        mode: last.mode,
        qualityMode: this.mode,
        phase: "runtime",
        tier: floorFailed ? "potato" : state.tier,
        startTier: last.startTier,
        maxTier: last.maxTier,
        score: last.score,
        findings: last.findings,
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
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function isRenderer(value) {
    if (!isRecord(value)) return false;
    if (value.isWebGLRenderer === true) return true;
    return typeof value.setPixelRatio === "function" && isRecord(value.info);
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
  function fromPelagic(root) {
    const debug = pelagicDebug(root);
    if (!debug || debug.scene == null || debug.renderer == null) return void 0;
    const camera = debug.camera ?? findCameraInScene(debug.scene) ?? {};
    return { scene: debug.scene, camera, renderer: debug.renderer, source: "pelagic" };
  }
  function walk(root) {
    if (!isRecord(root)) return void 0;
    const seen = /* @__PURE__ */ new Set();
    const queue = [{ value: root, depth: 0 }];
    let scene;
    let camera;
    let renderer;
    let visits = 0;
    while (queue.length > 0 && visits < 400) {
      const next = queue.shift();
      if (!next) break;
      const { value, depth } = next;
      if (!isRecord(value) || seen.has(value) || depth > 4) continue;
      if (typeof value.nodeType === "number") continue;
      seen.add(value);
      visits += 1;
      try {
        if (!renderer && isRenderer(value)) renderer = value;
        if (!scene && isScene(value)) scene = value;
        if (!camera && isCamera(value)) camera = value;
      } catch {
        continue;
      }
      if (scene && renderer && camera) break;
      let keys = [];
      try {
        keys = Object.keys(value);
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
    if (!scene || !renderer) return void 0;
    return { scene, camera: camera ?? {}, renderer, source: "walk" };
  }
  function discoverThreeHandles(root = globalThis, explicit = {}) {
    if (explicit.scene != null && explicit.camera != null && explicit.renderer != null) {
      return {
        scene: explicit.scene,
        camera: explicit.camera,
        renderer: explicit.renderer,
        source: "explicit"
      };
    }
    const found = fromPelagic(root) ?? walk(root);
    const scene = explicit.scene ?? found?.scene;
    const renderer = explicit.renderer ?? found?.renderer;
    const camera = explicit.camera ?? found?.camera ?? {};
    if (scene == null || renderer == null) return void 0;
    return {
      scene,
      camera,
      renderer,
      source: found?.source ?? "explicit"
    };
  }

  // src/scene-stats.ts
  function collectSceneStats(scene, renderer) {
    let lightCount = 0;
    let shadowCastingLightCount = 0;
    const traversable = scene;
    if (typeof traversable.traverse === "function") {
      traversable.traverse((obj) => {
        if (obj.isLight === true) {
          lightCount += 1;
          if (obj.castShadow === true) shadowCastingLightCount += 1;
        }
      });
    }
    const memory = renderer.info?.memory;
    return {
      textureCount: memory?.textures ?? 0,
      estimatedVramBytes: 0,
      geometryCount: memory?.geometries ?? 0,
      lightCount,
      shadowCastingLightCount
    };
  }

  // src/wrap-renderer.ts
  function readPixelRatio(raw) {
    if (typeof raw.getPixelRatio === "function") return raw.getPixelRatio();
    if (typeof raw.pixelRatio === "number") return raw.pixelRatio;
    return 1;
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
        r.setPixelRatio(value);
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
    defineOptional(wrapped, "antialias", {
      get: () => r.antialias
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

  // src/attach.ts
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
    const found = discoverThreeHandles(root, explicit);
    if (!found) {
      throw new Error(
        "threejs-doctor live-attach: could not find scene/camera/renderer. Pass them explicitly: attachQualityLadder({ scene, camera, renderer })"
      );
    }
    const renderer = wrapRenderer(found.renderer);
    const scene = found.scene;
    const camera = found.camera ?? {};
    const useLiveClock = options.now === void 0;
    const waitFrame = options.waitFrame ?? (useLiveClock ? waitLiveFrame(found.renderer) : void 0);
    const doctorOpts = {
      scene,
      camera,
      renderer,
      profile: options.profile ?? "game",
      getSceneStats: () => collectSceneStats(found.scene, renderer)
    };
    if (options.now) doctorOpts.now = options.now;
    if (options.measureFrames !== void 0) doctorOpts.measureFrames = options.measureFrames;
    if (waitFrame) doctorOpts.waitFrame = waitFrame;
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
    if (debug) ladder.registerAdapter(createOceanAdapter(debug));
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
  g.ThreejsDoctorLiveAttach = { attachQualityLadder, discoverThreeHandles };
  var opts = g.__THREEJS_DOCTOR_ATTACH__ ?? {};
  if (opts.autoRun !== false) {
    void attachQualityLadder(opts).catch((err) => {
      console.error("[threejs-doctor live-attach]", err);
    });
  }
})();
