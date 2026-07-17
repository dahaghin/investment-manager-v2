// ===== Transaction Ledger & Calculations =====
const J_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const LEDGER_TYPES = ['capital_deposit','capital_withdrawal','profit_payment','compound_profit','settlement','adjustment'];
const LEDGER_TYPE_LABELS = {
  capital_deposit: 'واریز سرمایه',
  capital_withdrawal: 'برداشت سرمایه',
  profit_payment: 'پرداخت سود',
  compound_profit: 'سود مرکب',
  settlement: 'تسویه',
  adjustment: 'اصلاحیه'
};
function transactionTypeLabel(type) { return LEDGER_TYPE_LABELS[type] || type; }

function isoNow() { return new Date().toISOString(); }
function normalizeCreatedAt(value) {
  if (!value) return isoNow();
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  return String(value);
}
function normalizeInvestorForDB(data, id) {
  return {
    id,
    ownerId: auth.currentUser.uid,
    fullName: data.fullName || data.name || '',
    phone: data.phone || '',
    monthlyInterestRate: Number(data.monthlyInterestRate ?? data.rate ?? 0),
    status: data.status || investorStatus({ ...data, id }),
    startDate: normalizeISODate(data.startDate),
    notes: data.notes || '',
    createdAt: normalizeCreatedAt(data.createdAt),
    updatedAt: isoNow()
  };
}
function normalizeTransactionForDB(tx) {
  const type = LEDGER_TYPES.includes(tx.type) ? tx.type : 'adjustment';
  return {
    id: tx.id,
    ownerId: auth.currentUser.uid,
    investorId: tx.investorId,
    type,
    amount: Math.round(Number(tx.amount) || 0),
    date: normalizeISODate(tx.date),
    description: tx.description || tx.note || '',
    createdAt: normalizeCreatedAt(tx.createdAt)
  };
}

function newTransaction(investorId, type, amount, date, description) {
  return normalizeTransactionForDB({
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    investorId,
    type,
    amount,
    date,
    description,
    createdAt: isoNow()
  });
}
function normalizeISODate(dateStr) { return dateStr ? String(dateStr).slice(0, 10) : todayGregorian(); }
function gregStrToJalali(dateStr) { if (!dateStr) return null; const p = normalizeISODate(dateStr).split('-'); return gregorianToJalali(+p[0], +p[1], +p[2]); }
function jalaliObjToGreg(jy, jm, jd) { return jalaliToGregorian(jy, jm, jd); }
function jCmp(a, b) { if (a.y !== b.y) return a.y < b.y ? -1 : 1; if (a.m !== b.m) return a.m < b.m ? -1 : 1; if (a.d !== b.d) return a.d < b.d ? -1 : 1; return 0; }
function jAddMonths(jDate, n) { let m = jDate.m - 1 + n; let y = jDate.y + Math.floor(m / 12); m = ((m % 12) + 12) % 12; return { y, m: m + 1, d: Math.min(jDate.d, jdpMonthLen(y, m + 1)) }; }
function jToday() { const n = new Date(); return gregorianToJalali(n.getUTCFullYear(), n.getUTCMonth()+1, n.getUTCDate()); }

function getInvestorTransactions(inv) {
  const tx = Array.isArray(inv.transactions) ? inv.transactions : [];
  const hasInitial = tx.some(t => t.type === 'capital_deposit');
  const legacy = [];
  if (!hasInitial && inv.capital) legacy.push(newTransaction(inv.id, 'capital_deposit', inv.capital, normalizeISODate(inv.startDate), 'سرمایه اولیه'));
  (inv.payments || []).forEach(p => {
    if (!tx.some(t => t.id === p.id || (t.type === 'profit_payment' && t.date === p.date && Number(t.amount) === Number(p.amount)))) {
      legacy.push({ id: p.id || `${p.date}-${p.amount}`, investorId: inv.id, type: 'profit_payment', amount: Number(p.amount), date: normalizeISODate(p.date), description: p.note || 'پرداخت سود', createdAt: p.createdAt || normalizeISODate(p.date) });
    }
  });
  return [...tx, ...legacy].map(t => ({ ...t, date: normalizeISODate(t.date), amount: Number(t.amount) || 0 })).sort((a,b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
function isSettled(inv) { return getInvestorTransactions(inv).some(t => t.type === 'settlement'); }
function ledgerCapitalBefore(inv, date) {
  return getInvestorTransactions(inv).filter(t => t.date <= date).reduce((s,t) => {
    if (t.type === 'capital_deposit' || t.type === 'adjustment') return s + Number(t.amount);
    if (t.type === 'capital_withdrawal' || t.type === 'settlement') return Math.max(0, s - Number(t.amount));
    return s;
  }, 0);
}
function totalPaid(inv) { return getInvestorTransactions(inv).filter(t => t.type === 'profit_payment').reduce((s,t) => s + Number(t.amount), 0); }
function capitalWithdrawn(inv) { return getInvestorTransactions(inv).filter(t => t.type === 'capital_withdrawal' || t.type === 'settlement').reduce((s,t) => s + Number(t.amount), 0); }
function activeCapital(inv) { return Math.max(0, ledgerCapitalBefore(inv, todayGregorian())); }

function buildProfitSchedule(inv, untilJ) {
  if (!inv.startDate || isSettled(inv)) return [];
  const startJ = gregStrToJalali(inv.startDate);
  const todayJ = untilJ || jToday();
  const rate = Number(inv.monthlyInterestRate ?? inv.rate) / 100;
  const tx = getInvestorTransactions(inv);
  let capital = ledgerCapitalBefore(inv, inv.startDate);
  let unpaidProfit = 0;
  const rows = [];
  let cur = jAddMonths(startJ, 1);
  let prevGreg = normalizeISODate(inv.startDate);
  while (jCmp(cur, todayJ) <= 0) {
    const curGreg = jalaliObjToGreg(cur.y, cur.m, cur.d);
    for (const t of tx.filter(t => t.date > prevGreg && t.date <= curGreg)) {
      if (t.type === 'capital_deposit' || t.type === 'adjustment') capital += Number(t.amount);
      if (t.type === 'capital_withdrawal') capital = Math.max(0, capital - Number(t.amount));
      if (t.type === 'profit_payment') unpaidProfit = Math.max(0, unpaidProfit - Number(t.amount));
      if (t.type === 'compound_profit') unpaidProfit += Number(t.amount);
      if (t.type === 'settlement') return rows;
    }
    const basis = capital + unpaidProfit;
    const profit = basis * rate;
    unpaidProfit += profit;
    rows.push({ jDate:{...cur}, label:`سود ${J_MONTHS[cur.m - 1]} ${toFarsi(cur.y)}`, amount:profit, gregDate:curGreg, balanceAfter:capital + unpaidProfit, capital, unpaidProfit });
    prevGreg = curGreg;
    cur = jAddMonths(cur, 1);
  }
  return rows;
}
function currentBalance(inv) { const s = buildProfitSchedule(inv); return s.length ? s[s.length - 1].balanceAfter : activeCapital(inv); }
function monthlyProfit(inv) { return isSettled(inv) ? 0 : currentBalance(inv) * (Number(inv.monthlyInterestRate ?? inv.rate) / 100); }
function totalProfit(inv) { return buildProfitSchedule(inv).reduce((s, r) => s + r.amount, 0); }
function unpaid(inv) { return Math.max(0, totalProfit(inv) - totalPaid(inv)); }
function nextProfitDate(inv) { if (isSettled(inv) || !inv.startDate) return ''; const s = buildProfitSchedule(inv); const base = s.length ? gregStrToJalali(s[s.length - 1].gregDate) : gregStrToJalali(inv.startDate); return jalaliObjToGreg(...Object.values(jAddMonths(base, 1))); }
function investorStatus(inv) { if (isSettled(inv) || activeCapital(inv) <= 0) return 'Settled'; const due = unpaid(inv); if (due <= 0) return 'Active'; const next = nextProfitDate(inv); if (next && next < todayGregorian()) return 'Overdue'; return 'Pending Payment'; }

function allocatePayment(inv, amount, date, note, mode = 'smart') {
  const rest0 = Math.round(Number(amount) || 0);
  const txs = [];
  if (rest0 <= 0) return txs;

  const description = note || (mode === 'profit' ? 'پرداخت سود' : mode === 'principal' ? 'برداشت اصل سرمایه' : 'پرداخت هوشمند');
  if (mode === 'profit') return [newTransaction(inv.id, 'profit_payment', rest0, date, description)];
  if (mode === 'principal') return [newTransaction(inv.id, 'capital_withdrawal', rest0, date, description)];

  const remainingProfit = Math.round(unpaid(inv));
  let rest = rest0;
  const profitPart = Math.min(rest, remainingProfit);
  if (profitPart > 0) {
    txs.push(newTransaction(inv.id, 'profit_payment', profitPart, date, note || 'پرداخت سود - تخصیص هوشمند'));
    rest -= profitPart;
  }
  if (rest > 0) {
    txs.push(newTransaction(inv.id, 'capital_withdrawal', rest, date, note ? `${note} - برداشت اصل سرمایه` : 'برداشت اصل سرمایه - تخصیص هوشمند'));
  }
  return txs;
}
