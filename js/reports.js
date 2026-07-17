// ===== Personal Report =====
let prInvId = null;
let prFrom = '';
let prTo = '';

function renderPersonal() {
  const el = document.getElementById('personalContent');
  if (!investors.length) {
    el.innerHTML = '<div class="empty-state"><div class="ei">🧾</div><p>سرمایه‌گذاری ثبت نشده</p></div>';
    return;
  }
  if (!prInvId) prInvId = investors[0].id;
  const options = investors.map(i =>
    `<option value="${i.id}" ${i.id===prInvId?'selected':''}>${i.name}</option>`
  ).join('');

  el.innerHTML = `
    <div class="pr-toolbar">
      <div class="fg">
        <label>سرمایه‌گذار</label>
        <select id="prInvSelect" onchange="prInvId=this.value;renderPRTable()">
          ${options}
        </select>
      </div>
      <div class="fg">
        <label>از تاریخ شمسی</label>
        <div class="jdp-wrap">
          <input class="jdp-input" id="prFrom" placeholder="از تاریخ (اختیاری)" readonly onclick="jdpOpen('prFrom','jdp_prFrom',true)">
          <div class="jdp-popup" id="jdp_prFrom"></div>
        </div>
      </div>
      <div class="fg">
        <label>تا تاریخ شمسی</label>
        <div class="jdp-wrap">
          <input class="jdp-input" id="prTo" placeholder="تا تاریخ (اختیاری)" readonly onclick="jdpOpen('prTo','jdp_prTo',true)">
          <div class="jdp-popup" id="jdp_prTo"></div>
        </div>
      </div>
      <button class="btn btn-gold" onclick="renderPRTable()">نمایش گزارش</button>
      <button class="btn btn-secondary pr-print-hide" onclick="window.print()">🖨️ چاپ</button>
    </div>
    <div id="prTable"></div>
  `;
  // Restore picker values if already set
  if (prFrom) document.getElementById('prFrom').value = prFrom;
  if (prTo)   document.getElementById('prTo').value   = prTo;
  renderPRTable();
}

function parseJalaliInput(str) {
  if (!str) return null;
  const parts = str.replace(/-/g,'/').split('/');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function renderPRTable() {
  const inv = investors.find(i => i.id === prInvId);
  if (!inv) return;
  const el = document.getElementById('prTable');
  if (!el) return;

  // Read directly from inputs (not state vars) — state vars used only for restore after re-render
  const fromInput = document.getElementById('prFrom');
  const toInput   = document.getElementById('prTo');
  prFrom = fromInput ? fromInput.value : prFrom;
  prTo   = toInput   ? toInput.value   : prTo;

  const fromJ = parseJalaliInput(prFrom);
  const toJ   = parseJalaliInput(prTo) || jToday();

  // Build full ledger (profit rows + payment rows) within range
  const allProfits = buildProfitSchedule(inv, toJ);
  const allPayments = [...(inv.payments||[])].sort((a,b)=>a.date.localeCompare(b.date));

  // Convert payments to Jalali for display & filtering
  const payRows = allPayments.map(p => ({
    jDate: gregStrToJalali(p.date),
    gregDate: p.date,
    amount: Number(p.amount),
    note: p.note || '',
    isPayment: true,
    id: p.id
  }));

  // Filter to range
  const filteredProfits  = allProfits.filter(r => (!fromJ || jCmp(r.jDate, fromJ) >= 0) && jCmp(r.jDate, toJ) <= 0);
  const filteredPayments = payRows.filter(r => (!fromJ || jCmp(r.jDate, fromJ) >= 0) && jCmp(r.jDate, toJ) <= 0);

  // Merge and sort all events chronologically
  const allEvents = [
    ...filteredProfits.map(r => ({ ...r, type: 'profit' })),
    ...filteredPayments.map(r => ({ ...r, type: 'payment' }))
  ].sort((a,b) => {
    const c = jCmp(a.jDate, b.jDate);
    if (c !== 0) return c;
    return a.type === 'profit' ? -1 : 1; // profit before payment on same day
  });

  // Running balance (positive = ما بدهکاریم / negative = او بستانکاره)
  // Start balance: sum of profits BEFORE fromJ minus payments BEFORE fromJ
  let openingBalance = 0;
  if (fromJ) {
    const prevProfits   = allProfits.filter(r => jCmp(r.jDate, fromJ) < 0).reduce((s,r)=>s+r.amount,0);
    const prevPayments  = payRows.filter(r => jCmp(r.jDate, fromJ) < 0).reduce((s,r)=>s+r.amount,0);
    openingBalance = prevProfits - prevPayments;
  }

  let balance = openingBalance;
  let totalProfitInRange   = filteredProfits.reduce((s,r)=>s+r.amount,0);
  let totalPaymentInRange  = filteredPayments.reduce((s,r)=>s+r.amount,0);

  // Summary strip
  const mp = monthlyProfit(inv);
  const finalBalance = balance + totalProfitInRange - totalPaymentInRange;

  const summaryHTML = `
    <div class="pr-print-header">گزارش مالی — ${inv.name}${fromJ?` — از ${toFarsi(fromJ.y)}/${toFarsi(fromJ.m)}/${toFarsi(fromJ.d)}`:''}${` تا ${toFarsi(toJ.y)}/${toFarsi(toJ.m)}/${toFarsi(toJ.d)}`}</div>
    <div class="pr-summary-strip">
      <div class="ic"><div class="ic-label">سرمایه</div><div class="ic-val gold">${formatMoney(activeCapital(inv))}</div><div class="ic-sub">${toFarsi(inv.rate)}٪ در ماه</div></div>
      <div class="ic"><div class="ic-label">سود در این بازه</div><div class="ic-val red">${formatMoney(totalProfitInRange)}</div><div class="ic-sub">${toFarsi(filteredProfits.length)} ماه × ${formatMoney(mp)}</div></div>
      <div class="ic"><div class="ic-label">پرداخت در این بازه</div><div class="ic-val green">${formatMoney(totalPaymentInRange)}</div><div class="ic-sub">${toFarsi(filteredPayments.length)} تراکنش</div></div>
      <div class="ic"><div class="ic-label">مانده پایان بازه</div>
        <div class="ic-val ${finalBalance>0?'red':finalBalance<0?'green':''}">
          ${finalBalance===0 ? 'تسویه' : (finalBalance>0 ? `${formatMoney(finalBalance)} بدهکار` : `${formatMoney(-finalBalance)} بستانکار`)}
        </div>
        <div class="ic-sub">${finalBalance>0?'ما به او بدهکاریم':finalBalance<0?'او به ما بدهکاره':'تسویه کامل'}</div>
      </div>
    </div>
  `;

  if (allEvents.length === 0) {
    el.innerHTML = summaryHTML + '<div class="empty-state" style="height:200px"><p>در این بازه تراکنشی وجود ندارد</p></div>';
    return;
  }

  // Build ledger rows
  let rows = '';
  if (fromJ && openingBalance !== 0) {
    rows += `<tr style="background:#111820">
      <td colspan="3" style="color:var(--text-muted);font-style:italic">مانده ابتدای بازه</td>
      <td></td>
      <td class="${openingBalance>0?'bal-pos':openingBalance<0?'bal-neg':'bal-zero'}">
        ${openingBalance===0?'تسویه':openingBalance>0?`${formatMoney(openingBalance)} بدهکار`:`${formatMoney(-openingBalance)} بستانکار`}
      </td>
    </tr>`;
  }

  for (const ev of allEvents) {
    const dateStr = `${toFarsi(ev.jDate.y)}/${toFarsi(String(ev.jDate.m).padStart(2,'0'))}/${toFarsi(String(ev.jDate.d).padStart(2,'0'))}`;
    if (ev.type === 'profit') {
      balance += ev.amount;
      rows += `<tr class="row-profit">
        <td>${dateStr}</td>
        <td>${ev.label}</td>
        <td class="debit">${formatMoney(ev.amount)}</td>
        <td>—</td>
        <td class="${balance>0?'bal-pos':balance<0?'bal-neg':'bal-zero'}">
          ${balance===0?'✅ تسویه':balance>0?`${formatMoney(balance)} بدهکار`:`${formatMoney(-balance)} بستانکار`}
        </td>
      </tr>`;
    } else {
      balance -= ev.amount;
      rows += `<tr class="row-payment">
        <td>${dateStr}</td>
        <td>${ev.note || 'پرداخت سود'}</td>
        <td>—</td>
        <td class="credit">${formatMoney(ev.amount)}</td>
        <td class="${balance>0?'bal-pos':balance<0?'bal-neg':'bal-zero'}">
          ${balance===0?'✅ تسویه':balance>0?`${formatMoney(balance)} بدهکار`:`${formatMoney(-balance)} بستانکار`}
        </td>
      </tr>`;
    }
  }

  el.innerHTML = summaryHTML + `
    <div class="table-wrap">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>تاریخ</th>
            <th>شرح</th>
            <th style="color:var(--red)">بدهکار (سود)</th>
            <th style="color:var(--green)">بستانکار (پرداخت)</th>
            <th>مانده</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--text-muted);padding:0 4px">
      🔴 ردیف‌های قرمز = سود اضافه شده &nbsp;|&nbsp; 🟢 ردیف‌های سبز = پرداخت دریافت شده
    </div>
  `;
}


function renderProfitScheduleRows(inv) {
  const todayJ = jToday();
  const schedule = buildProfitSchedule(inv); // up to today only
  if (!schedule.length) return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">سررسیدی برای نمایش وجود ندارد</div>';

  // Which months are paid — match by label
  const paidLabels = new Set((inv.payments || []).map(p => p.note));

  let rows = '';
  for (const row of [...schedule].reverse()) {
    const isPaid  = paidLabels.has(row.label);
    const dateStr = `${toFarsi(row.jDate.y)}/${toFarsi(String(row.jDate.m).padStart(2,'0'))}/${toFarsi(String(row.jDate.d).padStart(2,'0'))}`;
    const balStr  = formatMoney(Math.round(row.balanceAfter));
    let statusBadge, actionBtn;
    if (isPaid) {
      statusBadge = `<span class="badge b-green">✅ پرداخت شده</span>`;
      actionBtn   = '';
    } else {
      statusBadge = `<span class="badge b-red">⏰ پرداخت نشده</span>`;
      actionBtn   = `<button class="btn btn-success btn-sm" onclick="quickPayProfit('${inv.id}','${row.label}',${Math.round(row.amount)},'${row.gregDate}')">ثبت پرداخت</button>`;
    }
    rows += `<tr>
      <td>${dateStr}</td>
      <td>${row.label}</td>
      <td style="color:var(--red);font-weight:600">${formatMoney(Math.round(row.amount))}</td>
      <td style="color:var(--gold-light)">${balStr}</td>
      <td>${statusBadge}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }
  return `<table>
    <thead><tr><th>تاریخ سررسید</th><th>شرح</th><th>سود</th><th>مانده بعد از پرداخت</th><th>وضعیت</th><th>عملیات</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function quickPayProfit(invId, label, amount, gregDate) {
  if (!confirm(`ثبت پرداخت سود:\n${label}\nمبلغ: ${Math.round(amount).toLocaleString('fa-IR')} تومان`)) return;
  const inv = investors.find(i => i.id === invId);
  const tx = newTransaction(invId, 'profit_payment', Math.round(amount), gregDate, label);
  const payments = [...(inv.payments || []), { id: tx.id, amount: tx.amount, date: tx.date, note: label, createdAt: tx.createdAt }];
  const transactions = [...getInvestorTransactions(inv), tx];
  await saveInvestorDB({ ...inv, payments, transactions }, invId);
  selectedId = invId;
  renderDetail();
  updateStats();
  toast('✅ پرداخت سود ثبت شد');
}


// ===== Report =====
function renderReport() {
  const el = document.getElementById('reportContent');
  if (!investors.length) {
    el.innerHTML = '<div class="empty-state"><div class="ei">📊</div><p>داده‌ای برای نمایش وجود ندارد</p></div>';
    return;
  }

  const totalCap = investors.reduce((s,i) => s+activeCapital(i), 0);
  const totalMp = investors.reduce((s,i) => s+monthlyProfit(i), 0);
  const totalTp = investors.reduce((s,i) => s+totalProfit(i), 0);
  const totalPaidAll = investors.reduce((s,i) => s+totalPaid(i), 0);
  const totalDue = investors.reduce((s,i) => s+unpaid(i), 0);
  const settled = investors.filter(i => unpaid(i) === 0).length;

  // capital bars
  const maxCap = Math.max(...investors.map(i => activeCapital(i)));
  const capBars = investors.map(i => `
    <div class="bar-row">
      <div class="bar-label">${i.name}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(activeCapital(i)/maxCap*100).toFixed(1)}%"></div></div>
      <div class="bar-val">${formatMoney(activeCapital(i))}</div>
    </div>`).join('');

  // unpaid bars
  const maxDue = Math.max(...investors.map(i => unpaid(i)), 1);
  const dueBars = investors.map(i => {
    const d = unpaid(i);
    return `
    <div class="bar-row">
      <div class="bar-label">${i.name}</div>
      <div class="bar-track"><div class="bar-fill ${d > 0 ? 'red' : 'green'}" style="width:${d > 0 ? (d/maxDue*100).toFixed(1) : '100'}%"></div></div>
      <div class="bar-val">${d > 0 ? formatMoney(d) : '<span style="color:var(--green)">تسویه</span>'}</div>
    </div>`;}).join('');

  // summary table
  const tRows = investors.map((inv, idx) => {
    const mp = monthlyProfit(inv);
    const tp = totalProfit(inv);
    const paid = totalPaid(inv);
    const due = unpaid(inv);
    const months = buildProfitSchedule(inv).length;
    return `<tr>
      <td>${toFarsi(idx+1)}</td>
      <td>${inv.name}</td>
      <td>${formatMoney(activeCapital(inv))}</td>
      <td>${toFarsi(inv.rate)}٪</td>
      <td>${formatMoney(mp)}</td>
      <td>${toFarsi(months)} ماه</td>
      <td>${formatMoney(tp)}</td>
      <td>${formatMoney(paid)}</td>
      <td>${due > 0 ? `<span class="badge b-red">${formatMoney(due)}</span>` : `<span class="badge b-green">تسویه</span>`}</td>
    </tr>`;}).join('');

  el.innerHTML = `
    <div class="report-title">گزارش کلی سرمایه‌گذاران</div>

    <div class="report-grid" style="margin-bottom:24px">
      <div class="ic"><div class="ic-label">کل سرمایه تحت مدیریت</div><div class="ic-val gold">${formatMoney(totalCap)}</div><div class="ic-sub">تومان</div></div>
      <div class="ic"><div class="ic-label">سود ماهیانه کل</div><div class="ic-val green">${formatMoney(totalMp)}</div><div class="ic-sub">تومان / ماه</div></div>
      <div class="ic"><div class="ic-label">کل سود انباشته</div><div class="ic-val blue">${formatMoney(totalTp)}</div><div class="ic-sub">تومان</div></div>
      <div class="ic"><div class="ic-label">کل پرداخت شده</div><div class="ic-val green">${formatMoney(totalPaidAll)}</div><div class="ic-sub">تومان</div></div>
      <div class="ic"><div class="ic-label">کل پرداخت نشده</div><div class="ic-val red">${formatMoney(totalDue)}</div><div class="ic-sub">تومان</div></div>
      <div class="ic"><div class="ic-label">وضعیت تسویه</div><div class="ic-val" style="font-size:14px;margin-top:6px"><span class="badge b-green">${toFarsi(settled)} تسویه</span> <span class="badge b-red">${toFarsi(investors.length-settled)} بدهکار</span></div></div>
    </div>

    <div class="report-section">
      <div class="bar-chart">
        <div class="chart-title">سرمایه هر شخص (تومان)</div>
        ${capBars}
      </div>
    </div>

    <div class="report-section">
      <div class="bar-chart">
        <div class="chart-title">سود پرداخت نشده هر شخص</div>
        ${dueBars}
      </div>
    </div>

    <div class="report-section">
      <div class="sec-title"><span>جدول کامل</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>نام</th><th>سرمایه</th><th>نرخ</th><th>سود ماهیانه</th><th>مدت</th><th>کل سود</th><th>پرداختی</th><th>مانده</th></tr></thead>
        <tbody>${tRows}</tbody>
      </table></div>
    </div>`;
}
