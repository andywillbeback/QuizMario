"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const game = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
const login = fs.readFileSync(path.join(__dirname, "../login.html"), "utf8");

assert.ok(game.includes("function emitLearnerAnswer"), "answer emitter still exists");
assert.ok(game.includes("function emitWrongBook"), "wrong-book emitter still exists");
assert.ok(game.includes("function signalDueItems"), "due emitter still exists");
assert.ok(game.includes("task_direction: sessionDirection"), "answers carry recognition vs production");
assert.ok(game.includes("answer_exposed:"), "answers carry the pre-attempt exposure flag");
assert.ok(game.includes("_answerExposedAt"), "a revealed retry stamps when the answer was shown");
assert.ok(game.includes("review_interval_days"), "SRS interval is forwarded when the card has one");
assert.ok(game.includes("contentVersionForTrack"), "bank version is chosen from the track");
assert.ok(game.includes("noteGrade"), "Good/Easy writes grade_status back onto the correct event");
assert.ok(game.includes("sense_id: w.sense_id"), "a bank sense id on the card is kept");
assert.ok(game.includes("event_type: LE.TYPES.WRONG_BOOK") || game.includes("LE.TYPES.WRONG_BOOK"), "wrong-book signal stays");
assert.ok(game.includes("LE.TYPES.DUE") || game.includes("recordDue"), "due signal stays");

assert.ok(!login.includes("learner-events"), "student login does not mount the learner-event exporter");
assert.ok(!login.includes("ALS 学习信号"), "student login stays free of the ALS signal panel");
assert.ok(!/schema_version/.test(login));

console.log("learner-event emitters ok");
