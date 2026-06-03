console.log("Douban to Feishu content script loaded.");

// --- Helper Functions ---

const getDoubanId = () => {
  const match = window.location.href.match(/\/subject\/(\d+)/);
  return match ? match[1] : '';
};

const isListPage = () => {
  const url = window.location.href;
  // 仅支持个人列表页：看过/想看/在看
  return /\/people\/\d+\/(collect|wish|do)/.test(url) && !/\/subject\//.test(url);
};

const getListItems = () => {
  const items = [];
  const seen = new Set();
  const domain = window.location.hostname.includes('book') ? 'book' : 'movie';

  const subjectLinks = document.querySelectorAll('a[href*="/subject/"]');
  subjectLinks.forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    const idMatch = href.match(/\/subject\/(\d+)/);
    if (!idMatch) return;
    const doubanId = idMatch[1];
    if (seen.has(doubanId)) return;
    seen.add(doubanId);

    const fullUrl = href.startsWith('http') ? href : `https://${domain}.douban.com${href}`;

    const titleEl = a.querySelector('.title') || a.closest('li, tr, .item')?.querySelector('.title, .pl2 a, h2 a');
    const title = (titleEl ? titleEl.textContent.trim() : a.textContent.trim()).replace(/\s+/g, ' ').substring(0, 200);

    if (!title || title.length < 1) return;

    // === 从列表页（登录态）提取个人数据 ===
    const container = a.closest('li, tr, .item, .subject-item');
    let personRating = null;
    let personDate = '';
    let personComment = '';

    if (container) {
      // 评分：ratingN-t class（N=1~5） 或 data-rating 属性
      const ratingEl = container.querySelector('[class*="rating"][class*="-t"]');
      if (ratingEl) {
        const rm = ratingEl.className.match(/rating(\d)/);
        if (rm) personRating = parseInt(rm[1], 10);
      }
      if (!personRating) {
        const dataRatingEl = container.querySelector('[data-rating]');
        if (dataRatingEl) personRating = parseInt(dataRatingEl.getAttribute('data-rating'), 10);
      }

      // 打分日期：.date 元素或容器内 YYYY-MM-DD
      const dateEl = container.querySelector('.date');
      if (dateEl) personDate = dateEl.textContent.trim();
      if (!personDate) {
        const dm = (container.textContent || '').match(/(\d{4}-\d{2}-\d{2})/);
        if (dm) personDate = dm[1];
      }

      // 短评：.comment 或 .short-note 元素
      const commentEl = container.querySelector('.comment, .short-note');
      if (commentEl) personComment = commentEl.textContent.trim();
    }

    items.push({
      doubanId,
      title,
      url: fullUrl,
      type: domain,
      personRating,
      personDate,
      personComment
    });
  });

  return items;
};

const getNextPageUrl = () => {
  const nextLink = document.querySelector('span.next a, a.next, .paginator .next a, .paginator a:last-child');
  if (nextLink && nextLink.getAttribute('href')) {
    const href = nextLink.getAttribute('href');
    if (href.startsWith('http')) return href;
    const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const qs = href.startsWith('?') ? href : (href.startsWith('/') ? href : '/' + href);
    return base + qs;
  }
  const laterLink = document.querySelector('link[rel="next"]');
  if (laterLink) return laterLink.getAttribute('href');
  return null;
};

// Get text from next sibling, skipping empty text nodes and BR tags
const getNextSiblingText = (node) => {
  if (!node) return '';
  let next = node.nextSibling;
  while (next) {
    if (next.nodeType === 3 && next.textContent.trim().length > 0) { // Text node
      return next.textContent.trim();
    }
    if (next.nodeType === 1 && next.tagName !== 'BR') { // Element node but not BR
       return next.innerText.trim();
    }
    next = next.nextSibling;
  }
  return '';
};

// Parse date string to timestamp (ms)
// Supported formats: "YYYY-MM-DD", "YYYY-MM", "YYYY", "YYYY年MM月"
const parseDateToTimestamp = (dateStr) => {
  if (!dateStr) return null;
  
  let cleanStr = dateStr.trim().replace(/[年月日]/g, '-').replace(/-$/, '');
  const parts = cleanStr.split(/[-/.]/);
  
  let year, month, day;
  
  if (parts.length >= 1) year = parseInt(parts[0], 10);
  if (parts.length >= 2) month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
  else month = 0;
  if (parts.length >= 3) day = parseInt(parts[2], 10);
  else day = 1;
  
  if (isNaN(year)) return null;
  
  const date = new Date(year, month, day);
  return date.getTime();
};

// Get info by regex from a large text block
const getInfoByRegex = (text, regex) => {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
};

// --- User Interest Info Extraction (Personal Rating/Comment) ---

const getUserInterest = () => {
  // Check login status first
  const globalNav = document.querySelector('.global-nav-items');
  const userStatus = {
    is_logged_in: false,
    has_marked: false,
    status_text: '' // e.g. "想看", "看过", "在看"
  };

  if (globalNav && globalNav.innerText.includes('提醒')) {
      userStatus.is_logged_in = true;
  } else if (document.querySelector('.nav-user-account')) {
      // Newer Douban nav check
      userStatus.is_logged_in = true;
  }

  let interestEl = document.getElementById('interest_sect_level');

  // Fallback: Look for specific markers if ID not found or standard structure missing
  if (!interestEl || !interestEl.querySelector('.date')) {
      // Try to find the container via "看过"/"读过" status text
      const statusSpans = Array.from(document.querySelectorAll('span.mn, span.pl'));
      const targetSpan = statusSpans.find(s => ['看过', '读过', '听过', '想看', '在看'].includes(s.innerText.trim()));
      if (targetSpan) {
          userStatus.has_marked = true;
          userStatus.status_text = targetSpan.innerText.trim();
          // Go up to find the container
          const container = targetSpan.closest('div.j')?.parentElement || targetSpan.closest('div.clearfix');
          if (container) interestEl = container;
      }
  } else {
      userStatus.has_marked = true;
      // Try to guess status
      const statusText = interestEl.querySelector('span.mn, span.pl')?.innerText.trim();
      if (statusText) userStatus.status_text = statusText;
  }

  const result = {
    rating: null, // Change default from '' to null
    rating_date: null, // Change default from '' to null
    my_comment: '',
    user_status: userStatus
  };
  
  if (!interestEl) return result;

  // 1. Date Extraction
  const dateEl = interestEl.querySelector('span.date');
  if (dateEl) {
    const dateText = dateEl.innerText.trim();
    if (/\d{4}-\d{2}-\d{2}/.test(dateText)) {
      result.rating_date = parseDateToTimestamp(dateText);
    }
  } else {
      // Regex search in the whole text of the container
      const match = interestEl.innerText.match(/(\d{4}-\d{2}-\d{2})/);
      if (match) {
          result.rating_date = parseDateToTimestamp(match[1]);
      }
  }

  // 2. Rating Extraction
  const ratingInput = interestEl.querySelector('input#n_rating');
  let ratingText = '';

  if (ratingInput && ratingInput.value) {
      result.rating = parseInt(ratingInput.value, 10);
  } else {
      // Fallback: look for star images or class
      const ratingEl = interestEl.querySelector('[class*="rating"], [class*="allstar"], [class*="star"]');
      if (ratingEl) {
        const className = ratingEl.className;
        const match = className.match(/(?:rating|allstar|star)(\d+)/);
        if (match) {
          let val = parseInt(match[1], 10);
          if (val >= 10) val = val / 10; 
          result.rating = val; 
        }
      }
  }

  // Get rating text (e.g., "还行") to remove it later
  const rateWordEl = interestEl.querySelector('#rateword');
  if (rateWordEl) {
      ratingText = rateWordEl.innerText.trim();
  }

  // 3. Comment Extraction
  // Based on user provided HTML structure:
  // The comment is in a span following the <br> after rating section, or just a text node.
  // Structure:
  // <div class="j a_stars">
  //    ... date ... <br> ... rating ... <br>
  //    <span>挺好的。<span class="pl"></span></span>
  // </div>
  
  // Strategy: 
  // 1. Look for the last span that doesn't have a specific class (like .pl, .date, etc.)
  // 2. Or, since we have the full structure now, we can be very specific.
  
  const commentEl = interestEl.querySelector('.comment, .short-comment');
  if (commentEl) {
     result.my_comment = commentEl.innerText.trim();
  } else {
     // Specific handling for the "j a_stars" structure provided by user
     // It seems the comment is in a direct span child or a text node at the end.
     
     // Clone and clean approach is best, but let's refine what we remove.
     try {
          const clone = interestEl.cloneNode(true);
          
          // Remove known elements
          const selectorsToRemove = [
              '.date', '.collection_date',
              '.mr10', // "我看过这部电影" container
              '.collect_btn', // "修改"
              'form', // "删除" button form
              '#rating', // The entire rating block
              '#rateword', // "还行"
              '.pl', // labels
              'br',
              'script',
              'style'
          ];
          
          selectorsToRemove.forEach(sel => {
              clone.querySelectorAll(sel).forEach(el => el.remove());
          });
          
          // Also remove text nodes that contain "我看过这部电影", "我的评价"
          // Since we removed children, we are left with text nodes.
          
          let text = clone.innerText;
          
          // Clean up
          text = text.replace(/我看过这部电影/g, '')
                     .replace(/我的评价:/g, '')
                     .replace(/^评价\s*[:：]?\s*/g, '') // Remove starting "评价" with optional colon/spaces
                     .replace(/修改/g, '')
                     .replace(/删除/g, '')
                     .replace(/\d{4}-\d{2}-\d{2}/g, ''); // Just in case date was text
                     
          if (ratingText) text = text.replace(ratingText, '');
          
          const potentialComment = text.trim();
          // Only assign if it looks like a real comment (not empty or just status)
          if (potentialComment && !['想看', '看过', '在看', '读过', '听过'].includes(potentialComment)) {
              result.my_comment = potentialComment;
          }
     } catch (e) {
         // ...
     }
  }

  return result;
};

// --- Book Info Extraction ---

function getBookInfo() {
  try {
    const infoEl = document.getElementById('info');
    if (!infoEl) return { error: "未能找到图书信息元素 (#info)。请确认当前页面是豆瓣图书详情页。" };

    const infoText = infoEl.innerText;
    
    // Helper to extract specific fields from #info
    const getField = (regex) => getInfoByRegex(infoText, regex);

    const getAuthors = () => {
      // Strategy 1: Look for "作者:" span
      const authorSpan = Array.from(infoEl.querySelectorAll('span.pl')).find(el => el.textContent.includes('作者'));
      if (authorSpan) {
        // Check if there are links (<a>)
        const links = authorSpan.parentElement.querySelectorAll('a');
        // Filter out the "作者" link itself if it exists inside parent, though structure usually is: <span class="pl">作者:</span> <a ...>Name</a>
        // We need to capture links that are siblings or children of parent excluding the label.
        // Actually, for books, it's often: <span class="pl">作者:</span>&nbsp;<a href="...">Name</a>
        
        // Let's try getting text from next sibling first (for non-link authors)
        const directText = getNextSiblingText(authorSpan);
        if (directText && !directText.includes(':')) return directText; // Simple text author
        
        // If links exist
        // Note: Sometimes there are multiple authors separated by / or spaces
        // The structure is messy. Let's fallback to regex if DOM traversal is hard.
      }
      return getField(/(?:作者:)\s*(.*)/) || '';
    };

    // Extract raw date string first
    const pubDateStr = getField(/(?:出版年:)\s*(.*)/);
    
    const getISBN = () => {
        const span = Array.from(infoEl.querySelectorAll('span.pl')).find(e => e.innerText.trim() === 'ISBN:');
        if (span) {
             return getNextSiblingText(span);
        }
        return getField(/(?:ISBN:)\s*(.*)/);
    };

    const userInterest = getUserInterest();

    return {
      douban_id: getDoubanId(),
      title: document.querySelector("h1 span[property='v:itemreviewed']")?.innerText.trim() || '',
      cover: document.querySelector("#mainpic img")?.src.replace(/\.webp$/, '.jpg').replace(/s_ratio_poster/, 'l_ratio_poster') || '',
      douban_rating: document.querySelector("strong.rating_num")?.innerText.trim() || '0', // Public rating
      rating: userInterest.rating || '', // Personal rating
      url: window.location.href,
      author: getAuthors().replace(/\s+/g, ' '), // Normalize spaces
      translator: getField(/(?:译者:)\s*(.*)/),
      publisher: getField(/(?:出版社:)\s*(.*)/),
      production_company: getField(/(?:出品方:)\s*(.*)/),
      pubdate: parseDateToTimestamp(pubDateStr), // Convert to timestamp
      pubdate_raw: pubDateStr, // Keep raw just in case
      publish_year: pubDateStr,
      pages: getField(/(?:页数:)\s*(.*)/),
      price: getField(/(?:定价:)\s*(.*)/),
      binding: getField(/(?:装帧:)\s*(.*)/),
      isbn: getISBN(),
      series: getField(/(?:丛书:)\s*(.*)/),
      original_title: getField(/(?:原作名:)\s*(.*)/),
      summary: document.querySelector("#link-report .intro")?.innerText.trim() || '',
      tags: Array.from(document.querySelectorAll('#db-tags-section .tag')).map(el => el.innerText.trim()),
      rating_date: userInterest.rating_date || '', 
      my_comment: userInterest.my_comment || '',
      category: detectCategoryForContent()
    };
  } catch (error) { return { error: error.message }; }
}

// --- Movie Info Extraction ---


function detectCategoryForContent() {
  // 在 content script 中判断种类（更严格的判断逻辑）
  const infoEl = document.getElementById('info');
  const infoText = infoEl ? infoEl.innerText : '';
  
  // 获取 genres：优先 schema 属性，fallback 到 HTML 文本
  const genresEls = document.querySelectorAll("[property='v:genre']");
  let genresText = Array.from(genresEls).map(el => el.innerText.trim()).join(' / ');
  
  // fallback: 从 #info 文本中提取（新版豆瓣可能没有 schema 属性）
  if (!genresText) {
    const genreSpan = infoEl ? infoEl.querySelector('.pl:has(+ .attrs)') : null;
    if (genreSpan && genreSpan.textContent.includes('类型')) {
      const attrsEl = genreSpan.nextElementSibling;
      if (attrsEl) genresText = attrsEl.innerText.trim();
    }
  }
  if (!genresText) {
    const gm = infoText.match(/类型[：:]\s*([^\n]+)/);
    if (gm) genresText = gm[1];
  }
  
  console.log('[detectCategory] genresText:', genresText);
  
  // 获取片长
  const runtimeEl = document.querySelector("[property='v:runtime']");
  let runtimeStr = runtimeEl ? (runtimeEl.getAttribute('content') || runtimeEl.innerText) : '';
  
  // 也从 #info 文本中找片长
  if (!runtimeStr && infoText) {
    const rtMatch = infoText.match(/片长[：:]?\s*([^\n]+)/);
    if (rtMatch) runtimeStr = rtMatch[1];
  }
  
  const genresLower = (genresText || '').toLowerCase();
  
  // === 动漫优先判断 ===
  const animeIndicators = ['动画', 'anime', '动漫', '卡通'];
  const isAnime = animeIndicators.some(k => genresLower.includes(k.toLowerCase()));
  
  // === 电视剧强指标（只在 genres / 片长 / 特定字段中判断，不扫描整段 infoText） ===
  
  // genres 中明确标注为电视剧/综艺/真人秀
  const tvGenreIndicators = ['电视剧', '综艺', '真人秀', 'tv series', 'tv mini-series'];
  const isTvGenre = tvGenreIndicators.some(k => genresLower.includes(k.toLowerCase()));
  
  // 片长明确包含「集」模式：如 "45分钟 × 12集"、"共24集"（只匹配 runtime 字段，不扫 infoText）
  const hasRuntimeEpisodes = /\d+\s*集/.test(runtimeStr);
  
  // infoText 中的强电视剧信号（只匹配特定字段行，不是通篇搜索）
  const hasEpisodeCountField = /集数[：:]\s*\d+/.test(infoText);
  const hasSingleEpisodeField = /单集片长/.test(infoText);
  const hasFirstAirField = /首播[：:]/.test(infoText);
  
  // 「季」判断：只在明确的第X季形式且结合剧集证据时判为电视剧
  const hasSeason = /第\s*\d+\s*季/.test(infoText) && (hasRuntimeEpisodes || hasEpisodeCountField || hasSingleEpisodeField);
  
  // === 判定逻辑 ===
  
  // 1) genres 明确是电视剧/综艺 → 直接判电视剧
  if (isTvGenre) {
    if (isAnime) return '动漫';
    return '电视剧';
  }
  
  // 2) 片长含「集」且不是动漫 → 电视剧
  if (hasRuntimeEpisodes && !isAnime) return '电视剧';
  
  // 3) 有集数/单集片长/首播字段 → 电视剧
  if ((hasEpisodeCountField || hasSingleEpisodeField || hasFirstAirField) && !isAnime) return '电视剧';
  
  // 4) 明确的第X季 → 电视剧
  if (hasSeason && !isAnime) return '电视剧';
  
  // 5) 动漫
  if (isAnime) {
    // 动漫形式但有剧集特征 → 仍归动漫（用户要求区分）  
    return '动漫';
  }
  
  // 6) 默认电影
  return '电影';
}

function getMovieInfo() {
  try {
    const infoEl = document.getElementById('info');
    if (!infoEl) return { error: "未能找到电影信息元素 (#info)。请确认当前页面是豆瓣电影详情页。" };

    const getSpanText = (label) => {
      const el = Array.from(infoEl.querySelectorAll('span.pl')).find(e => e.innerText.trim().startsWith(label));
      return el ? getNextSiblingText(el) : '';
    };

    const getInfoByAttribute = (prop) => 
      Array.from(infoEl.querySelectorAll(`[property="${prop}"], [rel="${prop}"]`)).map(el => el.innerText.trim()).join(' / ');

    const getDirectorFallback = () => {
        const span = Array.from(infoEl.querySelectorAll('span.pl')).find(e => {
            const text = e.innerText.trim();
            return text === '导演' || text === '导演:';
        });
        if (span) {
            const next = span.nextElementSibling;
            if (next && next.classList.contains('attrs')) {
                 return next.innerText.trim().replace(/\s*\/\s*/g, ' / ');
            }
            return getNextSiblingText(span);
        }
        return '';
    };

    // Release date: prefer v:initialReleaseDate, fallback to regex
    let releaseDateStr = getInfoByAttribute('v:initialReleaseDate');
    if (!releaseDateStr) {
        releaseDateStr = getSpanText('上映日期:');
    }

    const userInterest = getUserInterest();

    return {
      douban_id: getDoubanId(),
      title: document.querySelector("h1 span[property='v:itemreviewed']")?.innerText.trim() || '',
      cover: document.querySelector("#mainpic img")?.src.replace(/\.webp$/, '.jpg').replace(/s_ratio_poster/, 'l_ratio_poster') || '',
      douban_rating: document.querySelector("strong.rating_num")?.innerText.trim() || '0',
      rating: userInterest.rating || '',
      url: window.location.href,
      director: getInfoByAttribute('v:directedBy') || getDirectorFallback(),
      screenwriter: getSpanText('编剧'),
      actors: getInfoByAttribute('v:starring'),
      genres: getInfoByAttribute('v:genre'),
      country: getSpanText('制片国家/地区'),
      production_company: getSpanText('出品方') || getSpanText('制作公司'), // Attempt both
      language: getSpanText('语言'),
      release_date: parseDateToTimestamp(releaseDateStr),
      release_date_raw: releaseDateStr,
      runtime: getInfoByAttribute('v:runtime') || getSpanText('片长'),
      imdb: infoEl.innerText.match(/IMDb:?\s*(tt\d+)/)?.[1] || '',
      summary: document.querySelector("span[property='v:summary']")?.innerText.trim() || '',
      tags: Array.from(document.querySelectorAll('.tags-body a')).map(el => el.innerText.trim()),
      rating_date: userInterest.rating_date || '',
      my_comment: userInterest.my_comment || '',
      category: detectCategoryForContent()
    };
  } catch (error) { return { error: error.message }; }
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getInfo") {
    let info;
    switch (request.type) {
      case 'book':
        info = getBookInfo();
        break;
      case 'movie':
        info = getMovieInfo();
        break;
      default:
        info = { error: "未知的类型: " + request.type };
    }

    if (info.error) {
      sendResponse({ success: false, error: info.error });
    } else {
      sendResponse({ success: true, data: info });
    }
  }

  if (request.action === "getListItems") {
    try {
      const items = getListItems();
      const nextPage = getNextPageUrl();
      const pageType = window.location.hostname.includes('book') ? 'book' : 'movie';
      sendResponse({ success: true, data: { items, nextPage, pageType, currentUrl: window.location.href } });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }

  if (request.action === "getDoubanId") {
    sendResponse({ success: true, data: { douban_id: getDoubanId() } });
  }

  return true;
});
