# Content schema

Every language lives in `data/<code>/`. All files are UTF-8 JSON (no comments, no trailing commas).

```
data/<code>/course.json      meta + script + pronunciation + numbers
data/<code>/units/01.json    unit 1
...
data/<code>/units/20.json    unit 20 (end of Part 1: foundations)
data/<code>/units/21.json    … to 40.json: Part 2, real life and fluency
```

Run `node scripts/validate.js <code>` after writing. It must print `OK`.

## Romanization conventions (all languages)

The `roman` field is a **learner-friendly phonetic romanization of how the word is actually pronounced
in the standard modern spoken language** (not a letter-by-letter transliteration when the two differ —
e.g. Hindi schwa deletion: कमल → `kamal`, समझना → `samajhnā`; Tamil voicing: நன்றி → `naṉṟi` is wrong
for learners, write `nandri`). Use one consistent scheme:

| Sound | Write |
|---|---|
| long vowels | `ā ī ū`, and `ē ō` only in languages that contrast short/long e/o (Dravidian); elsewhere plain `e o` |
| short vowels | `a i u e o` |
| diphthongs | `ai au` |
| Bengali/Odia inherent ɔ | `ô` |
| retroflex stops/nasal | `ṭ ṭh ḍ ḍh ṇ` |
| flaps | `ṛ ṛh` (Hindi/Urdu/Punjabi ड़ ढ़) |
| retroflex lateral | `ḷ` |
| Tamil/Malayalam ழ | `ḻ` |
| Malayalam/Tamil alveolar ṟ, ṉ | `ṟ ṉ` (only where it matters; Tamil றற → `ṯṯ`/`tr` as pronounced) |
| aspirates | `kh gh chh jh ṭh ḍh th dh ph bh` |
| च / ச etc. | `ch` |
| श | `sh` ; ष `ṣ` |
| velar nasal ङ | `ṅ` ; palatal ञ `ñ` |
| anusvara / nasal vowel | `ṃ` after vowel for vowel nasalization (हाँ → `hāṃ`, मैं → `maiṃ`); anusvara before a stop is written as the homorganic nasal (हिंदी → `hindī`) |
| visarga | `ḥ` |
| Urdu ق خ غ ع ء ژ ز ذ ض ظ | `q x ġ ʿ ’ zh z z z z` (and `kh` is always the aspirated k, never خ) |
| Urdu ے | `e` ; ی as vowel `ī` or `ai` as pronounced |

Capitalise nothing except proper nouns. Separate words with spaces as in the native text.

## course.json

```json
{
  "code": "hi",
  "name": "Hindi",
  "native": "हिन्दी",
  "scriptName": "Devanagari",           // name of the writing system (the "script" key below holds the letters)
  "dir": "ltr",                          // "rtl" for Urdu
  "tts": "hi-IN",                        // BCP-47 for speech synthesis/recognition
  "font": "Noto Sans Devanagari",        // Google Fonts family name for this script
  "speakers": "≈600 million (L1 + L2)",
  "where": "Northern and central India; lingua franca across much of India",
  "tagline": "One sentence on why to learn it.",
  "intro": "2–4 short paragraphs (separate with \\n\\n). What the language is, its script, how it relates to its neighbours, register (formal/informal), what this course teaches. **bold** and *italic* allowed.",
  "romanizationNote": "1 paragraph: how to read this course's romanization for this language, specific pitfalls.",

  "script": {
    "overview": "Paragraphs (\\n\\n) on how the script works: abugida, inherent vowel, vowel signs (matras), virama, conjuncts, direction, headline (shirorekha) etc.",
    "groups": [
      {
        "id": "vowels",
        "title": "Vowels",
        "note": "Short explanation of this group.",
        "letters": [
          {
            "char": "अ",
            "roman": "a",
            "ipa": "ə",
            "sound": "Plain-English description of the sound, e.g. 'the a in about'.",
            "sign": "",                    // vowel sign / matra form if a vowel, e.g. "ा" (use "—" for inherent a); omit for consonants
            "signExample": "",             // e.g. "का (kā)" — optional
            "example": { "native": "अनार", "roman": "anār", "en": "pomegranate" },
            "strokes": "Brief stroke-order hint for writing by hand (optional but encouraged)."
          }
        ]
      }
    ]
  },

  "pronunciation": [
    {
      "id": "retroflex",
      "title": "Retroflex vs dental consonants",
      "body": "Paragraphs (\\n\\n) explaining mouth position, how English speakers get it wrong, how to practise.",
      "tips": ["short actionable tip", "..."],
      "pairs": [
        {
          "a": { "native": "टाल", "roman": "ṭāl", "en": "postpone" },
          "b": { "native": "ताल", "roman": "tāl", "en": "rhythm / pond" },
          "note": "optional: what differs"
        }
      ],
      "drill": [ { "native": "word or short phrase", "roman": "...", "en": "..." } ]
    }
  ],

  "numbers": [ { "n": 0, "native": "शून्य", "roman": "shūnya", "digit": "०" } ]
}
```

### script.groups requirements
Cover the **entire** modern alphabet as actually taught in schools: all vowels (with their vowel-sign forms),
all consonants (grouped by place of articulation the traditional way: velar, palatal, retroflex, dental, labial,
then semivowels/sibilants/others), plus groups for: special marks (anusvara, chandrabindu, visarga, virama/halant,
nukta / equivalents), **at least 12 common conjuncts / ligatures** (each as a "letter" whose `char` is the conjunct,
with `roman` and an example), and the native digits 0–9 (if the script has its own digits). For Urdu, give
each letter's isolated form in `char` and describe joining forms in `sound` or `strokes`; include aspirated
(do-chashmi he) combinations, the short-vowel diacritics (zabar, zer, pesh, jazm, tashdid) and common ligatures.
For Tamil, include the grantha letters and a group on how the uyirmey (consonant+vowel) series works.

### pronunciation requirements
8–14 topics. Must include the topics that genuinely trouble English speakers for this language
(e.g. aspiration, retroflex vs dental, nasal vowels, vowel length, gemination/double consonants,
the inherent vowel/schwa deletion, ழ/ള/ण type sounds, ṛ flaps, tone in Punjabi, Urdu q/x/ġ/ʿ, Bengali ô,
Tamil voicing rules, stress & rhythm, intonation of questions). Each topic: 3–8 minimal `pairs` where
possible (real words!) and a `drill` of 4–10 items.

### numbers requirements
**Every** number 0–100 individually (many of these languages have irregular 1–99), then 200, 500, 1000,
100000 (lakh), 10000000 (crore). `digit` = native digits if the script has them, else western.

## units/NN.json

Every language uses the same curriculum (so learners can compare), adapted naturally:

```json
{
  "id": 1,
  "title": "First words",
  "goal": "One sentence: what you'll be able to do after this unit.",
  "intro": "Short paragraph (\\n\\n allowed).",
  "vocab": [
    { "native": "नमस्ते", "roman": "namaste", "en": "hello (formal/neutral)", "pos": "interj", "note": "optional usage note" }
  ],
  "phrases": [
    { "native": "आप कैसे हैं?", "roman": "āp kaise haiṃ?", "en": "How are you? (polite, to a man)", "note": "optional" }
  ],
  "grammar": [
    {
      "title": "Word order: subject–object–verb",
      "body": "Clear explanation for an English speaker (\\n\\n paragraphs, **bold** allowed). Include tables as simple lines if needed.",
      "examples": [ { "native": "...", "roman": "...", "en": "..." } ]
    }
  ],
  "dialogue": {
    "title": "At the tea stall",
    "setting": "One line of context.",
    "lines": [ { "speaker": "Ravi", "native": "...", "roman": "...", "en": "..." } ]
  },
  "culture": "Optional short paragraph: etiquette, regional variation, register.",
  "lessons": [ "… see below" ]
}
```

### lessons: the guided path through a unit

The course is taught through `lessons`, not the raw lists above. A lesson teaches a handful of the
unit's words and phrases and (usually) **one rule**, and then spends most of its time on **full
sentences** that use them. The app runs each lesson as: tip card (if any) → new words, each followed
straight away by a sentence that uses it → the rest of the sentences (fill the gap, build, listen,
translate). After the lessons come the dialogue and the unit check.

```json
"lessons": [
  {
    "title": "Saying what you need",
    "tip": {
      "title": "मुझे … चाहिए — I need / I'd like",
      "body": "- 2–4 short bullet lines (each starting with '- ', separated by \n), **bold** allowed.\n- The rule in plain English, the forms you need, and the one trap.",
      "pattern": "मुझे + thing + चाहिए",
      "grammar": 0
    },
    "new": ["पानी", "चाय", "चाहिए", "मुझे एक चाय चाहिए।"],
    "sentences": [
      { "native": "मुझे पानी चाहिए।", "roman": "mujhe pānī chāhie.", "en": "I need water.", "focus": "मुझे", "wrong": ["मैं|maiṃ", "मेरा|merā"] }
    ]
  }
]
```

- **4–7 lessons per unit.** Lesson titles say what you'll be able to *do* ("Ordering a drink", "Saying where you're from"), not the grammar term.
- **`tip`** (optional, but every grammar point of the unit must be tipped in some lesson, normally in the lesson where it is first used): a *quick* rule summary shown before the lesson starts — the full explanation stays in `grammar[]`, linked by the `grammar` index. Keep `body` under ~450 characters. `pattern` is an optional one-line formula. A tip can also be a usage note rather than grammar (how to say thank you, when to use the polite form) — then leave out `grammar`. A lesson that only applies earlier rules needs no tip.
- **`new`**: the items this lesson introduces, copied **exactly** from this unit's `vocab[].native` or `phrases[].native`. Every vocab word and every phrase of the unit is in exactly one lesson's `new`. 4–10 per lesson, ordered so a lesson's words can make sentences together.
- **`sentences`**: **6–12 per lesson.** This is the heart of the course, so write them with care:
  - Things a person would really say in that situation, in the standard modern spoken language (statements, questions, negatives, answers, requests). No textbook filler ("The pen is on the table" only if you would actually say it).
  - Use **only** words from this lesson's `new`, earlier lessons, earlier units and basic grammar words already taught (inflected forms of known words are fine). Run `node scripts/validate.js <code> --words` to list words not met before, and fix or justify each one.
  - When the lesson has a tip, at least two thirds of the sentences must use that rule; the rest recycle earlier material.
  - Every word of `new` appears in at least one sentence.
  - `roman` word-for-word with `native` (same number of space-separated words), so learners who don't read the script can build the sentence from romanized tiles.
  - **`focus`** (on rule sentences): the one word, exactly as it appears in `native` without punctuation, that the rule is about — the verb form, the postposition, the ending. It becomes the gap in fill-the-gap.
  - **`wrong`** (with `focus`): 2–3 *plausible but wrong* forms as `"native|roman"` — the forms a learner would confuse it with (है / हैं / हूँ; को / से / में; the masculine for the feminine). Each must be clearly wrong in that sentence.
  - No sentence repeated across the unit's lessons; avoid copying the grammar examples or dialogue lines word for word (they are practised separately).

`pos` values: `noun verb adj adv pron postp prep conj interj num phrase particle q` (q = question word).
For nouns in gendered languages put gender in `note` like `"m"` / `"f"` (or `"m · pl: ..."`).
For verbs give the dictionary/infinitive form (or the form a dictionary would list for that language) and
in `note` give anything irregular.

### Size per unit
- `vocab`: **22–32** items, most frequent and genuinely useful words first; no duplicates across units.
- `phrases`: **8–14** natural, high-frequency sentences.
- `grammar`: **1–3** points, each with **3–6** examples, progressing across units.
- `dialogue`: **6–12** lines, using mostly this and earlier units' vocabulary.

### The 20 units
1. First words — greetings, yes/no, please/thank you, sorry, basic courtesy. Grammar: word order (SOV), register (formal/informal "you").
2. About me — pronouns, "to be", name, where from, languages. Grammar: pronouns + copula; question words intro.
3. Family & people — relatives, people words. Grammar: possessives; gender/plural of nouns (as relevant).
4. Numbers, age & quantities — (refers to the numbers chart) how many, how much, age, ordinals 1st–10th. Grammar: counting nouns / plural with numbers; asking quantity.
5. Food & drink — common foods, meals, tastes, ordering. Grammar: "I want / I like" constructions (incl. dative-subject if the language uses it).
6. Home & everyday objects — rooms, furniture, objects. Grammar: postpositions/case markers of location (in, on, under, near); "there is / there are".
7. Time, days & months — clock time, days, months, parts of day, yesterday/tomorrow. Grammar: telling time; time expressions.
8. Describing things — colours, sizes, common adjectives. Grammar: adjective agreement; comparison (more/most).
9. Body & health — body parts, illnesses, doctor. Grammar: "I have a headache" / experiencer constructions; "should".
10. Daily routine — common verbs, habits. Grammar: present habitual & present continuous.
11. Getting around — directions, transport, places in town. Grammar: imperative (polite/informal); location/direction cases.
12. Shopping & money — prices, bargaining, clothes, sizes. Grammar: demonstratives; "this one/that one"; how much.
13. Weather, nature & seasons. Grammar: impersonal/weather expressions; "it is going to".
14. Feelings & opinions — emotions, likes, agreeing/disagreeing. Grammar: "I think that…", conjunctions because/but/so.
15. Work & study — jobs, school, office. Grammar: "can / must / have to" (ability & obligation).
16. What happened — past events. Grammar: simple past (incl. ergative construction where it exists).
17. Plans & the future. Grammar: future tense; "want to / going to".
18. Politeness, requests & invitations — honorifics, asking favours, offering, refusing. Grammar: polite imperatives, subjunctive/optative, "could you".
19. Travel, problems & emergencies — hotel, train, lost, help, police, hospital. Grammar: conditionals ("if… then").
20. Telling stories & real conversation — connectors, fillers, relative clauses, common idioms, reported speech basics.

### Part 2 — real life and fluency (units 21–40)

Units 1–20 are the foundations. Units 21–40 are for people who want to **talk with friends, get
around town on their own and become fluent**: colloquial, practical, high-frequency, with the
informal register friends really use (and when to switch to polite). No fairy tales, kings or
proverb collections: everything should be something the learner will say or hear this month.
Each unit has the same shape as units 1–20 (vocab 22–32, phrases 10–16, grammar 2–3, a 10–14 line
dialogue between friends or in a real service situation, culture notes on how people actually
talk) plus `lessons`. Grammar here goes deeper than Part 1 and builds on it.

21. Making plans with friends — free tonight?, let's…, where shall we meet, I'm on my way, running late, cancelling. Grammar: let's / shall we; informal commands with friends; "be about to" / "on the way".
22. Calls, texts & voice notes — calling, missed calls, can you hear me?, call you back, messaging, sharing location. Grammar: "do X and then Y" (conjunctive participle); "just" / "already" / "still" / "yet".
23. Around town: autos, cabs & the metro — fares and haggling, "take me to…", "stop here", turn at the signal, how far / how long, ride apps, tickets. Grammar: compound verbs (stop!, get down, drop me); "it takes (time)".
24. Eating out with friends — street food, cafés, ordering for a group, too spicy / not enough, splitting the bill, "my treat". Grammar: too / enough / a little; "I feel like (eating)…".
25. Errands — bank & ATM, pharmacy, SIM card & phone repair, tailor, barber/salon, laundry, courier. Grammar: causatives — getting something done (get it fixed, get a haircut).
26. At someone's home — visiting, being a good guest and host, offers and polite refusals, house rules, chores, staying over. Grammar: "used to"; offering and declining politely; "should I…?".
27. People — what someone is like (personality, looks), friends and partners, family dynamics, a bit of gossip. Grammar: relative clauses in full; "seems / looks like".
28. Catching up — what you did at the weekend, what's new, "have you ever…?", news since you last met. Grammar: past vs present perfect; past continuous; "for / since / ago".
29. Opinions & discussions — agreeing and disagreeing politely, "it depends", "to be honest", arguing a point, current topics, cricket/football. Grammar: "maybe / might" (probability); "I don't think…"; "should have…".
30. Feelings & support — cheering someone up, worries, comforting, saying sorry properly, congratulations, condolences. Grammar: "while / as soon as / until" clauses; feelings that "happen to" you.
31. Work & colleagues — small talk at work, meetings, deadlines, asking for leave, messages to your boss, interviews. Grammar: formal register in full; passive / impersonal ("it was decided").
32. Health in depth — describing symptoms precisely, since when, allergies, following instructions ("twice a day after food"), pharmacy, appointments. Grammar: "have been …-ing for" (duration); instructions.
33. Weddings, festivals & occasions — invitations, wishes and blessings, gifts, what to say and do at weddings, the big festivals of this language's region, birthdays. Grammar: wishes and blessings (optative); "be sure to…".
34. Phones, apps & payments — online orders and delivery, the local payment apps, the internet is down, social media, tech words borrowed from English and the verbs that go with them. Grammar: real conditionals in practice; English loanword + "do/become" verbs.
35. Home & neighbourhood — renting, the landlord, something's broken, bills, neighbours, noise, moving. Grammar: requests and complaints; causatives revisited ("I need to get… fixed").
36. If only — hypotheticals, wishes, regrets, dreams and plans for life. Grammar: unreal conditionals ("if I had…, I would…", "if I had known…"); "I wish…".
37. Sorting out problems — wrong order, refunds, customer service, a lost phone, the police, negotiating calmly. Grammar: reported speech in full ("he told me to…", "they said that…").
38. Films, music, sport & free time — recommending, reviewing, talking about matches and players, favourite songs, hobbies. Grammar: comparisons in depth, superlatives, "the more… the more…".
39. Sounding natural — fillers, reactions ("really?", "no way!", "seriously?"), softeners, tag questions, emphasis particles, echo words, asking someone to repeat or slow down, explaining a word you don't know, mixing in English the way people do. Grammar: tag questions; emphatic particles; echo words.
40. Real conversations — long, natural chats that combine everything: catching up with an old friend, a family dinner, an argument about where to go, planning a trip together. Grammar: linking long sentences; switching register mid-conversation.

Unit 20 ("Telling stories & real conversation") keeps its grammar (relative clauses, reported speech,
storytelling words) but its vocabulary, phrases and dialogue are about **real conversation** —
telling a friend what happened, reacting, keeping a chat going — not fairy tales or proverbs.

## Quality bar
- Use the **standard modern spoken** language that a learner will actually hear; note common colloquial
  alternatives in `note`. Avoid archaic/Sanskritised forms unless that *is* the everyday word.
- Every `native` string must be correctly spelled in the native script; every `roman` must match it.
- English glosses short and precise. Mark register (formal/informal) where it matters.
- No duplicated vocab across units within a language.
