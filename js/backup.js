// ===== Cheques =====
const CHQ_TYPES = { profit:'سود', capital:'اصل سرمایه', both:'اصل + سود', other:'سایر' };

function chqDueStatus(dueDate) {
  const today = todayGregorian();
  const in7   = new Date(); in7.setDate(in7.getDate()+7);
  const in7Str = in7.toISOString().split('T')[0];
  if (dueDate < today) return 'overdue';
  if (dueDate <= in7Str) return 'soon';
  return 'future';
}

function renderCheques() {
  const el = document.getElementById('chequesContent');
  const todayG = todayGregorian();
  const in7G   = new Date(); in7G.setDate(in7G.getDate()+7);
  const in7Str = in7G.toISOString().split('T')[0];

  // Alert banner
  const overdue = cheques.filter(c => !c.cashed && c.dueDate < todayG);
  const soon    = cheques.filter(c => !c.cashed && c.dueDate >= todayG && c.dueDate <= in7Str);
  let bannerHTML = '';
  if (overdue.length > 0 || soon.length > 0) {
    bannerHTML = `<div class="chq-alert-banner">
      <span style="font-size:20px">⚠️</span>
      <span>
        ${overdue.length > 0 ? `<strong style="color:var(--red)">${toFarsi(overdue.length)} چک سررسید گذشته</strong>` : ''}
        ${overdue.length > 0 && soon.length > 0 ? ' · ' : ''}
        ${soon.length > 0 ? `<strong style="color:var(--gold-light)">${toFarsi(soon.length)} چک این هفته سررسید</strong>` : ''}
      </span>
    </div>`;
  }

  // Filter
  let filtered = cheques;
  if (chqFilter === 'overdue') filtered = cheques.filter(c => !c.cashed && c.dueDate < todayG);
  else if (chqFilter === 'soon') filtered = cheques.filter(c => !c.cashed && c.dueDate >= todayG && c.dueDate <= in7Str);
  else if (chqFilter === 'pending') filtered = cheques.filter(c => !c.cashed);
  else if (chqFilter === 'cashed') filtered = cheques.filter(c => c.cashed);

  // Sort: overdue first, then by date
  filtered = [...filtered].sort((a,b) => {
    if (!a.cashed && b.cashed) return -1;
    if (a.cashed && !b.cashed) return 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const cards = filtered.length === 0
    ? `<div class="empty-state" style="height:200px"><div class="ei">🏦</div><p>چکی در این دسته وجود ندارد</p></div>`
    : filtered.map(c => {
        const status = c.cashed ? 'cashed' : chqDueStatus(c.dueDate);
        const statusLabel = {
          overdue: `<span class="badge b-red">⏰ سررسید گذشته</span>`,
          soon:    `<span class="badge b-yellow">⚡ این هفته</span>`,
          future:  `<span class="badge" style="background:#1a1a2e;color:var(--blue);border:1px solid #2a2a4e">📅 آینده</span>`,
          cashed:  `<span class="badge b-green">✅ وصول شد</span>`
        }[status];
        const dueDateStr = milToJalali(c.dueDate);
        const typeLabel  = CHQ_TYPES[c.type] || c.type;
        return `
          <div class="cheque-card">
            <div>
              <div class="chq-name">${c.owner}</div>
              <div class="chq-bank">${c.bank ? c.bank + (c.number ? ' · ' + c.number : '') : (c.number || '')}</div>
              <div style="font-size:11px;color:var(--purple);margin-top:2px">${typeLabel}${c.note ? ' · ' + c.note : ''}</div>
            </div>
            <div class="chq-amount">${formatMoney(c.amount)}</div>
            <div>
              <div class="chq-date ${status}">${dueDateStr}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${statusLabel}</div>
            </div>
            <div class="chq-actions">
              ${!c.cashed ? `<button class="btn btn-success btn-sm" onclick="cashCheque('${c.id}')">✅ وصول شد</button>` : ''}
              <button class="btn btn-secondary btn-sm" onclick="editCheque('${c.id}')">ویرایش</button>
              <button class="btn btn-danger btn-sm" onclick="deleteCheque('${c.id}')">حذف</button>
            </div>
          </div>`;
      }).join('');

  // Summary
  const totalPending = cheques.filter(c=>!c.cashed).reduce((s,c)=>s+Number(c.amount),0);
  const totalCashed  = cheques.filter(c=>c.cashed).reduce((s,c)=>s+Number(c.amount),0);

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="font-size:18px;font-weight:700;color:var(--gold-light)">🏦 مدیریت چک‌ها</div>
      <button class="btn btn-gold" onclick="openChequeModal()">+ ثبت چک جدید</button>
    </div>

    <div class="report-grid" style="margin-bottom:20px">
      <div class="ic"><div class="ic-label">کل چک‌ها</div><div class="ic-val" style="color:var(--purple)">${toFarsi(cheques.length)}</div><div class="ic-sub">عدد</div></div>
      <div class="ic"><div class="ic-label">در انتظار وصول</div><div class="ic-val red">${formatMoney(totalPending)}</div><div class="ic-sub">${toFarsi(cheques.filter(c=>!c.cashed).length)} چک</div></div>
      <div class="ic"><div class="ic-label">وصول شده</div><div class="ic-val green">${formatMoney(totalCashed)}</div><div class="ic-sub">${toFarsi(cheques.filter(c=>c.cashed).length)} چک</div></div>
    </div>

    ${bannerHTML}

    <div class="cheque-filters">
      <span style="font-size:12px;color:var(--text-muted)">فیلتر:</span>
      ${[
        ['all','همه'],['pending','در انتظار'],['overdue','سررسید گذشته'],['soon','این هفته'],['cashed','وصول شده']
      ].map(([k,v]) => `<button class="chq-filter-btn ${chqFilter===k?'active':''}" onclick="chqFilter='${k}';renderCheques()">${v}</button>`).join('')}
    </div>

    <div id="chqCards">${cards}</div>
  `;
}

function openChequeModal(id) {
  editChequeId = id || null;
  document.getElementById('chequeModalTitle').textContent = id ? 'ویرایش چک' : 'ثبت چک جدید';
  if (id) {
    const c = cheques.find(x => x.id === id);
    document.getElementById('chq_owner').value  = c.owner || '';
    document.getElementById('chq_bank').value   = c.bank  || '';
    document.getElementById('chq_number').value = c.number|| '';
    document.getElementById('chq_amount').value = c.amount|| '';
    document.getElementById('chq_due').value    = gregorianToJalaliStr(c.dueDate) || '';
    document.getElementById('chq_type').value   = c.type  || 'profit';
    document.getElementById('chq_note').value   = c.note  || '';
  } else {
    ['chq_owner','chq_bank','chq_number','chq_note'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('chq_amount').value = '';
    document.getElementById('chq_due').value = '';
    document.getElementById('chq_type').value = 'profit';
  }
  document.getElementById('chequeModal').classList.add('show');
}

function editCheque(id) { openChequeModal(id); }

async function saveCheque() {
  const owner  = document.getElementById('chq_owner').value.trim();
  const amount = Number(document.getElementById('chq_amount').value);
  const dueJ   = document.getElementById('chq_due').value.trim();
  if (!owner || !amount || !dueJ) { toast('نام، مبلغ و تاریخ سررسید الزامی است', true); return; }
  const dueDate = jalaliInputToGregorian(dueJ);
  if (!dueDate || dueDate.length < 8) { toast('فرمت تاریخ اشتباه است', true); return; }
  const data = {
    owner, amount,
    bank:   document.getElementById('chq_bank').value.trim(),
    number: document.getElementById('chq_number').value.trim(),
    dueDate,
    type:   document.getElementById('chq_type').value,
    note:   document.getElementById('chq_note').value.trim(),
    cashed: editChequeId ? (cheques.find(c=>c.id===editChequeId)?.cashed || false) : false
  };
  try {
    if (editChequeId) {
      await chqCol().doc(editChequeId).update(data);
    } else {
      await chqCol().add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    closeModal('chequeModal');
    await loadInvestors();
    renderCheques();
    toast('✅ چک ذخیره شد');
  } catch(e) { toast('❌ خطا: ' + e.message, true); }
}

async function cashCheque(id) {
  if (!confirm('این چک وصول شد؟')) return;
  await chqCol().doc(id).update({ cashed: true, cashedDate: todayGregorian() });
  await loadInvestors();
  renderCheques();
  toast('✅ چک وصول شد');
}

async function deleteCheque(id) {
  if (!confirm('این چک حذف شود؟')) return;
  await chqCol().doc(id).delete();
  await loadInvestors();
  renderCheques();
  toast('چک حذف شد');
}
