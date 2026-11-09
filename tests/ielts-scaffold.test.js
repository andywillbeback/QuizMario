'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const metrics = require('../grok/study-metrics.js');
const poly = require('../grok/polysemy.js');
const sense = require('../grok/sense-id.js');

const root = path.join(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }

assert.strictEqual(poly.isPolysemyTrack('ielts'), false, '雅思 stays on typed spelling');
assert.strictEqual(poly.isPolysemyTrack('gaokao'), true);
assert.strictEqual(sense.cardKeyFor('ielts', 2, 'approach'), 'ielts|2::approach');

const ctx = { window: { VOCAB_EXAM_TRACKS: [{ id: 'zhongkao', sets: [[{ word: 'a' }]] }, { id: 'gaokao', sets: [[{ word: 'b' }]] }], VOCAB_TRACKS: [{ id: 'zhongkao' }, { id: 'gaokao' }, { id: 'core' }] } };
vm.createContext(ctx);
vm.runInContext(read('grok/ielts-track.js'), ctx);
const ielts = ctx.window.VOCAB_TRACKS.find((t) => t.id === 'ielts');
assert.ok(ielts, 'track id is registered');
assert.strictEqual(ielts.sets.length, 0, 'no lexicon is shipped in the scaffold');
assert.strictEqual(ctx.window.VOCAB_TRACKS.map((t) => t.id).join(','), 'zhongkao,gaokao,ielts,core');
assert.strictEqual(ctx.window.VOCAB_EXAM_TRACKS.filter((t) => t.id === 'ielts').length, 1);

const now = new Date('2026-11-09T02:00:00Z');
function dayKey(value) {
  const d = new Date(value);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
const day = dayKey(now);
function card(due) {
  return { state: 'review', interval: 2, reps: 3, mastery: 2, correct: 2, wrong: 0, unknown: 0, due: due };
}
const save = {
  track: 'gaokao',
  profile: { name: '测' },
  daily: { [day]: { c: 483, w: 20, unk: 6 } },
  cards: {
    'gaokao|0::keep': card(now.getTime() + 86400000),
    'ielts|0::approach': card(now.getTime() - 1000),
    'zhongkao|0::old': card(now.getTime() - 86400000),
  },
};
const row = metrics.buildPersonal(save, [], now, { id: 'self' });
assert.strictEqual(row.ieltsTouched, 1);
assert.strictEqual(row.ieltsDue, 1);
assert.strictEqual(row.touched, 3, 'cumulative card count still includes every bank');
assert.strictEqual(row.answers7, 509, 'historical daily totals stay unsplit');
assert.ok(row.summary.includes('雅思已接触 1 张词条卡，雅思待复习 1 个'));
assert.ok(row.summary.includes('全部词库累计'));
assert.ok(!row.summary.includes('已学会'));
const html = metrics.studentReportHtml(row, '2026-11-09');
assert.ok(html.includes('雅思已接触 1'));
assert.ok(html.includes('雅思待复习 1'));
assert.ok(!html.includes('已学会'));
const notes = metrics.reportDataNotes(row);
assert.ok(notes.includes('不把历史天数拆开'));

const zero = metrics.buildPersonal({ track: 'zhongkao', cards: { 'zhongkao|0::old': card(now.getTime() + 86400000) }, daily: save.daily }, [], now);
assert.strictEqual(zero.ieltsTouched, 0);
assert.strictEqual(zero.ieltsDue, 0);
assert.strictEqual(zero.answers7, 509);

const page = read('grok/index.html');
const game = read('grok/game.js');
assert.ok(page.includes('id="btn-gate-ielts"'));
assert.ok(game.includes('enterExam("ielts")'));
assert.ok(!game.includes('isPolysemyTrack("ielts")') && !read('grok/polysemy.js').includes('ielts'));
assert.ok(read('grok/config.js').includes('supabase.co'));
assert.ok(!read('grok/config.js').includes('workers.dev'));
assert.ok(!read('grok/config.js').includes('SUPABASE_FALLBACK_URL'));

console.log('ielts-scaffold ok');
