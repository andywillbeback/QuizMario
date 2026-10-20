const assert = require("assert");
const fs = require("fs");
const path = require("path");
const m = require("../sync-merge.js");

function card(extra) {
  return Object.assign({ reps: 1, correct: 1, wrong: 0, mastery: 1 }, extra || {});
}

function studied(n, extra) {
  const cards = {};
  for (let i = 0; i < n; i++) cards["w" + i] = card();
  return Object.assign({ points: n, unlockedLevel: 1, cards: cards }, extra || {});
}

const blank = { points: 0, unlockedLevel: 1, cards: { unused: { reps: 0, correct: 0, wrong: 0, mastery: 0 } } };

assert.strictEqual(m.isBlank(null), true);
assert.strictEqual(m.isBlank(blank), true);
assert.strictEqual(m.isBlank({
  points: 0,
  unlockedLevel: 1,
  cards: {},
  wrongBook: { "zhongkao::apple": { active: true, lemma: "apple" } },
}), false);
assert.strictEqual(m.isBlank({
  points: 0,
  unlockedLevel: 1,
  cards: {},
  wrongBook: { "zhongkao::apple": { active: false, lemma: "apple" } },
}), true);
assert.strictEqual(m.isBlank(studied(1)), false);
assert.strictEqual(m.isBlank({ unlockedLevel: 2, cards: {} }), false);
assert.strictEqual(m.studiedCount(studied(3)), 3);
assert.strictEqual(m.studiedCount(blank), 0);

assert.strictEqual(m.isCloudConfigured({
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
}), false);
assert.strictEqual(m.isCloudConfigured({
  SUPABASE_URL: "https://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "short",
}), false);
assert.strictEqual(m.isCloudConfigured({
  SUPABASE_URL: "https://abcdxyz.supabase.co/",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
}), true);
assert.strictEqual(m.isCloudConfigured({
  SUPABASE_URL: "https://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_example_key_value",
}), true);
assert.strictEqual(m.isCloudConfigured({
  SUPABASE_URL: "http://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_example_key_value",
}), false);

const configSrc = fs.readFileSync(path.join(__dirname, "../config.js"), "utf8");
const configUrl = configSrc.match(/SUPABASE_URL:\s*"([^"]+)"/)[1];
const configKey = configSrc.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];
const configSite = configSrc.match(/SITE_URL:\s*"([^"]+)"/)[1];
assert.strictEqual(configUrl, "https://cmainasvlfdynidabunp.supabase.co");
assert.strictEqual(configKey, "sb_publishable_wXq1t1Ynsj9o1qGpU5T3IQ_7M5EC1ZK");
assert.strictEqual(configSite, "https://andywillbeback.github.io/QuizMario/");
assert.strictEqual(m.isCloudConfigured({ SUPABASE_URL: configUrl, SUPABASE_ANON_KEY: configKey }), true);
assert.ok(configKey.startsWith("sb_publishable_"));
assert.ok(!/service_role["']?\s*[:=]/i.test(configSrc));

assert.deepStrictEqual(m.planSync(studied(2), null), { source: "local", reason: "no-cloud", upload: true });
assert.deepStrictEqual(
  m.planSync(blank, studied(4, { updatedAt: "2026-01-02T00:00:00.000Z" })),
  { source: "cloud", reason: "local-blank", upload: false }
);
assert.strictEqual(
  m.planSync(
    Object.assign({ updatedAt: "2026-06-01T00:00:00.000Z" }, blank),
    studied(3, { updatedAt: "2026-01-01T00:00:00.000Z" })
  ).source,
  "cloud"
);
assert.deepStrictEqual(
  m.planSync(studied(2, { updatedAt: "2026-01-03T00:00:00.000Z" }), studied(9, { updatedAt: "2026-01-01T00:00:00.000Z" })),
  { source: "local", reason: "local-newer", upload: true }
);
assert.deepStrictEqual(
  m.planSync(studied(9, { updatedAt: "2026-01-01T00:00:00.000Z" }), studied(2, { updatedAt: "2026-01-03T00:00:00.000Z" })),
  { source: "cloud", reason: "cloud-newer", upload: false }
);
assert.deepStrictEqual(
  m.planSync(studied(2, { updatedAt: "2026-01-03T00:00:00.000Z" }), studied(2, { updatedAt: "2026-01-03T00:00:00.000Z" })),
  { source: "local", reason: "same-time", upload: false }
);

const legacy = studied(5);
delete legacy.updatedAt;
assert.strictEqual(m.planSync(legacy, studied(2, { updatedAt: "2026-01-01T00:00:00.000Z" })).reason, "legacy-more-cards");
assert.strictEqual(m.planSync(studied(1), studied(4, { updatedAt: "2026-01-01T00:00:00.000Z" })).source, "cloud");

assert.strictEqual(
  m.planSync(studied(2), studied(1)).reason,
  "untimed-local"
);
assert.strictEqual(m.planSync(blank, blank).upload, false);

const row = m.normalizeCloudSave({
  save: { points: 10, cards: { a: card() } },
  updated_at: "2026-02-02T00:00:00.000Z",
});
assert.strictEqual(row.updatedAt, "2026-02-02T00:00:00.000Z");
assert.strictEqual(row.points, 10);

const wrapped = m.normalizeCloudSave({
  save: JSON.stringify({ save: { points: 3, cards: { a: card() }, updatedAt: "2026-03-03T00:00:00.000Z" } }),
  updated_at: "2026-01-01T00:00:00.000Z",
});
assert.strictEqual(wrapped.points, 3);
assert.strictEqual(wrapped.updatedAt, "2026-03-03T00:00:00.000Z");
assert.strictEqual(m.normalizeCloudSave(null), null);
assert.strictEqual(m.normalizeCloudSave({ save: "not-json{" }), null);

console.log("sync-merge tests passed");
