// ===== Dollar Performance Dashboard (Beta 4) =====
// Tracks Toman portfolio value against the Iranian free-market USD rate.
// All stored dates use Gregorian ISO for reliable sorting; all user-facing dates are Jalali.
const DOLLAR_MARKET_LATEST_URL = 'https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/popular.json';
const DOLLAR_MARKET_HISTORY_URL = 'https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/history/USD_IRR_FREE.json';
let dollarPerfTransactions = [];
let dollarPerfSnapshots = [];
let dollarPerfMarket = null;
let dollarPerfHistory = null;
let dollarPerfBusy = false;

function dollarPerfMoney(value, currency = 'IRR') {
  const n = Number(value || 0);
  if (currency === 'USD') return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' تومان';
}
function dollarPerfRate(value) {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0))) + ' تومان';
}
function dollarPerfTodayISO() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = key => parts.find(p => p.type === key)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
}
function dollarPerfTodayJalali() { return dollarPerfISOToJalali(dollarPerfTodayISO()); }
function dollarPerfDateToISO(value) {
  if (!value) return '';
  // Accept the same Jalali date format used by the shared investor calendar,
  // plus Gregorian dates returned by stored records and ISO timestamps.
  const raw = String(value).trim().slice(0, 10)
    .replace(/[۰-۹]/g, ch => '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch))
    .replace(/[٠-٩]/g, ch => '٠١٢٣٤٥٦٧٨٩'.indexOf(ch))
    .replace(/[.]/g, '/');
  const m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]), day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return '';
  if (y >= 1700) {
    const date = new Date(Date.UTC(y, mo - 1, day));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === day
      ? String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      : '';
  }
  if (y < 1200) return '';
  // Use the exact same Jalali -> Gregorian conversion as investor forms.
  const iso = jalaliInputToGregorian(String(y) + '/' + String(mo) + '/' + String(day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const parts = iso.split('-').map(Number);
  const roundTrip = gregorianToJalali(parts[0], parts[1], parts[2]);
  return roundTrip.y === y && roundTrip.m === mo && roundTrip.d === day ? iso : '';
}
function dollarPerfISOToJalali(value) {
  if (!value) return '—';
  const iso = dollarPerfDateToISO(value);
  if (!iso) return String(value);
  const parts = iso.split('-').map(Number);
  const j = gregorianToJalali(parts[0], parts[1], parts[2]);
  return String(j.y) + '/' + String(j.m).padStart(2, '0') + '/' + String(j.d).padStart(2, '0');
}
function dollarPerfSafe(value) { return typeof escapeHTML === 'function' ? escapeHTML(value) : String(value || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function dollarPerfFetchJson(urls, cache = 'no-store') {
  let lastError = null;
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(url, { cache, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (e) { lastError = e; }
  }
  throw new Error('اتصال به منبع نرخ دلار برقرار نشد: ' + (lastError?.message || 'unknown'));
}
async function dollarPerfFetchMarket() {
  const payload = await dollarPerfFetchJson([
    DOLLAR_MARKET_LATEST_URL,
    'https://cdn.jsdelivr.net/gh/iran-market/iran-market.github.io@main/data/popular.json',
    'https://iran-market.github.io/data/popular.json'
  ]);
  const item = (payload.data || []).find(x => x.symbol === 'USD_IRR_FREE');
  if (!item || !Number(item.price) || item.currency !== 'IRT') throw new Error('ساختار نرخ دلار معتبر نیست');
  dollarPerfMarket = {
    rate: Number(item.price),
    timestamp: item.timestamp || '',
    timestampTehran: item.timestamp_tehran || '',
    timestampJalali: item.timestamp_jalali || '',
    source: item.source || 'Iran Market Data',
    stale: !!item.stale,
    publishedAt: payload.meta?.published_at || ''
  };
  return dollarPerfMarket;
}
async function dollarPerfLoadHistory() {
  if (dollarPerfHistory) return dollarPerfHistory;
  const payload = await dollarPerfFetchJson([
    DOLLAR_MARKET_HISTORY_URL,
    'https://cdn.jsdelivr.net/gh/iran-market/iran-market.github.io@main/data/history/USD_IRR_FREE.json',
    'https://iran-market.github.io/data/history/USD_IRR_FREE.json'
  ], 'force-cache');
  dollarPerfHistory = Array.isArray(payload.data) ? payload.data : [];
  return dollarPerfHistory;
}
async function dollarPerfRateForDate(isoDate, manualRate) {
  if (Number(manualRate) > 0) return { rate: Number(manualRate), source: 'manual', manual: true };
  if (isoDate === dollarPerfTodayISO() && dollarPerfMarket && !dollarPerfMarket.stale) {
    const todaySnapshot = dollarPerfSnapshots.find(s => s.kind === 'rate' && s.date === isoDate);
    if (todaySnapshot?.manualRate && Number(todaySnapshot.effectiveRate) > 0) {
      return { rate: Number(todaySnapshot.effectiveRate), source: 'manual override', manual: true };
    }
    return { rate: dollarPerfMarket.rate, source: dollarPerfMarket.source, manual: false };
  }
  const history = await dollarPerfLoadHistory();
  const wanted = dollarPerfISOToJalali(isoDate);
  const exact = history.find(x => x.date_jalali === wanted);
  const selected = exact || [...history].reverse().find(x => String(x.date_jalali || '') < wanted);
  if (!selected || !(Number(selected.close) > 0)) throw new Error('برای این تاریخ نرخ تاریخی پیدا نشد؛ نرخ همان روز را دستی وارد کن');
  return { rate: Number(selected.close), source: 'TGJU daily close', manual: false, rateDate: selected.date_jalali };
}
async function dollarPerfLoadRecords() {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const [txSnap, snapSnap] = await Promise.all([
    db.collection('dollarPerformanceTransactions').where('ownerId', '==', uid).get(),
    db.collection('dollarPerformanceSnapshots').where('ownerId', '==', uid).get()
  ]);
  dollarPerfTransactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')));
  dollarPerfSnapshots = snapSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')));
}
async function dollarPerfCaptureDailyRate() {
  try {
    const market = await dollarPerfFetchMarket();
    if (market.stale) return;
    const date = dollarPerfTodayISO();
    const ref = db.collection('dollarPerformanceSnapshots').doc('rate-' + date);
    const existing = await ref.get();
    if (!existing.exists) {
      await ref.set({
        ownerId: auth.currentUser.uid,
        kind: 'rate',
        date,
        jalaliDate: dollarPerfTodayJalali(),
        apiRate: market.rate,
        effectiveRate: market.rate,
        source: market.source,
        marketTimestamp: market.timestamp,
        capturedAt: new Date().toISOString(),
        stale: false
      });
    }
  } catch (e) {
    console.warn('Daily USD rate capture failed:', e);
  }
}
async function loadDollarPerformance() {
  if (!auth.currentUser || dollarPerfBusy) return;
  dollarPerfBusy = true;
  const el = document.getElementById('dollarPerformanceContent');
  if (el) el.innerHTML = '<div class="dp-loading">در حال دریافت نرخ دلار آزاد و اطلاعات سرمایه…</div>';
  try {
    let marketError = null;
    try {
      await dollarPerfFetchMarket();
      await dollarPerfCaptureDailyRate();
    } catch (e) {
      marketError = e;
      console.warn('USD market feed unavailable; showing saved data:', e);
    }
    await dollarPerfLoadRecords();
    renderDollarPerformance();
    if (typeof loadInvestorDollarPerformance === 'function') await loadInvestorDollarPerformance(typeof selectedId !== 'undefined' ? selectedId : null);
    if (marketError && el) {
      el.insertAdjacentHTML('afterbegin', '<div class="dp-error">دریافت نرخ زنده ممکن نشد؛ اطلاعات ذخیره‌شده نمایش داده شده است. برای ادامه می‌توانی نرخ امروز را دستی وارد کنی. (' + dollarPerfSafe(marketError.message) + ')</div>');
    }
  } catch (e) {
    if (el) el.innerHTML = '<div class="dp-error">دریافت اطلاعات با خطا مواجه شد: ' + dollarPerfSafe(e.message) + '<button class="btn btn-secondary" onclick="loadDollarPerformance()">تلاش دوباره</button></div>';
  } finally {
    dollarPerfBusy = false;
  }
}

function openDollarFlowModal() {
  document.getElementById('dpFlowType').value = 'deposit';
  document.getElementById('dpFlowAmount').value = '';
  document.getElementById('dpFlowDate').value = dollarPerfTodayJalali();
  document.getElementById('dpFlowRate').value = '';
  document.getElementById('dpFlowNote').value = '';
  document.getElementById('dpFlowModal').classList.add('show');
}
function openDollarValuationModal() {
  document.getElementById('dpValAmount').value = '';
  document.getElementById('dpValDate').value = dollarPerfTodayJalali();
  document.getElementById('dpValRate').value = '';
  document.getElementById('dpValNote').value = '';
  document.getElementById('dpValModal').classList.add('show');
}
async function saveDollarFlow() {
  const dateJ = document.getElementById('dpFlowDate').value;
  const date = dollarPerfDateToISO(dateJ);
  const type = document.getElementById('dpFlowType').value;
  const amount = Number(document.getElementById('dpFlowAmount').value);
  const manualRate = Number(document.getElementById('dpFlowRate').value || 0);
  if (!date || !['deposit','withdrawal'].includes(type) || !(amount > 0)) { toast('نوع تراکنش، تاریخ و مبلغ را بررسی کن', true); return; }
  try {
    const fx = await dollarPerfRateForDate(date, manualRate);
    await db.collection('dollarPerformanceTransactions').add({
      ownerId: auth.currentUser.uid, type, amountToman: amount, date, jalaliDate: dateJ,
      fxRateToman: fx.rate, fxSource: fx.source, manualRate: fx.manual,
      note: document.getElementById('dpFlowNote').value.trim(),
      createdAt: new Date().toISOString()
    });
    closeModal('dpFlowModal');
    await dollarPerfLoadRecords();
    renderDollarPerformance();
    toast('تراکنش سرمایه ثبت شد');
  } catch (e) { toast(e.message || 'ثبت تراکنش انجام نشد', true); }
}
async function saveDollarValuation() {
  const dateJ = document.getElementById('dpValDate').value;
  const date = dollarPerfDateToISO(dateJ);
  const amount = Number(document.getElementById('dpValAmount').value);
  const manualRate = Number(document.getElementById('dpValRate').value || 0);
  if (!date || !(amount >= 0)) { toast('تاریخ و ارزش سرمایه را بررسی کن', true); return; }
  try {
    const fx = await dollarPerfRateForDate(date, manualRate);
    const ref = db.collection('dollarPerformanceSnapshots').doc('value-' + date);
    await ref.set({
      ownerId: auth.currentUser.uid, kind: 'valuation', date, jalaliDate: dateJ,
      valueToman: amount, fxRateToman: fx.rate, fxSource: fx.source,
      manualRate: fx.manual, note: document.getElementById('dpValNote').value.trim(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    closeModal('dpValModal');
    await dollarPerfLoadRecords();
    renderDollarPerformance();
    toast('ارزش سرمایه ثبت شد');
  } catch (e) { toast(e.message || 'ثبت ارزش سرمایه انجام نشد', true); }
}
async function saveDollarManualRate() {
  const rate = Number(document.getElementById('dpManualRate').value);
  if (!(rate > 0)) { toast('نرخ معتبر وارد کن', true); return; }
  const date = dollarPerfTodayISO();
  const market = dollarPerfMarket || {};
  await db.collection('dollarPerformanceSnapshots').doc('rate-' + date).set({
    ownerId: auth.currentUser.uid, kind: 'rate', date, jalaliDate: dollarPerfTodayJalali(),
    apiRate: market.rate || null, effectiveRate: rate, manualRate: true,
    source: market.source || 'Iran Market Data', capturedAt: new Date().toISOString()
  }, { merge: true });
  closeModal('dpRateModal');
  await dollarPerfLoadRecords();
  renderDollarPerformance();
  toast('نرخ دستی امروز ذخیره شد');
}
function dollarPerfGetEffectiveRate(snapshot) {
  return Number(snapshot?.effectiveRate || snapshot?.fxRateToman || snapshot?.apiRate || 0);
}
function dollarPerfGetValuation(date, inclusive = true) {
  return [...dollarPerfSnapshots].filter(s => s.kind === 'valuation' && (inclusive ? s.date <= date : s.date < date) && Number(s.valueToman) >= 0 && Number(s.fxRateToman) > 0).sort((a,b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}
function dollarPerfFlowsBetween(from, to) {
  return dollarPerfTransactions.filter(t => t.date > from && t.date <= to && Number(t.fxRateToman) > 0);
}
function dollarPerfCompute(from, to) {
  const start = dollarPerfGetValuation(from, true);
  const end = dollarPerfGetValuation(to, true);
  const startToman = start ? Number(start.valueToman) : 0;
  const endToman = end ? Number(end.valueToman) : 0;
  const startUSD = start ? startToman / Number(start.fxRateToman) : 0;
  const endUSD = end ? endToman / Number(end.fxRateToman) : 0;
  const flows = dollarPerfFlowsBetween(start?.date || '0000-00-00', end?.date || to);
  const depositsUSD = flows.filter(x => x.type === 'deposit').reduce((s,x) => s + Number(x.amountToman) / Number(x.fxRateToman), 0);
  const withdrawalsUSD = flows.filter(x => x.type === 'withdrawal').reduce((s,x) => s + Number(x.amountToman) / Number(x.fxRateToman), 0);
  const depositsToman = flows.filter(x => x.type === 'deposit').reduce((s,x) => s + Number(x.amountToman), 0);
  const withdrawalsToman = flows.filter(x => x.type === 'withdrawal').reduce((s,x) => s + Number(x.amountToman), 0);
  const hasEnd = !!end;
  const profitUSD = hasEnd ? endUSD - startUSD - depositsUSD + withdrawalsUSD : 0;
  const profitToman = hasEnd ? endToman - startToman - depositsToman + withdrawalsToman : 0;
  const basisUSD = startUSD + depositsUSD;
  const basisToman = startToman + depositsToman;
  return { start, end, hasEnd, startToman, endToman, startUSD, endUSD, depositsUSD, withdrawalsUSD, depositsToman, withdrawalsToman, profitUSD, profitToman, basisUSD, basisToman, percentUSD: basisUSD ? profitUSD / basisUSD * 100 : 0, percentToman: basisToman ? profitToman / basisToman * 100 : 0 };
}
function dollarPerfSparkline() {
  const values = dollarPerfSnapshots.filter(s => s.kind === 'valuation' && Number(s.fxRateToman) > 0).slice(-12);
  if (values.length < 2) return '<div class="dp-chart-empty">برای رسم روند، حداقل دو ثبت ارزش سرمایه لازم است.</div>';
  const points = values.map((s,i) => ({ x: 12 + i * (276 / (values.length - 1)), y: 98 - Math.max(0, Math.min(1, (s.valueToman / s.fxRateToman) / Math.max(...values.map(v => v.valueToman / v.fxRateToman)) || 0)) * 76 }));
  const poly = points.map(p => p.x + ',' + p.y).join(' ');
  return '<svg viewBox="0 0 300 112" role="img" aria-label="روند ارزش دلاری سرمایه"><defs><linearGradient id="dpFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity=".28"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/></linearGradient></defs><polygon points="12,108 ' + poly + ' 288,108" fill="url(#dpFill)"/><polyline points="' + poly + '" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + points.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="#38bdf8"/>').join('') + '</svg><div class="dp-chart-labels"><span>' + dollarPerfISOToJalali(values[0].date) + '</span><span>' + dollarPerfISOToJalali(values[values.length-1].date) + '</span></div>';
}
function renderDollarPerformance() {
  const el = document.getElementById('dollarPerformanceContent');
  if (!el) return;
  const today = dollarPerfTodayISO();
  const storedDates = [...dollarPerfTransactions.map(t=>dollarPerfDateToISO(t.date)), ...dollarPerfSnapshots.filter(s=>s.kind==='valuation').map(s=>dollarPerfDateToISO(s.date))].filter(Boolean).sort();
  const firstDate = storedDates[0] || today;
  const requestedFrom = document.getElementById('dpFrom')?.value || '';
  const requestedTo = document.getElementById('dpTo')?.value || '';
  const parsedFrom = dollarPerfDateToISO(requestedFrom);
  const parsedTo = dollarPerfDateToISO(requestedTo);
  // Invalid/legacy stored values must not blank the whole page: recover to
  // the first valid record date and today, while keeping the shared calendar usable.
  const fromISO = parsedFrom || firstDate;
  const toISO = parsedTo || today;
  const from = dollarPerfISOToJalali(fromISO);
  const to = dollarPerfISOToJalali(toISO);
  if (fromISO > toISO) {
    const safeFrom = [...dollarPerfTransactions.map(t=>t.date), ...dollarPerfSnapshots.filter(s=>s.kind==='valuation').map(s=>s.date)].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today).sort()[0] || today;
    const fromEl = document.getElementById('dpFrom');
    const toEl = document.getElementById('dpTo');
    if (fromEl) fromEl.value = dollarPerfISOToJalali(safeFrom);
    if (toEl) toEl.value = dollarPerfTodayJalali();
    renderDollarPerformance();
    return;
  }
  const report = dollarPerfCompute(fromISO, toISO);
  const latestValuation = dollarPerfGetValuation(toISO, true);
  const latestRateSnapshot = [...dollarPerfSnapshots].filter(s=>s.kind==='rate' && s.date<=toISO).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  const currentRate = toISO === today ? dollarPerfGetEffectiveRate(latestRateSnapshot) || dollarPerfMarket?.rate : dollarPerfGetEffectiveRate(latestRateSnapshot);
  const currentRateStale = toISO === today && dollarPerfMarket?.stale;
  const lastValueUSD = latestValuation ? Number(latestValuation.valueToman) / Number(latestValuation.fxRateToman) : 0;
  const pnlClass = report.profitUSD >= 0 ? 'positive' : 'negative';
  const txRows = [...dollarPerfTransactions].reverse().slice(0,12).map(t => '<tr><td>' + dollarPerfSafe(dollarPerfISOToJalali(t.date)) + '</td><td>' + (t.type==='deposit'?'افزایش سرمایه':'برداشت') + '</td><td>' + dollarPerfMoney(t.amountToman) + '</td><td>' + dollarPerfMoney(Number(t.amountToman)/Number(t.fxRateToman),'USD') + '</td><td>' + dollarPerfRate(t.fxRateToman) + '</td></tr>').join('');
  const snapRows = [...dollarPerfSnapshots].filter(s=>s.kind==='valuation').reverse().slice(0,8).map(s=>'<tr><td>'+dollarPerfSafe(dollarPerfISOToJalali(s.date))+'</td><td>'+dollarPerfMoney(s.valueToman)+'</td><td>'+dollarPerfRate(s.fxRateToman)+'</td><td>'+dollarPerfMoney(Number(s.valueToman)/Number(s.fxRateToman),'USD')+'</td></tr>').join('');
  el.innerHTML = '<div class="dp-header"><div><div class="dp-eyebrow">PORTFOLIO · USD BENCHMARK</div><h2>عملکرد دلاری سرمایه</h2><p>آیا رشد سرمایه‌ات از رشد دلار آزاد جلو زده است؟</p></div><div class="dp-header-actions"><button class="btn btn-secondary" onclick="loadDollarPerformance()">↻ به‌روزرسانی نرخ</button><button class="btn btn-gold" onclick="openDollarValuationModal()">ثبت ارزش فعلی سرمایه</button></div></div>' +
  '<div class="dp-rate-strip"><div><span>دلار آزاد امروز</span><strong>' + (currentRate ? dollarPerfRate(currentRate) : '—') + '</strong><small>' + (dollarPerfMarket?.timestampJalali || 'زمان نرخ در دسترس نیست') + '</small></div><div class="dp-rate-source"><span>منبع داده</span><b>Iran Market Data · TGJU</b><small>' + (currentRateStale ? 'هشدار: داده قدیمی است' : 'به‌روزرسانی دوره‌ای حدود ۳۰ دقیقه') + '</small></div><button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'dpManualRate\').value=\'' + (dollarPerfMarket?.rate || '') + '\';document.getElementById(\'dpRateModal\').classList.add(\'show\')">اصلاح نرخ امروز</button></div>' +
  '<div class="dp-filters"><div><label>از تاریخ شمسی</label><div class="jdp-wrap"><input class="fi jdp-input" id="dpFrom" value="' + dollarPerfSafe(from) + '" readonly onclick="jdpOpen(\'dpFrom\',\'jdp_dpFrom\')"><div class="jdp-popup" id="jdp_dpFrom"></div></div></div><div><label>تا تاریخ شمسی</label><div class="jdp-wrap"><input class="fi jdp-input" id="dpTo" value="' + dollarPerfSafe(to) + '" readonly onclick="jdpOpen(\'dpTo\',\'jdp_dpTo\')"><div class="jdp-popup" id="jdp_dpTo"></div></div></div><button class="btn btn-secondary" onclick="renderDollarPerformance()">اعمال بازه</button><button class="btn btn-success" onclick="openDollarFlowModal()">+ ثبت واریز / برداشت</button></div>' +
  '<div class="dp-kpis"><article class="dp-kpi dp-kpi-main"><span>ارزش فعلی سرمایه به دلار</span><strong>' + (latestValuation ? dollarPerfMoney(lastValueUSD,'USD') : '—') + '</strong><small>' + (latestValuation ? 'ارزش تومانی ثبت‌شده ÷ نرخ همان روز' : 'ابتدا ارزش فعلی سرمایه را ثبت کن') + '</small></article><article class="dp-kpi"><span>سود / زیان دلاری در بازه</span><strong class="' + pnlClass + '">' + (report.hasEnd ? (report.profitUSD>=0?'+':'') + dollarPerfMoney(report.profitUSD,'USD') : '—') + '</strong><small class="' + pnlClass + '">' + (report.percentUSD>=0?'+':'') + report.percentUSD.toFixed(2) + '% نسبت به سرمایه مبنا</small></article><article class="dp-kpi"><span>سود / زیان تومانی در بازه</span><strong class="' + (report.profitToman>=0?'positive':'negative') + '">' + (report.hasEnd ? (report.profitToman>=0?'+':'') + dollarPerfMoney(report.profitToman) : '—') + '</strong><small>برای مقایسه با بازده دلاری</small></article><article class="dp-kpi"><span>نرخ دلار مبنا</span><strong>' + (currentRate ? dollarPerfRate(currentRate) : '—') + '</strong><small>نرخ آزاد بازار ایران</small></article></div>' +
  '<div class="dp-grid"><section class="dp-panel"><div class="dp-panel-title"><div><h3>تراکنش‌های سرمایه</h3><p>مبنای دلاری هر واریز و برداشت با نرخ همان روز</p></div></div><div class="dp-table-wrap"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>مبلغ تومانی</th><th>معادل دلاری</th><th>نرخ دلار</th></tr></thead><tbody>' + (txRows || '<tr><td colspan="5" class="dp-empty">هنوز واریز یا برداشتی ثبت نشده است.</td></tr>') + '</tbody></table></div></section><section class="dp-panel"><div class="dp-panel-title"><div><h3>تاریخچه ارزش سرمایه</h3><p>ثبت‌های ارزش‌گذاری در تاریخ‌های مختلف</p></div></div><div class="dp-table-wrap"><table><thead><tr><th>تاریخ</th><th>ارزش تومانی</th><th>نرخ دلار</th><th>ارزش دلاری</th></tr></thead><tbody>' + (snapRows || '<tr><td colspan="4" class="dp-empty">برای شروع، ارزش فعلی سرمایه را ثبت کن.</td></tr>') + '</tbody></table></div></section></div>' +
  '<div class="dp-footnote">نرخ بازار آزاد از منبع عمومی Iran Market Data دریافت می‌شود و معمولاً هر ۳۰ دقیقه منتشر می‌شود. نرخ‌ها و ارزش‌گذاری‌ها با تاریخ ثبت‌شده نگه‌داری می‌شوند. ثبت روزانه خودکار نرخ هنگام بازکردن داشبورد انجام می‌شود؛ برای ثبت در روزهایی که وارد سایت نمی‌شوی، اجرای زمان‌بندی‌شده سمت سرور لازم است. این گزارش بر اساس ارزش‌گذاری‌هایی است که خودت ثبت می‌کنی و نرخ‌های تاریخی روزانه.</div>' + '<div id="investorDollarComparison"></div>';
}
