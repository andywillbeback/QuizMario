// A dedicated Mac writer signs in here. Its permissions are separate from the read feed.
const expectedHash = '__RETURN_SHA256__';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const stage = new Set(['Recognize','Repair','Rebuild','Vary','Transfer']);
const production = new Set(['Rebuild','Vary','Transfer']);
const timestamp = (s:unknown) => typeof s === 'string' && s.length <= 40 &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/.test(s) &&
  Number.isFinite(Date.parse(s)) && Date.parse(s) <= Date.now()+60000;
const respond = (status:number, value:unknown) => Response.json(value, {status,headers:{'cache-control':'no-store'}});

Deno.serve(async req => {
  if (req.method !== 'POST') return respond(405, {});
  const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('Authorization')||'');
  if (!token) return respond(401, {});
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token[1])));
  const hex = Array.from(bytes,b => b.toString(16).padStart(2,'0')).join('');
  let diff = hex.length ^ expectedHash.length;
  for(let i=0;i<hex.length;i++) diff |= hex.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  if (diff) return respond(401, {});
  let step='request';
  try {
    const raw = await req.text();
    if (raw.length > 65536) return respond(413, {});
    const batch = JSON.parse(raw);
    if (!Array.isArray(batch) || !batch.length || batch.length>40) return respond(400,{});
    const ids = new Set<string>();
    for (const r of batch) {
      if (!r || ![r.learner_id,r.anchor,r.event_id,r.attempt_id].every(v=>typeof v==='string' && uuid.test(v)) ||
          ids.has(r.event_id) || !stage.has(r.stage) || !['zhongkao','gaokao','ielts'].includes(r.track) ||
          !timestamp(r.created_at) || !timestamp(r.submitted_at) || !Number.isSafeInteger(r.revision) || r.revision<0 ||
          !['verified','skipped','needs_review'].includes(r.status) ||
          (r.status === 'verified' ? typeof r.passed !== 'boolean' : r.passed !== null) ||
          (r.lexical_review !== undefined && (typeof r.lexical_review !== 'boolean' || !production.has(r.stage) ||
           (r.lexical_review && (r.status !== 'verified' || r.passed !== false))))) return respond(400,{});
      ids.add(r.event_id);
    }
    const base = 'https://cmainasvlfdynidabunp.supabase.co/rest/v1/';
    const key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
    const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const headers:Record<string,string> = {apikey:key||legacy,'Content-Type':'application/json'};
    if (!key) headers.Authorization = 'Bearer '+legacy;
    const lookup = async (table:string, columnList:string, eventIds:string[]) => {
      const p = new URLSearchParams({select:columnList,event_id:'in.('+eventIds.join(',')+')'});
      step='read_'+table;
      const res = await fetch(base+table+'?'+p,{headers,redirect:'error',signal:AbortSignal.timeout(9000)});
      if (!res.ok) {step += '_'+res.status; throw Error();}
      return await res.json();
    };
    step='read_anchors';
    const anchorReader = batch.some(r=>r.lexical_review === true) ? 'als_training_anchors_v3' : 'als_training_anchors_v2';
    const anchorResponse = await fetch(base+'rpc/'+anchorReader,{
      method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(9000),
      body:JSON.stringify({anchor_ids:[...new Set(batch.map(r=>r.anchor))]})
    });
    if (!anchorResponse.ok) return respond(503,{step,upstream:anchorResponse.status});
    const anchors=await anchorResponse.json();
    const rows = [];
    for (const r of batch) {
      const a=anchors.find((v:Record<string,unknown>)=>v.event_id===r.anchor);
      if (!a || a.track!==r.track || a.source!=='quizmario' || a.user_id!==r.learner_id || a.learner_id!==r.learner_id ||
          !['vocab.answer_wrong','vocab.answer_unknown','vocab.answer_correct','vocab.wrong_book_add','vocab.due_review','vocab.notebook_add'].includes(a.event_type) ||
          (a.synthetic && a.synthetic!=='false') || (a.source_user && a.source_user!==r.learner_id)) return respond(422,{});
      const gloss = typeof a.gloss_zh === 'string' ? a.gloss_zh.trim() : '';
      const review = r.lexical_review === true && gloss.length > 0 && gloss.length <= 300;
      const reviewFields = r.lexical_review === undefined ? {} : {
        lexical_review:review, ...(review ? {review_gloss_zh:gloss} : {})
      };
      rows.push({learner_id:r.learner_id,user_id:r.learner_id,event_id:r.event_id,source:'als',event_type:'als.training_result',
        headword:a.headword,created_at:r.created_at,payload:{version:1,stage:r.stage,track:r.track,
          attempt_id:r.attempt_id,submitted_at:r.submitted_at,sense_id:a.sense_id||null,revision:r.revision,status:r.status,passed:r.passed,source_event_id:r.anchor,...reviewFields}});
    }
    step='insert';
    const insert=await fetch(base+'als_training_results?on_conflict=event_id',{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates'},
      redirect:'error',signal:AbortSignal.timeout(9000),body:JSON.stringify(rows)});
    if (!insert.ok) return respond(503,{step,upstream:insert.status,code:(await insert.json().catch(()=>({}))).code});
    const saved=await lookup('als_training_results','event_id,learner_id,user_id,source,event_type,headword,created_at,payload',[...ids]);
    for (const r of rows) {
      const v=saved.find((item:Record<string,unknown>)=>item.event_id===r.event_id);
      if (!v || v.learner_id!==r.learner_id || v.user_id!==r.user_id || v.source!==r.source || v.event_type!==r.event_type ||
          v.headword!==r.headword || Date.parse(v.created_at)!==Date.parse(r.created_at) ||
          Object.entries(r.payload).some(([k,x])=>v.payload?.[k]!==x &&
            !((k==='lexical_review' || k==='review_gloss_zh') &&
              v.payload?.lexical_review === undefined))) return respond(409,{});
    }
    return respond(200,{acknowledged:[...ids]});
  } catch {return respond(503,{step});}
});
