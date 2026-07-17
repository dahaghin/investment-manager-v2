// ===== Modals =====
function openAddModal() {
  editId = null;
  document.getElementById('invModalTitle').textContent = 'افزودن سرمایه‌گذار جدید';
  ['f_name','f_phone','f_notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f_capital').value = '';
  document.getElementById('f_rate').value = '';
  document.getElementById('f_start').value = todayJalali();
  document.getElementById('invModal').classList.add('show');
}

function openEditModal(id) {
  editId = id;
  const inv = investors.find(i => i.id === id);
  document.getElementById('invModalTitle').textContent = 'ویرایش اطلاعات';
  document.getElementById('f_name').value = inv.name;
  document.getElementById('f_phone').value = inv.phone || '';
  document.getElementById('f_capital').value = inv.capital;
  document.getElementById('f_rate').value = inv.rate;
  document.getElementById('f_start').value = gregorianToJalaliStr(inv.startDate);
  document.getElementById('f_notes').value = inv.notes || '';
  document.getElementById('invModal').classList.add('show');
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

async function saveInvestor() {
  const name = document.getElementById('f_name').value.trim();
  const phone = document.getElementById('f_phone').value.trim();
  const capital = Number(document.getElementById('f_capital').value);
  const rate = Number(document.getElementById('f_rate').value);
  const startDateJalali = document.getElementById('f_start').value.trim();
  const notes = document.getElementById('f_notes').value.trim();
  if (!name || !capital || !rate || !startDateJalali) { toast('لطفاً فیلدهای ستاره‌دار را پر کنید', true); return; }
  const startDate = jalaliInputToGregorian(startDateJalali);
  if (!startDate || startDate.length < 8) { toast('فرمت تاریخ اشتباه است. مثال: 1403/01/01', true); return; }
  try {
    if (editId) {
      const inv = investors.find(i => i.id === editId);
      await saveInvestorDB({ ...inv, name, phone, capital, rate, startDate, notes, transactions: getInvestorTransactions(inv) }, editId);
      closeModal('invModal');
      if (selectedId) renderDetail();
      updateStats();
    } else {
      const tmpId = `pending-${Date.now()}`;
      await saveInvestorDB({ name, phone, capital, rate, startDate, notes, payments: [], transactions: [newTransaction(tmpId, 'capital_deposit', capital, startDate, 'سرمایه اولیه')] }, null);
      closeModal('invModal');
      updateStats();
    }
    toast('✅ اطلاعات ذخیره شد');
  } catch(e) {
    console.error(e);
    toast('❌ خطا: ' + (e.code === 'permission-denied' ? 'دسترسی رد شد — Firestore Rules را درست کنید' : e.message), true);
  }
}


// ===== Payment =====
function openPayModal(id) {
  payInvId = id;
  const inv = investors.find(i => i.id === id);
  document.getElementById('p_amount').value = Math.round(monthlyProfit(inv));
  document.getElementById('p_date').value = todayJalali();
  document.getElementById('p_note').value = '';
  document.getElementById('payModal').classList.add('show');
}

async function savePayment() {
  const amount = Number(document.getElementById('p_amount').value);
  const dateJalali = document.getElementById('p_date').value.trim();
  const note = document.getElementById('p_note').value.trim();
  if (!amount || !dateJalali) { toast('مبلغ و تاریخ الزامی است', true); return; }
  const date = jalaliInputToGregorian(dateJalali);
  if (!date || date.length < 8) { toast('فرمت تاریخ اشتباه است. مثال: 1403/01/01', true); return; }
  try {
    const inv = investors.find(i => i.id === payInvId);
    const tx = newTransaction(payInvId, 'profit_payment', amount, date, note || 'پرداخت سود');
    const payments = [...(inv.payments || []), { id: tx.id, amount, date, note, createdAt: tx.createdAt }];
    const transactions = [...getInvestorTransactions(inv), tx];
    await saveInvestorDB({ ...inv, payments, transactions }, payInvId);
    closeModal('payModal');
    selectedId = payInvId;
    renderDetail();
    updateStats();
    toast('✅ پرداخت ثبت شد');
  } catch(e) {
    toast('❌ خطا: ' + (e.code === 'permission-denied' ? 'دسترسی رد شد — Firestore Rules را درست کنید' : e.message), true);
  }
}

async function deletePayment(invId, payId) {
  if (!confirm('این پرداخت حذف شود؟')) return;
  const inv = investors.find(i => i.id === invId);
  const payments = inv.payments.filter(p => p.id !== payId);
  const transactions = getInvestorTransactions(inv).filter(t => t.id !== payId);
  await saveInvestorDB({ ...inv, payments, transactions }, invId);
  renderDetail();
  updateStats();
  toast('پرداخت حذف شد');
}

async function confirmDelete(id) {
  if (!confirm('آیا مطمئن هستید؟ تمام اطلاعات این سرمایه‌گذار پاک می‌شود.')) return;
  await deleteInvestorDB(id);
  selectedId = investors[0]?.id || null;
  renderList();
  updateStats();
  if (selectedId) renderDetail();
  else { document.getElementById('emptyState').style.display = 'flex'; document.getElementById('detailPanel').style.display = 'none'; }
  toast('سرمایه‌گذار حذف شد');
}
