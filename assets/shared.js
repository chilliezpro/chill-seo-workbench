// ── Model Config ─────────────────────────────────────────────────

var MODEL_CONFIG = {
  model: 'llama-3.3-70b-versatile',
  defaultTemperature: 0.3,
  maxTokens: 1800
};

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

// ── Groq API Call ─────────────────────────────────────────────────

async function callGroq(apiKey, systemPrompt, userPrompt, temperature, maxTokens) {
  temperature = temperature !== undefined ? temperature : 0.4;
  maxTokens = maxTokens !== undefined ? maxTokens : 1500;

  var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL_CONFIG.model,
      temperature: temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
  if (!res.ok) throw new Error('API error ' + res.status);
  var data = await res.json();
  return data.choices[0].message.content;
}

// ── Self-Check + Reliable Call ────────────────────────────────────

function withSelfCheck(systemPrompt, requiredSections) {
  var sectionList = requiredSections.join(', ');
  return systemPrompt + '\n\nSELF-CHECK (required before responding):\nBefore you output your final answer, verify:\n1. Does the output include ALL of these exact section headers: ' + sectionList + '?\n2. Did you follow every formatting rule given above exactly?\n3. Is every claim grounded in the actual source content provided — not invented or generic?\nIf any check fails, silently correct your response before outputting it. Do not mention this self-check process in your final answer.';
}

function validateOutput(text, requiredSections) {
  var missing = requiredSections.filter(function(section) {
    return text.toUpperCase().indexOf(section.toUpperCase()) === -1;
  });
  return { valid: missing.length === 0, missing: missing };
}

async function callGroqReliable(apiKey, systemPrompt, userPrompt, requiredSections, temperature, maxTokens) {
  var temp = temperature !== undefined ? temperature : MODEL_CONFIG.defaultTemperature;
  var tokens = maxTokens !== undefined ? maxTokens : MODEL_CONFIG.maxTokens;
  var fullSystemPrompt = withSelfCheck(systemPrompt, requiredSections);

  var output = await callGroq(apiKey, fullSystemPrompt, userPrompt, temp, tokens);
  var check = validateOutput(output, requiredSections);

  if (!check.valid) {
    var retryPrompt = userPrompt + '\n\nIMPORTANT: Your previous response was missing these required sections: ' + check.missing.join(', ') + '. Regenerate the FULL response, following the exact format, with ALL required sections present this time.';
    output = await callGroq(apiKey, fullSystemPrompt, retryPrompt, temp, tokens);
  }

  return output;
}

// ── Page Fetch ────────────────────────────────────────────────────

async function fetchPageText(url) {
  var encodedUrl = encodeURIComponent(url);

  function extractText(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    ['script','style','nav','footer','header','aside',
     'noscript','iframe','form','button','svg','img',
     'figure','picture'].forEach(function(tag) {
      div.querySelectorAll(tag).forEach(function(el) { el.remove(); });
    });
    var text = div.innerText || div.textContent || '';
    text = text.replace(/\n{3,}/g, '\n\n')
               .replace(/[ \t]{2,}/g, ' ')
               .trim();
    return text.length > 3500 ? text.substring(0, 3500) + '...' : text;
  }

  var proxies = [
    async function() {
      var ctrl = new AbortController();
      var t = setTimeout(function() { ctrl.abort(); }, 8000);
      try {
        var res = await fetch('https://corsproxy.io/?' + encodedUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error('status ' + res.status);
        return extractText(await res.text());
      } catch(e) { clearTimeout(t); throw e; }
    },
    async function() {
      var ctrl = new AbortController();
      var t = setTimeout(function() { ctrl.abort(); }, 8000);
      try {
        var res = await fetch('https://api.allorigins.win/get?url=' + encodedUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error('status ' + res.status);
        var d = await res.json();
        return extractText(d.contents || '');
      } catch(e) { clearTimeout(t); throw e; }
    },
    async function() {
      var ctrl = new AbortController();
      var t = setTimeout(function() { ctrl.abort(); }, 8000);
      try {
        var res = await fetch('https://api.codetabs.com/v1/proxy?quest=' + encodedUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error('status ' + res.status);
        return extractText(await res.text());
      } catch(e) { clearTimeout(t); throw e; }
    }
  ];

  for (var i = 0; i < proxies.length; i++) {
    try {
      var result = await proxies[i]();
      if (result && result.length >= 100) return result;
    } catch(e) {}
  }
  throw new Error('Could not fetch page. Try pasting the content manually instead.');
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

// ── API Key Helpers ───────────────────────────────────────────────

function getApiKey(storageKey) {
  return localStorage.getItem(storageKey) || '';
}

function saveApiKey(storageKey, value) {
  localStorage.setItem(storageKey, value.trim());
}

function clearApiKey(storageKey) {
  localStorage.removeItem(storageKey);
}

// ── Auth Helpers ──────────────────────────────────────────────────

function checkAuth(storageKey) {
  return localStorage.getItem(storageKey) === '1';
}

function setAuth(storageKey) {
  localStorage.setItem(storageKey, '1');
}
