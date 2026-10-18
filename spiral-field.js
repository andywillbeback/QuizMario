/* Converging light field shared by login, home, and teacher chrome.
 * Canvas 2D only. No audio. GitHub Pages safe (no build, no extra libraries).
 *
 * Filaments are continuous strokes into a soft core — not dotted sprites.
 * Draw budget stays inside the emergency caps:
 *   phone ≤120, tablet ≤180, desktop ≤280 filaments.
 * DPR is capped at 1.25. The loop paces at ~60fps and skips a frame only
 * when that callback is already behind (never two skips in a row).
 * Hidden tabs pause. Reduced motion draws one still frame.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("photon-spiral");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = motionQuery.matches;
  var filaments = [];
  var raf = 0;
  var running = false;
  var lastTs = 0;
  var skipped = false;
  var width = 0;
  var height = 0;
  var spin = 0.4;
  var clock = 0;
  var tier = "desktop";
  var budget = 280;
  var sampleCap = 22;
  var slowFrames = 0;
  var floor = 110;

  var pointerX = 0;
  var pointerY = 0;
  var panX = 0;
  var panY = 0;

  var ARMS = 4;
  var TURNS = 3.15;
  var TAU = Math.PI * 2;

  var scratchX = new Float32Array(40);
  var scratchY = new Float32Array(40);

  function classify() {
    var w = window.innerWidth || 360;
    var h = window.innerHeight || 640;
    var memory = navigator.deviceMemory || 8;
    var cores = navigator.hardwareConcurrency || 8;
    var shortSide = Math.min(w, h);
    if (memory <= 2 || cores <= 2 || shortSide < 520 || w < 700) {
      tier = "phone";
      budget = 120;
      sampleCap = 12;
      floor = 64;
      return;
    }
    if (shortSide < 900 || w < 1200) {
      tier = "tablet";
      budget = 180;
      sampleCap = 16;
      floor = 90;
      return;
    }
    tier = "desktop";
    budget = 280;
    sampleCap = 20;
    floor = 140;
  }

  function respawn(f, atEdge) {
    var roll = Math.random();
    f.kind = roll < 0.07 ? 2 : roll < 0.24 ? 1 : 0;
    f.arm = Math.floor(Math.random() * ARMS);
    f.clustered = Math.random() < 0.62;
    f.base = f.clustered
      ? (f.arm / ARMS) * TAU + (Math.random() - 0.5) * 0.22
      : Math.random() * TAU;
    f.jitter = (Math.random() - 0.5) * (f.clustered ? 0.08 : 0.22);
    f.depth = Math.random();
    if (f.kind === 1) {
      f.len = 0.1 + Math.random() * 0.14;
      f.speed = 0.055 + Math.random() * 0.04;
    } else if (f.kind === 2) {
      f.len = 0.16 + Math.random() * 0.18;
      f.speed = 0.04 + Math.random() * 0.03;
    } else {
      f.len = 0.22 + Math.random() * 0.38;
      f.speed = 0.026 + Math.random() * 0.028;
    }
    f.u = atEdge ? 0.96 + Math.random() * 0.12 : Math.pow(Math.random(), 0.72);
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
    var dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    width = window.innerWidth || canvas.clientWidth || 360;
    height = window.innerHeight || canvas.clientHeight || 640;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function origin() {
    var driftX = Math.sin(clock * 0.17) * 18;
    var driftY = Math.cos(clock * 0.13) * 12;
    var goalX = driftX + pointerX * 26;
    var goalY = driftY + pointerY * 18;
    if (reduced) {
      panX = 0;
      panY = 0;
    } else {
      panX += (goalX - panX) * 0.045;
      panY += (goalY - panY) * 0.045;
    }
    return {
      x: width * 0.5 + panX * 0.35,
      y: height * 0.38 + panY * 0.35,
    };
  }

  function place(f, u, ox, oy, maxRx, maxRy) {
    var clamped = u < 0 ? 0 : u > 1.25 ? 1.25 : u;
    var fall = Math.pow(clamped, 0.62);
    var ang = f.base + spin * (0.65 + f.depth * 0.7) + clamped * TURNS * TAU + f.jitter * clamped;
    var depthScale = 0.7 + f.depth * 0.42;
    var parallax = 0.25 + f.depth;
    return {
      x: ox + panX * parallax + Math.cos(ang) * fall * maxRx * depthScale,
      y: oy + panY * parallax + Math.sin(ang) * fall * maxRy * depthScale,
    };
  }

  function onScreen(x, y, margin) {
    return x >= -margin && y >= -margin && x <= width + margin && y <= height + margin;
  }

  function appendCurve(f, ox, oy, maxRx, maxRy) {
    var steps = Math.round(f.len * (tier === "phone" ? 32 : 46));
    if (steps < 8) steps = 8;
    if (steps > sampleCap) steps = sampleCap;
    var uTail = f.u + f.len;
    var i;
    var n = 0;
    var vis = 0;
    for (i = 0; i <= steps; i++) {
      var u = uTail + (f.u - uTail) * (i / steps);
      var p = place(f, u, ox, oy, maxRx, maxRy);
      scratchX[n] = p.x;
      scratchY[n] = p.y;
      if (onScreen(p.x, p.y, 64)) vis++;
      n++;
    }
    if (vis === 0) return false;
    var started = false;
    var drew = false;
    for (i = 0; i < n; i++) {
      var x = scratchX[i];
      var y = scratchY[i];
      if (!onScreen(x, y, 96)) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
        drew = true;
      }
    }
    return drew;
  }

  function strokePass(kind, ox, oy, maxRx, maxRy) {
    ctx.beginPath();
    var i;
    var any = false;
    for (i = 0; i < filaments.length; i++) {
      if (filaments[i].kind !== kind) continue;
      if (appendCurve(filaments[i], ox, oy, maxRx, maxRy)) any = true;
    }
    return any;
  }

  function radial(ox, oy, radius, stops) {
    var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
    var i;
    for (i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  function draw(dt) {
    ctx.clearRect(0, 0, width, height);
    var maxRx = Math.min(width * 0.62, Math.max(height, width) * 0.58);
    var maxRy = Math.min(height * 0.62, maxRx * 0.9);
    var o = origin();
    var reach = Math.max(maxRx, maxRy);
    var i;

    if (!reduced && dt > 0) {
      clock += dt;
      spin += dt * 0.085;
      for (i = 0; i < filaments.length; i++) {
        var f = filaments[i];
        f.u -= f.speed * dt * (0.82 + f.depth * 0.45);
        if (f.u < -0.03) respawn(f, true);
      }
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";

    var unit = Math.max(0.85, Math.min(width, height) / 920);
    var ice = radial(o.x, o.y, reach, [
      [0, "rgba(255,255,255,1)"],
      [0.06, "rgba(236,244,255,0.95)"],
      [0.18, "rgba(176,208,255,0.72)"],
      [0.42, "rgba(126,168,232,0.28)"],
      [0.72, "rgba(110,150,210,0.08)"],
      [1, "rgba(110,150,210,0)"],
    ]);
    var warm = radial(o.x, o.y, reach * 0.92, [
      [0, "rgba(255,246,230,0.95)"],
      [0.14, "rgba(236,206,150,0.55)"],
      [0.4, "rgba(210,170,110,0.12)"],
      [1, "rgba(210,170,110,0)"],
    ]);

    ctx.strokeStyle = ice;
    if (strokePass(0, o.x, o.y, maxRx, maxRy)) {
      ctx.lineWidth = 3.4 * unit;
      ctx.globalAlpha = 0.05;
      ctx.stroke();
      ctx.lineWidth = 1.05 * unit;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
    }

    ctx.strokeStyle = ice;
    if (strokePass(1, o.x, o.y, maxRx, maxRy)) {
      ctx.lineWidth = 5.2 * unit;
      ctx.globalAlpha = 0.075;
      ctx.stroke();
      ctx.lineWidth = 1.45 * unit;
      ctx.globalAlpha = 0.62;
      ctx.stroke();
    }

    ctx.strokeStyle = warm;
    if (strokePass(2, o.x, o.y, maxRx, maxRy)) {
      ctx.lineWidth = 2.4 * unit;
      ctx.globalAlpha = 0.05;
      ctx.stroke();
      ctx.lineWidth = 1.1 * unit;
      ctx.globalAlpha = 0.28;
      ctx.stroke();
    }

    var pulse = reduced ? 1 : 0.94 + 0.06 * Math.sin(clock * 0.9);
    var coreR = Math.max(36, Math.min(width, height) * 0.075) * pulse;
    var halo = radial(o.x, o.y, coreR * 3.3, [
      [0, "rgba(255,255,255,0.9)"],
      [0.12, "rgba(226,238,255,0.48)"],
      [0.34, "rgba(150,186,255,0.16)"],
      [0.68, "rgba(120,160,230,0.05)"],
      [1, "rgba(120,160,230,0)"],
    ]);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(o.x, o.y, coreR * 3.3, 0, TAU);
    ctx.fill();

    var core = radial(o.x, o.y, coreR, [
      [0, "rgba(255,255,255,0.95)"],
      [0.28, "rgba(244,248,255,0.55)"],
      [0.62, "rgba(190,214,255,0.12)"],
      [1, "rgba(190,214,255,0)"],
    ]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(o.x, o.y, coreR, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    if (!reduced && dt > 0) {
      var drawMs = 0;
      if (draw._t0) drawMs = performance.now() - draw._t0;
      if (drawMs > 12) slowFrames++;
      else slowFrames = slowFrames > 0 ? slowFrames - 1 : 0;
      if (slowFrames >= 8 && filaments.length > floor) {
        filaments.length = Math.max(floor, Math.floor(filaments.length * 0.82));
        slowFrames = 0;
      }
    }
  }

  function tick(ts) {
    if (!running) return;
    raf = window.requestAnimationFrame(tick);
    if (!lastTs) lastTs = ts;
    var elapsed = ts - lastTs;
    if (elapsed < 15) return;
    if (elapsed > 48) {
      if (!skipped) {
        skipped = true;
        lastTs = ts;
        return;
      }
    }
    skipped = false;
    var dt = Math.min(0.032, elapsed / 1000);
    lastTs = ts;
    draw._t0 = performance.now();
    draw(dt);
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
    reduced: function () { return reduced; },
    running: function () { return running; },
  };

  draw(0);
  if (!document.hidden) start();
})();
