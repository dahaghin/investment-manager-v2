// ===== Management Dashboard (Beta 2) =====
function portfolioKpis() {
  const totalCap = investors.reduce((s, i) => s + activeCapital(i), 0);
  const totalProfitAll = investors.reduce((s, i) => s + totalProfit(i), 0);
  const paidProfit = investors.reduce((s, i) => s + totalPaid(i), 0);
  const dueProfit = investors.reduce((s, i) => s + unpaid(i), 0);
  const activeCount = investors.filter(i => investorStatus(i) !== 'Settled').length;
  const overdueCount = investors.filter(i => investorStatus(i) === 'Overdue').length;
  const totalLiability = totalCap + dueProfit;
  const todayJ = jToday();
  const dueThisMonth = investors.reduce((s, i) => s + buildProfitSchedule(i, todayJ).filter(r => r.jDate.y === todayJ.y && r.jDate.m === todayJ.m).reduce((a, r) => a + Math.max(0, r.unpaidProfit), 0), 0);
  return { totalCap, totalProfitAll, paidProfit, dueProfit, totalLiability, activeCount, overdueCount, dueThisMonth };
}

function renderManagementDashboard() {
  const el = document.getElementById('dashboardContent');
  if (!el) return;
  if (!investors.length) {
    el.innerHTML = '<div class="empty-state"><div class="ei">📈</div><p>برای نمایش داشبورد، ابتدا سرمایه‌گذار اضافه کنید</p></div>';
    return;
  }
  const k = portfolioKpis();
  el.innerHTML = `
    <div class="dashboard-toolbar">
      <div><div class="report-title">داشبورد مدیریت</div><div class="dash-subtitle">نمای ۳۶۰ درجه از سرمایه، سود، ریسک پرداخت و عملیات</div></div>
      <div class="dash-actions">
        <button class="btn btn-secondary" onclick="createBackup()">💾 پشتیبان</button>
        <button class="btn btn-secondary" onclick="document.getElementById('restoreFile').click()">♻️ بازیابی</button>
        <input id="restoreFile" type="file" accept="application/json" style="display:none" onchange="restoreBackupFile(event)">
        <button class="btn btn-gold" onclick="exportPortfolioCSV()">📄 خروجی CSV</button>
      </div>
    </div>
    <div class="dash-kpis">
      ${dashboardKpi('سرمایه فعال', formatMoney(k.totalCap), 'gold', 'مجموع اصل سرمایه در جریان')}
      ${dashboardKpi('سود انباشته', formatMoney(k.totalProfitAll), 'blue', 'کل سود محاسبه‌شده')}
      ${dashboardKpi('سود پرداخت‌شده', formatMoney(k.paidProfit), 'green', 'پرداخت‌های تخصیص‌یافته به سود')}
      ${dashboardKpi('تعهد کل صندوق', formatMoney(k.totalLiability), 'red', 'سرمایه فعال + سود پرداخت‌نشده')}
      ${dashboardKpi('سرمایه‌گذاران فعال', toFarsi(k.activeCount), 'purple', `${toFarsi(k.overdueCount)} معوق`)}
      ${dashboardKpi('سررسیدهای این ماه', formatMoney(k.dueThisMonth), 'blue', 'پرداخت‌های سود ماه جاری')}
    </div>
    <div class="dashboard-grid">
      <div class="dash-panel"><div class="chart-title">توزیع سرمایه سرمایه‌گذاران</div>${renderCapitalPie()}</div>
      <div class="dash-panel"><div class="chart-title">سرمایه فعال هر سرمایه‌گذار</div>${renderActiveCapitalBars()}</div>
      <div class="dash-panel wide"><div class="chart-title">روند ۱۲ ماهه سرمایه، سود انباشته و سود پرداختی</div>${renderTwelveMonthTrend()}</div>
      <div class="dash-panel"><div class="chart-title">پرداخت سود ماهانه</div>${renderMonthlyPaidProfitChart()}</div>
      <div class="dash-panel"><div class="chart-title">هشدارها</div>${renderAlerts()}</div>
      <div class="dash-panel"><div class="chart-title">آخرین رویدادهای سرمایه‌گذاران</div>${renderTimeline()}</div>
    </div>`;
}
function dashboardKpi(label, value, tone, sub) { return `<div class="dash-kpi ${tone}"><div class="ic-label">${label}</div><div class="ic-val">${value}</div><div class="ic-sub">${sub}</div></div>`; }
function chartPalette(i) { return ['#d4af37','#4cc9f0','#52b788','#e63946','#9b5de5','#f77f00','#00b4d8','#f72585'][i % 8]; }
function renderCapitalPie() {
  const total = investors.reduce((s,i)=>s+activeCapital(i),0) || 1;
  let acc = 0;
  const stops = investors.map((i,idx)=>{ const start=acc; acc += activeCapital(i)/total*100; return `${chartPalette(idx)} ${start}% ${acc}%`; }).join(',');
  const legend = investors.map((i,idx)=>`<div class="pie-legend-row"><span style="background:${chartPalette(idx)}"></span><b>${i.name}</b><em>${toFarsi((activeCapital(i)/total*100).toFixed(1))}٪</em></div>`).join('');
  return `<div class="pie-wrap"><div class="pie" style="background:conic-gradient(${stops})"><div>${formatMoney(total)}</div></div><div class="pie-legend">${legend}</div></div>`;
}
function renderActiveCapitalBars() {
  const max = Math.max(...investors.map(i=>activeCapital(i)), 1);
  return `<div class="bar-chart compact">${investors.map((i,idx)=>`<div class="bar-row"><div class="bar-label">${i.name}</div><div class="bar-track"><div class="bar-fill" style="background:${chartPalette(idx)};width:${(activeCapital(i)/max*100).toFixed(1)}%"></div></div><div class="bar-val">${formatMoney(activeCapital(i))}</div></div>`).join('')}</div>`;
}
function monthKeyFromJ(j){ return `${j.y}/${String(j.m).padStart(2,'0')}`; }
function renderTwelveMonthTrend() {
  const now = jToday();
  const months = Array.from({length:12},(_,n)=>jAddMonths(now, n-11));
  const rows = months.map(j=>{
    const gregEnd = jalaliObjToGreg(j.y, j.m, jdpMonthLen(j.y, j.m));
    return { label: monthKeyFromJ(j), cap: investors.reduce((s,i)=>s+ledgerCapitalBefore(i, gregEnd),0), profit: investors.reduce((s,i)=>s+buildProfitSchedule(i,j).reduce((a,r)=>a+r.amount,0),0), paid: investors.reduce((s,i)=>s+getInvestorTransactions(i).filter(t=>t.type==='profit_payment' && t.date<=gregEnd).reduce((a,t)=>a+t.amount,0),0) };
  });
  const max = Math.max(...rows.flatMap(r=>[r.cap,r.profit,r.paid]),1);
  const pts = key => rows.map((r,idx)=>`${idx*8.5+3},${90-(r[key]/max*78)}`).join(' ');
  return `<svg class="trend" viewBox="0 0 104 100" preserveAspectRatio="none"><polyline points="${pts('cap')}"/><polyline class="profit" points="${pts('profit')}"/><polyline class="paid" points="${pts('paid')}"/></svg><div class="trend-legend"><span class="cap">سرمایه</span><span class="profit">سود انباشته</span><span class="paid">سود پرداختی</span></div><div class="trend-months">${rows.map(r=>`<span>${toFarsi(r.label)}</span>`).join('')}</div>`;
}
function renderAlerts() {
  const alerts = [];
  investors.forEach(i => { if (investorStatus(i)==='Overdue') alerts.push(`سود ${i.name} معوق است: ${formatMoney(unpaid(i))}`); if (activeCapital(i)<=0) alerts.push(`${i.name} بدون سرمایه فعال است`); });
  cheques.filter(c=>!c.cashed && c.dueDate <= todayGregorian()).forEach(c=>alerts.push(`چک ${c.owner} سررسید شده است`));
  return alerts.length ? `<ul class="alerts">${alerts.map(a=>`<li>⚠️ ${a}</li>`).join('')}</ul>` : '<div class="empty-mini">هشداری وجود ندارد ✅</div>';
}
function investorTimelineEvents(inv) {
  return getInvestorTransactions(inv).map(t=>({date:t.date, text:`${transactionTypeLabel(t.type)} ${formatMoney(t.amount)} برای ${inv.name}`}));
}
function renderTimeline(invId) {
  const source = invId ? investors.filter(i=>i.id===invId) : investors;
  const events = source.flatMap(investorTimelineEvents).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);
  return events.length ? `<div class="timeline">${events.map(e=>`<div class="tl-item"><b>${milToJalali(e.date)}</b><span>${e.text}</span></div>`).join('')}</div>` : '<div class="empty-mini">رویدادی ثبت نشده است</div>';
}

function renderMonthlyPaidProfitChart() {
  const now = jToday();
  const months = Array.from({length:12},(_,n)=>jAddMonths(now, n-11));
  const rows = months.map(j => {
    const start = jalaliObjToGreg(j.y, j.m, 1);
    const end = jalaliObjToGreg(j.y, j.m, jdpMonthLen(j.y, j.m));
    return { label: monthKeyFromJ(j), paid: investors.reduce((s,i)=>s+getInvestorTransactions(i).filter(t=>t.type==='profit_payment' && t.date>=start && t.date<=end).reduce((a,t)=>a+Number(t.amount),0),0) };
  });
  const max = Math.max(...rows.map(r=>r.paid), 1);
  return `<div class="monthly-chart">${rows.map(r=>`<div class="month-col"><div class="month-bar" style="height:${Math.max(6, r.paid/max*120)}px"></div><span>${toFarsi(r.label.split('/')[1])}</span><em>${formatMoney(r.paid)}</em></div>`).join('')}</div>`;
}
