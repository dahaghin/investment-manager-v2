// ===== Stats =====
function updateStats() {
  const grouped = (selector) => {
    const rows = ['IRT','USD','AED'].map(currency => {
      const total = investors.filter(i => (i.currency || 'IRT') === currency)
        .reduce((sum, inv) => sum + Number(selector(inv) || 0), 0);
      if (!total) return '';
      const label = currency === 'IRT' ? 'تومان' : currency === 'USD' ? 'دلار آمریکا' : 'درهم امارات';
      return '<div class="stat-currency-row"><span>' + label + '</span><strong>' + investorMoney({currency}, total) + '</strong></div>';
    }).filter(Boolean);
    return rows.length ? '<div class="stat-currency-lines">' + rows.join('') + '</div>' : '—';
  };
  document.getElementById('stCapital').innerHTML = grouped(activeCapital);
  document.getElementById('stMonthly').innerHTML = grouped(totalProfit);
  document.getElementById('stCount').innerHTML = grouped(inv => getInvestorTransactions(inv).filter(t => t.type === 'settlement' && t.date === todayGregorian()).reduce((s,t) => s + Number(t.amount), 0));
  document.getElementById('stUnpaid').innerHTML = grouped(totalPaid);
  const todayG = todayGregorian();
  const in7G = new Date(); in7G.setDate(in7G.getDate()+7);
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
  if (typeof syncMobileNav === 'function') syncMobileNav(tab);
  if (tab === 'dashboard') renderManagementDashboard();
  if (tab === 'report')   renderReport();
  if (tab === 'personal') renderPersonal();
  if (tab === 'my-investments') renderMyInvestments();
  if (tab === 'dollar-performance') loadDollarPerformance();
  if (tab === 'investor-dollar') loadInvestorDollarPerformance();
  if (tab === 'cheques')  renderCheques();
  if (tab === 'archive') renderArchive();
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
        <div class="inv-amt">${investorMoney(inv, activeCapital(inv))}</div>
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
  // When the USD performance page is open, selecting a name in the shared
  // investor sidebar immediately recalculates that investor's USD comparison.
  if (document.getElementById('tab-dollar-performance')?.classList.contains('active')) {
    if (typeof loadInvestorDollarPerformance === 'function') loadInvestorDollarPerformance(id);
  }
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
  const archiveReady = activeCapital(inv) <= 0 && (isSettled(inv) || unpaid(inv) <= 0);
  const statusFa = { Active:'فعال', Settled:'تسویه شده', 'Pending Payment':'در انتظار پرداخت', Overdue:'معوق' }[invStatus] || invStatus;
  const nextDate = nextProfitDate(inv);

  const payments = inv.payments || [];
  const timelineHTML = renderTimeline(inv.id);
  const pRows = payments.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">پرداختی ثبت نشده</td></tr>`
    : [...payments].reverse().map((p,i) => `
      <tr>
        <td>${toFarsi(payments.length - i)}</td>
        <td>${investorMoney(inv, p.amount)}</td>
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
        <button class="btn btn-gold" onclick="openTransactionModal('${inv.id}')">+ تراکنش</button>
        <button class="btn btn-secondary" onclick="openEditModal('${inv.id}')">ویرایش</button>
        <button class="btn btn-secondary" onclick="archiveInvestor('${inv.id}')" title="ابتدا تسویه کامل اصل و سود را بررسی می‌کند">🗄️ بایگانی</button>
        <button class="btn btn-danger" onclick="confirmDelete('${inv.id}')">حذف</button>
      </div>
    </div>

    <div class="info-grid">
      <div class="ic"><div class="ic-label">Active Capital</div><div class="ic-val gold">${investorMoney(inv, activeCapital(inv))}</div><div class="ic-sub">سرمایه فعال</div></div>
      <div class="ic"><div class="ic-label">Current Account Value</div><div class="ic-val gold">${investorMoney(inv, Math.round(curBal))}</div><div class="ic-sub">اصل + سود انباشته</div></div>
      <div class="ic"><div class="ic-label">Next Profit Date</div><div class="ic-val green">${nextDate ? milToJalali(nextDate) : '—'}</div><div class="ic-sub">سود بعدی: ${investorMoney(inv, Math.round(mp))}</div></div>
      <div class="ic"><div class="ic-label">Accumulated Profit (${toFarsi(months)} ماه)</div><div class="ic-val blue">${investorMoney(inv, Math.round(tp))}</div><div class="ic-sub">از ${milToJalali(inv.startDate)}</div></div>
      <div class="ic"><div class="ic-label">Paid Profit</div><div class="ic-val green">${investorMoney(inv, paid)}</div><div class="ic-sub">سود پرداخت‌شده</div></div>
      <div class="ic"><div class="ic-label">Status</div><div class="ic-val ${invStatus === 'Overdue' ? 'red' : invStatus === 'Settled' ? 'green' : 'blue'}">${statusFa}</div><div class="ic-sub">سود پرداخت‌نشده: ${investorMoney(inv, Math.round(due))}</div></div>
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
    </div>

    <div class="section">
      <div class="sec-title"><span>تایم‌لاین سرمایه‌گذار</span><span>آخرین رویدادها</span></div>
      ${timelineHTML}
    </div>

    <div class="section">
      <div class="sec-title"><span>دفتر کل تراکنش‌ها</span><span>${toFarsi(getInvestorTransactions(inv).length)} تراکنش</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>نوع</th><th>مبلغ</th><th>تاریخ</th><th>توضیحات</th></tr></thead>
        <tbody>${renderTransactionRows(inv)}</tbody>
      </table></div>
    </div>`;
}

function renderTransactionRows(inv) {
  const rows = getInvestorTransactions(inv);
  if (!rows.length) return `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">تراکنشی ثبت نشده</td></tr>`;
  return [...rows].reverse().map(t => `
    <tr>
      <td>${transactionTypeLabel(t.type)}</td>
      <td>${investorMoney(inv, t.amount)}</td>
      <td>${milToJalali(t.date)}</td>
      <td>${t.description || '—'}</td>
    </tr>`).join('');
}

function renderArchive() {
  const host = document.getElementById('archiveContent');
  if (!host) return;
  const list = archivedInvestors || [];
  if (!list.length) { host.innerHTML = '<div class="empty-state"><div class="ei">🗄️</div><p>هنوز سرمایه‌گذاری‌ای بایگانی نشده است.</p><small>پس از تسویه کامل، از صفحه سرمایه‌گذار دکمه بایگانی را بزنید.</small></div>'; return; }
  if (!selectedArchivedId || !list.some(inv => inv.id === selectedArchivedId)) selectedArchivedId = list[0].id;
  const inv = list.find(x => x.id === selectedArchivedId);
  const items = list.map(x => '<button class="archive-item ' + (x.id === inv.id ? 'active' : '') + '" onclick="selectArchivedInvestor(\'' + x.id + '\')"><b>' + (x.name || x.fullName || 'بدون نام') + '</b><span>' + investorMoney(x, activeCapital(x)) + '</span><small>بایگانی: ' + milToJalali(String(x.archivedAt).slice(0,10)) + '</small></button>').join('');
  const tx = getInvestorTransactions(inv);
  const rows = tx.length ? [...tx].reverse().map(t => '<tr><td>' + transactionTypeLabel(t.type) + '</td><td>' + investorMoney(inv,t.amount) + '</td><td>' + milToJalali(t.date) + '</td><td>' + (t.description || '—') + '</td></tr>').join('') : '<tr><td colspan="4">تراکنشی ثبت نشده است.</td></tr>';
  const payments = tx.filter(t => t.type === 'profit_payment');
  const paymentRows = payments.length ? [...payments].reverse().map((t,i) => '<tr><td>' + toFarsi(payments.length-i) + '</td><td>' + investorMoney(inv,t.amount) + '</td><td>' + milToJalali(t.date) + '</td><td>' + (t.description || 'پرداخت سود') + '</td></tr>').join('') : '<tr><td colspan="4">پرداخت سودی ثبت نشده است.</td></tr>';
  host.innerHTML = '<div class="archive-layout"><aside class="archive-list"><div class="sec-title">سرمایه‌گذاران بایگانی‌شده <span>' + toFarsi(list.length) + ' نفر</span></div>' + items + '</aside><section class="archive-detail"><div class="detail-head"><div><div class="d-name">' + (inv.name || inv.fullName || 'بدون نام') + '</div><div class="d-phone">' + (inv.phone || 'شماره ثبت نشده') + ' · بایگانی در ' + milToJalali(String(inv.archivedAt).slice(0,10)) + '</div></div><div class="dh-actions"><button class="btn btn-secondary" onclick="restoreArchivedInvestor(\'' + inv.id + '\')">بازگرداندن به سرمایه‌گذاران فعال</button></div></div><div class="info-grid"><div class="ic"><div class="ic-label">واحد سرمایه</div><div class="ic-val gold">' + investorCurrencyLabel(inv.currency || 'IRT') + '</div></div><div class="ic"><div class="ic-label">کل پرداخت سود ثبت‌شده</div><div class="ic-val green">' + investorMoney(inv,totalPaid(inv)) + '</div></div><div class="ic"><div class="ic-label">تعداد تراکنش‌ها</div><div class="ic-val blue">' + toFarsi(tx.length) + '</div></div></div><div class="section"><div class="sec-title">سابقه پرداخت سود</div><div class="table-wrap"><table><thead><tr><th>#</th><th>مبلغ</th><th>تاریخ</th><th>توضیحات</th></tr></thead><tbody>' + paymentRows + '</tbody></table></div></div><div class="section"><div class="sec-title">دفتر کل کامل تراکنش‌ها</div><div class="table-wrap"><table><thead><tr><th>نوع</th><th>مبلغ</th><th>تاریخ</th><th>توضیحات</th></tr></thead><tbody>' + rows + '</tbody></table></div></section></div>';
}
function selectArchivedInvestor(id) { selectedArchivedId = id; renderArchive(); }