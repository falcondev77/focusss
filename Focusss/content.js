// Variabili globali
let countdownInterval = null;
let currentHostname = '';
let temporaryUnblockTimeout = null;

// Inizializzazione
(async function init() {
  try {
    currentHostname = window.location.hostname;
    await checkBlockStatus();
  } catch (error) {
    console.error('Errore inizializzazione blocker:', error);
  }
})();

// Verifica se il sito corrente è bloccato
async function checkBlockStatus() {
  const data = await chrome.storage.local.get(['blockedSites', 'temporaryUnblocks']);
  const blockedSites = data.blockedSites || {};
  const temporaryUnblocks = data.temporaryUnblocks || {};
  
  const siteData = blockedSites[currentHostname];
  
  if (!siteData) return;
  
  // Se il sito ha bisogno della durata, mostra il form
  if (siteData.needsDuration) {
    showDurationForm(currentHostname);
    return;
  }
  
  // Verifica se c'è uno sblocco temporaneo attivo
  const tempUnblock = temporaryUnblocks[currentHostname];
  if (tempUnblock && tempUnblock > Date.now()) {
    const remaining = tempUnblock - Date.now();
    temporaryUnblockTimeout = setTimeout(() => {
      checkBlockStatus();
    }, remaining);
    return;
  }
  
  // Verifica se il blocco è ancora attivo
  const now = Date.now();
  if (siteData.endTime > now) {
    showBlockOverlay(siteData.endTime);
  } else {
    // Blocco scaduto, rimuovi dalla lista
    delete blockedSites[currentHostname];
    await chrome.storage.local.set({ blockedSites });
  }
}

// Mostra il form per inserire la durata
function showDurationForm(hostname) {
  const existing = document.getElementById('blockerDurationOverlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'blockerDurationOverlay';
  overlay.innerHTML = `
    <div id="blockerDurationForm">
      <h2>⏱️ Imposta Durata Blocco</h2>
      <p>Stai per bloccare: <span class="site-name">${hostname}</span></p>
      <label for="durationInput">Per quanti minuti vuoi bloccare questo sito?</label>
      <input 
        type="number" 
        id="durationInput" 
        min="1" 
        max="480" 
        value="30" 
        placeholder="Inserisci minuti (1-480)"
      >
      <div>
        <button id="blockerConfirmBtn">Conferma Blocco</button>
        <button id="blockerCancelBtn">Annulla</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const confirmBtn = document.getElementById('blockerConfirmBtn');
  const cancelBtn = document.getElementById('blockerCancelBtn');
  const input = document.getElementById('durationInput');
  
  input.focus();
  input.select();
  
  confirmBtn.addEventListener('click', () => confirmDuration(hostname, input));
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    removeSiteFromBlocked(hostname);
  });
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      confirmDuration(hostname, input);
    }
  });
}

// Conferma la durata e attiva il blocco
async function confirmDuration(hostname, inputElement) {
  const minutes = parseInt(inputElement.value);
  
  if (isNaN(minutes) || minutes < 1 || minutes > 480) {
    alert('Inserisci un valore valido tra 1 e 480 minuti');
    return;
  }
  
  const data = await chrome.storage.local.get('blockedSites');
  const blockedSites = data.blockedSites || {};
  
  const endTime = Date.now() + (minutes * 60 * 1000);
  
  blockedSites[hostname] = {
    duration: minutes,
    endTime: endTime,
    needsDuration: false
  };
  
  await chrome.storage.local.set({ blockedSites });
  
  const overlay = document.getElementById('blockerDurationOverlay');
  if (overlay) overlay.remove();
  
  showBlockOverlay(endTime);
}

// Rimuovi un sito dalla lista bloccati
async function removeSiteFromBlocked(hostname) {
  const data = await chrome.storage.local.get('blockedSites');
  const blockedSites = data.blockedSites || {};
  delete blockedSites[hostname];
  await chrome.storage.local.set({ blockedSites });
}

// Mostra l'overlay di blocco con countdown
function showBlockOverlay(endTime) {
  document.body.classList.add('blocker-blurred');
  
  const existing = document.getElementById('blockerOverlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'blockerOverlay';
  overlay.innerHTML = `
    <div class="blocker-content">
      <h1>🚫 Sito Bloccato</h1>
      <p class="blocker-message">Hai deciso di bloccare temporaneamente questo sito</p>
      <div class="blocker-countdown" id="blockerCountdown">00:00</div>
      <div class="blocker-buttons">
        <button id="blockerUnlockBtn">⏸️ SBLOCCA PER 5 MINUTI</button>
        <button id="blockerExitBtn">🚪 ESCI</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  document.getElementById('blockerUnlockBtn').addEventListener('click', temporaryUnblock);
  document.getElementById('blockerExitBtn').addEventListener('click', permanentUnblock);
  
  startCountdown(endTime);
}

// Avvia il countdown
function startCountdown(endTime) {
  const countdownEl = document.getElementById('blockerCountdown');
  
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  function updateCountdown() {
    const now = Date.now();
    const remaining = Math.max(0, endTime - now);
    
    if (remaining === 0) {
      clearInterval(countdownInterval);
      removeBlockOverlay();
      return;
    }
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    countdownEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

// Sblocco temporaneo (5 minuti)
async function temporaryUnblock() {
  const unlockUntil = Date.now() + (5 * 60 * 1000);
  
  const data = await chrome.storage.local.get('temporaryUnblocks');
  const temporaryUnblocks = data.temporaryUnblocks || {};
  
  temporaryUnblocks[currentHostname] = unlockUntil;
  await chrome.storage.local.set({ temporaryUnblocks });
  
  removeBlockOverlay();
  
  temporaryUnblockTimeout = setTimeout(() => {
    checkBlockStatus();
  }, 5 * 60 * 1000);
}

// Sblocco permanente (rimuove dalla lista)
async function permanentUnblock() {
  await removeSiteFromBlocked(currentHostname);
  removeBlockOverlay();
}

// Rimuovi overlay di blocco
function removeBlockOverlay() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  document.body.classList.remove('blocker-blurred');
  
  const overlay = document.getElementById('blockerOverlay');
  if (overlay) overlay.remove();
}

// Listener per messaggi dal popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showDurationForm') {
    showDurationForm(message.hostname);
    sendResponse({ success: true });
  } else if (message.action === 'checkBlock') {
    checkBlockStatus();
    sendResponse({ success: true });
  } else if (message.action === 'removeBlock') {
    removeBlockOverlay();
    sendResponse({ success: true });
  }
  return true;
});

// Listener per aggiornamenti dello storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.blockedSites || changes.temporaryUnblocks)) {
    checkBlockStatus();
  }
});