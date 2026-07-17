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
  document.getElementById('f_name').value = inv.fullName || inv.name;
  document.getElementById('f_phone').value = inv.phone || '';
  document.getElementById('f_capital').value = inv.capital;
  document.getElementById('f_rate').value = inv.monthlyInterestRate ?? inv.rate;
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
      const currentTransactions = getInvestorTransactions(inv);
      const initialDeposit = currentTransactions.find(t => t.type === 'capital_deposit');
      await saveInvestorDB({ ...inv, fullName: name, name, phone, monthlyInterestRate: rate, rate, startDate, notes }, editId);
      if (initialDeposit && (Number(initialDeposit.amount) !== capital || initialDeposit.date !== startDate)) {
        await saveTransactionDB({ ...initialDeposit, amount: capital, date: startDate, description: initialDeposit.description || 'سرمایه اولیه' });
        await loadInvestors();
      }
      closeModal('invModal');
      if (selectedId) renderDetail();
      updateStats();
    } else {
      const tmpId = `pending-${Date.now()}`;
      await saveInvestorDB({ fullName: name, name, phone, capital, monthlyInterestRate: rate, rate, startDate, notes, status: 'Active', transactions: [newTransaction(tmpId, 'capital_deposit', capital, startDate, 'سرمایه اولیه')] }, null);
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
    const allocation = allocatePayment(inv, amount, date, note);
    for (const tx of allocation) await saveTransactionDB(tx);
    await loadInvestors();
    closeModal('payModal');
    selectedId = payInvId;
    renderDetail();
    updateStats();
    toast('✅ پرداخت با تخصیص هوشمند ثبت شد');
  } catch(e) {
    toast('❌ خطا: ' + (e.code === 'permission-denied' ? 'دسترسی رد شد — Firestore Rules را درست کنید' : e.message), true);
  }
}

async function deletePayment(invId, payId) {
  if (!confirm('این پرداخت حذف شود؟')) return;
  const inv = investors.find(i => i.id === invId);
  await deleteTransactionDB(payId);
  await loadInvestors();
  renderDetail();
  updateStats();
  toast('پرداخت حذف شد');
}

// ===== General Transactions =====
function openTransactionModal(id, type) {
  payInvId = id;
  document.getElementById('tx_type').value = type || 'capital_deposit';
  document.getElementById('tx_amount').value = '';
  document.getElementById('tx_date').value = todayJalali();
  document.getElementById('tx_note').value = '';
  document.getElementById('txModal').classList.add('show');
}

async function saveLedgerTransaction() {
  const type = document.getElementById('tx_type').value;
  const amount = Number(document.getElementById('tx_amount').value);
  const dateJalali = document.getElementById('tx_date').value.trim();
  const note = document.getElementById('tx_note').value.trim();
  if (!LEDGER_TYPES.includes(type) || !amount || !dateJalali) { toast('نوع، مبلغ و تاریخ تراکنش الزامی است', true); return; }
  const date = jalaliInputToGregorian(dateJalali);
  if (!date || date.length < 8) { toast('فرمت تاریخ اشتباه است. مثال: 1403/01/01', true); return; }
  try {
    await saveTransactionDB(newTransaction(payInvId, type, amount, date, note || transactionTypeLabel(type)));
    await loadInvestors();
    closeModal('txModal');
    selectedId = payInvId;
    renderDetail();
    updateStats();
    toast('✅ تراکنش ثبت شد');
  } catch(e) {
    toast('❌ خطا: ' + e.message, true);
  }
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
