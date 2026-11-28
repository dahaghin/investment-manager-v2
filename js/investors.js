// ===== Modals =====
function openAddModal() {
  editId = null;
  document.getElementById('invModalTitle').textContent = 'افزودن سرمایه‌گذار جدید';
  ['f_name','f_phone','f_notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f_capital').value = '';
  document.getElementById('f_currency').value = 'IRT';
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
  document.getElementById('f_currency').value = inv.currency || 'IRT';
  document.getElementById('f_rate').value = inv.monthlyInterestRate ?? inv.rate;
  document.getElementById('f_start').value = gregorianToJalaliStr(inv.startDate) || todayJalali();
  document.getElementById('f_notes').value = inv.notes || '';
  document.getElementById('invModal').classList.add('show');
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

async function saveInvestor() {
  const name = document.getElementById('f_name').value.trim();
  const phone = document.getElementById('f_phone').value.trim();
  const capital = Number(document.getElementById('f_capital').value);
  const currency = document.getElementById('f_currency').value;
  const rate = Number(document.getElementById('f_rate').value);
  const startDateJalali = document.getElementById('f_start').value.trim();
  const notes = document.getElementById('f_notes').value.trim();
  if (!name || !capital || !rate || !startDateJalali || !['IRT','USD','AED'].includes(currency)) { toast('لطفاً فیلدهای ستاره‌دار را پر کنید', true); return; }
  const startDate = jalaliInputToGregorian(startDateJalali);
  if (!startDate || startDate.length < 8) { toast('فرمت تاریخ اشتباه است. مثال: 1403/01/01', true); return; }
  try {
    if (editId) {
      const inv = investors.find(i => i.id === editId);
      const currentTransactions = getInvestorTransactions(inv);
      const initialDeposit = currentTransactions.find(t => t.type === 'capital_deposit');
      await saveInvestorDB({ ...inv, fullName: name, name, phone, monthlyInterestRate: rate, rate, currency, startDate, notes }, editId);
      if (initialDeposit && (Number(initialDeposit.amount) !== capital || initialDeposit.date !== startDate)) {
        await saveTransactionDB({ ...initialDeposit, amount: capital, date: startDate, description: initialDeposit.description || 'سرمایه اولیه' });
        await loadInvestors();
      }
      closeModal('invModal');
      if (selectedId) renderDetail();
      updateStats();
    } else {
      const tmpId = `pending-${Date.now()}`;
      await saveInvestorDB({ fullName: name, name, phone, capital, monthlyInterestRate: rate, rate, currency, startDate, notes, status: 'Active', transactions: [newTransaction(tmpId, 'capital_deposit', capital, startDate, 'سرمایه اولیه')] }, null);
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
  document.getElementById('p_amount').previousElementSibling.textContent = 'مبلغ پرداختی (' + investorCurrencyLabel(inv.currency || 'IRT') + ') *';
  document.getElementById('p_amount').value = Math.round(monthlyProfit(inv));
  document.getElementById('p_date').value = todayJalali();
  document.getElementById('p_note').value = '';
  document.getElementById('p_mode').value = 'smart';
  document.getElementById('payModal').classList.add('show');
}

async function savePayment() {
  const amount = Number(document.getElementById('p_amount').value);
  const dateJalali = document.getElementById('p_date').value.trim();
  const note = document.getElementById('p_note').value.trim();
  const mode = document.getElementById('p_mode').value || 'smart';
  if (!amount || !dateJalali) { toast('مبلغ و تاریخ الزامی است', true); return; }
  const date = jalaliInputToGregorian(dateJalali);
  if (!date || date.length < 8) { toast('فرمت تاریخ اشتباه است. مثال: 1403/01/01', true); return; }
  try {
    const inv = investors.find(i => i.id === payInvId);
    const allocation = allocatePayment(inv, amount, date, note, mode);
    if (!allocation.length) throw new Error('هیچ تراکنشی برای این پرداخت ساخته نشد');
    for (const tx of allocation) await saveTransactionDB(tx);
    await loadInvestors();
    closeModal('payModal');
    selectedId = payInvId;
    renderDetail();
    updateStats();
    toast(mode === 'smart' ? '✅ پرداخت با تخصیص هوشمند ثبت شد' : '✅ پرداخت در دفتر کل ثبت شد');
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
  const inv = investors.find(i => i.id === id);
  document.getElementById('tx_amount').previousElementSibling.textContent = 'مبلغ (' + investorCurrencyLabel(inv?.currency || 'IRT') + ') *';
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


async function archiveInvestor(id) {
  const inv = investors.find(x => x.id === id);
  if (!inv) return;
  const remainingCapital = activeCapital(inv);
  const remainingProfit = isSettled(inv) ? 0 : unpaid(inv);
  if (remainingCapital > 0) {
    toast('ابتدا باید اصل سرمایه به‌طور کامل تسویه شود.', true);
    return;
  }
  if (remainingProfit > 0) {
    toast('هنوز سود پرداخت‌نشده وجود دارد. ابتدا سود را تسویه کنید.', true);
    return;
  }
  if (!confirm('این سرمایه‌گذار از فهرست فعال خارج و به بایگانی منتقل شود؟ تمام سوابق و تراکنش‌ها حفظ می‌شوند.')) return;
  try {
    await archiveInvestorDB(id, true);
    selectedArchivedId = id;
    switchTab('archive');
    toast('سرمایه‌گذار با حفظ تمام سوابق بایگانی شد.');
  } catch (e) {
    toast('خطا در بایگانی: ' + e.message, true);
  }
}

async function restoreArchivedInvestor(id) {
  const inv = archivedInvestors.find(x => x.id === id);
  if (!inv || !confirm('این پرونده به فهرست سرمایه‌گذاران فعال برگردد؟')) return;
  try {
    await archiveInvestorDB(id, false);
    selectedId = id;
    switchTab('investors');
    renderList();
    renderDetail();
    toast('پرونده به فهرست فعال بازگردانده شد.');
  } catch (e) {
    toast('خطا در بازگرداندن پرونده: ' + e.message, true);
  }
}
