const movieMapping = {
  douban_id: ['豆瓣ID', 'douban_id', 'doubanId', '豆瓣id'],
  title: ['电影/电视剧/番组', '影视标题', '电影标题', '片名', '标题', 'Name', 'title'],
  rating: ['个人评分', '评分', 'rating', 'score'],
  rating_date: ['打分日期', '日期', 'date'],
  my_comment: ['我的短评', '短评', 'comment'],
  release_date: ['上映日期', 'release date'],
  country: ['制片国家', '制片国家/地区', '国家', 'country'],
  url: ['条目链接', '链接', 'url', 'link'],
  cover: ['影视封面', '电影封面', '封面', 'cover', 'image'],
  director: ['导演', 'director'],
  actors: ['主演', 'actors'],
  genres: ['类型', '电影类型', 'genres'],
  screenwriter: ['编剧', 'screenwriter'],
  runtime: ['片长', 'runtime'],
  language: ['语言', 'language'],
  imdb: ['IMDb', 'imdb'],
  douban_rating: ['豆瓣评分', 'douban_rating'],
  tags: ['标签', '关键词', 'tags'],
  production_company: ['出品方', 'production_company'],
  category: ['种类', '类别', '条目类型', 'category'],
  progress_status: ['进度状态', '观看进度', '状态', 'progress']
};

const bookMapping = {
  douban_id: ['豆瓣ID', 'douban_id', 'doubanId', '豆瓣id'],
  title: ['图书书名', '书名', '标题', 'Name', 'title'],
  rating: ['个人评分', '评分', 'rating', 'score'],
  rating_date: ['打分日期', '日期', 'date'],
  my_comment: ['我的短评', '短评', 'comment'],
  pubdate: ['出版日期', '出版时间', 'publication date'],
  publish_year: ['出版年', 'publication year'],
  author: ['图书作者', '作者', '作者名', 'author'],
  publisher: ['出版社', '出版方', '出版机构', 'publisher'],
  isbn: ['ISBN', 'isbn', '书号', '条形码'],
  url: ['条目链接', '链接', 'url', 'link'],
  cover: ['图书封面', '封面', 'cover', 'image']
};

console.log('Popup script initializing...');

let currentItemInfo = null;
let scannedItems = [];
let batchRunning = false;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM ready, initializing UI...');

  const ui = {
    appIdInput: document.getElementById('appId'),
    appSecretInput: document.getElementById('appSecret'),
    movieTableUrlInput: document.getElementById('movieTableUrl'),
    bookTableUrlInput: document.getElementById('bookTableUrl'),
    batchMovieTableUrlInput: document.getElementById('batchMovieTableUrl'),
    tmdbApiKeyInput: document.getElementById('tmdbApiKey'),
    saveSettingsButton: document.getElementById('saveSettings'),
    verifyConnectionButton: document.getElementById('verifyConnection'),
    itemTypeSelect: document.getElementById('itemType'),
    getInfoButton: document.getElementById('getInfo'),
    saveToFeishuButton: document.getElementById('saveToFeishu'),
    statusDiv: document.getElementById('status'),
    infoDiv: document.getElementById('infoDisplay'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    scanListBtn: document.getElementById('scanListBtn'),
    startBatchBtn: document.getElementById('startBatchBtn'),
    scanResult: document.getElementById('scanResult'),
    batchProgress: document.getElementById('batchProgress'),
    batchResults: document.getElementById('batchResults'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    resultsSummary: document.getElementById('resultsSummary'),
    resultsList: document.getElementById('resultsList'),
    rateLimit: document.getElementById('rateLimit'),
    equalStrategy: document.getElementById('equalStrategy'),
    batchStepRun: document.getElementById('batch-step-run'),
    completenessFields: document.getElementById('completenessFields')
  };

  if (!ui.saveSettingsButton || !ui.verifyConnectionButton) {
    console.error('Critical buttons not found!');
    if (ui.statusDiv) ui.statusDiv.textContent = 'Error: UI Init Failed';
    return;
  }

  function extractFeishuInfo(url) {
    if (!url) return null;
    // 严格校验：必须匹配 /base/{appToken}?table={tableId} 或 /base/{appToken}/{tableId}
    const fsMatch = url.match(/https:\/\/(?:[^.]+\.)?(?:feishu\.cn|bytedance\.net|larksuite\.com)\/base\/([a-zA-Z0-9]+)(?:\?table=|(?:\?[^&]*&table=|\/)([a-zA-Z0-9]+))/i);
    if (!fsMatch) return null;
    try {
      const appToken = fsMatch[1];
      let tableId = fsMatch[2] || null;
      // 也试 query string 中的 table=
      if (!tableId) {
        const qs = url.match(/[?&]table=([a-zA-Z0-9]+)/i);
        tableId = qs ? qs[1] : null;
      }
      if (appToken) {
        return { appToken, tableId };
      }
      return null;
    } catch (e) {
      console.error('[POP] URL Parsing Error:', e);
      return null;
    }
  }

  function setStatus(message, isError = false) {
    console.log(`Status: ${message} (Error: ${isError})`);
    if (!ui.statusDiv) return;
    ui.statusDiv.textContent = message;
    ui.statusDiv.className = 'status-bar ' + (isError ? 'error' : 'success');
    if (!isError) {
      setTimeout(() => {
        if (ui.statusDiv.textContent === message) {
          ui.statusDiv.textContent = '';
          ui.statusDiv.className = 'status-bar';
        }
      }, 5000);
    }
  }

  async function sendMessageToBackground(action, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown background error'));
        }
      });
    });
  }

  async function sendMessageToContentScript(action, payload) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error("请刷新页面后重试 (Content Script未加载)"));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown content script error'));
        }
      });
    });
  }

  async function loadImage(url, imgId) {
    try {
      const response = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Load failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = document.getElementById(imgId);
      if (img) {
        img.src = objectUrl;
        img.onload = () => URL.revokeObjectURL(objectUrl);
      }
    } catch (e) {
      const img = document.getElementById(imgId);
      if (img) img.style.display = 'none';
    }
  }

  function initTheme() {
    const toggleBtn = document.getElementById('themeToggle');
    if (!toggleBtn) return;

    const applyTheme = (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
      toggleBtn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
      chrome.storage.local.set({ theme });
    };

    // 读取存储的主题偏好
    chrome.storage.local.get(['theme'], (data) => {
      const theme = data.theme || 'light';
      applyTheme(theme);
    });

    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
  }

  function initTabs() {
    ui.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        ui.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ui.tabPanels.forEach(p => {
          p.classList.remove('active');
          if (p.id === `panel-${targetTab}`) {
            p.classList.add('active');
          }
        });
      });
    });
  }

  async function loadSettings() {
    const data = await chrome.storage.local.get([
      'appId', 'appSecret', 'movieTableUrl', 'batchMovieTableUrl', 'bookTableUrl', 'tmdbApiKey',
      'rateLimit', 'equalStrategy', 'requiredFieldsMovie', 'requiredFieldsBook'
    ]);
    ui.appIdInput.value = data.appId || '';
    ui.appSecretInput.value = data.appSecret || '';
    ui.movieTableUrlInput.value = data.movieTableUrl || '';
    if (ui.batchMovieTableUrlInput) ui.batchMovieTableUrlInput.value = data.batchMovieTableUrl || '';
    ui.bookTableUrlInput.value = data.bookTableUrl || '';
    if (ui.tmdbApiKeyInput) ui.tmdbApiKeyInput.value = data.tmdbApiKey || '';
    if (ui.rateLimit) ui.rateLimit.value = data.rateLimit || '0.1';
    if (ui.equalStrategy) ui.equalStrategy.value = data.equalStrategy || 'keep_old';
    if (data.requiredFieldsMovie) {
      ui.requiredFieldsMovieCached = data.requiredFieldsMovie;
    }
    if (data.requiredFieldsBook) {
      ui.requiredFieldsBookCached = data.requiredFieldsBook;
    }
  }

  async function saveSettings() {
    const movieUrl = ui.movieTableUrlInput.value.trim();
    const batchMovieUrl = ui.batchMovieTableUrlInput ? ui.batchMovieTableUrlInput.value.trim() : '';
    const bookUrl = ui.bookTableUrlInput.value.trim();
    const movieInfo = extractFeishuInfo(movieUrl);
    const bookInfo = extractFeishuInfo(bookUrl);
    const batchMovieInfo = extractFeishuInfo(batchMovieUrl);

    if (!movieInfo && !bookInfo) {
      setStatus('请至少提供一个有效的飞书多维表格链接', true);
      return;
    }

    // 批量导入表格链接：如果填了就必须是有效的飞书链接
    if (batchMovieUrl && !batchMovieInfo) {
      setStatus('「批量导入表格」链接无效，请粘贴正确的飞书多维表格链接', true);
      return;
    }

    let appToken = null;
    if (movieInfo && bookInfo) {
      if (movieInfo.appToken !== bookInfo.appToken) {
        setStatus('错误：影视库和图书库必须属于同一个多维表格应用 (App Token 不一致)', true);
        return;
      }
      appToken = movieInfo.appToken;
    } else {
      appToken = movieInfo ? movieInfo.appToken : bookInfo.appToken;
    }

    const settings = {
      appId: ui.appIdInput.value.trim(),
      appSecret: ui.appSecretInput.value.trim(),
      tmdbApiKey: ui.tmdbApiKeyInput ? ui.tmdbApiKeyInput.value.trim() : '',
      movieTableUrl: movieUrl,
      batchMovieTableUrl: batchMovieUrl,
      bookTableUrl: bookUrl,
      appToken: appToken,
      movieTableId: movieInfo ? movieInfo.tableId : '',
      batchMovieTableId: batchMovieInfo ? batchMovieInfo.tableId : '',
      bookTableId: bookInfo ? bookInfo.tableId : '',
      rateLimit: ui.rateLimit ? parseFloat(ui.rateLimit.value) || 0.5 : 0.5,
      equalStrategy: ui.equalStrategy ? ui.equalStrategy.value : 'keep_old'
    };

    if (!settings.appId || !settings.appSecret) {
      setStatus('APP_ID 和 APP_SECRET 不能为空', true);
      return;
    }

    const checkedMovie = [];
    const checkedBook = [];
    if (ui.completenessFields) {
      ui.completenessFields.querySelectorAll('input[type="checkbox"][data-type="movie"]:checked').forEach(cb => {
        checkedMovie.push(cb.value);
      });
      ui.completenessFields.querySelectorAll('input[type="checkbox"][data-type="book"]:checked').forEach(cb => {
        checkedBook.push(cb.value);
      });
    }
    settings.requiredFieldsMovie = checkedMovie;
    settings.requiredFieldsBook = checkedBook;

    await chrome.storage.local.set(settings);

    ui.saveSettingsButton.textContent = '配置已保存';
    ui.saveSettingsButton.classList.remove('btn-success');
    ui.saveSettingsButton.classList.add('btn-primary');
    await chrome.storage.local.set({ uiSaved: true });
    setStatus('设置已保存! (已自动提取 Token 和 ID)', false);
  }

  async function getSettings() {
    return await chrome.storage.local.get([
      'appId', 'appSecret', 'appToken',
      'movieTableId', 'batchMovieTableId', 'bookTableId',
      'movieTableUrl', 'batchMovieTableUrl',
      'rateLimit', 'equalStrategy', 'requiredFieldsMovie', 'requiredFieldsBook', 'tmdbApiKey'
    ]);
  }

  async function verifyAndFixToken(settings) {
    const probeTableId = settings.tableId || settings.movieTableId;
    if (!probeTableId) throw new Error("无法验证连接: 未找到有效的 Table ID");

    try {
      await sendMessageToBackground('verifyConnection', {
        appId: settings.appId,
        appSecret: settings.appSecret,
        appToken: settings.appToken,
        tableId: probeTableId
      });
      return settings.appToken;
    } catch (error) {
      if (!error.message.includes('404')) throw error;

      const candidates = [];
      if (settings.appToken.includes('l')) {
        candidates.push(settings.appToken.replace(/l/g, 'I'));
        candidates.push(settings.appToken.replace(/l/g, '1'));
      }
      if (settings.appToken.includes('I')) {
        candidates.push(settings.appToken.replace(/I/g, 'l'));
        candidates.push(settings.appToken.replace(/I/g, '1'));
      }
      if (settings.appToken.includes('1')) {
        candidates.push(settings.appToken.replace(/1/g, 'I'));
        candidates.push(settings.appToken.replace(/1/g, 'l'));
      }

      for (const token of candidates) {
        if (token === settings.appToken) continue;
        try {
          await sendMessageToBackground('verifyConnection', {
            appId: settings.appId,
            appSecret: settings.appSecret,
            appToken: token,
            tableId: probeTableId
          });
          return token;
        } catch (e) {}
      }
      throw error;
    }
  }

  async function verifyConnection() {
    setStatus('正在验证连接...', false);
    const originalText = ui.verifyConnectionButton.textContent;
    ui.verifyConnectionButton.disabled = true;
    ui.verifyConnectionButton.textContent = '验证中...';

    const movieUrl = ui.movieTableUrlInput.value.trim();
    const movieInfo = extractFeishuInfo(movieUrl);

    let appToken, tableId;

    if (movieInfo) {
      appToken = movieInfo.appToken;
      tableId = movieInfo.tableId;
    } else {
      const bookUrl = ui.bookTableUrlInput.value.trim();
      const bookInfo = extractFeishuInfo(bookUrl);
      if (bookInfo) {
        appToken = bookInfo.appToken;
        tableId = bookInfo.tableId;
      } else {
        const data = await chrome.storage.local.get(['appToken', 'movieTableId']);
        if (data.appToken && data.movieTableId) {
          appToken = data.appToken;
          tableId = data.movieTableId;
        } else {
          setStatus('无法获取有效的 App Token 或 Table ID，请检查链接', true);
          return;
        }
      }
    }

    const settings = {
      appId: ui.appIdInput.value.trim(),
      appSecret: ui.appSecretInput.value.trim(),
      appToken: appToken,
      tableId: tableId
    };

    if (!settings.appId || !settings.appSecret) {
      setStatus('APP_ID 和 APP_SECRET 不能为空', true);
      return;
    }

    try {
      const validToken = await verifyAndFixToken({
        ...settings,
        movieTableId: tableId
      });

      if (validToken !== settings.appToken) {
        await chrome.storage.local.set({ appToken: validToken });
      }

      setStatus('连接成功!', false);
      ui.verifyConnectionButton.disabled = false;
      ui.verifyConnectionButton.classList.remove('btn-secondary');
      ui.verifyConnectionButton.classList.add('btn-success');
      ui.verifyConnectionButton.textContent = '验证通过';
      await chrome.storage.local.set({ uiVerified: true });
      await checkAndUpdateInitStatusAll();
      await loadCompletenessFieldCheckboxes();
    } catch (error) {
      setStatus(`连接失败: ${error.message}`, true);
      ui.verifyConnectionButton.disabled = false;
      ui.verifyConnectionButton.classList.remove('btn-success');
      ui.verifyConnectionButton.classList.add('btn-secondary');
      ui.verifyConnectionButton.textContent = originalText;
      await chrome.storage.local.set({ uiVerified: false });
    }
  }

  async function getInfo() {
    const type = ui.itemTypeSelect.value;
    const existingLink = document.getElementById('feishu-success-link');
    if (existingLink) existingLink.remove();

    ui.infoDiv.innerHTML = `<div class="empty-state"><div class="empty-placeholder"><p>正在读取页面信息...</p></div></div>`;
    ui.infoDiv.classList.remove('empty-state');
    setStatus('正在获取...', false);

    try {
      currentItemInfo = await sendMessageToContentScript('getInfo', { type });
      displayInfo(currentItemInfo);
      setStatus('信息获取成功!', false);
      ui.saveToFeishuButton.disabled = false;
    } catch (error) {
      setStatus(`获取失败: ${error.message}`, true);
      ui.saveToFeishuButton.disabled = true;
      ui.infoDiv.classList.add('empty-state');
      ui.infoDiv.innerHTML = `<div class="empty-placeholder"><div class="icon">❌</div><p>获取失败，请重试</p></div>`;
    }
  }

  function displayInfo(info) {
    const type = ui.itemTypeSelect.value;
    const title = info.title || '无标题';
    const coverUrl = info.cover;

    let ratingDisplay = '';
    let dateDisplay = '';
    let commentHtml = '';

    if (info.rating) {
      const score = parseFloat(info.rating);
      if (!isNaN(score) && score > 0) {
        ratingDisplay = '⭐️'.repeat(Math.round(score));
      } else {
        ratingDisplay = `${info.rating}分`;
      }
    } else {
      ratingDisplay = '尚未评分';
    }

    if (info.rating_date) {
      dateDisplay = new Date(info.rating_date).toLocaleDateString();
    } else {
      dateDisplay = '暂无日期';
    }

    if (info.my_comment) {
      commentHtml = `<div class="info-comment-box">${info.my_comment}</div>`;
    }

    const url = info.url || '#';

    let html = `
      <div class="info-header">
        <img id="preview-cover" src="" alt="Cover" class="info-cover">
        <div class="info-meta">
          <h4 class="info-title"><a href="${url}" target="_blank" style="text-decoration:none; color:inherit;">${title}</a></h4>
          ${type === 'book' ? `
            <div class="info-row"><strong>作者:</strong> ${info.author || '未知'}</div>
            <div class="info-row"><strong>出版社:</strong> ${info.publisher || '未知'}</div>
          ` : `
            <div class="info-row"><strong>导演:</strong> ${info.director || '未知'}</div>
            <div class="info-row"><strong>制片国家:</strong> ${info.country || '未知'}</div>
          `}
          <div class="info-row"><strong>个人评分:</strong> <span class="${!info.rating ? 'text-secondary' : ''}">${ratingDisplay}</span></div>
          <div class="info-row"><strong>打分日期:</strong> <span class="${!info.rating_date ? 'text-secondary' : ''}">${dateDisplay}</span></div>
          ${type === 'book' ? `
            <div class="info-row"><strong>ISBN:</strong> ${info.isbn || '未知'}</div>
          ` : `
            <div class="info-row"><strong>IMDb:</strong> ${info.imdb || '未知'}</div>
          `}
          ${info.douban_id ? `<div class="info-row" style="font-size:10px;color:var(--text-disabled);"><strong>豆瓣ID:</strong> ${info.douban_id}</div>` : ''}
        </div>
      </div>
      ${commentHtml}
    `;

    ui.infoDiv.innerHTML = html;
    ui.infoDiv.classList.remove('empty-state');

    if (coverUrl) {
      loadImage(coverUrl, 'preview-cover');
    } else {
      const img = document.getElementById('preview-cover');
      if (img) img.style.display = 'none';
    }
  }

  async function mapDataToFeishuFields(data, type, feishuFields) {
    const mapping = type === 'movie' ? movieMapping : bookMapping;
    const resultFields = {};
    let coverFieldName = null;
    let coverUrl = data.cover || '';

    for (const [dataKey, dataValue] of Object.entries(data)) {
      if (dataKey.endsWith('_raw') || dataValue === '' || dataValue === null) continue;

      const aliases = mapping[dataKey];
      if (!aliases) continue;

      const match = feishuFields.find(f =>
        aliases.some(alias => {
          const fName = f.field_name.toLowerCase().trim();
          const aName = alias.toLowerCase().trim();
          return fName === aName || fName.replace(/\s/g, '') === aName.replace(/\s/g, '');
        })
      );

      if (match) {
        let finalValue = dataValue;

        if (match.type !== 5) {
          if (dataKey === 'pubdate' && data['pubdate_raw']) {
            finalValue = data['pubdate_raw'];
          } else if (dataKey === 'release_date' && data['release_date_raw']) {
            finalValue = data['release_date_raw'];
          }
        }

        if (dataKey === 'my_comment') {
          const cleaned = String(finalValue).trim()
            .replace(/^评价\s*[:：]?\s*/g, '')
            .replace(/^我的评价\s*[:：]?\s*/g, '')
            .trim();
          if (!cleaned) continue;
          finalValue = cleaned;
        }

        if (match.type === 1) {
          if (dataKey === 'rating') {
            const score = parseFloat(finalValue);
            if (!isNaN(score) && score > 0) {
              finalValue = '⭐️'.repeat(Math.round(score));
            } else {
              finalValue = String(finalValue);
            }
          } else {
            finalValue = String(finalValue);
          }
        } else if (match.type === 3) {
          // 单选字段：直接传文本值，飞书 API 自动匹配已有选项
          finalValue = String(dataValue);
        } else if (match.type === 4) {
          // 多选字段：传字符串数组，API 自动匹配已有选项
          finalValue = Array.isArray(dataValue) ? dataValue.map(String) : [String(dataValue)];
        } else if (match.type === 15) {
          finalValue = { text: "豆瓣链接", link: dataValue };
        } else if (match.type === 5) {
          if (typeof dataValue !== 'number') continue;
        } else if (match.type === 2 || match.type === 99004) {
          if (dataKey === 'isbn') finalValue = String(finalValue).replace(/-/g, '');
          finalValue = parseFloat(finalValue);
          if (isNaN(finalValue)) continue;
        } else if (match.type === 17 && dataKey === 'cover') {
          coverFieldName = match.field_name;
          continue;
        }

        resultFields[match.field_name] = finalValue;
      }
    }

    return { fields: resultFields, coverUrl, coverFieldName };
  }

  async function saveToFeishu() {
    if (!currentItemInfo) {
      setStatus('请先获取信息', true);
      return;
    }

    const settings = await getSettings();
    const type = ui.itemTypeSelect.value;
    let tableId = type === 'movie' ? settings.movieTableId : settings.bookTableId;
    const parsed = type === 'movie'
      ? extractFeishuInfo(ui.movieTableUrlInput.value.trim())
      : extractFeishuInfo(ui.bookTableUrlInput.value.trim());
    if (parsed) {
      settings.appToken = parsed.appToken;
      tableId = parsed.tableId;
      await chrome.storage.local.set({
        appToken: parsed.appToken,
        [type === 'movie' ? 'movieTableId' : 'bookTableId']: parsed.tableId
      });
    }

    if (!settings.appId || !settings.appSecret || !settings.appToken || !tableId) {
      setStatus('配置不完整，请前往设置页', true);
      return;
    }

    setStatus('正在获取飞书表格字段...', false);
    try {
      let feishuFields;
      try {
        feishuFields = await sendMessageToBackground('getTableFields', {
          appId: settings.appId, appSecret: settings.appSecret, appToken: settings.appToken, tableId
        });
      } catch (e) {
        if ((e.message || '').includes('TableIdNotFound')) {
          const validToken = await verifyAndFixToken({
            appId: settings.appId, appSecret: settings.appSecret, appToken: settings.appToken, movieTableId: tableId
          });
          settings.appToken = validToken;
          await chrome.storage.local.set({ appToken: validToken });
          feishuFields = await sendMessageToBackground('getTableFields', {
            appId: settings.appId, appSecret: settings.appSecret, appToken: settings.appToken, tableId
          });
        } else {
          throw e;
        }
      }

      setStatus('正在映射字段...', false);
      const { fields: mappedFields, coverUrl, coverFieldName } = await mapDataToFeishuFields(currentItemInfo, type, feishuFields);

      if (currentItemInfo.isbn) {
        const isbnFieldDef = feishuFields.find(f => {
          const name = f.field_name.toLowerCase().replace(/\s/g, '');
          return name.includes('isbn') || name.includes('条形码') || name.includes('书号');
        });
        if (isbnFieldDef) {
          const rawIsbn = String(currentItemInfo.isbn).replace(/-/g, '').trim();
          if (isbnFieldDef.type === 2) {
            const numVal = parseFloat(rawIsbn);
            mappedFields[isbnFieldDef.field_name] = !isNaN(numVal) ? numVal : rawIsbn;
          } else {
            mappedFields[isbnFieldDef.field_name] = rawIsbn;
          }
        }
      }

      if (currentItemInfo.director) {
        const directorFieldDef = feishuFields.find(f => {
          const name = f.field_name.toLowerCase().replace(/\s/g, '');
          return name.includes('导演') || name.includes('director');
        });
        if (directorFieldDef) mappedFields[directorFieldDef.field_name] = String(currentItemInfo.director).trim();
      }

      if (currentItemInfo.imdb) {
        const imdbFieldDef = feishuFields.find(f => {
          const name = f.field_name.toLowerCase().replace(/\s/g, '');
          return name.includes('imdb');
        });
        if (imdbFieldDef) mappedFields[imdbFieldDef.field_name] = String(currentItemInfo.imdb).trim();
      }

      if (Object.keys(mappedFields).length === 0 && !coverFieldName) {
        throw new Error("没有匹配到任何字段！请检查飞书表格字段名是否与配置中的别名一致。");
      }

      if (type === 'movie' && settings.tmdbApiKey && currentItemInfo.title) {
        try {
          setStatus('正在从TMDB获取封面...', false);
          const tmdbCover = await sendMessageToBackground('searchTmdbPoster', {
            tmdbApiKey: settings.tmdbApiKey,
            title: currentItemInfo.title,
            year: currentItemInfo.release_date_raw ? new Date(currentItemInfo.release_date_raw).getFullYear() : ''
          });
          if (tmdbCover) coverUrl = tmdbCover;
        } catch (e) {}
      }

      setStatus('正在写入数据...', false);
      await sendMessageToBackground('saveToFeishu', {
        appId: settings.appId,
        appSecret: settings.appSecret,
        appToken: settings.appToken,
        tableId,
        fields: mappedFields,
        coverUrl,
        coverFieldName
      });

      setStatus('保存成功！', false);

      const feishuUrl = type === 'movie' ? ui.movieTableUrlInput.value.trim() : ui.bookTableUrlInput.value.trim();
      if (feishuUrl) {
        let linkBox = document.getElementById('feishu-success-link');
        if (!linkBox) {
          linkBox = document.createElement('div');
          linkBox.id = 'feishu-success-link';
          linkBox.style.marginTop = '15px';
          linkBox.style.marginBottom = '5px';
          linkBox.style.textAlign = 'center';
          const actionFooter = document.querySelector('.action-footer');
          if (actionFooter) {
            actionFooter.appendChild(linkBox);
          } else {
            ui.infoDiv.insertAdjacentElement('afterend', linkBox);
          }
        }
        linkBox.innerHTML = `<a href="${feishuUrl}" target="_blank" style="color: var(--primary-color, #3370ff); text-decoration: none; font-size: 14px; font-weight: 500;">🔗 查看飞书页面</a>`;
      }
    } catch (error) {
      setStatus(`操作失败: ${error.message}`, true);
      console.error(error);
    }
  }

  async function scanListPage() {
    setStatus('正在检查页面...', false);
    ui.scanListBtn.disabled = true;
    ui.scanListBtn.textContent = '检查中...';

    try {
      // 获取当前标签页 URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tab.url;

      // 必须是 /people/xxx/collect|wish|do 格式（数字ID和字母用户名都支持）
      const urlMatch = currentUrl.match(/\/people\/[^/]+\/(collect|wish|do)/);
      if (!urlMatch) {
        setStatus('请打开正确的豆瓣个人列表页（/people/xxx/collect|wish|do）', true);
        ui.scanListBtn.disabled = false;
        ui.scanListBtn.textContent = '📋 扫描当前列表页';
        return;
      }

      const pageStatus = urlMatch[1];
      const statusMap = { collect: '已看完', wish: '想看', do: '正在看' };
      const statusLabel = statusMap[pageStatus] || '已看完';

      setStatus('正在扫描列表页...', false);
      ui.scanListBtn.textContent = '扫描中...';

      const data = await sendMessageToContentScript('getListItems');
      scannedItems = (data.items || []).map(item => ({
        ...item,
        pageStatus,
        statusLabel,
        pageType: statusLabel
      }));

      let html = `<div class="scan-success"><strong>📋 发现 ${scannedItems.length} 个条目</strong>`;
      html += `<span class="scan-hint" style="margin-left:8px;color:#3370ff;"> 状态: ${statusLabel}</span>`;
      html += '</div>';

      if (scannedItems.length > 0) {
        html += '<div class="scan-preview">';
        scannedItems.slice(0, 5).forEach(item => {
          html += `<div class="scan-item"><span class="scan-item-type">🎬</span> ${item.title.substring(0, 30)}</div>`;
        });
        if (scannedItems.length > 5) html += `<div class="scan-more">...还有 ${scannedItems.length - 5} 条</div>`;
        html += '</div>';
      }

      ui.scanResult.innerHTML = html;
      ui.scanResult.style.display = 'block';

      if (scannedItems.length > 0) {
        ui.batchStepRun.style.display = 'block';
        ui.startBatchBtn.disabled = false;
        setStatus(`扫描完成！${scannedItems.length} 个条目 · 状态: ${statusLabel}`, false);
      } else {
        setStatus('当前页面未发现豆瓣条目链接', true);
      }
    } catch (error) {
      setStatus(`扫描失败: ${error.message}`, true);
      ui.scanResult.style.display = 'none';
    } finally {
      ui.scanListBtn.disabled = false;
      ui.scanListBtn.textContent = '📋 扫描当前列表页';
    }
  }

  async function startBatchSync() {
    if (scannedItems.length === 0) {
      setStatus('没有可同步的条目', true);
      return;
    }
    if (batchRunning) return;

    const settings = await getSettings();
    const rateLimit = parseFloat(ui.rateLimit.value) || 0.1;
    const equalStrategy = ui.equalStrategy.value || 'keep_old';

    const type = scannedItems[0]?.type || 'movie';
    // 批量同步使用独立的批量导入表格
    const tableId = settings.batchMovieTableId || settings.movieTableId;
    const parsed = settings.batchMovieTableUrl
      ? extractFeishuInfo(settings.batchMovieTableUrl)
      : extractFeishuInfo(ui.movieTableUrlInput.value.trim());
    if (parsed) {
      settings.appToken = parsed.appToken;
      if (settings.batchMovieTableUrl) {
        settings.batchMovieTableId = parsed.tableId;
      } else {
        settings.movieTableId = parsed.tableId;
      }
    }

    if (!settings.appId || !settings.appSecret || !settings.appToken || !tableId) {
      setStatus('配置不完整，请前往设置页', true);
      return;
    }

    let feishuFields;
    try {
      feishuFields = await sendMessageToBackground('getTableFields', {
        appId: settings.appId, appSecret: settings.appSecret, appToken: settings.appToken, tableId
      });
    } catch (e) {
      setStatus(`获取表格字段失败: ${e.message}`, true);
      return;
    }

    const requiredFields = type === 'movie'
      ? (settings.requiredFieldsMovie || feishuFields.filter(f => !f.is_primary).map(f => f.field_name))
      : (settings.requiredFieldsBook || feishuFields.filter(f => !f.is_primary).map(f => f.field_name));

    batchRunning = true;
    ui.startBatchBtn.disabled = true;
    ui.startBatchBtn.textContent = '同步中...';
    ui.batchProgress.style.display = 'block';
    ui.batchResults.style.display = 'none';

    // 预拉取全表记录，避免每条单独拉取
    let allRecords;
    try {
      ui.progressText.textContent = '正在读取表格现有数据...';
      allRecords = await sendMessageToBackground('getAllRecords', {
        appId: settings.appId, appSecret: settings.appSecret, appToken: settings.appToken, tableId
      });
    } catch (e) {
      setStatus(`读取表格数据失败: ${e.message}`, true);
      batchRunning = false;
      ui.startBatchBtn.disabled = false;
      ui.startBatchBtn.textContent = '🚀 开始批量同步';
      return;
    }

    const results = [];
    const total = scannedItems.length;
    const CONCURRENT = 5; // 一次并发5条

    for (let i = 0; i < total; i += CONCURRENT) {
      const batch = scannedItems.slice(i, Math.min(i + CONCURRENT, total));
      const batchUpdated = Math.min(i + CONCURRENT, total);
      const percent = Math.round((batchUpdated / total) * 100);
      ui.progressFill.style.width = percent + '%';
      ui.progressText.textContent = `正在处理 ${batchUpdated}/${total} (并发)...`;

      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            return await sendMessageToBackground('batchSyncItem', {
              appId: settings.appId,
              appSecret: settings.appSecret,
              appToken: settings.appToken,
              tableId,
              item,
              feishuFields,
              allRecords,
              requiredFields,
              equalStrategy,
              movieMapping,
              bookMapping,
              tmdbApiKey: settings.tmdbApiKey
            });
          } catch (e) {
            return {
              doubanId: item.doubanId,
              title: item.title,
              url: item.url,
              action: 'failed',
              reason: e.message
            };
          }
        })
      );
      for (const r of batchResults) {
        results.push(r.status === 'fulfilled' ? r.value : r.reason || { action: 'failed', reason: 'Unknown error' });
      }

      // 批次间短暂延迟
      if (i + CONCURRENT < total) {
        await new Promise(r => setTimeout(r, rateLimit * 1000));
      }
    }

    const added = results.filter(r => r.action === 'added');
    const updated = results.filter(r => r.action === 'updated');
    const skipped = results.filter(r => r.action === 'skipped');
    const failed = results.filter(r => r.action === 'failed');

    ui.resultsSummary.innerHTML = `
      <div class="summary-box">
        <div class="summary-item summary-added">✅ 新增: ${added.length}</div>
        <div class="summary-item summary-updated">🔄 更新: ${updated.length}</div>
        <div class="summary-item summary-skipped">⏭️ 跳过: ${skipped.length}</div>
        <div class="summary-item summary-failed">❌ 失败: ${failed.length}</div>
      </div>
    `;

    let listHtml = '';
    if (failed.length > 0) {
      listHtml += '<div class="results-section"><strong>失败条目:</strong>';
      failed.forEach(r => {
        listHtml += `<div class="result-item result-failed"><span>❌</span> <a href="${r.url}" target="_blank">${r.title.substring(0, 20)}</a> - ${r.reason}</div>`;
      });
      listHtml += '</div>';
    }
    if (updated.length > 0) {
      listHtml += '<div class="results-section"><strong>更新详情:</strong>';
      updated.slice(0, 10).forEach(r => {
        listHtml += `<div class="result-item result-updated"><span>🔄</span> ${r.title.substring(0, 20)} - ${r.reason}</div>`;
      });
      if (updated.length > 10) listHtml += `<div class="result-item">...还有 ${updated.length - 10} 条</div>`;
      listHtml += '</div>';
    }
    ui.resultsList.innerHTML = listHtml;
    ui.batchResults.style.display = 'block';

    setStatus(`批量同步完成！新增 ${added.length}，更新 ${updated.length}，跳过 ${skipped.length}，失败 ${failed.length}`, failed.length > 0);

    batchRunning = false;
    ui.startBatchBtn.disabled = true;
    ui.startBatchBtn.textContent = '✅ 同步完成';
  }

  async function loadCompletenessFieldCheckboxes() {
    if (!ui.completenessFields) return;
    const stored = await chrome.storage.local.get(['requiredFieldsMovie', 'requiredFieldsBook', 'movieTableId', 'bookTableId', 'appId', 'appSecret', 'appToken']);

    let fieldsMovie = [];
    let fieldsBook = [];
    if (stored.appToken && stored.movieTableId) {
      try {
        fieldsMovie = await sendMessageToBackground('getTableFields', {
          appId: stored.appId, appSecret: stored.appSecret, appToken: stored.appToken, tableId: stored.movieTableId
        });
      } catch (e) {}
    }
    if (stored.appToken && stored.bookTableId) {
      try {
        fieldsBook = await sendMessageToBackground('getTableFields', {
          appId: stored.appId, appSecret: stored.appSecret, appToken: stored.appToken, tableId: stored.bookTableId
        });
      } catch (e) {}
    }

    const allMovieFields = fieldsMovie.filter(f => !f.is_primary && f.type !== 17).map(f => f.field_name);
    const allBookFields = fieldsBook.filter(f => !f.is_primary && f.type !== 17).map(f => f.field_name);

    const savedMovie = stored.requiredFieldsMovie || [];
    const savedBook = stored.requiredFieldsBook || [];

    let html = '';
    if (allMovieFields.length > 0) {
      html += '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">🎬 影视表字段:</div>';
      allMovieFields.forEach(f => {
        const checked = savedMovie.length === 0 || savedMovie.includes(f) ? 'checked' : '';
        html += `<label class="checkbox-label"><input type="checkbox" value="${f}" data-type="movie" ${checked}> ${f}</label>`;
      });
    }
    if (allBookFields.length > 0) {
      html += '<div style="margin-bottom:8px;margin-top:12px;font-size:11px;color:var(--text-secondary);">📚 图书表字段:</div>';
      allBookFields.forEach(f => {
        const checked = savedBook.length === 0 || savedBook.includes(f) ? 'checked' : '';
        html += `<label class="checkbox-label"><input type="checkbox" value="${f}" data-type="book" ${checked}> ${f}</label>`;
      });
    }
    if (!allMovieFields.length && !allBookFields.length) {
      html = '<p style="font-size:11px;color:var(--text-disabled);">请先验证连接以加载字段列表</p>';
    }

    ui.completenessFields.innerHTML = html;
  }

  const movieSchema = [
    { name: '影视封面', type: 17 },
    { name: '豆瓣ID', type: 1 },
    { name: '导演', type: 1 },
    { name: '主演', type: 1 },
    { name: '制片国家', type: 1 },
    { name: '上映日期', type: 5 },
    { name: '个人评分', type: 99004 },
    { name: '打分日期', type: 5 },
    { name: '我的短评', type: 1 },
    { name: 'IMDb', type: 1 },
    { name: '条目链接', type: 15 },
    { name: '类型', type: 1 },
    { name: '编剧', type: 1 },
    { name: '片长', type: 1 },
    { name: '语言', type: 1 }
  ];

  const bookSchema = [
    { name: '图书封面', type: 17 },
    { name: '豆瓣ID', type: 1 },
    { name: '作者', type: 1 },
    { name: '出版社', type: 1 },
    { name: '出版年', type: 1 },
    { name: '个人评分', type: 99004 },
    { name: '打分日期', type: 5 },
    { name: '我的短评', type: 1 },
    { name: 'ISBN', type: 1 },
    { name: '条目链接', type: 15 }
  ];

  async function initTable(type) {
    const movieUrl = ui.movieTableUrlInput.value.trim();
    const bookUrl = ui.bookTableUrlInput.value.trim();
    const movieInfo = extractFeishuInfo(movieUrl);
    const bookInfo = extractFeishuInfo(bookUrl);

    let appToken, tableId;

    if (type === 'movie') {
      if (!movieInfo) {
        alert('初始化失败：请在"影视库链接"输入框中填入有效的飞书多维表格链接！');
        return;
      }
      appToken = movieInfo.appToken;
      tableId = movieInfo.tableId;
    } else {
      if (!bookInfo) {
        alert('初始化失败：请在"图书库链接"输入框中填入有效的飞书多维表格链接！');
        return;
      }
      appToken = bookInfo.appToken;
      tableId = bookInfo.tableId;
    }

    appToken = appToken.replace(/[^a-zA-Z0-9]/g, '');
    tableId = tableId.replace(/[^a-zA-Z0-9]/g, '');

    const storedData = await getSettings();
    const settings = {
      appId: ui.appIdInput.value.trim() || storedData.appId,
      appSecret: ui.appSecretInput.value.trim() || storedData.appSecret,
      appToken: appToken,
      tableId: tableId,
      movieTableId: type === 'movie' ? tableId : (movieInfo?.tableId || storedData.movieTableId)
    };

    const tableName = type === 'movie' ? '豆瓣影视' : '豆瓣图书';
    const primaryFieldName = type === 'movie' ? '影视标题' : '图书书名';
    const schema = type === 'movie' ? movieSchema : bookSchema;

    if (!settings.appId || !settings.appSecret || !settings.appToken || !settings.tableId) {
      setStatus('请先填写配置并保存 (或输入有效的飞书链接)', true);
      return;
    }

    if (!confirm(`即将初始化 ${type === 'movie' ? '电影' : '图书'} 表。\n\n这将重命名表格为 "${tableName}"，并将现有字段结构完全覆盖。\n\n请确保这真的是一个【空白新表】！继续吗？`)) {
      return;
    }

    setStatus('正在初始化...', false);

    try {
      setStatus('正在预检连接...', false);
      const validToken = await verifyAndFixToken(settings);

      if (validToken !== settings.appToken) {
        settings.appToken = validToken;
        await chrome.storage.local.set({ appToken: validToken });
      }

      const commonParams = {
        appId: settings.appId,
        appSecret: settings.appSecret,
        appToken: settings.appToken,
        tableId: settings.tableId
      };

      const existingFields = await sendMessageToBackground('getTableFields', commonParams);
      const nonPrimary = existingFields.filter(f => !f.is_primary);
      const primaryField = existingFields.find(f => f.is_primary);
      const expectedPrimaryName = type === 'movie' ? '影视标题' : '图书书名';

      const requiredPre = type === 'movie' ? movieSchema : bookSchema;
      const preHasAll = requiredPre.every(r => existingFields.some(f =>
        f.field_name === r.name &&
        (f.type === r.type || (r.name === '个人评分' && (f.type === 2 || f.type === 99004)))
      ));
      const prePrimaryMatches = primaryField && primaryField.field_name === expectedPrimaryName;
      const preIsEmpty = nonPrimary.length === 0;

      if (!preIsEmpty && preHasAll && prePrimaryMatches) {
        setStatus('检测到字段已满足要求，已标记为已初始化', false);
        await chrome.storage.local.set({ [type === 'movie' ? 'uiMovieInited' : 'uiBookInited']: true });
        const btn = document.getElementById(type === 'movie' ? 'initMovieTable' : 'initBookTable');
        if (btn) {
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-warning');
          btn.textContent = type === 'movie' ? '已初始化电影表' : '已初始化图书表';
          btn.disabled = true;
        }
        return;
      }

      if (!preIsEmpty && !preHasAll) {
        alert('字段不匹配，请创建空白数据表或查阅文档');
        setStatus('初始化失败：字段不匹配', true);
        return;
      }

      setStatus('正在重命名数据表...', false);
      await sendMessageToBackground('updateTableName', { ...commonParams, name: tableName });

      setStatus('正在配置索引列...', false);
      const refetchedFields = await sendMessageToBackground('getTableFields', commonParams);
      const refetchedPrimary = refetchedFields.find(f => f.is_primary);

      if (refetchedPrimary) {
        await sendMessageToBackground('updateFieldName', {
          ...commonParams,
          fieldId: refetchedPrimary.field_id,
          name: primaryFieldName,
          fieldType: refetchedPrimary.type
        });
      }

      setStatus('正在批量创建字段...', false);
      const createResults = [];
      for (const field of schema) {
        if (refetchedFields.some(f => f.field_name === field.name)) {
          createResults.push({ name: field.name, status: 'skipped' });
          continue;
        }
        try {
          await sendMessageToBackground('createField', {
            ...commonParams,
            fieldName: field.name,
            fieldType: field.type
          });
          createResults.push({ name: field.name, status: 'ok' });
        } catch (err) {
          createResults.push({ name: field.name, status: 'failed', error: err.message });
        }
        await new Promise(r => setTimeout(r, 300));
      }

      const okCount = createResults.filter(r => r.status === 'ok').length;
      const failCount = createResults.filter(r => r.status === 'failed').length;
      console.log(`[Init Summary] OK:${okCount} Failed:${failCount}`);

      setStatus(`初始化成功！${tableName} 已就绪。`, false);
      alert('初始化成功！您现在可以开始同步数据了。');
      await chrome.storage.local.set({ [type === 'movie' ? 'uiMovieInited' : 'uiBookInited']: true });
      const btn = document.getElementById(type === 'movie' ? 'initMovieTable' : 'initBookTable');
      if (btn) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-warning');
        btn.textContent = type === 'movie' ? '已初始化电影表' : '已初始化图书表';
        btn.disabled = true;
      }
    } catch (error) {
      setStatus(`初始化失败: ${error.message}`, true);
      console.error(error);
      alert(`初始化失败: ${error.message}\n请检查权限是否包含 "管理多维表格应用" (bitable:app)`);
    }
  }

  initTabs();

  // 从 manifest 动态读取版本号
  try {
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById('appVersion');
    if (versionEl && manifest.version) versionEl.textContent = 'v' + manifest.version;
  } catch (e) { /* 忽略，保持 HTML 默认值 */ }

  // 初始化主题
  initTheme();

  await loadSettings();

  async function applyStoredUIButtonStates() {
    const data = await chrome.storage.local.get(['uiSaved', 'uiVerified', 'uiMovieInited', 'uiBookInited']);
    if (data.uiSaved) {
      ui.saveSettingsButton.textContent = '配置已保存';
      ui.saveSettingsButton.classList.remove('btn-success');
      ui.saveSettingsButton.classList.add('btn-primary');
    }
    if (data.uiVerified) {
      ui.verifyConnectionButton.classList.remove('btn-secondary');
      ui.verifyConnectionButton.classList.add('btn-success');
      ui.verifyConnectionButton.textContent = '验证通过';
    }
    const movieBtn = document.getElementById('initMovieTable');
    const bookBtn = document.getElementById('initBookTable');
    if (movieBtn) {
      if (data.uiMovieInited) {
        movieBtn.classList.remove('btn-secondary');
        movieBtn.classList.add('btn-warning');
        movieBtn.textContent = '已初始化电影表';
        movieBtn.disabled = true;
      }
    }
    if (bookBtn) {
      if (data.uiBookInited) {
        bookBtn.classList.remove('btn-secondary');
        bookBtn.classList.add('btn-warning');
        bookBtn.textContent = '已初始化图书表';
        bookBtn.disabled = true;
      }
    }
  }

  function setupInputListeners() {
    const fields = [ui.appIdInput, ui.appSecretInput, ui.movieTableUrlInput, ui.bookTableUrlInput];
    const resetButtons = async () => {
      ui.saveSettingsButton.textContent = '保存配置';
      ui.saveSettingsButton.classList.remove('btn-success');
      ui.saveSettingsButton.classList.add('btn-primary');
      ui.verifyConnectionButton.classList.remove('btn-success');
      ui.verifyConnectionButton.classList.add('btn-secondary');
      ui.verifyConnectionButton.textContent = '验证连接';
      const mBtn = document.getElementById('initMovieTable');
      const bBtn = document.getElementById('initBookTable');
      if (mBtn) { mBtn.classList.remove('btn-warning'); mBtn.classList.add('btn-secondary'); mBtn.textContent = '初始化电影表'; mBtn.disabled = false; }
      if (bBtn) { bBtn.classList.remove('btn-warning'); bBtn.classList.add('btn-secondary'); bBtn.textContent = '初始化图书表'; bBtn.disabled = false; }
      await chrome.storage.local.set({ uiSaved: false, uiVerified: false, uiMovieInited: false, uiBookInited: false });
    };
    fields.forEach(f => { if (f) f.addEventListener('input', resetButtons); });
  }

  await applyStoredUIButtonStates();
  setupInputListeners();
  await loadCompletenessFieldCheckboxes();

  ui.saveSettingsButton.addEventListener('click', saveSettings);
  ui.verifyConnectionButton.addEventListener('click', verifyConnection);
  ui.getInfoButton.addEventListener('click', getInfo);
  ui.saveToFeishuButton.addEventListener('click', saveToFeishu);
  if (ui.scanListBtn) ui.scanListBtn.addEventListener('click', scanListPage);
  if (ui.startBatchBtn) ui.startBatchBtn.addEventListener('click', startBatchSync);

  const initMovieBtn = document.getElementById('initMovieTable');
  const initBookBtn = document.getElementById('initBookTable');
  if (initMovieBtn) initMovieBtn.addEventListener('click', () => initTable('movie'));
  if (initBookBtn) initBookBtn.addEventListener('click', () => initTable('book'));

  async function checkAndUpdateInitStatusAll() {
    const settings = await getSettings();
    if (!settings.appId || !settings.appSecret || !settings.appToken) return;
    if (settings.movieTableId) {
      try {
        const fields = await sendMessageToBackground('getTableFields', {
          appId: settings.appId, appSecret: settings.appSecret, appToken: settings.appToken, tableId: settings.movieTableId
        });
        const nonPrimary = fields.filter(f => !f.is_primary);
        const primaryField = fields.find(f => f.is_primary);
        const req = movieSchema;
        const hasAll = req.every(r => fields.some(f => f.field_name === r.name && f.type === r.type));
        const primaryMatches = primaryField && primaryField.field_name === '影视标题';
        const isEmpty = nonPrimary.length === 0;
        await chrome.storage.local.set({ uiMovieInited: !isEmpty && hasAll && primaryMatches });
      } catch (e) {}
    }
    if (settings.bookTableId) {
      try {
        const fields = await sendMessageToBackground('getTableFields', {
          appId: settings.appId, appSecret: settings.appSecret, appToken: settings.appToken, tableId: settings.bookTableId
        });
        const nonPrimary = fields.filter(f => !f.is_primary);
        const primaryField = fields.find(f => f.is_primary);
        const req = bookSchema;
        const hasAll = req.every(r => fields.some(f => f.field_name === r.name && f.type === r.type));
        const primaryMatches = primaryField && primaryField.field_name === '图书书名';
        const isEmpty = nonPrimary.length === 0;
        await chrome.storage.local.set({ uiBookInited: !isEmpty && hasAll && primaryMatches });
      } catch (e) {}
    }
    await applyStoredUIButtonStates();
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      if (tabs[0].url.includes('movie.douban.com')) {
        ui.itemTypeSelect.value = 'movie';
      } else if (tabs[0].url.includes('book.douban.com')) {
        ui.itemTypeSelect.value = 'book';
      }
      const isList = tabs[0].url.includes('top250') || tabs[0].url.includes('/mine') ||
        tabs[0].url.includes('/people/') || tabs[0].url.includes('/chart') ||
        tabs[0].url.includes('/subject_collection/') || tabs[0].url.includes('/annual/') ||
        tabs[0].url.includes('/explore') || tabs[0].url.includes('/tag/');
      if (isList) {
        ui.tabButtons.forEach(b => b.classList.remove('active'));
        const batchTab = document.querySelector('[data-tab="batch"]');
        if (batchTab) batchTab.classList.add('active');
        ui.tabPanels.forEach(p => p.classList.remove('active'));
        const batchPanel = document.getElementById('panel-batch');
        if (batchPanel) batchPanel.classList.add('active');
      }
    }
  });
});
