// ===== My Investments (Beta 3) =====
// Personal assets are deliberately stored separately from investor liabilities.
// Amounts are never summed across currencies.
let myInvestments = [];
let myInvestmentEntries = [];
let editingMyInvestmentId = null;
let activeMyInvestmentId = null;

const PERSONAL_CURRENCIES = Object.freeze({
  USD: { label: 'دلار آمریکا', symbol: '$' },
  AED: { label: 'درهم امارات', symbol: 'د.إ' }
});

function personalMoney(amount, currency) {
  const value = Number(amount || 0);
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  return currency === 'USD' ? '$' + formatted : formatted + ' د.إ';
}
function personalCurrencyTotals() {
  return ['USD', 'AED'].reduce((out, currency) => {
    const items = myInvestments.filter(i => i.currency === currency && i.status !== 'closed');
    const entries = myInvestmentEntries.filter(e => items.some(i => i.id === e.investmentId));
    out[currency] = {
      principal: items.reduce((s, i) => s + Math.max(0, Number(i.principal || 0) - entries.filter(e => e.investmentId === i.id).reduce((a, e) => a + Number(e.capitalReturned || 0), 0)), 0),
      earned: entries.reduce((s, e) => s + Number(e.profitAmount || 0), 0),
      received: entries.reduce((s, e) => s + Number(e.receivedAmount || 0), 0),
      outstanding: entries.reduce((s, e) => s + Math.max(0, Number(e.profitAmount || 0) - Number(e.receivedAmount || 0)), 0),
      count: items.length
    };
    return out;
  }, {});
}
async function loadMyInvestments() {
  if (!auth.currentUser) return;
  const [invSnap, entrySnap] = await Promise.all([
    db.collection('personalInvestments').where('ownerId', '==', auth.currentUser.uid).get(),
    db.collection('personalInvestmentEntries').where('ownerId', '==', auth.currentUser.uid).get()
  ]);
  myInvestments = invSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  myInvestmentEntries = entrySnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => String(b.month || '').localeCompare(String(a.month || '')));
  if (document.getElementById('tab-my-investments')?.classList.contains('active')) renderMyInvestments();
  if (document.getElementById('tab-dashboard')?.classList.contains('active')) renderManagementDashboard();
}
function openMyInvestmentModal(id) {
  editingMyInvestmentId = id || null;
  const item = id ? myInvestments.find(x => x.id === id) : null;
  document.getElementById('myInvTitle').textContent = item ? 'ویرایش سرمایه‌گذاری' : 'ثبت سرمایه‌گذاری جدید';
  document.getElementById('myInvName').value = item?.name || '';
  document.getElementById('myInvParty').value = item?.counterparty || '';
  document.getElementById('myInvCurrency').value = item?.currency || 'USD';
  document.getElementById('myInvPrincipal').value = item?.principal ?? '';
  document.getElementById('myInvStart').value = item?.startDate || new Date().toISOString().slice(0,10);
  document.getElementById('myInvMaturity').value = item?.maturityDate || '';
  document.getElementById('myInvRate').value = item?.expectedRate ?? '';
  document.getElementById('myInvNotes').value = item?.notes || '';
  document.getElementById('myInvModal').classList.add('show');
}
async function saveMyInvestment() {
  const name = document.getElementById('myInvName').value.trim();
  const counterparty = document.getElementById('myInvParty').value.trim();
  const currency = document.getElementById('myInvCurrency').value;
  const principal = Number(document.getElementById('myInvPrincipal').value);
  const startDate = document.getElementById('myInvStart').value;
  const maturityDate = document.getElementById('myInvMaturity').value;
  const expectedRate = Number(document.getElementById('myInvRate').value || 0);
  const notes = document.getElementById('myInvNotes').value.trim();
  if (!name || !(principal > 0) || !startDate || !['USD','AED'].includes(currency)) {
    toast('نام، مبلغ، ارز و تاریخ شروع را درست وارد کنید', true); return;
  }
  const payload = { ownerId: auth.currentUser.uid, name, counterparty, currency, principal, startDate, maturityDate, expectedRate, notes, status: 'active', updatedAt: new Date().toISOString() };
  try {
    if (editingMyInvestmentId) {
      const old = myInvestments.find(x => x.id === editingMyInvestmentId);
      await db.collection('personalInvestments').doc(editingMyInvestmentId).set({ ...payload, createdAt: old.createdAt || payload.updatedAt }, { merge: true });
    } else {
      payload.createdAt = new Date().toISOString();
      await db.collection('personalInvestments').add(payload);
    }
    closeModal('myInvModal');
    await loadMyInvestments();
    toast('سرمایه‌گذاری ذخیره شد');
  } catch (e) { toast('خطا در ذخیره: ' + e.message, true); }
}
function openMyInvestmentEntryModal(id) {
  activeMyInvestmentId = id;
  const item = myInvestments.find(x => x.id === id);
  document.getElementById('myEntryTitle').textContent = 'ثبت عملکرد ماهانه — ' + (item?.name || '');
  document.getElementById('myEntryMonth').value = new Date().toISOString().slice(0,7);
  document.getElementById('myEntryProfit').value = '';
  document.getElementById('myEntryReceived').value = '';
  document.getElementById('myEntryCapital').value = '';
  document.getElementById('myEntryNotes').value = '';
  document.getElementById('myEntryModal').classList.add('show');
}
async function saveMyInvestmentEntry() {
  const item = myInvestments.find(x => x.id === activeMyInvestmentId);
  if (!item) return;
  const month = document.getElementById('myEntryMonth').value;
  const profitAmount = Number(document.getElementById('myEntryProfit').value || 0);
  const receivedAmount = Number(document.getElementById('myEntryReceived').value || 0);
  const capitalReturned = Number(document.getElementById('myEntryCapital').value || 0);
  const notes = document.getElementById('myEntryNotes').value.trim();
  if (!month || profitAmount < 0 || receivedAmount < 0 || capitalReturned < 0 || (!profitAmount && !receivedAmount && !capitalReturned)) {
    toast('ماه و حداقل یکی از مبالغ را وارد کنید', true); return;
  }
  const existing = myInvestmentEntries.find(e => e.investmentId === item.id && e.month === month);
  const payload = { ownerId: auth.currentUser.uid, investmentId: item.id, currency: item.currency, month, profitAmount, receivedAmount, capitalReturned, notes, updatedAt: new Date().toISOString() };
  try {
    if (existing) {
      await db.collection('personalInvestmentEntries').doc(existing.id).set(payload, { merge: true });
    } else {
      payload.createdAt = new Date().toISOString();
      await db.collection('personalInvestmentEntries').add(payload);
    }
    closeModal('myEntryModal');
    await loadMyInvestments();
    toast('عملکرد ماهانه ثبت شد');
  } catch (e) { toast('خطا در ثبت عملکرد: ' + e.message, true); }
}
async function deleteMyInvestment(id) {
  const item = myInvestments.find(x => x.id === id);
  if (!item || !confirm('این سرمایه‌گذاری و سوابق ماهانه آن حذف شود؟')) return;
  try {
    const entries = myInvestmentEntries.filter(e => e.investmentId === id);
    const batch = db.batch();
    entries.forEach(e => batch.delete(db.collection('personalInvestmentEntries').doc(e.id)));
    batch.delete(db.collection('personalInvestments').doc(id));
    await batch.commit();
    await loadMyInvestments();
    toast('سرمایه‌گذاری حذف شد');
  } catch (e) { toast('خطا در حذف: ' + e.message, true); }
}
function renderMyInvestmentDashboardSummary() {
  const totals = personalCurrencyTotals();
  return `<div class="dash-panel wide personal-investment-summary">
    <div class="dashboard-toolbar"><div><div class="chart-title">سرمایه‌گذاری‌های شخصی من</div><div class="dash-subtitle">مطالبات و بازده ثبت‌شده؛ بدون مخلوط‌کردن ارزها</div></div><button class="btn btn-gold" onclick="switchTab('my-investments')">مشاهده جزئیات ←</button></div>
    <div class="currency-summary-grid">${['USD','AED'].map(c => `<div class="currency-summary"><b>${PERSONAL_CURRENCIES[c].label}</b><strong>${personalMoney(totals[c].principal,c)}</strong><span>اصل سرمایه فعال</span><small>سود ثبت‌شده: ${personalMoney(totals[c].earned,c)} · دریافت‌شده: ${personalMoney(totals[c].received,c)}</small><small>سود دریافت‌نشده: ${personalMoney(totals[c].outstanding,c)}</small></div>`).join('')}</div>
  </div>`;
}
function renderMyInvestments() {
  const el = document.getElementById('myInvestmentsContent');
  if (!el) return;
  const totals = personalCurrencyTotals();
  const cards = ['USD','AED'].map(c => `<div class="dash-kpi ${c==='USD'?'green':'blue'}"><div class="ic-label">سرمایه فعال — ${PERSONAL_CURRENCIES[c].label}</div><div class="ic-val">${personalMoney(totals[c].principal,c)}</div><div class="ic-sub">${toFarsi(totals[c].count)} سرمایه‌گذاری فعال</div></div><div class="dash-kpi purple"><div class="ic-label">سود دریافت‌نشده — ${c}</div><div class="ic-val">${personalMoney(totals[c].outstanding,c)}</div><div class="ic-sub">سود ثبت‌شده منهای دریافتی</div></div>`).join('');
  const rows = myInvestments.map(i => {
    const entries = myInvestmentEntries.filter(e => e.investmentId === i.id);
    const returned = entries.reduce((s,e)=>s+Number(e.capitalReturned||0),0);
    const remaining = Math.max(0,Number(i.principal||0)-returned);
    const earned = entries.reduce((s,e)=>s+Number(e.profitAmount||0),0);
    const received = entries.reduce((s,e)=>s+Number(e.receivedAmount||0),0);
    const outstanding = entries.reduce((s,e)=>s+Math.max(0,Number(e.profitAmount||0)-Number(e.receivedAmount||0)),0);
    return `<article class="personal-investment-card"><div class="personal-investment-head"><div><h3>${escapeHTML(i.name)}</h3><p>${escapeHTML(i.counterparty||'طرف حساب ثبت نشده')} · ${PERSONAL_CURRENCIES[i.currency]?.label || i.currency}</p></div><span class="investment-status">${i.status==='closed'?'بسته':'فعال'}</span></div>
      <div class="personal-investment-metrics"><div><small>اصل اولیه</small><b>${personalMoney(i.principal,i.currency)}</b></div><div><small>اصل باقی‌مانده</small><b>${personalMoney(remaining,i.currency)}</b></div><div><small>سود واقعی ثبت‌شده</small><b>${personalMoney(earned,i.currency)}</b></div><div><small>سود دریافت‌شده</small><b>${personalMoney(received,i.currency)}</b></div><div><small>سود طلبکارانه</small><b>${personalMoney(outstanding,i.currency)}</b></div><div><small>سررسید</small><b>${i.maturityDate ? milToJalali(i.maturityDate) : '—'}</b></div></div>
      <div class="personal-investment-actions"><button class="btn btn-success btn-sm" onclick="openMyInvestmentEntryModal('${i.id}')">+ ثبت عملکرد ماهانه</button><button class="btn btn-secondary btn-sm" onclick="openMyInvestmentModal('${i.id}')">ویرایش</button><button class="btn btn-danger btn-sm" onclick="deleteMyInvestment('${i.id}')">حذف</button></div>
      <details class="investment-history"><summary>تاریخچه ماهانه (${toFarsi(entries.length)})</summary><div class="table-wrap"><table><thead><tr><th>ماه</th><th>سود ایجادشده</th><th>سود دریافتی</th><th>اصل برگشتی</th><th>یادداشت</th></tr></thead><tbody>${entries.length ? entries.map(e=>`<tr><td>${escapeHTML(e.month)}</td><td>${personalMoney(e.profitAmount,i.currency)}</td><td>${personalMoney(e.receivedAmount,i.currency)}</td><td>${personalMoney(e.capitalReturned,i.currency)}</td><td>${escapeHTML(e.notes||'—')}</td></tr>`).join('') : '<tr><td colspan="5">هنوز عملکردی ثبت نشده است</td></tr>'}</tbody></table></div></details>
    </article>`;
  }).join('');
  el.innerHTML = `<div class="dashboard-toolbar"><div><div class="report-title">سرمایه‌گذاری‌های شخصی من</div><div class="dash-subtitle">ثبت سرمایه، سود متغیر ماهانه و اصل سرمایه برگشتی</div></div><button class="btn btn-gold" onclick="openMyInvestmentModal()">+ سرمایه‌گذاری جدید</button></div>
    <div class="dash-kpis personal-investment-kpis">${cards}</div>
    <div class="currency-summary-grid">${['USD','AED'].map(c=>`<div class="currency-summary"><b>خلاصه ${c}</b><strong>${personalMoney(totals[c].earned,c)}</strong><span>سود کل ثبت‌شده</span><small>دریافت‌شده: ${personalMoney(totals[c].received,c)}</small><small>مطالبه باز: ${personalMoney(totals[c].outstanding,c)}</small></div>`).join('')}</div>
    <div class="personal-investment-list">${rows || '<div class="empty-state"><div class="ei">💼</div><p>هنوز سرمایه‌گذاری شخصی ثبت نکرده‌ای</p><button class="btn btn-gold" onclick="openMyInvestmentModal()">ثبت اولین سرمایه‌گذاری</button></div>'}</div>`;
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
