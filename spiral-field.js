/* Discrete photon spiral shared by login, home, and teacher chrome.
 * Canvas 2D only: capped count, capped DPR, paused while the tab is hidden.
 * No audio. Reduced motion draws one still frame.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("photon-spiral");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = motionQuery.matches;
  var particles = [];
  var spin = 0.6;
  var raf = 0;
  var running = false;
  var lastTs = 0;
  var width = 0;
  var height = 0;

  var ARMS = 2;
  var TURNS = 2.35;

  function sprite(rgb, size) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    var mid = size / 2;
    var grd = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
    grd.addColorStop(0, "rgba(" + rgb + ",1)");
    grd.addColorStop(0.16, "rgba(" + rgb + ",0.95)");
    grd.addColorStop(0.34, "rgba(" + rgb + ",0.22)");
    grd.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  var sprites = {
    white: sprite("236,244,255", 24),
    blue: sprite("170,206,255", 24),
    amber: sprite("255,186,96", 24),
  };

  function particleBudget() {
    var w = window.innerWidth || 360;
    var h = window.innerHeight || 640;
    var memory = navigator.deviceMemory || 8;
    var cores = navigator.hardwareConcurrency || 8;
    if (memory <= 2 || cores <= 2 || Math.min(w, h) < 420) return 360;
    if (w < 760) return 480;
    return 880;
  }

  function seed(p, atEdge) {
    p.arm = Math.random() < 0.5 ? 0 : 1;
    p.rad = atEdge ? 0.94 + Math.random() * 0.06 : 0.06 + Math.random() * 0.94;
    var tight = Math.random() < 0.82;
    p.jitter = (Math.random() - 0.5) * (tight ? 0.16 : 0.48);
    p.speed = 0.045 + Math.random() * 0.04;
    p.size = Math.random() < 0.08 ? 1.7 : 0.4 + Math.random() * 0.75;
    var roll = Math.random();
    p.kind = roll < 0.07 ? "amber" : roll < 0.5 ? "blue" : "white";
    p.tw = Math.random() * Math.PI * 2;
    p.twSpeed = 0.7 + Math.random() * 1.6;
    p.bright = tight ? 0.8 + Math.random() * 0.35 : 0.28 + Math.random() * 0.2;
  }

  function fillPool() {
    var target = particleBudget();
    if (particles.length > target) particles.length = target;
    while (particles.length < target) {
      var p = {};
      seed(p, false);
      particles.push(p);
    }
  }

  function resize() {
    var cap = (window.innerWidth || 800) < 800 ? 1.25 : 1.5;
    var dpr = Math.min(window.devicePixelRatio || 1, cap);
    width = window.innerWidth || canvas.clientWidth || 360;
    height = window.innerHeight || canvas.clientHeight || 640;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, width, height);
    var cx = width * 0.5;
    var cy = height * 0.4;
    var maxRx = Math.min(width * 0.48, Math.max(height, width * 0.7) * 0.46);
    var maxRy = Math.min(height * 0.46, maxRx * 0.92);
    var i;

    if (!reduced) spin += dt * 0.13;

    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!reduced) {
        p.rad -= p.speed * dt;
        p.tw += dt * p.twSpeed;
        if (p.rad < 0.02) seed(p, true);
      }
      var ang = p.arm * Math.PI + p.rad * TURNS * Math.PI * 2 + spin + p.jitter * (0.35 + p.rad);
      var r = p.rad;
      var x = cx + Math.cos(ang) * r * maxRx;
      var y = cy + Math.sin(ang) * r * maxRy;
      var twinkle = 0.7 + 0.3 * Math.sin(p.tw);
      var alpha = Math.min(0.92, twinkle * p.bright * (0.55 + (1 - p.rad) * 0.4));
      var dim = (p.kind === "amber" ? 8.5 : 5.2) * p.size;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprites[p.kind], x - dim * 0.5, y - dim * 0.5, dim, dim);
    }

    var haloR = Math.max(28, Math.min(width, height) * 0.04);
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR * 2.4);
    halo.addColorStop(0, "rgba(255,255,255,0.95)");
    halo.addColorStop(0.2, "rgba(214,230,255,0.42)");
    halo.addColorStop(0.55, "rgba(150,188,255,0.08)");
    halo.addColorStop(1, "rgba(150,188,255,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR * 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function tick(ts) {
    if (!running) return;
    raf = window.requestAnimationFrame(tick);
    if (!lastTs) lastTs = ts;
    var elapsed = ts - lastTs;
    if (elapsed < 33) return;
    var dt = Math.min(0.05, elapsed / 1000);
    lastTs = ts;
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
    if (reduced || !running) draw(0);
  }

  resize();
  fillPool();
  window.addEventListener("resize", onResize);
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
    count: function () { return particles.length; },
    reduced: function () { return reduced; },
    running: function () { return running; },
  };

  if (document.hidden) draw(0);
  else start();
})();
