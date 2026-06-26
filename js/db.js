// db.js - localStorage & Firebase Cloud sync layer for Dream Cafe Stock Manager

const DB = (() => {
  const KEYS = {
    INVENTORY: 'dcm_inventory',
    TRANSACTIONS: 'dcm_transactions',
    SETTINGS: 'dcm_settings',
    FINANCES: 'dcm_finances'
  };

  let firebaseApp = null;
  let firestoreDb = null;
  let cloudListeners = [];

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  const _get = (key, fallback = []) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  };

  const _set = (key, data) => localStorage.setItem(key, JSON.stringify(data));

  // Hardcoded Firebase Config for out-of-the-box syncing on all devices
  const HARDCODED_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBz6ezlSqIMnPupVAaSSFtjnwIG_potmQc",
    authDomain: "dreamcafe-70301.firebaseapp.com",
    projectId: "dreamcafe-70301",
    storageBucket: "dreamcafe-70301.firebasestorage.app",
    messagingSenderId: "189672369657",
    appId: "1:189672369657:web:68a0c5b8b8903b972d2128",
    measurementId: "G-FR1FX8KF4J"
  };

  // ── Cloud Sync Sub-module ─────────────────────────────
  const Cloud = {
    isEnabled: () => !!firestoreDb,
    init: () => {
      // Unsubscribe existing listeners
      Cloud.disconnect();

      const settings = getSettings();
      let config = null;

      if (HARDCODED_FIREBASE_CONFIG && HARDCODED_FIREBASE_CONFIG.apiKey) {
        config = HARDCODED_FIREBASE_CONFIG;
      } else if (settings.firebaseConfig) {
        try {
          config = JSON.parse(settings.firebaseConfig);
        } catch (e) {
          console.error("[DreamCafe] Failed to parse custom Firebase config:", e);
        }
      }

      if (!config) return;

      try {
        // Initialize Firebase with unique App name to allow hot re-init
        firebaseApp = firebase.initializeApp(config, "dreamcafe_app_" + Date.now());
        firestoreDb = firebaseApp.firestore();

        // Enable Firestore offline persistence
        firestoreDb.enablePersistence().catch(err => {
          console.warn("[DreamCafe] Firestore persistence error:", err.code);
        });

        // Set up real-time listener for Inventory
        const unsubInventory = firestoreDb.collection('inventory').onSnapshot(snapshot => {
          const isMigrated = localStorage.getItem('dcm_cloud_migrated') === 'true';
          if (snapshot.empty && !isMigrated) {
            console.log("[DreamCafe] Firestore inventory is empty and this device is not migrated yet. Skipping overwrite to protect local data.");
            return;
          }
          if (!snapshot.empty) {
            localStorage.setItem('dcm_cloud_migrated', 'true');
          }

          const items = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            items.push({
              ...data,
              currentStock: Number(data.currentStock),
              minimumStock: Number(data.minimumStock)
            });
          });
          _set(KEYS.INVENTORY, items);
          if (window.App && typeof App.refreshCurrentSection === 'function') {
            App.refreshCurrentSection();
          }
        }, err => {
          console.error("[DreamCafe] Firestore inventory stream error:", err);
        });

        // Set up real-time listener for Transactions
        const unsubTransactions = firestoreDb.collection('transactions').onSnapshot(snapshot => {
          const isMigrated = localStorage.getItem('dcm_cloud_migrated') === 'true';
          if (snapshot.empty && !isMigrated) {
            return;
          }
          if (!snapshot.empty) {
            localStorage.setItem('dcm_cloud_migrated', 'true');
          }

          const txns = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            txns.push({
              ...data,
              quantity: Number(data.quantity),
              balanceAfter: Number(data.balanceAfter),
              timestamp: Number(data.timestamp || 0)
            });
          });
          _set(KEYS.TRANSACTIONS, txns);
          if (window.App && typeof App.refreshCurrentSection === 'function') {
            App.refreshCurrentSection();
          }
        }, err => {
          console.error("[DreamCafe] Firestore transactions stream error:", err);
        });

        // Set up real-time listener for Finances
        const unsubFinances = firestoreDb.collection('finances').onSnapshot(snapshot => {
          const isMigrated = localStorage.getItem('dcm_cloud_migrated') === 'true';
          if (snapshot.empty && !isMigrated) {
            return;
          }
          if (!snapshot.empty) {
            localStorage.setItem('dcm_cloud_migrated', 'true');
          }

          const records = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            records.push({
              ...data,
              amount: Number(data.amount),
              timestamp: Number(data.timestamp || 0)
            });
          });
          _set(KEYS.FINANCES, records);
          if (window.App && typeof App.refreshCurrentSection === 'function') {
            App.refreshCurrentSection();
          }
        }, err => {
          console.error("[DreamCafe] Firestore finances stream error:", err);
        });

        cloudListeners.push(unsubInventory, unsubTransactions, unsubFinances);
        console.log("[DreamCafe] Cloud Sync initialized successfully 🟢");
      } catch (err) {
        console.error("[DreamCafe] Failed to initialize Firebase:", err);
        Cloud.disconnect();
      }
    },
    disconnect: () => {
      cloudListeners.forEach(unsub => {
        try { unsub(); } catch {}
      });
      cloudListeners = [];
      firebaseApp = null;
      firestoreDb = null;
      console.log("[DreamCafe] Cloud Sync disconnected 🔴");
    },
    uploadLocalData: async () => {
      if (!firestoreDb) throw new Error("Firebase not connected");

      const batch = firestoreDb.batch();
      
      const items = getInventory();
      items.forEach(item => {
        const ref = firestoreDb.collection('inventory').doc(item.id);
        batch.set(ref, item);
      });

      const txns = getTransactions();
      txns.forEach(t => {
        const ref = firestoreDb.collection('transactions').doc(t.id);
        batch.set(ref, t);
      });

      const records = getFinances();
      records.forEach(r => {
        const ref = firestoreDb.collection('finances').doc(r.id);
        batch.set(ref, r);
      });

      await batch.commit();
      localStorage.setItem('dcm_cloud_migrated', 'true');
      console.log("[DreamCafe] Local data uploaded to Firestore successfully! 📤");
    }
  };

  // ── Inventory ─────────────────────────────────────────
  const getInventory = () => _get(KEYS.INVENTORY, []);
  const saveInventory = (items) => _set(KEYS.INVENTORY, items);

  const addItem = (item) => {
    const items = getInventory();
    const newItem = {
      ...item,
      id: generateId(),
      createdDate: new Date().toISOString().split('T')[0],
      currentStock: Number(item.currentStock),
      minimumStock: Number(item.minimumStock)
    };
    items.push(newItem);
    saveInventory(items);

    if (Cloud.isEnabled()) {
      firestoreDb.collection('inventory').doc(newItem.id).set(newItem)
        .catch(err => console.error("[DreamCafe] Firestore addItem error:", err));
    }

    return newItem;
  };

  const updateItem = (id, data) => {
    const items = getInventory();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...data };
    saveInventory(items);

    const updatedItem = items[idx];
    if (Cloud.isEnabled()) {
      firestoreDb.collection('inventory').doc(id).set(updatedItem)
        .catch(err => console.error("[DreamCafe] Firestore updateItem error:", err));
    }

    return updatedItem;
  };

  const deleteItem = (id) => {
    const name = getItemById(id)?.itemName || id;
    saveInventory(getInventory().filter(i => i.id !== id));

    if (Cloud.isEnabled()) {
      firestoreDb.collection('inventory').doc(id).delete()
        .catch(err => console.error("[DreamCafe] Firestore deleteItem error:", err));
    }
  };

  const getItemById = (id) => getInventory().find(i => i.id === id) || null;

  // ── Transactions ──────────────────────────────────────
  const getTransactions = () => _get(KEYS.TRANSACTIONS, []);
  const saveTransactions = (txns) => _set(KEYS.TRANSACTIONS, txns);

  const addTransaction = (txn) => {
    const txns = getTransactions();
    const newTxn = { ...txn, id: generateId(), timestamp: Date.now() };
    txns.push(newTxn);
    saveTransactions(txns);

    if (Cloud.isEnabled()) {
      firestoreDb.collection('transactions').doc(newTxn.id).set(newTxn)
        .catch(err => console.error("[DreamCafe] Firestore addTransaction error:", err));
    }

    return newTxn;
  };

  // ── Finances (Income / Expenses) ───────────────────────────
  const getFinances = () => _get(KEYS.FINANCES, []);
  const saveFinances = (data) => _set(KEYS.FINANCES, data);

  const addFinanceEntry = (entry) => {
    const records = getFinances();
    const newEntry = {
      ...entry,
      id: generateId(),
      amount: Number(entry.amount),
      timestamp: Date.now()
    };
    records.push(newEntry);
    saveFinances(records);

    if (Cloud.isEnabled()) {
      firestoreDb.collection('finances').doc(newEntry.id).set(newEntry)
        .catch(err => console.error("[DreamCafe] Firestore addFinanceEntry error:", err));
    }

    return newEntry;
  };

  const deleteFinanceEntry = (id) => {
    const records = getFinances().filter(r => r.id !== id);
    saveFinances(records);

    if (Cloud.isEnabled()) {
      firestoreDb.collection('finances').doc(id).delete()
        .catch(err => console.error("[DreamCafe] Firestore deleteFinanceEntry error:", err));
    }
  };

  const getFinancesSummary = (dateStr) => {
    const records = getFinances().filter(r => r.date === dateStr);
    let cashIncome = 0;
    let onlineIncome = 0;
    let cashExpense = 0;
    let onlineExpense = 0;

    records.forEach(r => {
      const amt = Number(r.amount) || 0;
      if (r.type === 'INCOME') {
        if (r.paymentMethod === 'CASH') cashIncome += amt;
        else onlineIncome += amt;
      } else if (r.type === 'EXPENSE') {
        if (r.paymentMethod === 'CASH') cashExpense += amt;
        else onlineExpense += amt;
      }
    });

    return {
      cashIncome,
      onlineIncome,
      totalIncome: cashIncome + onlineIncome,
      cashExpense,
      onlineExpense,
      totalExpense: cashExpense + onlineExpense,
      net: (cashIncome + onlineIncome) - (cashExpense + onlineExpense)
    };
  };

  const getSettings = () => {
    const s = _get(KEYS.SETTINGS, null);
    if (s && s.greenApiInstance && s.dailySummaryTime) {
      if (s.alertsEnabled === undefined) s.alertsEnabled = true;
      if (s.firebaseConfig === undefined) s.firebaseConfig = '';
      return s;
    }
    return {
      alertsEnabled: true,
      whatsappPhone: s ? s.whatsappPhone : '',
      greenApiInstance: s && s.greenApiInstance ? s.greenApiInstance : '7107658894',
      greenApiToken: s && s.greenApiToken ? s.greenApiToken : '919b5ee1ca9749e482be869b5d379d3a38db675d97d64504b4',
      dailySummaryTime: s && s.dailySummaryTime ? s.dailySummaryTime : '21:00',
      firebaseConfig: s && s.firebaseConfig ? s.firebaseConfig : ''
    };
  };
  const saveSettings = (s) => _set(KEYS.SETTINGS, s);

  return {
    generateId,
    getInventory, saveInventory, addItem, updateItem, deleteItem, getItemById,
    getTransactions, saveTransactions, addTransaction,
    getFinances, saveFinances, addFinanceEntry, deleteFinanceEntry, getFinancesSummary,
    getSettings, saveSettings,
    Cloud
  };
})();
