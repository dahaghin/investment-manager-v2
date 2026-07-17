// ===== Firebase Config =====
const firebaseConfig = {
  apiKey: "AIzaSyDVn00oMNnDv-VhwAdg5ioUdcETSGOswMA",
  authDomain: "alizo-ed747.firebaseapp.com",
  databaseURL: "https://alizo-ed747-default-rtdb.firebaseio.com",
  projectId: "alizo-ed747",
  storageBucket: "alizo-ed747.firebasestorage.app",
  messagingSenderId: "591736521629",
  appId: "1:591736521629:web:1cfbf19542d26563496574"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();


// ===== Auth =====
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').classList.add('show');
    document.getElementById('headerDate').textContent = jalaliToday();
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


// ===== Firestore =====
function col() { return db.collection('investors').doc(auth.currentUser.uid).collection('list'); }
function chqCol() { return db.collection('investors').doc(auth.currentUser.uid).collection('cheques'); }

async function loadInvestors() {
  const [invSnap, chqSnap] = await Promise.all([
    col().orderBy('createdAt', 'asc').get(),
    chqCol().orderBy('createdAt', 'desc').get()
  ]);
  investors = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  cheques   = chqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
  updateStats();
  if (investors.length > 0 && !selectedId) {
    selectedId = investors[0].id;
    renderList();
    renderDetail();
  }
}

async function saveInvestorDB(data, id) {
  if (id) {
    await col().doc(id).update(data);
    await loadInvestors();
  } else {
    const docRef = await col().add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    if (Array.isArray(data.transactions)) {
      const transactions = data.transactions.map(t => ({ ...t, investorId: docRef.id }));
      await col().doc(docRef.id).update({ transactions });
    }
    await loadInvestors();
    selectedId = docRef.id;
    renderList();
    renderDetail();
  }
}

async function deleteInvestorDB(id) {
  await col().doc(id).delete();
  await loadInvestors();
}
