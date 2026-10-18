/* Discrete photon spiral for the login page.
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
  var spin = 0.4;
  var raf = 0;
  var running = false;
  var lastTs = 0;
  var width = 0;
  var height = 0;

  var ARMS = 2;
  var ARM_STEP = Math.PI;
  var TURNS = 2.15;

  function sprite(rgb, size) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    var mid = size / 2;
    var grd = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
    grd.addColorStop(0, "rgba(" + rgb + ",1)");
    grd.addColorStop(0.18, "rgba(" + rgb + ",0.9)");
    grd.addColorStop(0.42, "rgba(" + rgb + ",0.28)");
    grd.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  var sprites = {
    white: sprite("238,246,255", 32),
    blue: sprite("176,210,255", 32),
    amber: sprite("255,198,112", 32),
  };

  function particleBudget() {
    var shortest = Math.min(window.innerWidth || 360, window.innerHeight || 640);
    var memory = navigator.deviceMemory || 8;
    var cores = navigator.hardwareConcurrency || 4;
    if (shortest < 520 || memory <= 2 || cores <= 2) return 320;
    if (shortest < 820 || memory <= 4) return 520;
    return 860;
  }

  function seed(p, atEdge) {
    p.arm = Math.random() < 0.5 ? 0 : 1;
    var u = Math.random();
    p.rad = atEdge ? 0.86 + Math.random() * 0.14 : 0.05 + Math.pow(u, 0.72) * 0.95;
    p.jitter = (Math.random() - 0.5) * 0.42;
    p.speed = 0.028 + Math.random() * 0.034;
    p.size = 0.35 + Math.random() * 1.05;
    var roll = Math.random();
    p.kind = roll < 0.065 ? "amber" : roll < 0.46 ? "blue" : "white";
    p.tw = Math.random() * Math.PI * 2;
    p.twSpeed = 0.8 + Math.random() * 1.8;
    p.bright = Math.random() < 0.14 ? 1.35 : 0.75 + Math.random() * 0.35;
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
    var cy = height * 0.34;
    var maxR = Math.max(180, Math.min(width, height) * 0.78);
    var i;

    if (!reduced) spin += dt * 0.16;

    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.42);
    halo.addColorStop(0, "rgba(255,255,255,0.92)");
    halo.addColorStop(0.035, "rgba(226,238,255,0.55)");
    halo.addColorStop(0.1, "rgba(150,188,255,0.16)");
    halo.addColorStop(0.28, "rgba(120,160,230,0.05)");
    halo.addColorStop(1, "rgba(120,160,230,0)");
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!reduced) {
        p.rad -= p.speed * dt * (0.55 + p.rad);
        p.tw += dt * p.twSpeed;
        if (p.rad < 0.012) seed(p, true);
      }
      var ang = p.arm * ARM_STEP + p.rad * TURNS * Math.PI * 2 + spin + p.jitter * (0.18 + p.rad);
      var r = Math.pow(p.rad, 0.92) * maxR;
      var x = cx + Math.cos(ang) * r;
      var y = cy + Math.sin(ang) * r * 0.9;
      var twinkle = 0.62 + 0.38 * Math.sin(p.tw);
      var alpha = Math.min(1, twinkle * p.bright * (0.28 + (1 - p.rad) * 0.85));
      var dim = (p.kind === "amber" ? 11 : 8) * (0.42 + p.size * 0.5) * (0.75 + p.rad * 0.45);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprites[p.kind], x - dim * 0.5, y - dim * 0.5, dim, dim);
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
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
  };

  if (document.hidden) draw(0);
  else start();
})();
