
// ───────────────────────── Data ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const POS = { adj: "adjective", verb: "verb", noun: "noun" };

const WORDS = RAW.map((r, i) => ({ w: r[0], pos: r[1], def: r[2], syn: r[3].split(", "), ant: r[4].split(", "), ex: r[5], q: r[6], set: Math.floor(i / 5) + 1, i }));
const NSETS = Math.ceil(WORDS.length / 5);
const BY = Object.fromEntries(WORDS.map(w => [w.w, w]));
const setWords = n => WORDS.filter(w => w.set === n);
const nearMap = {};
NEAR.forEach(g => { const ws = g.split(" "); ws.forEach(a => { nearMap[a] = nearMap[a] || new Set(); ws.forEach(b => b !== a && nearMap[a].add(b)); }); });
const tooClose = (a, b) => a === b || nearMap[a.w]?.has(b.w) || a.syn.includes(b.w) || b.syn.includes(a.w);

function wordRe(w) { const stem = w.length > 5 ? w.slice(0, -2) : w; return new RegExp("\\b" + stem + "[a-z]*", "gi"); }
const markEx = o => esc(o.ex).replace(wordRe(o.w), m => `<mark class="mark">${m}</mark>`);
const blankEx = o => esc(o.ex).replace(wordRe(o.w), '<span class="blank"></span>');
const blankQ = s => esc(s).replace(/_{3,}/, '<span class="blank"></span>');

// ───────────────────────── Dates & progress ─────────────────────────
const pad = n => String(n).padStart(2, "0");
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return dstr(new Date(y, m - 1, d + n)); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
const INTERVALS = [1, 3, 7, 14, 30, 60];

const KEY = "fiveaday.v1";
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.sets) return Object.assign({ days: [], miss: {}, best: 0, pick: null }, s); } catch (e) {}
  return { sets: {}, days: [], miss: {}, best: 0, pick: null };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

const learned = n => !!S.sets[n];
const learnedSets = () => Object.keys(S.sets).map(Number).sort((a, b) => a - b);
const dueSets = () => learnedSets().filter(n => S.sets[n].due <= today()).sort((a, b) => S.sets[a].due.localeCompare(S.sets[b].due));
const nextNew = () => { for (let n = 1; n <= NSETS; n++) if (!learned(n)) return n; return null; };
const learnedToday = () => learnedSets().filter(n => S.sets[n].learnedAt === today());
const focusSet = () => learnedToday().slice(-1)[0] || nextNew() || learnedSets().slice(-1)[0] || 1;
const tricky = () => Object.entries(S.miss).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w).filter(w => BY[w]);

function markDay() { const t = today(); if (!S.days.includes(t)) { S.days.push(t); S.days = S.days.slice(-500); } save(); renderStreak(); }
function streak() { const set = new Set(S.days); let d = today(), n = 0; if (!set.has(d)) d = addDays(d, -1); while (set.has(d)) { n++; d = addDays(d, -1); } return n; }
function renderStreak() { $("#streakN").textContent = streak(); }
function addMiss(w) { S.miss[w] = (S.miss[w] || 0) + 1; }

let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

// ───────────────────────── Router ─────────────────────────
let view = "today";
function go(v) {
  if (v !== "runner") stopGame();
  view = v;
  document.querySelectorAll(".view").forEach(s => (s.hidden = s.id !== "v-" + v));
  document.querySelectorAll(".nav button").forEach(b => b.dataset.go === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  if (v === "today") renderToday();
  if (v === "sets") renderSets();
  if (v === "tutor") initTutor();
  if (v === "runner") renderRunnerSetup();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

// ───────────────────────── Today ─────────────────────────
function renderToday() {
  const due = dueSets(), nn = nextNew(), lt = learnedToday(), nl = learnedSets().length;
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const head = !nn && !due.length ? "You've learned all 200 words." : due.length ? "Refresh first, then five new words." : lt.length ? "Today's five are done." : "Five new words are waiting.";
  const trick = tricky();
  let h = `<div class="today-head"><div><div class="eyebrow">${esc(date)}</div><h1>${head}</h1></div>
    <div class="stats"><div class="stat"><b>${nl * 5}<span style="font-size:15px;color:var(--ink-2)"> / ${WORDS.length}</span></b><span>Words learned</span></div>
    <div class="stat"><b>${due.length}</b><span>Sets to refresh</span></div><div class="stat"><b>${streak()}</b><span>Day streak</span></div></div></div>
    <div class="today-grid"><div class="stack">`;
  if (due.length) {
    h += `<div class="panel refresh"><div class="eyebrow">Refresh your skills</div><h2>${due.length === 1 ? "One set is" : due.length + " sets are"} due for review</h2>
      <p class="muted" style="margin:0">Reviewing on schedule is what moves words into long-term memory. Each review pushes the next one further out: 1, 3, 7, 14, 30, then 60 days.</p>
      <div class="due-list">${due.map(n => { const s = S.sets[n]; const late = daysBetween(s.due, today()); return `<div class="due-item"><b>Set ${n}</b><span class="words">${setWords(n).map(w => w.w).join(" · ")}</span>${late > 0 ? `<span class="pill due">${late}d late</span>` : `<span class="pill due">Due</span>`}<button class="btn sm primary" data-review="${n}">Review</button></div>`; }).join("")}</div>
      ${due.length > 1 ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-review-all>Review all ${due.length} together</button></div>` : ""}</div>`;
  }
  if (nn && !lt.length) {
    h += `<div class="panel todayset"><div class="eyebrow">Today's set</div><h2>Set ${nn}</h2>
      <div class="word-preview">${setWords(nn).map(w => `<div class="wp">${esc(w.w)}</div>`).join("")}</div>
      <div class="row"><button class="btn primary" data-learn="${nn}">Start learning Set ${nn} →</button><span class="muted" style="font-size:14px">About 10 minutes: flashcards, recall, then a hard quiz.</span></div></div>`;
  } else if (lt.length) {
    h += `<div class="panel todayset"><div class="eyebrow">Today's set</div><h2>Set ${lt.join(" & ")} learned today</h2>
      <p class="muted" style="margin:0 0 14px">Nice work. Your first review comes up tomorrow. Play a round of Word Runner to lock the words in.</p>
      <div class="row"><button class="btn primary" data-run-today>Play with today's words</button>${nn ? `<button class="btn" data-learn="${nn}">Learn Set ${nn} anyway</button>` : ""}</div></div>`;
  } else if (!nn) {
    h += `<div class="panel todayset"><div class="eyebrow">All sets learned</div><h2>Keep them sharp</h2><p class="muted" style="margin:0">Your reviews keep coming on schedule. Use a mixed refresh or the runner between them.</p></div>`;
  }
  h += `</div><div class="stack"><div class="quick">
      <button data-mixed ${nl ? "" : "disabled"}><span class="ico">↻</span><div><b>Mixed refresh</b><span>${nl ? "10 random words from sets you've learned" : "Unlocks after your first set"}</span></div></button>
      <button data-go-runner><span class="ico">▲</span><div><b>Word Runner</b><span>Type words from memory to open the gates</span></div></button>
      <button data-tutor-quiz><span class="ico">✎</span><div><b>Quiz me on Set ${focusSet()}</b><span>The AI tutor asks one question at a time</span></div></button>
    </div>
    <div class="panel"><div class="eyebrow">Progress</div><div style="margin:10px 0 6px" class="bar"><i style="width:${(nl / NSETS) * 100}%"></i></div>
      <div class="muted" style="font-size:14px">${nl} of ${NSETS} sets learned${nl ? ` · ${learnedSets().filter(n => S.sets[n].level >= 3).length} sets at 14-day level or higher` : ""}</div></div>
    <div class="panel"><div class="eyebrow">Your tricky words</div>
      ${trick.length ? `<div class="tricky">${trick.map(w => `<button class="chip" data-open="${BY[w].set}" style="border:0">${esc(w)}</button>`).join("")}</div>` : `<p class="muted" style="margin:8px 0 0;font-size:14px">Words you miss in recall, quizzes, and the runner collect here.</p>`}</div>
  </div></div>`;
  const v = $("#v-today"); v.innerHTML = h;
  v.querySelectorAll("[data-review]").forEach(b => (b.onclick = () => startSession("review", [+b.dataset.review])));
  v.querySelector("[data-review-all]")?.addEventListener("click", () => startSession("review", due));
  v.querySelectorAll("[data-learn]").forEach(b => (b.onclick = () => startSession("learn", [+b.dataset.learn])));
  v.querySelector("[data-mixed]").onclick = () => startMixed();
  v.querySelector("[data-go-runner]").onclick = () => go("runner");
  v.querySelector("[data-run-today]")?.addEventListener("click", () => { S.pick = learnedToday(); save(); go("runner"); });
  v.querySelector("[data-tutor-quiz]").onclick = () => { go("tutor"); askTutor(`Quiz me on Set ${focusSet()}`); };
  v.querySelectorAll("[data-open]").forEach(b => (b.onclick = () => { openSet = +b.dataset.open; go("sets"); }));
}
function startMixed() {
  const pool = learnedSets().flatMap(setWords);
  if (!pool.length) return;
  const trick = new Set(tricky());
  const picked = shuffle(pool).sort((a, b) => trick.has(b.w) - trick.has(a.w)).slice(0, 10);
  startSession("mixed", [], shuffle(picked));
}

// ───────────────────────── Sets ─────────────────────────
let openSet = null, query = "";
function renderSets() {
  const v = $("#v-sets");
  v.innerHTML = `<div class="sets-top"><div><div class="eyebrow">${NSETS} sets · ${WORDS.length} words</div><h1>All sets</h1></div>
    <input class="search" id="setSearch" type="search" placeholder="Search words or meanings" value="${esc(query)}" aria-label="Search words"></div><div id="setBody"></div>`;
  $("#setSearch").addEventListener("input", e => { query = e.target.value; renderSetBody(); });
  renderSetBody();
}
function setStatus(n) {
  const s = S.sets[n];
  if (!s) return n === nextNew() ? `<span class="pill today">Up next</span>` : `<span class="pill new">New</span>`;
  if (s.due <= today()) return `<span class="pill due">Due</span>`;
  const d = daysBetween(today(), s.due);
  return `<span class="pill ok">Review in ${d}d</span>`;
}
function renderSetBody() {
  const b = $("#setBody"), q = query.trim().toLowerCase();
  if (q) {
    const hits = WORDS.filter(w => w.w.includes(q) || w.def.toLowerCase().includes(q) || w.syn.some(s => s.includes(q)));
    b.innerHTML = hits.length ? `<div class="panel table-scroll"><table class="word-table"><tbody>${hits.map(w => `<tr><td>${esc(w.w)}<div class="pos" style="font-size:13px;font-weight:400">${POS[w.pos]}</div></td><td><div class="def">${esc(w.def)}</div><div class="muted" style="font-size:14px">${esc(w.syn.join(", "))}</div></td><td><button class="btn sm" data-open="${w.set}">Set ${w.set}</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No words match "${esc(query)}".</p>`;
    b.querySelectorAll("[data-open]").forEach(x => (x.onclick = () => { query = ""; openSet = +x.dataset.open; renderSets(); $("#setDetail")?.scrollIntoView({ block: "start" }); }));
    return;
  }
  let h = `<div class="set-grid">`;
  for (let n = 1; n <= NSETS; n++) h += `<button class="set-tile" data-set="${n}" aria-pressed="${openSet === n}"><div class="n"><b>Set ${n}</b>${setStatus(n)}</div><div class="w">${setWords(n).map(w => w.w).join(", ")}</div></button>`;
  h += `</div>`;
  if (openSet) {
    const n = openSet, ws = setWords(n), s = S.sets[n];
    h += `<div class="panel set-detail" id="setDetail"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">${s ? `Learned ${esc(s.learnedAt)} · level ${s.level + 1} of 6` : "Not learned yet"}</div><h2>Set ${n}</h2></div>${setStatus(n)}</div>
      <div class="table-scroll"><table class="word-table"><tbody>${ws.map(w => `<tr><td>${esc(w.w)}<div class="pos" style="font-size:13px;font-weight:400">${POS[w.pos]}</div></td><td><div class="def">${esc(w.def)}</div><div class="ex muted" style="font-size:15px;margin-top:4px">${markEx(w)}</div></td></tr>`).join("")}</tbody></table></div>
      <div class="row">${s ? `<button class="btn primary" data-act="review">Review this set</button><button class="btn" data-act="learn">Relearn with flashcards</button>` : `<button class="btn primary" data-act="learn">Learn this set</button>`}
      <button class="btn" data-act="quiz">Take the set quiz</button><button class="btn" data-act="run">Play in Runner</button><button class="btn" data-act="tutor">Ask the tutor</button></div></div>`;
  }
  b.innerHTML = h;
  b.querySelectorAll("[data-set]").forEach(x => (x.onclick = () => { openSet = openSet === +x.dataset.set ? null : +x.dataset.set; renderSetBody(); if (openSet) $("#setDetail").scrollIntoView({ behavior: "smooth", block: "nearest" }); }));
  b.querySelectorAll("[data-act]").forEach(x => (x.onclick = () => {
    const a = x.dataset.act;
    if (a === "learn") startSession("learn", [openSet]);
    if (a === "review") startSession("review", [openSet]);
    if (a === "quiz") startSession("quiz", [openSet]);
    if (a === "run") { S.pick = [openSet]; save(); go("runner"); }
    if (a === "tutor") { const n = openSet; go("tutor"); askTutor(`Quiz me on Set ${n}`); }
  }));
}

// ───────────────────────── Study sessions ─────────────────────────
let SES = null;
const PHASE_LABEL = { cards: "Flashcards", recall: "Recall", quiz: "Quiz" };
function startSession(kind, sets, override) {
  const words = override || sets.flatMap(setWords);
  const phases = kind === "learn" ? ["cards", "recall", "quiz"] : kind === "quiz" ? ["quiz"] : ["recall", "quiz"];
  SES = { kind, sets, words, phases, pi: 0, firstTry: new Set(), missed: new Set(), right: 0, total: 0 };
  view = "session";
  document.querySelectorAll(".view").forEach(s => (s.hidden = s.id !== "v-session"));
  document.querySelectorAll(".nav button").forEach(b => b.removeAttribute("aria-current"));
  window.scrollTo(0, 0);
  startPhase();
}
function sessionTitle() {
  if (SES.kind === "mixed") return "Mixed refresh";
  const label = { learn: "Learn", review: "Review", quiz: "Quiz" }[SES.kind];
  return `${label} · Set ${SES.sets.join(", ")}`;
}
function sessionTop() {
  return `<div class="session-top"><button class="btn sm ghost" id="exitSes">✕ Exit</button><h1>${esc(sessionTitle())}</h1>
    <div class="steps">${SES.phases.map((p, i) => `<span class="${i < SES.pi ? "done" : i === SES.pi ? "on" : ""}">${PHASE_LABEL[p]}</span>`).join("")}</div></div>`;
}
function mountSession(inner) {
  const v = $("#v-session");
  v.innerHTML = sessionTop() + `<div class="stage">${inner}</div>`;
  $("#exitSes").onclick = () => { SES = null; go("today"); };
}
function startPhase() {
  const p = SES.phases[SES.pi];
  if (p === "cards") { SES.ci = 0; SES.typed = SES.words.map(() => false); renderCard(); }
  if (p === "recall") { SES.queue = shuffle(SES.words); SES.missedNow = new Set(); SES.copy = false; renderRecall(); }
  if (p === "quiz") { SES.qs = buildQuiz(SES.words); SES.qi = 0; SES.answered = false; renderQuiz(); }
}
function nextPhase() { SES.pi++; if (SES.pi >= SES.phases.length) finishSession(); else startPhase(); }
const norm = s => s.trim().toLowerCase().replace(/\s+/g, " ");

// Phase 1: flashcards with retyping
function renderCard() {
  const i = SES.ci, w = SES.words[i], n = SES.words.length;
  mountSession(`<div class="progress-line"><span>Card ${i + 1} of ${n}</span><span>Type the word, then study the back</span></div>
    <div class="card-scene"><div class="card" id="card" role="button" tabindex="0" aria-label="Flashcard for ${esc(w.w)}. Press to flip.">
      <div class="face front"><div class="corner">Set ${w.set} · ${i + 1} of ${n}</div><div><div class="big">${esc(w.w)}</div><div class="pos" style="margin-top:8px;font-size:18px">${POS[w.pos]}</div></div><div class="hint">Click the card to flip it</div></div>
      <div class="face back"><div class="corner">${esc(w.w)} · ${POS[w.pos]}</div>
        <div><div class="lbl">Meaning</div><div class="def">${esc(w.def)}</div></div>
        <div><div class="lbl">Synonyms</div><div class="chips">${w.syn.map(s => `<span class="chip syn">${esc(s)}</span>`).join("")}</div></div>
        <div><div class="lbl">Antonyms</div><div class="chips">${w.ant.map(s => `<span class="chip ant">${esc(s)}</span>`).join("")}</div></div>
        <div><div class="lbl">In a sentence</div><div class="ex" style="font-size:17px">${markEx(w)}</div></div>
      </div></div></div>
    <div class="typer"><label for="typeIn">Type <b>${esc(w.w)}</b> to lock it in</label><input class="text${SES.typed[i] ? " good" : ""}" id="typeIn" autocomplete="off" autocapitalize="off" spellcheck="false" value="${SES.typed[i] ? esc(w.w) : ""}"><div class="feedback" id="fb"></div></div>
    <div class="row" style="justify-content:space-between"><button class="btn" id="prevC" ${i ? "" : "disabled"}>← Back</button><button class="btn primary" id="nextC" ${SES.typed[i] ? "" : "disabled"}>${i === n - 1 ? "Start recall →" : "Next card →"}</button></div>`);
  const card = $("#card"), inp = $("#typeIn"), nx = $("#nextC");
  const flip = () => card.classList.toggle("flipped");
  card.onclick = flip;
  card.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
  inp.focus();
  inp.oninput = () => {
    if (norm(inp.value) === w.w) {
      inp.classList.add("good"); SES.typed[i] = true; nx.disabled = false;
      $("#fb").className = "feedback good"; $("#fb").textContent = "Got it. Read the back, then press Enter.";
      if (!card.classList.contains("flipped")) card.classList.add("flipped");
    } else inp.classList.remove("good");
  };
  inp.onkeydown = e => { if (e.key === "Enter" && SES.typed[i]) nx.click(); };
  $("#prevC").onclick = () => { SES.ci--; renderCard(); };
  nx.onclick = () => { if (SES.ci < n - 1) { SES.ci++; renderCard(); } else nextPhase(); };
}

// Phase 2: recall by typing from the definition
function hintFor(w, level) { return w.w.split("").map((c, k) => (k < level ? c : "_")).join(" "); }
function renderRecall() {
  const w = SES.queue[0], left = SES.queue.length, n = SES.words.length;
  SES.hint = 0;
  mountSession(`<div class="progress-line"><span>${n - new Set(SES.queue.map(x => x.w)).size} of ${n} recalled</span><span>${left} to go</span></div>
    <div class="prompt-card"><div class="eyebrow">Which word means…</div><div class="def">${esc(w.def)}</div>
      <div class="ex muted" style="font-size:17px">${blankEx(w)}</div>
      <div class="muted" style="font-size:14px"><span class="pos">${POS[w.pos]}</span> · <span id="hintTxt">${w.w.length} letters</span></div></div>
    <div class="typer"><label for="recIn">Type the word</label><input class="text" id="recIn" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="feedback" id="fb"></div></div>
    <div class="row" style="justify-content:space-between"><button class="btn ghost" id="hintBtn">Show a letter</button><button class="btn primary" id="checkBtn">Check</button></div>`);
  const inp = $("#recIn"), fb = $("#fb");
  inp.focus();
  $("#hintBtn").onclick = () => { SES.hint = Math.min(w.w.length - 1, SES.hint + 1); $("#hintTxt").textContent = hintFor(w, SES.hint); SES.missedNow.add(w.w); inp.focus(); };
  const check = () => {
    const v = norm(inp.value);
    if (!v) return;
    if (v === w.w) {
      inp.className = "text good"; inp.disabled = true;
      if (!SES.missedNow.has(w.w)) SES.firstTry.add(w.w);
      fb.className = "feedback good"; fb.textContent = SES.copy ? "Now you've typed it. It'll come back once more." : "Correct.";
      SES.queue.shift(); SES.copy = false;
      setTimeout(() => (SES.queue.length ? renderRecall() : nextPhase()), SES.missedNow.has(w.w) ? 900 : 550);
    } else if (!SES.copy) {
      SES.copy = true; SES.missedNow.add(w.w); SES.missed.add(w.w); addMiss(w.w); save();
      SES.queue.push(w);
      inp.className = "text bad"; inp.select();
      fb.className = "feedback bad"; fb.innerHTML = `Not quite. It's <mark class="mark">${esc(w.w)}</mark>. Type it to continue.`;
    } else { inp.className = "text bad"; inp.select(); }
  };
  $("#checkBtn").onclick = check;
  inp.onkeydown = e => { if (e.key === "Enter") check(); };
}

// Phase 3: hard sentence-completion quiz
function pickDistractors(t, preferred, count) {
  const ok = x => x !== t && x.pos === t.pos && !tooClose(t, x);
  const out = [];
  const add = list => { for (const x of list) { if (out.length >= count) return; if (ok(x) && !out.includes(x)) out.push(x); } };
  add(shuffle(preferred).slice(0, 2));
  add(shuffle(WORDS.filter(x => Math.abs(x.set - t.set) <= 6)));
  add(shuffle(WORDS));
  return out;
}
function buildQuiz(words) { return shuffle(words).map(t => ({ t, choices: shuffle([t, ...pickDistractors(t, words, 3)]) })); }
function renderQuiz() {
  const { t, choices } = SES.qs[SES.qi], n = SES.qs.length;
  SES.answered = false;
  mountSession(`<div class="progress-line"><span>Question ${SES.qi + 1} of ${n}</span><span>${SES.right} correct so far</span></div>
    <div class="prompt-card"><div class="eyebrow">Choose the word that best completes the sentence</div><div class="quiz-q">${blankQ(t.q)}</div></div>
    <div class="choices">${choices.map((c, k) => `<button class="choice" data-k="${k}"><kbd>${k + 1}</kbd>${esc(c.w)}</button>`).join("")}</div>
    <div id="explain"></div>`);
  document.querySelectorAll(".choice").forEach(b => (b.onclick = () => answerQuiz(+b.dataset.k)));
}
function answerQuiz(k) {
  if (SES.answered) return;
  SES.answered = true;
  const { t, choices } = SES.qs[SES.qi], pick = choices[k], right = pick === t;
  SES.total++; if (right) SES.right++; else { SES.missed.add(t.w); addMiss(t.w); save(); }
  document.querySelectorAll(".choice").forEach((b, j) => { b.disabled = true; if (choices[j] === t) b.classList.add("right"); else if (j === k) b.classList.add("wrong"); });
  $("#explain").innerHTML = `<div class="explain"><b>${right ? "Correct." : "Not this time."}</b> <mark class="mark">${esc(t.w)}</mark> means ${esc(t.def)}.${right ? "" : ` <b>${esc(pick.w)}</b> means ${esc(pick.def)}.`}</div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="qNext">${SES.qi === SES.qs.length - 1 ? "See results →" : "Next question →"}</button></div>`;
  $("#qNext").focus();
  $("#qNext").onclick = () => { SES.qi++; if (SES.qi < SES.qs.length) renderQuiz(); else nextPhase(); };
}
document.addEventListener("keydown", e => {
  if (view !== "session" || !SES || SES.phases[SES.pi] !== "quiz" || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const k = Number(e.key);
  if (!SES.answered && k >= 1 && k <= 4) answerQuiz(k - 1);
});

function finishSession() {
  const n = SES.words.length, hasRecall = SES.phases.includes("recall");
  const recallScore = hasRecall ? SES.firstTry.size / n : null;
  const quizScore = SES.total ? SES.right / SES.total : null;
  const parts = [recallScore, quizScore].filter(x => x !== null);
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;
  let note = "";
  if (SES.kind === "learn") {
    SES.sets.forEach(s => {
      const prev = S.sets[s];
      S.sets[s] = { learnedAt: prev?.learnedAt || today(), level: 0, due: addDays(today(), 1), last: score };
    });
    note = "Your first review of this set is due tomorrow.";
  } else if (SES.kind === "review") {
    SES.sets.forEach(s => {
      const r = S.sets[s]; if (!r) return;
      r.level = score >= 0.8 ? Math.min(r.level + 1, INTERVALS.length - 1) : 0;
      r.due = addDays(today(), INTERVALS[r.level]); r.last = score;
    });
    const lv = S.sets[SES.sets[0]]?.level ?? 0;
    note = score >= 0.8 ? `Strong review. Next one in ${INTERVALS[lv]} day${INTERVALS[lv] > 1 ? "s" : ""}.` : "Below 80%, so this set comes back tomorrow. That's how it sticks.";
  }
  markDay();
  const missed = [...SES.missed].map(w => BY[w]);
  const pct = Math.round(score * 100);
  const msg = pct >= 90 ? "Excellent." : pct >= 75 ? "Solid work." : pct >= 50 ? "Getting there." : "Tough round. Worth another pass.";
  const setsForRun = SES.kind === "mixed" ? [...new Set(SES.words.map(w => w.set))] : SES.sets;
  mountSession(`<div class="panel result"><div class="eyebrow">Session complete</div><div class="score">${pct}%</div><h2 style="font-size:24px">${msg}</h2>
    <div class="muted">${hasRecall ? `Recall on first try: ${SES.firstTry.size}/${n}` : ""}${hasRecall && SES.total ? " · " : ""}${SES.total ? `Quiz: ${SES.right}/${SES.total}` : ""}</div>
    ${note ? `<p style="margin:0">${note}</p>` : ""}
    ${missed.length ? `<div class="review-list"><div class="eyebrow" style="background:none;border:0;padding:0">Words to watch</div>${missed.map(w => `<div><b>${esc(w.w)}</b>: ${esc(w.def)}</div>`).join("")}</div>` : ""}
    <div class="row" style="justify-content:center"><button class="btn primary" id="rDone">Back to Today</button><button class="btn" id="rRun">Play these in Runner</button>${missed.length ? `<button class="btn" id="rTutor">Ask the tutor about these</button>` : ""}<button class="btn ghost" id="rQuiz">Retake quiz</button></div></div>`);
  $("#rDone").onclick = () => { SES = null; go("today"); };
  $("#rRun").onclick = () => { S.pick = setsForRun; save(); go("runner"); };
  $("#rQuiz").onclick = () => startSession("quiz", SES.sets, SES.kind === "mixed" ? SES.words : null);
  $("#rTutor")?.addEventListener("click", () => { const ws = missed.map(w => w.w).join(", "); go("tutor"); askTutor(`I keep missing these words: ${ws}. Help me practice them.`); });
}

// ───────────────────────── AI tutor ─────────────────────────
let sample = null, sampleReady = false, tutorInit = false, turns = [], tutorCtl = null, tutorBusy = false;
(async () => {
  try { sample = window.claude?.use ? await window.claude.use("sample") : null; } catch (e) { sample = null; }
  sampleReady = true;
  if (tutorInit) renderTutorAvailability();
})();
function wordListText() {
  let t = "";
  for (let n = 1; n <= NSETS; n++) t += `Set ${n}: ` + setWords(n).map(w => `${w.w} (${w.pos}) = ${w.def}`).join("; ") + "\n";
  return t;
}
function rules() {
  const ls = learnedSets(), trick = tricky();
  return `You are the AI tutor inside "Five a Day", an SAT vocabulary app for high school students. Students learn 5 words a day in numbered sets.

FULL WORD LIST
${wordListText()}
STUDENT PROGRESS
Learned sets: ${ls.length ? ls.join(", ") : "none yet"}. Current set: ${focusSet()}. Words the student often misses: ${trick.length ? trick.join(", ") : "none recorded"}.

HOW TO TUTOR
- When asked to quiz on a set ("quiz me on set 5"), use only that set's words. Ask ONE question at a time and wait for the answer. Vary the format: hard SAT-style sentence completions with strong but indirect context clues and four choices labeled A-D; "use this word in a sentence"; synonym or antonym; and "which word fits better" between near-synonyms. After each answer, say whether it's right, explain in one or two sentences, then ask the next question. After five questions, give a score out of 5.
- When the student writes a sentence using a word, judge whether the word is used correctly and naturally, point out any problem, and offer a stronger version.
- Keep replies under 120 words, warm and direct. Put vocabulary words in **bold**. No headings. Never reveal an answer before the student tries.
- If the student asks about a word not on the list, help anyway.`;
}
function md(s) {
  let h = esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>");
  const lines = h.split("\n"); let out = "", inList = false;
  for (const l of lines) {
    const m = l.match(/^\s*[-•]\s+(.*)/);
    if (m) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${m[1]}</li>`; }
    else { if (inList) { out += "</ul>"; inList = false; } out += l + "<br>"; }
  }
  if (inList) out += "</ul>";
  return out.replace(/(<br>)+$/, "");
}
function bubble(cls, html) { const d = document.createElement("div"); d.className = "msg " + cls; d.innerHTML = html; $("#thread").appendChild(d); $("#thread").scrollTop = 1e9; return d; }
function initTutor() {
  const cur = focusSet(), trick = tricky(), ls = learnedSets();
  let pair = ["mitigate", "alleviate"];
  for (const g of NEAR) { const ws = g.split(" ").filter(w => BY[w] && learned(BY[w].set)); if (ws.length >= 2) { pair = ws.slice(0, 2); break; } }
  const prompts = [
    [`Quiz me on Set ${cur}`, true],
    [ls.length > 1 ? "Quiz me on everything I've learned so far" : `Give me one really hard fill-in-the-blank from Set ${cur}`, true],
    [`What's the difference between ${pair[0]} and ${pair[1]}?`, true],
    [trick.length ? `Help me practice my tricky words: ${trick.slice(0, 5).join(", ")}` : `Use each word from Set ${cur} in a sentence about sports`, true],
    [`Check my sentence: `, false],
  ];
  $("#tutorPrompts").innerHTML = prompts.map(([p, send], k) => `<button data-k="${k}">${esc(send ? p : "Check a sentence I wrote…")}</button>`).join("");
  $("#tutorPrompts").querySelectorAll("button").forEach(b => (b.onclick = () => { const [p, send] = prompts[+b.dataset.k]; if (send) askTutor(p); else { const c = $("#chatIn"); c.value = p; c.focus(); c.setSelectionRange(p.length, p.length); } }));
  const sel = $("#genSet");
  sel.innerHTML = Array.from({ length: NSETS }, (_, i) => `<option value="${i + 1}" ${i + 1 === cur ? "selected" : ""}>Set ${i + 1}${learned(i + 1) ? " ✓" : ""}</option>`).join("");
  if (!tutorInit) {
    tutorInit = true;
    bubble("bot", md(`Hi! I'm your vocab tutor. I know all ${WORDS.length} words and which sets you've learned. Say **quiz me on set ${cur}**, paste a sentence you wrote, or ask me to untangle two similar words.`));
    renderTutorAvailability();
  }
}
function renderTutorAvailability() {
  if (!sampleReady) return;
  if (!sample) {
    if (!$("#thread .note-off")) bubble("note note-off", "The tutor needs Claude, which isn't available in this view. Open this page inside Claude to chat and generate quizzes. Everything else works here.");
    $("#chatIn").disabled = $("#sendBtn").disabled = $("#genBtn").disabled = true;
  }
}
function errCopy(e) {
  const c = e?.code;
  if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(c)) { sample = null; renderTutorAvailability(); return "The tutor isn't allowed in this view, so it's turned off for now. Reload the page if you change your mind."; }
  if (c === "rate_limited") return "Too many requests right now. Wait a minute, then send again.";
  if (c === "session_expired") return "You've been signed out of Claude. Sign in again, then resend.";
  if (c === "refused") return "The tutor couldn't answer that one. Try asking a different way.";
  if (c === "invalid_json") return "That quiz came back garbled. Press the button again for a fresh one.";
  return "The connection dropped. Send your message again.";
}
function setBusy(b) { tutorBusy = b; $("#sendBtn").hidden = b; $("#stopBtn").hidden = !b; $("#genBtn").disabled = b || !sample; }
async function askTutor(text) {
  text = text.trim();
  if (!text || tutorBusy) return;
  if (!sampleReady) { toast("The tutor is still starting. Try again in a second."); return; }
  if (!sample) { renderTutorAvailability(); return; }
  bubble("me", esc(text));
  turns.push({ role: "user", content: text });
  const out = bubble("bot thinking", "Thinking…");
  tutorCtl = new AbortController(); setBusy(true);
  try {
    const { text: ans } = await sample([{ role: "user", content: rules() }, ...turns.slice(-16)], {
      cache: false, modelTier: "quick", signal: tutorCtl.signal,
      onText: ({ text }) => { out.classList.remove("thinking"); out.innerHTML = md(text); $("#thread").scrollTop = 1e9; },
    });
    out.innerHTML = md(ans);
    turns.push({ role: "assistant", content: ans });
  } catch (e) {
    out.classList.remove("thinking");
    if (e?.text) { out.innerHTML = md(e.text); turns.push({ role: "assistant", content: e.text }); } else out.remove();
    if (e?.code !== "cancelled") bubble("note", esc(errCopy(e)));
  } finally { setBusy(false); }
}
$("#composer").addEventListener("submit", e => { e.preventDefault(); const c = $("#chatIn"); const v = c.value; c.value = ""; askTutor(v); });
$("#chatIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#composer").requestSubmit(); } });
$("#stopBtn").onclick = () => tutorCtl?.abort();
$("#genBtn").onclick = async () => {
  if (!sample || tutorBusy) return;
  const n = +$("#genSet").value, ws = setWords(n);
  const pool = shuffle(WORDS.filter(w => w.set !== n && Math.abs(w.set - n) <= 8)).slice(0, 30);
  bubble("me", esc(`Make me a hard fill-in quiz on Set ${n}`));
  const out = bubble("bot thinking", "Writing five questions…");
  tutorCtl = new AbortController(); setBusy(true);
  try {
    const data = await sample.json(`Write 5 difficult SAT-style sentence-completion questions, one for each of these target words:
${ws.map(w => `- ${w.w} (${w.pos}): ${w.def}`).join("\n")}

Rules:
- Each sentence has exactly one blank written as "____", where the target word fits exactly as written above (base form, no added endings).
- Use strong but indirect context clues, like the Digital SAT: the reader should have to understand the meaning, not just grammar. Don't reuse these example sentences: ${ws.map(w => JSON.stringify(w.q)).join(" ")}
- Give 4 choices: the target word plus 3 distractors of the same part of speech drawn from this list: ${pool.map(w => `${w.w} (${w.pos})`).join(", ")}. Distractors must clearly NOT fit the sentence.
- "explanation" is one or two sentences on why the answer fits and what clue gives it away.
Reply with only a JSON array: [{"sentence": "...____...", "choices": ["w1","w2","w3","w4"], "answer": "w1", "explanation": "..."}]`, { modelTier: "default", cache: false, signal: tutorCtl.signal });
    const qs = (Array.isArray(data) ? data : []).filter(q => q && typeof q.sentence === "string" && Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.includes(q.answer)).slice(0, 5);
    out.remove();
    if (!qs.length) { bubble("note", "That quiz came back incomplete. Press the button again for a fresh one."); return; }
    renderGenQuiz(n, qs);
  } catch (e) {
    out.remove();
    if (e?.code !== "cancelled") bubble("note", esc(errCopy(e)));
  } finally { setBusy(false); }
};
function renderGenQuiz(n, qs) {
  const box = document.createElement("div"); box.className = "gen-quiz"; $("#thread").appendChild(box);
  let i = 0, right = 0;
  const show = () => {
    const q = qs[i];
    box.innerHTML = `<div class="progress-line"><span>Set ${n} quiz · ${i + 1} of ${qs.length}</span><span>${right} correct</span></div><div class="quiz-q">${esc(q.sentence).replace(/_{3,}/, '<span class="blank"></span>')}</div>
      <div class="choices">${q.choices.map((c, k) => `<button class="choice" data-k="${k}">${esc(c)}</button>`).join("")}</div><div class="gq-ex"></div>`;
    box.querySelectorAll(".choice").forEach(b => (b.onclick = () => {
      const pick = q.choices[+b.dataset.k], ok = pick === q.answer;
      if (ok) right++; else if (BY[q.answer]) { addMiss(q.answer); save(); }
      box.querySelectorAll(".choice").forEach((x, j) => { x.disabled = true; if (q.choices[j] === q.answer) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); });
      box.querySelector(".gq-ex").innerHTML = `<div class="explain">${md(String(q.explanation || ""))}</div><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm primary">${i < qs.length - 1 ? "Next →" : "Finish"}</button></div>`;
      box.querySelector(".gq-ex button").onclick = () => { i++; if (i < qs.length) show(); else { box.innerHTML = `<div class="eyebrow">Set ${n} quiz</div><div style="font-family:var(--f-display);font-size:28px;font-weight:800">${right} / ${qs.length}</div><div class="muted">${right === qs.length ? "Perfect score." : "Missed words were added to your tricky list."}</div>`; markDay(); } $("#thread").scrollTop = 1e9; };
      $("#thread").scrollTop = 1e9;
    }));
    $("#thread").scrollTop = 1e9;
  };
  show();
}

// ───────────────────────── Word Runner ─────────────────────────
let pick = new Set();
function renderRunnerSetup() {
  $("#runnerSetup").hidden = false; $("#runnerGame").hidden = true;
  const init = S.pick && S.pick.length ? S.pick : learnedToday().length ? learnedToday() : learnedSets().length ? learnedSets().slice(-3) : [focusSet()];
  pick = new Set(init);
  const g = $("#pickGrid");
  g.innerHTML = Array.from({ length: NSETS }, (_, i) => `<label class="${learned(i + 1) ? "learned" : ""}" title="${setWords(i + 1).map(w => w.w).join(", ")}"><input type="checkbox" value="${i + 1}" ${pick.has(i + 1) ? "checked" : ""}>${i + 1}</label>`).join("");
  g.querySelectorAll("input").forEach(c => (c.onchange = () => { c.checked ? pick.add(+c.value) : pick.delete(+c.value); syncPick(); }));
  syncPick();
  $("#bestScore").textContent = S.best || 0;
}
function syncPick() {
  $("#pickGrid").querySelectorAll("input").forEach(c => (c.checked = pick.has(+c.value)));
  $("#pickCount").textContent = pick.size ? `· ${pick.size} set${pick.size > 1 ? "s" : ""}, ${pick.size * 5} words` : "· none picked";
  S.pick = [...pick]; save();
}
$("#pickToday").onclick = () => { pick = new Set([focusSet()]); syncPick(); };
$("#pickLearned").onclick = () => { const l = learnedSets(); if (!l.length) { toast("You haven't learned a set yet. Start with today's set."); return; } pick = new Set(l); syncPick(); };
$("#pickClear").onclick = () => { pick = new Set(); syncPick(); };
$("#startRun").onclick = () => { if (!pick.size) { toast("Pick at least one set to play."); return; } startGame(); };
$("#quitRun").onclick = () => { stopGame(); renderRunnerSetup(); };

const cv = $("#game"), cx = cv.getContext("2d"), runIn = $("#runIn");
let W = 0, H = 0, G = null, raf = 0;
const C = { sky1: "#070818", sky2: "#1B1446", road: "#12163A", side: "#0A0C26", grid: "rgba(97,120,255,.28)", lane: "#FFE45C", text: "#F3F1FF", dim: "#8E8BC0", good: "#3CE39B", bad: "#FF5D78" };
const SPAWN = 80, PZ = 1.6, DEPTH = 7;

function sizeCanvas() {
  const w = $("#gameWrap").clientWidth || 800;
  const h = Math.round(Math.min(600, Math.max(420, w * 0.62)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px";
  W = w; H = h; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => { if (G) sizeCanvas(); });

function startGame() {
  $("#runnerSetup").hidden = true; $("#runnerGame").hidden = false;
  sizeCanvas();
  const pool = [...pick].sort((a, b) => a - b).flatMap(setWords);
  const clue = document.querySelector('input[name="clue"]:checked').value;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  G = { pool, deck: [], clue, mode, gate: null, typed: "", wrongT: 0, wait: 0.5, dist: 0, speed: 9, score: 0, combo: 0, lives: 3, time: 90,
        shake: 0, parts: [], floats: [], results: [], state: "count", count: 3, runT: 0, flash: null, last: performance.now() };
  $("#gameOverlay").hidden = true;
  runIn.value = ""; runIn.disabled = false;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  $("#gameWrap").scrollIntoView({ behavior: "smooth", block: "start" });
  runIn.focus({ preventScroll: true });
}
function stopGame() { cancelAnimationFrame(raf); raf = 0; G = null; }

function spawnGate() {
  if (!G.deck.length) G.deck = shuffle(G.pool);
  G.gate = { z: SPAWN, t: G.deck.pop(), open: false, passed: false };
  G.typed = ""; runIn.value = "";
}
function clueText(t) {
  if (G.clue === "sent") return t.q.replace(/_{3,}/, "_____");
  if (G.clue === "syn") return "Synonyms: " + t.syn.join(", ");
  return t.def;
}
// Letters given away as the gate gets close: none, then the first, then the first two.
const hintCount = g => (g.z < SPAWN * 0.25 ? 2 : g.z < SPAWN * 0.5 ? 1 : 0);

function loop(now) {
  if (!G) return;
  const dt = Math.min(0.05, (now - G.last) / 1000); G.last = now;
  update(dt); draw();
  raf = requestAnimationFrame(loop);
}
function update(dt) {
  G.shake = Math.max(0, G.shake - dt * 30);
  G.wrongT = Math.max(0, G.wrongT - dt);
  G.floats.forEach(f => (f.t += dt)); G.floats = G.floats.filter(f => f.t < 1.1);
  G.parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.t += dt; }); G.parts = G.parts.filter(p => p.t < 0.8);
  if (G.state === "count") { G.count -= dt; if (G.count <= 0) G.state = "run"; return; }
  if (G.state !== "run") return;
  G.runT += dt;
  if (G.mode === "sprint") { G.time -= dt; if (G.time <= 0) { G.time = 0; return endGame(); } }
  const g = G.gate;
  if (!g) { G.dist += G.speed * dt; G.wait -= dt; if (G.wait <= 0) spawnGate(); return; }
  const dz = G.speed * (g.open ? 5 : 1) * dt;   // an opened gate lets you sprint through
  G.dist += dz; g.z -= dz;
  if (!g.open && !g.passed && G.typed === g.t.w) solveGate(g);
  if (g.z <= PZ && !g.passed) { g.passed = true; if (g.open) burst(C.good, 18); else { missGate(g); if (G.state !== "run") return; } }
  if (g.z < -3) { G.wait = g.open ? 0.3 : 1.7; G.gate = null; G.typed = ""; runIn.value = ""; }
}
function solveGate(g) {
  g.open = true;
  G.combo++;
  const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
  const pts = (100 + Math.round((g.z / SPAWN) * 100)) * mult;   // faster recall, bigger bonus
  G.score += pts; G.speed = Math.min(15, G.speed + 0.2);
  if (G.mode === "sprint") G.time += 2;
  G.results.push({ w: g.t, ok: true });
  G.floats.push({ text: `+${pts}${mult > 1 ? `  ×${mult}` : ""}`, color: C.good, t: 0 });
}
function missGate(g) {
  G.combo = 0; G.shake = 12; addMiss(g.t.w); save();
  G.results.push({ w: g.t, ok: false });
  if (G.mode === "survive") G.lives--; else G.time = Math.max(0, G.time - 5);
  G.floats.push({ text: `It was “${g.t.w}”`, color: C.bad, t: 0 });
  G.flash = { t: g.t, until: G.runT + 2.4 };
  if (G.mode === "survive" && G.lives <= 0) endGame();
}
function burst(color, n) {
  const p = playerPos();
  for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 220; G.parts.push({ x: p.x, y: p.y - 40, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 180, t: 0, color }); }
}
function endGame() {
  G.state = "over"; runIn.disabled = true;
  const best = Math.max(S.best || 0, G.score), isBest = G.score > (S.best || 0) && G.score > 0;
  S.best = best; save(); markDay();
  const right = G.results.filter(r => r.ok).length, missed = [...new Map(G.results.filter(r => !r.ok).map(r => [r.w.w, r.w])).values()];
  const ov = $("#gameOverlay");
  ov.innerHTML = `<div style="display:grid;gap:12px;justify-items:center"><h2>${G.mode === "sprint" ? "Time!" : "Game over"}</h2>
    <div class="big">${G.score.toLocaleString()}</div><div>${isBest ? "New best score!" : `Best: ${best.toLocaleString()}`} · ${right} of ${G.results.length} words typed from memory</div>
    ${missed.length ? `<div class="missed"><div style="background:none;padding:0;color:#FFE45C;font-weight:700">Review these</div>${missed.map(w => `<div><b>${esc(w.w)}</b>: ${esc(w.def)}</div>`).join("")}</div>` : ""}
    <div class="row" style="justify-content:center"><button class="btn" id="again">Play again</button><button class="btn ghost" id="toSetup">Change sets</button></div></div>`;
  ov.hidden = false;
  $("#again").onclick = () => startGame();
  $("#toSetup").onclick = () => { stopGame(); renderRunnerSetup(); };
  $("#again").focus();
}
function togglePause() {
  if (!G || G.state === "over" || G.state === "count") return;
  const ov = $("#gameOverlay");
  if (G.state === "run") {
    G.state = "pause";
    ov.innerHTML = `<div style="display:grid;gap:12px;justify-items:center"><h2>Paused</h2><button class="btn" id="resume">Resume</button></div>`;
    ov.hidden = false; $("#resume").onclick = togglePause; $("#resume").focus();
  } else { G.state = "run"; G.last = performance.now(); ov.hidden = true; runIn.focus({ preventScroll: true }); }
}
document.addEventListener("visibilitychange", () => { if (document.hidden && G && G.state === "run") togglePause(); });
$("#pauseRun").onclick = togglePause;

// Typing
runIn.addEventListener("input", () => {
  const g = G && G.state === "run" ? G.gate : null;
  if (!g || g.open || g.passed) { runIn.value = G ? G.typed : ""; return; }
  const v = runIn.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, g.t.w.length);
  runIn.value = v; G.typed = v;
  if (v.length === g.t.w.length && v !== g.t.w) G.wrongT = 0.4;
});
document.addEventListener("keydown", e => {
  if (!G || view !== "runner") return;
  if (e.key === "Escape" && G.state !== "over") { togglePause(); e.preventDefault(); return; }
  if (e.key === "Enter" && e.target === runIn) { e.preventDefault(); return; }
  // Any letter typed elsewhere on the page lands in the answer box.
  if (G.state !== "over" && G.state !== "pause" && e.target !== runIn && !e.metaKey && !e.ctrlKey && /^[a-zA-Z]$|^Backspace$/.test(e.key)) runIn.focus({ preventScroll: true });
});
cv.addEventListener("pointerup", () => { if (G && G.state !== "over") runIn.focus({ preventScroll: true }); });

// Projection
const horizon = () => H * 0.5;
const groundY = () => H - 14;
const scaleAt = z => DEPTH / (DEPTH + Math.max(z, -DEPTH + 0.5));
const yAt = z => horizon() + (groundY() - horizon()) * scaleAt(z);
const halfW = z => Math.min(W * 0.47, 440) * scaleAt(z);
const laneX = (l, z) => W / 2 + (l - 1) * halfW(z) * (2 / 3);
function playerPos() { return { x: W / 2, y: yAt(PZ), s: scaleAt(PZ) }; }

function wrap(text, maxW) {
  const words = text.split(" "), lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (cx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect ? cx.roundRect(x, y, w, h, r) : cx.rect(x, y, w, h); }

function draw() {
  const hz = horizon();
  cx.save();
  if (G.shake > 0) cx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  const sky = cx.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, C.sky1); sky.addColorStop(1, C.sky2);
  cx.fillStyle = sky; cx.fillRect(-20, -20, W + 40, hz + 20);
  cx.fillStyle = "rgba(129,151,255,.16)";
  for (let k = 0; k < 18; k++) { const bw = W / 18, bh = 18 + ((k * 37) % 50); cx.fillRect(k * bw + 2, hz - bh, bw - 4, bh); }
  const glow = cx.createLinearGradient(0, hz - 30, 0, hz + 6); glow.addColorStop(0, "rgba(255,228,92,0)"); glow.addColorStop(1, "rgba(255,228,92,.35)");
  cx.fillStyle = glow; cx.fillRect(0, hz - 30, W, 36);
  cx.fillStyle = C.side; cx.fillRect(-20, hz, W + 40, H - hz + 20);
  cx.strokeStyle = C.grid; cx.lineWidth = 1;
  const off = G.dist % 4;
  for (let z = 4 - off; z < SPAWN; z += 4) { const y = yAt(z); cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
  for (let k = -8; k <= 8; k++) { cx.beginPath(); cx.moveTo(W / 2 + k * W * 0.02, hz); cx.lineTo(W / 2 + k * W * 0.35, H); cx.stroke(); }
  cx.fillStyle = C.road; cx.beginPath();
  cx.moveTo(W / 2 - halfW(SPAWN), yAt(SPAWN)); cx.lineTo(W / 2 + halfW(SPAWN), yAt(SPAWN)); cx.lineTo(W / 2 + halfW(-3), yAt(-3)); cx.lineTo(W / 2 - halfW(-3), yAt(-3)); cx.fill();
  cx.strokeStyle = C.lane; cx.lineWidth = 2;
  [-1, 1].forEach(sd => { cx.beginPath(); cx.moveTo(W / 2 + sd * halfW(SPAWN), yAt(SPAWN)); cx.lineTo(W / 2 + sd * halfW(-3), yAt(-3)); cx.stroke(); });
  for (let z = -2 - (G.dist % 5); z < SPAWN; z += 5) {
    [0.5, 1.5].forEach(l => { const x1 = laneX(l, z), x2 = laneX(l, z + 2.2); cx.lineWidth = Math.max(1, 5 * scaleAt(z)); cx.beginPath(); cx.moveTo(x1, yAt(z)); cx.lineTo(x2, yAt(z + 2.2)); cx.stroke(); });
  }
  const g = G.gate;
  if (g && g.z >= PZ) drawGate(g);
  drawPlayer();
  if (g && g.z < PZ) drawGate(g);
  G.parts.forEach(p => { cx.globalAlpha = 1 - p.t / 0.8; cx.fillStyle = p.color; cx.fillRect(p.x - 3, p.y - 3, 6, 6); }); cx.globalAlpha = 1;
  cx.restore();
  drawHUD();
}
function drawGate(g) {
  if (g.z < -1.5) return;
  const s = scaleAt(g.z), y = yAt(g.z), hw = halfW(g.z), h = hw * 0.85, top = y - h;
  const col = g.open ? C.good : g.passed ? C.bad : C.lane;
  cx.lineWidth = Math.max(1.5, 5 * s); cx.strokeStyle = col;
  // posts and banner
  cx.beginPath(); cx.moveTo(-hw + W / 2, y); cx.lineTo(-hw + W / 2, top); cx.lineTo(hw + W / 2, top); cx.lineTo(hw + W / 2, y); cx.stroke();
  const bh = h * 0.3;
  cx.fillStyle = g.open ? "rgba(20,110,70,.9)" : "rgba(20,24,70,.92)"; cx.fillRect(W / 2 - hw, top, hw * 2, bh); cx.strokeRect(W / 2 - hw, top, hw * 2, bh);
  const label = g.open || g.passed ? g.t.w : "?".repeat(g.t.w.length);
  const fs = Math.min(bh * 0.62, (hw * 2 * 0.9) / label.length * 1.6);
  if (fs >= 5) { cx.fillStyle = g.open ? "#FFFFFF" : col; cx.font = `800 ${fs}px "Bricolage Grotesque", system-ui, sans-serif`; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(label, W / 2, top + bh / 2 + 1); }
  // the locked doors: bars across the opening until the word is typed
  if (!g.open) {
    cx.fillStyle = g.passed ? "rgba(255,93,120,.35)" : "rgba(255,228,92,.16)"; cx.fillRect(W / 2 - hw, top + bh, hw * 2, h - bh);
    cx.lineWidth = Math.max(1, 3 * s);
    for (let k = 1; k < 8; k++) { const x = W / 2 - hw + (hw * 2 * k) / 8; cx.beginPath(); cx.moveTo(x, top + bh); cx.lineTo(x, y); cx.stroke(); }
  }
}
function drawPlayer() {
  const p = playerPos(), s = p.s * Math.min(1.25, Math.max(0.8, W / 800));
  const boost = G.gate && G.gate.open && !G.gate.passed;
  cx.fillStyle = "rgba(0,0,0,.45)"; cx.beginPath(); cx.ellipse(p.x, p.y, 26 * s, 7 * s, 0, 0, Math.PI * 2); cx.fill();
  const ph = G.runT * (boost ? 24 : 14), sw = G.state === "run" ? Math.sin(ph) : 0.4;
  const hip = { x: p.x, y: p.y - 42 * s }, neck = { x: p.x + 4 * s, y: p.y - 78 * s };
  cx.lineCap = "round"; cx.lineWidth = 9 * s;
  const limb = (o, a, len1, len2, bend) => { const k = { x: o.x + Math.sin(a) * len1, y: o.y + Math.cos(a) * len1 }; const e = { x: k.x + Math.sin(a + bend) * len2, y: k.y + Math.cos(a + bend) * len2 }; cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(k.x, k.y); cx.lineTo(e.x, e.y); cx.stroke(); };
  cx.strokeStyle = "#8197FF"; limb(hip, -sw * 0.9, 22 * s, 22 * s, Math.max(0, sw) * -1.1);
  limb(neck, sw * 1.1, 17 * s, 16 * s, -1.3);
  cx.strokeStyle = "#FFFFFF"; cx.beginPath(); cx.moveTo(hip.x, hip.y); cx.lineTo(neck.x, neck.y); cx.stroke();
  limb(hip, sw * 0.9, 22 * s, 22 * s, Math.max(0, -sw) * -1.1);
  cx.strokeStyle = "#FFE45C"; limb(neck, -sw * 1.1, 17 * s, 16 * s, -1.3);
  cx.fillStyle = "#FFE45C"; cx.beginPath(); cx.arc(neck.x + 3 * s, neck.y - 15 * s, 12 * s, 0, Math.PI * 2); cx.fill();
}
function drawHUD() {
  const small = W < 560, pad = 12;
  cx.textBaseline = "alphabetic"; cx.textAlign = "left";
  cx.font = `800 ${small ? 18 : 22}px "Bricolage Grotesque", system-ui, sans-serif`; cx.fillStyle = C.text;
  const scoreTxt = G.score.toLocaleString(), scoreW = cx.measureText(scoreTxt).width;
  cx.fillText(scoreTxt, pad, 30);
  const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
  if (G.combo > 0) { cx.font = `700 ${small ? 12 : 14}px "Atkinson Hyperlegible", system-ui, sans-serif`; cx.fillStyle = C.lane; cx.fillText(`streak ${G.combo}${mult > 1 ? ` · ×${mult}` : ""}`, pad + scoreW + 12, 29); }
  cx.textAlign = "right";
  if (G.mode === "survive") { cx.font = `${small ? 18 : 22}px system-ui, sans-serif`; cx.fillStyle = C.bad; cx.fillText("♥".repeat(Math.max(0, G.lives)) + "♡".repeat(Math.max(0, 3 - G.lives)), W - pad, 30); }
  else { cx.font = `800 ${small ? 18 : 22}px "Bricolage Grotesque", system-ui, sans-serif`; cx.fillStyle = G.time < 10 ? C.bad : C.text; cx.fillText(`${Math.ceil(G.time)}s`, W - pad, 30); }
  // clue panel
  const g = G.gate && !G.gate.passed ? G.gate : null;
  const fs = small ? 15 : W < 800 ? 17 : 19, lh = fs * 1.3;
  cx.font = `400 ${fs}px "Source Serif 4", Georgia, serif`;
  const flash = G.flash && G.flash.until > G.runT ? G.flash.t : null;
  let lines = flash ? wrap(`${flash.w}: ${flash.def}`, W - pad * 2 - 28) : g ? wrap(clueText(g.t), W - pad * 2 - 28) : [];
  lines = lines.slice(0, 5);
  const boxH = 30 + Math.max(1, lines.length) * lh + 10, by = 42;
  cx.fillStyle = flash ? "rgba(120,20,40,.88)" : "rgba(12,14,40,.85)"; rr(pad, by, W - pad * 2, boxH, 10); cx.fill();
  cx.strokeStyle = flash ? C.bad : "rgba(255,228,92,.55)"; cx.lineWidth = 1.5; cx.stroke();
  cx.textAlign = "left"; cx.font = `700 11px "Atkinson Hyperlegible", system-ui, sans-serif`; cx.fillStyle = flash ? "#FFD0D8" : C.lane;
  cx.fillText(flash ? "REMEMBER THIS ONE" : g ? (G.clue === "sent" ? "TYPE THE WORD THAT FILLS THE BLANK" : G.clue === "syn" ? "TYPE THE WORD THAT MATCHES" : "TYPE THE WORD THAT MEANS…") : "GET READY", pad + 14, by + 20);
  cx.font = `400 ${fs}px "Source Serif 4", Georgia, serif`; cx.fillStyle = C.text;
  lines.forEach((l, k) => cx.fillText(l, pad + 14, by + 30 + (k + 0.8) * lh));
  // letter slots
  if (g && !flash) {
    const word = g.t.w, n = word.length, hints = g.open ? 0 : hintCount(g);
    const bw = Math.min(small ? 26 : 38, (W - 40) / n - 4), gap = 4, total = n * bw + (n - 1) * gap, x0 = W / 2 - total / 2, sy = by + boxH + 12, bhh = bw * 1.2;
    const wrong = G.wrongT > 0, jig = wrong ? Math.sin(G.wrongT * 60) * 4 : 0;
    cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = `800 ${bw * 0.72}px "Bricolage Grotesque", system-ui, sans-serif`;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * (bw + gap) + jig, ch = G.typed[k];
      cx.fillStyle = g.open ? "rgba(20,110,70,.9)" : "rgba(12,14,40,.88)"; rr(x, sy, bw, bhh, 5); cx.fill();
      cx.strokeStyle = g.open ? C.good : wrong ? C.bad : k === G.typed.length ? C.lane : "rgba(255,255,255,.28)"; cx.lineWidth = k === G.typed.length && !g.open ? 2 : 1; cx.stroke();
      if (ch) { cx.fillStyle = wrong ? C.bad : C.text; cx.fillText(ch, x + bw / 2, sy + bhh / 2 + 1); }
      else if (k < hints) { cx.fillStyle = C.dim; cx.fillText(word[k], x + bw / 2, sy + bhh / 2 + 1); }
    }
  }
  cx.textAlign = "center"; cx.textBaseline = "middle";
  G.floats.forEach((f, k) => { cx.globalAlpha = 1 - f.t / 1.1; cx.font = `800 ${small ? 18 : 24}px "Bricolage Grotesque", system-ui, sans-serif`; cx.fillStyle = f.color; cx.fillText(f.text, W / 2, H * 0.7 - f.t * 50 - k * 28); });
  cx.globalAlpha = 1;
  if (G.state === "count") {
    cx.fillStyle = "rgba(6,7,22,.55)"; cx.fillRect(0, 0, W, H);
    cx.font = `800 96px "Bricolage Grotesque", system-ui, sans-serif`; cx.fillStyle = C.lane; cx.fillText(Math.ceil(G.count), W / 2, H / 2);
    cx.font = `700 16px "Atkinson Hyperlegible", system-ui, sans-serif`; cx.fillStyle = C.text;
    cx.fillText("Type each word to open its gate before you reach it", W / 2, H / 2 + 70);
  }
}

// ───────────────────────── Boot ─────────────────────────
renderStreak();
go("today");
