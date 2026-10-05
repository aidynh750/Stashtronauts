// Ship console: the money tracker, as a landscape tablet that lifts up over the space view.
// It edits the same saved data the tracker always used, and tells the 3D world when something changes.
// Money is entered in a separate small dialog with a keypad (the "pad").
import { load, save, blank, sample, uid, fmt, esc, sum, dateIn, sim, goalsOf, limitsOf, planetNames, isEmpty, amount, isEmergencyFund, KEY } from './money.js';

const $ = s => document.querySelector(s);
const dlg = $('#console'), panel = $('#panel'), side = $('#side'), worth = $('#worthLine'), live = $('#live'), pad = $('#pad'), opener = $('#openConsole');
const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
const tell = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));
const DEFAULT_SHIP = 'Stashtronaut One';

let S = load();
S.ship ||= {};
S.ship.since ||= new Date().toISOString().slice(0, 10); // saved with the next change
let sec = 'home';    // which section the main area shows
let ps = null;       // what the pad is showing: { kind: 'amount', mode, id } or { kind: 'flow', flow, step, data }
let armed = null;    // something waiting for a second click to confirm removal
let returnFocus = null;

const find = id => id === 'extra' ? { name: 'extra payments', extra: true } : [...S.assets, ...S.debts, ...S.cores].find(x => x.id === id);
// The emergency fund isn't a planet: it's guarded by the fleet in space.
const mythOf = id => isEmergencyFund(S.cores.find(c => c.id === id) || {}) ? 'Guardian fleet' : planetNames(goalsOf(S))[id]?.myth || 'Your planet';
const pct = c => Math.round(Math.min(1, c.amount / c.target) * 100);
const goals = () => S.cores.filter(c => c.type === 'goal'); // newest first
const daysAboard = () => Math.max(1, Math.floor((Date.now() - new Date(S.ship.since + 'T00:00')) / 864e5) + 1);
const totals = () => { const A = sum(S.assets, 'value'), D = sum(S.debts, 'balance'); return { A, D, nw: A - D }; };
function bestPlan() {
  if (!S.debts.length) return null;
  const av = sim(S, S.extra, 'av'), sn = sim(S, S.extra, 'sn');
  return { av, sn, best: av.int <= sn.int ? av : sn, bestIsAv: av.int <= sn.int };
}

// Pictures of each planet, sent over by the 3D world.
const thumbs = new Map();
addEventListener('stash:thumb', e => {
  thumbs.set(e.detail.id, e.detail.url);
  document.querySelectorAll(`img[data-thumb="${e.detail.id}"]`).forEach(i => { i.src = e.detail.url; i.hidden = false; });
});
tell('stash:thumbs');
const porthole = (id, extra = '') => `<span class="porthole">${extra}<img data-thumb="${id}" alt="" ${thumbs.has(id) ? `src="${thumbs.get(id)}"` : 'hidden'}></span>`;

// ---------- Opening and closing ----------
function open(section) {
  if (section) sec = section;
  if (!dlg.open) { returnFocus = document.activeElement; dlg.showModal(); }
  render('go-' + sec);
}
function close() {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  if (pad.open) pad.close();
  let finished = false;
  const done = () => {
    if (finished) return; finished = true;
    dlg.classList.remove('closing'); dlg.close(); armed = null;
    const back = returnFocus?.isConnected && returnFocus.offsetParent ? returnFocus : opener;
    back.focus();
  };
  if (reducedQ.matches) return done();
  dlg.classList.add('closing');
  dlg.addEventListener('animationend', done, { once: true });
  setTimeout(done, 400); // in case the animation never runs
}
opener.addEventListener('click', () => { open(); if (isEmpty(S)) openFlow('setup'); });
// The dashboard screen in the ship opens the console too, but only when the player clicks it (see space.js).
addEventListener('stash:console', () => opener.click());
document.addEventListener('click', e => {
  if (!e.target.closest('[data-open=setup]')) return;
  open('planets'); openFlow(goals().length ? 'goal' : 'setup');
});
dlg.addEventListener('cancel', e => { e.preventDefault(); close(); }); // Esc
addEventListener('storage', e => { if (e.key === KEY) { S = load(); S.ship ||= {}; if (dlg.open) render(); } });

// Short notes show in the status bar for a moment, where the net worth line usually is.
let noteTimer = null;
function note(msg) {
  live.textContent = msg;
  worth.textContent = msg; worth.classList.add('flash');
  clearTimeout(noteTimer); noteTimer = setTimeout(() => { noteTimer = null; worth.classList.remove('flash'); renderStatus(); }, 4500);
}
let helloTimer;
function hello(msg) {
  const el = $('#hello'); el.textContent = msg; el.hidden = false;
  clearTimeout(helloTimer); helloTimer = setTimeout(() => { el.hidden = true; }, 7000);
}
function commit(msg) { save(S); if (msg) note(msg); }

// ---------- Drawing the tablet ----------
const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>',
  planets: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10.5" ry="3.4" transform="rotate(-18 12 12)"/></svg>',
  have: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/></svg>',
  owe: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18M7 14.5h4"/></svg>',
  limits: '<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 17l4.5-5"/></svg>',
  ship: '<svg viewBox="0 0 24 24"><path d="M12 3c3 2.5 4.5 6 4.5 10l-2 3h-5l-2-3c0-4 1.5-7.5 4.5-10z"/><circle cx="12" cy="10" r="1.6"/><path d="M9.5 16l-2.5 3M14.5 16l2.5 3M12 17v3"/></svg>',
};
const SECTIONS = [
  { id: 'planets', label: 'Planets', num: () => goals().length ? `${fmt(sum(goals(), 'amount'))} saved` : 'None yet' },
  { id: 'have', label: 'What I have', num: () => fmt(totals().A) },
  { id: 'owe', label: 'What I owe', num: () => S.debts.length ? fmt(totals().D) : 'Nothing' },
  { id: 'limits', label: 'Spending limits', num: () => limitsOf(S).length ? `${fmt(limitsOf(S).reduce((t, c) => t + Math.max(0, c.target - c.amount), 0))} left` : 'None set' },
  { id: 'ship', label: 'Ship and pilot', num: () => `Day ${daysAboard()} aboard` },
];

function renderStatus() {
  $('#shipLabel').textContent = S.ship.name || DEFAULT_SHIP;
  if (noteTimer) return; // a note is showing
  const { A, D, nw } = totals();
  worth.innerHTML = !A && !D ? 'Add what you have and what you owe to see where you stand.'
    : nw >= 0 ? `You have <b>${fmt(nw)}</b> more than you owe.`
    : `You owe <b>${fmt(-nw)}</b> more than you have. Lots of pilots start here.`;
}
function renderSide() {
  const cur = id => sec === id ? 'aria-current="page"' : '';
  side.innerHTML = `<button class="home" data-go="home" data-k="go-home" ${cur('home')}>${ICONS.home}<span>Overview</span></button>` +
    SECTIONS.map(s => `<button data-go="${s.id}" data-k="go-${s.id}" ${cur(s.id)}>
      <span class="ico" aria-hidden="true">${ICONS[s.id]}</span>
      <span class="txt"><span class="lbl">${s.label}</span><span class="num">${s.num()}</span></span></button>`).join('');
}
// Elements that should keep focus across redraws carry a data-k key.
function render(focusKey) {
  const keep = focusKey ?? document.activeElement?.dataset?.k;
  renderStatus(); renderSide();
  const scroll = panel.scrollTop;
  panel.innerHTML = VIEWS[sec]();
  panel.setAttribute('aria-label', sec === 'home' ? 'Overview' : SECTIONS.find(s => s.id === sec).label);
  panel.scrollTop = focusKey?.startsWith('go-') ? 0 : scroll;
  if (pad.open) return; // the pad keeps focus
  const el = keep && dlg.querySelector(`[data-k="${keep}"]`);
  if (el) el.focus(); else if (focusKey) panel.focus();
}
const removeBtn = (id, word = 'Remove') =>
  `<button class="quiet danger" data-a="del" data-id="${id}" data-k="del-${id}">${armed === id ? 'Click again to confirm' : word}</button>`;
// An amount you can click to change. It opens the keypad.
const valueBtn = (id, value, label) =>
  `<button class="value" data-a="amount" data-mode="set" data-id="${id}" data-k="set-${id}" aria-label="${esc(label)}, now ${fmt(value)}. Change">
    ${fmt(value)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>`;
const head = (title, lead, action = '') => `<div class="secthead"><div><h3>${title}</h3><p class="lead">${lead}</p></div>${action}</div>`;

function vHome() {
  const { nw } = totals(), plan = bestPlan(), lims = limitsOf(S), gs = goals();
  const left = lims.reduce((t, c) => t + Math.max(0, c.target - c.amount), 0);
  const tiles = `<div class="tiles">
    <button class="tile" data-go="have" data-k="t-have"><span class="kicker">If you added it all up</span>
      <span class="big ${nw < 0 ? 'neg' : ''}">${fmt(nw)}</span><span class="note">What you have, minus what you owe.</span></button>
    <button class="tile" data-go="owe" data-k="t-owe"><span class="kicker">${plan ? 'Debt-free by' : 'What you owe'}</span>
      <span class="big">${plan ? (plan.best.ok ? dateIn(plan.best.n) : 'Not yet') : 'Nothing'}</span>
      <span class="note">${plan ? (plan.best.ok ? 'With your plan and extra payments.' : 'The payments need a little boost. Take a look.') : 'Nice and light.'}</span></button>
    <button class="tile" data-go="limits" data-k="t-limits"><span class="kicker">Left to spend this month</span>
      <span class="big">${lims.length ? fmt(left) : 'No limits'}</span>
      <span class="note">${lims.length ? `Across ${lims.length} spending limit${lims.length === 1 ? '' : 's'}.` : 'Set one for groceries or eating out.'}</span></button>
  </div>`;
  const strip = gs.length ? `<div class="strip">${gs.slice(0, 4).map(g => `<button class="mini" data-go="planets" data-k="m-${g.id}">
      ${porthole(g.id)}<span class="t">${esc(mythOf(g.id))} <span class="note">· ${esc(g.name)}</span></span>
      <span class="meter" aria-hidden="true"><i style="width:${pct(g)}%"></i></span><span class="sr">${pct(g)}% saved</span></button>`).join('')}</div>`
    : `<button class="newcard" data-a="new" data-what="goal" data-k="new-goal" style="min-height:160px"><span class="plus" aria-hidden="true">+</span>Make your first planet</button>`;
  return `<p class="hello">Welcome ${isEmpty(S) ? 'aboard' : 'back'}, ${esc(S.ship.pilot || 'pilot')}.</p><p class="lead" style="margin:4px 0 0">Here's where things stand today.</p>
    ${tiles}
    <div class="rowhead"><h4>Your planets</h4>${gs.length ? `<button class="btn small" data-go="planets" data-k="see-planets">See all ${gs.length}</button>` : ''}</div>${strip}`;
}

function vPlanets() {
  const cards = goals().map(g => {
    const left = g.target - g.amount, done = left <= 0, p = pct(g);
    const line = done ? 'You did it! This goal is reached.'
      : g.monthly > 0 ? `At ${fmt(g.monthly)} a month, you'll get there around ${dateIn(Math.ceil(left / g.monthly))}.`
      : 'How much do you save each month? It helps guess when you will get there.';
    return `<article class="card ${done ? 'done' : ''}">
      ${porthole(g.id, `<span class="pct">${p}%</span>`)}
      <div class="cardbody">
        <h4>${esc(mythOf(g.id))}<small>${esc(g.name)}</small></h4>
        <div class="meter ${done ? 'gold' : ''}" aria-hidden="true"><i style="width:${p}%"></i></div>
        <p class="amt"><b>${fmt(g.amount)}</b> of ${fmt(g.target)}</p>
        <p class="note">${line}${done ? '' : ` <button class="quiet inline" data-a="amount" data-mode="monthly" data-id="${g.id}" data-k="monthly-${g.id}">${g.monthly > 0 ? 'Change' : 'Set monthly amount'}</button>`}</p>
        <div class="acts">
          <button class="btn primary" data-a="amount" data-mode="add" data-id="${g.id}" data-k="add-${g.id}">Add money</button>
          <button class="btn" data-a="amount" data-mode="take" data-id="${g.id}" data-k="take-${g.id}">Take out</button>
        </div>
        <div class="links"><button class="quiet" data-a="show" data-id="${g.id}" data-k="show-${g.id}">Show in space</button>${removeBtn(g.id, 'Remove')}</div>
      </div></article>`;
  }).join('');
  return head('Your planets', 'Each savings goal is a planet. It grows as you fill it up.') +
    `<div class="grid">${cards}<button class="newcard" data-a="new" data-what="goal" data-k="new-goal"><span class="plus" aria-hidden="true">+</span>Add a planet</button></div>`;
}

function worthBox() {
  const { A, D, nw } = totals();
  return `<div class="panelbox worthbox"><p class="kicker">If you added it all up</p>
    <p class="big ${nw < 0 ? 'neg' : ''}">${fmt(nw)}</p><p style="margin:0">That's what you have, minus what you owe.</p>
    ${nw < 0 ? '<p class="note" style="margin-top:6px">Lots of people start here. Every payment moves this number up.</p>' : ''}
    <div class="two"><div><span>You have</span><b>${fmt(A)}</b></div><div><span>You owe</span><b>${fmt(D)}</b></div></div></div>`;
}
function vHave() {
  const rows = S.assets.map(a => `<div class="lrow">
      <span class="name">${esc(a.name)}</span>${valueBtn(a.id, a.value, a.name)}${removeBtn(a.id)}</div>`).join('');
  return head('What I have', 'Bank accounts, savings, cash. Click an amount to update it when your balance changes.',
      `<button class="btn primary" data-a="new" data-what="asset" data-k="new-asset">+ Add an account</button>`) +
    `<div class="cols"><div class="list">${rows || '<p class="empty">Nothing added yet. Add a bank account, savings, or cash you have.</p>'}</div>${worthBox()}</div>`;
}

function vOwe() {
  const rows = S.debts.map(d => `<div class="lrow">
      <span class="name">${esc(d.name)}<small>${+d.apr || 0}% interest a year · ${fmt(d.min)} minimum a month</small></span>
      ${valueBtn(d.id, d.balance, `Still owed on ${d.name}`)}${removeBtn(d.id)}</div>`).join('');
  const plan = bestPlan();
  let right;
  if (!plan) right = `<div class="panelbox"><h4>Your payoff plan</h4><p class="note">Add a loan or card and you'll see two ways to pay it off, with a debt-free date for each.</p></div>`;
  else {
    const { av, sn, best, bestIsAv } = plan, base = sim(S, 0, 'av'), differ = av.int !== sn.int;
    const opt = (title, about, r, isBest) => `<div class="opt ${isBest && differ ? 'best' : ''}">
        <div><b>${title}</b>${isBest && differ ? ' <span class="tag">Saves the most</span>' : ''}<p class="note">${about}</p></div>
        <div class="res"><p class="when">${r.ok ? dateIn(r.n) : 'Not yet'}</p>
        <p class="note">${r.ok ? `about ${fmt(r.int)} in interest` : "Payments aren't quite enough yet."}</p></div></div>`;
    right = `<div class="panelbox"><h4>Your payoff plan</h4>
      <p class="note">Two common ways to pay things off. Both work, they just start with different debts.</p>
      <p class="field"><span>Extra I can pay each month</span><small>On top of the minimums. Even a little helps.</small></p>
      <div class="stepper"><button class="btn" data-a="extra" data-d="-25" data-k="ex-minus" aria-label="25 dollars less">&minus;</button>
        ${valueBtn('extra', +S.extra || 0, 'Extra I can pay each month')}
        <button class="btn" data-a="extra" data-d="25" data-k="ex-plus" aria-label="25 dollars more">+</button></div>
      <div class="plans">${opt('Highest interest first', 'Extra money goes to the debt that charges the most. Costs the least overall.', av, bestIsAv)}
        ${opt('Smallest balance first', 'Clear the smallest debt first for quick wins.', sn, !bestIsAv)}</div>
      <p class="saves">${!best.ok ? 'Try adding a little extra each month, or check that the minimum payments are right.'
        : base.ok && S.extra > 0 ? `Paying ${fmt(S.extra)} extra each month saves you about <b>${fmt(base.int - best.int)}</b> in interest, and you'd be done ${base.n - best.n} month${base.n - best.n === 1 ? '' : 's'} sooner.`
        : 'Adding even a little extra each month can save you real money. Try the + button.'}</p></div>`;
  }
  return head('What I owe', 'Loans, credit cards, anything with a balance. Click a balance to update it as you pay it down.',
      `<button class="btn primary" data-a="new" data-what="debt" data-k="new-debt">+ Add a loan or card</button>`) +
    `<div class="cols wide-right"><div class="list">${rows || '<p class="empty">Nothing added. If you have any loans or cards, add them to get a payoff plan.</p>'}</div>${right}</div>`;
}

function vLimits() {
  const cards = limitsOf(S).map(c => {
    const left = c.target - c.amount, frac = Math.max(0, Math.min(1, left / c.target));
    const line = left < 0 ? `Over by <b>${fmt(-left)}</b>` : `<b>${fmt(left)}</b> left of ${fmt(c.target)}`;
    const msg = left < 0 ? 'That happens. A new month is a fresh start.' : frac <= 0.2 ? `Running low. ${fmt(c.amount)} spent so far.` : `${fmt(c.amount)} spent so far this month.`;
    return `<article class="card"><div class="cardbody">
      <h4>${esc(c.name)}<small>${fmt(c.target)} a month</small></h4>
      <div class="meter ${frac <= 0 ? 'out' : frac <= 0.3 ? 'low' : ''}" aria-hidden="true"><i style="width:${frac * 100}%"></i></div>
      <p class="amt">${line}</p><p class="note">${msg}</p>
      <div class="acts">
        <button class="btn primary" data-a="amount" data-mode="spend" data-id="${c.id}" data-k="spend-${c.id}">I spent some</button>
        <button class="btn" data-a="amount" data-mode="undo" data-id="${c.id}" data-k="undo-${c.id}">Undo</button>
      </div>
      <div class="links"><button class="quiet" data-a="reset" data-id="${c.id}" data-k="reset-${c.id}">Start a new month</button>${removeBtn(c.id)}</div>
    </div></article>`;
  }).join('');
  return head('Spending limits', 'A monthly amount for things like groceries or eating out. The bar drains as you log what you spend.') +
    `<div class="grid">${cards}<button class="newcard" data-a="new" data-what="limit" data-k="new-limit" style="min-height:220px"><span class="plus" aria-hidden="true">+</span>Add a spending limit</button></div>`;
}

function vShip() {
  const since = new Date(S.ship.since + 'T00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return head('Ship and pilot', `Day ${daysAboard()} aboard, since ${since}.`) + `<div class="cols">
    <div class="panelbox"><h4>Names</h4><p class="note">Shown in the status bar and when you come back.</p>
      <label class="field" for="shipName"><span>Ship name</span></label>
      <input id="shipName" data-f="ship-name" data-k="ship-name" maxlength="28" placeholder="${DEFAULT_SHIP}" value="${esc(S.ship.name || '')}">
      <label class="field" for="pilotName"><span>What should we call you?</span></label>
      <input id="pilotName" data-f="ship-pilot" data-k="ship-pilot" maxlength="28" placeholder="Pilot" value="${esc(S.ship.pilot || '')}">
      <label class="toggle" for="towPod"><input type="checkbox" id="towPod" data-f="ship-tow" data-k="ship-tow" ${S.ship.towPod ? 'checked' : ''}>
        <span><b>Tow a debt pod behind my ship</b><small>A little pod on a line that shrinks as you pay down what you owe. Off unless you want it.</small></span></label></div>
    <div class="panelbox"><h4>Controls and settings</h4>
      <dl class="controls">
        <dt>W A S D or arrows</dt><dd>Fly forward, back, and turn</dd>
        <dt>Space</dt><dd>Fly up</dd>
        <dt>C or Ctrl</dt><dd>Fly down</dd>
        <dt>Shift</dt><dd>Boost while flying forward</dd>
        <dt>Drag / scroll</dt><dd>Look around / zoom. Zoom in close to see inside.</dd>
        <dt>F</dt><dd>Free camera: W A S D to move, Q and E down and up, drag to look, scroll for speed, Shift to go faster. F or Esc to come back.</dd>
        <dt>X</dt><dd>Below a planet's clouds: skip straight back up to space. (Or just fly up through the clouds.)</dd>
      </dl>
      <p class="note">Keys are ignored while the console is open or you're typing.</p>
      <label class="field" for="fighterUnit"><span>Dollars per fighter</span></label>
      <input id="fighterUnit" type="number" inputmode="numeric" min="1" step="1" data-f="ship-fighter" data-k="ship-fighter" value="${S.ship.fighterUnit || 100}">
      <p class="note">Your emergency fund's guardian ship gets one fighter for every this many dollars saved.</p>
      <label class="toggle" for="calmSpace"><input type="checkbox" id="calmSpace" data-f="ship-calm" data-k="ship-calm" ${S.ship.calmSpace ? 'checked' : ''}>
        <span><b>Calm space</b><small>The guardian ship's guns rest and skip their practice drills, and its fighters take off gently. Always on if your device asks for less motion.</small></span></label></div>
    <div class="panelbox"><h4>Your data stays here</h4>
      <p class="note">No account and no bank connection. Everything is saved in this browser, on this computer only.</p>
      <p style="margin:14px 0 0">${isEmpty(S)
        ? '<button class="btn" data-a="sample" data-k="sample">Fill in example numbers to look around</button>'
        : `<button class="btn" data-a="wipe" data-k="wipe">${armed === 'wipe' ? 'Click again to erase everything' : 'Start over with nothing saved'}</button>`}</p></div>
  </div>`;
}
const VIEWS = { home: vHome, planets: vPlanets, have: vHave, owe: vOwe, limits: vLimits, ship: vShip };

// ---------- The pad: amount entry and short question flows ----------
const AMOUNT = {
  add: { kicker: 'Add money', title: c => `Add money to ${c.name}`, sub: c => `${mythOf(c.id)} grows a little as it fills up.`, verb: 'Add' },
  take: { kicker: 'Take money out', title: c => `Take money out of ${c.name}`, sub: c => `That's okay, plans change. You have ${fmt(c.amount)} saved here.`, verb: 'Take out' },
  spend: { kicker: 'Log spending', title: c => `How much did you spend on ${c.name}?`, sub: c => `${fmt(Math.max(0, c.target - c.amount))} left this month before this.`, verb: 'Log' },
  monthly: { kicker: 'Monthly saving', title: c => `How much do you save each month for ${c.name}?`, sub: () => "A rough guess is fine. It helps estimate when you'll get there.", verb: 'Save', zero: true, start: c => c.monthly },
  set: { kicker: 'Update amount', verb: 'Update', zero: true, start: c => c.extra ? S.extra : 'value' in c ? c.value : c.balance,
    title: c => c.extra ? 'How much extra can you pay each month?' : 'value' in c ? `How much is in ${c.name} now?` : `How much do you still owe on ${c.name}?`,
    sub: c => c.extra ? 'On top of the minimums. Even a little helps.' : 'Type the new amount, or edit the one shown.' },
  undo: { kicker: 'Undo spending', title: c => `Undo spending on ${c.name}`, sub: c => `For a refund or a mistake. ${fmt(c.amount)} logged so far.`, verb: 'Undo' },
};
// One question at a time. Money questions use the keypad.
const GOAL_STEPS = [
  { k: 'name', q: "What's the first thing you'd like to save for?", type: 'text', ph: 'Like: A trip, a new bike' },
  { k: 'target', q: 'How much would you like to reach?', type: 'money', help: d => `For ${d.name}. A rough number is fine. You can change it later.` },
  { k: 'amount', q: 'How much have you saved so far?', type: 'money', help: () => "It's fine if it's nothing yet. Every planet starts somewhere.", skip: 'Skip, start from zero' },
];
const FLOWS = {
  setup: { title: 'Welcome aboard!', done: 'Done', steps: GOAL_STEPS },
  goal: { title: 'A new planet', done: 'Make this planet', steps: [{ ...GOAL_STEPS[0], q: 'What are you saving for?' }, ...GOAL_STEPS.slice(1)] },
  asset: { title: 'Add an account', done: 'Add account', steps: [
    { k: 'name', q: "What's the account called?", type: 'text', ph: 'Like: Checking account' },
    { k: 'value', q: 'How much is in it?', type: 'money', zero: true }] },
  debt: { title: 'Add a loan or card', done: 'Add this', steps: [
    { k: 'name', q: "What's it called?", type: 'text', ph: 'Like: Car loan' },
    { k: 'balance', q: 'How much do you still owe?', type: 'money' },
    { k: 'apr', q: "What's the interest rate?", type: 'percent', help: () => "The yearly percentage they charge, often called APR. It's on your statement.", skip: "I'm not sure" },
    { k: 'min', q: "What's the minimum payment each month?", type: 'money', help: () => 'The smallest amount they ask you to pay each month.' }] },
  limit: { title: 'Add a spending limit', done: 'Set this limit', steps: [
    { k: 'name', q: "What's the limit for?", type: 'text', ph: 'Like: Groceries' },
    { k: 'target', q: 'How much per month?', type: 'money' }] },
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
const keypad = () => `<div class="keypad" aria-hidden="true">${KEYS.map(k =>
  `<button type="button" tabindex="-1" data-key="${k}">${k === 'back' ? '&#9003;' : k}</button>`).join('')}</div>`;
const display = (sign, value, describedBy = '') => `<div class="display">${sign === '$' ? '<span aria-hidden="true">$</span>' : ''}
  <input id="padIn" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(value)}" ${describedBy}>${sign === '%' ? '<span aria-hidden="true">%</span>' : ''}</div>`;
// Keeps typed amounts tidy: digits, one dot, two decimals, and commas every three digits.
function tidy(v) {
  const raw = String(v).replace(/[^0-9.]/g, '');
  if (!raw) return '';
  let [int, ...rest] = raw.split('.');
  int = int.replace(/^0+(?=\d)/, '').slice(0, 9).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${int || '0'}.${rest.join('').slice(0, 2)}` : int;
}

function vPad() {
  if (ps.kind === 'amount') {
    const c = find(ps.id), m = AMOUNT[ps.mode];
    return `<form class="padbox" data-form="amount" novalidate>
      <p class="step">${m.kicker}</p><h3 id="padTitle">${esc(m.title(c))}</h3><p class="hint" id="padHint">${esc(m.sub(c))}</p>
      <label class="sr" for="padIn">Amount in dollars</label>${display('$', m.start ? tidy(String(+m.start(c) || 0)) : '', 'aria-describedby="padHint"')}
      <div class="chips">${[10, 25, 50, 100].map(v => `<button type="button" data-a="chip" data-v="${v}">+$${v}</button>`).join('')}</div>
      ${keypad()}<p class="err" role="alert"></p>
      <div class="padacts"><button type="button" class="btn" data-a="padClose">Cancel</button><button class="btn primary" id="padGo">${m.verb}</button></div></form>`;
  }
  const f = FLOWS[ps.flow], st = f.steps[ps.step], n = f.steps.length, last = ps.step === n - 1;
  const dots = `<div class="dots" aria-hidden="true">${f.steps.map((_, i) => `<i class="${i <= ps.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const help = st.help ? `<p class="hint" id="padHint">${esc(st.help(ps.data))}</p>` : '';
  const val = ps.data[st.k] ?? '';
  const input = st.type === 'text'
    ? `<div class="display"><input id="padIn" class="text" maxlength="30" autocomplete="off" placeholder="${st.ph}" value="${esc(val)}"></div>`
    : display(st.type === 'percent' ? '%' : '$', val, help ? 'aria-describedby="padHint"' : '') + keypad();
  const back = ps.step ? '<button type="button" class="btn" data-a="flowBack">Back</button>' : '<button type="button" class="btn" data-a="padClose">Cancel</button>';
  const skip = st.skip ? `<button type="button" class="btn" data-a="flowSkip">${st.skip}</button>` : '';
  return `<form class="padbox" data-form="flow" novalidate>
    <p class="step">${f.title} · ${ps.step + 1} of ${n}</p>${dots}
    <label class="q" id="padTitle" for="padIn">${st.q}</label>${help}${input}
    <p class="err" role="alert"></p>
    <div class="padacts ${skip ? 'three' : ''}">${back}${skip}<button class="btn primary">${last ? f.done : 'Next'}</button></div>
    ${ps.flow === 'setup' && ps.step === 0 ? `<p class="padextra"><button type="button" class="quiet" data-a="sample">Show me an example first</button>
      <button type="button" class="quiet" data-a="lookAround">Just look around for now</button></p>` : ''}</form>`;
}
function renderPad() {
  pad.innerHTML = vPad();
  if (!pad.open) pad.showModal();
  const inp = pad.querySelector('#padIn');
  inp.focus(); inp.select(); // a shown amount gets replaced as soon as you type
}
function openAmount(mode, id) { ps = { kind: 'amount', mode, id }; renderPad(); }
function openFlow(flow) { ps = { kind: 'flow', flow, step: 0, data: {} }; renderPad(); }
let padReturn = null;
function closePad() {
  if (!pad.open) return;
  pad.close(); ps = null;
  if (dlg.open) render(padReturn); padReturn = null;
}
pad.addEventListener('cancel', e => { e.preventDefault(); closePad(); }); // Esc closes just the pad
pad.addEventListener('mousedown', e => { if (e.target.closest('[data-key]')) e.preventDefault(); }); // keep focus in the amount box
pad.addEventListener('input', e => {
  if (e.target.id !== 'padIn' || e.target.classList.contains('text')) return;
  e.target.value = tidy(e.target.value);
  const go = pad.querySelector('#padGo'), v = amount(e.target.value);
  if (go) go.textContent = `${AMOUNT[ps.mode].verb}${v > 0 ? ' ' + fmt(v) : ''}`;
});
pad.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const inp = pad.querySelector('#padIn');
  const poke = v => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); };
  if (b.dataset.key) {
    const k = b.dataset.key, v = inp.value;
    const all = v && inp.selectionStart === 0 && inp.selectionEnd === v.length; // still selected: start fresh
    poke(k === 'back' ? (all ? '' : v.slice(0, -1)) : all ? k : k === '.' && v.includes('.') ? v : v + k);
  }
  else if (b.dataset.a === 'chip') poke(String((amount(inp.value) || 0) + +b.dataset.v));
  else if (b.dataset.a === 'padClose') closePad();
  else if (b.dataset.a === 'flowBack') { ps.data[FLOWS[ps.flow].steps[ps.step].k] = inp.value; ps.step--; renderPad(); }
  else if (b.dataset.a === 'flowSkip') { ps.data[FLOWS[ps.flow].steps[ps.step].k] = ''; nextStep(); }
  else if (b.dataset.a === 'sample') { useSample(); closePad(); }
  else if (b.dataset.a === 'lookAround') { pad.close(); ps = null; close(); }
});
pad.addEventListener('submit', e => {
  e.preventDefault();
  const inp = pad.querySelector('#padIn'), err = pad.querySelector('.err'), oops = m => { err.textContent = m; inp.focus(); };
  if (ps.kind === 'amount') return applyAmount(amount(inp.value), oops);
  const st = FLOWS[ps.flow].steps[ps.step], v = inp.value.trim();
  if (st.type === 'text' && !v) return oops('Give it any name you like.');
  if (st.type !== 'text' && !st.skip) {
    const n = amount(v);
    if (st.zero ? isNaN(n) : !(n > 0)) return oops(st.zero ? 'Type an amount. Zero is fine too.' : 'Try a number above zero.');
  }
  ps.data[st.k] = v;
  nextStep();
});
function nextStep() {
  const f = FLOWS[ps.flow];
  if (ps.step < f.steps.length - 1) { ps.step++; renderPad(); return; }
  finishFlow(ps.flow, ps.data);
}

function applyAmount(v, oops) {
  const c = find(ps.id), mode = ps.mode;
  if (AMOUNT[mode].zero ? isNaN(v) : !(v > 0)) return oops(AMOUNT[mode].zero ? 'Type an amount. Zero is fine too.' : 'Type an amount above zero, or use one of the quick amounts.');
  let msg;
  if (mode === 'monthly') { c.monthly = v; msg = v > 0 ? `Got it: ${fmt(v)} a month toward ${c.name}.` : `Cleared the monthly amount for ${c.name}.`; }
  else if (mode === 'set') {
    if (c.extra) S.extra = v; else if ('value' in c) c.value = v; else c.balance = v;
    msg = c.extra ? `Extra payment set to ${fmt(v)} a month.` : `Updated ${c.name} to ${fmt(v)}.`;
  }
  else if (mode === 'add') { c.amount += v; msg = c.amount >= c.target ? `You did it! ${c.name} is fully saved.` : `Added ${fmt(v)}. ${mythOf(c.id)} is ${pct(c)}% of the way there.`; }
  else if (mode === 'take') { const t = Math.min(v, c.amount); c.amount -= t; msg = t < v ? `You had ${fmt(t)} saved, so that's what came out.` : `Took out ${fmt(v)}. ${fmt(c.amount)} still saved.`; }
  else if (mode === 'spend') { c.amount += v; const left = c.target - c.amount; msg = `Logged ${fmt(v)}. ${left >= 0 ? fmt(left) + ' left this month.' : 'A little over this month. That happens.'}`; }
  else { c.amount = Math.max(0, c.amount - v); msg = `Took ${fmt(v)} off. ${fmt(Math.max(0, c.target - c.amount))} left this month.`; }
  padReturn = `${mode}-${ps.id}`;
  commit(msg); closePad();
  if (c.type === 'goal' && mode !== 'monthly') tell('stash:show', { id: c.id }); // so it's in view when the console closes
}

function finishFlow(flow, d) {
  const name = d.name.trim();
  let item, msg, to;
  if (flow === 'setup' || flow === 'goal') {
    item = { id: uid(), name, type: 'goal', target: amount(d.target), amount: amount(d.amount) || 0, monthly: 0 };
    S.cores.unshift(item); to = 'planets';
  } else if (flow === 'asset') { item = { id: uid(), name, value: amount(d.value) || 0 }; S.assets.push(item); to = 'have'; msg = `Added ${name}.`; }
  else if (flow === 'debt') { item = { id: uid(), name, balance: amount(d.balance), apr: amount(d.apr) || 0, min: amount(d.min) }; S.debts.push(item); to = 'owe'; msg = `Added ${name}. Your payoff plan is on the right.`; }
  else { item = { id: uid(), name, type: 'budget', target: amount(d.target), amount: 0 }; S.cores.push(item); to = 'limits'; msg = `Set a ${fmt(item.target)} monthly limit for ${name}.`; }
  commit(msg);
  if (item.type === 'goal') {
    msg = `Say hello to ${mythOf(item.id)}, your planet for ${name}.`;
    tell('stash:show', { id: item.id });
    if (flow === 'setup') { pad.close(); ps = null; close(); hello(`Meet ${mythOf(item.id)}, your planet for ${name}. Open the Console anytime to add money.`); return; }
    note(msg);
  }
  sec = to; padReturn = item.type === 'goal' ? `add-${item.id}` : `new-${flow}`;
  closePad();
}
function useSample() {
  const ship = S.ship;
  S = sample(); S.ship = ship; sec = 'home';
  commit('Example numbers filled in. You can start over anytime in Ship and pilot.');
  render('go-home');
}

// ---------- What the tablet's buttons do ----------
dlg.addEventListener('click', e => {
  if (e.target === dlg) { close(); return; } // a click on the dimmed world behind
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.go) { sec = b.dataset.go; armed = null; render('go-' + sec); return; }
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'close') close();
  else if (a === 'new') { padReturn = b.dataset.k; openFlow(b.dataset.what); }
  else if (a === 'amount') { padReturn = b.dataset.k; openAmount(b.dataset.mode, id); }
  else if (a === 'show') { close(); tell('stash:show', { id }); }
  else if (a === 'extra') { S.extra = Math.max(0, (+S.extra || 0) + +b.dataset.d); commit(); render(); }
  else if (a === 'reset') { const c = find(id); c.amount = 0; commit(`Fresh start! ${c.name} is back to ${fmt(c.target)}.`); render(); }
  else if (a === 'sample') useSample();
  else if (a === 'del' || a === 'wipe') {
    const key = a === 'wipe' ? 'wipe' : id;
    if (armed !== key) { armed = key; render(); setTimeout(() => { if (armed === key) { armed = null; if (dlg.open) render(); } }, 3000); return; }
    armed = null;
    if (a === 'wipe') { const since = S.ship.since; S = blank(); S.ship.since = since; commit('All cleared. A fresh start.'); render('sample'); }
    else { const x = find(id); ['assets', 'debts', 'cores'].forEach(k => { S[k] = S[k].filter(y => y.id !== id); }); commit(`Removed ${x.name}.`); render('go-' + sec); }
  }
});

// Editing a number or name in place saves it right away. Redraw a moment later, once focus has moved on.
panel.addEventListener('change', e => {
  const i = e.target, f = i.dataset.f;
  if (!f) return;
  if (f === 'ship-name') S.ship.name = i.value.trim();
  else if (f === 'ship-pilot') S.ship.pilot = i.value.trim();
  else if (f === 'ship-tow') S.ship.towPod = i.checked;
  else if (f === 'ship-calm') S.ship.calmSpace = i.checked;
  else if (f === 'ship-fighter') S.ship.fighterUnit = Math.max(1, Math.round(parseFloat(i.value) || 100));
  else {
    const v = Math.max(0, parseFloat(i.value) || 0);
    if (f === 'extra') S.extra = v; else { const x = find(i.dataset.id); if (x) x[f] = v; }
  }
  commit();
  setTimeout(() => render(), 0);
});

// The console never opens on its own (not on first visit, and never from anything the pilot does).
// It opens only from the Console button, the banner link, or a click on the dashboard screen.
