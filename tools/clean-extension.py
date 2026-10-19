#!/usr/bin/env python3
"""Decide which circulating-list words become 中考拓展 / 高考拓展 cards.

Official 课标 headwords are not repeated here. Junk, typos, contractions, and
inflected forms whose base is already present are dropped with a reason.
Spelling variants collapse to the British form used in the curriculum.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

from lemminflect import getAllLemmas

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "data" / "audit"

ALIASES = {
    "color": "colour", "favorite": "favourite", "center": "centre", "theater": "theatre",
    "gray": "grey", "meter": "metre", "liter": "litre", "honor": "honour", "labor": "labour",
    "neighbor": "neighbour", "defense": "defence", "offense": "offence", "license": "licence",
    "dialog": "dialogue", "program": "programme", "organize": "organise", "realize": "realise",
    "analyze": "analyse", "behavior": "behaviour", "toward": "towards", "mom": "mum",
    "mommy": "mum", "math": "maths", "airplane": "aeroplane", "aluminum": "aluminium",
    "catalog": "catalogue", "humor": "humour", "flavor": "flavour", "favor": "favour",
    "rumor": "rumour", "odor": "odour", "harbor": "harbour", "armor": "armour",
    "endeavor": "endeavour", "judgment": "judgement", "skillful": "skilful", "fulfill": "fulfil",
    "inquiry": "enquiry", "mustache": "moustache", "pajamas": "pyjamas", "plow": "plough",
    "skeptical": "sceptical", "specialty": "speciality", "aging": "ageing", "percent": "per cent",
    "ice cream": "ice-cream", "email": "e-mail", "ok": "okay", "wifi": "wi-fi",
    "practice": "practise", "kilometer": "kilometre", "centimeter": "centimetre",
    "millimeter": "millimetre", "gram": "gramme", "apologize": "apologise",
    "recognize": "recognise", "yogurt": "yoghurt", "woolen": "woollen", "jewelry": "jewellery",
    "tire": "tyre", "story": "storey", "good-bye": "goodbye", "co-operation": "cooperation",
    "cafe": "café", "organization": "organisation", "fiber": "fibre", "cozy": "cosy",
    "check-out": "checkout", "u.k.": "uk", "u.s.a.": "usa", "u.s.": "us",
}

JUNK = {
    "buttom": "typo of bottom, which is already taught",
    "expanation": "typo of explanation",
    "govenment": "typo of government",
    "lastest": "typo of latest",
    "sperate": "typo of separate",
    "stanger": "typo of stranger",
    "strenghth": "typo of strength",
    "varous": "typo of various",
    "office,": "punctuation scrape of office, which is already taught",
    "really v": "part-of-speech tag glued onto really; not a headword",
    "silentˈsailənt] a. 无声的，无对话的": "dictionary scrape, not a headword (silent is already taught)",
    "top-right": "layout label from a word-list page, not a lemma",
    "york": "fragment of New York, which is on the official 课标 list",
    "woops": "misspelling of oops (oops is kept)",
    "won't": "contraction of will; will is already taught",
    "can't": "contraction of cannot; can is already taught",
    "let's": "contraction of let us; let is already taught",
    "returf": "non-word sitting between retell and return on the Shenzhen list",
    "dan": "lowercase name token between damage and dance, not an English headword",
    "mid-autumn": "covered by the official headword Mid-Autumn Festival",
    "sunglass": "clipped singular of sunglasses (sunglasses is kept)",
    "runnel": "one-letter lookalike of tunnel/runner, not an exam headword",
    "buried": "past participle of bury, which is already a headword",
    "mommy": "spelling variant of mum, which is already taught",
}

NUMBERS = {
    "thirty-five", "twenty-one", "twenty-eighth", "twenty-fifth",
    "twenty-first", "twenty-ninth", "twenty-second",
}


def norm(w):
    return re.sub(r"\s+", " ", str(w).strip().lower().replace("’", "'").replace("‘", "'"))


def fold(w):
    n = norm(w)
    return "".join(c for c in unicodedata.normalize("NFD", n) if unicodedata.category(c) != "Mn")


def canon(w):
    n = fold(w)
    return ALIASES.get(n, n)


def expand(entry):
    w = str(entry).replace("*", "").strip()
    if "/" in w:
        return [s.strip() for s in w.split("/") if s.strip()]
    return [w]


def load_lines(path):
    return [ln.strip() for ln in Path(path).read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.strip().startswith("#")]


def forms_of(item):
    out = [item]
    if "(" in item and item.endswith(")"):
        main = item[: item.rindex("(")].strip()
        paren = item[item.rindex("(") + 1 : -1].strip()
        out.extend([main, paren])
    return out


def is_infl(word, present):
    n = norm(word)
    # Native respellings of solid list typos. They are lemmas, not inflections
    # of high, rise, side, or road, and must stay on the student track.
    if n in {"high-rise", "side road"}:
        return ""
    if n == "yourselves":
        return "inflected pronoun; yourself is already present"
    if n == "buried":
        return "past participle of bury" if "bury" in present else ""
    lemmas = getAllLemmas(n) or getAllLemmas(n.replace("-", " ")) or {}
    if not lemmas:
        return ""
    self_lemma = False
    bases = []
    for forms in lemmas.values():
        for lemma in forms:
            if norm(lemma) == n:
                self_lemma = True
            else:
                bases.append(canon(lemma))
    if self_lemma:
        return ""
    for base in bases:
        if base in present:
            return "inflected form of %s, which is already present" % base
    return ""


def display(word):
    folded = fold(word)
    mapped = ALIASES.get(folded)
    if mapped and mapped != folded:
        # Keep the curriculum spelling, including accented café and multi-word keys.
        return mapped
    return word.strip()


def main():
    keb = json.loads((ROOT / "data" / "kebiao-lemmas.json").read_text(encoding="utf-8"))
    junior = set()
    senior = set()
    for entry in keb["juniorEntries"]:
        for part in expand(entry):
            junior.add(canon(part))
    for entry in keb["seniorEntries"]:
        for part in expand(entry):
            senior.add(canon(part))
    for item in load_lines(AUDIT / "kebiao2022_separate_lists.txt"):
        for form in forms_of(item):
            junior.add(canon(form))
    # WHO is an acronym, not the pronoun already stored as "who".
    junior.add("who")
    for word in load_lines(AUDIT / "missing_HScountry_vs_QMgaokao.txt"):
        senior.add(canon(word))
    senior |= set(junior)

    zk_files = [
        "missing_SZlist_vs_QMzhongkao_core.txt",
        "missing_MVzhongkao_vs_QMzhongkao_core.txt",
        "missing_GD2015A_vs_QMzhongkao_core.txt",
    ]
    zk_src = []
    seen = set()
    for name in zk_files:
        for word in load_lines(AUDIT / name):
            key = norm(word)
            if key in seen:
                continue
            seen.add(key)
            zk_src.append(word)

    drops = []

    def take(words, present, label):
        kept = []
        for word in words:
            n = norm(word)
            if word in JUNK or n in JUNK:
                drops.append({"word": word, "list": label, "reason": JUNK.get(word, JUNK.get(n))})
                continue
            if n in NUMBERS:
                drops.append({
                    "word": word,
                    "list": label,
                    "reason": "compositional number whose parts (twenty, one, eight, …) are already taught",
                })
                continue
            if canon(word) in present:
                drops.append({
                    "word": word,
                    "list": label,
                    "reason": "already on this track's official list (spelling alias included)",
                })
                continue
            why = is_infl(word, present)
            if why:
                drops.append({"word": word, "list": label, "reason": why})
                continue
            kept.append(word)
        present2 = set(present) | {canon(w) for w in kept}
        kept2 = []
        for word in kept:
            why = is_infl(word, present2)
            if why:
                drops.append({"word": word, "list": label, "reason": why})
                continue
            kept2.append(word)
        out = []
        seen_c = {}
        for word in kept2:
            c = canon(word)
            if c in seen_c:
                drops.append({
                    "word": word,
                    "list": label,
                    "reason": "spelling variant of %s, which is kept" % seen_c[c],
                })
                continue
            surface = display(word)
            seen_c[c] = surface
            out.append(surface)
        return out

    zhongkao = take(zk_src, junior, "zhongkao")
    gaokao_present = set(senior) | {canon(w) for w in zhongkao}
    gaokao_src = load_lines(AUDIT / "missing_Gaokao3500_vs_QMgaokao_core.txt")
    gaokao = []
    seen_c = set(gaokao_present)
    for word in gaokao_src:
        n = norm(word)
        if word in JUNK or n in JUNK:
            gaokao_drops_reason = JUNK.get(word, JUNK.get(n))
            drops.append({"word": word, "list": "gaokao", "reason": gaokao_drops_reason})
            continue
        if n in NUMBERS:
            drops.append({
                "word": word,
                "list": "gaokao",
                "reason": "compositional number whose parts are already taught",
            })
            continue
        if canon(word) in seen_c:
            if canon(word) in senior:
                drops.append({
                    "word": word,
                    "list": "gaokao",
                    "reason": "already on the 高考 official list (spelling alias included)",
                })
            # else covered by 中考拓展, which 高考 includes; not a second card
            continue
        why = is_infl(word, gaokao_present)
        if why:
            drops.append({"word": word, "list": "gaokao", "reason": why})
            continue
        surface = display(word)
        seen_c.add(canon(word))
        gaokao.append(surface)

    plan = {"zhongkao": zhongkao, "gaokaoExtra": gaokao, "drops": drops}
    json.dump(plan, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
