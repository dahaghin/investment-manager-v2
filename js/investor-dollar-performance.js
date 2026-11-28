// ===== Beta 5: Principal-only performance vs USD; monthly profit remains Toman =====
let investorDollarRows = [];
let investorDollarBusy = false;
let investorDollarSelectedId = null;

function investorDollarMoney(value, currency = 'IRT') {
  const n = Number(value || 0);
  if (currency === 'USD') return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' تومان';
}
function investorDollarRate(value) {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0))) + ' تومان';
}
async function investorDollarFxForDate(date) {
  const saved = dollarPerfSnapshots.find(s => s.kind === 'rate' && s.date === date);
  // For today, prefer the freshly fetched live quote; a deliberate manual
  // override saved for today remains authoritative.
  if (saved?.manualRate && Number(saved.effectiveRate) > 0) {
    return { rate: Number(saved.effectiveRate), source: 'نرخ دستی ذخیره‌شده' };
  }
  if (date === dollarPerfTodayISO() && dollarPerfMarket && !dollarPerfMarket.stale && Number(dollarPerfMarket.rate) > 0) {
    return { rate: Number(dollarPerfMarket.rate), source: dollarPerfMarket.source || 'نرخ زنده' };
  }
  if (saved) {
    const savedRate = Number(saved.effectiveRate || saved.apiRate || 0);
    if (savedRate > 0) return { rate: savedRate, source: 'نرخ ذخیره‌شده' };
  }
  return dollarPerfRateForDate(date);
}
async function loadInvestorDollarPerformance(selectedId = null) {
  if (selectedId) investorDollarSelectedId = selectedId;
  else if (!investorDollarSelectedId && selectedId === null && typeof selectedId !== 'undefined') investorDollarSelectedId = window.selectedId || null;
  const host = document.getElementById('investorDollarContent');
  if (!host || investorDollarBusy) return;
  investorDollarBusy = true;
  host.innerHTML = '<div class="dp-loading">در حال محاسبه عملکرد اصل سرمایه…</div>';
  try {
    // Reuse the existing rate feed and saved rate history; do not use the old
    // standalone portfolio snapshots/valuations for this investor-ledger report.
    try { if (!dollarPerfMarket || dollarPerfMarket.stale) await dollarPerfFetchMarket(); } catch (e) {
      console.warn('Latest USD rate unavailable; trying the saved daily rate/history.', e);
    }
    await dollarPerfLoadRecords();
    const today = dollarPerfTodayISO();
    const todayFxResult = await investorDollarFxForDate(today);
    const todayFx = Number(todayFxResult.rate);
    if (!(todayFx > 0)) throw new Error('نرخ معتبر دلار امروز پیدا نشد.');
    const results = [];
    const skippedCurrencies = [];
    const activeInvestors = investors.filter(x => x.status !== 'Settled');
    for (const inv of activeInvestors) {
      const currency = inv.currency || 'IRT';
      if (currency !== 'IRT') {
        skippedCurrencies.push({ name: inv.fullName || inv.name || 'بدون نام', currency });
        continue;
      }
      const tx = getInvestorTransactions(inv);
      const principalEvents = tx.filter(t =>
        ['capital_deposit', 'adjustment', 'capital_withdrawal', 'settlement'].includes(t.type) &&
        Number(t.amount) > 0 && t.date <= today
      );
      const events = [];
      const missingRates = [];
      for (const t of principalEvents) {
        try {
          const fx = await investorDollarFxForDate(t.date);
          const rate = Number(fx.rate);
          if (!(rate > 0)) throw new Error('نرخ نامعتبر');
          const isInflow = t.type === 'capital_deposit' || t.type === 'adjustment';
          events.push({
            date: t.date,
            type: t.type,
            label: t.type === 'capital_deposit' ? 'واریز اصل سرمایه' :
              t.type === 'capital_withdrawal' ? 'برداشت اصل سرمایه' :
              t.type === 'settlement' ? 'تسویه اصل سرمایه' : 'اصلاحیه سرمایه',
            toman: Number(t.amount),
            fx: rate,
            usd: Number(t.amount) / rate,
            signedToman: isInflow ? Number(t.amount) : -Number(t.amount),
            signedUsd: isInflow ? Number(t.amount) / rate : -Number(t.amount) / rate
          });
        } catch (e) {
          missingRates.push({ date: t.date, amount: Number(t.amount), type: t.type, message: e.message });
        }
      }
      const netPrincipalToman = events.reduce((s, e) => s + e.signedToman, 0);
      const benchmarkUSD = events.reduce((s, e) => s + e.signedUsd, 0);
      const currentPrincipalToman = Math.max(0, ledgerCapitalBefore(inv, today));
      const currentPrincipalUSD = currentPrincipalToman / todayFx;
      const benchmarkTomanToday = benchmarkUSD * todayFx;
      const profitRows = buildProfitSchedule(inv);
      const profitCreatedToman = profitRows.reduce((s, r) => s + Number(r.amount || 0), 0);
      const profitPaidToman = totalPaid(inv);
      const profitOutstandingToman = unpaid(inv);
      const complete = missingRates.length === 0;
      results.push({
        inv, events, missingRates, complete, netPrincipalToman, benchmarkUSD,
        currentPrincipalToman, currentPrincipalUSD, benchmarkTomanToday,
        tomanChange: currentPrincipalToman - netPrincipalToman,
        tomanPercent: netPrincipalToman > 0 ? (currentPrincipalToman / netPrincipalToman - 1) * 100 : null,
        usdChange: complete && benchmarkUSD > 0 ? currentPrincipalUSD - benchmarkUSD : null,
        usdPercent: complete && benchmarkUSD > 0 ? (currentPrincipalUSD / benchmarkUSD - 1) * 100 : null,
        profitCreatedToman, profitPaidToman, profitOutstandingToman
      });
    }
    investorDollarRows = results;
    if (!investorDollarSelectedId || !results.some(r => r.inv.id === investorDollarSelectedId)) {
      investorDollarSelectedId = results[0]?.inv.id || null;
    }
    renderInvestorDollarPerformance(todayFx, skippedCurrencies);
  } catch (e) {
    host.innerHTML = '<div class="dp-error">محاسبه عملکرد اصل سرمایه کامل نشد: ' + dollarPerfSafe(e.message) +
      '<button class="btn btn-secondary" onclick="loadInvestorDollarPerformance()">تلاش دوباره</button></div>';
  } finally {
    investorDollarBusy = false;
  }
}
function investorDollarSelect(id) {
  investorDollarSelectedId = id;
  renderInvestorDollarPerformance(window.investorDollarCurrentFx || 0, []);
}
function renderInvestorDollarPerformance(todayFx, skippedCurrencies = []) {
  const host = document.getElementById('investorDollarContent');
  if (!host) return;
  if (todayFx > 0) window.investorDollarCurrentFx = todayFx;
  const rows = investorDollarRows;
  const selected = rows.find(r => r.inv.id === investorDollarSelectedId) || rows[0] || null;
  const valid = rows.filter(r => r.complete && r.benchmarkUSD > 0);
  const totalBenchmarkUSD = valid.reduce((s, r) => s + r.benchmarkUSD, 0);
  const totalCurrentUSD = valid.reduce((s, r) => s + r.currentPrincipalUSD, 0);
  const money = n => investorDollarMoney(n, 'IRT');
  const usd = n => investorDollarMoney(n, 'USD');
  const pct = n => n === null || !Number.isFinite(n) ? '—' : (n >= 0 ? '+' : '') + new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(n) + '٪';
  const signedMoney = (n, c) => (n >= 0 ? '+' : '−') + (c === 'USD' ? usd(Math.abs(n)) : money(Math.abs(n)));
  const overallUsdPct = totalBenchmarkUSD > 0 ? (totalCurrentUSD / totalBenchmarkUSD - 1) * 100 : null;
  const investorOptions = rows.map(r => '<button type="button" class="btn ' + (selected && r.inv.id === selected.inv.id ? 'btn-gold' : 'btn-secondary') + '" style="margin:4px" onclick="investorDollarSelect(\'' + String(r.inv.id).replace(/'/g, "\\'") + '\')">' + dollarPerfSafe(r.inv.fullName || r.inv.name || 'بدون نام') + '</button>').join('');
  let detail = '<div class="dp-empty">برای محاسبه، یک سرمایه‌گذار را انتخاب کن.</div>';
  if (selected) {
    const r = selected;
    const name = dollarPerfSafe(r.inv.fullName || r.inv.name || 'بدون نام');
    const missing = r.missingRates.length ? '<div class="dp-error">برای تاریخ‌های زیر نرخ تاریخی پیدا نشد؛ نتیجه دلاری کامل نیست: ' + r.missingRates.map(x => dollarPerfISOToJalali(x.date)).join('، ') + '</div>' : '';
    detail = '<article class="personal-investment-card"><div class="personal-investment-head"><div><h3>' + name + '</h3><p>تاریخ شروع: ' + dollarPerfISOToJalali(r.inv.startDate) + '</p></div><span class="investment-status">مقایسه با دلار</span></div>' +
      '<div class="personal-investment-metrics">' +
      '<div><small>اصل سرمایه اولیه</small><b>' + money(r.events.filter(e => e.type === 'capital_deposit').reduce((s,e)=>s+e.toman,0)) + '</b></div>' +
      '<div><small>نرخ دلار تاریخ سرمایه‌گذاری</small><b>' + (r.events.find(e => e.type === 'capital_deposit') ? investorDollarRate(r.events.find(e => e.type === 'capital_deposit').fx) : '—') + '</b></div>' +
      '<div><small>معادل دلاری روز سرمایه‌گذاری</small><b>' + usd(r.events.filter(e => e.type === 'capital_deposit').reduce((s,e)=>s+e.usd,0)) + '</b></div>' +
      '<div><small>مانده اصل سرمایه امروز</small><b>' + money(r.currentPrincipalToman) + '</b></div>' +
      '<div><small>نرخ دلار امروز</small><b>' + investorDollarRate(window.investorDollarCurrentFx || todayFx) + '</b></div>' +
      '<div><small>ارزش دلاری اصل سرمایه امروز</small><b>' + usd(r.currentPrincipalUSD) + '</b></div>' +
      '<div><small>اگر دلار نگه می‌داشتی، امروز داشتی</small><b>' + usd(r.benchmarkUSD) + '</b></div>' +
      '<div><small>سود / زیان نسبت به دلار</small><b class="' + (r.usdChange !== null && r.usdChange >= 0 ? 'positive' : 'negative') + '">' + (r.usdPercent === null ? 'نیازمند نرخ تاریخی' : pct(r.usdPercent) + ' · ' + signedMoney(r.usdChange, 'USD')) + '</b></div>' +
      '</div>' +
      '<div class="dp-footnote">مقایسه فقط بر اساس اصل سرمایه است. سود ماهانه، پرداخت‌شده و طلب پرداخت‌نشده جدا می‌مانند و وارد این محاسبه نمی‌شوند.</div>' +
      '<div class="dp-footnote">سود ماهانه ایجادشده: ' + money(r.profitCreatedToman) + ' · پرداخت‌شده: ' + money(r.profitPaidToman) + ' · طلب باقی‌مانده: ' + money(r.profitOutstandingToman) + '</div>' +
      missing +
      '<details class="investment-history" open><summary>تاریخچه و نرخ دلار هر واریز / برداشت</summary><div class="table-wrap"><table><thead><tr><th>تاریخ شمسی</th><th>شرح</th><th>مبلغ تومان</th><th>نرخ دلار همان روز</th><th>معادل دلار</th></tr></thead><tbody>' +
      (r.events.map(e => '<tr><td>' + dollarPerfISOToJalali(e.date) + '</td><td>' + e.label + '</td><td>' + money(e.toman) + '</td><td>' + investorDollarRate(e.fx) + '</td><td>' + (e.signedUsd < 0 ? '−' : '+') + usd(e.usd) + '</td></tr>').join('') || '<tr><td colspan="5">تراکنش اصل سرمایه ثبت نشده است.</td></tr>') +
      '</tbody></table></div></details></article>';
  }
  host.innerHTML =
    '<div class="dp-header"><div><div class="dp-eyebrow">ALIZO · INVESTOR USD PERFORMANCE</div><h2>عملکرد دلاری هر سرمایه‌گذار</h2><p>نام سرمایه‌گذار را انتخاب کن تا نرخ دلار روز شروع و نرخ امروز، خودکار مقایسه شوند.</p></div><button class="btn btn-secondary" onclick="loadInvestorDollarPerformance(investorDollarSelectedId)">↻ محاسبه مجدد</button></div>' +
    '<div class="dp-kpis"><article class="dp-kpi dp-kpi-main"><span>بازده دلاری سرمایه‌گذاران تومانی</span><strong class="' + (overallUsdPct !== null && overallUsdPct >= 0 ? 'positive' : 'negative') + '">' + pct(overallUsdPct) + '</strong><small>' + signedMoney(totalCurrentUSD - totalBenchmarkUSD, 'USD') + ' نسبت به نگهداری دلار</small></article><article class="dp-kpi"><span>نرخ دلار امروز</span><strong>' + investorDollarRate(window.investorDollarCurrentFx || todayFx) + '</strong><small>منبع نرخ تاریخی و نرخ روز</small></article></div>' +
    '<div class="dp-panel"><div class="dp-panel-title"><h3>انتخاب سرمایه‌گذار</h3></div><div>' + (investorOptions || '<div class="dp-empty">سرمایه‌گذار تومانی فعالی برای مقایسه وجود ندارد.</div>') + '</div></div>' +
    '<div class="personal-investment-list">' + detail + '</div>' +
    (skippedCurrencies.length ? '<div class="dp-footnote">سرمایه‌گذاران با ارز پایه USD یا AED فعلاً در مقایسه تومان/دلار قرار نگرفته‌اند: ' + skippedCurrencies.map(x => dollarPerfSafe(x.name) + ' (' + x.currency + ')').join('، ') + '.</div>' : '');
}
