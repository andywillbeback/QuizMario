#!/usr/bin/env python3
"""Freeze the composite IELTS bank; never modifies school banks or learner IDs.

Build: python3 tools/build-ielts-bank.py --sources /path/to/frozen-inputs
Check: python3 tools/build-ielts-bank.py --check
Raw upstream downloads stay outside the repository. The release records hashes,
licensed reference lists, the resulting bank, and the authored corrections.
"""
import argparse
import collections
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "grok/data/ielts-v1"
VERSION = "ielts-composite-20261109-v1"
SPECIAL = {"May", "March", "Miss", "China", "WHO", "US"}
TOPICS = {"daily":"日常生活","society":"社会","thinking":"思维与表达","nature":"自然",
          "work":"工作","health":"健康","education":"教育","emotion":"情绪",
          "science":"科学","travel":"出行","economy":"经济","arts":"艺术",
          "technology":"科技","government":"公共政策","city":"城市","environment":"环境",
          "history":"历史","sport":"运动","media":"媒体"}
ALIASES = [("colour","color"),("centre","center"),("theatre","theater"),("fibre","fiber"),
           ("honour","honor"),("labour","labor"),("neighbour","neighbor"),("defence","defense"),
           ("offence","offense"),("analyse","analyze"),("organise","organize"),("realise","realize"),
           ("recognise","recognize"),("emphasise","emphasize"),("fulfil","fulfill"),
           ("humour","humor"),("harbour","harbor"),("judgement","judgment"),
           ("memorise","memorize"),("minimise","minimize"),("maximise","maximize"),
           ("randomise","randomize"),("standardise","standardize"),("socialise","socialize"),
           ("tumour","tumor"),("millimetre","millimeter"),("litre","liter"),
           ("kilometre","kilometer"),("aluminium","aluminum"),("urbanisation","urbanization"),
           ("globalisation","globalization"),("industrialisation","industrialization"),
           ("behavioural","behavioral"),("behaviour","behavior"),("characterisation","characterization")]

def key(word):
    word = word.strip()
    return word if word in SPECIAL else word.lower()

def contains(text, word):
    return bool(re.search(r"(?<![A-Za-z0-9'’])" + re.escape(word) + r"(?![A-Za-z0-9'’])", text, re.I))

def read_tsv(name):
    with (DATA/name).open() as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    assert len({r['word'] for r in rows}) == len(rows), name
    return {key(r['word']): r for r in rows}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def dump(path, value, compact=False):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=None if compact else 2,
                              separators=(',',':') if compact else None)+'\n')

def primary(row):
    text = row['meanings_zh'].split(' | ')[0].strip()
    match = re.match(r"^([A-Za-z. /-]+?)\s+(.+)$", text)
    if not match:
        raise ValueError('Unparsed POS: '+row['word']+' '+text)
    pos, gloss = match.groups()
    return pos, gloss

def ipa(text):
    text = str(text or '').strip().strip('/')
    return '/'+text+'/' if text else ''

def validate(bank):
    assert bank['id']=='ielts' and bank['version']==VERSION
    assert len(bank['sets'])==len(bank['titles'])
    cards=[c for group in bank['sets'] for c in group]
    assert len(cards)==bank['entry_count']
    assert len({key(c['word']) for c in cards})==len(cards)
    for group in bank['sets']:
        assert 1<=len(group)<=50
    invalid_context=[]
    for c in cards:
        for field in ('word','pos','meaning_zh','example_en','example_zh','source'):
            assert isinstance(c[field],str) and c[field].strip(), (c['word'],field)
        if not contains(c['example_en'],c['word']):invalid_context.append((c['word'],c['example_en']))
        assert re.search(r'[\u3400-\u9fff]',c['meaning_zh']), c['word']
    assert not invalid_context, invalid_context
    return cards

def build(sources):
    rows=list(csv.DictReader((sources/'word-atlas.csv').open()))
    assert len(rows)==7298
    assert hashlib.sha1(b'blob '+str((sources/'word-atlas.csv').stat().st_size).encode()+b'\0'+(sources/'word-atlas.csv').read_bytes()).hexdigest()=='9b605fe26b4ef2ed2127053c6503c5f9d051719e'
    existing=json.loads((sources/'existing-cards.json').read_text())
    context=json.loads((sources/'candidate-extra-examples.json').read_text())
    authored=read_tsv('authored-supplement.tsv');glosses=read_tsv('context-glosses.tsv')
    phonetics=json.loads((DATA/'phonetics.json').read_text())
    ngsl=[r['Lemma'].strip() for r in csv.DictReader((sources/'ngsl.csv').open())]
    nawl=(sources/'nawl.txt').read_text().splitlines()[5:]
    nawl=[x.strip() for x in nawl if re.fullmatch('[a-z-]+',x.strip())]
    supplemental=list(csv.reader((sources/'ngsl-supplement.csv').open(encoding='utf-8-sig')))
    supplemental=[r[0].strip() for r in supplemental if r and r[0].strip() and r[0].lower() not in ('lemma','headword')]
    assert len(ngsl)==2809 and len(nawl)==957
    catalog={}
    source_alias={'cheque/check':'cheque','outskirt':'outskirts'}
    for r in rows:
        word=source_alias.get(r['word'],r['word']);k=key(word);pos,gloss=primary(r)
        card={'word':word,'pos':pos,'meaning_zh':gloss,'ipa':r['ipa_uk'],
              'scene':'雅思·'+TOPICS.get(r['topic'],'综合'),'root_group':pos,
              'example_en':r['example1_en'],'example_zh':r['example1_zh'],
              'explain_zh':r['tip_zh'],'source':'Word Atlas CC BY 4.0','source_id':r['id']}
        if not contains(card['example_en'],word):
            if contains(r['example2_en'],word):card.update(example_en=r['example2_en'],example_zh=r['example2_zh'])
            elif word.lower() in existing:
                old=existing[word.lower()]
                if contains(old['example_en'],word):
                    card.update({f:old[f] for f in ('pos','meaning_zh','example_en','example_zh')})
                    card['source']='Word Atlas; existing QuizMario bilingual correction'
        catalog[k]=card
    required=list(dict.fromkeys(ngsl+nawl+supplemental))
    for word in required:
        k=key(word)
        if k in catalog or k in authored:continue
        if word.lower() in existing:
            old=existing[word.lower()]
            catalog[k]={f:old.get(f,'') for f in ('word','pos','meaning_zh','ipa','example_en','example_zh')}
            catalog[k].update(word=word,scene='雅思·高频补充',root_group=old['pos'],source='Existing QuizMario bilingual bank')
        elif k in context:
            g=glosses[k];e=context[k][0]
            catalog[k]={'word':word,'pos':g['pos'],'meaning_zh':g['meaning_zh'],
                        'example_en':e['example_en'],'example_zh':e['example_zh'],
                        'ipa':ipa(phonetics.get(word.lower())), 'scene':'雅思·学术补充',
                        'root_group':g['pos'],'source':'Word Atlas context; product gloss correction',
                        'source_id':e['source_id']}
        else:raise ValueError('Missing authored card: '+word)
    for k,r in authored.items():
        previous=catalog.get(k,{})
        catalog[k]={**previous,**r,'ipa':previous.get('ipa') or ipa(phonetics.get(r['word'].lower())),
                    'scene':previous.get('scene','雅思·学术与主题补充'),'root_group':r['pos'],
                    'source':'QuizMario original bilingual supplement 2026-11-09'}
    for word in required:
        assert key(word) in catalog, word
    for card in catalog.values():
        if not card.get('ipa'):card['ipa']=ipa(phonetics.get(card['word'].lower()))
    for a,b in ALIASES:
        for word,other in ((a,b),(b,a)):
            if key(word) in catalog:catalog[key(word)]['accepted_spellings']=[other]
    catalog['cheque']['accepted_spellings']=['check']
    # Reviewed wrong senses are anchored to the exact live primary gloss.
    foils={
      'bank':['河岸','库存','堤岸'],'light':['轻的','点燃','浅色的'],
      'term':['学期','任期','条款'],'current':['电流','水流','潮流'],
      'capital':['资本','大写字母','死刑的'],'plant':['工厂','种植','安插'],
      'spring':['弹簧','泉水','跳跃'],'interest':['利息','股权','利益关系'],
      'issue':['发行','流出','子女'],'cell':['牢房','电池','小组'],
      'volume':['音量','册','交易量'],'mean':['吝啬的','平均值','低劣的'],
      'charge':['充电','指控','冲锋'],'date':['约会','枣','约会对象'],
      'book':['预订','账本','订票'],'patient':['有耐心的','耐心地','能忍耐的'],
      'fine':['罚款','细小的','晴朗的'],'draft':['通风','汇票','征召'],
      'match':['火柴','相配','配对'],'plain':['平原','清楚的','完全地'],
    }
    poly=[]
    for word,wrong in foils.items():
        c=catalog.get(word)
        if not c:continue
        correct=c['meaning_zh']
        # Conservative: any shared Chinese gloss segment suspends this item.
        parts=[p for p in re.split('[；;]',correct) if p]
        if any(any(p in f or f in p for p in parts) for f in wrong):continue
        c['polysemy']={'word':c['word'],'pos':c['pos'],'glossAnchor':correct,'foils':wrong}
        poly.append(word)
    phrases={};links=collections.defaultdict(list)
    for r in rows:
        host=source_alias.get(r['word'],r['word']);hk=key(host)
        for bit in r['collocations'].split(' ; '):
            if '｜' not in bit:continue
            word,gloss=(x.strip() for x in bit.split('｜',1));pk=key(word)
            if len(word.split())<2 or pk in catalog or len(word)>90:continue
            examples=[(r[f'example{i}_en'],r[f'example{i}_zh']) for i in (1,2) if contains(r[f'example{i}_en'],word)]
            if not examples:continue
            # Retain only complete spans with the supplied bilingual context.
            en,zh=examples[0]
            if pk not in phrases:
                phrases[pk]={'word':word,'pos':'phr.','meaning_zh':gloss,'example_en':en,'example_zh':zh,
                             'ipa':'','scene':'雅思·固定搭配','root_group':'phr.',
                             'source':'Word Atlas collocation and bilingual context CC BY 4.0','source_id':r['id'],'related':[]}
            if host not in phrases[pk]['related']:phrases[pk]['related'].append(host)
            if word not in links[hk]:links[hk].append(word)
    for pk,row in read_tsv('authored-collocations.tsv').items():
        if pk in catalog:continue
        parents=[x.strip() for x in row['related'].split(',') if key(x.strip()) in catalog]
        phrases[pk]={'word':row['word'],'pos':'phr.','meaning_zh':row['meaning_zh'],
                     'example_en':row['example_en'],'example_zh':row['example_zh'],
                     'ipa':'','scene':'雅思·固定搭配','root_group':'phr.',
                     'source':'QuizMario original IELTS collocation 2026-11-09','related':parents}
        for parent in parents:
            hk=key(parent)
            if row['word'] in links[hk]:links[hk].remove(row['word'])
            links[hk].insert(0,row['word'])
    for hk,items in links.items():
        if hk in catalog:catalog[hk]['related']=items
    # First units prioritise useful IELTS expression, then the complete NAWL,
    # NGSL and topic extension. Future releases must append, never resort v1.
    anchors='analyse assess evidence impact significant sustainable environment benefit approach issue factor data research indicate require academic accommodation biodiversity sustainability demographic urbanisation'.split()
    theme_core='sustainability demographic accommodate urbanisation decarbonisation affordability resilience renewables'.split()
    buckets=[('雅思·学术与主题核心',anchors+nawl+theme_core),('雅思·通用高频',ngsl+supplemental),('雅思·主题拓展',list(catalog))]
    sets=[];titles=[];used=set();used_phrases=set()
    for label,words in buckets:
        group=[];number=0
        for word in words:
            k=key(word)
            if k in used or k not in catalog:continue
            card=catalog[k];pair=[card]
            options=links.get(k,[])
            if options and key(options[0]) not in used_phrases:
                pair.append(phrases[key(options[0])])
            if group and len(group)+len(pair)>50:
                number+=1;sets.append(group);titles.append(f'{label} · 第{number}组');group=[]
            group.extend(pair);used.add(k)
            if len(pair)==2:used_phrases.add(key(pair[1]['word']))
        if group:number+=1;sets.append(group);titles.append(f'{label} · 第{number}组')
    remainder=[v for k,v in phrases.items() if k not in used_phrases]
    for i in range(0,len(remainder),50):
        sets.append(remainder[i:i+50]);titles.append(f'雅思·固定搭配 · 第{i//50+1}组')
    bank={'id':'ielts','version':VERSION,'name':'雅思','sets':sets,'titles':titles,
          'entry_count':sum(map(len,sets)),'desc':'通用高频＋学术核心＋主题词汇与搭配；综合学习词库，非官方完整考试词表。',
          'word_count':len(catalog),'phrase_count':len(phrases),'ordering_policy':'Frozen v1; future additions append without moving existing cards.'}
    validate(bank)
    dump(DATA/'bank.json',bank,True)
    lists={'NGSL_1_2':ngsl,'NGSL_supplement':supplemental,'NAWL_1_2':nawl,
           'Word_Atlas_2026_11_09':[r['word'] for r in rows], 'source_aliases':source_alias}
    dump(DATA/'headwords.json',lists)
    coverage={'version':VERSION,'published_at':'2026-11-09','word_count':len(catalog),'phrase_count':len(phrases),
              'entry_count':bank['entry_count'],'set_count':len(sets),'polysemy_items':poly,
              'bank_sha256':digest(DATA/'bank.json'),'source_input_sha256':{n:digest(sources/n) for n in ('word-atlas.csv','ngsl.csv','nawl.txt','ngsl-supplement.csv')},
              'coverage':{name:{'required':len(words),'covered':sum(key(source_alias.get(w,w)) in catalog for w in words)} for name,words in lists.items() if isinstance(words,list)},
              'authored_or_corrected_examples':len(authored),
              'scope':'All frozen reference headwords, with explicit aliases. Not all possible IELTS vocabulary, not 8000 word families, not a band score claim.',
              'quality_boundary':'All records undergo structural, exact-context, coverage, uniqueness and reference checks. Upstream AI text was not proofread entry by entry by humans.'}
    dump(DATA/'coverage.json',coverage)
    print(json.dumps({k:coverage[k] for k in ('word_count','phrase_count','entry_count','set_count','coverage')},ensure_ascii=False))

def check():
    bank=json.loads((DATA/'bank.json').read_text());cards=validate(bank)
    coverage=json.loads((DATA/'coverage.json').read_text());assert digest(DATA/'bank.json')==coverage['bank_sha256']
    lists=json.loads((DATA/'headwords.json').read_text());words={key(c['word']) for c in cards}
    for name,required in lists.items():
        if not isinstance(required,list):continue
        assert all(key(lists['source_aliases'].get(w,w)) in words for w in required),name
    print('IELTS frozen bank integrity and reference coverage passed:',len(cards),'entries')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--sources',type=Path);ap.add_argument('--check',action='store_true');args=ap.parse_args()
    if args.check:check()
    elif args.sources:build(args.sources)
    else:ap.error('Use --sources or --check')
