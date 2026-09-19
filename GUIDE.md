# Medication Identifier — what the app does, screen by screen

**Version 1.4.0 · Android, on Google Play · English and Arabic**

This is a plain-language guide to the whole app: what each screen is for, what
a person can do on it, and why it behaves the way it does. There is no code in
here. It is meant to be readable by anyone — a pharmacist, an investor, a
tester, a translator, someone writing the store listing.

---

## 1. What the app is for

Somebody is holding a box of medicine and does not know what it is, what it is
for, or whether it is safe to take with something else they are already on.
The pack is in small print, often in a language or a register they do not read
comfortably, and the person who could answer — a pharmacist — is not in the
room.

The app answers that question in a few seconds, in plain words, in English or
Arabic, from a photo of the box or from typing the name.

**What it is not.** It gives information, not medical advice. It never
diagnoses, never recommends, and never tells anyone to take or stop taking
anything. Every answer carries that on its face, and the app says so again on
first launch before anything else happens.

### The three promises it makes to a user

| Promise | What it means in practice |
| --- | --- |
| **No account** | There is no sign-up, no login, no email, no password. Open it and use it. |
| **Photos stay on the phone** | The picture is read on the device. The image is never uploaded or stored anywhere. |
| **No tracking** | No analytics, no advertising identifiers, no profile of what anyone looked up. |

Everything a person saves — their medicines, the people they keep lists for,
their reminder times — lives on their own phone. Uninstalling the app takes it
all with it. Nothing syncs, because there is nothing to sync to.

---

## 2. First launch

A new user meets three things, once each, in this order.

**A short intro animation.** It can be skipped. It exists so the first frame of
the app is not a camera permission dialog.

**The notice.** One screen, shown once, that has to be accepted before the app
opens. It says the app explains medicines in plain language, that it provides
*information, not medical advice*, and that it never replaces a pharmacist or
doctor. It says "Shown once. Never again." and means it — it can be brought
back deliberately from Settings, but it is never shown unprompted twice.

**A language choice.** Offered in the top corner of the first screen. English
or Arabic. It can be changed at any time afterwards, from anywhere.

Then a guided tour begins (section 9).

---

## 3. Getting around

Three places, always reachable from a bar at the bottom of the screen:

- **Scan** — the camera, and the way in to everything
- **Medicines** — the medicines this person has saved
- **Search** — typing a name instead of photographing it

A **settings gear** sits in the top corner of each of those three, and of a
medicine's page. The Android back button always undoes the last step; it only
closes the app from the camera screen, which is where Android users expect it
to.

---

## 4. Scan — the camera

The home screen is a live camera pointed at a medicine box.

**What is on it**

- A framed viewfinder with the instruction *"Point at the front of the box. A
  strip or a bottle label works too."*
- A **shutter** button
- A **gallery** button, for a photo already taken
- A **flash** toggle, for a dim pharmacy or a bedside table at night
- **"Type the name instead"**, for when the print is worn off or the box is gone
- A language switch and the settings gear
- A line along the bottom: *"Photos stay on your phone · No account"*

**If the camera is unavailable** — refused, or the device has none — the screen
says so plainly and offers the two ways round it: use a photo you already have,
or type the name.

### What happens after the shutter

The photo is read on the phone. A short screen shows the progress in words, so
the wait does not read as a hang:

> Found the name on the pack → Matching it to a known medicine → Writing it in
> plain language

It also repeats, at the moment it matters most: *"Read on your phone. The photo
is not uploaded or stored."* The whole thing usually takes four or five
seconds, and it can be cancelled.

### Confirming what was read — "Is this your box?"

**The app never goes straight from a photo to a medicine page.** A misread
label would otherwise produce a confident page about the wrong drug, which is
the worst thing a medicines app can do.

So it shows what it read and asks. The screen carries a confidence badge —
**Confident match**, **Likely match**, or **Unsure** — and three ways forward:

- **Yes, show the information**
- **No, that is not it** — back to try again
- A list of close matches, when it has them

---

## 5. Search — typing the name

A single search box, and three kinds of help underneath it.

- **Suggestions as you type.** Drawn from medicines the app has already
  answered for, so common names complete after two or three letters.
- **Your saved medicines** are offered first, marked as saved.
- **Recently looked up** — the last eight, so a repeat check is one tap.

Underneath, for the case the box is badly worn: *"Cannot spell it?"* — pointing
back at the camera.

Misspellings are expected and handled. "panadooll" finds Panadol. So does
"بنادول". So does "Panadol 500mg".

---

## 6. The medicine page — the answer

This is the screen the whole app exists to produce. It is ordered by what
somebody actually acts on, not by what is easiest to list.

**At the top — what am I holding?**

- A **picture of the form**: a tablet, a capsule, a bottle, a dropper, a tube, an
  inhaler, a syringe, a patch, a spray, a sachet, a suppository. If the app
  cannot tell, it shows a neutral mark rather than guessing — a picture of a
  tablet beside a tube of cream is exactly the confusion the picture exists to
  prevent.
- The **active ingredient** above the name — e.g. PARACETAMOL above *Panadol*
- The **brand name**, large
- The **strength and form** — "500 mg tablet"

**What it is for** — one plain sentence, in a tinted card. *"Relieves mild to
moderate pain and reduces fever."* Not the mechanism. What it does for the
person holding it.

**How to take it** (or **How to use it**, for a cream, an inhaler or a patch —
nobody *takes* a cream)

- Three tiles at a glance: **how much**, **when**, and **whether food matters**
- The instructions in full underneath
- **Food and drink** — what to avoid and when

**Warnings**, in two weights so the difference survives being skimmed:

- **Tell your doctor if…** — amber. The symptom that means ring your doctor soon.
- **Never with** — red, and a real list, one item per line. Plus a
  **"Check against my medicines"** link that compares it against everything
  already saved for that person.

**More about this medicine** — three rows, each its own page:

| Row | What is on it |
| --- | --- |
| **Side effects** | Common ones, the urgent ones behind a red border, and a separate "call your doctor if" list |
| **Missed dose** | What to do, and what not to do |
| **Storage** | Where it should live between doses |

**Professional view** — the same medicine for clinicians (section 7).

**At the bottom, always within reach of a thumb:** *Save to my medicines*, and
a share button.

### Side effects, missed dose, storage

Three separate pages, not one page scrolled to three places. Each opens at its
top with its own title, names the medicine in a bar that stays put, and carries
only its own subject.

The side-effects page separates three things that look alike in a single list
but are not:

- **Common — usually mild**
- **Stop and get help today** — behind a red border, with a warning mark
- **Call your doctor if** — not an emergency: a symptom that is not improving,
  a new rash, becoming pregnant

The app removes anything that appears in both of the last two, so the same
warning is never read twice in two registers.

Each page ends with **"Still unsure?"** and a button to send the page to a
pharmacist or take it along.

---

## 7. Professional view — the same medicine, for clinicians

One medicine, two registers, a tap apart. A segmented control at the top
switches between **Plain language** and **Professional**.

Where the patient view leads with what the medicine does for you, this leads
with what it *is*:

- **ATC code**, generic name, salt and usual presentation
- **Class** and **Indications**
- **Mechanism of action**
- **Pharmacokinetics** — half-life set large as the number looked for first,
  then absorption, distribution, metabolism and excretion each under its own
  heading
- **Contraindications**
- **Interactions** — a row of labels to scan, then each one grouped by what is
  actually happening ("Decreased absorption", "Enzyme induction") with what to
  do about it, including any separation interval
- **Adverse effects**, grouped by organ system
- **Monitoring** — what to check and when
- **Chemistry and BCS class**, where they apply
- **Check against** — the standard sources to verify against: the SPC, DailyMed,
  the BNF. Named sources only; the app will not produce a journal citation,
  page number or link, because a plausible-looking fabricated reference is
  worse than none.

It closes with: *"Reference summary for clinicians. Verify against the current
SPC before prescribing."*

Sharing from this screen exports the clinical summary. Sharing from the plain
view exports the plain one. Each exports what it shows.

---

## 8. My medicines — the personal list

A saved medicine works **without internet**. That is the point of saving: a
pharmacy with no signal, a plane, a relative's house.

### People

One list per person. A parent can keep their own medicines, their mother's and
a child's, side by side without mixing them up.

- Starts as **"Me"**
- Up to **10 people**, names up to 24 characters
- Two people cannot share a name — the app says so and suggests a surname or an
  initial rather than silently creating a duplicate
- Removing a person asks first, names them, and says how many of their
  medicines go with them. Your own list is never touched.

### The two warnings on the list

**Two of these are the same medicine.** The most important thing this screen
does. If two saved medicines share an active ingredient — Panadol and Abimol
are both paracetamol — it says so:

> *Panadol + Abimol both contain paracetamol. Taken together that is a double
> dose — ask a pharmacist before you do.*

It catches combination products too: plain Panadol alongside Panadol Extra is
still two paracetamols. And it recognises the same drug under two names, so
"acetaminophen" and "paracetamol" are not treated as different things.

This matters because paracetamol overdose is the commonest accidental one
there is, and it happens exactly this way: two boxes, two names, nobody
realising.

**Some of these may interact.** Separately, when one saved medicine names
another in the things it must never be taken with. Tapping it opens the detail,
along with an honest caveat: this compares warnings already saved with each
medicine, it can miss combinations, and no warning here does not mean a
combination is safe.

### Reminder times

Each saved medicine can carry its own times and a note ("after dinner"). Each
time becomes a **daily alarm on that phone** — a real notification with sound,
not a silent entry in a list.

If notifications are switched off, the app says so on the card rather than
letting the times sit there looking set. If they have been refused outright, it
names the Android Settings path instead of offering a button that would do
nothing.

Reminders are rebuilt whenever the app opens, because alarms do not survive a
phone being switched off.

> **One honest limitation:** these are *inexact* alarms, so a reminder can
> arrive a minute or two late, and longer if the phone is in deep sleep. That
> is a deliberate trade to stay within Google Play's rules on exact-alarm
> permissions.

---

## 9. The guided tour

Shown once per installed version, in two halves, so nobody gets a wall of
instructions before they have seen anything.

**On the camera (5 steps)** — point it at the box, tap to read it, or type the
name instead; saved medicines live here; English or Arabic.

**On the first medicine page (4 steps)** — the dose/timing/food tiles; the
three reference pages; the professional view; saving and reminder times.

A drawn hand points at each control without covering it, the page behind cannot
be scrolled while the tour is up, and **Skip** ends it at any point. Only
*Next* and *Skip* move it along — a stray tap will not skip a step you were
still reading.

It can be replayed from Settings. Replaying from a medicine page replays that
page's four steps in place, rather than sending you back to the camera to find
your medicine again.

---

## 10. Settings

Reachable from every tab and from a medicine page — so changing the language
while reading a medicine does not mean losing the medicine.

| Section | What it offers |
| --- | --- |
| **Appearance** | Automatic (follow the phone), Light, or Dark. It says which one the phone is currently using. |
| **Language** | English or العربية. Medicine information is *written* in the language chosen, not machine-translated afterwards. |
| **Reminders** | How many are set, and a way to allow notifications if they are off. |
| **Help** | Replay the tour. Read the notice again. |
| **About** | Version number, and the privacy statement in full. |

Switching language on a medicine page re-fetches that medicine in the new
language and leaves you on it.

---

## 11. Sharing and exporting

From a medicine page, a reference page, or the professional view.

- **PDF** — for sending or printing
- **Document** — for editing or pasting into notes

Both carry the medicine, everything on the page, and the app's disclaimer.

**Patient details are optional.** The first time someone exports, the app
offers to add a name, age, sex and diagnosis to the report — useful when the
page is going to a pharmacist or into a file. It is offered **once**. Declining
means every later export runs straight away. The details never leave the phone
except inside a report the user themselves shares.

---

## 12. When it is not a medicine

Photograph a banana and the app says *"A banana is a fruit, not a medicine."*
It does not invent side effects for things that do not exist.

Three outcomes:

- **Not a medicine** — it says what it actually is
- **A substance but not a medicine** — alcohol, a household chemical — with an
  urgent safety line where one is warranted, and a refusal to judge whether
  something is safe to swallow: *"that is a question for a pharmacist, not a
  camera."*
- **Not recognised** — offers to scan again, type the name, or *"We got it
  wrong — it is a medicine"*, which asks again more insistently. If that still
  finds nothing, it says so plainly rather than letting anyone tap forever.

---

## 13. Two languages, properly

Arabic is not a translation layer bolted on. The whole interface mirrors — the
layout reads right to left, the back arrow points the other way, the tabs
reverse, the tour's pointing hand comes in from the other side.

Medicine information is written in the chosen language rather than translated
word-for-word after the fact.

**Brand names and active ingredients stay in Latin script on purpose.** A
transliterated brand is harder to match against the box in your hand than the
name actually printed on it.

---

## 14. How it stays fast and cheap

Answers are shared. When one person looks up a medicine, the answer is kept, so
the next person asking for the same medicine gets it instantly and it costs
nothing to produce.

Spellings of the *same* product share one answer — "panadooll", "Panadol
500mg", "بنادول" are all Panadol. **Two different brands never share one**, even
when they contain the same drug, because the page leads with the brand name and
showing somebody the wrong brand is the one thing this app must not do.

Answers are refreshed every six months, so revised dosing and warnings make
their way through.

---

## 15. What this app deliberately does not do

- **No diagnosis.** It will not say what is wrong with anyone.
- **No dosing advice for an individual.** It reports the usual dose; it does not
  tell a person what theirs should be.
- **No judgement on safety.** It will not say whether something is safe to
  swallow, safe in pregnancy, or safe to combine. It reports what the answer
  says and points at a pharmacist.
- **No invented sources.** It names standard references; it will not produce a
  citation, page number or link it cannot stand behind.
- **No account, no tracking, no upload.** Nothing to breach, because nothing is
  collected.

Every answer says, in the app's own words: **AI-generated information. Confirm
with a pharmacist or doctor.**
