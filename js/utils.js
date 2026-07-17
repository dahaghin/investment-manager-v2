// ===== State =====
let investors = [];
let cheques   = [];
let selectedId = null;
let editId = null;
let payInvId = null;
let editChequeId = null;
let chqFilter = 'all';


// ===== Persian date =====
function toFarsi(n) {
  return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}
function jalaliToday() {
  try {
    return new Intl.DateTimeFormat('fa-IR', { year:'numeric', month:'long', day:'numeric', calendar:'persian' }).format(new Date());
  } catch(e) { return new Date().toLocaleDateString('fa-IR'); }
}
function milToJalali(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return new Intl.DateTimeFormat('fa-IR', { year:'numeric', month:'long', day:'numeric', calendar:'persian' }).format(d);
  } catch(e) { return dateStr; }
}
function formatMoney(n) {
  if (!n && n !== 0) return '—';
  return toFarsi(Math.round(Number(n)).toLocaleString('en'));
}

// ===== Jalali <-> Gregorian =====
function jalaliToGregorian(jy, jm, jd) {
  jy=parseInt(jy); jm=parseInt(jm); jd=parseInt(jd);
  var sal_a=[0,31,29,31,30,31,30,31,31,30,31,30,31];
  var gy=(jy>979)?1600:621;
  if(jy>979) jy-=979; // else jy unchanged
  var sum=365*jy+(Math.floor(jy/33))*8+Math.floor((jy%33+3)/4)+78+jd+
    (jm<7?(jm-1)*31:((jm-7)*30)+186);
  gy+=400*(Math.floor(sum/146097)); sum%=146097;
  if(sum>36524){
    gy+=100*(Math.floor(--sum/36524)); sum%=36524;
    if(sum>=365) sum++;
  }
  gy+=4*(Math.floor(sum/1461)); sum%=1461;
  if(sum>365){ gy+=Math.floor((sum-1)/365); sum=(sum-1)%365; }
  var isleap=((gy%4===0&&gy%100!==0)||(gy%400===0));
  sal_a[2]=isleap?29:28;
  var gm=1;
  for(;sum>=sal_a[gm];gm++) sum-=sal_a[gm];
  var gd=sum+1;
  return String(gy)+'-'+String(gm).padStart(2,'0')+'-'+String(gd).padStart(2,'0');
}

function gregorianToJalali(gy, gm, gd) {
  var g = [0,31,59,90,120,151,181,212,243,273,304,334];
  var jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  var gy2 = (gm > 2) ? (gy+1) : gy;
  var days = (365*gy) + Math.floor((gy2+3)/4) - Math.floor((gy2+99)/100) + Math.floor((gy2+399)/400) - 80 + gd + g[gm-1];
  jy += 33*Math.floor(days/12053);
  days %= 12053;
  jy += 4*Math.floor(days/1461);
  days %= 1461;
  if(days > 365) { jy += Math.floor((days-1)/365); days = (days-1)%365; }
  var jm = (days < 186) ? 1+Math.floor(days/31) : 7+Math.floor((days-186)/30);
  var jd = 1 + ((days < 186) ? (days%31) : (days-186)%30);
  return {y:jy, m:jm, d:jd};
}

function todayGregorian() { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }
function todayJalali() {
  const n=new Date(); const j=gregorianToJalali(n.getFullYear(),n.getMonth()+1,n.getDate());
  return `${j.y}/${String(j.m).padStart(2,'0')}/${String(j.d).padStart(2,'0')}`;
}
// Convert "1403/02/15" to "2024-05-04"
function jalaliInputToGregorian(str) {
  if (!str) return '';
  // support both / and -
  const clean = String(str).replace(/[۰-۹]/g, ch => '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)).replace(/[٠-٩]/g, ch => '٠١٢٣٤٥٦٧٨٩'.indexOf(ch));
  const parts = clean.replace(/-/g,'/').split('/');
  if (parts.length !== 3) return str;
  return jalaliToGregorian(parts[0], parts[1], parts[2]);
}
function gregorianToJalaliStr(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  const j = gregorianToJalali(parts[0], parts[1], parts[2]);
  return `${j.y}/${String(j.m).padStart(2,'0')}/${String(j.d).padStart(2,'0')}`;
}


// ===== Toast =====
function toast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = isErr ? '#3a1515' : '#1a3a1a';
  t.style.borderColor = isErr ? '#5a2020' : '#2a5a2a';
  t.style.color = isErr ? 'var(--red)' : 'var(--green)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}


// ===== Close overlay on bg click =====
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); });
});
