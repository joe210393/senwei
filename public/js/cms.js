(() => {
  function q(sel, parent = document) { return parent.querySelector(sel); }
  function qa(sel, parent = document) { return Array.from(parent.querySelectorAll(sel)); }
  async function fetchJson(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  function getQueryParam(name) { return new URLSearchParams(location.search).get(name); }
  function setBackground(url, color) {
    if (url) document.body.style.backgroundImage = `url(${url})`;
    else if (color) document.body.style.background = color;
  }
  
  // Create beautiful placeholder image for service cards
  function createServicePlaceholder(title, color, icon) {
    // Use timestamp and random to ensure unique gradient IDs
    const uniqueId = 'grad-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const svg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color}dd;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#${uniqueId})"/>
      <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="80" text-anchor="middle" fill="rgba(255,255,255,0.9)">${icon}</text>
      <text x="50%" y="70%" font-family="Arial, sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="rgba(255,255,255,0.95)">${title}</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  function applyBackgroundFromSettings(pageKey, settings) {
    const urlKey = `bg_${pageKey}_url`;
    const colorKey = `bg_${pageKey}_color`;
    const bgUrl = settings[urlKey];
    const bgColor = settings[colorKey] || settings.default_bg_color;
    setBackground(bgUrl || null, bgUrl ? null : bgColor);
  }

  function applyTheme(name) {
    const theme = (name || 'default').toLowerCase();
    const selector = 'link[data-theme-link]';
    document.querySelector(selector)?.remove();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/css/theme-${theme}.css`;
    link.setAttribute('data-theme-link', 'true');
    document.head.appendChild(link);
  }

  async function loadSettings() {
    try {
      const settings = await fetchJson('/api/public/settings');
      applyTheme(settings.theme);
      const lineBtn = q('#line-float');
      if (lineBtn) {
        if (settings.line_url) { lineBtn.href = settings.line_url; lineBtn.style.display = 'flex'; }
        else lineBtn.style.display = 'none';
      }
      return settings;
    } catch {
      const settings = { site_name: 'Site', default_bg_color: '#f5f6f8', theme: 'default' };
      applyTheme('default');
      const lineBtn = q('#line-float'); if (lineBtn) lineBtn.style.display = 'none';
      return settings;
    }
  }

  async function loadPartial(el, url) {
    const res = await fetch(url);
    el.innerHTML = await res.text();
  }

  async function renderHeaderFooter() {
    const header = q('#site-header');
    const footer = q('#site-footer');
    if (header) await loadPartial(header, '/partials/header.html');
    if (footer) await loadPartial(footer, '/partials/footer.html');

    let settings = { site_name: 'Site', default_bg_color: '#f5f6f8' };
    try { settings = await fetchJson('/api/public/settings'); } catch {}
    const brand = q('#brand');
    if (brand) brand.textContent = settings.site_name || 'Site';
    const year = q('#footer-year');
    if (year) year.textContent = new Date().getFullYear();
    const fname = q('#footer-site-name');
    if (fname) fname.textContent = settings.site_name || 'Site';

    const navList = q('#nav-list');
    if (navList) {
      const original = navList.innerHTML;
      try {
        const menus = await fetchJson('/api/public/menus');
        if (Array.isArray(menus) && menus.length > 0) {
          navList.innerHTML = '';
          const roots = menus.filter(m => m.parent_id == null);
          const children = menus.filter(m => m.parent_id != null);
          roots.forEach(r => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = r.url || `/${r.slug || ''}.html`;
            a.textContent = r.title;
            li.appendChild(a);
            const subs = children.filter(c => c.parent_id === r.id);
            if (subs.length) {
              const ul = document.createElement('ul');
              subs.forEach(s => {
                const sli = document.createElement('li');
                const sa = document.createElement('a');
                sa.href = s.url || `/${s.slug || ''}.html`;
                sa.textContent = s.title;
                sli.appendChild(sa);
                ul.appendChild(sli);
              });
              li.appendChild(ul);
            }
            navList.appendChild(li);
          });
        } else {
          // keep static header items if DB has no menus
          navList.innerHTML = original;
        }
      } catch {
        navList.innerHTML = original;
      }
    }

    // Mobile nav toggle
    const toggle = q('#nav-toggle');
    const nav = q('#main-nav');
    toggle?.addEventListener('click', () => nav?.classList.toggle('open'));
    nav?.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      const li = a.parentElement;
      const hasSub = li && li.querySelector('ul');
      if (hasSub) {
        e.preventDefault();
        // toggle open without auto-close on mouseout
        li.classList.toggle('open');
      }
    });
    // Highlight active
    const currentPath = location.pathname.replace(/\/index\.html$/, '/');
    qa('#nav-list a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      const url = new URL(href, location.origin);
      if (url.pathname === currentPath) a.classList.add('active');
    });

    // Language switch - REMOVED (no longer needed)
    // Language functionality has been removed per user request
    const dict = {
      zh: {
        home: '首頁', about: '關於', 
        about_guchau: '關於鼓潮', about_story: '品牌故事', about_history: '鼓潮音樂歷程', about_music: '關於音樂課程',
        services: '服務項目', service_courses: '音樂課程', service_commercial: '商業演出', service_sales: '樂器販售', service_space: '共享與藝術空間', service_tourism: '音樂觀光體驗',
        media_records: '影像紀錄',
        blog: '部落格', news: '相關報導', leaderboard: '師資說明', plans: '課程方案', contact: '聯絡我們', trial: '課程試讀', login: '登入'
      },
      en: {
        home: 'Home', about: 'About', 
        about_guchau: 'About Guchau', about_story: 'Brand Story', about_history: 'Music History', about_music: 'About Music Courses',
        services: 'Services', service_courses: 'Music Courses', service_commercial: 'Commercial Performance', service_sales: 'Instrument Sales', service_space: 'Shared & Art Space', service_tourism: 'Music Tourism',
        media_records: 'Video Records',
        blog: 'Blog', news: 'News', leaderboard: 'Instructors', plans: 'Plans', contact: 'Contact', trial: 'Trial', login: 'Login'
      },
      ja: {
        home: 'ホーム', about: '紹介', 
        about_guchau: '鼓潮について', about_story: 'ブランドストーリー', about_history: '音楽の歴史', about_music: '音楽コースについて',
        services: 'サービス', service_courses: '音楽コース', service_commercial: '商業公演', service_sales: '楽器販売', service_space: '共有＆アートスペース', service_tourism: '音楽観光体験',
        media_records: '映像記録',
        blog: 'ブログ', news: 'ニュース', leaderboard: '講師紹介', plans: 'プラン', contact: 'お問い合わせ', trial: '体験講座', login: 'ログイン'
      }
    };
    // Language switch functionality removed - no longer needed

    // Account box: show member name/email and gear to backend info
    try {
      const me = await fetchJson('/api/public/members/me');
      const box = q('#account-box');
      if (box) {
        box.innerHTML = '';
        if (me && me.id) {
          const name = me.name || me.email || 'Member';
          const label = document.createElement('span');
          label.textContent = name;
          const gear = document.createElement('a');
          gear.href = '/user.html';
          gear.title = '會員中心';
          gear.className = 'btn ghost';
          gear.textContent = '⚙';
          const logout = document.createElement('button');
          logout.className = 'btn ghost';
          logout.textContent = '登出';
          logout.addEventListener('click', async () => {
            try {
              const csrfRes = await fetch('/api/public/csrf', { credentials: 'same-origin' });
              const { csrfToken } = await csrfRes.json();
              await fetch('/api/public/members/logout', { method:'POST', headers: { 'CSRF-Token': csrfToken }, credentials: 'same-origin' });
            } catch {}
            location.href = '/';
          });
          box.appendChild(label);
          box.appendChild(gear);
          box.appendChild(logout);
        } else {
          const login = document.createElement('a');
          login.href = '/login.html';
          login.className = 'btn ghost';
          login.textContent = '登入';
          box.appendChild(login);
        }
      }
    } catch {}
  }

  function bindList(section, items, mapFn) {
    const tpl = q('#news-item-tpl');
    const target = q('[data-target="list"]', section) || section;
    target.innerHTML = '';
    items.forEach(item => {
      const node = document.importNode(tpl.content, true);
      qa('[data-prop]', node).forEach(el => {
        const [attr, path] = el.getAttribute('data-prop').split(':');
        const value = path.split('.').reduce((o, k) => (o ? o[k] : undefined), mapFn(item));
        if (attr === 'text') el.textContent = value ?? '';
        else el.setAttribute(attr, value ?? '');
      });
      target.appendChild(node);
    });
  }

  async function init() {
    // Render header/footer first so layout is visible even if settings API fails
    await renderHeaderFooter();
    const settings = await loadSettings();
    const page = document.body.dataset.page;
    
    // Generic page handler for new pages
    const contentPages = [
        'about-guchau', 'about-story', 'about-history', 'about-music',
        'service-courses', 'service-commercial', 'service-space', 'service-tourism'
        // Note: 'service-sales' is NOT in this list - it has its own product listing handler below
        // Note: 'media-records' is NOT in this list - it has its own handler below
    ];
    
    if (contentPages.includes(page)) {
        try {
            const pageData = await fetchJson(`/api/public/pages/${page}`);
            // Try different selectors for content area
            const cont = q('#content') || q('#aboutus-content') || q('#teacher-content'); 
            if (cont) cont.innerHTML = pageData.content_html || '';
            setBackground(pageData.background_image_url || null, settings.default_bg_color);
        } catch { 
            applyBackgroundFromSettings('about', settings); 
        }
    } else if (page === 'home') {
      // Load slides
      try {
        const slides = await fetchJson('/api/public/slides');
        const holder = q('#slides');
        const dots = q('#dots');
        const prev = q('#prev');
        const next = q('#next');
        if (holder && slides.length) {
          holder.innerHTML = '';
          slides.forEach((s, idx) => {
            const a = document.createElement('a');
            a.href = s.link_url || '#';
            a.style.opacity = idx === 0 ? '1' : '0';
            a.innerHTML = `<img src="${s.image_url}" alt="${s.title || ''}">`;
            holder.appendChild(a);
          });
          let i = 0;
          function show(n){
            const all = qa('#slides > a');
            i = (n + all.length) % all.length;
            all.forEach((el, idx) => el.style.opacity = idx === i ? '1' : '0');
            qa('#dots button').forEach((d, di) => d.style.opacity = di === i ? '1' : '.4');
          }
          dots.innerHTML = '';
          slides.forEach((_s, di) => { const b=document.createElement('button'); b.className='btn ghost'; b.style.padding='4px 8px'; b.textContent='•'; b.style.opacity = di===0?'1':'.4'; b.addEventListener('click',()=>show(di)); dots.appendChild(b); });
          prev?.addEventListener('click',()=>show(i-1));
          next?.addEventListener('click',()=>show(i+1));
          setInterval(()=>show(i+1), 5000);
        }
      } catch {}
      // New Homepage Logic: 7 Cards Grid
      const homeGrid = q('#home-grid');
      const cardTpl = q('#home-card-tpl');
      
      if (homeGrid && cardTpl) {
          const sections = [
              { title: '音樂課程', slug: 'service-courses', type: 'page' },
              { title: '商業演出', slug: 'service-commercial', type: 'page' },
              // Note: 'service-sales' (樂器販售) removed - now has featured products section above
              { title: '共享與藝術空間', slug: 'service-space', type: 'page' },
              { title: '音樂觀光體驗', slug: 'service-tourism', type: 'page' },
              { title: '相關報導', slug: 'news', type: 'list' },
              { title: '影像紀錄', slug: 'media-records', type: 'list' }
          ];
          
          // Load featured products (5 latest products)
          const featuredGrid = q('#featured-products-grid');
          const featuredTpl = q('#featured-product-tpl');
          if (featuredGrid && featuredTpl) {
              try {
                  const productsData = await fetchJson('/api/public/products?page=1&limit=5');
                  const products = productsData.items || [];
                  featuredGrid.innerHTML = '';
                  
                  if (products.length > 0) {
                      products.forEach(product => {
                          const node = document.importNode(featuredTpl.content, true);
                          const card = node.querySelector('.product-card');
                          
                          if (card) {
                              card.addEventListener('click', () => {
                                  location.href = `/product-detail.html?slug=${encodeURIComponent(product.slug)}`;
                              });
                          }
                          
                          // Fill in data
                          qa('[data-prop]', node).forEach(el => {
                              const [attr, path] = el.getAttribute('data-prop').split(':');
                              let value = path.split('.').reduce((o, k) => (o ? o[k] : undefined), product);
                              
                              if (path === 'price') {
                                  value = Number(value || 0).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                              }
                              
                              if (attr === 'text') {
                                  el.textContent = value ?? '';
                              } else if (attr === 'src') {
                                  el.src = value || '';
                                  if (!value) {
                                      el.style.display = 'none';
                                  }
                              }
                          });
                          
                          featuredGrid.appendChild(node);
                      });
                  } else {
                      featuredGrid.innerHTML = '<p style="text-align:center;color:#666;padding:20px;grid-column:1/-1;">暫無商品</p>';
                  }
              } catch (err) {
                  console.error('[Frontend] Error loading featured products:', err);
                  if (featuredGrid) {
                      featuredGrid.innerHTML = '<p style="text-align:center;color:#c00;padding:20px;grid-column:1/-1;">載入失敗</p>';
                  }
              }
          }
          
          homeGrid.innerHTML = '';
          
          for (const sec of sections) {
              const node = document.importNode(cardTpl.content, true);
              const h3 = node.querySelector('h3');
              const p = node.querySelector('p');
              const a = node.querySelector('a');
              const img = node.querySelector('img');
              
              h3.textContent = sec.title;
              
              // Fetch content
              if (sec.type === 'page') {
                  a.href = `/${sec.slug}.html`;
                  try {
                      const pageData = await fetchJson(`/api/public/pages/${sec.slug}`);
                      const plain = (pageData.content_html || '').replace(/<[^>]+>/g, '');
                      p.textContent = plain.slice(0, 150) + (plain.length > 150 ? '...' : '');
                      // Set image - use background_image_url if available, otherwise use default placeholder
                      if (img) {
                          if (pageData.background_image_url) {
                              img.src = pageData.background_image_url;
                          } else {
                              // Use beautiful default placeholder image based on service type
                              const defaultImages = {
                                  'service-courses': createServicePlaceholder('音樂課程', '#4A90E2', '🎵'),
                                  'service-commercial': createServicePlaceholder('商業演出', '#E94B3C', '🎤'),
                                  'service-sales': createServicePlaceholder('樂器販售', '#F5A623', '🥁'),
                                  'service-space': createServicePlaceholder('共享與藝術空間', '#7B68EE', '🎨'),
                                  'service-tourism': createServicePlaceholder('音樂觀光體驗', '#50C878', '✈️')
                              };
                              img.src = defaultImages[sec.slug] || createServicePlaceholder(sec.title, '#9B9B9B', '🎵');
                          }
                      }
                  } catch { p.textContent = 'Loading...'; }
              } else {
                  // List type (News / Media) - fetch latest item
                  a.href = `/${sec.slug}.html`;
                  try {
                      // Use limit=1 to get latest
                      const listData = await fetchJson(`/api/public/${sec.slug}?limit=1`);
                      if (listData.items && listData.items.length > 0) {
                          const item = listData.items[0];
                          const plain = (item.excerpt || item.content_html || '').replace(/<[^>]+>/g, '');
                          p.textContent = plain.slice(0, 150) + (plain.length > 150 ? '...' : '');
                          if (img && item.cover_url) img.src = item.cover_url;
                          else if (img) img.style.display = 'none';
                      } else {
                          p.textContent = '暫無內容';
                          if (img) img.style.display = 'none';
                      }
                  } catch { p.textContent = '...'; }
              }
              
              homeGrid.appendChild(node);
          }
      }
      
      // Load homepage booking calendar (view-only)
      const homeCalendarEl = q('#home-calendar');
      if (homeCalendarEl) {
        try {
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth();
          
          const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
          const firstDay = new Date(currentYear, currentMonth, 1);
          const startDate = new Date(firstDay);
          startDate.setDate(startDate.getDate() - startDate.getDay());
          
          homeCalendarEl.innerHTML = '';
          
          // Day headers
          dayNames.forEach(day => {
            const header = document.createElement('div');
            header.style.textAlign = 'center';
            header.style.fontWeight = '600';
            header.style.padding = '8px';
            header.style.fontSize = '14px';
            header.style.color = '#666';
            header.style.background = '#f9fafb';
            header.style.borderRadius = '4px';
            header.textContent = day;
            homeCalendarEl.appendChild(header);
          });
          
          // Load events for current month
          const events = await fetchJson(`/api/public/events?year=${currentYear}&month=${currentMonth + 1}`);
          const eventsByDate = {};
          if (Array.isArray(events)) {
            events.forEach(e => {
              if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = [];
              eventsByDate[e.event_date].push(e);
            });
          }
          
          // Calendar days
          const renderDate = new Date(startDate);
          for (let i = 0; i < 42; i++) {
            const dayEl = document.createElement('div');
            const dateStr = `${renderDate.getFullYear()}-${String(renderDate.getMonth() + 1).padStart(2, '0')}-${String(renderDate.getDate()).padStart(2, '0')}`;
            const isCurrentMonth = renderDate.getMonth() === currentMonth;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const dayEvents = eventsByDate[dateStr] || [];
            
            dayEl.style.aspectRatio = '1';
            dayEl.style.border = isToday ? '2px solid #111827' : '1px solid #e5e7eb';
            dayEl.style.borderRadius = '8px';
            dayEl.style.padding = '8px';
            dayEl.style.transition = 'all 0.2s';
            dayEl.style.background = isCurrentMonth ? '#fff' : '#f9fafb';
            dayEl.style.color = isCurrentMonth ? '#111827' : '#999';
            dayEl.style.opacity = isCurrentMonth ? '1' : '0.3';
            dayEl.style.fontWeight = isToday ? '700' : '500';
            dayEl.style.fontSize = '14px';
            dayEl.style.display = 'flex';
            dayEl.style.flexDirection = 'column';
            dayEl.style.alignItems = 'center';
            dayEl.style.justifyContent = 'flex-start';
            dayEl.style.minHeight = '80px';
            dayEl.style.cursor = 'default';
            
            dayEl.innerHTML = `
              <div style="font-size:14px;margin-bottom:4px;">${renderDate.getDate()}</div>
              <div style="display:flex;flex-direction:column;gap:2px;width:100%;align-items:center;">
                ${dayEvents.slice(0, 2).map(e => {
                  const colors = { course: '#4A90E2', performance: '#E94B3C', space: '#7B68EE' };
                  return `<div style="display:flex;align-items:center;gap:2px;width:100%;justify-content:center;">
                    <span style="width:6px;height:6px;border-radius:50%;background:${colors[e.event_type] || '#999'};display:inline-block;"></span>
                    <span style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60px;">${e.title || ''}</span>
                  </div>`;
                }).join('')}
                ${dayEvents.length > 2 ? `<div style="font-size:10px;color:#666;">+${dayEvents.length - 2}</div>` : ''}
              </div>
            `;
            
            homeCalendarEl.appendChild(dayEl);
            renderDate.setDate(renderDate.getDate() + 1);
          }
        } catch (err) {
          console.error('Error loading home calendar:', err);
          homeCalendarEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#999;">載入行事曆失敗</div>';
        }
      }

      applyBackgroundFromSettings('home', settings);
    } else if (page === 'media-records') {
        const params = new URLSearchParams(location.search);
        const pageNum = Number(params.get('page') || '1');
        try {
            const data = await fetchJson(`/api/public/media-records?page=${pageNum}&limit=9`);
            console.log('[Frontend] Media records API response:', data);
            const gridWrap = q('#media-list');
            const tpl = q('#media-item-tpl');
            
            if (!gridWrap) {
                console.error('[Frontend] #media-list element not found!');
                return;
            }
            if (!tpl) {
                console.error('[Frontend] #media-item-tpl template not found!');
                return;
            }
            
            gridWrap.innerHTML = '';
            
            if (!data.items || data.items.length === 0) {
                console.log('[Frontend] No media records found. Total:', data.total);
                gridWrap.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">暫無影像紀錄</p>';
                applyBackgroundFromSettings('about', settings);
                return;
            }
            
            function getEmbed(url) {
                if (!url) return '';
                try {
                    const u = new URL(url);
                    // YouTube handling - support all YouTube URL formats
                    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
                        let vid = null;
                        // Handle different YouTube URL formats
                        if (u.hostname === 'youtu.be' || u.hostname.includes('youtu.be')) {
                            // https://youtu.be/VIDEO_ID
                            vid = u.pathname.replace(/^\//, '').split('/')[0].split('?')[0];
                        } else if (u.pathname.includes('/embed/')) {
                            // https://www.youtube.com/embed/VIDEO_ID?si=...
                            vid = u.pathname.split('/embed/')[1].split('?')[0];
                        } else if (u.pathname.includes('/v/')) {
                            // https://www.youtube.com/v/VIDEO_ID
                            vid = u.pathname.split('/v/')[1].split('?')[0];
                        } else if (u.pathname.includes('/shorts/')) {
                            // https://www.youtube.com/shorts/VIDEO_ID
                            vid = u.pathname.split('/shorts/')[1].split('?')[0];
                        } else {
                            // https://www.youtube.com/watch?v=VIDEO_ID
                            vid = u.searchParams.get('v');
                        }
                        // Clean video ID (remove any extra parameters)
                        if (vid) {
                            vid = vid.split('&')[0].split('#')[0].split('?')[0].trim();
                            // Validate video ID format (YouTube video IDs are 11 characters)
                            if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
                                // Get origin for YouTube API compliance (as per Required Minimum Functionality)
                                const origin = window.location.origin || window.location.protocol + '//' + window.location.host;
                                // Embed URL with origin parameter for API compliance
                                // rel=0: don't show related videos, modestbranding=1: reduce YouTube branding
                                const embedUrl = `https://www.youtube.com/embed/${vid}?rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`;
                                // Add referrerpolicy to ensure Referer header is sent (required by YouTube API)
                                return `<div class="video-wrapper" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;min-height:270px;background:#000;border-radius:8px;margin-bottom:16px;"><iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;min-width:480px;min-height:270px;" loading="lazy"></iframe></div>`;
                            } else {
                                console.warn('[Frontend] Invalid YouTube video ID format:', vid);
                            }
                        }
                    }
                } catch (err) {
                    console.error('[Frontend] Error parsing embed URL:', url, err);
                }
                return ''; // Fallback or link
            }

            console.log('[Frontend] Rendering', data.items.length, 'media records');
            data.items.forEach((item, idx) => {
                try {
                    console.log(`[Frontend] Item ${idx}:`, item);
                    const node = document.importNode(tpl.content, true);
                    const embedHtml = getEmbed(item.embed_url);
                    
                    // Process all data-prop attributes
                    qa('[data-prop]', node).forEach(el => {
                        try {
                            const propValue = el.getAttribute('data-prop');
                            if (!propValue) return;
                            const [attr, path] = propValue.split(':');
                            let value;
                            if (path === 'title') value = item.title;
                            else if (path === 'excerpt') value = item.excerpt;
                            else if (path === 'link') value = `/media-record-post.html?slug=${encodeURIComponent(item.slug)}`;
                            else if (path === 'embed') {
                                if (attr === 'html') { el.innerHTML = embedHtml; return; }
                            }
                            
                            // Apply the value based on attribute type
                            if (attr === 'text') {
                                el.textContent = value || '';
                            } else if (attr === 'href') {
                                el.setAttribute('href', value || '#');
                            } else {
                                el.setAttribute(attr, value || '');
                            }
                        } catch (err) {
                            console.error(`[Frontend] Error processing data-prop for item ${idx}:`, err);
                        }
                    });
                    
                    // Special handling for title link: set href and ensure title span has text
                    const titleLink = node.querySelector('h3 a');
                    const titleSpan = node.querySelector('h3 a span');
                    if (titleLink) {
                        titleLink.href = `/media-record-post.html?slug=${encodeURIComponent(item.slug)}`;
                    }
                    if (titleSpan) {
                        titleSpan.textContent = item.title || '';
                    } else if (titleLink) {
                        // Fallback: if no span, set text directly on link
                        titleLink.textContent = item.title || '';
                    }
                    
                    if (!embedHtml) {
                        // If no embed, maybe show cover image?
                        // For now just hide embed container if empty
                        const container = node.querySelector('.media-embed-container');
                        if (container && !embedHtml) container.style.display = 'none';
                    }
                    
                    gridWrap.appendChild(node);
                    console.log(`[Frontend] Successfully appended item ${idx} to grid`);
                } catch (err) {
                    console.error(`[Frontend] Error rendering item ${idx}:`, err, item);
                }
            });
            
            // Pager
            const pager = q('#pager');
            if (pager) {
                const totalPages = Math.ceil(data.total / data.limit);
                pager.innerHTML = '';
                if (totalPages > 1) {
                    for (let i = 1; i <= totalPages; i++) {
                        const a = document.createElement('a');
                        a.href = `?page=${i}`;
                        a.textContent = i;
                        if (i === data.page) {
                            a.style.background = '#0066cc';
                            a.style.color = '#fff';
                        }
                        pager.appendChild(a);
                    }
                }
            }
        } catch (err) {
            console.error('[Frontend] Error loading media records:', err);
            const gridWrap = q('#media-list');
            if (gridWrap) {
                gridWrap.innerHTML = '<p style="text-align:center;padding:40px;color:#c00;">載入失敗，請稍後再試</p>';
            }
        }
        applyBackgroundFromSettings('about', settings); // Reuse about bg or add new setting
    } else if (page === 'media-record-post') {
        const slug = getQueryParam('slug');
        const item = await fetchJson(`/api/public/media-records/${encodeURIComponent(slug)}`);
        q('#post-title').textContent = item.title;
        q('#post-content').innerHTML = item.content_html || '';
        
        // Render large embed using same function as list page
        function getEmbedLarge(url) {
            if (!url) return '';
            try {
                const u = new URL(url);
                // YouTube handling only - simplified to avoid error 153
                if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
                    let vid = null;
                    if (u.hostname === 'youtu.be' || u.hostname.includes('youtu.be')) {
                        vid = u.pathname.replace(/^\//, '').split('/')[0].split('?')[0];
                    } else if (u.pathname.includes('/embed/')) {
                        vid = u.pathname.split('/embed/')[1].split('?')[0];
                    } else if (u.pathname.includes('/v/')) {
                        vid = u.pathname.split('/v/')[1].split('?')[0];
                    } else if (u.pathname.includes('/shorts/')) {
                        vid = u.pathname.split('/shorts/')[1].split('?')[0];
                    } else {
                        vid = u.searchParams.get('v');
                    }
                    if (vid) {
                        vid = vid.split('&')[0].split('#')[0].trim();
                        // Validate video ID format
                        if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
                            // Get origin for YouTube API compliance
                            const origin = window.location.origin || window.location.protocol + '//' + window.location.host;
                            // Embed URL with origin parameter for API compliance
                            const embedUrl = `https://www.youtube.com/embed/${vid}?rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`;
                            // Add referrerpolicy to ensure Referer header is sent (required by YouTube API)
                            // Remove min-width/min-height from iframe to allow full responsive behavior
                            return `<div class="video-wrapper" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;width:100%;background:#000;border-radius:12px;margin-bottom:24px;"><iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;" loading="lazy"></iframe></div>`;
                        }
                    }
                }
            } catch (err) {
                console.error('[Frontend] Error parsing embed URL:', url, err);
            }
            return '';
        }
        
        if (item.embed_url) {
            const embedHtml = getEmbedLarge(item.embed_url);
            if (embedHtml) q('#post-embed').innerHTML = embedHtml;
        }
        
        applyBackgroundFromSettings('about', settings);
    } else if (page === 'blog') {
      const params = new URLSearchParams(location.search);
      const pageNum = Number(params.get('page') || '1');
      const data = await fetchJson(`/api/public/posts?page=${pageNum}&limit=9`);
      const gridWrap = q('#post-list');
      const tpl = q('#post-item-tpl');
      const target = q('[data-target="list"]', gridWrap);
      target.innerHTML = '';
      data.items.forEach(item => {
        const node = document.importNode(tpl.content, true);
        qa('[data-prop]', node).forEach(el => {
          const [attr, path] = el.getAttribute('data-prop').split(':');
          let value;
          if (path === 'title') value = item.title;
          else if (path === 'excerpt') value = item.excerpt || '';
          else if (path === 'cover_url') value = item.cover_url || '';
          else if (path === 'link') value = `/blog-post.html?slug=${encodeURIComponent(item.slug)}`;
          if (attr === 'text') el.textContent = value;
          else el.setAttribute(attr, value);
        });
        target.appendChild(node);
      });
      // pager
      const pager = q('#pager');
      const totalPages = Math.ceil(data.total / data.limit);
      pager.innerHTML = '';
      for (let i = 1; i <= totalPages; i++) {
        const a = document.createElement('a');
        a.href = `?page=${i}`;
        a.textContent = i;
        a.style.marginRight = '8px';
        if (i === data.page) a.style.fontWeight = '700';
        pager.appendChild(a);
      }
      applyBackgroundFromSettings('blog', settings);
    } else if (page === 'blog-post') {
      const slug = getQueryParam('slug');
      const post = await fetchJson(`/api/public/posts/${encodeURIComponent(slug)}`);
      q('#post-title').textContent = post.title;
      q('#post-content').innerHTML = post.content_html;
      applyBackgroundFromSettings('blog_post', settings);
    } else if (page === 'news') {
      const params = new URLSearchParams(location.search);
      const pageNum = Number(params.get('page') || '1');
      const data = await fetchJson(`/api/public/news?page=${pageNum}&limit=9`);
      const gridWrap = q('#news-list');
      const tpl = q('#news-list-item-tpl');
      const target = q('[data-target="list"]', gridWrap);
      target.innerHTML = '';
      data.items.forEach(item => {
        const node = document.importNode(tpl.content, true);
        qa('[data-prop]', node).forEach(el => {
          const [attr, path] = el.getAttribute('data-prop').split(':');
          let value;
          if (path === 'title') value = item.title;
          else if (path === 'excerpt') value = item.excerpt || '';
          else if (path === 'cover_url') value = item.cover_url || '';
          else if (path === 'link') value = `/news-post.html?slug=${encodeURIComponent(item.slug)}`;
          if (attr === 'text') el.textContent = value ?? '';
          else el.setAttribute(attr, value ?? '');
        });
        target.appendChild(node);
      });
      const pager = q('#pager');
      if (pager) {
        const totalPages = Math.ceil(data.total / data.limit);
        pager.innerHTML = '';
        if (totalPages > 1) {
          for (let i = 1; i <= totalPages; i++) {
            const a = document.createElement('a');
            a.href = `?page=${i}`;
            a.textContent = i;
            if (i === data.page) {
              a.style.background = '#0066cc';
              a.style.color = '#fff';
            }
            pager.appendChild(a);
          }
        }
      }
      applyBackgroundFromSettings('news', settings);
    } else if (page === 'news-post') {
      const slug = getQueryParam('slug');
      const item = await fetchJson(`/api/public/news/${encodeURIComponent(slug)}`);
      q('#news-title').textContent = item.title;
      q('#news-content').innerHTML = item.content_html;
      applyBackgroundFromSettings('news_post', settings);
    } else if (page === 'leaderboard') {
      async function load() {
        const rows = await fetchJson('/api/public/leaderboard');
        const target = q('#leaderboard-list');
        const tpl = q('#leaderboard-item-tpl');
        target.innerHTML = '';
        rows.forEach(item => {
          const node = document.importNode(tpl.content, true);
          qa('[data-prop]', node).forEach(el => {
            const [attr, path] = el.getAttribute('data-prop').split(':');
            let value;
            if (path === 'title') value = item.title;
            else if (path === 'excerpt') value = item.excerpt || '';
            else if (path === 'cover_url') value = item.cover_url || '';
            else if (path === 'link') value = `/leader.html?slug=${encodeURIComponent(item.slug)}`;
            if (attr === 'text') el.textContent = value ?? '';
            else el.setAttribute(attr, value ?? '#');
          });
          target.appendChild(node);
        });
      }
      await load();
      applyBackgroundFromSettings('leaderboard', settings);
    } else if (page === 'leader') {
      const slug = getQueryParam('slug');
      const item = await fetchJson(`/api/public/leaderboard/${encodeURIComponent(slug)}`);
      const cover = q('#leader-cover'); if (cover && item.cover_url) cover.src = item.cover_url;
      q('#leader-title').textContent = item.title || '';
      q('#leader-content').innerHTML = item.content_html || '';
      applyBackgroundFromSettings('leaderboard', settings);
    } else if (page === 'plans') {
      const perPage = 15;
      const params = new URLSearchParams(location.search);
      const currentPage = Math.max(1, Number(params.get('page') || 1));
      const rows = await fetchJson('/api/public/plans');
      const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
      const tpl = q('#plan-item-tpl');
      const target = q('#plans-list');
      const pager = q('#plans-pager');
      target.innerHTML = '';
      const safePage = Math.min(currentPage, totalPages);
      const paged = rows.slice((safePage - 1) * perPage, safePage * perPage);
      paged.forEach(p => {
        const node = document.importNode(tpl.content, true);
        const slug = (p.slug || '').trim();
        const detailHref = slug ? `/plan.html?slug=${encodeURIComponent(slug)}` : `/plan.html?id=${encodeURIComponent(p.id)}`;
        qa('[data-prop]', node).forEach(el => {
          const [attr, path] = el.getAttribute('data-prop').split(':');
          let value;
          if (path === 'preview') {
            const plain = (p.content_html || '').replace(/<[^>]+>/g, '').trim();
            value = plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
            if (attr === 'text') { el.textContent = value; return; }
          }
          if (attr === 'text' && path === 'price') value = `$${Number(p.price).toFixed(2)}`;
          else if (path === 'link') value = detailHref;
          else value = p[path];
          if (attr === 'text') el.textContent = value ?? '';
          else el.setAttribute(attr, value ?? '');
        });
        target.appendChild(node);
      });
      if (pager) {
        pager.innerHTML = '';
        for (let i = 1; i <= totalPages; i += 1) {
          const a = document.createElement('a');
          a.href = `?page=${i}`;
          a.textContent = i;
        if (i === safePage) a.classList.add('active-page');
          pager.appendChild(a);
        }
      }
      applyBackgroundFromSettings('plans', settings);
    } else if (page === 'plan') {
      const slug = getQueryParam('slug');
      const id = getQueryParam('id');
      const lookupValue = slug || id;
      if (!lookupValue) return;
      const url = slug
        ? `/api/public/plans/${encodeURIComponent(slug)}`
        : `/api/public/plans/${encodeURIComponent(id)}?by_id=1`;
      const p = await fetchJson(url);
      const cover = q('#plan-cover'); if (cover && p.cover_url) cover.src = p.cover_url;
      q('#plan-name').textContent = p.name || '';
      q('#plan-tagline').textContent = p.tagline || '';
      q('#plan-price').textContent = p.price != null ? `$${Number(p.price).toFixed(2)}` : '';
      q('#plan-content').innerHTML = p.content_html || '';
      applyBackgroundFromSettings('plans', settings);
    } else if (page === 'user') {
      // Slightly wider and larger text for dashboard readability
      const main = document.querySelector('main.container');
      if (main) main.style.maxWidth = '1200px';
      document.documentElement.style.fontSize = '17px';
      // Blank background for user center
      document.body.style.backgroundImage = 'none';
      document.body.style.background = '#fff';
    } else if (page === 'trial') {
      const rows = await fetchJson('/api/public/trial');
      const list = q('#trial-list');
      list.innerHTML = '';
      function toYouTubeEmbed(url) {
        try {
          const u = new URL(url, location.origin);
          const host = (u.hostname || '').replace(/^m\./, '');
          const base = 'https://www.youtube-nocookie.com';
          if (u.pathname.startsWith('/embed/') && (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com'))) {
            return url;
          }
          if (host === 'youtu.be') {
            const id = u.pathname.replace(/^\//, '').split('/')[0];
            return id ? `${base}/embed/${id}?rel=0&modestbranding=1` : url;
          }
          if (host.endsWith('youtube.com')) {
            if (u.pathname.startsWith('/shorts/')) {
              const id = u.pathname.split('/')[2];
              return id ? `${base}/embed/${id}?rel=0&modestbranding=1` : url;
            }
            if (u.pathname.startsWith('/live/')) {
              const id = u.pathname.split('/')[2];
              return id ? `${base}/embed/${id}?rel=0&modestbranding=1` : url;
            }
          const playlistId = u.searchParams.get('list');
          const videoId = u.searchParams.get('v');
          if (playlistId && !videoId) return `${base}/embed/videoseries?list=${encodeURIComponent(playlistId)}`;
          if (videoId) return `${base}/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`;
          }
        } catch {}
        return url;
      }
      rows.forEach(it => {
        const card = document.createElement('div');
        card.className = 'card trial-card';
        const title = document.createElement('h3');
        title.className = 'trial-title';
        title.textContent = it.title || '';
        const desc = document.createElement('div');
        desc.className = 'trial-desc';
        if (it.type === 'video' && it.video_url) {
          const src = toYouTubeEmbed(it.video_url);
          const wrapper = document.createElement('div');
          wrapper.className = 'video-embed';
          const iframe = document.createElement('iframe');
          iframe.src = src;
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
          iframe.allowFullscreen = true;
          iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          wrapper.appendChild(iframe);
          const fallback = document.createElement('p');
          fallback.style.marginTop = '10px';
          fallback.style.fontSize = '0.9rem';
          fallback.style.color = '#6b7280';
          fallback.innerHTML = `若影片無法播放，<a href="${it.video_url}" target="_blank" rel="noopener">點此開啟 YouTube</a>`;
          desc.appendChild(wrapper);
          desc.appendChild(fallback);
        } else {
          desc.innerHTML = it.content_html || '';
        }
        card.appendChild(title);
        card.appendChild(desc);
        list.appendChild(card);
      });
      applyBackgroundFromSettings('trial', settings);
    } else if (page === 'service-sales') {
      // 商品列表頁
      const categoryFilter = q('#category-filter');
      const productsGrid = q('#products-grid');
      const cardTpl = q('#product-card-tpl');
      
      async function loadCategories() {
        try {
          const categories = await fetchJson('/api/public/product-categories');
          if (categoryFilter) {
            categories.forEach(cat => {
              const option = document.createElement('option');
              option.value = cat.id;
              option.textContent = cat.name;
              categoryFilter.appendChild(option);
            });
          }
        } catch (err) {
          console.error('[Frontend] Error loading categories:', err);
        }
      }
      
      let currentPage = 1;
      let currentCategoryId = null;
      
      async function loadProducts(categoryId = null, page = 1) {
        try {
          currentCategoryId = categoryId;
          currentPage = page;
          const url = categoryId 
            ? `/api/public/products?category_id=${categoryId}&page=${page}` 
            : `/api/public/products?page=${page}`;
          const data = await fetchJson(url);
          console.log('[Frontend] Loaded products data:', data);
          
          if (!productsGrid) {
            console.error('[Frontend] productsGrid not found!');
            return;
          }
          
          if (!cardTpl) {
            console.error('[Frontend] cardTpl not found!');
            productsGrid.innerHTML = '<p style="text-align:center;color:#c00;padding:40px;">模板未找到</p>';
            return;
          }
          
          productsGrid.innerHTML = '';
          
          const products = data.items || [];
          if (products && Array.isArray(products) && products.length > 0) {
            console.log('[Frontend] Rendering', products.length, 'products');
            products.forEach((product, index) => {
              try {
                const node = document.importNode(cardTpl.content, true);
                const card = node.querySelector('.product-card');
                
                if (!card) {
                  console.error('[Frontend] Card element not found in template');
                  return;
                }
                
                // Set onclick to navigate to product detail
                card.addEventListener('click', () => {
                  location.href = `/product-detail.html?slug=${encodeURIComponent(product.slug)}`;
                });
                
                // Fill in data
                qa('[data-prop]', node).forEach(el => {
                  const propAttr = el.getAttribute('data-prop');
                  if (!propAttr) return;
                  
                  const [attr, path] = propAttr.split(':');
                  if (!path) return;
                  
                  let value = path.split('.').reduce((o, k) => {
                    if (o && typeof o === 'object') {
                      return o[k];
                    }
                    return undefined;
                  }, product);
                  
                  if (path === 'price') {
                    value = Number(value || 0).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                  }
                  
                  if (attr === 'text') {
                    if (el.tagName === 'SPAN' && el.parentElement) {
                      el.textContent = value ?? '';
                    } else {
                      el.textContent = value ?? '';
                    }
                  } else if (attr === 'src') {
                    el.src = value || '';
                    if (!value) {
                      el.style.display = 'none';
                    }
                  } else if (attr === 'onclick') {
                    // Already handled above with addEventListener
                  } else {
                    el.setAttribute(attr, value ?? '');
                  }
                });
                
                productsGrid.appendChild(node);
                console.log('[Frontend] Product', index, 'rendered:', product.name);
              } catch (err) {
                console.error('[Frontend] Error rendering product', index, ':', err, product);
              }
            });
            
            // Render pager
            renderPager(data.page, data.totalPages);
          } else {
            console.log('[Frontend] No products to display');
            productsGrid.innerHTML = '<p style="text-align:center;color:#666;padding:40px;">目前沒有商品</p>';
            const pager = q('#products-pager');
            if (pager) pager.innerHTML = '';
          }
        } catch (err) {
          console.error('[Frontend] Error loading products:', err);
          if (productsGrid) {
            productsGrid.innerHTML = '<p style="text-align:center;color:#c00;padding:40px;">載入商品失敗，請稍後再試</p>';
          }
        }
      }
      
      function renderPager(currentPage, totalPages) {
        const pager = q('#products-pager');
        if (!pager) return;
        
        if (totalPages <= 1) {
          pager.innerHTML = '';
          return;
        }
        
        pager.innerHTML = '';
        
        // Previous button
        if (currentPage > 1) {
          const prev = document.createElement('a');
          prev.href = '#';
          prev.className = 'btn ghost';
          prev.textContent = '上一頁';
          prev.addEventListener('click', (e) => {
            e.preventDefault();
            loadProducts(currentCategoryId, currentPage - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
          pager.appendChild(prev);
        }
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
          const a = document.createElement('a');
          a.href = '#';
          a.className = 'btn ghost';
          a.textContent = i;
          a.style.padding = '8px 12px';
          a.style.margin = '0 4px';
          if (i === currentPage) {
            a.style.background = '#111827';
            a.style.color = '#fff';
          }
          a.addEventListener('click', (e) => {
            e.preventDefault();
            loadProducts(currentCategoryId, i);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
          pager.appendChild(a);
        }
        
        // Next button
        if (currentPage < totalPages) {
          const next = document.createElement('a');
          next.href = '#';
          next.className = 'btn ghost';
          next.textContent = '下一頁';
          next.addEventListener('click', (e) => {
            e.preventDefault();
            loadProducts(currentCategoryId, currentPage + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
          pager.appendChild(next);
        }
      }
      
      if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
          const categoryId = e.target.value || null;
          loadProducts(categoryId, 1); // Reset to page 1 when category changes
        });
      }
      
      await loadCategories();
      await loadProducts(null, 1);
      
      applyBackgroundFromSettings('service-sales', settings);
    } else if (page === 'product-detail') {
      // 商品詳情頁
      const slug = getQueryParam('slug');
      if (!slug) {
        console.error('[Frontend] No slug provided');
        return;
      }
      
      // Setup contact button (購買請電洽)
      const contactBtn = q('#contact-buy-btn');
      if (contactBtn) {
        // Detect if mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                        (window.innerWidth <= 768 && 'ontouchstart' in window);
        
        if (isMobile) {
          // Mobile: Use tel: link
          contactBtn.href = 'tel:039964996';
          contactBtn.addEventListener('click', (e) => {
            // Allow default tel: behavior
          });
        } else {
          // Desktop/Tablet: Jump to LINE
          // Get LINE URL from settings or use default
          const lineFloat = q('#line-float');
          const lineUrl = lineFloat ? lineFloat.href : 'https://line.me/R/ti/p/@guchaumusic';
          contactBtn.href = lineUrl;
          contactBtn.target = '_blank';
          contactBtn.rel = 'noopener';
        }
      }
      
      try {
        const product = await fetchJson(`/api/public/products/${encodeURIComponent(slug)}`);
        
        // Set page title
        if (q('#product-title')) q('#product-title').textContent = product.name || '商品詳情';
        
        // Set product name
        if (q('#product-name')) q('#product-name').textContent = product.name || '';
        
        // Set category
        if (q('#product-category')) {
          q('#product-category').textContent = product.category_name ? `類別：${product.category_name}` : '';
        }
        
        // Set price
        if (q('#product-price')) {
          q('#product-price').textContent = Number(product.price || 0).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }
        
        // Set description
        if (q('#product-description')) {
          q('#product-description').innerHTML = product.description_html || '';
        }
        
        // Set images
        const mainImage = q('#product-main-image');
        const thumbnails = q('#product-thumbnails');
        const images = product.images || [];
        
        if (images.length > 0) {
          // Set main image
          if (mainImage) {
            mainImage.src = images[0].file_path || '';
            mainImage.style.display = 'block';
          }
          
          // Set thumbnails
          if (thumbnails) {
            thumbnails.innerHTML = '';
            images.forEach((img, index) => {
              const thumb = document.createElement('img');
              thumb.className = 'product-thumbnail' + (index === 0 ? ' active' : '');
              thumb.src = img.file_path || '';
              thumb.alt = img.file_name || '';
              thumb.onclick = () => {
                if (mainImage) {
                  mainImage.src = img.file_path || '';
                }
                qa('.product-thumbnail', thumbnails).forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
              };
              thumbnails.appendChild(thumb);
            });
          }
        } else if (product.cover_url) {
          // Use cover image if no product images
          if (mainImage) {
            mainImage.src = product.cover_url;
            mainImage.style.display = 'block';
          }
        }
        
        applyBackgroundFromSettings('product-detail', settings);
      } catch (err) {
        console.error('[Frontend] Error loading product:', err);
      }
    } else if (page === 'booking') {
      // 預約報名系統（前台）
      let currentDate = new Date();
      let currentYear = currentDate.getFullYear();
      let currentMonth = currentDate.getMonth();
      
      const calendarEl = q('#calendar');
      const monthLabel = q('#current-month');
      const prevBtn = q('#prev-month');
      const nextBtn = q('#next-month');
      const eventModal = q('#event-detail-modal');
      const closeModalBtn = q('#close-event-modal');
      const eventListEl = q('#event-list');
      const eventDateLabel = q('#event-detail-date');
      
      if (!calendarEl) {
        console.error('[Frontend] Calendar element not found');
        return;
      }
      
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      const typeNames = { course: '音樂課程', performance: '商業演出', space: '共享空間租借' };
      const typeColors = { course: '#4A90E2', performance: '#E94B3C', space: '#7B68EE' };
      
      function renderCalendar() {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        
        calendarEl.innerHTML = '';
        
        // Day headers
        dayNames.forEach(day => {
          const header = document.createElement('div');
          header.className = 'calendar-day-header';
          header.textContent = day;
          calendarEl.appendChild(header);
        });
        
        // Load events for this month
        loadEventsForMonth().then(eventsByDate => {
          const currentDate = new Date(startDate);
          for (let i = 0; i < 42; i++) {
            const dayEl = document.createElement('div');
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const isCurrentMonth = currentDate.getMonth() === currentMonth;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const dayEvents = eventsByDate[dateStr] || [];
            
            dayEl.className = 'calendar-day';
            if (!isCurrentMonth) dayEl.classList.add('other-month');
            if (isToday) dayEl.classList.add('today');
            
            dayEl.innerHTML = `
              <div class="calendar-day-number">${currentDate.getDate()}</div>
              <div class="calendar-day-events">
                ${dayEvents.slice(0, 3).map(e => {
                  return `<div style="display:flex;align-items:center;gap:2px;"><span class="event-dot ${e.event_type}"></span><span style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.title}</span></div>`;
                }).join('')}
                ${dayEvents.length > 3 ? `<div style="font-size:10px;color:#666;">+${dayEvents.length - 3} 更多</div>` : ''}
              </div>
            `;
            
            if (isCurrentMonth && dayEvents.length > 0) {
              dayEl.style.cursor = 'pointer';
              dayEl.addEventListener('click', async () => {
                // 重新載入該日期的活動以獲取最新的報名狀態
                try {
                  const dateEvents = await fetchJson(`/api/public/events?date=${dateStr}`);
                  showEventDetail(dateStr, dateEvents);
                } catch (err) {
                  console.error('Error loading event details:', err);
                  showEventDetail(dateStr, dayEvents);
                }
              });
            }
            
            calendarEl.appendChild(dayEl);
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }).catch(err => {
          console.error('[Frontend] Failed to render calendar:', err);
          // Show error message but keep calendar structure
          if (calendarEl) {
            const errorMsg = document.createElement('div');
            errorMsg.style.gridColumn = '1/-1';
            errorMsg.style.textAlign = 'center';
            errorMsg.style.padding = '40px';
            errorMsg.style.color = '#666';
            errorMsg.textContent = '載入月曆時發生錯誤，請重新整理頁面';
            calendarEl.appendChild(errorMsg);
          }
        });
        
        if (monthLabel) {
          monthLabel.textContent = `${currentYear}年 ${currentMonth + 1}月`;
        }
      }
      
      async function loadEventsForMonth() {
        try {
          const events = await fetchJson(`/api/public/events?year=${currentYear}&month=${currentMonth + 1}`);
          if (!Array.isArray(events)) {
            console.warn('[Frontend] Events API returned non-array:', events);
            return {};
          }
          const eventsByDate = {};
          events.forEach(e => {
            if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = [];
            eventsByDate[e.event_date].push(e);
          });
          return eventsByDate;
        } catch (err) {
          console.error('[Frontend] Error loading events:', err);
          // Don't clear calendar on error, just show empty state
          return {};
        }
      }
      
      async function showEventDetail(dateStr, events) {
        if (!eventModal || !eventListEl || !eventDateLabel) return;
        
        const date = new Date(dateStr);
        eventDateLabel.textContent = `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日`;
        eventListEl.innerHTML = '';
        
        // 檢查會員登入狀態和報名狀態
        let me = null;
        try {
          me = await fetchJson('/api/public/members/me');
        } catch (err) {
          // 未登入，繼續顯示
        }
        
        events.forEach(event => {
          const isRegistered = event.is_registered === 1 || event.is_registered === true;
          const registrationStatus = event.registration_status || 'interested';
          
          const item = document.createElement('div');
          item.className = 'event-item';
          
          let buttonHtml = '';
          if (!me || !me.id) {
            // 未登入
            buttonHtml = '<button class="btn interested-btn" data-event-id="' + event.id + '" data-event-title="' + (event.title || '') + '">有興趣參加</button>';
          } else if (isRegistered) {
            // 已報名
            const statusText = {
              'interested': '已報名',
              'contacted': '已聯繫',
              'confirmed': '已確認',
              'cancelled': '已取消',
              'pending': '待處理'
            }[registrationStatus] || '已報名';
            buttonHtml = '<button class="btn" disabled style="background:#10b981;color:#fff;cursor:not-allowed;">' + statusText + ' ✓</button>';
          } else {
            // 未報名
            buttonHtml = '<button class="btn interested-btn" data-event-id="' + event.id + '" data-event-title="' + (event.title || '') + '">有興趣參加</button>';
          }
          
          item.innerHTML = `
            <div class="event-item-header">
              <div>
                <span class="event-type-badge ${event.event_type}">${typeNames[event.event_type] || event.event_type}</span>
                <h3 style="margin:8px 0 4px 0;font-size:18px;">${event.title}</h3>
              </div>
            </div>
            ${event.start_time || event.end_time ? `<div class="event-time">時間：${event.start_time || ''} ${event.end_time ? '-' + event.end_time : ''}</div>` : ''}
            ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
            ${event.max_participants ? `<div style="margin-top:8px;color:#666;font-size:14px;">最多 ${event.max_participants} 人</div>` : ''}
            ${buttonHtml}
          `;
          eventListEl.appendChild(item);
        });
        
        eventModal.classList.add('open');
      }
      
      prevBtn?.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
          currentMonth = 11;
          currentYear--;
        }
        renderCalendar();
      });
      
      nextBtn?.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }
        renderCalendar();
      });
      
      closeModalBtn?.addEventListener('click', () => {
        eventModal.classList.remove('open');
      });
      
      eventModal?.addEventListener('click', (e) => {
        if (e.target === eventModal) {
          eventModal.classList.remove('open');
        }
      });
      
      // Handle "有興趣參加" button clicks
      eventListEl?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.interested-btn');
        if (!btn) return;
        
        const eventId = btn.dataset.eventId;
        const eventTitle = btn.dataset.eventTitle;
        
        // Check if user is logged in
        try {
          const me = await fetchJson('/api/public/members/me');
          if (!me || !me.id) {
            alert('請先登入會員才能報名活動');
            location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname);
            return;
          }
        } catch (err) {
          alert('請先登入會員才能報名活動');
          location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname);
          return;
        }
        
        // Register interest
        try {
          btn.disabled = true;
          btn.textContent = '報名中...';
          
          // Get CSRF token
          const { csrfToken } = await fetchJson('/api/public/csrf');
          
          const res = await fetch(`/api/public/events/${eventId}/register`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'CSRF-Token': csrfToken
            },
            credentials: 'same-origin'
          });
          const data = await res.json();
          
          if (res.ok && data.ok) {
            btn.textContent = '已報名 ✓';
            btn.style.background = '#10b981';
            btn.style.color = '#fff';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;
            btn.classList.remove('interested-btn'); // 移除類別，防止再次點擊
            alert('報名成功！工作人員將與您聯繫確認。');
            // 重新載入該日期的活動以更新狀態
            const dateStr = new Date(eventDateLabel.textContent.replace(/年|月/g, '/').replace(/日/g, '')).toISOString().split('T')[0];
            try {
              const dateEvents = await fetchJson(`/api/public/events?date=${dateStr}`);
              showEventDetail(dateStr, dateEvents);
            } catch (err) {
              console.error('Error reloading events:', err);
            }
          } else {
            throw new Error(data.error || '報名失敗');
          }
        } catch (err) {
          alert('報名失敗：' + (err.message || '未知錯誤'));
          btn.disabled = false;
          btn.textContent = '有興趣參加';
        }
      });
      
      renderCalendar();
      applyBackgroundFromSettings('booking', settings);
    } else if (page === 'contact') {
      const form = q('#contact-form');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        const { csrfToken } = await fetchJson('/api/public/csrf');
        const res = await fetch('/api/public/contact', { method:'POST', headers:{ 'Content-Type':'application/json','CSRF-Token': csrfToken }, body: JSON.stringify(data) });
        const msg = q('#contact-msg');
        msg.textContent = res.ok ? '已送出' : '送出失敗';
        if (res.ok) form.reset();
      });
      applyBackgroundFromSettings('contact', settings);
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
