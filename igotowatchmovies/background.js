const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

let tokenCache = { token: null, expireTime: 0 };
let tmdbApiKeyCache = null;

async function fetchFeishuAPI(url, options) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { throw new Error(`Invalid JSON: ${text.substring(0,100)}`); }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    return data;
  } catch (error) {
    if (!error.message.includes(url)) error.message += ` (${url})`;
    throw error;
  }
}

async function searchTmdbPoster({ tmdbApiKey, title, year }) {
  if (!tmdbApiKey || !title) return null;
  tmdbApiKeyCache = tmdbApiKey;
  const q = encodeURIComponent(title.trim());
  let url = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&language=zh-CN&query=${q}&page=1&include_adult=false`;
  if (year) url += `&primary_release_year=${year}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);  // 缩小超时 8s→4s
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`TMDB search failed: ${r.status}`);
    const d = await r.json();
    if (d.results && d.results.length > 0) {
      const posterPath = d.results[0].poster_path;
      if (posterPath) return `https://image.tmdb.org/t/p/original${posterPath}`;
    }
    return null;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function getTenantAccessToken(appId, appSecret) {
  appId = appId?.trim(); appSecret = appSecret?.trim();
  if (tokenCache.token && Date.now() < tokenCache.expireTime) return tokenCache.token;
  const url = `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`;
  const response = await fetchFeishuAPI(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  if (response.code !== 0) throw new Error(`Auth failed: ${response.msg}`);
  tokenCache = { token: response.tenant_access_token, expireTime: Date.now() + (response.expire - 300) * 1000 };
  return response.tenant_access_token;
}

async function verifyConnection({ appId, appSecret, appToken, tableId }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables?page_size=1`, {
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=1`, {
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  return { success: true };
}

async function getTableFields({ appId, appSecret, appToken, tableId }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  const response = await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`, {
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  if (response.code !== 0) throw new Error(`Get fields failed: ${response.msg}`);
  return response.data.items;
}

async function updateTableName({ appId, appSecret, appToken, tableId, name }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  const response = await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}`, {
    method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (response.code !== 0) throw new Error(`Rename failed: ${response.msg}`);
  return response.data;
}

async function updateFieldName({ appId, appSecret, appToken, tableId, fieldId, name, fieldType }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  const response = await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`, {
    method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_name: name, type: fieldType })
  });
  if (response.code !== 0) throw new Error(`Rename field failed: ${response.msg}`);
  return response.data;
}

async function createField({ appId, appSecret, appToken, tableId, fieldName, fieldType }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  const reqBody = { field_name: fieldName, type: fieldType };
  if (fieldType === 99004) {
    reqBody.type = 4;
    reqBody.ui_type = "Rating";
    reqBody.property = { rating: { min: 1, max: 5, rating_icon: "star" } };
  }
  const response = await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody)
  });
  if (response.code !== 0) throw new Error(`Create field "${fieldName}" failed: ${response.msg}`);
  return response.data;
}

async function downloadImage(imageUrl) {
  console.log(`[BG] Downloading image: ${imageUrl}`);
  const response = await fetch(imageUrl, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  return response.blob();
}

async function uploadImageToFeishu({ appId, appSecret, appToken, tableId, imageData, fileName }) {
  const token = await getTenantAccessToken(appId, appSecret);

  const strategies = [
    { parent_type: 'bitable_file', parent_node: appToken, label: 'bitable_file(appToken)' },
    { parent_type: 'bitable_file', parent_node: tableId, label: 'bitable_file(tableId)' },
    { parent_type: 'bitable_image', parent_node: appToken, label: 'bitable_image(appToken)' }
  ];

  const url = `${FEISHU_API_BASE}/drive/v1/medias/upload_all`;
  let lastError = null;

  for (const strategy of strategies) {
    const formData = new FormData();
    formData.append('file', imageData, fileName);
    formData.append('file_name', fileName);
    formData.append('parent_type', strategy.parent_type);
    formData.append('parent_node', strategy.parent_node);
    formData.append('size', String(imageData.size));

    console.log(`[BG] Trying strategy: ${strategy.label}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const text = await response.text();
    console.log(`[BG] ${strategy.label} -> HTTP ${response.status}: ${text.substring(0,300)}`);

    try {
      const data = JSON.parse(text);
      if (data.code === 0) {
        const fileToken = data.data?.file_token || data.data?.token || data.file_token;
        console.log(`[BG] ${strategy.label} SUCCESS! fileToken=${fileToken}`);
        return fileToken;
      }
      console.log(`[BG] ${strategy.label} returned code=${data.code}, trying next...`);
      lastError = new Error(`Upload failed: code=${data.code} msg=${data.msg}`);
    } catch(e) {
      lastError = e;
    }
  }

  throw lastError || new Error('All upload strategies failed');
}

async function saveToFeishu({ appId, appSecret, appToken, tableId, fields, coverUrl, coverFieldName }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  const finalFields = { ...fields };

  if (coverUrl && coverFieldName) {
    console.log(`[BG] === COVER UPLOAD START ===`);
    try {
      const imageBlob = await downloadImage(coverUrl);
      const fileToken = await uploadImageToFeishu({ appId, appSecret, appToken, tableId, imageData: imageBlob, fileName: 'cover.jpg' });
      finalFields[coverFieldName] = [{ file_token: fileToken }];
      console.log(`[BG] === COVER UPLOAD SUCCESS ===`);
    } catch (error) {
      console.warn(`[BG] === COVER UPLOAD FAILED ===`, error.message);
    }
  }

  const response = await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: finalFields })
  });
  if (response.code !== 0) throw new Error(`Save record failed: ${response.msg}`);
  return response.data;
}

async function updateRecord({ appId, appSecret, appToken, tableId, recordId, fields, coverUrl, coverFieldName }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  const finalFields = { ...fields };

  if (coverUrl && coverFieldName) {
    try {
      const imageBlob = await downloadImage(coverUrl);
      const fileToken = await uploadImageToFeishu({ appId, appSecret, appToken, tableId, imageData: imageBlob, fileName: 'cover.jpg' });
      finalFields[coverFieldName] = [{ file_token: fileToken }];
    } catch (error) {
      console.warn(`[BG] Cover upload failed during update:`, error.message);
    }
  }

  const response = await fetchFeishuAPI(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
    method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: finalFields })
  });
  if (response.code !== 0) throw new Error(`Update record failed: ${response.msg}`);
  return response.data;
}

async function getAllRecords({ appId, appSecret, appToken, tableId }) {
  appToken = appToken?.trim();
  tableId = tableId?.trim();
  const token = await getTenantAccessToken(appId, appSecret);
  const allRecords = [];
  let pageToken = null;

  do {
    let url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`;
    if (pageToken) url += `&page_token=${pageToken}`;
    const response = await fetchFeishuAPI(url, {
      method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.code !== 0) throw new Error(`Get records failed: ${response.msg}`);
    const items = response.data?.items || [];
    allRecords.push(...items);
    pageToken = response.data?.has_more ? response.data?.page_token : null;
  } while (pageToken);

  return allRecords;
}

function getDoubanIdField(feishuFields) {
  return feishuFields.find(f => {
    const name = f.field_name.toLowerCase().replace(/\s/g, '');
    return name.includes('doubanid') || name.includes('douban_id') || name.includes('豆瓣id');
  });
}

function getFieldValueByFuzzyName(recordFields, feishuFields, fuzzyNames) {
  for (const fuzzyName of fuzzyNames) {
    const matchField = feishuFields.find(f => {
      const name = f.field_name.toLowerCase().replace(/\s/g, '');
      return fuzzyName.find(n => name.includes(n.toLowerCase().replace(/\s/g, '')));
    });
    if (matchField && recordFields[matchField.field_name] !== undefined && recordFields[matchField.field_name] !== null && recordFields[matchField.field_name] !== '') {
      return { fieldName: matchField.field_name, value: recordFields[matchField.field_name] };
    }
  }
  return null;
}

async function findExistingRecords({ appId, appSecret, appToken, tableId, feishuFields, itemId, itemTitle, allRecords }) {
  // 优先使用预拉取的记录，避免每条都拉全表
  const records = allRecords || (await getAllRecords({ appId, appSecret, appToken, tableId }));
  const matches = [];

  for (const record of records) {
    const fields = record.fields || {};

    const idField = getDoubanIdField(feishuFields);
    if (idField && fields[idField.field_name]) {
      const storedId = String(fields[idField.field_name]).trim();
      if (storedId === String(itemId).trim()) {
        matches.push({ record, matchType: 'douban_id' });
        continue;
      }
    }

    const titleResult = getFieldValueByFuzzyName(fields, feishuFields, [
      ['影视标题', '电影标题', '片名', '标题', 'name', 'title'],
      ['图书书名', '书名', '标题', 'name', 'title']
    ]);
    if (titleResult && String(titleResult.value).trim() === String(itemTitle).trim()) {
      matches.push({ record, matchType: 'title' });
    }
  }

  return matches;
}

function calculateCompleteness(fields, requiredFieldNames) {
  let filled = 0;
  let total = 0;

  for (const fieldName of requiredFieldNames) {
    total++;
    const val = fields[fieldName];
    if (val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)) {
      filled++;
    }
  }

  return total === 0 ? 0 : filled / total;
}

function detectCategory(html, genres, runtime) {
  // 更严格的种类判断（基于 HTML 文本分析，避免全页搜「集」导致误判）
  const genresLower = (genres || '').toLowerCase();
  const htmlLower = html.toLowerCase();
  
  // === 动漫优先判断 ===
  const animeIndicators = ['动画', 'anime', '动漫', '卡通'];
  const isAnime = animeIndicators.some(k => genresLower.includes(k.toLowerCase()));
  
  // === 电视剧强指标 ===
  
  // genres 明确标注
  const tvGenreIndicators = ['电视剧', '综艺', '真人秀', 'tv series', 'tv mini-series'];
  const isTvGenre = tvGenreIndicators.some(k => genresLower.includes(k.toLowerCase()));
  
  // runtime 明确是「集」的形式（只判断 runtime 字段，不扫整段 HTML）
  const runtimeStr = String(runtime || '');
  const hasRuntimeEpisodes = /\d+\s*集/.test(runtimeStr);
  
  // 只在 HTML 中匹配字段级别的电视剧标签行（集数:、单集片长:、首播:）
  const hasEpisodeCountField = /集数[：:]<\/span>\s*\d+/.test(html) || /集数[:：]\s*\d+/.test(html);
  const hasSingleEpisodeField = /单集片长/.test(html);
  const hasFirstAirField = /首播[：:]/.test(html);
  
  // 「季」判断：明确的第X季 + 剧集证据
  const hasSeason = /第\s*\d+\s*季/.test(html) && (hasRuntimeEpisodes || hasEpisodeCountField || hasSingleEpisodeField);
  
  // === 判定逻辑 ===
  
  // 1) genres 明确是电视剧/综艺
  if (isTvGenre) {
    if (isAnime) return '动漫';
    return '电视剧';
  }
  
  // 2) runtime 含集 → 电视剧（非动漫）
  if (hasRuntimeEpisodes && !isAnime) return '电视剧';
  
  // 3) 有集数/单集片长/首播字段 → 电视剧
  if ((hasEpisodeCountField || hasSingleEpisodeField || hasFirstAirField) && !isAnime) return '电视剧';
  
  // 4) 明确的第X季 → 电视剧
  if (hasSeason && !isAnime) return '电视剧';
  
  // 5) 动漫
  if (isAnime) return '动漫';
  
  // 6) 默认电影
  return '电影';
}

function parseDetailPageHtml(html, url) {
  const isBook = url.includes('book.douban.com');
  const idMatch = url.match(/\/subject\/(\d+)/);
  const doubanId = idMatch ? idMatch[1] : '';

  const titleMatch = html.match(/<span\s+property=['"]v:itemreviewed['"][^>]*>([^<]+)<\/span>/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // 封面：优先 TMDB API，豆瓣封面作为回退
  let cover = '';
  const coverRegexes = [
    /<img[^>]+id=["']mainpic["'][^>]+src=["']([^"']+)["']/,
    /id=["']mainpic["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/,
    /<a\s+class=["']nbgnbg["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/
  ];
  for (const re of coverRegexes) {
    const cm = html.match(re);
    if (cm) { cover = cm[1]; break; }
  }
  if (cover) cover = cover.replace(/\.webp($|\?|&)/, '.jpg$1').replace(/s_ratio_poster/, 'l_ratio_poster');

  // 豆瓣评分
  const ratingMatch = html.match(/<strong\s+class=['"][^"']*rating_num[^"']*['"][^>]*>([^<]+)<\/strong>/)
    || html.match(/"ratingValue"[^>]*>([^<]+)</)
    || html.match(/rating_num[^>]*>([\d.]+)</);
  const doubanRating = ratingMatch ? ratingMatch[1].trim() : '0';

  // === info 区块提取：正确处理嵌套 div ===
  let infoBlock = '';
  const infoOpenMatch = html.match(/<div\s+id=["']info["'][^>]*>/i);
  if (infoOpenMatch) {
    const startIdx = infoOpenMatch.index + infoOpenMatch[0].length;
    const remaining = html.substring(startIdx);
    let depth = 1;
    let pos = 0;
    const divRegex = /<\/div\s*>|<div[\s>]/gi;
    let dm;
    while ((dm = divRegex.exec(remaining)) !== null) {
      if (dm[0].match(/<\/div/i)) depth--;
      else depth++;
      if (depth === 0) { pos = dm.index; break; }
    }
    infoBlock = remaining.substring(0, pos);
  }

  // === 新的字段提取函数：先剥 HTML 再按标签名 + 边界提取 ===
  const fieldLabels = ['导演', '编剧', '主演', '类型', '制片国家/地区', '制片国家', '语言',
    '上映日期', '首播', '片长', '单集片长', '集数', 'IMDb', '官方网站', '又名', '出品方', '制作公司', '季数'];

  const extractInfoField = (label) => {
    if (!infoBlock) return '';
    // 清洗 HTML：保留文字，替换标签为空格
    const cleanText = infoBlock.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const labelRegex = new RegExp(label + `\\s*[:：]\\s*`, 'i');
    const m = cleanText.match(labelRegex);
    if (!m) return '';
    const afterText = cleanText.substring(m.index + m[0].length);
    // 截取到下一个已知字段标签（单空格边界）或结尾
    let endIdx = afterText.length;
    for (const fl of fieldLabels) {
      if (fl === label) continue;
      const fi = afterText.search(new RegExp(`\\s` + fl + `\\s*[:：]`, 'i'));
      if (fi !== -1 && fi < endIdx) endIdx = fi;
    }
    const value = afterText.substring(0, endIdx).trim();
    // 去掉行尾的 "/ " 或 " /"
    return value.replace(/\s*\/\s*$/, '').trim();
  };

  // extractInfoFieldMulti 与 extractInfoField 使用相同逻辑
  const extractInfoFieldMulti = extractInfoField;

  if (isBook) {
    return {
      douban_id: doubanId,
      title,
      cover,
      douban_rating: doubanRating,
      url,
      author: extractInfoFieldMulti('作者'),
      publisher: extractInfoField('出版社'),
      publish_year: extractInfoField('出版年'),
      pubdate_raw: extractInfoField('出版年'),
      isbn: extractInfoField('ISBN'),
      translator: extractInfoFieldMulti('译者'),
      pages: extractInfoField('页数'),
      price: extractInfoField('定价'),
      binding: extractInfoField('装帧'),
      original_title: extractInfoField('原作名'),
      series: extractInfoField('丛书'),
      type: 'book',
      category: '图书'
    };
  }

  // === 电影/影视增强解析 ===

  // IMDb：批量同步不需要，跳过提取

  // 导演：优先 v:directedBy
  let director = '';
  const directorFromV = html.match(/property=['"]v:directedBy['"][^>]*>([^<]+)/g);
  if (directorFromV) {
    director = directorFromV.map(m => { const d = m.match(/>([^<]+)/); return d ? d[1] : ''; }).filter(Boolean).join(' / ');
  }
  if (!director) director = extractInfoField('导演');

  // 编剧
  let screenwriter = extractInfoField('编剧');
  if (!screenwriter) {
    const writerFromV = html.match(/property=['"]v:writer['"][^>]*>([^<]+)/g);
    if (writerFromV) {
      screenwriter = writerFromV.map(m => { const w = m.match(/>([^<]+)/); return w ? w[1] : ''; }).filter(Boolean).join(' / ');
    }
  }

  // 演员
  let actors = '';
  const actorsFromV = html.match(/property=['"]v:starring['"][^>]*>([^<]+)/g);
  if (actorsFromV) {
    actors = actorsFromV.map(m => { const a = m.match(/>([^<]+)/); return a ? a[1] : ''; }).filter(Boolean).join(' / ');
  }
  if (!actors) actors = extractInfoField('主演');

  // 类型
  let genres = '';
  const genresFromV = html.match(/property=['"]v:genre['"][^>]*>([^<]+)/g);
  if (genresFromV) {
    genres = genresFromV.map(m => { const g = m.match(/>([^<]+)/); return g ? g[1] : ''; }).filter(Boolean).join(' / ');
  }
  if (!genres) genres = extractInfoField('类型');

  // 上映日期
  let releaseDateRaw = '';
  const releaseMatch = html.match(/property=['"]v:initialReleaseDate['"][^>]+content=['"]([^'"]+)['"]/);
  if (releaseMatch) {
    releaseDateRaw = releaseMatch[1];
  } else {
    releaseDateRaw = extractInfoField('上映日期') || extractInfoField('首播');
  }
  // 回退：从 infoBlock 中提取第一个日期
  if (!releaseDateRaw && infoBlock) {
    const spanMatch = infoBlock.match(/上映日期[:：]\s*<span[^>]+content=["']([^"']+)["']/);
    if (spanMatch) releaseDateRaw = spanMatch[1];
  }
  if (!releaseDateRaw) {
    const dateMatch = html.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
    if (dateMatch) releaseDateRaw = dateMatch[1].replace(/[年月]/g, '-');
  }

  // 片长：优先取显示文本（带单位的），而不是 content 属性（纯数字）
  let runtime = '';
  // 1) v:runtime visible text（如 "78分钟"、"45分钟 × 12集"）
  const runtimeVisMatch = html.match(/property=['"]v:runtime['"][^>]*>([^<]+)</);
  if (runtimeVisMatch) {
    runtime = runtimeVisMatch[1].trim();
  }
  // 2) 从 infoBlock 提取片长行
  if (!runtime) runtime = extractInfoField('片长') || extractInfoField('单集片长') || extractInfoField('集数');
  // 3) 兜底：content 属性
  if (!runtime) {
    const rtCont = html.match(/property=['"]v:runtime['"][^>]+content=['"]([^'"]+)['"]/);
    if (rtCont) runtime = rtCont[1].trim();
  }
  // 4) 如果是纯数字且不含"集"，补"分钟"
  if (runtime && /^\d+$/.test(runtime)) {
    runtime = runtime + '分钟';
  }

  // 制片国家/地区
  let country = extractInfoField('制片国家/地区');
  if (!country) country = extractInfoField('制片国家');

  // 语言
  const language = extractInfoField('语言');

  // 出品方
  const production_company = extractInfoField('出品方') || extractInfoField('制作公司');

  // 简介
  let summary = '';
  const summaryDivMatch = html.match(/<div[^>]+id=["']link-report["'][\s\S]*?<span[^>]*property=["']v:summary["'][\s\S]*?>([\s\S]*?)<\/span>/i);
  if (summaryDivMatch) {
    summary = summaryDivMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  }
  if (!summary) {
    const smMatch = html.match(/<span\s+property=['"]v:summary['"][^>]*>([\s\S]*?)<\/span>/);
    if (smMatch) summary = smMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  }

  // 标签
  let tags = [];
  const tagsIter = html.matchAll(/class=['"]tag['"][^>]*>([^<]+)<\/a>/gi);
  for (const m of tagsIter) tags.push(m[1].trim());
  if (tags.length === 0) {
    const tagsIter2 = html.matchAll(/["']tags-body["'][\s\S]*?<a[^>]*>([^<]+)<\/a>/gi);
    for (const m of tagsIter2) tags.push(m[1].trim());
  }

  // 评价人数
  let ratingCount = '';
  const rcm = html.match(/(\d+)\s*人评价/);
  if (rcm) ratingCount = rcm[1];

  // === 个人数据：从列表页（登录态）获取，不在这里解析 ===
  // 个人评分、打分日期、短评由 content script 在列表页提取，通过 batchSyncItem.params 传入

  const category = detectCategory(html, genres, runtime);

  return {
    douban_id: doubanId,
    title,
    cover,
    douban_rating: doubanRating,
    rating_count: ratingCount,
    url,
    director,
    screenwriter,
    actors,
    genres,
    country,
    language,
    release_date_raw: releaseDateRaw,
    release_date: releaseDateRaw,  // 兼容 mapping 中的 release_date 键名
    runtime,
    production_company,
    summary,
    tags: tags.join(' / '),
    category,
    type: 'movie'
  };
}


async function batchSyncItem(params) {
  const {
    appId, appSecret, appToken, tableId, item,
    feishuFields, requiredFields, equalStrategy,
    movieMapping, bookMapping, tmdbApiKey, allRecords
  } = params;

  const result = {
    doubanId: item.doubanId,
    title: item.title,
    url: item.url,
    action: 'skipped',
    reason: ''
  };

  let detailInfo;
  try {
    const resp = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': item.type === 'book' ? 'https://book.douban.com/' : 'https://movie.douban.com/'
      }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    detailInfo = parseDetailPageHtml(html, item.url);
  } catch (e) {
    result.action = 'failed';
    result.reason = `页面抓取失败: ${e.message}`;
    return result;
  }

  if (!detailInfo || !detailInfo.title) {
    result.action = 'failed';
    result.reason = '无法解析页面信息';
    return result;
  }

  // === 合并列表页（登录态）提取的个人数据 ===
  if (item.personRating != null) detailInfo.rating = item.personRating;
  if (item.personDate) {
    const dParts = item.personDate.split('-');
    if (dParts.length === 3) {
      detailInfo.rating_date = new Date(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2])).getTime();
    }
  }
  if (item.personComment) detailInfo.my_comment = item.personComment;

  // 合并进度状态（从列表页 URL 推导）
  if (item.statusLabel) detailInfo.progress_status = item.statusLabel;

  const mapping = item.type === 'book' 
    ? { ...bookMapping, progress_status: ['进度状态', '观看进度', '状态', 'progress', 'progress_status'] }
    : { ...movieMapping, progress_status: ['进度状态', '观看进度', '状态', 'progress', 'progress_status'] };

  const existingMatches = await findExistingRecords({
    appId, appSecret, appToken, tableId,
    feishuFields,
    itemId: detailInfo.douban_id,
    itemTitle: detailInfo.title,
    allRecords
  });

  if (existingMatches.length === 0) {
    const { fields: mappedFields, coverUrl, coverFieldName } = mapDataForBatch(detailInfo, item.type, feishuFields, mapping);
    if (Object.keys(mappedFields).length === 0) {
      result.action = 'failed';
      result.reason = '没有匹配到任何字段';
      return result;
    }

    if (item.type === 'movie' && tmdbApiKey && detailInfo.title) {
      try {
        const year = detailInfo.release_date_raw ? new Date(detailInfo.release_date_raw).getFullYear() : '';
        const tmdbCover = await searchTmdbPoster({ tmdbApiKey, title: detailInfo.title, year });
        if (tmdbCover) coverUrl = tmdbCover;
      } catch (e) {}
    }

    await saveToFeishu({ appId, appSecret, appToken, tableId, fields: mappedFields, coverUrl, coverFieldName });
    result.action = 'added';
    result.reason = '新增成功';
    return result;
  }

  const primaryMatch = existingMatches.find(m => m.matchType === 'douban_id') || existingMatches[0];
  const existingRecord = primaryMatch.record;
  const existingFields = existingRecord.fields || {};

  let requiredForCalc = requiredFields;
  if (!requiredForCalc || requiredForCalc.length === 0) {
    requiredForCalc = feishuFields.filter(f => !f.is_primary).map(f => f.field_name);
  }

  const existingCompleteness = calculateCompleteness(existingFields, requiredForCalc);

  const { fields: newMappedFields } = mapDataForBatch(detailInfo, item.type, feishuFields, mapping);
  const newCompleteness = calculateCompleteness(newMappedFields, requiredForCalc);

  if (newCompleteness > existingCompleteness) {
    const updateFields = { ...existingFields, ...newMappedFields };
    const { coverUrl, coverFieldName } = mapDataForBatch(detailInfo, item.type, feishuFields, mapping);
    await updateRecord({ appId, appSecret, appToken, tableId, recordId: existingRecord.record_id, fields: updateFields, coverUrl, coverFieldName });
    result.action = 'updated';
    result.reason = `完整度 ${(existingCompleteness*100).toFixed(0)}% -> ${(newCompleteness*100).toFixed(0)}%，已覆盖`;
  } else if (newCompleteness < existingCompleteness) {
    result.action = 'skipped';
    result.reason = `新数据完整度 ${(newCompleteness*100).toFixed(0)}% < 现有 ${(existingCompleteness*100).toFixed(0)}%，跳过`;
  } else {
    if (equalStrategy === 'new_priority') {
      const updateFields = { ...existingFields, ...newMappedFields };
      const { coverUrl, coverFieldName } = mapDataForBatch(detailInfo, item.type, feishuFields, mapping);
      await updateRecord({ appId, appSecret, appToken, tableId, recordId: existingRecord.record_id, fields: updateFields, coverUrl, coverFieldName });
      result.action = 'updated';
      result.reason = '完整度相等，新数据优先';
    } else {
      result.action = 'skipped';
      result.reason = '完整度相等，保留旧数据';
    }
  }

  return result;
}

function mapDataForBatch(data, type, feishuFields, mapping) {
  const resultFields = {};
  let coverFieldName = null;
  let coverUrl = data.cover || '';

  for (const [dataKey, dataValue] of Object.entries(data)) {
    if (dataKey.endsWith('_raw') && dataKey !== 'release_date_raw' && dataKey !== 'pubdate_raw') continue;
    if (dataValue === '' || dataValue === null || dataValue === undefined) continue;

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

      if (dataKey === 'pubdate' && data['pubdate_raw']) {
        finalValue = data['pubdate_raw'];
      } else if (dataKey === 'release_date' && data['release_date_raw']) {
        finalValue = data['release_date_raw'];
      }

      if (match.type === 1) {
        finalValue = String(finalValue);
      } else if (match.type === 3) {
        // 单选字段：直接传文本值，飞书 API 自动匹配已有选项
        finalValue = String(dataValue);
      } else if (match.type === 4) {
        // 多选字段：传字符串数组，API 自动匹配已有选项
        finalValue = Array.isArray(dataValue) ? dataValue.map(String) : [String(dataValue)];
      } else if (match.type === 15) {
        finalValue = { text: "豆瓣链接", link: dataValue };
      } else if (match.type === 17 && dataKey === 'cover') {
        coverFieldName = match.field_name;
        continue;
      } else if (match.type === 2) {
        finalValue = parseFloat(String(finalValue).replace(/-/g, ''));
        if (isNaN(finalValue)) continue;
      } else if (match.type === 5) {
        // 日期字段：字符串转时间戳（毫秒），时间戳直接传递
        if (typeof finalValue === 'string') {
          finalValue = Date.parse(finalValue);
          if (isNaN(finalValue)) continue;
        }
      }

      resultFields[match.field_name] = finalValue;
    }
  }

  return { fields: resultFields, coverUrl, coverFieldName };
}

async function collectAllListItems(tabId, onPage) {
  const allItems = [];
  let currentTabId = tabId;
  let page = 1;
  const MAX_PAGES = 50;

  while (page <= MAX_PAGES) {
    let pageData;
    try {
      pageData = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(currentTabId, { action: 'getListItems' }, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (response?.success) resolve(response.data);
          else reject(new Error(response?.error || 'Failed to get list items'));
        });
      });
    } catch (e) {
      console.warn(`[Batch] Page ${page} failed:`, e.message);
      break;
    }

    const newItems = (pageData.items || []).filter(item => !allItems.some(e => e.doubanId === item.doubanId));
    allItems.push(...newItems);

    if (onPage) {
      onPage({ page, items: newItems, total: allItems.length, nextPage: pageData.nextPage });
    }

    if (!pageData.nextPage || pageData.nextPage === pageData.currentUrl) break;

    try {
      await new Promise((resolve, reject) => {
        chrome.tabs.update(currentTabId, { url: pageData.nextPage }, (tab) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(tab);
        });
      });
      await new Promise(r => setTimeout(r, 1500));
      let loaded = false;
      for (let i = 0; i < 20; i++) {
        try {
          await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(currentTabId, { action: 'getDoubanId' }, (resp) => {
              if (chrome.runtime.lastError || !resp?.success) reject();
              else resolve();
            });
          });
          loaded = true;
          break;
        } catch (e) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      if (!loaded) throw new Error('Page load timeout');
    } catch (e) {
      console.warn(`[Batch] Navigation to page ${page + 1} failed:`, e.message);
      break;
    }

    page++;
  }

  return allItems;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      let data;
      switch (request.action) {
        case 'ping': data = { success: true }; break;
        case 'verifyConnection': data = await verifyConnection(request); break;
        case 'getTableFields': data = await getTableFields(request); break;
        case 'saveToFeishu': data = await saveToFeishu(request); break;
        case 'updateTableName': data = await updateTableName(request); break;
        case 'updateFieldName': data = await updateFieldName(request); break;
        case 'createField': data = await createField(request); break;
        case 'searchTmdbPoster': data = await searchTmdbPoster(request); break;
        case 'getAllRecords': data = await getAllRecords(request); break;
        case 'updateRecord': data = await updateRecord(request); break;
        case 'findExistingRecords': {
          const { feishuFields, itemId, itemTitle } = request;
          data = await findExistingRecords({ ...request, feishuFields, itemId, itemTitle });
          break;
        }
        case 'batchSyncItem': data = await batchSyncItem(request); break;
        case 'collectAllListItems': {
          const tabId = sender.tab?.id;
          if (!tabId) throw new Error('No tab id');
          data = await collectAllListItems(tabId);
          break;
        }
        default: throw new Error(`Unknown action: ${request.action}`);
      }
      sendResponse({ success: true, data });
    } catch (error) {
      console.warn(`[BG Error] ${request.action}:`, error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
});
