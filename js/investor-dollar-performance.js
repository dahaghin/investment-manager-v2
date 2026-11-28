// ===== Beta 5: Principal-only performance vs USD; monthly profit remains Toman =====
let investorDollarRows = [];
let investorDollarBusy = false;

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
  if (saved) {
    const savedRate = Number(saved.effectiveRate || saved.apiRate || 0);
    if (savedRate > 0) return { rate: savedRate, source: saved.manualRate ? 'نرخ دستی ذخیره‌شده' : 'نرخ ذخیره‌شده' };
  }
  return dollarPerfRateForDate(date);
}
async function loadInvestorDollarPerformance() {
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
    renderInvestorDollarPerformance(todayFx, skippedCurrencies);
  } catch (e) {
    host.innerHTML = '<div class="dp-error">محاسبه عملکرد اصل سرمایه کامل نشد: ' + dollarPerfSafe(e.message) +
      '<button class="btn btn-secondary" onclick="loadInvestorDollarPerformance()">تلاش دوباره</button></div>';
  } finally {
    investorDollarBusy = false;
  }
}
function renderInvestorDollarPerformance(todayFx, skippedCurrencies = []) {
  const host = document.getElementById('investorDollarContent');
  if (!host) return;
  const rows = investorDollarRows;
  const valid = rows.filter(r => r.complete && r.benchmarkUSD > 0);
  const totalInitialToman = rows.reduce((s, r) => s + r.netPrincipalToman, 0);
  const totalCurrentToman = rows.reduce((s, r) => s + r.currentPrincipalToman, 0);
  const totalBenchmarkUSD = valid.reduce((s, r) => s + r.benchmarkUSD, 0);
  const totalCurrentUSD = valid.reduce((s, r) => s + r.currentPrincipalUSD, 0);
  const totalProfitCreated = rows.reduce((s, r) => s + r.profitCreatedToman, 0);
  const totalProfitPaid = rows.reduce((s, r) => s + r.profitPaidToman, 0);
  const totalProfitOutstanding = rows.reduce((s, r) => s + r.profitOutstandingToman, 0);
  const money = n => investorDollarMoney(n, 'IRT');
  const usd = n => investorDollarMoney(n, 'USD');
  const pct = n => n === null || !Number.isFinite(n) ? '—' : (n >= 0 ? '+' : '') + new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(n) + '٪';
  const signedMoney = (n, c) => (n >= 0 ? '+' : '−') + (c === 'USD' ? usd(Math.abs(n)) : money(Math.abs(n)));
  const overallTomanPct = totalInitialToman > 0 ? (totalCurrentToman / totalInitialToman - 1) * 100 : null;
  const overallUsdPct = totalBenchmarkUSD > 0 ? (totalCurrentUSD / totalBenchmarkUSD - 1) * 100 : null;
  host.innerHTML =
    '<div class="dp-header"><div><div class="dp-eyebrow">ALIZO · PRINCIPAL PERFORMANCE</div><h2>عملکرد اصل سرمایه؛ تومان در برابر دلار</h2><p>فقط اصل سرمایه مقایسه می‌شود؛ سود ماهانه کاملاً جدا و فقط به تومان نمایش داده می‌شود.</p></div><button class="btn btn-secondary" onclick="loadInvestorDollarPerformance()">↻ محاسبه مجدد</button></div>' +
    '<div class="dp-kpis">' +
      '<article class="dp-kpi"><span>رشد اصل سرمایه به تومان</span><strong class="' + (overallTomanPct !== null && overallTomanPct >= 0 ? 'positive' : 'negative') + '">' + pct(overallTomanPct) + '</strong><small>' + signedMoney(totalCurrentToman - totalInitialToman, 'IRT') + '</small></article>' +
      '<article class="dp-kpi dp-kpi-main"><span>رشد اصل سرمایه نسبت به دلار</span><strong class="' + (overallUsdPct !== null && overallUsdPct >= 0 ? 'positive' : 'negative') + '">' + pct(overallUsdPct) + '</strong><small>' + signedMoney(totalCurrentUSD - totalBenchmarkUSD, 'USD') + ' نسبت به نگهداری دلار</small></article>' +
      '<article class="dp-kpi"><span>سود ماهانه ایجادشده</span><strong>' + money(totalProfitCreated) + '</strong><small>فقط تومان · بدون تبدیل به دلار</small></article>' +
      '<article class="dp-kpi"><span>سود پرداخت‌شده / طلب باقی‌مانده</span><strong>' + money(totalProfitPaid) + '</strong><small>طلب سود: ' + money(totalProfitOutstanding) + '</small></article>' +
    '</div>' +
    '<div class="dp-footnote"><b>روش محاسبه:</b> هر واریز و اصلاحیه اصل سرمایه با نرخ دلار همان تاریخ به دلار تبدیل می‌شود؛ برداشت اصل سرمایه نیز در همان تاریخ از سناریوی دلاری کم می‌شود. سپس معادل دلاری مانده اصل سرمایه با نرخ دلار امروز سنجیده می‌شود. سودهای ماهانه، پرداخت سود و سود دریافت‌نشده وارد مقایسه دلار نمی‌شوند. رشد تومانی نیز بر مبنای خالص اصل سرمایه ثبت‌شده و مانده فعلی اصل سرمایه است.</div>' +
    '<div class="dp-footnote">نرخ دلار امروز: <b>' + investorDollarRate(todayFx) + '</b>. نرخ تاریخی هر واریز در جزئیات همان سرمایه‌گذار قابل مشاهده است.</div>' +
    (skippedCurrencies.length ? '<div class="dp-error">سرمایه‌گذاران با ارز پایه دلار یا درهم در مقایسه تومان/دلار وارد نشده‌اند: ' + skippedCurrencies.map(x => dollarPerfSafe(x.name) + ' (' + x.currency + ')').join('، ') + '. مانده آن‌ها با ارز اصلی‌شان باید جداگانه بررسی شود.</div>' : '') +
    '<div class="personal-investment-list">' +
      (rows.map(r => {
        const name = escapeHTML(r.inv.fullName || r.inv.name || 'بدون نام');
        const missing = r.missingRates.length ? '<div class="dp-error">برای این تاریخ‌ها نرخ تاریخی پیدا نشد؛ نتیجه دلاری این سرمایه‌گذار ناقص است: ' + r.missingRates.map(x => milToJalali(x.date)).join('، ') + '</div>' : '';
        const usdResult = r.complete && r.usdPercent !== null ? '<div><small>رشد دلاری اصل سرمایه</small><b class="' + (r.usdPercent >= 0 ? 'positive' : 'negative') + '">' + pct(r.usdPercent) + ' · ' + signedMoney(r.usdChange, 'USD') + '</b></div>' : '<div><small>رشد دلاری اصل سرمایه</small><b>نیازمند نرخ تاریخی</b></div>';
        return '<article class="personal-investment-card"><div class="personal-investment-head"><div><h3>' + name + '</h3><p>شروع: ' + milToJalali(r.inv.startDate) + ' · نرخ قراردادی: ' + Number(r.inv.monthlyInterestRate || r.inv.rate || 0) + '٪ ماهانه</p></div><span class="investment-status">اصل سرمایه</span></div>' +
          '<div class="personal-investment-metrics"><div><small>خالص اصل سرمایه ثبت‌شده</small><b>' + money(r.netPrincipalToman) + '</b></div><div><small>مانده فعلی اصل سرمایه</small><b>' + money(r.currentPrincipalToman) + '</b></div><div><small>معادل دلار مبنا</small><b>' + usd(r.benchmarkUSD) + '</b></div><div><small>ارزش دلاری فعلی اصل سرمایه</small><b>' + usd(r.currentPrincipalUSD) + '</b></div><div><small>رشد تومانی اصل سرمایه</small><b class="' + (r.tomanChange >= 0 ? 'positive' : 'negative') + '">' + pct(r.tomanPercent) + ' · ' + signedMoney(r.tomanChange, 'IRT') + '</b></div>' + usdResult + '</div>' +
          '<div class="dp-footnote">سود ماهانه (جدا از اصل سرمایه): ایجادشده ' + money(r.profitCreatedToman) + ' · پرداخت‌شده ' + money(r.profitPaidToman) + ' · طلب باقی‌مانده ' + money(r.profitOutstandingToman) + '</div>' +
          missing +
          '<details class="investment-history"><summary>ریز واریز و برداشت اصل سرمایه (' + r.events.length + ')</summary><div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>شرح</th><th>مبلغ تومانی</th><th>نرخ دلار همان روز</th><th>معادل دلاری</th></tr></thead><tbody>' +
          (r.events.map(e => '<tr><td>' + milToJalali(e.date) + '</td><td>' + e.label + '</td><td>' + money(e.toman) + '</td><td>' + investorDollarRate(e.fx) + '</td><td>' + (e.signedUsd < 0 ? '−' : '+') + usd(e.usd) + '</td></tr>').join('') || '<tr><td colspan="5">تراکنش اصل سرمایه ثبت نشده است.</td></tr>') +
          '</tbody></table></div></details></article>';
      }).join('') || '<div class="empty-state">سرمایه‌گذار فعالی برای محاسبه وجود ندارد.</div>') +
    '</div>';
}
