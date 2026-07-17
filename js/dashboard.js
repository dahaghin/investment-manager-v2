// ===== Stats =====
function updateStats() {
  document.getElementById('stCapital').textContent = formatMoney(investors.reduce((s,i) => s+activeCapital(i),0));
  document.getElementById('stMonthly').textContent = formatMoney(investors.reduce((s,i) => s+totalProfit(i),0));
  document.getElementById('stCount').textContent = formatMoney(investors.reduce((sum, inv) => sum + getInvestorTransactions(inv).filter(t => t.type === 'settlement' && t.date === todayGregorian()).reduce((s,t) => s + Number(t.amount), 0), 0));
  document.getElementById('stUnpaid').textContent = formatMoney(investors.reduce((s,i) => s+totalPaid(i),0));
  // Cheques due in next 7 days
  const todayG = todayGregorian();
  const in7G   = new Date(); in7G.setDate(in7G.getDate()+7);
  const in7Str = in7G.toISOString().split('T')[0];
  const alertCount = cheques.filter(c => !c.cashed && c.dueDate >= todayG && c.dueDate <= in7Str).length;
  const overdueCount = cheques.filter(c => !c.cashed && c.dueDate < todayG).length;
  const el = document.getElementById('stCheques');
  if (el) {
    const total = alertCount + overdueCount;
    el.textContent = toFarsi(total);
    el.parentElement.style.borderRight = total > 0 ? '3px solid var(--purple)' : '';
  }
}


// ===== Tabs =====
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (tab === 'report')   renderReport();
  if (tab === 'personal') renderPersonal();
  if (tab === 'cheques')  renderCheques();
}


function renderList() {
  const list = document.getElementById('invList');
  if (!investors.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">سرمایه‌گذاری ثبت نشده</div>';
    return;
  }
  list.innerHTML = investors.map(inv => `
    <div class="inv-item ${inv.id === selectedId ? 'active' : ''}" onclick="selectInv('${inv.id}')">
      <div class="avatar">${inv.name.charAt(0)}</div>
      <div class="inv-info">
        <div class="inv-name">${inv.name}</div>
        <div class="inv-amt">${formatMoney(activeCapital(inv))} تومان</div>
      </div>
      <div class="inv-badge">${toFarsi(inv.rate)}٪</div>
    </div>
  `).join('');
}


// ===== Detail =====
function selectInv(id) {
  selectedId = id;
  renderList();
  renderDetail();
  if (window.innerWidth < 700) {
    document.querySelector('.content-area').scrollIntoView({ behavior: 'smooth' });
  }
}

function renderDetail() {
  const inv = investors.find(i => i.id === selectedId);
  if (!inv) return;
  document.getElementById('emptyState').style.display = 'none';
  const panel = document.getElementById('detailPanel');
  panel.style.display = 'block';

  const mp = monthlyProfit(inv);
  const tp = totalProfit(inv);
  const paid = totalPaid(inv);
  const due = unpaid(inv);
  const months = buildProfitSchedule(inv).length;
  const curBal = currentBalance(inv);
  const invStatus = investorStatus(inv);
  const statusFa = { Active:'فعال', Settled:'تسویه شده', 'Pending Payment':'در انتظار پرداخت', Overdue:'معوق' }[invStatus] || invStatus;
  const nextDate = nextProfitDate(inv);

  const payments = inv.payments || [];
  const pRows = payments.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">پرداختی ثبت نشده</td></tr>`
    : [...payments].reverse().map((p,i) => `
      <tr>
        <td>${toFarsi(payments.length - i)}</td>
        <td>${formatMoney(p.amount)} تومان</td>
        <td>${milToJalali(p.date)}</td>
        <td>${p.note || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deletePayment('${inv.id}','${p.id}')">حذف</button></td>
      </tr>`).join('');

  panel.innerHTML = `
    <div class="detail-head">
      <div class="dh-left">
        <div class="d-avatar">${inv.name.charAt(0)}</div>
        <div>
          <div class="d-name">${inv.name}</div>
          <div class="d-phone">${inv.phone || 'شماره ثبت نشده'}${inv.notes ? ' · ' + inv.notes : ''}</div>
        </div>
      </div>
      <div class="dh-actions">
        <button class="btn btn-secondary" onclick="window.print()">🖨️ چاپ</button>
        <button class="btn btn-success" onclick="openPayModal('${inv.id}')">+ پرداخت</button>
        <button class="btn btn-secondary" onclick="openEditModal('${inv.id}')">ویرایش</button>
        <button class="btn btn-danger" onclick="confirmDelete('${inv.id}')">حذف</button>
      </div>
    </div>

    <div class="info-grid">
      <div class="ic"><div class="ic-label">Active Capital</div><div class="ic-val gold">${formatMoney(activeCapital(inv))}</div><div class="ic-sub">سرمایه فعال</div></div>
      <div class="ic"><div class="ic-label">Current Account Value</div><div class="ic-val gold">${formatMoney(Math.round(curBal))}</div><div class="ic-sub">اصل + سود انباشته</div></div>
      <div class="ic"><div class="ic-label">Next Profit Date</div><div class="ic-val green">${nextDate ? milToJalali(nextDate) : '—'}</div><div class="ic-sub">سود بعدی: ${formatMoney(Math.round(mp))}</div></div>
      <div class="ic"><div class="ic-label">Accumulated Profit (${toFarsi(months)} ماه)</div><div class="ic-val blue">${formatMoney(Math.round(tp))}</div><div class="ic-sub">از ${milToJalali(inv.startDate)}</div></div>
      <div class="ic"><div class="ic-label">Paid Profit</div><div class="ic-val green">${formatMoney(paid)}</div><div class="ic-sub">سود پرداخت‌شده</div></div>
      <div class="ic"><div class="ic-label">Status</div><div class="ic-val ${invStatus === 'Overdue' ? 'red' : invStatus === 'Settled' ? 'green' : 'blue'}">${statusFa}</div><div class="ic-sub">سود پرداخت‌نشده: ${formatMoney(Math.round(due))}</div></div>
    </div>

    <div class="section">
      <div class="sec-title"><span>جدول سررسیدهای سود</span><span style="font-size:11px;color:var(--text-muted)">۶ ماه آینده + گذشته پرداخت‌نشده</span></div>
      <div class="table-wrap" id="profitScheduleTable">
        ${renderProfitScheduleRows(inv)}
      </div>
    </div>

    <div class="section">
      <div class="sec-title"><span>تاریخچه پرداخت‌ها</span><span>${toFarsi(payments.length)} پرداخت</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>مبلغ</th><th>تاریخ</th><th>توضیحات</th><th>عملیات</th></tr></thead>
        <tbody>${pRows}</tbody>
      </table></div>
    </div>`;
}
