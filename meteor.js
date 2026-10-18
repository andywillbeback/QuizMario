/* Meteor shower for login, exam gate, and training.
 * Canvas 2D, no libraries. Replaces the spiral field on those pages.
 *
 * ~24 meteors respawn forever, twinkling stars, radial glow.
 * Speed is normalized to 60fps so 120Hz screens stay smooth.
 * Hidden tabs pause. devicePixelRatio is capped at 2.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("photon-spiral");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) return;

  var width = 0;
  var height = 0;
  var dpr = 1;
  var stars = [];
  var meteors = [];
  var raf = 0;
  var running = false;
  var lastTs = 0;
  var ANGLE = Math.PI * 0.78;
  var STAR_COUNT = 220;
  var METEOR_COUNT = 24;

  function makeMeteor(scatter) {
    return {
      x: Math.random() * width * 1.3,
      y: scatter ? Math.random() * height : -40 - Math.random() * height * 0.4,
      v: 7 + Math.random() * 9,
      len: 160 + Math.random() * 280,
      w: 0.6 + Math.random() * 1.4,
      a: 0.5 + Math.random() * 0.5
    };
  }

  function makeStars() {
    stars = [];
    for (var i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.2 + 0.2,
        t: Math.random() * 6
      });
    }
  }

  function resize() {
    width = window.innerWidth || 1;
    height = window.innerHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    meteors = [];
    for (var i = 0; i < METEOR_COUNT; i++) meteors.push(makeMeteor(true));
    makeStars();
  }

  function frame(ts) {
    raf = 0;
    if (!running) return;
    var dt = lastTs ? Math.min(34, ts - lastTs) : 16.67;
    lastTs = ts;
    var step = dt / 16.67;

    ctx.fillStyle = "#03060f";
    ctx.fillRect(0, 0, width, height);

    var glow = ctx.createRadialGradient(width / 2, height * 0.38, 0, width / 2, height * 0.38, Math.max(width, height) * 0.7);
    glow.addColorStop(0, "rgba(60,96,170,0.28)");
    glow.addColorStop(1, "rgba(3,6,15,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    var i;
    for (i = 0; i < stars.length; i++) {
      var s = stars[i];
      var alpha = 0.35 + 0.35 * Math.sin(ts / 900 + s.t);
      ctx.fillStyle = "rgba(220,232,255," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    var dx = Math.cos(ANGLE);
    var dy = Math.sin(ANGLE);
    for (i = 0; i < meteors.length; i++) {
      var m = meteors[i];
      m.x += dx * m.v * step;
      m.y += dy * m.v * step;
      var tx = m.x - dx * m.len;
      var ty = m.y - dy * m.len;
      var trail = ctx.createLinearGradient(m.x, m.y, tx, ty);
      trail.addColorStop(0, "rgba(255,255,255," + m.a + ")");
      trail.addColorStop(0.15, "rgba(190,214,255," + (m.a * 0.7) + ")");
      trail.addColorStop(1, "rgba(190,214,255,0)");
      ctx.strokeStyle = trail;
      ctx.lineWidth = m.w;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255," + m.a + ")";
      ctx.shadowColor = "#bed6ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.w * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (m.x < -300 || m.y > height + 300) {
        var next = makeMeteor(false);
        m.x = next.x;
        m.y = next.y;
        m.v = next.v;
        m.len = next.len;
        m.w = next.w;
        m.a = next.a;
      }
    }

    if (running) raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastTs = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  resize();
  seed();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) start();
})();
