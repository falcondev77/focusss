const currentSiteTextEl = document.getElementById('currentSiteText');
const blockCurrentBtn = document.getElementById('blockCurrentBtn');
const copySiteBtn = document.getElementById('copySiteBtn');
const addMultipleSitesBtn = document.getElementById('addMultipleSitesBtn');
const blockedListEl = document.getElementById('blockedList');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

let currentUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentSite();
  await loadBlockedList();
  setupEventListeners();
  setupTabs();
});

function setupTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });
}

async function loadCurrentSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      currentUrl = url.hostname;
      currentSiteTextEl.textContent = currentUrl;

      const data = await chrome.storage.local.get('blockedSites');
      const blockedSites = data.blockedSites || {};

      if (blockedSites[currentUrl]) {
        blockCurrentBtn.textContent = 'Sito gia bloccato';
        blockCurrentBtn.disabled = true;
      }
    } else {
      currentSiteTextEl.textContent = 'Non disponibile';
      blockCurrentBtn.disabled = true;
    }
  } catch (error) {
    console.error('Errore nel caricamento del sito:', error);
    currentSiteTextEl.textContent = 'Errore';
  }
}

function setupEventListeners() {
  blockCurrentBtn.addEventListener('click', () => {
    if (currentUrl) {
      blockSite(currentUrl);
    }
  });

  copySiteBtn.addEventListener('click', () => {
    if (currentUrl) {
      navigator.clipboard.writeText(currentUrl);
    }
  });

  addMultipleSitesBtn.addEventListener('click', addMultipleSites);
}

async function blockSite(hostname) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.tabs.sendMessage(tab.id, {
      action: 'showDurationForm',
      hostname: hostname
    });

    window.close();
  } catch (error) {
    console.error('Errore nel blocco del sito:', error);
    alert('Impossibile bloccare questo sito. Ricarica la pagina e riprova.');
  }
}

async function addMultipleSites() {
  const sites = [];

  const checkboxes = document.querySelectorAll('.social-checkbox:checked');
  checkboxes.forEach(cb => sites.push(cb.value));

  const inputs = document.querySelectorAll('.url-input');
  inputs.forEach(input => {
    const value = input.value.trim();
    if (value) {
      let cleanUrl = value.replace(/^(https?:\/\/)?(www\.)?/, '');
      cleanUrl = cleanUrl.replace(/\/.*$/, '');
      if (cleanUrl && !sites.includes(cleanUrl)) {
        sites.push(cleanUrl);
      }
    }
  });

  const sitesToAdd = sites.slice(0, 5);

  if (sitesToAdd.length === 0) {
    alert('Seleziona almeno un sito o inserisci un URL');
    return;
  }

  const data = await chrome.storage.local.get('blockedSites');
  const blockedSites = data.blockedSites || {};

  sitesToAdd.forEach(site => {
    if (!blockedSites[site]) {
      blockedSites[site] = {
        duration: 0,
        endTime: 0,
        needsDuration: true
      };
    }
  });

  await chrome.storage.local.set({ blockedSites });
  await loadBlockedList();

  checkboxes.forEach(cb => cb.checked = false);
  inputs.forEach(input => input.value = '');

  tabs.forEach(t => t.classList.remove('active'));
  tabContents.forEach(tc => tc.classList.remove('active'));
  document.querySelector('[data-tab="list"]').classList.add('active');
  document.getElementById('tab-list').classList.add('active');
}

async function loadBlockedList() {
  const data = await chrome.storage.local.get('blockedSites');
  const blockedSites = data.blockedSites || {};

  blockedListEl.innerHTML = '';

  const sites = Object.keys(blockedSites);

  if (sites.length === 0) {
    blockedListEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 12h8"/>
        </svg>
        <p>Nessun sito bloccato</p>
      </div>
    `;
    return;
  }

  sites.forEach(hostname => {
    const site = blockedSites[hostname];
    const item = document.createElement('div');
    item.className = 'blocked-item';

    let timeText = 'In attesa di configurazione';
    if (!site.needsDuration && site.endTime > 0) {
      const remaining = Math.max(0, Math.ceil((site.endTime - Date.now()) / 60000));
      if (remaining > 0) {
        timeText = `${remaining} minuti rimanenti`;
      } else {
        timeText = 'Blocco scaduto';
      }
    }

    item.innerHTML = `
      <div class="blocked-item-info">
        <div class="blocked-item-url">${hostname}</div>
        <div class="blocked-item-time">${timeText}</div>
      </div>
      <button class="blocked-item-remove" data-hostname="${hostname}">Rimuovi</button>
    `;

    blockedListEl.appendChild(item);
  });

  document.querySelectorAll('.blocked-item-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const hostname = e.target.dataset.hostname;
      await removeSite(hostname);
    });
  });
}

async function removeSite(hostname) {
  const data = await chrome.storage.local.get('blockedSites');
  const blockedSites = data.blockedSites || {};

  delete blockedSites[hostname];

  await chrome.storage.local.set({ blockedSites });
  await loadBlockedList();

  chrome.runtime.sendMessage({
    action: 'siteUnblocked',
    hostname: hostname
  });
}
