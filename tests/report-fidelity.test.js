const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../grok/study-metrics.js');
const now = new Date('2026-11-08T04:00:00Z');
const at = '2026-11-08T03:00:00Z';
const day = api.dayKey(now);
function card(wrong = 0) {
  return {state:'review', interval:2, reps:5, mastery:3, correct:5, wrong, due:now.getTime()+86400000};
}
function progress(id, track, cards, extra = {}) {
  return {user_id:id,updated_at:at,save:{track,cards,profile:{name:id},...extra}};
}
function answer(id, track, word, type = 'vocab.answer_correct', time = at) {
  return {event_id:id+'-'+track+'-'+word+'-'+type,learner_id:id,user_id:id,event_type:type,created_at:time,
    item_id:track+'|0::'+word,headword:word,payload:{track,task_direction:'recognition'}};
}
function row(p, events = []) { return api.buildBoard([p],events,[],now).students[0]; }

// A selector is not evidence that any answer happened in that track.
const stale = row(progress('test-a','zhongkao',{'gaokao|0::evidence':card()}));
assert.strictEqual(stale.trackLabel,'高考','a stale 中考 selector must not relabel 高考 cards');
assert.strictEqual(stale.trackContext.selectedTrack,'zhongkao');
assert.ok(stale.summary.includes('全部词库累计'));
assert.ok(!stale.summary.includes('正在使用中考'));

const multi = progress('test-b','zhongkao',{'gaokao|0::evidence':card(),'zhongkao|0::agree':card()});
const recent = row(multi,[answer('test-b','gaokao','evidence')]);
assert.strictEqual(recent.trackLabel,'高考');
assert.strictEqual(recent.trackContext.source,'answer-event');
assert.strictEqual(recent.touched,2,'the total remains all-track and must say so');
const mixed = row(multi);
assert.ok(mixed.trackLabel.includes('多词库'));
assert.ok(mixed.trackLabel.includes('中考') && mixed.trackLabel.includes('高考'));

const noPractice = row(progress('test-c','zhongkao',{}),[
  {...answer('test-c','gaokao','evidence'),'event_type':'vocab.due_review'},
]);
assert.strictEqual(noPractice.trackContext.source,'unverified');
assert.ok(!noPractice.summary.includes('正在使用'));
assert.strictEqual(noPractice.active7,false,'a passive due signal is not learner activity');

// Missing payload.track can use a retained item id. Conflicting tags stay unresolved.
const keyed = answer('test-d','gaokao','evidence'); keyed.payload = {};
assert.strictEqual(row(progress('test-d','zhongkao',{}),[keyed]).trackLabel,'高考');
const conflict = answer('test-e','gaokao','evidence'); conflict.payload.track='zhongkao';
assert.strictEqual(row(progress('test-e','zhongkao',{}),[conflict]).trackContext.conflictingAnswers,1);

// A student's score, gloss and ranking cannot depend on who was processed first.
const pa = progress('one','gaokao',{'gaokao|0::bank':card(7)},
  {wrongBook:{'gaokao::bank':{active:true,lemma:'bank',gloss_zh:'河岸'}}});
const pb = progress('two','zhongkao',{'zhongkao|0::bank':card(1)},
  {wrongBook:{'zhongkao::bank':{active:true,lemma:'bank',gloss_zh:'银行'}}});
function ownWeak(rows,id) {
  return api.buildBoard(rows,[],[],now).students.find(s=>s.id===id).weak.find(w=>w.word==='bank');
}
assert.deepStrictEqual(ownWeak([pa,pb],'two'),ownWeak([pb,pa],'two'));
assert.strictEqual(ownWeak([pa,pb],'two').score,1);
assert.strictEqual(ownWeak([pa,pb],'two').gloss,'银行');
assert.strictEqual(ownWeak([pa,pb],'one').score,7);
const cohort=Array.from({length:12},(_,i)=>progress('cohort-'+i,i%2?'gaokao':'zhongkao',
  {[i%2?'gaokao|0::bank':'zhongkao|0::bank']:card(i+1)},
  {wrongBook:{['track::bank']:{active:true,lemma:'bank',gloss_zh:'本人的释义'+i}}}));
const original=api.buildBoard(cohort,[],[],now);
const reversed=api.buildBoard(cohort.slice().reverse(),[],[],now);
for (const student of original.students) {
  const other=reversed.students.find(s=>s.id===student.id);
  assert.deepStrictEqual(student.weak,other.weak,'all student weak lists must be independent of class ordering');
  assert.ok(api.studentReportHtml(student,'2026-11-08').includes(student.summary));
}

// The save and the event can describe the same failure; they are not added.
const pe = progress('retry','gaokao',{'gaokao|0::evidence':card(1)},
  {daily:{[day]:{c:6,w:1,unk:0}}});
const wrong = answer('retry','gaokao','evidence','vocab.answer_wrong');
const book = {...answer('retry','gaokao','evidence','vocab.wrong_book_add'),event_id:'book'};
const evidence = row(pe,[wrong,book]);
assert.strictEqual(evidence.weak.find(w=>w.word==='evidence').score,1);
assert.strictEqual(evidence.answerEvents7,1);
assert.strictEqual(evidence.wrongBookEvents7,1);
assert.strictEqual(evidence.practice7,2);
assert.ok(evidence.summary.includes('不相加'));
assert.ok(!evidence.summary.includes('另外记到'));

// Polysemy-only practice is a real touched card even if the receptive SRS is new.
const poly = {state:'new',reps:0,correct:0,wrong:0,mastery:0,polysemy:{correct:2,wrong:1}};
assert.strictEqual(api.cardTouched(poly),true);
assert.strictEqual(row(progress('poly','gaokao',{'gaokao|0::fair':poly})).touched,1);
const collocOnly={state:'new',reps:0,correct:0,wrong:0,mastery:0,collocationEvidence:{correct:4,wrong:1}};
assert.strictEqual(api.cardTouched(collocOnly),true,'the collocation gate is also real practice');
const collocRow=row(progress('colloc','zhongkao',{'zhongkao|80::be able to':collocOnly}));
assert.strictEqual(collocRow.touched,1);
assert.strictEqual(collocRow.abilities.find(a=>a.id==='collocation').score,80);
assert.strictEqual(api.reviewDueCount(collocRow.forget),0,'a gate-only card is not silently added to SRS');

const frozen={snapshot_version:'teacher-board-v2',generated_at:now.toISOString(),event_since:'2026-10-25T04:00:00Z',
  progress:[{...pa,source_card_count:1},{...pb,source_card_count:1}],events:[],directory:[]};
const verified=api.fromSnapshot(frozen);
assert.ok(verified.integrity.ok);
assert.strictEqual(verified.dataReadAt,frozen.generated_at);
assert.ok(api.studentReportHtml(verified.students[0],'2026-11-08').includes('数据读取时间'));
verified.students[0].weak[0].score+=10;
assert.strictEqual(api.auditBoardSnapshot(verified,frozen,now).ok,false,'modified student results block export');
assert.throws(()=>api.fromSnapshot({...frozen,snapshot_version:'old'}),/校验/);
assert.throws(()=>api.fromSnapshot({...frozen,progress:[{...pa,source_card_count:2},{...pb,source_card_count:1}]}),/校验/);

// The HTML and board must use the same verified snapshot, including its limitations.
const html = api.studentReportHtml(recent,'2026-11-08');
assert.ok(html.includes(recent.summary));
assert.ok(html.includes('全部词库累计'));
assert.ok(html.includes('高考'));
assert.ok(!html.includes('正在使用中考'));
assert.ok(!html.includes('eyJ'));

// Cloud projection must retain enough metadata to attribute and de-duplicate events.
const sql = fs.readFileSync(path.join(__dirname,'../grok/supabase/teacher_read.sql'),'utf8');
assert.ok(sql.includes("'event_id', e.event_id"));
assert.ok(sql.includes("'item_id', e.item_id"));
assert.ok(sql.includes("'track', payload->'track'"));
assert.ok(sql.includes("'track', e.payload->'track'"));
assert.ok(sql.includes("'polysemy', c.value->'polysemy'"));
console.log('report-fidelity ok');
