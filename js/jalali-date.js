// ===== Jalali Date Picker =====
const JDP_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const JDP_DAYS   = ['ش','ی','د','س','چ','پ','ج'];

function jdpMonthLen(y, m) {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  const leapYears = [1370,1375,1379,1383,1387,1391,1395,1399,1403,1408,1412,1416,1420];
  return leapYears.includes(y) ? 30 : 29;
}
function jdp1stDow(y, m) {
  const greg = jalaliToGregorian(y, m, 1).split('-');
  const d = new Date(+greg[0], +greg[1]-1, +greg[2]);
  return (d.getDay() + 1) % 7; // 0=Sat
}

let jdpState = {}; // { inputId: {y,m,selY,selM,selD,mode,popupId,allowClear} }

// Close all pickers when clicking outside
document.addEventListener('mousedown', function(e) {
  document.querySelectorAll('.jdp-popup.open').forEach(popup => {
    // Find which input owns this popup
    const inputId = Object.keys(jdpState).find(k => jdpState[k].popupId === popup.id);
    const input = inputId ? document.getElementById(inputId) : null;
    if (!popup.contains(e.target) && e.target !== input) {
      popup.classList.remove('open');
    }
  });
});

function jdpOpen(inputId, popupId, allowClear) {
  const popup = document.getElementById(popupId);
  // Toggle: if already open, close
  if (popup.classList.contains('open')) {
    popup.classList.remove('open');
    return;
  }
  // Close any other open picker first
  document.querySelectorAll('.jdp-popup.open').forEach(p => p.classList.remove('open'));

  const val = document.getElementById(inputId).value;
  const parsed = parseJalaliInput(val);
  const t = jToday();
  jdpState[inputId] = {
    y: parsed ? parsed.y : t.y,
    m: parsed ? parsed.m : t.m,
    selY: parsed ? parsed.y : t.y,
    selM: parsed ? parsed.m : t.m,
    selD: parsed ? parsed.d : null,
    mode: 'day',
    popupId,
    allowClear: !!allowClear
  };
  jdpRender(inputId);
  popup.classList.add('open');
}

function jdpRender(inputId) {
  const s = jdpState[inputId];
  const popup = document.getElementById(s.popupId);
  const todayJ = jToday();

  // Stop ALL clicks inside popup from reaching document mousedown listener
  // (re-attach once per render to avoid duplicate listeners)
  popup.onclick = function(e) { e.stopPropagation(); };

  if (s.mode === 'year') {
    const startY = s.y - (s.y % 12 !== 0 ? s.y % 8 : 0) - 4;
    let yBtns = '';
    for (let y = startY; y < startY + 12; y++) {
      const sel = y === s.selY ? ' sel' : '';
      yBtns += `<div class="jdp-month-btn${sel}" data-jdp-y="${y}">${toFarsi(y)}</div>`;
    }
    popup.innerHTML = `
      <div class="jdp-nav">
        <button class="jdp-prev-range">«</button>
        <span class="jdp-title">${toFarsi(startY)} — ${toFarsi(startY+11)}</span>
        <button class="jdp-next-range">»</button>
      </div>
      <div class="jdp-months" id="${s.popupId}_grid">${yBtns}</div>
      ${s.allowClear ? `<div style="margin-top:10px;text-align:center"><button class="btn btn-secondary btn-sm jdp-clear-btn">پاک کردن</button></div>` : ''}
    `;
    popup.querySelector('.jdp-prev-range').onclick = e => { e.stopPropagation(); s.y -= 12; jdpRender(inputId); };
    popup.querySelector('.jdp-next-range').onclick = e => { e.stopPropagation(); s.y += 12; jdpRender(inputId); };
    popup.querySelectorAll('[data-jdp-y]').forEach(el => {
      el.onclick = e => { e.stopPropagation(); s.selY = +el.dataset.jdpY; s.y = s.selY; s.mode = 'month'; jdpRender(inputId); };
    });
    if (s.allowClear) popup.querySelector('.jdp-clear-btn').onclick = e => { e.stopPropagation(); jdpClear(inputId); };
    return;
  }

  if (s.mode === 'month') {
    let mBtns = JDP_MONTHS.map((name, i) =>
      `<div class="jdp-month-btn${(i+1)===s.selM?' sel':''}" data-jdp-m="${i+1}">${name}</div>`
    ).join('');
    popup.innerHTML = `
      <div class="jdp-nav">
        <button class="jdp-prev-y">‹</button>
        <span class="jdp-title jdp-to-year">${toFarsi(s.y)}</span>
        <button class="jdp-next-y">›</button>
      </div>
      <div class="jdp-months">${mBtns}</div>
      ${s.allowClear ? `<div style="margin-top:10px;text-align:center"><button class="btn btn-secondary btn-sm jdp-clear-btn">پاک کردن</button></div>` : ''}
    `;
    popup.querySelector('.jdp-prev-y').onclick   = e => { e.stopPropagation(); s.y--; jdpRender(inputId); };
    popup.querySelector('.jdp-next-y').onclick   = e => { e.stopPropagation(); s.y++; jdpRender(inputId); };
    popup.querySelector('.jdp-to-year').onclick  = e => { e.stopPropagation(); s.mode = 'year'; jdpRender(inputId); };
    popup.querySelectorAll('[data-jdp-m]').forEach(el => {
      el.onclick = e => { e.stopPropagation(); s.m = +el.dataset.jdpM; s.selM = s.m; s.mode = 'day'; jdpRender(inputId); };
    });
    if (s.allowClear) popup.querySelector('.jdp-clear-btn').onclick = e => { e.stopPropagation(); jdpClear(inputId); };
    return;
  }

  // Day view
  const firstDow   = jdp1stDow(s.y, s.m);
  const daysInMonth = jdpMonthLen(s.y, s.m);
  let dayHtml = JDP_DAYS.map(d => `<div class="jdp-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) dayHtml += `<div class="jdp-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = s.y===todayJ.y && s.m===todayJ.m && d===todayJ.d;
    const isSel   = s.y===s.selY   && s.m===s.selM   && d===s.selD;
    dayHtml += `<div class="jdp-day${isToday?' today':''}${isSel?' selected':''}" data-jdp-d="${d}">${toFarsi(d)}</div>`;
  }

  popup.innerHTML = `
    <div class="jdp-nav">
      <button class="jdp-prev-m">‹</button>
      <span class="jdp-title jdp-to-month">${JDP_MONTHS[s.m-1]} ${toFarsi(s.y)}</span>
      <button class="jdp-next-m">›</button>
    </div>
    <div class="jdp-grid">${dayHtml}</div>
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <button class="btn btn-secondary btn-sm jdp-today-btn">امروز</button>
      ${s.allowClear ? `<button class="btn btn-secondary btn-sm jdp-clear-btn">پاک کردن</button>` : ''}
    </div>
  `;
  popup.querySelector('.jdp-prev-m').onclick    = e => { e.stopPropagation(); if(s.m===1){s.m=12;s.y--;}else s.m--; jdpRender(inputId); };
  popup.querySelector('.jdp-next-m').onclick    = e => { e.stopPropagation(); if(s.m===12){s.m=1;s.y++;}else s.m++; jdpRender(inputId); };
  popup.querySelector('.jdp-to-month').onclick  = e => { e.stopPropagation(); s.mode='month'; jdpRender(inputId); };
  popup.querySelector('.jdp-today-btn').onclick = e => { e.stopPropagation(); const t=jToday(); s.y=t.y; s.m=t.m; jdpSelectDay(inputId,t.d); };
  popup.querySelectorAll('[data-jdp-d]').forEach(el => {
    el.onclick = e => { e.stopPropagation(); jdpSelectDay(inputId, +el.dataset.jdpD); };
  });
  if (s.allowClear) popup.querySelector('.jdp-clear-btn').onclick = e => { e.stopPropagation(); jdpClear(inputId); };
}

function jdpSelectDay(inputId, d) {
  const s   = jdpState[inputId];
  s.selY = s.y; s.selM = s.m; s.selD = d;
  const val = `${s.y}/${String(s.m).padStart(2,'0')}/${String(d).padStart(2,'0')}`;
  document.getElementById(inputId).value = val;
  document.getElementById(s.popupId).classList.remove('open');
  if (inputId === 'prFrom') prFrom = val;
  if (inputId === 'prTo')   prTo   = val;
}

function jdpClear(inputId) {
  document.getElementById(inputId).value = '';
  document.getElementById(jdpState[inputId].popupId).classList.remove('open');
  if (inputId === 'prFrom') { prFrom = ''; }
  if (inputId === 'prTo')   { prTo   = ''; }
}

// Legacy aliases (used in jdpGoToday call)
function jdpPickDay(id, d) { jdpSelectDay(id, d); }
