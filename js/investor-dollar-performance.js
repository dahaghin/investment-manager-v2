// Investor-specific USD opportunity-cost comparison, embedded in the existing USD Performance tab.
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
function investorDollarPct(value) {
  if (!Number.isFinite(value)) return '—';
  return (value >= 0 ? '+' : '') + new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value) + '٪';
}
async function investorDollarFxForDate(date) {
  const saved = dollarPerfSnapshots.find(s => s.kind === 'rate' && s.date === date);
  if (saved?.manualRate && Number(saved.effectiveRate) > 0) {
    return { rate: Number(saved.effectiveRate), source: 'نرخ دستی ذخیره‌شده' };
  }
  if (date === dollarPerfTodayISO() && dollarPerfMarket && !dollarPerfMarket.stale && Number(dollarPerfMarket.rate) > 0) {
    return { rate: Number(dollarPerfMarket.rate), source: dollarPerfMarket.source || 'نرخ زنده' };
  }
  if (saved) {
    const rate = Number(saved.effectiveRate || saved.apiRate || 0);
    if (rate > 0) return { rate, source: 'نرخ ذخیره‌شده' };
  }
  return dollarPerfRateForDate(date);
}
async function loadInvestorDollarPerformance(id = null) {
  if (id) investorDollarSelectedId = id;
  else if (!investorDollarSelectedId) investorDollarSelectedId = (typeof selectedId !== 'undefined' ? selectedId : null);
  const host = document.getElementById('investorDollarComparison');
  if (!host || investorDollarBusy) return;
  investorDollarBusy = true;
  host.innerHTML = '<div class="dp-loading">در حال محاسبه مقایسه سرمایه‌گذاری با نگهداری دلار…</div>';
  try {
    if (!dollarPerfMarket || dollarPerfMarket.stale) {
      try { await dollarPerfFetchMarket(); } catch (e) { console.warn('Live USD rate unavailable', e); }
    }
    await dollarPerfLoadRecords();
    const today = dollarPerfTodayISO();
    const todayFxResult = await investorDollarFxForDate(today);
    const todayFx = Number(todayFxResult.rate);
    if (!(todayFx > 0)) throw new Error('نرخ معتبر دلار امروز پیدا نشد.');
    const inv = investors.find(x => x.id === investorDollarSelectedId) ||
      investors.find(x => x.id === (typeof selectedId !== 'undefined' ? selectedId : null)) || investors[0];
    if (!inv) {
      host.innerHTML = '<div class="dp-empty">هنوز سرمایه‌گذاری برای مقایسه ثبت نشده است.</div>';
      return;
    }
    investorDollarSelectedId = inv.id;
    const currency = inv.currency || 'IRT';
    if (currency !== 'IRT') {
      host.innerHTML = '<div class="dp-error">این مقایسه در حال حاضر برای سرمایه‌گذارانی با واحد پایه تومان قابل انجام است. واحد این سرمایه‌گذار: ' + dollarPerfSafe(currency) + '.</div>';
      return;
    }
    const events = getInvestorTransactions(inv).filter(t =>
      ['capital_deposit','capital_withdrawal','adjustment','settlement'].includes(t.type) &&
      Number(t.amount) > 0 && t.date <= today
    );
    const converted = [];
    const missing = [];
    for (const t of events) {
      try {
        const fx = await investorDollarFxForDate(t.date);
        const rate = Number(fx.rate);
        if (!(rate > 0)) throw new Error('نرخ معتبر نیست');
        const incoming = t.type === 'capital_deposit' || t.type === 'adjustment';
        converted.push({
          date: t.date, type: t.type, amount: Number(t.amount), rate,
          usd: Number(t.amount) / rate,
          signedUsd: (incoming ? 1 : -1) * Number(t.amount) / rate,
          label: t.type === 'capital_deposit' ? 'ورود سرمایه' :
            t.type === 'capital_withdrawal' ? 'برداشت اصل سرمایه' :
            t.type === 'settlement' ? 'تسویه اصل سرمایه' : 'اصلاحیه سرمایه'
        });
      } catch (e) { missing.push(t.date); }
    }
    const initial = converted.find(e => e.type === 'capital_deposit');
    const benchmarkUSD = converted.reduce((sum,e) => sum + e.signedUsd, 0);
    const netPrincipalToman = converted.reduce((sum,e) => sum + (e.type === 'capital_deposit' || e.type === 'adjustment' ? e.amount : -e.amount), 0);
    const currentToman = Math.max(0, ledgerCapitalBefore(inv, today));
    const businessGrowthToman = currentToman - netPrincipalToman;
    const businessGrowthPct = netPrincipalToman > 0 ? businessGrowthToman / netPrincipalToman * 100 : null;
    const currentUSD = currentToman / todayFx;
    const holdUSDValueToman = benchmarkUSD * todayFx;
    const profitVsDollarToman = currentToman - holdUSDValueToman;
    const profitVsDollarUSD = currentUSD - benchmarkUSD;
    const percent = holdUSDValueToman > 0 ? (profitVsDollarToman / holdUSDValueToman) * 100 : null;
    const complete = missing.length === 0 && benchmarkUSD > 0;
    const createdProfit = totalProfit(inv);
    const paidProfit = totalPaid(inv);
    const outstandingProfit = unpaid(inv);
    const rows = converted.map(e =>
      '<tr><td>' + dollarPerfISOToJalali(e.date) + '</td><td>' + e.label + '</td><td>' + investorDollarMoney(e.amount) + '</td><td>' + investorDollarRate(e.rate) + '</td><td>' + (e.signedUsd < 0 ? '−' : '+') + investorDollarMoney(e.usd,'USD') + '</td></tr>'
    ).join('');
    host.innerHTML =
      '<div class="dp-panel" style="margin-top:18px"><div class="dp-panel-title"><div><div class="dp-eyebrow">INVESTOR · USD OPPORTUNITY COST</div><h3>اگر به‌جای این سرمایه‌گذاری دلار می‌خریدی…</h3><p>محاسبه خودکار برای سرمایه‌گذار انتخاب‌شده از فهرست سمت راست</p></div><button class="btn btn-secondary btn-sm" onclick="loadInvestorDollarPerformance(investorDollarSelectedId)">↻ محاسبه مجدد</button></div>' +
      '<div class="dp-footnote"><b>' + dollarPerfSafe(inv.fullName || inv.name || 'سرمایه‌گذار') + '</b> · تاریخ شروع: ' + dollarPerfISOToJalali(inv.startDate) + '</div>' +
      '<div class="dp-kpis">' +
        '<article class="dp-kpi"><span>اصل سرمایه اولیه</span><strong>' + investorDollarMoney(initial?.amount || 0) + '</strong><small>' + (initial ? 'ورود در ' + dollarPerfISOToJalali(initial.date) : 'واریز اولیه پیدا نشد') + '</small></article>' +
        '<article class="dp-kpi"><span>نرخ دلار روز ورود</span><strong>' + (initial ? investorDollarRate(initial.rate) : '—') + '</strong><small>نرخ تاریخی همان روز</small></article>' +
        '<article class="dp-kpi"><span>معادل دلار در روز ورود</span><strong>' + (initial ? investorDollarMoney(initial.usd,'USD') : '—') + '</strong><small>مبلغ اولیه ÷ نرخ همان روز</small></article>' +
        '<article class="dp-kpi"><span>ارزش امروز اگر دلار نگه می‌داشتی</span><strong>' + investorDollarMoney(holdUSDValueToman) + '</strong><small>' + investorDollarMoney(benchmarkUSD,'USD') + ' × نرخ امروز</small></article>' +
        '<article class="dp-kpi"><span>ارزش فعلی اصل سرمایه در کسب‌وکار</span><strong>' + investorDollarMoney(currentToman) + '</strong><small>نرخ دلار امروز: ' + investorDollarRate(todayFx) + '</small></article>' +
        '<article class="dp-kpi"><span>رشد اصل سرمایه در کسب‌وکار</span><strong class="' + (businessGrowthToman >= 0 ? 'positive' : 'negative') + '">' + investorDollarMoney(businessGrowthToman) + '</strong><small>' + investorDollarPct(businessGrowthPct) + ' نسبت به خالص اصل سرمایه ورودی</small></article>' +
        '<article class="dp-kpi dp-kpi-main"><span>نتیجه در مقایسه با نگهداری دلار</span><strong class="' + (profitVsDollarToman >= 0 ? 'positive' : 'negative') + '">' + (complete ? investorDollarPct(percent) : 'ناقص') + '</strong><small class="' + (profitVsDollarToman >= 0 ? 'positive' : 'negative') + '">' + (complete ? (profitVsDollarToman >= 0 ? '+' : '−') + investorDollarMoney(Math.abs(profitVsDollarToman)) + ' · ' + (profitVsDollarUSD >= 0 ? '+' : '−') + investorDollarMoney(Math.abs(profitVsDollarUSD),'USD') : 'نرخ تاریخی بعضی تراکنش‌ها موجود نیست') + '</small></article>' +
      '</div>' +
      '<div class="dp-footnote"><b>روش مقایسه:</b> هر واریز اصل سرمایه با نرخ دلار تاریخ خودش به دلار تبدیل می‌شود؛ برداشت اصل سرمایه از سناریوی نگهداری دلار کم می‌شود. سپس آن دلارها با نرخ امروز ارزش‌گذاری می‌شوند و با مانده فعلی اصل سرمایه مقایسه می‌شوند. سود ماهانه در این مقایسه وارد نشده است.</div>' +
      '<div class="dp-footnote">سود ماهانه جداگانه — ایجادشده: ' + investorDollarMoney(createdProfit) + ' · پرداخت‌شده: ' + investorDollarMoney(paidProfit) + ' · طلب باقی‌مانده: ' + investorDollarMoney(outstandingProfit) + '</div>' +
      (missing.length ? '<div class="dp-error">برای تاریخ‌های ' + missing.map(dollarPerfISOToJalali).join('، ') + ' نرخ تاریخی پیدا نشد؛ نتیجه نهایی موقت است.</div>' : '') +
      '<details class="investment-history"><summary>ریز واریزها و برداشت‌ها و نرخ دلار هر تاریخ</summary><div class="table-wrap"><table><thead><tr><th>تاریخ شمسی</th><th>شرح</th><th>مبلغ</th><th>نرخ دلار همان روز</th><th>معادل دلاری</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">تراکنش سرمایه‌ای ثبت نشده است.</td></tr>') + '</tbody></table></div></details></div>';
  } catch (e) {
    host.innerHTML = '<div class="dp-error">محاسبه مقایسه دلاری انجام نشد: ' + dollarPerfSafe(e.message) + '<button class="btn btn-secondary" onclick="loadInvestorDollarPerformance(investorDollarSelectedId)">تلاش دوباره</button></div>';
  } finally { investorDollarBusy = false; }
}
