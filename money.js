// Money data and math, shared by the ship console and the space view.
// All data is saved in the browser (localStorage). Nothing is sent to a server.
export const KEY = 'stashtronauts-v1', OLD_KEY = 'vaultcore-v3';
export const NAMES_KEY = 'stashtronauts-planets-v1'; // which mythology name each goal has

export const uid = () => Math.random().toString(36).slice(2, 9);
export const blank = () => ({ extra: 0, assets: [], debts: [], cores: [], ship: {} }); // ship: { name, pilot, since }
export const sample = () => ({ extra: 100,
  assets: [{ id: uid(), name: 'Checking account', value: 4200 }, { id: uid(), name: 'Savings account', value: 12000 }, { id: uid(), name: 'Retirement (401k)', value: 38000 }],
  debts: [{ id: uid(), name: 'Student loan', balance: 18000, apr: 5.5, min: 220 }, { id: uid(), name: 'Credit card', balance: 3200, apr: 22.9, min: 90 }],
  cores: [{ id: uid(), name: 'New car', type: 'goal', target: 15000, amount: 1000, monthly: 400 }, { id: uid(), name: 'Groceries', type: 'budget', target: 600, amount: 180 }] });

// One-time move of data saved under the project's old name. The old copy is left in place as a backup.
export function load() {
  try {
    let s = localStorage.getItem(KEY);
    if (!s && (s = localStorage.getItem(OLD_KEY))) localStorage.setItem(KEY, s);
    if (s) return { ...blank(), ...JSON.parse(s) };
  } catch (e) {}
  return blank();
}
// Saving also tells the rest of the page (the 3D world) that something changed.
export function save(S) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  dispatchEvent(new CustomEvent('stash:change'));
}

export const isEmpty = S => !S.assets.length && !S.debts.length && !S.cores.length;
// The console lists newest first; planets are numbered oldest first.
export const goalsOf = S => S.cores.filter(c => c.type === 'goal').slice().reverse();
export const limitsOf = S => S.cores.filter(c => c.type === 'budget');

export const fmt = n => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString();
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const sum = (a, k) => a.reduce((t, x) => t + (+x[k] || 0), 0);
export const dateIn = m => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };
// Reads a typed amount like "$1,250.50" as a number. Returns NaN when nothing usable was typed.
export const amount = v => parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));

// Month-by-month payoff simulation. Each month: interest is added, every minimum is paid,
// then whatever is left of the budget goes to one debt at a time, chosen by the method.
// method 'av' = highest interest first, 'sn' = smallest balance first.
export function sim(S, extra, method) {
  const d = S.debts.map(x => ({ b: +x.balance, r: +x.apr || 0, m: +x.min })), budget = sum(S.debts, 'min') + extra;
  let n = 0, int = 0;
  while (d.some(x => x.b > .005) && n < 600) {
    n++;
    d.forEach(x => { if (x.b > 0) { const i = x.b * x.r / 1200; x.b += i; int += i; } });
    let left = budget;
    d.forEach(x => { if (x.b > 0) { const p = Math.min(x.b, x.m); x.b -= p; left -= p; } });
    const o = d.filter(x => x.b > .005).sort(method === 'av' ? (a, b) => b.r - a.r : (a, b) => a.b - b.b);
    for (const x of o) { if (left <= 0) break; const p = Math.min(x.b, left); x.b -= p; left -= p; }
  }
  return { n, int, ok: n < 600 };
}

// Every goal gets a fixed mythology name and a slot (the order it was made in). The name seeds its planet's look.
export const MYTH_NAMES = ['Elysium', 'Atlas', 'Calypso', 'Vesta', 'Hyperion', 'Selene', 'Juno', 'Aurora', 'Thalassa', 'Rhea',
  'Phoebe', 'Arcadia', 'Halcyon', 'Iris', 'Tethys', 'Zephyr', 'Theia', 'Echo', 'Gaia', 'Helios', 'Avalon', 'Nyx', 'Orpheus', 'Pandora'];
export function planetNames(goals) {
  let names = {};
  try { names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {}; } catch (e) {}
  let changed = false;
  for (const id of Object.keys(names)) if (!goals.some(g => g.id === id)) { delete names[id]; changed = true; } // goal was removed
  const taken = new Set(Object.values(names).map(n => n.myth)), slots = new Set(Object.values(names).map(n => n.slot));
  for (const g of goals) if (!names[g.id]) {
    let myth = MYTH_NAMES.find(n => !taken.has(n));
    for (let k = 2; !myth; k++) myth = MYTH_NAMES.map(n => `${n} ${k}`).find(n => !taken.has(n));
    let slot = 0; while (slots.has(slot)) slot++;
    names[g.id] = { myth, slot }; taken.add(myth); slots.add(slot); changed = true;
  }
  if (changed) try { localStorage.setItem(NAMES_KEY, JSON.stringify(names)); } catch (e) {}
  return names;
}

// ---------- What the ship shows ----------
// A goal counts as the emergency fund when its name says so, like "Emergency fund" or "Rainy-day fund".
export const isEmergencyFund = g => /emergenc|rainy|safety net|cushion|backup/i.test(g.name || '');
// A rough monthly cost of living, from spending limits and minimum debt payments.
// With nothing to go on, assume $2,000 a month so the shield still means something.
export function monthlyCosts(S) {
  const m = sum(limitsOf(S), 'target') + sum(S.debts, 'min');
  return m > 0 ? m : 2000;
}
// Everything the ship needs to know, in one small object.
export function shipMoney(S) {
  const goals = goalsOf(S), fund = goals.find(isEmergencyFund);
  return {
    totalSaved: sum(goals, 'amount'),
    goals: goals.map(g => ({ id: g.id, name: g.name, progress: Math.max(0, Math.min(1, (+g.amount || 0) / (+g.target || 1))) })),
    emergencyMonths: fund ? (+fund.amount || 0) / monthlyCosts(S) : 0,
    hasEmergencyFund: !!fund,
    debt: sum(S.debts, 'balance'),
    towPod: !!S.ship?.towPod,
  };
}
