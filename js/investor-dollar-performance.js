// ===== Beta 5: Investor dollar-equivalent performance =====
let investorDollarRows = [];
let investorDollarBusy = false;

async function loadInvestorDollarPerformance() {
  const host = document.getElementById('investorDollarContent');
  if (!host || investorDollarBusy) return;
  investorDollarBusy = true;
  host.innerHTML = '<div class="dp-loading">در حال محاسبه معادل دلاری سرمایه و سودهای تاریخی…</div>';
  try {
    if (!dollarPerfMarket) await dollarPerfFetchMarket();
    const today = dollarPerfTodayISO();
    const todayFx = dollarPerfMarket && !dollarPerfMarket.stale ? dollarPerfMarket.rate : (await dollarPerfRateForDate(today)).rate;
    const results = [];
    for (const inv of investors.filter(x => x.status !== 'Settled')) {
      const tx = getInvestorTransactions(inv);
      const schedule = buildProfitSchedule(inv);
      const contributions = [];
      const distributions = [];
      for (const t of tx) {
        const fx = await dollarPerfRateForDate(t.date);
        const usd = Number(t.amount || 0) / fx.rate;
        if (t.type === 'capital_deposit' || t.type === 'adjustment') contributions.push({date:t.date,kind:transactionTypeLabel(t.type),toman:Number(t.amount),fx:fx.rate,usd});
        if (t.type === 'capital_withdrawal' || t.type === 'settlement') distributions.push({date:t.date,kind:transactionTypeLabel(t.type),toman:Number(t.amount),fx:fx.rate,usd});
        if (t.type === 'profit_payment') distributions.push({date:t.date,kind:'پرداخت سود',toman:Number(t.amount),fx:fx.rate,usd});
      }
      const profits = [];
      for (const row of schedule) {
        const fx = await dollarPerfRateForDate(row.gregDate);
        profits.push({date:row.gregDate,label:row.label,toman:Number(row.amount),fx:fx.rate,usd:Number(row.amount)/fx.rate});
      }
      const investedUSD = contributions.reduce((s,x)=>s+x.usd,0);
      const distributedUSD = distributions.reduce((s,x)=>s+x.usd,0);
      const paidProfitUSD = distributions.filter(x=>x.kind==='پرداخت سود').reduce((s,x)=>s+x.usd,0);
      const outstandingUSD = Number(currentBalance(inv) || 0) / todayFx;
      const totalWealthUSD = outstandingUSD + distributedUSD;
      const pnlUSD = totalWealthUSD - investedUSD;
      results.push({inv,contributions,distributions,profits,investedUSD,distributedUSD,paidProfitUSD,outstandingUSD,totalWealthUSD,pnlUSD,todayFx});
    }
    investorDollarRows = results;
    renderInvestorDollarPerformance();
  } catch(e) {
    host.innerHTML = '<div class="dp-error">محاسبه عملکرد دلاری کامل نشد: '+dollarPerfSafe(e.message)+'<button class="btn btn-secondary" onclick="loadInvestorDollarPerformance()">تلاش دوباره</button></div>';
  } finally { investorDollarBusy = false; }
}
function renderInvestorDollarPerformance() {
  const host = document.getElementById('investorDollarContent');
  if (!host) return;
  const money = n => dollarPerfMoney(n,'USD');
  const totalInvested = investorDollarRows.reduce((s,r)=>s+r.investedUSD,0);
  const totalPnl = investorDollarRows.reduce((s,r)=>s+r.pnlUSD,0);
  const totalPaid = investorDollarRows.reduce((s,r)=>s+r.paidProfitUSD,0);
  host.innerHTML = '<div class="dp-header"><div><div class="dp-eyebrow">INVESTORS · HISTORICAL USD CONVERSION</div><h2>عملکرد دلاری سرمایه‌گذاران</h2><p>سرمایه اولیه و هر سود ماهانه با نرخ دلار همان تاریخ محاسبه می‌شود.</p></div><button class="btn btn-secondary" onclick="loadInvestorDollarPerformance()">↻ محاسبه مجدد</button></div>'+
  '<div class="dp-kpis"><article class="dp-kpi dp-kpi-main"><span>کل آورده سرمایه‌گذاران به دلار</span><strong>'+money(totalInvested)+'</strong><small>هر واریز با نرخ روز خودش</small></article><article class="dp-kpi"><span>سود / زیان دلاری خالص</span><strong class="'+(totalPnl>=0?'positive':'negative')+'">'+(totalPnl>=0?'+':'')+money(totalPnl)+'</strong><small>با لحاظ پرداخت‌ها و برداشت‌ها</small></article><article class="dp-kpi"><span>سود پرداخت‌شده به دلار</span><strong>'+money(totalPaid)+'</strong><small>نرخ روز هر پرداخت</small></article><article class="dp-kpi"><span>نرخ دلار مبنای امروز</span><strong>'+dollarPerfRate(investorDollarRows[0]?.todayFx || dollarPerfMarket?.rate || 0)+'</strong><small>منبع نرخ آزاد ایران</small></article></div>'+
  '<div class="dp-footnote">روش: واریزها و اصلاحیه‌ها با نرخ تاریخ خودشان به‌عنوان آورده ثبت می‌شوند؛ سودهای ایجادشده با نرخ روز پایان هر ماه تبدیل می‌شوند؛ پرداخت سود و برداشت اصل نیز با نرخ روز پرداخت به‌عنوان خروجی نقدی لحاظ می‌شوند. مانده اصل و سود طلبکارانه با نرخ امروز ارزش‌گذاری می‌شود. سود ماهانه پرداخت‌نشده در ماه ایجادش به‌عنوان طلب لحاظ شده است. این گزارش معادل دلاری جریان‌های ثبت‌شده است، نه تضمین بازده قابل تحقق.</div>'+
  '<div class="personal-investment-list">'+(investorDollarRows.map(r=>'<article class="personal-investment-card"><div class="personal-investment-head"><div><h3>'+escapeHTML(r.inv.fullName||r.inv.name)+'</h3><p>شروع: '+milToJalali(r.inv.startDate)+' · نرخ قراردادی: '+Number(r.inv.monthlyInterestRate||r.inv.rate||0)+'٪ ماهانه</p></div><span class="investment-status">USD</span></div><div class="personal-investment-metrics"><div><small>آورده دلاری تاریخی</small><b>'+money(r.investedUSD)+'</b></div><div><small>مانده طلب و سرمایه امروز</small><b>'+money(r.outstandingUSD)+'</b></div><div><small>پرداخت‌ها و برداشت‌ها</small><b>'+money(r.distributedUSD)+'</b></div><div><small>سود / زیان دلاری</small><b class="'+(r.pnlUSD>=0?'positive':'negative')+'">'+(r.pnlUSD>=0?'+':'')+money(r.pnlUSD)+'</b></div></div><details class="investment-history"><summary>جزئیات تبدیل سودهای ماهانه ('+r.profits.length+')</summary><div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>سود تومانی</th><th>نرخ دلار همان روز</th><th>معادل دلاری سود</th></tr></thead><tbody>'+(r.profits.map(p=>'<tr><td>'+milToJalali(p.date)+'</td><td>'+dollarPerfMoney(p.toman)+'</td><td>'+dollarPerfRate(p.fx)+'</td><td>'+money(p.usd)+'</td></tr>').join('')||'<tr><td colspan="4">سودی در این بازه ایجاد نشده است</td></tr>')+'</tbody></table></div></details></article>').join('')||'<div class="empty-state">سرمایه‌گذاری فعالی برای محاسبه وجود ندارد.</div>')+'</div>';
}
