/* Lean converging-light field for login, home, and teacher.
 * Canvas 2D, no libraries, no audio.
 *
 * Premium read comes from thin additive strokes stacked into a soft core.
 * There is no shadowBlur, no canvas filter, and no wide bloom stroke.
 *
 * Caps (live spiral was up to 880 sprites):
 *   phone 84, tablet 126, desktop 168 filaments.
 * DPR clamp: 1.5 (inside the 1.5–2 band, on the fast side).
 * Strokes are flat colors on a half-resolution buffer (full resolution on phones),
 * then one smoothed blit. Only the core uses a gradient.
 * Hidden tabs pause. Reduced motion draws one still frame.
 * If a draw itself exceeds 10ms, the pool sheds until it fits, then refills slowly.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("photon-spiral");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;
  var buffer = document.createElement("canvas");
  var bctx = buffer.getContext("2d", { alpha: true });
  if (!bctx) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = motionQuery.matches;
  var filaments = [];
  var raf = 0;
  var running = false;
  var lastTs = 0;
  var skipped = false;
  var width = 0;
  var height = 0;
  var dpr = 1;
  var renderScale = 0.5;
  var spin = 0.4;
  var clock = 0;
  var tier = "desktop";
  var budget = 168;
  var sampleCap = 12;
  var floor = 72;
  var slowStreak = 0;
  var goodFrames = 0;
  var fpsEma = 60;
  var drawEma = 0;

  var pointerX = 0;
  var pointerY = 0;
  var panX = 0;
  var panY = 0;
  var px = 0;
  var py = 0;

  var haloGlow = null;
  var coreGlow = null;
  var glowKey = "";

  var ARMS = 5;
  var TURNS = 1.85;
  var TAU = Math.PI * 2;

  function classify() {
    var w = window.innerWidth || 360;
    var h = window.innerHeight || 640;
    var memory = navigator.deviceMemory || 8;
    var cores = navigator.hardwareConcurrency || 8;
    var shortSide = Math.min(w, h);
    if (memory <= 2 || cores <= 2 || shortSide < 520 || w < 700) {
      tier = "phone";
      budget = 84;
      sampleCap = 8;
      floor = 42;
      return;
    }
    if (shortSide < 900 || w < 1200) {
      tier = "tablet";
      budget = 126;
      sampleCap = 10;
      floor = 64;
      return;
    }
    tier = "desktop";
    budget = 168;
    sampleCap = 12;
    floor = 84;
  }

  function respawn(f, atEdge) {
    var roll = Math.random();
    f.kind = roll < 0.06 ? 2 : roll < 0.22 ? 1 : 0;
    f.arm = Math.floor(Math.random() * ARMS);
    f.clustered = Math.random() < 0.64;
    f.base = f.clustered
      ? (f.arm / ARMS) * TAU + (Math.random() - 0.5) * 0.2
      : Math.random() * TAU;
    f.jitter = (Math.random() - 0.5) * (f.clustered ? 0.07 : 0.2);
    f.depth = Math.random();
    if (f.kind === 1) {
      f.len = 0.32 + Math.random() * 0.22;
      f.speed = 0.048 + Math.random() * 0.03;
    } else if (f.kind === 2) {
      f.len = 0.36 + Math.random() * 0.24;
      f.speed = 0.034 + Math.random() * 0.024;
    } else {
      f.len = 0.5 + Math.random() * 0.36;
      f.speed = 0.02 + Math.random() * 0.018;
    }
    f.u = atEdge ? 0.98 + Math.random() * 0.1 : Math.pow(Math.random(), 0.7);
  }

  function fillPool() {
    classify();
    if (filaments.length > budget) filaments.length = budget;
    while (filaments.length < budget) {
      var f = {};
      respawn(f, false);
      filaments.push(f);
    }
  }

  function resize() {
    classify();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth || canvas.clientWidth || 360;
    height = window.innerHeight || canvas.clientHeight || 640;
    renderScale = tier === "phone" ? 1 : tier === "tablet" ? 0.7 : 0.5;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buffer.width = Math.max(1, Math.floor(width * renderScale));
    buffer.height = Math.max(1, Math.floor(height * renderScale));
    bctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    glowKey = "";
  }

  function place(f, u, ox, oy, maxRx, maxRy) {
    var clamped = u < 0 ? 0 : u > 1.2 ? 1.2 : u;
    var fall = Math.pow(clamped, 0.8);
    var ang = f.base + spin * (0.65 + f.depth * 0.7) + clamped * TURNS * TAU + f.jitter * clamped;
    var depthScale = 0.72 + f.depth * 0.38;
    var parallax = 0.25 + f.depth;
    px = ox + panX * parallax + Math.cos(ang) * fall * maxRx * depthScale;
    py = oy + panY * parallax + Math.sin(ang) * fall * maxRy * depthScale;
  }

  function appendCurve(f, ox, oy, maxRx, maxRy) {
    var steps = sampleCap;
    var uTail = f.u + f.len;
    var i;
    var started = false;
    var drew = false;
    var limitX = width + 72;
    var limitY = height + 72;
    for (i = 0; i <= steps; i++) {
      var u = uTail + (f.u - uTail) * (i / steps);
      place(f, u, ox, oy, maxRx, maxRy);
      if (px < -72 || py < -72 || px > limitX || py > limitY) {
        started = false;
        continue;
      }
      if (!started) {
        bctx.moveTo(px, py);
        started = true;
      } else {
        bctx.lineTo(px, py);
        drew = true;
      }
    }
    return drew;
  }

  function strokeKind(kind, ox, oy, maxRx, maxRy) {
    bctx.beginPath();
    var i;
    var any = false;
    for (i = 0; i < filaments.length; i++) {
      if (filaments[i].kind !== kind) continue;
      if (appendCurve(filaments[i], ox, oy, maxRx, maxRy)) any = true;
    }
    return any;
  }

  function ensureGlow(ox, oy, haloR, coreR) {
    var qx = Math.round(ox / 8) * 8;
    var qy = Math.round(oy / 8) * 8;
    var key = width + "x" + height + ":" + qx + ":" + qy + ":" + (haloR | 0);
    if (key === glowKey && haloGlow) return;
    glowKey = key;
    haloGlow = bctx.createRadialGradient(qx, qy, 0, qx, qy, haloR);
    haloGlow.addColorStop(0, "rgba(255,255,255,0.85)");
    haloGlow.addColorStop(0.16, "rgba(220,234,255,0.4)");
    haloGlow.addColorStop(0.42, "rgba(140,180,245,0.12)");
    haloGlow.addColorStop(1, "rgba(140,180,245,0)");
    coreGlow = bctx.createRadialGradient(qx, qy, 0, qx, qy, coreR);
    coreGlow.addColorStop(0, "rgba(255,255,255,0.95)");
    coreGlow.addColorStop(0.35, "rgba(236,244,255,0.45)");
    coreGlow.addColorStop(1, "rgba(190,214,255,0)");
  }

  function origin() {
    var driftX = Math.sin(clock * 0.17) * 16;
    var driftY = Math.cos(clock * 0.13) * 10;
    if (reduced) {
      panX = 0;
      panY = 0;
    } else {
      panX += (driftX + pointerX * 22 - panX) * 0.045;
      panY += (driftY + pointerY * 14 - panY) * 0.045;
    }
    return {
      x: width * 0.5 + panX * 0.35,
      y: height * 0.34 + panY * 0.35,
    };
  }

  function shed() {
    if (filaments.length <= floor) return;
    filaments.length = Math.max(floor, Math.floor(filaments.length * 0.8));
  }

  function refill() {
    var room = budget - filaments.length;
    var n = room > 4 ? 4 : room;
    var i;
    for (i = 0; i < n; i++) {
      var f = {};
      respawn(f, false);
      filaments.push(f);
    }
  }

  function draw(dt) {
    bctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    bctx.clearRect(0, 0, width, height);
    var maxRx = Math.min(width * 0.7, Math.max(height, width) * 0.66);
    var maxRy = Math.min(height * 0.68, maxRx * 0.86);
    var o = origin();
    var coreR = Math.max(42, Math.min(width, height) * 0.1);
    var haloR = coreR * 3.1;
    var i;

    if (!reduced && dt > 0) {
      clock += dt;
      spin += dt * 0.08;
      for (i = 0; i < filaments.length; i++) {
        var f = filaments[i];
        f.u -= f.speed * dt * (0.82 + f.depth * 0.4);
        if (f.u < -0.03) respawn(f, true);
      }
    }

    ensureGlow(o.x, o.y, haloR, coreR);
    bctx.lineCap = "round";
    bctx.lineJoin = "round";
    bctx.globalCompositeOperation = "lighter";

    var unit = Math.max(0.85, Math.min(width, height) / 900);
    var widthBoost = renderScale < 1 ? 1.35 : 1;

    bctx.strokeStyle = "rgb(186,214,255)";
    if (strokeKind(0, o.x, o.y, maxRx, maxRy)) {
      bctx.lineWidth = 1.15 * unit * widthBoost;
      bctx.globalAlpha = 0.62;
      bctx.stroke();
    }

    bctx.strokeStyle = "rgb(248,252,255)";
    if (strokeKind(1, o.x, o.y, maxRx, maxRy)) {
      bctx.lineWidth = 1.45 * unit * widthBoost;
      bctx.globalAlpha = 0.9;
      bctx.stroke();
    }

    bctx.strokeStyle = "rgb(236,206,150)";
    if (strokeKind(2, o.x, o.y, maxRx, maxRy)) {
      bctx.lineWidth = 1.15 * unit * widthBoost;
      bctx.globalAlpha = 0.45;
      bctx.stroke();
    }

    var pulse = reduced ? 0.9 : 0.84 + 0.08 * Math.sin(clock * 0.9);
    bctx.globalAlpha = pulse;
    bctx.fillStyle = haloGlow;
    bctx.beginPath();
    bctx.arc(o.x, o.y, haloR, 0, TAU);
    bctx.fill();
    bctx.globalAlpha = 1;
    bctx.fillStyle = coreGlow;
    bctx.beginPath();
    bctx.arc(o.x, o.y, coreR, 0, TAU);
    bctx.fill();

    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffer, 0, 0, width, height);
  }

  function notePressure(drawMs) {
    if (drawMs > 10) {
      slowStreak++;
      goodFrames = 0;
      if (slowStreak >= 2) {
        shed();
        slowStreak = 0;
      }
      return;
    }
    slowStreak = 0;
    if (drawMs < 6) {
      goodFrames++;
      if (goodFrames >= 90 && filaments.length < budget) {
        refill();
        goodFrames = 0;
      }
    }
  }

  function tick(ts) {
    if (!running) return;
    raf = window.requestAnimationFrame(tick);
    if (!lastTs) lastTs = ts;
    var elapsed = ts - lastTs;
    if (elapsed < 14) return;
    if (elapsed > 32 && drawEma > 10 && !skipped) {
      skipped = true;
      lastTs = ts;
      return;
    }
    skipped = false;
    var dt = elapsed > 34 ? 0.034 : elapsed / 1000;
    lastTs = ts;
    var t0 = performance.now();
    draw(dt);
    var drawMs = performance.now() - t0;
    fpsEma += (1000 / elapsed - fpsEma) * 0.08;
    drawEma += (drawMs - drawEma) * 0.12;
    notePressure(drawMs);
  }

  function start() {
    if (reduced) {
      draw(0);
      return;
    }
    if (running || document.hidden) return;
    running = true;
    lastTs = 0;
    skipped = false;
    raf = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function onResize() {
    resize();
    fillPool();
    draw(0);
  }

  resize();
  fillPool();
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", function (e) {
    if (!width || !height) return;
    pointerX = (e.clientX / width) * 2 - 1;
    pointerY = (e.clientY / height) * 2 - 1;
  }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener("change", function () {
      reduced = motionQuery.matches;
      if (reduced) stop();
      draw(0);
      if (!reduced) start();
    });
  }

  window.__spiralField = {
    count: function () { return filaments.length; },
    budget: function () { return budget; },
    tier: function () { return tier; },
    dpr: function () { return dpr; },
    fps: function () { return Math.round(fpsEma); },
    drawMs: function () { return Math.round(drawEma * 10) / 10; },
    reduced: function () { return reduced; },
    running: function () { return running; },
  };

  draw(0);
  if (!document.hidden) start();
})();
