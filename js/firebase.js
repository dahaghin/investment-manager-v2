// ===== Firebase Config (V2 Beta) =====
const firebaseConfig = {
  apiKey: "AIzaSyC2u1LP8rB6T24DVPgEkSgv-S1kRxNc31I",
  authDomain: "new-acc-e45ef.firebaseapp.com",
  projectId: "new-acc-e45ef",
  storageBucket: "new-acc-e45ef.firebasestorage.app",
  messagingSenderId: "326826317929",
  appId: "1:326826317929:web:9f0c057565d2975f71aaf8",
  measurementId: "G-2MY8Z7X4CP"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const V2_COLLECTIONS = Object.freeze({
  investors: 'investors',
  transactions: 'transactions',
  settings: 'settings',
  backups: 'backups'
});

// ===== Auth =====
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').classList.add('show');
    document.getElementById('headerDate').textContent = jalaliToday();
    ensureV2Settings();
    loadInvestors();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').classList.remove('show');
  }
});

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginErr');
  err.classList.remove('show');
  btn.textContent = ''; btn.innerHTML = '<div class="loader" style="border-top-color:#000"></div>';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    err.textContent = 'ایمیل یا رمز عبور اشتباه است';
    err.classList.add('show');
    btn.textContent = 'ورود';
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin(); });

function doLogout() { auth.signOut(); investors = []; selectedId = null; }

// ===== Firestore V2 Collections =====
function ownedCol(name) {
  return db.collection(name).where('ownerId', '==', auth.currentUser.uid);
}
function invCol() { return db.collection(V2_COLLECTIONS.investors); }
function txCol() { return db.collection(V2_COLLECTIONS.transactions); }
function settingsCol() { return db.collection(V2_COLLECTIONS.settings); }
function backupsCol() { return db.collection(V2_COLLECTIONS.backups); }

// Cheques are kept as a UI-only compatibility feature in settings/{uid}/cheques.
function chqCol() { return settingsCol().doc(auth.currentUser.uid).collection('cheques'); }

async function ensureV2Settings() {
  await settingsCol().doc(auth.currentUser.uid).set({
    ownerId: auth.currentUser.uid,
    version: 'v2-beta2',
    collections: V2_COLLECTIONS,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

function investorFromDoc(doc, tx = []) {
  const data = doc.data();
  const transactions = tx.map(t => ({ id: t.id, ...t.data() }));
  const firstDeposit = transactions.find(t => t.type === 'capital_deposit');
  const profitPayments = transactions.filter(t => t.type === 'profit_payment').map(t => ({
    id: t.id,
    amount: t.amount,
    date: t.date,
    note: t.description,
    createdAt: t.createdAt
  }));
  return {
    id: doc.id,
    fullName: data.fullName || data.name || '',
    name: data.fullName || data.name || '',
    phone: data.phone || '',
    monthlyInterestRate: Number(data.monthlyInterestRate ?? data.rate ?? 0),
    rate: Number(data.monthlyInterestRate ?? data.rate ?? 0),
    status: data.status || 'Active',
    startDate: normalizeISODate(data.startDate || firstDeposit?.date || todayGregorian()),
    capital: Number(firstDeposit?.amount || data.capital || 0),
    notes: data.notes || '',
    createdAt: data.createdAt,
    transactions,
    payments: profitPayments
  };
}

async function loadInvestors() {
  const [invSnap, txSnap, chqSnap] = await Promise.all([
    ownedCol(V2_COLLECTIONS.investors).orderBy('createdAt').get(),
    ownedCol(V2_COLLECTIONS.transactions).orderBy('date').get(),
    chqCol().orderBy('createdAt', 'desc').get()
  ]);
  const txByInvestor = new Map();
  txSnap.docs.forEach(doc => {
    const data = doc.data();
    const list = txByInvestor.get(data.investorId) || [];
    list.push(doc);
    list.sort((a, b) => String(a.data().date || '').localeCompare(String(b.data().date || '')));
    txByInvestor.set(data.investorId, list);
  });
  investors = invSnap.docs.map(doc => investorFromDoc(doc, txByInvestor.get(doc.id) || []))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  cheques = chqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
  updateStats();
  if (investors.length > 0 && !selectedId) selectedId = investors[0].id;
  if (selectedId) { renderList(); renderDetail(); }
  if (typeof isMobileLayout === 'function' && isMobileLayout() && !document.body.dataset.mobileInitialTab) {
    document.body.dataset.mobileInitialTab = 'true';
    switchTab('dashboard');
  }
  if (typeof applyMobileEnhancements === 'function') applyMobileEnhancements();
}

async function saveInvestorDB(data, id) {
  if (id) {
    await invCol().doc(id).set(normalizeInvestorForDB(data, id), { merge: true });
    await loadInvestors();
    return id;
  }
  const docRef = invCol().doc();
  await docRef.set(normalizeInvestorForDB(data, docRef.id));
  const transactions = (data.transactions || []).map(t => ({ ...t, investorId: docRef.id }));
  for (const tx of transactions) await saveTransactionDB(tx);
  await loadInvestors();
  selectedId = docRef.id;
  renderList();
  renderDetail();
  return docRef.id;
}

async function saveTransactionDB(tx) {
  const id = tx.id && !String(tx.id).startsWith('pending-') ? tx.id : undefined;
  const docRef = id ? txCol().doc(id) : txCol().doc();
  await docRef.set(normalizeTransactionForDB({ ...tx, id: docRef.id }));
  return docRef.id;
}

async function deleteTransactionDB(id) {
  await txCol().doc(id).delete();
}

async function deleteInvestorDB(id) {
  const txSnap = await ownedCol(V2_COLLECTIONS.transactions).where('investorId', '==', id).get();
  const batch = db.batch();
  txSnap.docs.forEach(doc => batch.delete(doc.ref));
  batch.delete(invCol().doc(id));
  await batch.commit();
  await loadInvestors();
}
