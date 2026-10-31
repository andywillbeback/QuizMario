/* Focused study time for the teacher board.
 * SM-2 clocks stay in srs-rules.js. This file only measures minutes.
 *
 * A slice counts while the page is visible and the last pointer or key
 * event is within IDLE_MS. Hidden time and the gap after the idle
 * boundary are not study. session.start opens a slice; session.end
 * closes it with the whole slice in duration_ms. Heartbeats fold the
 * same milliseconds into save.studyDaily so the board can sum a day
 * without reading every event. A heartbeat does not emit another end,
 * and the board must not add session.end on top of studyDaily.
 *
 * studyDaily is separate from save.daily so a minutes-only day does not
 * become a streak check-in. When that day's answer bucket already
 * exists, studyMs on the bucket mirrors the same total.
 *
 * Also require()-able from node tests. The game page binds the clock.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var IDLE_MS = 3 * 60 * 1000;
  var HEARTBEAT_MS = 60 * 1000;
  var SESSION_START = "session.start";
  var SESSION_END = "session.end";

  function dayKey(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function nextLocalMidnight(ms) {
    var d = new Date(ms);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  function iso(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  }

  /** One decimal minute. 0 stays 0. 30s is 0.5. */
  function msToMinutes(ms) {
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n / 6000) / 10;
  }

  /**
   * Add focused milliseconds ending at endMs. Splits on local midnight.
   * Does not create a save.daily key. Mirrors studyMs when the key exists.
   * Returns the milliseconds actually stored.
   */
  function addStudyMs(save, endMs, deltaMs) {
    if (!save || typeof save !== "object") return 0;
    deltaMs = Math.round(Number(deltaMs) || 0);
    endMs = Number(endMs) || 0;
    if (deltaMs <= 0 || !endMs) return 0;
    if (!save.studyDaily || typeof save.studyDaily !== "object" || Array.isArray(save.studyDaily)) {
      save.studyDaily = {};
    }
    var start = endMs - deltaMs;
    var cursor = start;
    var stored = 0;
    while (cursor < endMs) {
      var boundary = nextLocalMidnight(cursor);
      var sliceEnd = boundary < endMs ? boundary : endMs;
      var slice = Math.round(sliceEnd - cursor);
      if (slice > 0) {
        var key = dayKey(cursor);
        if (key) {
          save.studyDaily[key] = Math.round((Number(save.studyDaily[key]) || 0) + slice);
          var bucket = save.daily && save.daily[key];
          if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
            bucket.studyMs = save.studyDaily[key];
          }
          stored += slice;
        }
      }
      if (sliceEnd <= cursor) break;
      cursor = sliceEnd;
    }
    return stored;
  }

  function startEvent(at) {
    return {
      event_type: SESSION_START,
      started_at: iso(at),
      created_at: iso(at),
    };
  }

  function endEvent(runStart, endedAt, runMs, reason) {
    var ms = Math.round(runMs);
    return {
      event_type: SESSION_END,
      duration_ms: ms,
      duration_sec: Math.round(ms / 1000),
      started_at: iso(runStart),
      ended_at: iso(endedAt),
      end_reason: reason || "",
      created_at: iso(endedAt),
    };
  }

  /**
   * Focused-time clock. activity / setVisible / tick / end return
   * { events, pendingMs, at }. pendingMs is the unflushed slice to add
   * once; events are the new start/end rows. Below HEARTBEAT_MS the
   * pending time stays on the clock until the slice ends.
   */
  function createClock(opts) {
    opts = opts || {};
    var idleMs = Number(opts.idleMs) > 0 ? Number(opts.idleMs) : IDLE_MS;
    var heartbeatMs = Number(opts.heartbeatMs) > 0 ? Number(opts.heartbeatMs) : HEARTBEAT_MS;
    var visible = opts.visible !== false;
    var lastActivity = 0;
    var running = false;
    var runStart = 0;
    var cursor = 0;
    var runMs = 0;
    var pendingMs = 0;
    var pendingAt = 0;

    function idleBoundary() {
      return lastActivity + idleMs;
    }

    function accrue(now) {
      if (!running) return;
      var cap = idleBoundary();
      var end = now < cap ? now : cap;
      if (end <= cursor) return;
      var add = end - cursor;
      runMs += add;
      pendingMs += add;
      pendingAt = end;
      cursor = end;
    }

    function takePending() {
      var n = pendingMs;
      pendingMs = 0;
      var at = pendingAt;
      return { ms: n, at: at };
    }

    function close(now, reason) {
      if (!running) return [];
      accrue(now);
      var endedAt = cursor || now;
      var events = [];
      if (runMs > 0) events.push(endEvent(runStart, endedAt, runMs, reason));
      running = false;
      runMs = 0;
      return events;
    }

    function open(at) {
      running = true;
      runStart = at;
      cursor = at;
      runMs = 0;
      return [startEvent(at)];
    }

    function pack(events, flushed) {
      return {
        events: events || [],
        pendingMs: flushed && flushed.ms > 0 ? Math.round(flushed.ms) : 0,
        at: flushed && flushed.at ? flushed.at : 0,
      };
    }

    function activity(now) {
      now = Number(now) || 0;
      if (!visible || !now) return pack([], null);
      var events = [];
      var closed = false;
      if (running && lastActivity && now - lastActivity > idleMs) {
        events = close(lastActivity + idleMs, "idle");
        closed = true;
      } else if (running) {
        accrue(now);
      }
      lastActivity = now;
      if (!running) events = events.concat(open(now));
      var flushed = null;
      if (closed || pendingMs >= heartbeatMs) flushed = takePending();
      return pack(events, flushed);
    }

    function setVisible(next, now) {
      now = Number(now) || 0;
      var on = !!next;
      if (visible === on) return pack([], null);
      if (!on) {
        visible = false;
        var events = close(now, "hidden");
        return pack(events, takePending());
      }
      visible = true;
      return pack([], null);
    }

    function tick(now) {
      now = Number(now) || 0;
      if (!running) return pack([], null);
      if (lastActivity && now - lastActivity > idleMs) {
        var events = close(lastActivity + idleMs, "idle");
        return pack(events, takePending());
      }
      accrue(now);
      if (pendingMs >= heartbeatMs) return pack([], takePending());
      return pack([], null);
    }

    function end(now, reason) {
      now = Number(now) || 0;
      visible = false;
      var events = close(now, reason || "end");
      return pack(events, takePending());
    }

    return {
      activity: activity,
      setVisible: setVisible,
      tick: tick,
      end: end,
    };
  }

  return {
    IDLE_MS: IDLE_MS,
    HEARTBEAT_MS: HEARTBEAT_MS,
    SESSION_START: SESSION_START,
    SESSION_END: SESSION_END,
    dayKey: dayKey,
    msToMinutes: msToMinutes,
    addStudyMs: addStudyMs,
    createClock: createClock,
  };
});
