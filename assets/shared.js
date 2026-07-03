// ── Output Cleaning ──────────────────────────────────────────────

function cleanOutput(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^-\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Generation Proxy ────────────────────────────────────────────────

var INTERNAL_SECRET = 'chill-seo';
// ↑ This is not a security boundary by itself — it just
// stops random visitors from finding and hitting the
// endpoint directly. Real protection is the portal password
// gate that already exists in front of this.

async function generateContent(systemPrompt, userPrompt, requiredSections, temperature, maxTokens) {
  var res = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET
    },
    body: JSON.stringify({
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      requiredSections: requiredSections,
      temperature: temperature,
      maxTokens: maxTokens
    })
  });

  if (!res.ok) {
    var err = await res.json();
    throw new Error(err.error || 'Generation failed');
  }

  var data = await res.json();
  return data.result;
}

// ── Page Fetch ────────────────────────────────────────────────────

async function fetchPageText(url) {
  const res = await fetch('/api/fetch-page', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET
    },
    body: JSON.stringify({ url })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Fetch failed');
  }

  const data = await res.json();
  return data.text;
}

// ── Toast ─────────────────────────────────────────────────────────

function showToast(message) {
  var toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function() {
    toast.classList.remove('show');
  }, 2500);
}

// ── Copy Button ───────────────────────────────────────────────────

function initCopyBtn(btnEl, getTextFn) {
  btnEl.addEventListener('click', function() {
    var text = getTextFn();
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() {
      btnEl.textContent = 'Copied ✓';
      btnEl.classList.add('copied');
      setTimeout(function() {
        btnEl.textContent = 'Copy';
        btnEl.classList.remove('copied');
      }, 2000);
    });
  });
}

// ── Feedback ──────────────────────────────────────────────────────

function initFeedback(containerEl, storageKey, toolName, getOutputSnippet) {
  var thumbUp = containerEl.querySelector('.feedback-btn-up');
  var thumbDown = containerEl.querySelector('.feedback-btn-down');
  var expandEl = containerEl.querySelector('.feedback-expand');
  var commentEl = containerEl.querySelector('.feedback-comment');
  var sendBtn = containerEl.querySelector('.feedback-send');
  var rating = null;

  function saveEntry(r, comment) {
    var entries = [];
    try { entries = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) {}
    entries.push({
      tool: toolName,
      timestamp: new Date().toISOString(),
      rating: r,
      comment: comment || '',
      outputSnippet: (getOutputSnippet() || '').substring(0, 200)
    });
    localStorage.setItem(storageKey, JSON.stringify(entries));
  }

  if (thumbUp) {
    thumbUp.addEventListener('click', function() {
      rating = 'up';
      thumbUp.classList.add('active-up');
      if (thumbDown) thumbDown.classList.remove('active-down');
      if (expandEl) expandEl.classList.remove('open');
      saveEntry('up', '');
      showToast('Thanks for the feedback!');
    });
  }

  if (thumbDown) {
    thumbDown.addEventListener('click', function() {
      rating = 'down';
      thumbDown.classList.add('active-down');
      if (thumbUp) thumbUp.classList.remove('active-up');
      if (expandEl) expandEl.classList.add('open');
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', function() {
      var comment = commentEl ? commentEl.value.trim() : '';
      saveEntry('down', comment);
      if (expandEl) expandEl.classList.remove('open');
      if (commentEl) commentEl.value = '';
      showToast('Feedback saved.');
    });
  }
}

// ── Preferences Panel Toggle ──────────────────────────────────────

function initPrefPanel(toggleBtn, contentEl) {
  toggleBtn.addEventListener('click', function() {
    contentEl.classList.toggle('open');
    var isOpen = contentEl.classList.contains('open');
    toggleBtn.textContent = toggleBtn.dataset.label + (isOpen ? ' ▴' : ' ▾');
  });
}

// ── Radio Button Groups ───────────────────────────────────────────

function initRadioGroup(groupEl, onChange) {
  var btns = groupEl.querySelectorAll('.radio-btn');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      btns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (onChange) onChange(btn.dataset.value);
    });
  });
}

function getRadioValue(groupEl) {
  var active = groupEl.querySelector('.radio-btn.active');
  return active ? active.dataset.value : null;
}

// ── Auth Helpers ──────────────────────────────────────────────────

function checkAuth(storageKey) {
  return localStorage.getItem(storageKey) === '1';
}

function setAuth(storageKey) {
  localStorage.setItem(storageKey, '1');
}
