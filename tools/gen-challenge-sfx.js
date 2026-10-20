/* Procedural, original challenge sound effects. No sampled or commercial audio.
 * Replace the files in place if you have a better public-domain recording:
 *   audio/15_applause.wav
 *   audio/16_crows.wav
 * Run: node tools/gen-challenge-sfx.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SR = 44100;
let seed = 20261019;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function normalize(x, peakTarget) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const gain = (peakTarget || 0.9) / (peak || 1);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * gain;
  return out;
}

function applause() {
  const dur = 1.9;
  const n = Math.floor(SR * dur);
  const x = new Float64Array(n);
  const claps = 78;
  for (let c = 0; c < claps; c++) {
    const t = 0.02 + rnd() * (dur - 0.15);
    const start = Math.floor(t * SR);
    const amp = 0.4 + rnd() * 0.7;
    const gaps = [0, Math.floor(SR * (0.003 + rnd() * 0.007))];
    for (const delay of gaps) {
      const s0 = start + delay;
      const clapLen = Math.floor(SR * (0.016 + rnd() * 0.014));
      for (let i = 0; i < clapLen && s0 + i < n; i++) {
        const env = Math.exp(-i / (SR * 0.0032));
        x[s0 + i] += (rnd() * 2 - 1) * amp * env;
      }
    }
  }
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp = lp * 0.94 + (rnd() * 2 - 1) * 0.06;
    const bed = Math.sin(Math.PI * i / n);
    x[i] += lp * 0.22 * bed;
  }
  const y = new Float64Array(n);
  for (let i = 1; i < n; i++) y[i] = x[i] - 0.82 * x[i - 1];
  return normalize(y, 0.92);
}

function crows() {
  const dur = 1.75;
  const n = Math.floor(SR * dur);
  const x = new Float64Array(n);
  const calls = [0.05, 0.55, 1.08];
  for (const t0 of calls) {
    const start = Math.floor(t0 * SR);
    const attack = Math.floor(SR * 0.014);
    for (let i = 0; i < attack && start + i < n; i++) {
      const env = Math.exp(-i / (SR * 0.0026));
      x[start + i] += (rnd() * 2 - 1) * env * 0.55;
    }
    const len = Math.floor(0.46 * SR);
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR;
      const first = t < 0.2
        ? Math.pow(Math.sin(Math.PI * Math.min(1, t / 0.18)), 0.55)
        : Math.exp(-(t - 0.18) * 7) * 0.35;
      const second = t > 0.14
        ? Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.14) / 0.22)), 0.5) * Math.exp(-Math.max(0, t - 0.28) * 5)
        : 0;
      const syllable = Math.max(0, first + 0.9 * second);
      const f = 640 * Math.pow(2, -1.15 * (t / 0.46));
      const wobble = 1 + 0.045 * Math.sin(2 * Math.PI * 26 * t);
      p1 += (2 * Math.PI * f * wobble) / SR;
      p2 += (2 * Math.PI * f * 2.03 * wobble) / SR;
      p3 += (2 * Math.PI * f * 3.15 * wobble) / SR;
      const rasp = (rnd() * 2 - 1) * 0.28;
      const tone = Math.sin(p1) * 0.55 + Math.sin(p2) * 0.3 + Math.sin(p3) * 0.18 + rasp;
      x[start + i] += tone * syllable * 0.85;
    }
  }
  return normalize(x, 0.9);
}

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

const dir = path.join(__dirname, "..", "audio");
writeWav(path.join(dir, "15_applause.wav"), applause());
writeWav(path.join(dir, "16_crows.wav"), crows());
console.log("wrote audio/15_applause.wav and audio/16_crows.wav");
