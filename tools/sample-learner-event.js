#!/usr/bin/env node
/* Print one schema-v2 QuizMario learner event as JSONL.
 * node tools/sample-learner-event.js
 */
"use strict";

const le = require("../learner-events");
process.stdout.write(le.toJsonl([le.sampleEvent()]));
