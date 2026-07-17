// Mobile-first enhancements: bottom nav sync, responsive table cards, PWA install/offline support.
const MOBILE_QUERY = '(max-width: 760px)';

function isMobileLayout() { return window.matchMedia(MOBILE_QUERY).matches; }

function syncMobileNav(tab) {
  document.querySelectorAll('.mobile-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

function annotateResponsiveTables(scope = document) {
  scope.querySelectorAll('table').forEach(table => {
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.children].forEach((cell, index) => {
        if (!cell.dataset.label && headers[index]) cell.dataset.label = headers[index];
      });
    });
  });
}

function enhanceMobileTimeline(scope = document) {
  scope.querySelectorAll('.tl-item').forEach((item, index) => {
    if (!item.dataset.mobileEnhanced) {
      item.dataset.mobileEnhanced = 'true';
      item.style.setProperty('--tl-color', ['var(--gold)', 'var(--green)', 'var(--blue)', 'var(--purple)', 'var(--red)'][index % 5]);
      item.addEventListener('click', () => item.classList.toggle('expanded'));
    }
  });
}

function applyMobileEnhancements(scope = document) {
  annotateResponsiveTables(scope);
  enhanceMobileTimeline(scope);
}

const mobileObserver = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) applyMobileEnhancements(node);
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  applyMobileEnhancements();
  mobileObserver.observe(document.body, { childList: true, subtree: true });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(console.warn));
  }
});

function makeReportSectionsCollapsible(scope = document) {
  if (!isMobileLayout()) return;
  scope.querySelectorAll('.report-section').forEach((section, index) => {
    if (section.dataset.collapsibleReady) return;
    section.dataset.collapsibleReady = 'true';
    const existingTitle = section.querySelector('.chart-title, .sec-title span');
    const label = existingTitle ? existingTitle.textContent.trim() : `بخش ${index + 1}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'report-collapse-toggle';
    toggle.innerHTML = `<span>${label}</span><b>⌄</b>`;
    section.prepend(toggle);
    if (index > 0) section.classList.add('collapsed');
    toggle.addEventListener('click', () => section.classList.toggle('collapsed'));
  });
}
