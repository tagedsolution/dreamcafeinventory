// app.js - Mobile-first app controller

// ── Global Utilities ──────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: '💬', warning: '⚠️' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.getElementById('modal-overlay').classList.remove('active');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Settings Module ────────────────────────────────────────────────────────────

const Settings = (() => {
  const render = () => {
    const s = DB.getSettings();
    document.getElementById('set-phone').value = s.whatsappPhone || '';
    document.getElementById('set-instance').value = s.greenApiInstance || '';
    document.getElementById('set-token').value = s.greenApiToken || '';
    document.getElementById('set-summary-time').value = s.dailySummaryTime || '21:00';
    document.getElementById('set-enabled').checked = !!s.alertsEnabled;

    // Firebase configuration rendering
    const fbTextarea = document.getElementById('set-firebase-config');
    if (fbTextarea) {
      fbTextarea.value = s.firebaseConfig || '';
    }

    const badge = document.getElementById('cloud-status-badge');
    const btnMigrate = document.getElementById('btn-migrate-firebase');
    if (badge) {
      if (DB.Cloud.isEnabled()) {
        badge.textContent = 'Connected';
        badge.classList.remove('badge-danger');
        badge.classList.add('badge-success');
      } else {
        badge.textContent = 'Disconnected';
        badge.classList.remove('badge-success');
        badge.classList.add('badge-danger');
      }
    }
    if (btnMigrate) {
      btnMigrate.style.display = DB.Cloud.isEnabled() ? 'block' : 'none';
    }
  };

  const save = () => {
    const current = DB.getSettings();
    DB.saveSettings({
      ...current,
      whatsappPhone: document.getElementById('set-phone').value.trim(),
      greenApiInstance: document.getElementById('set-instance').value.trim(),
      greenApiToken: document.getElementById('set-token').value.trim(),
      dailySummaryTime: document.getElementById('set-summary-time').value || '21:00',
      alertsEnabled: document.getElementById('set-enabled').checked
    });
    showToast('Settings saved! ✅', 'success');
  };

  const saveFirebase = () => {
    const current = DB.getSettings();
    const configStr = document.getElementById('set-firebase-config').value.trim();
    if (configStr) {
      try {
        JSON.parse(configStr);
      } catch (e) {
        showToast('Invalid Firebase Config JSON format!', 'error');
        return;
      }
    }
    DB.saveSettings({
      ...current,
      firebaseConfig: configStr
    });
    DB.Cloud.init();
    render();
    if (DB.Cloud.isEnabled()) {
      showToast('Firebase Config saved & Connected! 🟢', 'success');
    } else {
      showToast('Firebase Config saved (Disconnected) 🔴', 'warning');
    }
  };

  const migrateFirebase = async () => {
    if (!DB.Cloud.isEnabled()) {
      showToast('Firebase is not connected!', 'error');
      return;
    }
    const btn = document.getElementById('btn-migrate-firebase');
    const originalText = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="animate-spin"></i> Uploading...`;
      if (window.lucide) lucide.createIcons();
      showToast('Migrating local data to cloud...', 'info');
      await DB.Cloud.uploadLocalData();
      showToast('Data uploaded to cloud successfully! 📤', 'success');
    } catch (err) {
      console.error(err);
      showToast('Migration failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
      if (window.lucide) lucide.createIcons();
    }
  };

  const init = () => {
    document.getElementById('btn-save-settings').addEventListener('click', save);
    document.getElementById('btn-test-alert').addEventListener('click', () => Alerts.testAlert());
    document.getElementById('btn-save-firebase').addEventListener('click', saveFirebase);
    document.getElementById('btn-migrate-firebase').addEventListener('click', migrateFirebase);
  };

  return { render, init };
})();

// ── Add Item Module ────────────────────────────────────────────────────────────

const AddItem = (() => {
  const render = () => {};
  const submit = async () => {
    const itemName = document.getElementById('ai-name').value.trim();
    const category = document.getElementById('ai-category').value.trim();
    const unit = document.getElementById('ai-unit').value;
    const currentStock = Number(document.getElementById('ai-current').value);
    const minimumStock = Number(document.getElementById('ai-minimum').value);
    if (!itemName) { showToast('Please enter an item name.', 'error'); return; }
    if (!category) { showToast('Please enter a category.', 'error'); return; }
    if (isNaN(currentStock) || currentStock < 0) { showToast('Invalid current stock.', 'error'); return; }
    if (isNaN(minimumStock) || minimumStock < 0) { showToast('Invalid minimum stock.', 'error'); return; }
    const item = DB.addItem({ itemName, category, unit, currentStock, minimumStock });
    Alerts.checkAndAlert(item);
    showToast(`${itemName} added! ✅`, 'success');
    document.getElementById('add-item-form').reset();
    App.navigate('inventory');
  };
  const init = () => {
    document.getElementById('btn-add-item-submit').addEventListener('click', submit);
  };
  return { render, init };
})();

// ── Page Title Map ─────────────────────────────────────────────────────────────

const PAGE_TITLES = {
  'dashboard': 'Dashboard',
  'inventory': 'Inventory',
  'finances':  'Finances',
  'add-item':  'Add New Item',
  'stock-in':  'Stock In',
  'stock-out': 'Stock Out',
  'history':   'History',
  'reports':   'Reports',
  'settings':  'Settings'
};

// Bottom nav items (which sections map to bottom nav tabs)
const BNAV_SECTIONS = ['dashboard', 'inventory', 'stock-in', 'stock-out'];

// ── App Router ─────────────────────────────────────────────────────────────────

const App = (() => {
  const sections = ['dashboard','inventory','add-item','stock-in','stock-out','history','reports','settings','finances'];
  let moreOpen = false;
  let currentSection = 'dashboard';

  const navigate = (section) => {
    currentSection = section;
    // Hide all sections
    sections.forEach(s => document.getElementById(`section-${s}`)?.classList.remove('active'));
    // Show target
    document.getElementById(`section-${section}`)?.classList.add('active');

    // Update bottom nav active state
    document.querySelectorAll('.bnav-item[data-nav]').forEach(el =>
      el.classList.toggle('active', el.dataset.nav === section)
    );

    // Update header title
    const titleEl = document.getElementById('header-page-title');
    if (titleEl) titleEl.textContent = PAGE_TITLES[section] || section;

    // Update alert badge on header
    updateAlertBadge();

    // Render section content
    switch (section) {
      case 'dashboard': Dashboard.render(); break;
      case 'inventory': Inventory.render(); break;
      case 'add-item':  AddItem.render(); break;
      case 'stock-in':  StockIn.render(); break;
      case 'stock-out': StockOut.render(); break;
      case 'history':   History.render(); break;
      case 'reports':   Reports.render(); break;
      case 'settings':  Settings.render(); break;
      case 'finances':  Finances.render(); break;
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const updateAlertBadge = () => {
    const badge = document.getElementById('alert-badge');
    if (!badge) return;
    const count = DB.getInventory().filter(i => i.currentStock <= i.minimumStock).length;
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent = count > 9 ? '9+' : count;
  };

  const toggleMore = () => {
    moreOpen = !moreOpen;
    document.getElementById('bs-overlay').classList.toggle('active', moreOpen);
    document.getElementById('more-sheet').classList.toggle('active', moreOpen);
    document.querySelectorAll('.bnav-item[data-more]').forEach(el =>
      el.classList.toggle('active', moreOpen)
    );
    if (moreOpen) lucide.createIcons();
  };

  const closeMore = () => {
    if (!moreOpen) return;
    moreOpen = false;
    document.getElementById('bs-overlay').classList.remove('active');
    document.getElementById('more-sheet').classList.remove('active');
    document.querySelectorAll('.bnav-item[data-more]').forEach(el =>
      el.classList.remove('active')
    );
  };

  const init = () => {
    SEED_DATA.initialize();

    // Initialize cloud sync connection
    DB.Cloud.init();

    Inventory.init();
    StockIn.init();
    StockOut.init();
    History.init();
    Reports.init();
    Settings.init();
    AddItem.init();
    Finances.init();

    // Start background check for Daily Summary every 60 seconds
    Alerts.checkAndSendDailySummary();
    setInterval(() => Alerts.checkAndSendDailySummary(), 60000);

    // Bottom nav listeners
    document.querySelectorAll('.bnav-item[data-nav]').forEach(el =>
      el.addEventListener('click', () => navigate(el.dataset.nav))
    );

    // More button
    document.querySelector('.bnav-item[data-more]')?.addEventListener('click', toggleMore);

    // More sheet items
    document.querySelectorAll('.sheet-nav-item[data-nav]').forEach(el =>
      el.addEventListener('click', () => { closeMore(); navigate(el.dataset.nav); })
    );

    // Overlay closes sheet
    document.getElementById('bs-overlay')?.addEventListener('click', closeMore);

    // Modal overlay
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        document.getElementById('modal-overlay').classList.remove('active');
      }
    });

    navigate('dashboard');
    lucide.createIcons();
  };

  const refreshCurrentSection = () => {
    updateAlertBadge();
    switch (currentSection) {
      case 'dashboard': Dashboard.render(); break;
      case 'inventory': Inventory.render(); break;
      case 'history':   History.render(); break;
      case 'reports':   Reports.render(); break;
      case 'finances':  Finances.render(); break;
    }
  };

  return { navigate, init, toggleMore, closeMore, updateAlertBadge, refreshCurrentSection };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
