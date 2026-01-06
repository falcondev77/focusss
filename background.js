// Background Service Worker per gestire timer e storage

// Inizializzazione
chrome.runtime.onInstalled.addListener(() => {
  console.log('Blocker Temporaneo installato');
  initializeStorage();
});

// Inizializza lo storage
async function initializeStorage() {
  const data = await chrome.storage.local.get(['blockedSites', 'temporaryUnblocks']);
  
  if (!data.blockedSites) {
    await chrome.storage.local.set({ blockedSites: {} });
  }
  
  if (!data.temporaryUnblocks) {
    await chrome.storage.local.set({ temporaryUnblocks: {} });
  }
  
  cleanExpiredBlocks();
}

// Pulisci blocchi e sblocchi temporanei scaduti
async function cleanExpiredBlocks() {
  const data = await chrome.storage.local.get(['blockedSites', 'temporaryUnblocks']);
  let blockedSites = data.blockedSites || {};
  let temporaryUnblocks = data.temporaryUnblocks || {};
  
  const now = Date.now();
  let changed = false;
  
  Object.keys(blockedSites).forEach(hostname => {
    const site = blockedSites[hostname];
    if (!site.needsDuration && site.endTime > 0 && site.endTime < now) {
      delete blockedSites[hostname];
      changed = true;
    }
  });
  
  Object.keys(temporaryUnblocks).forEach(hostname => {
    if (temporaryUnblocks[hostname] < now) {
      delete temporaryUnblocks[hostname];
      changed = true;
    }
  });
  
  if (changed) {
    await chrome.storage.local.set({ blockedSites, temporaryUnblocks });
  }
}

// Pulisci ogni minuto
setInterval(cleanExpiredBlocks, 60000);

// Listener per messaggi da popup e content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'siteUnblocked') {
    notifyTabsAboutUnblock(message.hostname);
    sendResponse({ success: true });
  } else if (message.action === 'cleanExpired') {
    cleanExpiredBlocks().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Notifica i tab aperti che un sito è stato sbloccato
async function notifyTabsAboutUnblock(hostname) {
  const tabs = await chrome.tabs.query({});
  
  for (const tab of tabs) {
    try {
      if (tab.url && new URL(tab.url).hostname === hostname) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'removeBlock'
        });
      }
    } catch (error) {
      // Ignora errori per tab che non possono ricevere messaggi
    }
  }
}

// Listener per cambio di tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'checkBlock'
      });
    }
  } catch (error) {
    // Ignora errori
  }
});

// Listener per aggiornamento di tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'checkBlock'
      });
    } catch (error) {
      // Ignora errori
    }
  }
});

// Gestione alarm per pulizia periodica
chrome.alarms.create('cleanExpired', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanExpired') {
    cleanExpiredBlocks();
  }
});