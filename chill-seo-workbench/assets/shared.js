/* shared.js — common utilities for Stream SEO Pros tools */

/* ─── OUTPUT CLEANING ─── */
function cleanOutput(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^-\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ─── GROQ API CALL ─── */
async function callGroq(apiKey, systemPrompt, userPrompt, temperature, maxTokens) {
  temperature = temperature !== undefined ? temperature : 0.4;
  maxTokens   = maxTokens   !== undefined ? maxTokens   : 1500;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   }
      ]
    })
  });
  if (!res.ok) throw new Error('API error ' + res.status);
  const data = await res.json();
  return data.choices[0].message.content;
}

/* ─── PAGE FETCH ─── */
async function fetchPageText(url) {
  const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
  const res = await fetch(proxy);
  if (!res.ok) throw new Error('Fetch failed');
  const data = await res.json();
  let html = data.contents || '';
  const div = document.createElement('div');
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

/* ─── TOAST ─── */
function showToast(message, type) {
  type = type || 'default';
  var existing = document.getElementById('global-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'global-toast';
  toast.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      toast.classList.add('show');
    });
  });

  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 350);
  }, 2500);
}

/* ─── COPY BUTTON ─── */
function attachCopyBtn(btn, getTextFn) {
  btn.addEventListener('click', function() {
    var text = getTextFn();
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() {
      btn.textContent = 'Copied ✓';
      btn.classList.add('copied');
      setTimeout(function() {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    }).catch(function() {
      showToast('Copy failed — select text manually.', 'error');
    });
  });
}

/* ─── FEEDBACK ─── */
function initFeedback(containerEl, storageKey, toolName, getOutputFn) {
  var thumbUp   = containerEl.querySelector('.feedback-up');
  var thumbDown = containerEl.querySelector('.feedback-down');
  var detail    = containerEl.querySelector('.feedback-detail');
  var sendBtn   = containerEl.querySelector('.feedback-send');
  var textarea  = containerEl.querySelector('.feedback-textarea');

  if (!thumbUp || !thumbDown) return;

  function saveFeedback(rating, comment) {
    var key  = storageKey;
    var list = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
    var output = '';
    try { output = (getOutputFn() || '').substring(0, 200); } catch(e) {}
    list.push({
      tool:          toolName,
      timestamp:     new Date().toISOString(),
      rating:        rating,
      comment:       comment || '',
      outputSnippet: output
    });
    localStorage.setItem(key, JSON.stringify(list));
  }

  thumbUp.addEventListener('click', function() {
    thumbUp.classList.add('active-up');
    thumbDown.classList.remove('active-down');
    if (detail) detail.classList.remove('show');
    saveFeedback('up', '');
    showToast('Thanks for the feedback!', 'success');
  });

  thumbDown.addEventListener('click', function() {
    thumbDown.classList.add('active-down');
    thumbUp.classList.remove('active-up');
    if (detail) detail.classList.add('show');
  });

  if (sendBtn && textarea) {
    sendBtn.addEventListener('click', function() {
      saveFeedback('down', textarea.value.trim());
      detail.classList.remove('show');
      showToast('Feedback saved.', 'success');
      textarea.value = '';
    });
  }
}

/* ─── BUILD FEEDBACK ROW HTML ─── */
function feedbackRowHTML() {
  return '<div class="feedback-row">' +
    '<span class="feedback-label">Was this helpful?</span>' +
    '<button class="feedback-btn feedback-up" title="Good output">👍</button>' +
    '<button class="feedback-btn feedback-down" title="Bad output">👎</button>' +
    '<div class="feedback-detail">' +
      '<textarea class="textarea-field feedback-textarea" rows="2" placeholder="What was wrong?"></textarea>' +
      '<button class="btn-ghost btn-sm feedback-send">Send feedback</button>' +
    '</div>' +
  '</div>';
}

/* ─── BUILD OUTPUT BLOCK WITH COPY + FEEDBACK ─── */
function buildOutputBlock(id, label) {
  var html = '';
  if (label) html += '<div class="section-heading" style="margin-bottom:10px;">' + label + '</div>';
  html += '<div class="output-block" id="' + id + '-block">';
  html += '<button class="copy-btn" id="' + id + '-copy">Copy</button>';
  html += '<div class="output-placeholder" id="' + id + '-placeholder">Output will appear here.</div>';
  html += '<div class="output-text" id="' + id + '-text" style="display:none;"></div>';
  html += '</div>';
  html += feedbackRowHTML();
  return html;
}

/* ─── RENDER OUTPUT INTO BLOCK ─── */
function renderOutput(id, text) {
  var placeholder = document.getElementById(id + '-placeholder');
  var textEl      = document.getElementById(id + '-text');
  var copyBtn     = document.getElementById(id + '-copy');

  if (placeholder) placeholder.style.display = 'none';
  if (textEl) {
    textEl.style.display = 'block';
    textEl.textContent   = cleanOutput(text);
  }
  if (copyBtn) {
    attachCopyBtn(copyBtn, function() {
      return textEl ? textEl.textContent : '';
    });
  }
}

/* ─── SHOW LOADING STATE IN BLOCK ─── */
function showBlockLoading(id) {
  var placeholder = document.getElementById(id + '-placeholder');
  var textEl      = document.getElementById(id + '-text');
  if (placeholder) {
    placeholder.style.display = 'block';
    placeholder.innerHTML = '<span class="spinner"></span> Generating...';
  }
  if (textEl) {
    textEl.style.display = 'none';
    textEl.textContent   = '';
  }
}

/* ─── API KEY HELPERS ─── */
function getApiKey(storageKey) {
  return localStorage.getItem(storageKey) || '';
}

function saveApiKey(storageKey, value) {
  localStorage.setItem(storageKey, value.trim());
}

function clearApiKey(storageKey) {
  localStorage.removeItem(storageKey);
}

/* ─── INIT API KEY CARD ─── */
function initApiKeyCard(opts) {
  /* opts: { storageKey, cardId, inputId, saveId, clearId, badgeId, toggleId, contentId } */
  var input   = document.getElementById(opts.inputId);
  var saveBtn = document.getElementById(opts.saveId);
  var clrBtn  = document.getElementById(opts.clearId);
  var badge   = document.getElementById(opts.badgeId);
  var toggle  = document.getElementById(opts.toggleId);
  var content = document.getElementById(opts.contentId);

  function updateBadge() {
    var key = getApiKey(opts.storageKey);
    if (badge) {
      badge.className = key ? 'badge-success' : 'badge-warning';
      badge.textContent = key ? 'API Key Connected ✓' : 'No Key Set';
    }
    if (input) input.value = key ? key.substring(0, 8) + '...' : '';
  }

  if (toggle && content) {
    toggle.addEventListener('click', function() {
      content.classList.toggle('show');
      toggle.textContent = content.classList.contains('show') ? 'Hide ▴' : 'Manage ▾';
    });
  }

  if (saveBtn && input) {
    saveBtn.addEventListener('click', function() {
      var val = input.value.trim().replace(/\.\.\.$/, '');
      if (!val) { showToast('Enter your Groq API key.', 'error'); return; }
      saveApiKey(opts.storageKey, val);
      updateBadge();
      showToast('Key saved to your browser.', 'success');
      if (content) content.classList.remove('show');
    });
  }

  if (clrBtn) {
    clrBtn.addEventListener('click', function() {
      clearApiKey(opts.storageKey);
      if (input) input.value = '';
      updateBadge();
      showToast('API key cleared.', 'error');
    });
  }

  updateBadge();
}

/* ─── CHECK API KEY ON TOOL PAGES ─── */
function requireApiKey(storageKey, warningId) {
  var key = getApiKey(storageKey);
  var el  = document.getElementById(warningId);
  if (!key && el) el.style.display = 'flex';
  return key;
}
