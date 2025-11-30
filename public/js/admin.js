(() => {
  async function getCsrf() {
    const res = await fetch('/api/public/csrf');
    const j = await res.json();
    return j.csrfToken;
  }

  // handle delete of member uploaded files from expanded view
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-file-del]');
    if (!btn) return;
    e.preventDefault();
    const mid = btn.getAttribute('data-mid');
    const name = btn.getAttribute('data-name');
    if (!mid || !name) return;
    if (!confirm('確定刪除此檔案？')) return;
    await api('DELETE', `/api/admin/members/${mid}/files/${name}`);
    // reload that member's files list (without collapsing)
    const tbody = document.querySelector('#members-table')?.querySelector('tbody');
    const detailRow = tbody && tbody.querySelector(`tr[data-detail-for="${mid}"]`);
    if (detailRow) {
      const filesBox = detailRow.querySelector('[data-files-box]');
      if (filesBox) {
        const files = await api('GET', `/api/admin/members/${mid}/files`);
        filesBox.innerHTML = (files.items||[]).map(f=>
          `<span class="chip">
            <a class="btn ghost" href="${f.url}" download>${f.name}</a>
            <button class="btn ghost" data-file-del data-name="${encodeURIComponent(f.name)}" data-mid="${mid}" style="color:#c00;border-color:#fecaca;">刪除</button>
          </span>`
        ).join('') || '—';
      }
    }
  });

  async function api(method, url, data) {
    const headers = {};
    const options = { method, headers, credentials: 'same-origin' };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['CSRF-Token'] = await getCsrf();
      options.body = JSON.stringify(data || {});
    } else {
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma'] = 'no-cache';
    }
    let res = await fetch(url, options);
    if (res.status === 304) {
      res = await fetch(url, { ...options, cache: 'no-store' });
    }
    if (!res.ok) throw new Error(await res.text());
    return res.headers.get('content-type')?.includes('application/json') ? res.json() : res.text();
  }

  async function guard() {
    const page = getPage();
    if (page === 'login.html') return null;
    const res = await fetch('/api/admin/me');
    const me = await res.json();
    if ((!me || !me.id) && page !== 'login.html') location.href = '/admin/login.html';
    if (me && me.must_change_password && page !== 'change-password.html') {
      location.href = '/admin/change-password.html';
    }
    // 非 admin 的 editor：隱藏使用者管理，且若直接進入 users.html 則導回首頁
    if (me && me.role === 'editor') {
      const usersLink = document.querySelector('a[href="/admin/users.html"]');
      if (usersLink) usersLink.style.display = 'none';
      if (page === 'users.html') location.href = '/admin/index.html';
    }
    return me || null;
  }

  async function injectAdminHeader() {
    const page = getPage();
    if (page === 'login.html') return;
    const host = document.getElementById('admin-header');
    if (!host) return;
    try {
      const res = await fetch('/admin/_layout.html');
      host.innerHTML = await res.text();
    } catch {}
    bindLogout();
  }

  function getPage() {
    const p = location.pathname.split('/').pop();
    return p;
  }

  // SETTINGS
  function normalizeLineUrl(value) {
    const raw = String(value || '');
    if (!raw.trim()) return '';
    let clean = raw.replace(/^@+/, '').trim();
    if (!clean) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(clean)) {
      clean = `https://${clean.replace(/^\/+/, '')}`;
    }
    return clean;
  }

  async function initSettings() {
    const settings = await api('GET', '/api/admin/settings');
    const dict = Object.fromEntries(settings.map(s => [s.key, s.value]));
    const site = document.getElementById('site_name');
    const line = document.getElementById('line_url');
    const bg = document.getElementById('default_bg_color');
    const themeSelect = document.getElementById('theme_selector');
    if (site) site.value = dict.site_name || '';
    if (line) line.value = normalizeLineUrl(dict.line_url);
    if (themeSelect) themeSelect.value = dict.theme || 'default';
    if (bg) bg.value = dict.default_bg_color || '#f7f7f7';
    // Per-page BG URLs
    const keys = [
      'bg_home_url','bg_news_url','bg_news_post_url','bg_contact_url','bg_about_url'
    ];
    keys.forEach(k => { const el = document.getElementById(k); if (el) el.value = dict[k] || ''; });
    document.getElementById('save-settings')?.addEventListener('click', async () => {
      const payload = {
        site_name: site.value,
        line_url: normalizeLineUrl(line.value),
        default_bg_color: bg.value,
        theme: themeSelect?.value || 'default'
      };
      keys.forEach(k => payload[k] = document.getElementById(k)?.value || '');
      await api('POST', '/api/admin/settings', payload);
      alert('已儲存');
    });

    // Media picker for background fields
    const picker = document.getElementById('picker');
    const pickerGrid = document.getElementById('picker-grid');
    const pickerPager = document.getElementById('picker-pager');
    let targetInputId = null;
    const uploadInput = document.getElementById('bg-upload-file');

    async function loadMedia(page=1) {
      const data = await api('GET', `/api/admin/media?page=${page}&limit=24`);
      pickerGrid.innerHTML = '';
      data.items.forEach(it => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '0';
        card.style.overflow = 'hidden';
        card.style.border = '1px solid #e5e7eb';
        card.style.borderRadius = '12px';
        card.innerHTML = `
          <img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;font-size:12px;color:#374151;gap:8px;">
            <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.file_name}</span>
            <div style="display:flex;gap:6px;">
              <button class="btn ghost" data-action="pick" data-id="${it.id}">選擇</button>
              <button class="btn ghost" data-action="usage" data-id="${it.id}">詳情</button>
              <button class="btn ghost" data-action="del" data-id="${it.id}" style="color:#c00;border-color:#fecaca;">刪除</button>
            </div>
          </div>`;
        pickerGrid.appendChild(card);
      });
      // pager
      pickerPager.innerHTML = '';
      const totalPages = Math.ceil(data.total / data.limit);
      for (let i=1;i<=totalPages;i++) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = i;
        a.className = 'btn ghost';
        a.style.padding = '6px 10px';
        a.style.borderRadius = '8px';
        if (i === data.page) a.style.background = '#111827', a.style.color = '#fff';
        a.addEventListener('click', (e) => { e.preventDefault(); loadMedia(i); });
        pickerPager.appendChild(a);
      }
    }

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (!btn) return;
        e.preventDefault();
        targetInputId = btn.getAttribute('data-pick');
        picker.style.display = 'block';
        loadMedia(1);
    });
    // picker actions: pick or delete
    pickerGrid?.addEventListener('click', async (e) => {
      const pickBtn = e.target.closest('button[data-action="pick"]');
      const delBtn = e.target.closest('button[data-action="del"]');
      const usageBtn = e.target.closest('button[data-action="usage"]');
      if (!pickBtn && !delBtn && !usageBtn) return;
      e.preventDefault();
      const id = Number((pickBtn||delBtn||usageBtn).dataset.id);
      if (pickBtn) {
        // set selected file path to target input
        const card = pickBtn.closest('.card');
        const img = card?.querySelector('img');
        if (targetInputId && img?.src) {
          const input = document.getElementById(targetInputId);
          if (input) input.value = img.src.replace(location.origin, '');
        }
        picker.style.display = 'none';
      } else if (usageBtn) {
        const detail = await api('GET', `/api/admin/media/${id}/usage`);
        const lines = [];
        const push = (arr, label) => { if (Array.isArray(arr) && arr.length) lines.push(`${label}: ${arr.map(x=>x.title||x.slug||x.id).join(', ')}`); };
        push(detail.posts, '部落格封面');
        push(detail.news, '最新消息封面');
        push(detail.leaderboard, '傳奇榜封面');
        push(detail.plans, '方案封面');
        push(detail.pages, '頁面背景');
        push(detail.slides, '首頁輪播');
        alert(lines.length ? lines.join('\n') : '此圖片目前未被使用');
      } else if (delBtn) {
        if (!confirm('確定刪除這張圖片？此動作無法復原')) return;
        await api('DELETE', `/api/admin/media/${id}`);
        await loadMedia(1);
      }
    });
    document.getElementById('picker-close')?.addEventListener('click', (e) => { e.preventDefault(); picker.style.display = 'none'; });

    // Direct upload from computer
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-upload]');
      if (!btn) return;
      e.preventDefault();
      targetInputId = btn.getAttribute('data-upload');
      if (!uploadInput) return;
      uploadInput.value = '';
      uploadInput.click();
    });
    uploadInput?.addEventListener('change', async () => {
      if (!uploadInput.files || !uploadInput.files[0]) return;
      const csrf = await getCsrf();
      const fd = new FormData();
      fd.append('file', uploadInput.files[0]);
      const res = await fetch('/api/admin/media/upload', { method: 'POST', headers: { 'CSRF-Token': csrf }, body: fd, credentials: 'same-origin' });
      const j = await res.json();
      if (j && j.path && targetInputId) {
        const input = document.getElementById(targetInputId);
        if (input) input.value = j.path;
      }
    });
  }

  // Shared Logic for Page Editors
  let sharedPickerTarget = null;
  async function loadSharedMedia(page=1, gridId, pagerId, onPick){
      const data = await api('GET', `/api/admin/media?page=${page}&limit=24`);
      const grid = document.getElementById(gridId);
      const pager = document.getElementById(pagerId);
      grid.innerHTML = '';
      data.items.forEach(it => {
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.style.display = 'block'; btn.style.padding = '0'; btn.style.borderRadius = '12px'; btn.style.overflow = 'hidden'; btn.style.border = '1px solid #e5e7eb'; btn.style.background = '#fff';
        btn.innerHTML = `<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style="padding:8px 10px;font-size:12px;color:#374151;">${it.file_name}</div>`;
        btn.addEventListener('click', () => { 
            if (sharedPickerTarget) document.getElementById(sharedPickerTarget).value = it.id || ''; 
            onPick();
        });
        grid.appendChild(btn);
      });
      pager.innerHTML = '';
      const totalPages = Math.ceil(data.total / data.limit);
      for (let i=1;i<=totalPages;i++){
        const a=document.createElement('a'); a.href='#'; a.textContent=i; a.className='btn ghost'; a.style.padding='6px 10px'; a.style.borderRadius='8px'; if (i===data.page){ a.style.background='#111827'; a.style.color='#fff'; }
        a.addEventListener('click',(e)=>{e.preventDefault(); loadSharedMedia(i, gridId, pagerId, onPick);});
        pager.appendChild(a);
      }
  }

  // Helper function to insert image at cursor position in contenteditable
  function insertImageAtCursor(editorEl, imageUrl) {
    if (!editorEl) return;
    
    // Focus the editor to ensure selection is active
    editorEl.focus();
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '8px';
    img.style.margin = '16px 0';
    
    try {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      
      // If there's a valid selection/range, insert at that position
      if (range && range.collapsed === false || range.startContainer) {
        // Delete any selected content
        range.deleteContents();
        // Insert the image
        range.insertNode(img);
        // Move cursor after the image
        range.setStartAfter(img);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // Fallback: try execCommand (works in most browsers)
        if (document.execCommand && document.execCommand('insertImage', false, imageUrl)) {
          // Success
        } else {
          // Last resort: append to end
          editorEl.appendChild(img);
        }
      }
    } catch (err) {
      // If Selection API fails, try execCommand
      try {
        if (document.execCommand && document.execCommand('insertImage', false, imageUrl)) {
          // Success
        } else {
          // Last resort: append to end
          editorEl.appendChild(img);
        }
      } catch (e) {
        // Final fallback: append to end
        editorEl.appendChild(img);
      }
    }
  }

  async function setupPageEditor(prefix, slug, title) {
      // Toolbar binding
      const toolbar = document.querySelector(`#${prefix}-editor`)?.previousElementSibling;
      if (toolbar) {
           toolbar.addEventListener('click', (e) => {
              const btn = e.target.closest('[data-cmd]'); if (!btn) return;
              const cmd = btn.getAttribute('data-cmd'); const value = btn.getAttribute('data-value') || null;
              document.execCommand(cmd, false, value);
            });
      }

      // Insert Image
      async function uploadAndInsert(file, editorEl) {
          const csrf = await getCsrf();
          const fd = new FormData(); fd.append('file', file);
          const res = await fetch('/api/admin/media/upload', { method:'POST', headers: { 'CSRF-Token': csrf }, body: fd, credentials: 'same-origin' });
          const j = await res.json();
          if (j?.path || j?.file_path) {
            const imageUrl = j.path || j.file_path;
            insertImageAtCursor(editorEl, imageUrl);
          }
      }
      document.getElementById(`${prefix}-insert-img`)?.addEventListener('click', () => document.getElementById(`${prefix}-file`).click());
      document.getElementById(`${prefix}-file`)?.addEventListener('change', (e) => e.target.files[0] && uploadAndInsert(e.target.files[0], document.getElementById(`${prefix}-editor`)));

      // BG Picker & Upload
      const picker = document.getElementById('about-picker'); // Assuming reusing 'about-picker' ID in generic way or similar
      if (picker) {
          document.getElementById(`${prefix}-bg-pick`)?.addEventListener('click', () => { 
              sharedPickerTarget = `${prefix}-bg`; 
              picker.style.display='block'; 
              loadSharedMedia(1, 'about-picker-grid', 'about-picker-pager', () => { picker.style.display='none'; });
          });
          document.getElementById(`${prefix}-bg-upload`)?.addEventListener('click', () => document.getElementById(`${prefix}-bg-file`).click());
          document.getElementById(`${prefix}-bg-file`)?.addEventListener('change', async (e) => {
              if (!e.target.files[0]) return;
              const csrf = await getCsrf();
              const fd = new FormData(); fd.append('file', e.target.files[0]);
              const res = await fetch('/api/admin/media/upload', { method:'POST', headers: { 'CSRF-Token': csrf }, body: fd, credentials: 'same-origin' });
              const j = await res.json();
              if (j?.media_id) document.getElementById(`${prefix}-bg`).value = j.media_id;
          });
      }

      // Load Data
      try {
           const data = await api('GET', `/api/admin/pages/${slug}`);
           if (data) {
               const editor = document.getElementById(`${prefix}-editor`);
               const bg = document.getElementById(`${prefix}-bg`);
               if (editor) editor.innerHTML = data.content_html || '';
               if (bg) bg.value = data.background_image_id || '';
           }
      } catch {}
      
      // Save
      document.getElementById(`${prefix}-save`)?.addEventListener('click', async () => {
           await api('POST', '/api/admin/pages', { 
               slug: slug, 
               title: title, 
               content_html: document.getElementById(`${prefix}-editor`).innerHTML, 
               background_image_id: document.getElementById(`${prefix}-bg`).value || null, 
               is_published: 1 
           });
           alert(`已儲存：${title}`);
      });
  }

  async function initAboutEditors() {
      await setupPageEditor('guchau', 'about-guchau', '關於鼓潮');
      await setupPageEditor('story', 'about-story', '品牌故事');
      await setupPageEditor('history', 'about-history', '鼓潮音樂歷程');
      
      // Common picker close
      document.getElementById('about-picker-close')?.addEventListener('click', (e)=>{e.preventDefault(); document.getElementById('about-picker').style.display='none';});
  }

  async function initServicesEditors() {
      await setupPageEditor('scourses', 'service-courses', '音樂課程');
      await setupPageEditor('scommercial', 'service-commercial', '商業演出');
      // Note: 'service-sales' (樂器販售) is now managed separately in /admin/products.html
      await setupPageEditor('sspace', 'service-space', '共享與藝術空間');
      await setupPageEditor('stourism', 'service-tourism', '音樂觀光體驗');
      
      document.getElementById('about-picker-close')?.addEventListener('click', (e)=>{e.preventDefault(); document.getElementById('about-picker').style.display='none';});
  }

  async function initMediaRecordsEditor() {
    const table = document.getElementById('mrecords-table');
    const form = document.getElementById('mrecords-form');
    const editor = document.getElementById('mrecords-editor');
    const toolbar = document.getElementById('mrecords-toolbar');
    if (!table || !form || !editor) return;

    const rows = await api('GET', '/api/admin/media-records');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.id}</td><td>${r.title}</td><td>${r.slug}</td><td>${r.is_published ? '✔' : '—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
      tbody.appendChild(tr);
    });

    toolbar?.addEventListener('click', (e) => { const btn=e.target.closest('[data-cmd]'); if (!btn) return; const cmd=btn.getAttribute('data-cmd'); const val=btn.getAttribute('data-value')||null; document.execCommand(cmd,false,val); });
    document.getElementById('mrecords-insert-img')?.addEventListener('click', ()=> document.getElementById('mrecords-insert-file').click());
    document.getElementById('mrecords-insert-file')?.addEventListener('change', async (e) => { const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.path || j?.file_path) { insertImageAtCursor(editor, j.path || j.file_path); } });

    // picker
    const picker = document.getElementById('mrecords-picker'); const pickerGrid=document.getElementById('mrecords-picker-grid'); const pickerPager=document.getElementById('mrecords-picker-pager');
    async function loadMedia(page=1){ const data=await api('GET', `/api/admin/media?page=${page}&limit=24`); pickerGrid.innerHTML=''; data.items.forEach(it=>{ const btn=document.createElement('button'); btn.className='btn ghost'; btn.style.display='block'; btn.style.padding='0'; btn.style.borderRadius='12px'; btn.style.overflow='hidden'; btn.style.border='1px solid #e5e7eb'; btn.style.background='#fff'; btn.innerHTML=`<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style="padding:8px 10px;font-size:12px;color:#374151;">${it.file_name}</div>`; btn.addEventListener('click',()=>{ document.getElementById('mrecords-cover').value = it.id || ''; picker.style.display='none'; }); pickerGrid.appendChild(btn); }); pickerPager.innerHTML=''; const totalPages=Math.ceil(data.total/data.limit); for(let i=1;i<=totalPages;i++){ const a=document.createElement('a'); a.href='#'; a.textContent=i; a.className='btn ghost'; a.style.padding='6px 10px'; a.style.borderRadius='8px'; if (i===data.page){ a.style.background='#111827'; a.style.color='#fff'; } a.addEventListener('click',(e)=>{e.preventDefault(); loadMedia(i);}); pickerPager.appendChild(a);} }
    document.getElementById('mrecords-picker-close')?.addEventListener('click',(e)=>{e.preventDefault(); picker.style.display='none';});
    document.getElementById('mrecords-cover-pick')?.addEventListener('click',()=>{ picker.style.display='block'; loadMedia(1); });
    document.getElementById('mrecords-cover-upload')?.addEventListener('click',()=> document.getElementById('mrecords-cover-file').click());
    document.getElementById('mrecords-cover-file')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.media_id) document.getElementById('mrecords-cover').value=j.media_id; });

    tbody.addEventListener('click', async (e)=>{
      const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return;
      if (e.target.dataset.edit){ const r=rows.find(x=> String(x.id)===String(id)); if (!r) return;
        form.querySelector('[name="title"]').value=r.title||'';
        form.querySelector('[name="slug"]').value=r.slug||'';
        form.querySelector('[name="excerpt"]').value=r.excerpt||'';
        form.querySelector('[name="embed_url"]').value=r.embed_url||'';
        editor.innerHTML=r.content_html||'';
        document.getElementById('mrecords-cover').value=r.cover_media_id||'';
        // Convert SQL datetime to datetime-local format if needed
        if (r.published_at) {
          const pubDate = r.published_at.replace(' ', 'T').slice(0, 16);
          document.getElementById('mrecords-published').value = pubDate;
        } else {
          document.getElementById('mrecords-published').value = '';
        }
        document.getElementById('mrecords-published-flag').checked=!!r.is_published;
        form.querySelector('[name="id"]').value=r.id;
      } else if (e.target.dataset.del){
        if (!confirm('確定刪除？')) return; await api('DELETE', `/api/admin/media-records/${id}`); location.reload();
      }
    });
    form.addEventListener('submit', async (e)=>{
      e.preventDefault(); 
      const fd=new FormData(form); 
      const data=Object.fromEntries(fd.entries());
      data.content_html=editor.innerHTML;
      data.cover_media_id=document.getElementById('mrecords-cover').value||null;
      // Convert datetime-local to SQL format
      const pubDateInput = document.getElementById('mrecords-published');
      if (pubDateInput && pubDateInput.value) {
        // datetime-local format: YYYY-MM-DDTHH:mm -> SQL format: YYYY-MM-DD HH:mm:ss
        data.published_at = pubDateInput.value.replace('T', ' ') + ':00';
      } else {
        data.published_at = null;
      }
      // Explicitly set is_published from checkbox
      const pubFlag = document.getElementById('mrecords-published-flag');
      data.is_published = (pubFlag && pubFlag.checked) ? 1 : 0;
      console.log('[Media Records Save] is_published checkbox checked:', pubFlag?.checked, 'sending value:', data.is_published);
      const id=data.id; delete data.id;
      try {
        if (id) await api('PUT', `/api/admin/media-records/${id}`, data); else await api('POST', '/api/admin/media-records', data);
        alert('儲存成功！');
        location.reload();
      } catch (err) {
        console.error('Save error:', err);
        alert('儲存失敗：' + (err.message || '未知錯誤'));
      }
    });
  }


  // [Rest of existing functions: initMenus, initLogin, initChangePassword, initSlides, initUsers, initMembers, initContacts, initTrial, initNewsEditor, initLegendEditor, initPlansEditor, initCoursesMaterials, initMedia]
  // I will keep the rest of functions as they were, just replaced initAboutEditors and added new ones.
  
  // ... (Copying previous functions back in to ensure file is complete)
  // MENUS with drag reorder
  function renderMenusList(listEl, menus) {
    listEl.innerHTML = '';
    menus.forEach(item => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.id = item.id;
      li.textContent = `${item.title} (${item.slug || item.url || ''})`;
      li.className = 'menu-item';
      listEl.appendChild(li);
    });
    let drag;
    listEl.addEventListener('dragstart', (e) => { drag = e.target; e.dataTransfer.effectAllowed = 'move'; });
    listEl.addEventListener('dragover', (e) => { e.preventDefault(); const t = e.target.closest('li'); if (!t || t === drag) return; const rect = t.getBoundingClientRect(); const after = (e.clientY - rect.top) / rect.height > 0.5; listEl.insertBefore(drag, after ? t.nextSibling : t); });
  }
  async function initMenus() {
    const listEl = document.getElementById('menus-list');
    const menus = await api('GET', '/api/admin/menus');
    renderMenusList(listEl, menus);
    document.getElementById('save-order')?.addEventListener('click', async () => {
      const orders = Array.from(listEl.querySelectorAll('li')).map((li, idx) => ({ id: Number(li.dataset.id), order_index: idx }));
      await api('POST', '/api/admin/menus/reorder', { orders });
      alert('排序已更新');
    });
    // create/update
    const form = document.getElementById('menu-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.visible = fd.get('visible') ? 1 : 0;
      data.parent_id = data.parent_id || null;
      data.order_index = Number(data.order_index || 0);
      if (data.id) await api('PUT', `/api/admin/menus/${data.id}`, data);
      else await api('POST', '/api/admin/menus', data);
      location.reload();
    });
    listEl?.addEventListener('click', async (e) => {
      const li = e.target.closest('li'); if (!li) return;
      const id = li.dataset.id;
      const m = menus.find(x => String(x.id) === String(id));
      if (!m) return;
      for (const [k, v] of Object.entries(m)) {
        const el = document.querySelector(`#menu-form [name="${k}"]`);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!Number(v);
        else el.value = v ?? '';
      }
      document.querySelector('#menu-form [name="id"]').value = m.id;
    });
    document.getElementById('menu-delete')?.addEventListener('click', async () => {
      const id = document.querySelector('#menu-form [name="id"]').value;
      if (!id) return;
      if (!confirm('確定刪除？')) return;
      await api('DELETE', `/api/admin/menus/${id}`);
      location.reload();
    });
  }

  // PAGES (similar for posts/news)
  async function bindCrudList(resource) {
    const listEl = document.getElementById(`${resource}-list`);
    const table = document.getElementById(`${resource}-table`);
    const form = document.getElementById(`${resource}-form`);
    const rows = await api('GET', `/api/admin/${resource}`);
    if (table) {
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.title || r.name || r.slug || ''}</td><td>${r.slug || ''}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
        tbody.appendChild(tr);
      });
      tbody.addEventListener('click', async (e) => {
        const id = e.target.dataset.edit || e.target.dataset.del;
        if (!id) return;
        if (e.target.dataset.edit) {
          const r = rows.find(x => String(x.id) === String(id));
          for (const [k, v] of Object.entries(r)) {
            const el = form.querySelector(`[name="${k}"]`);
            if (!el) continue;
            if (el.type === 'checkbox') el.checked = !!Number(v);
            else el.value = v ?? '';
          }
          form.querySelector('[name="id"]').value = r.id;
        } else if (e.target.dataset.del) {
          if (!confirm('確定刪除？')) return;
          await api('DELETE', `/api/admin/${resource}/${id}`);
          location.reload();
        }
      });
    }
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      for (const el of form.querySelectorAll('input[type="checkbox"]')) {
        data[el.name] = el.checked ? 1 : 0;
      }
      const id = data.id; delete data.id;
      if (id) await api('PUT', `/api/admin/${resource}/${id}`, data);
      else await api('POST', `/api/admin/${resource}`, data);
      location.reload();
    });
  }

  // CONTACTS
  async function initContacts() {
    const rows = await api('GET', '/api/admin/contacts');
    const tbody = document.querySelector('#contacts-table tbody');
    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.id}</td><td>${r.name}</td><td>${r.email}</td><td>${r.phone}</td><td>${r.created_at || ''}</td><td>${r.processed ? '✔' : '—'}</td><td>${r.message || ''}</td><td>${r.processed ? '' : `<button data-id="${r.id}">標示處理</button>`}</td>`;
      tbody.appendChild(tr);
    });
    tbody.addEventListener('click', async (e) => {
      const id = e.target.dataset.id; if (!id) return;
      await api('PUT', `/api/admin/contacts/${id}/process`, {});
      location.reload();
    });
  }

  // TRIAL
  async function initTrial() {
    const table = document.getElementById('trial-table');
    const form = document.getElementById('trial-form');
    if (!table || !form) return;
    async function load() {
      const rows = await api('GET', '/api/admin/trial');
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.title || ''}</td><td>${r.type || ''}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
        tbody.appendChild(tr);
      });
      tbody.addEventListener('click', async (e) => {
        const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return;
        if (e.target.dataset.edit) {
          const rows = await api('GET', '/api/admin/trial');
          const r = rows.find(x => String(x.id) === String(id)); if (!r) return;
          form.querySelector('[name="id"]').value = r.id;
          form.querySelector('[name="title"]').value = r.title || '';
          form.querySelector('[name="type"]').value = r.type || 'article';
          form.querySelector('[name="content_html"]').value = r.content_html || '';
          form.querySelector('[name="video_url"]').value = r.video_url || '';
          form.querySelector('[name="is_public"]').checked = !!r.is_public;
        } else if (e.target.dataset.del) {
          if (!confirm('確定刪除？')) return;
          await api('DELETE', `/api/admin/trial/${id}`);
          location.reload();
        }
      });
    }
    await load();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.is_public = form.querySelector('[name="is_public"]').checked ? 1 : 0;
      const id = data.id; delete data.id;
      if (id) await api('PUT', `/api/admin/trial/${id}`, data);
      else await api('POST', '/api/admin/trial', data);
      location.reload();
    });
  }

  // NEWS rich editor
  async function initNewsEditor() {
    const table = document.getElementById('news-table');
    const form = document.getElementById('news-form');
    const editor = document.getElementById('news-editor');
    const toolbar = document.getElementById('news-toolbar');
    if (!table || !form || !editor) return;
    const rows = await api('GET', '/api/admin/news');
    const tbody = table.querySelector('tbody'); tbody.innerHTML = '';
    rows.forEach(r => { const tr=document.createElement('tr'); tr.innerHTML = `<td>${r.id}</td><td>${r.title}</td><td>${r.slug}</td><td>${r.is_published ? '✔' : '—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`; tbody.appendChild(tr); });
    toolbar?.addEventListener('click', (e) => { const btn=e.target.closest('[data-cmd]'); if (!btn) return; const cmd=btn.getAttribute('data-cmd'); const val=btn.getAttribute('data-value')||null; document.execCommand(cmd,false,val); });
    document.getElementById('news-insert-img')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); document.getElementById('news-insert-file').click(); });
    document.getElementById('news-upload-img')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); document.getElementById('news-insert-file').click(); });
    document.getElementById('news-insert-file')?.addEventListener('change', async (e) => { 
      const f=e.target.files?.[0]; 
      if (!f) return; 
      const csrf=await getCsrf(); 
      const fd=new FormData(); 
      fd.append('file', f); 
      const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); 
      const j=await res.json(); 
      if (j?.path || j?.file_path) { 
        insertImageAtCursor(editor, j.path || j.file_path); 
      }
      e.target.value = ''; // Reset file input
    });
    // picker/upload cover
    const picker = document.getElementById('news-picker'); const pickerGrid=document.getElementById('news-picker-grid'); const pickerPager=document.getElementById('news-picker-pager');
    async function loadMedia(page=1){ const data=await api('GET', `/api/admin/media?page=${page}&limit=24`); pickerGrid.innerHTML=''; data.items.forEach(it=>{ const btn=document.createElement('button'); btn.className='btn ghost'; btn.style.display='block'; btn.style.padding='0'; btn.style.borderRadius='12px'; btn.style.overflow='hidden'; btn.style.border='1px solid #e5e7eb'; btn.style.background='#fff'; btn.innerHTML=`<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style=\"padding:8px 10px;font-size:12px;color:#374151;\">${it.file_name}</div>`; btn.addEventListener('click',()=>{ document.getElementById('news-cover').value = it.id || ''; picker.style.display='none'; }); pickerGrid.appendChild(btn); }); pickerPager.innerHTML=''; const totalPages=Math.ceil(data.total/data.limit); for(let i=1;i<=totalPages;i++){ const a=document.createElement('a'); a.href='#'; a.textContent=i; a.className='btn ghost'; a.style.padding='6px 10px'; a.style.borderRadius='8px'; if (i===data.page){ a.style.background='#111827'; a.style.color='#fff'; } a.addEventListener('click',(e)=>{e.preventDefault(); loadMedia(i);}); pickerPager.appendChild(a);} }
    document.getElementById('news-picker-close')?.addEventListener('click',(e)=>{e.preventDefault(); picker.style.display='none';});
    document.getElementById('news-cover-pick')?.addEventListener('click',()=>{ picker.style.display='block'; loadMedia(1); });
    document.getElementById('news-cover-upload')?.addEventListener('click',()=> document.getElementById('news-cover-file').click());
    document.getElementById('news-cover-file')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.media_id) document.getElementById('news-cover').value=j.media_id; });
    // edit/delete/save
    tbody.addEventListener('click', async (e)=>{ 
      const id = e.target.dataset.edit || e.target.dataset.del; 
      if (!id) return; 
      if (e.target.dataset.edit){ 
        const r=rows.find(x=> String(x.id)===String(id)); 
        if (!r) return; 
        
        // Load all fields, ensuring they are properly set
        document.getElementById('news-title').value = String(r.title || '').trim(); 
        document.getElementById('news-slug').value = String(r.slug || '').trim(); 
        document.getElementById('news-excerpt').value = String(r.excerpt || ''); 
        // Load content_html, ensuring editor is visible and has content
        const contentHtml = String(r.content_html || '').trim();
        editor.innerHTML = contentHtml;
        console.log('[Admin News] Loading article:', r.id, 'content_html length:', contentHtml.length);
        if (!contentHtml) {
          console.warn('[Admin News] Warning: Article has no content_html');
          // Focus editor to make it clear where to type
          setTimeout(() => editor.focus(), 100);
        }
        document.getElementById('news-cover').value = r.cover_media_id ? String(r.cover_media_id) : ''; 
        
        // Convert SQL datetime to datetime-local format if needed
        if (r.published_at) {
          const pubDate = String(r.published_at).replace(' ', 'T').slice(0, 16);
          document.getElementById('news-published').value = pubDate;
        } else {
          document.getElementById('news-published').value = '';
        }
        
        // Set is_published checkbox
        const isPublished = (r.is_published === 1 || r.is_published === '1' || r.is_published === true);
        document.getElementById('news-published-flag').checked = isPublished; 
        
        // Set the hidden id field
        form.querySelector('[name="id"]').value = String(r.id); 
      } else if (e.target.dataset.del){ 
        if (!confirm('確定刪除？')) return; 
        await api('DELETE', `/api/admin/news/${id}`); 
        location.reload(); 
      } 
    });
    
    let isSubmitting = false; // Prevent duplicate submissions
    let submitBtn = form.querySelector('button[type="submit"]');
    
    // Remove any existing submit listeners by cloning the form
    const formClone = form.cloneNode(true);
    form.parentNode.replaceChild(formClone, form);
    const cleanForm = document.getElementById('news-form');
    submitBtn = cleanForm.querySelector('button[type="submit"]');
    
    cleanForm.addEventListener('submit', async (e)=>{ 
      e.preventDefault(); 
      e.stopPropagation(); // Prevent event bubbling
      
      if (isSubmitting) {
        console.warn('[Frontend] Already submitting, ignoring duplicate submit');
        return;
      }
      isSubmitting = true;
      
      // Disable submit button to prevent double clicks
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '儲存中...';
      }
      
      try {
        const fd=new FormData(cleanForm); 
        const data=Object.fromEntries(fd.entries());
        
        // Validate required fields
        if (!data.title || !data.title.trim()) {
          alert('請輸入標題');
          return;
        }
        if (!data.slug || !data.slug.trim()) {
          alert('請輸入 Slug');
          return;
        }
        
        data.title = String(data.title).trim();
        let originalSlug = String(data.slug).trim();
        
        // Get id early to check if this is a new article or edit
        const id = data.id ? String(data.id).trim() : null;
        
        // Helper function to generate a unique slug from title
        function generateUniqueSlug(title, suffix = '') {
          // Remove emoji and special characters, keep only alphanumeric, Chinese, and basic punctuation
          let slug = title
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emoji
            .replace(/[^\w\s\u4e00-\u9fff-]/g, '') // Keep alphanumeric, Chinese, spaces, hyphens
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
          
          // If slug is empty after cleaning, use a default
          if (!slug) {
            slug = 'article';
          }
          
          // Add suffix if provided
          if (suffix) {
            slug = slug + '-' + suffix;
          }
          
          return slug;
        }
        
        // For new articles, auto-generate unique slug if slug is empty or same as title
        if (!id) {
          if (!originalSlug || originalSlug === data.title) {
            // Generate slug from title with timestamp to ensure uniqueness
            originalSlug = generateUniqueSlug(data.title, Date.now());
            console.log('[Frontend] Auto-generated slug for new article:', originalSlug);
            // Update the slug input field immediately to prevent duplicate submissions
            document.getElementById('news-slug').value = originalSlug;
          }
        }
        
        data.slug = originalSlug;
        data.excerpt = String(document.getElementById('news-excerpt').value || '').trim();
        
        // Get content from editor, ensuring we get the actual HTML content
        // Check both innerHTML and textContent to ensure we capture content
        const currentEditor = document.getElementById('news-editor');
        if (!currentEditor) {
          isSubmitting = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '儲存';
          }
          alert('找不到編輯器，請重新整理頁面');
          return;
        }
        let editorContent = currentEditor.innerHTML || '';
        const editorText = currentEditor.textContent || '';
        
        // Validate content_html - ensure editor has content
        const hasContent = editorContent.trim().length > 0 && 
                          editorContent !== '<div></div>' && 
                          editorContent !== '<p></p>' && 
                          editorContent !== '<br>' &&
                          editorText.trim().length > 0;
        
        if (!hasContent) {
          const confirmEmpty = confirm('警告：文章內容為空。確定要儲存嗎？\n\n如果確定，請點擊「確定」繼續。\n如果要輸入內容，請點擊「取消」後在內容編輯器中輸入。');
          if (!confirmEmpty) {
            editor.focus();
            return;
          }
        }
        
        // If innerHTML is empty or only contains whitespace/br tags, use textContent
        const cleanHtml = editorContent.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, ' ').trim();
        if (!cleanHtml || cleanHtml === '' || cleanHtml === '<div></div>' || cleanHtml === '<p></p>') {
          if (editorText && editorText.trim()) {
            // Convert text to HTML paragraphs
            const paragraphs = editorText.split('\n').filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join('');
            editorContent = paragraphs || '<p>' + editorText.trim() + '</p>';
          } else {
            editorContent = '';
          }
        }
        
        // Log editor state for debugging
        console.log('[Frontend] Editor state:', {
          innerHTML_length: editor.innerHTML ? editor.innerHTML.length : 0,
          innerHTML_preview: editor.innerHTML ? editor.innerHTML.substring(0, 100) : 'empty',
          textContent_length: editorText.length,
          textContent_preview: editorText.substring(0, 100),
          final_content_html_length: editorContent.length,
          final_content_html_preview: editorContent.substring(0, 100)
        });
        
        data.content_html = editorContent;
        const coverMediaIdValue = document.getElementById('news-cover').value;
        data.cover_media_id = coverMediaIdValue && coverMediaIdValue.trim() ? coverMediaIdValue.trim() : null;
        if (data.cover_media_id) {
          data.cover_media_id = parseInt(data.cover_media_id) || null;
        }
        
        // Convert datetime-local to SQL format if needed, or use as-is if already in SQL format
        const pubDateInput = document.getElementById('news-published');
        if (pubDateInput && pubDateInput.value) {
          // If it's datetime-local format (contains T), convert it
          if (pubDateInput.value.includes('T')) {
            data.published_at = pubDateInput.value.replace('T', ' ') + ':00';
          } else {
            data.published_at = pubDateInput.value;
          }
        } else {
          data.published_at = null;
        }
        // Explicitly set is_published from checkbox
        const pubFlag = document.getElementById('news-published-flag');
        data.is_published = (pubFlag && pubFlag.checked) ? 1 : 0;
        
        // id was already extracted above, now remove it from data
        delete data.id;
        
        console.log('[Frontend] Saving news:', {
          isEdit: !!id,
          title: data.title,
          slug: data.slug,
          content_html_length: data.content_html ? data.content_html.length : 0,
          excerpt_length: data.excerpt ? data.excerpt.length : 0
        });
        
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        
        // Retry logic for slug conflicts
        while (retryCount <= maxRetries) {
          try {
            if (id) {
              response = await api('PUT', `/api/admin/news/${id}`, data);
            } else {
              response = await api('POST', '/api/admin/news', data);
            }
            
            console.log('[Frontend] Save response:', response);
            
            // Check if response indicates success
            if (response && (response.ok === true || response.id !== undefined)) {
              console.log('[Frontend] Save successful, stopping retry loop');
              isSubmitting = false; // Reset before reload
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '儲存';
              }
              alert('儲存成功');
              location.reload();
              return; // Success, exit function immediately
            } else {
              throw new Error('儲存失敗：未收到成功響應');
            }
          } catch (saveErr) {
            const errorMsg = saveErr.message || '';
            let parsed;
            try {
              parsed = JSON.parse(errorMsg);
            } catch {
              parsed = null;
            }
            
            // If it's a slug conflict and we're creating a new article, try to fix it
            if (parsed && parsed.error === 'Slug already exists' && !id && retryCount < maxRetries) {
              retryCount++;
              // Generate a new unique slug with timestamp and random number
              // Use a more unique suffix to avoid conflicts
              const newSuffix = Date.now() + '-' + Math.floor(Math.random() * 10000) + '-' + retryCount;
              // Use the same generateUniqueSlug function defined above
              const baseTitle = data.title;
              let newSlug = baseTitle
                .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emoji
                .replace(/[^\w\s\u4e00-\u9fff-]/g, '') // Keep alphanumeric, Chinese, spaces, hyphens
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-') // Replace multiple hyphens with single
                .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
              if (!newSlug) newSlug = 'article';
              data.slug = newSlug + '-' + newSuffix;
              console.log(`[Frontend] Slug conflict detected, retrying with new slug (attempt ${retryCount}):`, data.slug);
              // Update the slug input field to keep it in sync
              document.getElementById('news-slug').value = data.slug;
              // Update data.slug to ensure we use the new slug in the next attempt
              continue; // Retry with new slug
            }
            
            // If not a slug conflict or max retries reached, throw the error
            isSubmitting = false; // Reset on error
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = '儲存';
            }
            throw saveErr;
          }
        }
        isSubmitting = false; // Reset if we exit the loop without success
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '儲存';
        }
      } catch (err) {
        isSubmitting = false; // Reset on error
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '儲存';
        }
        console.error('Error saving news:', err);
        console.error('Error details:', {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
        
        const errorMsg = err.message || '未知錯誤';
        // Try to parse error message if it's JSON
        let displayMsg = errorMsg;
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error) {
            displayMsg = parsed.error;
            if (parsed.details) {
              displayMsg += ': ' + parsed.details;
            }
          }
        } catch {
          // Not JSON, use as-is
        }
        
        // If it's a slug conflict, try to load the existing item and edit it
        if (displayMsg.includes('Slug already exists')) {
          try {
            const parsed = JSON.parse(errorMsg);
            if (parsed.existing_id) {
              console.log('[Frontend] Attempting to load existing news with ID:', parsed.existing_id);
              
              // Try to load the existing news item directly by ID first
              let existingItem = null;
              try {
                // First, try to get all news and find the one with matching ID
                const existingNews = await api('GET', '/api/admin/news');
                console.log('[Frontend] Loaded news list, count:', existingNews ? existingNews.length : 0);
                if (existingNews && Array.isArray(existingNews)) {
                  existingItem = existingNews.find(n => String(n.id) === String(parsed.existing_id));
                }
              } catch (loadErr) {
                console.error('[Frontend] Failed to load news list:', loadErr);
                // If loading list fails, suggest page reload
                alert('儲存失敗：Slug 已存在（ID: ' + parsed.existing_id + '）。請重新整理頁面後編輯該項目。');
                return;
              }
              
              if (existingItem) {
                console.log('[Frontend] Found existing item:', existingItem);
                // Populate form with existing data
                document.getElementById('news-title').value = String(existingItem.title || '').trim();
                document.getElementById('news-slug').value = String(existingItem.slug || '').trim();
                document.getElementById('news-excerpt').value = String(existingItem.excerpt || '');
                editor.innerHTML = String(existingItem.content_html || '');
                document.getElementById('news-cover').value = existingItem.cover_media_id ? String(existingItem.cover_media_id) : '';
                if (existingItem.published_at) {
                  const pubDate = String(existingItem.published_at).replace(' ', 'T').slice(0, 16);
                  document.getElementById('news-published').value = pubDate;
                } else {
                  document.getElementById('news-published').value = '';
                }
                const isPublished = (existingItem.is_published === 1 || existingItem.is_published === '1' || existingItem.is_published === true);
                document.getElementById('news-published-flag').checked = isPublished;
                form.querySelector('[name="id"]').value = String(existingItem.id); 
                
                alert('偵測到該 Slug 已存在（ID: ' + parsed.existing_id + '）。已自動載入該項目，請確認內容後再次儲存。');
                return; // Don't show error, form is now populated
              } else {
                console.warn('[Frontend] Existing item not found in list, ID:', parsed.existing_id);
                alert('儲存失敗：Slug 已存在（ID: ' + parsed.existing_id + '），但無法載入該項目。請重新整理頁面後編輯該項目。');
                return;
              }
            }
          } catch (e) {
            console.error('Failed to process slug conflict:', e);
            console.error('Error details:', {
              message: e.message,
              stack: e.stack,
              name: e.name
            });
          }
          alert('儲存失敗：Slug 已存在。請重新整理頁面後編輯該項目。');
        } else {
          alert('儲存失敗：' + displayMsg);
        }
      }
    });
  }

  // MEDIA
  async function initMedia() {
    const file = document.getElementById('file');
    const btn = document.getElementById('upload-btn');
    const q = document.getElementById('media-q');
    const searchBtn = document.getElementById('media-search');
    const table = document.getElementById('media-table');
    const deleteSelected = document.getElementById('media-delete-selected');
    const selectAll = document.getElementById('media-select-all');
    const selected = new Set();

    function updateDeleteButton() {
      if (!deleteSelected) return;
      deleteSelected.disabled = selected.size === 0;
      deleteSelected.textContent = selected.size
        ? `刪除選取 (${selected.size})`
        : '刪除選取';
    }
    function clearSelection() {
      selected.clear();
      if (selectAll) selectAll.checked = false;
      table?.querySelectorAll('[data-media-check]').forEach(cb => cb.checked = false);
      updateDeleteButton();
    }
    async function load(page=1){
      const qp = q && q.value.trim() ? `&q=${encodeURIComponent(q.value.trim())}` : '';
      const data = await api('GET', `/api/admin/media?page=${page}&limit=24${qp}`);
      if (table){
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = '';
        clearSelection();
        data.items.forEach(it => {
          const tr = document.createElement('tr');
          const thumb = it.file_path ? `<img class="media-thumb" src="${it.file_path}" alt="${it.file_name || 'thumb'}">` : '—';
          tr.innerHTML = `<td><input type="checkbox" data-media-check data-id="${it.id}"></td><td>${thumb}</td><td>${it.id}</td><td>${it.file_name}</td><td>${it.mime_type}</td><td>${it.created_at || ''}</td><td><button class="btn ghost" data-media-del data-id="${it.id}">刪除</button></td>`;
          tbody.appendChild(tr);
        });
      }
    }
    await load(1);
    searchBtn?.addEventListener('click', ()=> load(1));
    btn?.addEventListener('click', async () => {
      if (!file.files[0]) return alert('請選擇檔案');
      const csrf = await getCsrf();
      const fd = new FormData(); fd.append('file', file.files[0]);
      await fetch('/api/admin/media/upload', { method:'POST', headers: { 'CSRF-Token': csrf }, body: fd });
      await load(1);
      alert('已上傳');
    });
    table?.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-media-del]');
      if (del) {
        const id = del.dataset.id;
        if (!id) return;
        if (!confirm('確定刪除此媒體檔案？這會連同實體檔一併刪除')) return;
        await api('DELETE', `/api/admin/media/${id}`);
        await load(1);
        alert('媒體已刪除');
        return;
      }
      const checkbox = e.target.closest('[data-media-check]');
      if (checkbox) {
        const id = checkbox.dataset.id;
        if (checkbox.checked) selected.add(id);
        else selected.delete(id);
        updateDeleteButton();
        if (selectAll) selectAll.checked = table?.querySelectorAll('[data-media-check]').length === selected.size;
      }
    });
    selectAll?.addEventListener('change', () => {
      const checkboxes = table?.querySelectorAll('[data-media-check]') || [];
      checkboxes.forEach(cb => {
        const id = cb.dataset.id;
        cb.checked = selectAll.checked;
        if (selectAll.checked) selected.add(id);
        else selected.delete(id);
      });
      updateDeleteButton();
    });
    deleteSelected?.addEventListener('click', async () => {
      if (!selected.size) return;
      if (!confirm(`確定刪除 ${selected.size} 個檔案？此操作會一併移除實體檔案`)) return;
      for (const id of Array.from(selected)) {
        await api('DELETE', `/api/admin/media/${id}`);
      }
      await load(1);
      alert('選取媒體已刪除');
    });
  }

  // USERS (admin only)
  async function initUsers() {
    const table = document.getElementById('users-table');
    const form = document.getElementById('users-form');
    if (!table || !form) return;
    async function load() {
      const rows = await api('GET', '/api/admin/users');
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      rows.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${u.id}</td>
          <td>${u.username}</td>
          <td>
            <select data-role data-id="${u.id}">
              <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
              <option value="editor" ${u.role==='editor'?'selected':''}>editor</option>
            </select>
          </td>
          <td>
            <label style="display:inline-flex;align-items:center;gap:6px">
              <input type="checkbox" data-mustchange data-id="${u.id}" ${u.must_change_password? 'checked':''}>
              <span>需改密碼</span>
            </label>
          </td>
          <td>
            <button class="btn" data-save data-id="${u.id}">儲存</button>
            <button class="btn ghost" data-resetpw data-id="${u.id}">改密碼</button>
            <button class="btn ghost" data-del data-id="${u.id}" style="color:#c00;border-color:#fecaca;">刪除</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
    await load();
    table.addEventListener('click', async (e) => {
      const saveBtn = e.target.closest('[data-save]');
      const delBtn = e.target.closest('[data-del]');
      const pwBtn = e.target.closest('[data-resetpw]');
      if (saveBtn) {
        const id = saveBtn.getAttribute('data-id');
        const row = saveBtn.closest('tr');
        const roleSel = row.querySelector('[data-role]');
        const must = row.querySelector('[data-mustchange]');
        await api('PUT', `/api/admin/users/${id}`, { role: roleSel.value, must_change_password: must.checked ? 1 : 0 });
        alert('已更新');
      } else if (pwBtn) {
        const id = pwBtn.getAttribute('data-id');
        const newpw = prompt('輸入新密碼（至少 4 碼）');
        if (!newpw) return;
        await api('POST', `/api/admin/users/${id}/password`, { new_password: newpw });
        alert('密碼已更新');
      } else if (delBtn) {
        const id = delBtn.getAttribute('data-id');
        if (!confirm('確定刪除此使用者？')) return;
        await api('DELETE', `/api/admin/users/${id}`);
        await load();
        alert('已刪除');
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      await api('POST', '/api/admin/users', data);
      form.reset();
      await load();
      alert('已新增');
    });
  }

  async function initMembers() {
    const table = document.getElementById('members-table');
    const form = document.getElementById('members-form');
    if (!table || !form) return;
    let rows = await api('GET', '/api/admin/members');
    const tbody = table.querySelector('tbody');
    function render() {
      tbody.innerHTML = '';
      rows.forEach(m => {
        const displayName = m.chinese_name || m.english_name || m.name || m.email;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${m.id}</td><td>${m.email}</td><td>${displayName}</td><td>${m.tier}</td><td>${m.is_active?'✔':'—'}</td><td><button data-edit="${m.id}">編輯</button> <button data-del="${m.id}">刪除</button> <button data-expand="${m.id}">展開</button></td>`;
        tbody.appendChild(tr);
        const exp = document.createElement('tr');
        exp.className = 'hidden';
        exp.dataset.detailFor = m.id;
        exp.innerHTML = `<td colspan="6" style="background:#fafafa">
          <div data-detail-box style="padding:8px">載入中...</div>
        </td>`;
        tbody.appendChild(exp);
      });
    }
    render();
    document.getElementById('m-search')?.addEventListener('click', async () => {
      const q = document.getElementById('m-q').value.trim();
      rows = await api('GET', `/api/admin/members${q?`?q=${encodeURIComponent(q)}`:''}`);
      render();
    });
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.edit || btn.dataset.del || btn.dataset.expand; if (!id) return;
      if (btn.dataset.edit) {
        rows = await api('GET', '/api/admin/members');
        const m = rows.find(x => String(x.id) === String(id)); if (!m) return;
        form.querySelector('[name="id"]').value = m.id;
        document.getElementById('m-email').value = m.email || '';
        document.getElementById('m-name').value = m.chinese_name || m.name || '';
        document.getElementById('m-tier').value = m.tier || 'free';
        document.getElementById('m-active').checked = !!m.is_active;
      } else if (btn.dataset.del) {
        if (!confirm('確定刪除？')) return;
        await api('DELETE', `/api/admin/members/${id}`);
        rows = await api('GET', '/api/admin/members');
        render();
      } else if (btn.dataset.expand) {
        const detailRow = tbody.querySelector(`tr[data-detail-for="${id}"]`);
        if (detailRow) {
          detailRow.classList.toggle('hidden');
          // toggle button text 展開/收起
          btn.textContent = detailRow.classList.contains('hidden') ? '展開' : '收起';
          const box = detailRow.querySelector('[data-detail-box]');
          if (box && !box.dataset.loaded) {
            const prof = await api('GET', `/api/admin/members/${id}`);
            const files = await api('GET', `/api/admin/members/${id}/files`);
            const labels = {
              email: '電子郵件',
              username: '帳號',
              name: '姓名',
              chinese_name: '中文姓名',
              english_name: '英文姓名',
              gender: '性別',
              birth_date: '出生日期',
              id_number: '身分證字號',
              phone_mobile: '行動電話',
              phone_landline: '市話',
              address: '通訊地址',
              line_id: 'LINE ID',
              special_needs: '特殊需求',
              referrer: '推薦人/介紹人',
              tier: '等級',
              created_at: '建立時間'
            };
            function fmtVal(key, val){
              if (val == null) return '';
              if (key === 'gender') return val === 'male' ? '男' : (val === 'female' ? '女' : '其他');
              if (key === 'birth_date' || key === 'created_at') {
                try {
                  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false }).format(new Date(val));
                } catch { return String(val); }
              }
              return String(val);
            }
            const order = ['email','username','chinese_name','english_name','name','gender','birth_date','id_number','phone_mobile','phone_landline','address','line_id','special_needs','referrer','tier','created_at'];
            box.innerHTML = `
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:12px;font-size:16px">
                ${order.map(k=>`<div><strong>${labels[k]||k}</strong><div>${fmtVal(k, prof?.[k])}</div></div>`).join('')}
              </div>
              <div><strong>上傳檔案</strong>
                <div data-files-box style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
                  ${(files.items||[]).map(f=>`
                    <span class="chip">
                      <a class="btn ghost" href="${f.url}" download>${f.name}</a>
                      <button class="btn ghost" data-file-del data-name="${encodeURIComponent(f.name)}" data-mid="${id}" style="color:#c00;border-color:#fecaca;">刪除</button>
                    </span>
                  `).join('') || '—'}
                </div>
              </div>`;
            box.dataset.loaded = '1';
          }
        }
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form); const data = Object.fromEntries(fd.entries());
      data.is_active = document.getElementById('m-active').checked ? 1 : 0;
      const id = data.id; delete data.id; delete data.email;
      await api('PUT', `/api/admin/members/${id}`, data);
      rows = await api('GET', '/api/admin/members');
      render();
      alert('已儲存');
    });
  }

  async function initLegendPicker() {
    const picker = document.getElementById('legend-picker'); if (!picker) return;
    const grid = document.getElementById('legend-picker-grid'); const pager=document.getElementById('legend-picker-pager');
    async function loadMedia(page=1){ const data=await api('GET', `/api/admin/media?page=${page}&limit=24`); grid.innerHTML=''; data.items.forEach(it=>{ const btn=document.createElement('button'); btn.className='btn ghost'; btn.style.display='block'; btn.style.padding='0'; btn.style.borderRadius='12px'; btn.style.overflow='hidden'; btn.style.border='1px solid #e5e7eb'; btn.style.background='#fff'; btn.innerHTML=`<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style=\"padding:8px 10px;font-size:12px;color:#374151;\">${it.file_name}</div>`; btn.addEventListener('click',()=>{ const input=document.getElementById('legend-cover'); if (input) input.value = it.id || ''; picker.style.display='none'; }); grid.appendChild(btn); }); pager.innerHTML=''; const totalPages=Math.ceil(data.total/data.limit); for(let i=1;i<=totalPages;i++){ const a=document.createElement('a'); a.href='#'; a.textContent=i; a.className='btn ghost'; a.style.padding='6px 10px'; a.style.borderRadius='8px'; if (i===data.page){ a.style.background='#111827'; a.style.color='#fff'; } a.addEventListener('click',(e)=>{e.preventDefault(); loadMedia(i);}); pager.appendChild(a);} }
    document.getElementById('legend-picker-close')?.addEventListener('click',(e)=>{e.preventDefault(); picker.style.display='none';});
    document.getElementById('legend-cover-pick')?.addEventListener('click',()=>{ picker.style.display='block'; loadMedia(1); });
    document.getElementById('legend-cover-upload')?.addEventListener('click',()=> document.getElementById('legend-cover-file').click());
    document.getElementById('legend-cover-file')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.media_id){ const input=document.getElementById('legend-cover'); if (input) input.value=j.media_id; } });
  }

  // LEGEND rich editor (傳奇榜)
  async function initLegendEditor() {
    const table = document.getElementById('leaderboard-table');
    const form = document.getElementById('leaderboard-form');
    const editor = document.getElementById('legend-editor');
    const toolbar = document.getElementById('legend-toolbar');
    if (!table || !form || !editor) return;

    let rows = await api('GET', '/api/admin/leaderboard');
    const tbody = table.querySelector('tbody');
    function renderList() {
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.title}</td><td>${r.slug}</td><td>${r.is_published ? '✔' : '—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
        tbody.appendChild(tr);
      });
    }
    renderList();

    toolbar?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      const cmd = btn.getAttribute('data-cmd');
      const val = btn.getAttribute('data-value') || null;
      document.execCommand(cmd, false, val);
    });
    document.getElementById('legend-insert-img')?.addEventListener('click', ()=> document.getElementById('legend-insert-file').click());
    document.getElementById('legend-insert-file')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const csrf = await getCsrf();
      const fd = new FormData(); fd.append('file', f);
      const res = await fetch('/api/admin/media/upload', { method:'POST', headers:{ 'CSRF-Token': csrf }, body: fd, credentials:'same-origin' });
      const j = await res.json();
      if (j?.path || j?.file_path) { insertImageAtCursor(editor, j.path || j.file_path); }
    });

    // cover pick/upload
    const picker = document.getElementById('legend-picker');
    const pickerGrid = document.getElementById('legend-picker-grid');
    const pickerPager = document.getElementById('legend-picker-pager');
    async function loadLegendMedia(page=1){
      const data = await api('GET', `/api/admin/media?page=${page}&limit=24`);
      pickerGrid.innerHTML = '';
      data.items.forEach(it => {
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.style.display = 'block';
        btn.style.padding = '0';
        btn.style.borderRadius = '12px';
        btn.style.overflow = 'hidden';
        btn.style.border = '1px solid #e5e7eb';
        btn.style.background = '#fff';
        btn.innerHTML = `<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style=\"padding:8px 10px;font-size:12px;color:#374151;\">${it.file_name}</div>`;
        btn.addEventListener('click',()=>{ document.getElementById('legend-cover').value = it.id || ''; picker.style.display='none'; });
        pickerGrid.appendChild(btn);
      });
      pickerPager.innerHTML='';
      const totalPages = Math.ceil(data.total / data.limit);
      for (let i=1;i<=totalPages;i++){
        const a=document.createElement('a'); a.href='#'; a.textContent=i; a.className='btn ghost'; a.style.padding='6px 10px'; a.style.borderRadius='8px';
        if (i===data.page){ a.style.background='#111827'; a.style.color='#fff'; }
        a.addEventListener('click',(e)=>{ e.preventDefault(); loadLegendMedia(i); });
        pickerPager.appendChild(a);
      }
    }
    document.getElementById('legend-picker-close')?.addEventListener('click',(e)=>{ e.preventDefault(); picker.style.display='none'; });
    document.getElementById('legend-cover-pick')?.addEventListener('click',()=>{ picker.style.display='block'; loadLegendMedia(1); });
    document.getElementById('legend-cover-upload')?.addEventListener('click',()=> document.getElementById('legend-cover-file').click());
    document.getElementById('legend-cover-file')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.media_id) document.getElementById('legend-cover').value=j.media_id; });

    // edit/delete/save
    tbody.addEventListener('click', async (e) => {
      const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return;
      if (e.target.dataset.edit) {
        rows = await api('GET', '/api/admin/leaderboard');
        const r = rows.find(x => String(x.id) === String(id)); if (!r) return;
        document.getElementById('legend-title').value = r.title || '';
        document.getElementById('legend-slug').value = r.slug || '';
        document.getElementById('legend-excerpt').value = r.excerpt || '';
        editor.innerHTML = r.content_html || '';
        document.getElementById('legend-cover').value = r.cover_media_id || '';
        document.getElementById('legend-published').value = r.published_at || '';
        document.getElementById('legend-published-flag').checked = !!r.is_published;
        form.querySelector('[name="id"]').value = r.id;
      } else if (e.target.dataset.del) {
        if (!confirm('確定刪除？')) return;
        await api('DELETE', `/api/admin/leaderboard/${id}`);
        rows = await api('GET', '/api/admin/leaderboard');
        renderList();
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form); const data = Object.fromEntries(fd.entries());
      data.excerpt = document.getElementById('legend-excerpt').value;
      data.content_html = editor.innerHTML;
      data.cover_media_id = document.getElementById('legend-cover').value || null;
      data.published_at = document.getElementById('legend-published').value || null;
      data.is_published = document.getElementById('legend-published-flag').checked ? 1 : 0;
      const id = data.id; delete data.id;
      if (id) await api('PUT', `/api/admin/leaderboard/${id}`, data);
      else await api('POST', '/api/admin/leaderboard', data);
      rows = await api('GET', '/api/admin/leaderboard');
      renderList();
      alert('已儲存');
    });
  }

  // LOGIN
  async function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const csrf = await getCsrf();
      const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf }, body: JSON.stringify(data) });
      const msg = document.getElementById('msg');
      if (res.ok) {
        const user = await res.json();
        if (user.must_change_password) location.href = '/admin/change-password.html';
        else location.href = '/admin/index.html';
      } else {
        msg && (msg.textContent = '登入失敗');
      }
    });
  }

  // CHANGE PASSWORD
  async function initChangePassword() {
    const form = document.getElementById('cp-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const csrf = await getCsrf();
      const res = await fetch('/api/admin/users/me/password', { method:'POST', headers: { 'Content-Type':'application/json','CSRF-Token': csrf }, body: JSON.stringify(data) });
      if (res.ok) {
        location.href = '/admin/index.html';
      } else {
        const msg = document.getElementById('msg');
        let err = '更新失敗';
        try {
          const j = await res.json();
          if (j && j.error) err = j.error;
        } catch {}
        if (msg) msg.textContent = err;
      }
    });
  }

  // SLIDES
  async function initSlides() {
    const table = document.getElementById('slides-table');
    const form = document.getElementById('slides-form');
    if (!table || !form) return;
    const rows = await api('GET', '/api/admin/slides');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.id}</td><td>${r.title || ''}</td><td>${r.order_index}</td><td>${r.is_active ? '✔' : '—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.addEventListener('click', async (e) => {
      const id = e.target.dataset.edit || e.target.dataset.del;
      if (!id) return;
      if (e.target.dataset.edit) {
        const r = rows.find(x => String(x.id) === String(id));
        for (const [k, v] of Object.entries(r)) {
          const el = form.querySelector(`[name="${k}"]`);
          if (!el) continue;
          if (el.type === 'checkbox') el.checked = !!Number(v);
          else el.value = v ?? '';
        }
        form.querySelector('[name="id"]').value = r.id;
      } else if (e.target.dataset.del) {
        if (!confirm('確定刪除？')) return;
        await api('DELETE', `/api/admin/slides/${id}`);
        location.reload();
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.is_active = form.querySelector('[name="is_active"]').checked ? 1 : 0;
      const id = data.id; delete data.id;
      if (id) await api('PUT', `/api/admin/slides/${id}`, data);
      else await api('POST', `/api/admin/slides`, data);
      location.reload();
    });
    document.getElementById('slides-delete')?.addEventListener('click', async () => {
      const id = form.querySelector('[name="id"]').value; if (!id) return;
      if (!confirm('確定刪除？')) return;
      await api('DELETE', `/api/admin/slides/${id}`);
      location.reload();
    });

    // Direct upload for slide media
    const uploadBtn = document.getElementById('slide-upload-btn');
    const uploadInput = document.getElementById('slide-upload-file');
    uploadBtn?.addEventListener('click', (e) => { e.preventDefault(); uploadInput?.click(); });
    uploadInput?.addEventListener('change', async () => {
      if (!uploadInput.files || !uploadInput.files[0]) return;
      const csrf = await getCsrf();
      const fd = new FormData();
      fd.append('file', uploadInput.files[0]);
      const res = await fetch('/api/admin/media/upload', { method:'POST', headers: { 'CSRF-Token': csrf }, body: fd, credentials: 'same-origin' });
      const j = await res.json();
      if (j && j.media_id) {
        form.querySelector('[name="media_id"]').value = j.media_id;
      }
    });

    // Media picker for slides
    const pickBtn = document.getElementById('slide-pick-btn');
    const picker = document.getElementById('slide-picker');
    const pickerGrid = document.getElementById('slide-picker-grid');
    const pickerPager = document.getElementById('slide-picker-pager');
    
    if (pickBtn && picker && pickerGrid && pickerPager) {
      async function loadSlideMedia(page=1) {
        const data = await api('GET', `/api/admin/media?page=${page}&limit=24`);
        pickerGrid.innerHTML = '';
        data.items.forEach(it => {
          const btn = document.createElement('button');
          btn.className = 'btn ghost';
          btn.style.display = 'block';
          btn.style.padding = '0';
          btn.style.borderRadius = '12px';
          btn.style.overflow = 'hidden';
          btn.style.border = '1px solid #e5e7eb';
          btn.style.background = '#fff';
          btn.innerHTML = `<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style="padding:8px 10px;font-size:12px;color:#374151;">${it.file_name}</div>`;
          btn.addEventListener('click', () => {
            form.querySelector('[name="media_id"]').value = it.id || '';
            picker.style.display = 'none';
          });
          pickerGrid.appendChild(btn);
        });
        pickerPager.innerHTML = '';
        const totalPages = Math.ceil(data.total / data.limit);
        for (let i=1; i<=totalPages; i++) {
          const a = document.createElement('a');
          a.href = '#';
          a.textContent = i;
          a.className = 'btn ghost';
          a.style.padding = '6px 10px';
          a.style.borderRadius = '8px';
          if (i === data.page) a.style.background = '#111827', a.style.color = '#fff';
          a.addEventListener('click', (e) => { e.preventDefault(); loadSlideMedia(i); });
          pickerPager.appendChild(a);
        }
      }
      pickBtn.addEventListener('click', (e) => {
        e.preventDefault();
        picker.style.display = 'flex';
        loadSlideMedia(1);
      });
    }
  }

  // COURSES & MATERIALS on dashboard
  async function initCoursesMaterials() {
    // Courses
    const cTable = document.getElementById('courses-table');
    const cForm = document.getElementById('courses-form');
    if (cTable && cForm) {
      async function loadCourses(){
        const rows = await api('GET','/api/admin/courses');
        const tbody = cTable.querySelector('tbody'); tbody.innerHTML='';
        rows.forEach(r=>{
          const tr=document.createElement('tr');
          tr.innerHTML = `<td>${r.id}</td><td>${r.title}</td><td>${r.category||''}</td><td>${r.min_tier}</td><td>${r.is_active?'✔':'—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
          tbody.appendChild(tr);
        });
        tbody.addEventListener('click', async (e)=>{
          const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return;
          if (e.target.dataset.edit){
            const rows = await api('GET','/api/admin/courses'); const r = rows.find(x=> String(x.id)===String(id)); if (!r) return;
            cForm.querySelector('[name="id"]').value = r.id;
            cForm.querySelector('[name="title"]').value = r.title || '';
            cForm.querySelector('[name="video_url"]').value = r.video_url || '';
            cForm.querySelector('[name="category"]').value = r.category || '';
            cForm.querySelector('[name="min_tier"]').value = r.min_tier || 'free';
            cForm.querySelector('[name="is_active"]').checked = !!r.is_active;
          } else if (e.target.dataset.del){
            if (!confirm('確定刪除？')) return; await api('DELETE', `/api/admin/courses/${id}`); location.reload();
          }
        });
      }
      await loadCourses();
      cForm.addEventListener('submit', async (e)=>{
        e.preventDefault(); const fd=new FormData(cForm); const data=Object.fromEntries(fd.entries()); data.is_active=cForm.querySelector('[name="is_active"]').checked?1:0; const id=data.id; delete data.id; if (id) await api('PUT', `/api/admin/courses/${id}`, data); else await api('POST','/api/admin/courses', data); location.reload();
      });
      document.getElementById('courses-delete')?.addEventListener('click', async ()=>{ const id=cForm.querySelector('[name="id"]').value; if(!id) return; if (!confirm('確定刪除？')) return; await api('DELETE', `/api/admin/courses/${id}`); location.reload(); });
    }
    // Materials
    const mTable = document.getElementById('materials-table');
    const mForm = document.getElementById('materials-form');
    if (mTable && mForm) {
      async function loadMaterials(){
        const rows = await api('GET','/api/admin/materials');
        const tbody = mTable.querySelector('tbody'); tbody.innerHTML='';
        rows.forEach(r=>{
          const tr=document.createElement('tr');
          tr.innerHTML = `<td>${r.id}</td><td>${r.title}</td><td>${r.file_name}</td><td>${r.min_tier}</td><td>${r.is_active?'✔':'—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
          tbody.appendChild(tr);
        });
        tbody.addEventListener('click', async (e)=>{
          const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return;
          if (e.target.dataset.edit){
            const rows = await api('GET','/api/admin/materials'); const r = rows.find(x=> String(x.id)===String(id)); if (!r) return;
            mForm.querySelector('[name="id"]').value = r.id;
            mForm.querySelector('[name="title"]').value = r.title || '';
            mForm.querySelector('[name="media_id"]').value = r.media_id || '';
            mForm.querySelector('[name="min_tier"]').value = r.min_tier || 'free';
            mForm.querySelector('[name="is_active"]').checked = !!r.is_active;
          } else if (e.target.dataset.del){ if (!confirm('確定刪除？')) return; await api('DELETE', `/api/admin/materials/${id}`); location.reload(); }
        });
      }
      await loadMaterials();
      mForm.addEventListener('submit', async (e)=>{ e.preventDefault(); const fd=new FormData(mForm); const data=Object.fromEntries(fd.entries()); data.is_active=mForm.querySelector('[name="is_active"]').checked?1:0; const id=data.id; delete data.id; if (id) await api('PUT', `/api/admin/materials/${id}`, data); else await api('POST', '/api/admin/materials', data); location.reload(); });
      document.getElementById('materials-delete')?.addEventListener('click', async ()=>{ const id=mForm.querySelector('[name="id"]').value; if(!id) return; if(!confirm('確定刪除？')) return; await api('DELETE', `/api/admin/materials/${id}`); location.reload(); });
      // pick
      document.getElementById('materials-pick')?.addEventListener('click', ()=>{ window.open('/admin/media.html','_blank'); alert('請在媒體庫取得檔案的 ID 後填入'); });
      // direct upload
      const upBtn = document.getElementById('materials-upload');
      const upFile = document.getElementById('materials-file');
      upBtn?.addEventListener('click', ()=> upFile?.click());
      upFile?.addEventListener('change', async ()=>{
        if (!upFile.files || !upFile.files[0]) return;
        const csrf = await getCsrf();
        const fd = new FormData(); fd.append('file', upFile.files[0]);
        const res = await fetch('/api/admin/media/upload', { method:'POST', headers:{ 'CSRF-Token': csrf }, body: fd, credentials:'same-origin' });
        const j = await res.json();
        if (j?.media_id) mForm.querySelector('[name="media_id"]').value = j.media_id;
        else alert('上傳失敗');
      });
    }
  }

  // ========== 商品管理 ==========
  async function initProducts() {
    // Categories
    const catTable = document.getElementById('categories-table');
    const catForm = document.getElementById('category-form');
    const catDelete = document.getElementById('category-delete');
    
    async function loadCategories() {
      if (!catTable) return;
      const rows = await api('GET', '/api/admin/product-categories');
      const tbody = catTable.querySelector('tbody');
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.name}</td><td>${r.order_index}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
        tbody.appendChild(tr);
      });
      tbody.addEventListener('click', async (e) => {
        const id = e.target.dataset.edit || e.target.dataset.del;
        if (!id) return;
        if (e.target.dataset.edit) {
          const rows = await api('GET', '/api/admin/product-categories');
          const r = rows.find(x => String(x.id) === String(id));
          if (!r) return;
          catForm.querySelector('[name="id"]').value = r.id;
          catForm.querySelector('[name="name"]').value = r.name || '';
          catForm.querySelector('[name="order_index"]').value = r.order_index || 0;
        } else if (e.target.dataset.del) {
          if (!confirm('確定刪除？')) return;
          await api('DELETE', `/api/admin/product-categories/${id}`);
          await loadCategories();
          catForm.reset();
        }
      });
    }
    
    if (catForm) {
      catForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(catForm);
        const data = Object.fromEntries(fd.entries());
        const id = data.id;
        delete data.id;
        if (id) {
          await api('PUT', `/api/admin/product-categories/${id}`, data);
        } else {
          await api('POST', '/api/admin/product-categories', data);
        }
        await loadCategories();
        catForm.reset();
      });
    }
    
    if (catDelete) {
      catDelete.addEventListener('click', async () => {
        const id = catForm.querySelector('[name="id"]').value;
        if (!id) return;
        if (!confirm('確定刪除？')) return;
        await api('DELETE', `/api/admin/product-categories/${id}`);
        await loadCategories();
        catForm.reset();
      });
    }
    
    // Products
    const prodTable = document.getElementById('products-table');
    const prodForm = document.getElementById('product-form');
    const prodDelete = document.getElementById('product-delete');
    const descEditor = document.getElementById('product-description-editor');
    const categorySelect = prodForm?.querySelector('[name="category_id"]');
    const imagesList = document.getElementById('product-images-list');
    let productImages = [];
    
    async function loadCategoriesForSelect() {
      if (!categorySelect) return;
      const rows = await api('GET', '/api/admin/product-categories');
      categorySelect.innerHTML = '<option value="">無類別</option>';
      rows.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        categorySelect.appendChild(option);
      });
    }
    
    async function loadProducts() {
      if (!prodTable) return;
      const rows = await api('GET', '/api/admin/products');
      const tbody = prodTable.querySelector('tbody');
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.name}</td><td>NT$ ${Number(r.price || 0).toLocaleString()}</td><td>${r.category_name || '—'}</td><td>${r.is_published ? '上架' : '下架'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
        tbody.appendChild(tr);
      });
      tbody.addEventListener('click', async (e) => {
        const id = e.target.dataset.edit || e.target.dataset.del;
        if (!id) return;
        if (e.target.dataset.edit) {
          const product = await api('GET', `/api/admin/products/${id}`);
          if (!product) return;
          prodForm.querySelector('[name="id"]').value = product.id;
          prodForm.querySelector('[name="name"]').value = product.name || '';
          prodForm.querySelector('[name="price"]').value = product.price || 0;
          if (categorySelect) categorySelect.value = product.category_id || '';
          prodForm.querySelector('[name="cover_media_id"]').value = product.cover_media_id || '';
          if (descEditor) descEditor.innerHTML = product.description_html || '';
          prodForm.querySelector('[name="is_published"]').checked = !!product.is_published;
          
          // Load product images
          productImages = (product.images || []).map(img => ({ media_id: img.media_id, file_path: img.file_path, file_name: img.file_name }));
          renderProductImages();
        } else if (e.target.dataset.del) {
          if (!confirm('確定刪除？')) return;
          await api('DELETE', `/api/admin/products/${id}`);
          await loadProducts();
          prodForm.reset();
          if (descEditor) descEditor.innerHTML = '';
          productImages = [];
          renderProductImages();
        }
      });
    }
    
    function renderProductImages() {
      if (!imagesList) return;
      imagesList.innerHTML = '';
      productImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'product-image-item';
        item.innerHTML = `
          <img src="${img.file_path}" alt="${img.file_name}">
          <button class="remove-btn" data-index="${index}">×</button>
        `;
        item.querySelector('.remove-btn').addEventListener('click', () => {
          productImages.splice(index, 1);
          renderProductImages();
        });
        imagesList.appendChild(item);
      });
    }
    
    // Media picker
    const picker = document.getElementById('product-picker');
    const pickerGrid = document.getElementById('product-picker-grid');
    const pickerPager = document.getElementById('product-picker-pager');
    let pickerMode = 'cover'; // 'cover' or 'images'
    
    async function loadMediaForPicker(page = 1) {
      if (!pickerGrid || !pickerPager) return;
      const data = await api('GET', `/api/admin/media?page=${page}&limit=24`);
      pickerGrid.innerHTML = '';
      data.items.forEach(it => {
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.style.display = 'block';
        btn.style.padding = '0';
        btn.style.borderRadius = '12px';
        btn.style.overflow = 'hidden';
        btn.style.border = '1px solid #e5e7eb';
        btn.style.background = '#fff';
        btn.innerHTML = `<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style="padding:8px 10px;font-size:12px;color:#374151;">${it.file_name}</div>`;
        btn.addEventListener('click', () => {
          if (pickerMode === 'cover') {
            prodForm.querySelector('[name="cover_media_id"]').value = it.id || '';
          } else if (pickerMode === 'description') {
            // Insert image into description editor at cursor position
            if (descEditor) {
              insertImageAtCursor(descEditor, it.file_path);
            }
          } else {
            productImages.push({ media_id: it.id, file_path: it.file_path, file_name: it.file_name });
            renderProductImages();
          }
          picker.style.display = 'none';
        });
        pickerGrid.appendChild(btn);
      });
      pickerPager.innerHTML = '';
      const totalPages = Math.ceil(data.total / data.limit);
      for (let i = 1; i <= totalPages; i++) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = i;
        a.className = 'btn ghost';
        a.style.padding = '6px 10px';
        a.style.borderRadius = '8px';
        if (i === data.page) a.style.background = '#111827', a.style.color = '#fff';
        a.addEventListener('click', (e) => { e.preventDefault(); loadMediaForPicker(i); });
        pickerPager.appendChild(a);
      }
    }
    
    document.getElementById('product-cover-pick')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickerMode = 'cover';
      picker.style.display = 'flex';
      loadMediaForPicker(1);
    });
    
    document.getElementById('product-images-pick')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickerMode = 'images';
      picker.style.display = 'flex';
      loadMediaForPicker(1);
    });
    
    // Upload handlers
    document.getElementById('product-cover-upload')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('product-cover-file')?.click();
    });
    
    document.getElementById('product-cover-file')?.addEventListener('change', async (e) => {
      if (!e.target.files || !e.target.files[0]) return;
      try {
        const csrf = await getCsrf();
        const fd = new FormData();
        fd.append('file', e.target.files[0]);
        const res = await fetch('/api/admin/media/upload', { method: 'POST', headers: { 'CSRF-Token': csrf }, body: fd, credentials: 'same-origin' });
        const j = await res.json();
        console.log('[Product Cover Upload] Response:', j);
        if (j && j.media_id) {
          prodForm.querySelector('[name="cover_media_id"]').value = j.media_id;
          alert('封面圖片上傳成功！');
        } else {
          alert('上傳失敗：' + (j?.error || '未知錯誤'));
        }
      } catch (err) {
        console.error('[Product Cover Upload] Error:', err);
        alert('上傳失敗：' + err.message);
      }
    });
    
    document.getElementById('product-images-upload')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('product-images-file')?.click();
    });
    
    document.getElementById('product-images-file')?.addEventListener('change', async (e) => {
      if (!e.target.files || !e.target.files.length) return;
      try {
        const csrf = await getCsrf();
        let successCount = 0;
        for (const file of Array.from(e.target.files)) {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/admin/media/upload', { method: 'POST', headers: { 'CSRF-Token': csrf }, body: fd, credentials: 'same-origin' });
          const j = await res.json();
          console.log('[Product Images Upload] Response:', j);
          if (j && j.media_id) {
            // Get file_path from response or construct it
            const filePath = j.file_path || j.path || `/uploads/${j.file_name || file.name}`;
            productImages.push({ media_id: j.media_id, file_path: filePath, file_name: j.file_name || file.name });
            successCount++;
          }
        }
        if (successCount > 0) {
          renderProductImages();
          alert(`成功上傳 ${successCount} 張圖片！`);
        } else {
          alert('上傳失敗，請重試');
        }
      } catch (err) {
        console.error('[Product Images Upload] Error:', err);
        alert('上傳失敗：' + err.message);
      }
    });
    
    // Description editor toolbar
    const descToolbar = document.createElement('div');
    descToolbar.className = 'toolbar';
    descToolbar.innerHTML = `
      <button data-cmd="bold">粗體</button>
      <button data-cmd="italic">斜體</button>
      <button data-cmd="insertUnorderedList">項目符號</button>
      <button data-cmd="formatBlock" data-value="h2">H2</button>
      <button id="product-desc-insert-img" class="ghost">選擇圖片</button>
      <button id="product-desc-upload-img" class="ghost">上傳圖片</button>
      <input type="file" id="product-desc-upload-file" accept="image/*" style="display:none">
    `;
    if (descEditor && descEditor.parentNode) {
      descEditor.parentNode.insertBefore(descToolbar, descEditor);
    }
    descToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      const cmd = btn.getAttribute('data-cmd');
      const val = btn.getAttribute('data-value') || null;
      document.execCommand(cmd, false, val);
    });
    
    // Insert image from media picker
    document.getElementById('product-desc-insert-img')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickerMode = 'description';
      picker.style.display = 'flex';
      loadMediaForPicker(1);
    });
    
    // Upload image for description
    document.getElementById('product-desc-upload-img')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('product-desc-upload-file')?.click();
    });
    
    document.getElementById('product-desc-upload-file')?.addEventListener('change', async (e) => {
      if (!e.target.files || !e.target.files[0]) return;
      try {
        const csrf = await getCsrf();
        const fd = new FormData();
        fd.append('file', e.target.files[0]);
        const res = await fetch('/api/admin/media/upload', { method: 'POST', headers: { 'CSRF-Token': csrf }, body: fd, credentials: 'same-origin' });
        const j = await res.json();
        console.log('[Product Desc Upload] Response:', j);
        if (j && (j.file_path || j.path)) {
          if (descEditor) {
            insertImageAtCursor(descEditor, j.file_path || j.path);
            alert('圖片已插入！');
          }
        } else {
          alert('上傳失敗：' + (j?.error || '未知錯誤'));
        }
      } catch (err) {
        console.error('[Product Desc Upload] Error:', err);
        alert('上傳失敗：' + err.message);
      }
    });
    
    // Close picker button
    document.getElementById('product-picker-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      picker.style.display = 'none';
    });
    
    if (prodForm) {
      prodForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(prodForm);
        const data = Object.fromEntries(fd.entries());
        data.description_html = descEditor ? descEditor.innerHTML : '';
        data.is_published = prodForm.querySelector('[name="is_published"]').checked ? 1 : 0;
        data.images = productImages;
        // Normalize empty strings to null
        if (data.category_id === '') data.category_id = null;
        if (data.cover_media_id === '') data.cover_media_id = null;
        const id = data.id;
        delete data.id;
        try {
          if (id) {
            await api('PUT', `/api/admin/products/${id}`, data);
          } else {
            await api('POST', '/api/admin/products', data);
          }
          alert('儲存成功！');
          await loadProducts();
          prodForm.reset();
          if (descEditor) descEditor.innerHTML = '';
          productImages = [];
          renderProductImages();
        } catch (err) {
          console.error('Save error:', err);
          alert('儲存失敗：' + (err.message || '未知錯誤'));
        }
      });
    }
    
    if (prodDelete) {
      prodDelete.addEventListener('click', async () => {
        const id = prodForm.querySelector('[name="id"]').value;
        if (!id) return;
        if (!confirm('確定刪除？')) return;
        await api('DELETE', `/api/admin/products/${id}`);
        await loadProducts();
        prodForm.reset();
        if (descEditor) descEditor.innerHTML = '';
        productImages = [];
        renderProductImages();
      });
    }
    
    await loadCategories();
    await loadCategoriesForSelect();
    await loadProducts();
  }

  function bindLogout() {
    const btn = document.getElementById('logout');
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const csrf = await getCsrf();
      await fetch('/api/admin/logout', { method: 'POST', headers: { 'CSRF-Token': csrf } });
      location.href = '/admin/login.html';
    });
  }

  async function init() {
    const page = getPage();
    await guard();
    await injectAdminHeader();
    if (page === 'login.html') { await initLogin(); return; }
    if (page === 'settings.html') await initSettings();
    if (page === 'menus.html') await initMenus();
    if (page === 'pages.html') await bindCrudList('pages');
    if (page === 'posts.html') { await initPostsEditor(); }
    if (page === 'news.html') await bindCrudList('news');
    if (page === 'news.html') await initNewsEditor();
    if (page === 'leaderboard.html') { await initLegendEditor(); await initLegendPicker(); }
    if (page === 'plans.html') await initPlansEditor();
    if (page === 'trial.html') await initTrial();
    if (page === 'contacts.html') await initContacts();
    if (page === 'media.html') await initMedia();
    if (page === 'users.html') await initUsers();
    if (page === 'members.html') await initMembers();
    if (page === 'change-password.html') await initChangePassword();
    if (page === 'index.html') await initSlides();
    if (page === 'courses.html' || page === 'materials.html') await initCoursesMaterials();
    if (page === 'products.html') await initProducts();
    
    // Updated initializers
    if (page === 'about.html') await initAboutEditors();
    if (page === 'services.html') await initServicesEditors();
    if (page === 'media-records.html') await initMediaRecordsEditor();
    if (page === 'booking.html') await initBookingManager();
  }
  
  // ========== 預約報名系統（後台） ==========
  async function initBookingManager() {
    let currentDate = new Date();
    let currentYear = currentDate.getFullYear();
    let currentMonth = currentDate.getMonth();
    
    const calendarEl = document.getElementById('admin-calendar');
    const monthLabel = document.getElementById('current-month');
    const prevBtn = document.getElementById('prev-month');
    const nextBtn = document.getElementById('next-month');
    const eventsTable = document.getElementById('events-tbody');
    const createBtn = document.getElementById('create-event-btn');
    const formModal = document.getElementById('event-form-modal');
    const eventForm = document.getElementById('event-form');
    const closeFormBtn = document.getElementById('close-event-form');
    const cancelFormBtn = document.getElementById('cancel-event-form');
    
    if (!calendarEl) return;
    
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    
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
          
          dayEl.className = 'calendar-day';
          if (!isCurrentMonth) dayEl.classList.add('other-month');
          if (isToday) dayEl.classList.add('today');
          
          dayEl.innerHTML = `
            <div class="calendar-day-number">${currentDate.getDate()}</div>
            <div class="calendar-day-events">
              ${(eventsByDate[dateStr] || []).map(e => {
                const colors = { course: '#4A90E2', performance: '#E94B3C', space: '#7B68EE' };
                return `<div style="display:flex;align-items:center;gap:2px;"><span style="width:6px;height:6px;border-radius:50%;background:${colors[e.event_type]};display:inline-block;"></span><span style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.title}</span></div>`;
              }).join('')}
            </div>
          `;
          
          dayEl.addEventListener('click', () => {
            if (isCurrentMonth) {
              const dateInput = document.getElementById('event-date');
              if (dateInput) dateInput.value = dateStr;
              formModal.style.display = 'flex';
              eventForm.reset();
              document.getElementById('event-id').value = '';
              document.getElementById('event-form-title').textContent = '新增活動';
            }
          });
          
          calendarEl.appendChild(dayEl);
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });
      
      if (monthLabel) {
        monthLabel.textContent = `${currentYear}年 ${currentMonth + 1}月`;
      }
    }
    
    async function loadEventsForMonth() {
      try {
        const events = await api('GET', `/api/admin/events?year=${currentYear}&month=${currentMonth + 1}`);
        const eventsByDate = {};
        events.forEach(e => {
          if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = [];
          eventsByDate[e.event_date].push(e);
        });
        return eventsByDate;
      } catch (err) {
        console.error('Error loading events:', err);
        return {};
      }
    }
    
    async function loadEventsList() {
      try {
        const events = await api('GET', `/api/admin/events?year=${currentYear}&month=${currentMonth + 1}`);
        if (!eventsTable) return;
        
        // 過濾掉已結束的活動（event_date < 今天）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];
        
        const activeEvents = events.filter(e => {
          const eventDate = new Date(e.event_date);
          eventDate.setHours(0, 0, 0, 0);
          const eventDateStr = eventDate.toISOString().split('T')[0];
          return eventDateStr >= todayStr;
        });
        
        eventsTable.innerHTML = '';
        if (activeEvents.length === 0) {
          eventsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#999;">本月無活動</td></tr>';
          return;
        }
        
        activeEvents.forEach(e => {
          const tr = document.createElement('tr');
          const typeNames = { course: '音樂課程', performance: '商業演出', space: '共享空間租借' };
          tr.innerHTML = `
            <td style="padding:8px;">${e.event_date}</td>
            <td style="padding:8px;">${typeNames[e.event_type] || e.event_type}</td>
            <td style="padding:8px;">${e.title}</td>
            <td style="padding:8px;">${e.start_time || ''} ${e.end_time ? '-' + e.end_time : ''}</td>
            <td style="padding:8px;">${e.is_active ? '啟用' : '關閉'}</td>
            <td style="padding:8px;">
              <button data-edit="${e.id}" style="margin-right:4px;">編輯</button>
              <button data-del="${e.id}">刪除</button>
            </td>
          `;
          eventsTable.appendChild(tr);
        });
      } catch (err) {
        console.error('Error loading events list:', err);
      }
    }
    
    prevBtn?.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar();
      loadEventsList();
    });
    
    nextBtn?.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar();
      loadEventsList();
    });
    
    // 日期選擇相關變數
    let selectedDates = new Set();
    let datePickerYear = currentYear;
    let datePickerMonth = currentMonth;
    
    createBtn?.addEventListener('click', () => {
      eventForm.reset();
      document.getElementById('event-id').value = '';
      document.getElementById('event-form-title').textContent = '新增活動';
      selectedDates.clear();
      datePickerYear = currentYear;
      datePickerMonth = currentMonth;
      renderDatePicker();
      updateSelectedDatesDisplay();
      formModal.style.display = 'flex';
    });
    
    closeFormBtn?.addEventListener('click', () => {
      formModal.style.display = 'none';
    });
    
    cancelFormBtn?.addEventListener('click', () => {
      formModal.style.display = 'none';
    });
    
    // 渲染日期選擇器
    function renderDatePicker() {
      const calendarEl = document.getElementById('date-picker-calendar');
      const monthLabel = document.getElementById('date-picker-month');
      if (!calendarEl) return;
      
      const firstDay = new Date(datePickerYear, datePickerMonth, 1);
      const lastDay = new Date(datePickerYear, datePickerMonth + 1, 0);
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      
      calendarEl.innerHTML = '';
      
      // 星期標題
      dayNames.forEach(day => {
        const header = document.createElement('div');
        header.style.textAlign = 'center';
        header.style.fontWeight = '600';
        header.style.padding = '8px';
        header.style.fontSize = '14px';
        header.style.color = '#666';
        header.textContent = day;
        calendarEl.appendChild(header);
      });
      
      // 日期格子
      const currentDate = new Date(startDate);
      for (let i = 0; i < 42; i++) {
        const dayEl = document.createElement('div');
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const isCurrentMonth = currentDate.getMonth() === datePickerMonth;
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        const isSelected = selectedDates.has(dateStr);
        
        dayEl.style.aspectRatio = '1';
        dayEl.style.border = isSelected ? '2px solid #111827' : '1px solid #e5e7eb';
        dayEl.style.borderRadius = '8px';
        dayEl.style.padding = '8px';
        dayEl.style.cursor = isCurrentMonth ? 'pointer' : 'default';
        dayEl.style.transition = 'all 0.2s';
        dayEl.style.background = isSelected ? '#111827' : (isCurrentMonth ? '#fff' : '#f9fafb');
        dayEl.style.color = isSelected ? '#fff' : (isCurrentMonth ? '#111827' : '#999');
        dayEl.style.opacity = isCurrentMonth ? '1' : '0.3';
        dayEl.style.fontWeight = isToday ? '700' : '500';
        dayEl.style.fontSize = '14px';
        dayEl.style.display = 'flex';
        dayEl.style.alignItems = 'center';
        dayEl.style.justifyContent = 'center';
        dayEl.textContent = currentDate.getDate();
        
        if (isCurrentMonth) {
          dayEl.addEventListener('click', () => {
            if (selectedDates.has(dateStr)) {
              selectedDates.delete(dateStr);
            } else {
              selectedDates.add(dateStr);
            }
            renderDatePicker();
            updateSelectedDatesDisplay();
          });
        }
        
        calendarEl.appendChild(dayEl);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      if (monthLabel) {
        monthLabel.textContent = `${datePickerYear}年 ${datePickerMonth + 1}月`;
      }
    }
    
    // 更新已選日期顯示
    function updateSelectedDatesDisplay() {
      const tagsEl = document.getElementById('selected-dates-tags');
      if (!tagsEl) return;
      
      if (selectedDates.size === 0) {
        tagsEl.innerHTML = '<span style="color:#999;font-size:14px;">尚未選擇日期</span>';
        return;
      }
      
      const sortedDates = Array.from(selectedDates).sort();
      tagsEl.innerHTML = sortedDates.map(dateStr => {
        const date = new Date(dateStr);
        const formatted = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
        return `
          <span style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:#111827;color:#fff;border-radius:6px;font-size:14px;">
            ${formatted}
            <button type="button" data-remove-date="${dateStr}" style="background:none;border:none;color:#fff;cursor:pointer;padding:0;margin:0;font-size:16px;line-height:1;">×</button>
          </span>
        `;
      }).join('');
      
      // 綁定移除按鈕
      tagsEl.querySelectorAll('[data-remove-date]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const dateStr = e.target.closest('[data-remove-date]').getAttribute('data-remove-date');
          selectedDates.delete(dateStr);
          renderDatePicker();
          updateSelectedDatesDisplay();
        });
      });
    }
    
    // 日期選擇器月份切換
    document.getElementById('date-picker-prev-month')?.addEventListener('click', () => {
      datePickerMonth--;
      if (datePickerMonth < 0) {
        datePickerMonth = 11;
        datePickerYear--;
      }
      renderDatePicker();
    });
    
    document.getElementById('date-picker-next-month')?.addEventListener('click', () => {
      datePickerMonth++;
      if (datePickerMonth > 11) {
        datePickerMonth = 0;
        datePickerYear++;
      }
      renderDatePicker();
    });
    
    eventForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(eventForm);
      const data = Object.fromEntries(fd.entries());
      data.is_active = document.getElementById('event-is-active').checked ? 1 : 0;
      const id = data.id;
      delete data.id;
      
      // 編輯模式：單個活動更新
      if (id) {
        try {
          // 從選中的日期中獲取 event_date（編輯時應該只有一個日期）
          if (selectedDates.size > 0) {
            const selectedDate = Array.from(selectedDates)[0];
            data.event_date = selectedDate;
          }
          // 如果沒有選中日期，嘗試從表單中獲取（fallback）
          if (!data.event_date) {
            const dateInput = document.getElementById('event-date');
            if (dateInput && dateInput.value) {
              data.event_date = dateInput.value;
            }
          }
          
          await api('PUT', `/api/admin/events/${id}`, data);
          formModal.style.display = 'none';
          // 如果日期改變了，切換到新的月份
          if (data.event_date) {
            const newDate = new Date(data.event_date);
            const newYear = newDate.getFullYear();
            const newMonth = newDate.getMonth();
            if (newYear !== currentYear || newMonth !== currentMonth) {
              currentYear = newYear;
              currentMonth = newMonth;
            }
          }
          renderCalendar();
          loadEventsList();
          alert('儲存成功');
        } catch (err) {
          alert('儲存失敗：' + (err.message || '未知錯誤'));
        }
        return;
      }
      
      // 新增模式：為每個選中的日期創建活動
      if (selectedDates.size === 0) {
        alert('請至少選擇一個日期');
        return;
      }
      
      const submitBtn = document.getElementById('event-submit-btn');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = '建立中...';
      
      try {
        const dates = Array.from(selectedDates).sort();
        let successCount = 0;
        let failCount = 0;
        
        for (const dateStr of dates) {
          try {
            const eventData = { ...data, event_date: dateStr };
            await api('POST', '/api/admin/events', eventData);
            successCount++;
          } catch (err) {
            console.error(`Failed to create event for ${dateStr}:`, err);
            failCount++;
          }
        }
        
        if (successCount > 0) {
          alert(`成功建立 ${successCount} 個活動${failCount > 0 ? `，${failCount} 個失敗` : ''}`);
          formModal.style.display = 'none';
          selectedDates.clear();
          renderCalendar();
          loadEventsList();
        } else {
          alert('所有活動建立失敗，請檢查資料是否正確');
        }
      } catch (err) {
        alert('儲存失敗：' + (err.message || '未知錯誤'));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
    
    eventsTable?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.edit || btn.dataset.del;
      if (!id) return;
      
      if (e.target.dataset.edit) {
        try {
          const event = await api('GET', `/api/admin/events/${id}`);
          document.getElementById('event-id').value = event.id;
          document.getElementById('event-type').value = event.event_type;
          document.getElementById('event-title').value = event.title || '';
          document.getElementById('event-description').value = event.description || '';
          document.getElementById('event-start-time').value = event.start_time || '';
          document.getElementById('event-end-time').value = event.end_time || '';
          document.getElementById('event-max-participants').value = event.max_participants || '';
          document.getElementById('event-is-active').checked = !!event.is_active;
          document.getElementById('event-form-title').textContent = '編輯活動';
          
          // 編輯模式：只顯示單個日期
          selectedDates.clear();
          selectedDates.add(event.event_date);
          const eventDate = new Date(event.event_date);
          datePickerYear = eventDate.getFullYear();
          datePickerMonth = eventDate.getMonth();
          renderDatePicker();
          updateSelectedDatesDisplay();
          
          formModal.style.display = 'flex';
        } catch (err) {
          alert('載入失敗：' + (err.message || '未知錯誤'));
        }
      } else if (e.target.dataset.del) {
        if (!confirm('確定刪除這個活動？')) return;
        try {
          await api('DELETE', `/api/admin/events/${id}`);
          renderCalendar();
          loadEventsList();
        } catch (err) {
          alert('刪除失敗：' + (err.message || '未知錯誤'));
        }
      }
    });
    
    // 載入最新預約記錄（帶分頁）
    let registrationsPage = 1;
    const registrationsPerPage = 10;
    let totalRegistrations = 0;
    
    async function loadLatestRegistrations(page = 1) {
      const container = document.getElementById('latest-registrations');
      if (!container) return;
      
      try {
        // 先獲取總數（通過請求一個較大的 limit 來估算，或使用分頁 API）
        // 為了簡單起見，我們先獲取所有記錄，然後在前端分頁
        const allRegistrations = await api('GET', '/api/admin/events/registrations/latest?limit=100');
        totalRegistrations = allRegistrations ? allRegistrations.length : 0;
        
        if (!allRegistrations || allRegistrations.length === 0) {
          container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">尚無預約記錄</div>';
          return;
        }
        
        // 前端分頁
        const startIndex = (page - 1) * registrationsPerPage;
        const endIndex = startIndex + registrationsPerPage;
        const registrations = allRegistrations.slice(startIndex, endIndex);
        const totalPages = Math.ceil(totalRegistrations / registrationsPerPage);
        
        const typeNames = { course: '音樂課程', performance: '商業演出', space: '共享空間' };
        const typeColors = { course: '#4A90E2', performance: '#E94B3C', space: '#7B68EE' };
        
        container.innerHTML = '';
        
        // 顯示分頁控制
        if (totalPages > 1) {
          const pager = document.createElement('div');
          pager.style.display = 'flex';
          pager.style.justifyContent = 'space-between';
          pager.style.alignItems = 'center';
          pager.style.marginBottom = '12px';
          pager.style.padding = '8px';
          pager.style.background = '#f9fafb';
          pager.style.borderRadius = '6px';
          pager.innerHTML = `
            <button id="reg-prev-page" class="btn ghost sm" ${page === 1 ? 'disabled' : ''} style="padding:4px 8px;font-size:12px;">‹ 上一頁</button>
            <span style="font-size:12px;color:#666;">第 ${page} / ${totalPages} 頁（共 ${totalRegistrations} 筆）</span>
            <button id="reg-next-page" class="btn ghost sm" ${page === totalPages ? 'disabled' : ''} style="padding:4px 8px;font-size:12px;">下一頁 ›</button>
          `;
          container.appendChild(pager);
          
          document.getElementById('reg-prev-page')?.addEventListener('click', () => {
            if (page > 1) {
              registrationsPage = page - 1;
              loadLatestRegistrations(registrationsPage);
            }
          });
          
          document.getElementById('reg-next-page')?.addEventListener('click', () => {
            if (page < totalPages) {
              registrationsPage = page + 1;
              loadLatestRegistrations(registrationsPage);
            }
          });
        }
        
        registrations.forEach(reg => {
          const date = new Date(reg.event_date);
          const formattedDate = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
          const timeStr = reg.start_time ? ` ${reg.start_time}` : '';
          const statusColors = {
            'interested': '#3b82f6',
            'confirmed': '#10b981',
            'cancelled': '#ef4444',
            'pending': '#f59e0b',
            'contacted': '#8b5cf6'
          };
          const statusNames = {
            'interested': '有興趣',
            'confirmed': '已確認',
            'cancelled': '已取消',
            'pending': '待處理',
            'contacted': '已聯繫'
          };
          
          const item = document.createElement('div');
          item.style.padding = '12px';
          item.style.borderBottom = '1px solid #e5e7eb';
          item.style.transition = 'background 0.2s';
          item.style.cursor = 'default';
          
          item.addEventListener('mouseenter', () => {
            item.style.background = '#f9fafb';
          });
          item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
          });
          
          const statusSelect = document.createElement('select');
          statusSelect.style.padding = '4px 8px';
          statusSelect.style.borderRadius = '4px';
          statusSelect.style.border = '1px solid #e5e7eb';
          statusSelect.style.fontSize = '11px';
          statusSelect.style.background = statusColors[reg.status] || '#999';
          statusSelect.style.color = '#fff';
          statusSelect.style.fontWeight = '500';
          statusSelect.style.cursor = 'pointer';
          
          const statusOptions = [
            { value: 'interested', label: '有興趣' },
            { value: 'contacted', label: '已聯繫' },
            { value: 'confirmed', label: '已確認' },
            { value: 'cancelled', label: '已取消' },
            { value: 'pending', label: '待處理' }
          ];
          
          statusOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === reg.status) option.selected = true;
            statusSelect.appendChild(option);
          });
          
          statusSelect.addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            try {
              await api('PUT', `/api/admin/events/registrations/${reg.id}`, { status: newStatus });
              statusSelect.style.background = statusColors[newStatus] || '#999';
              loadLatestRegistrations(registrationsPage); // 重新載入以更新顯示（保持當前頁碼）
            } catch (err) {
              alert('更新狀態失敗：' + (err.message || '未知錯誤'));
              e.target.value = reg.status; // 恢復原值
            }
          });
          
          item.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
              <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;margin-bottom:4px;color:#111827;">
                  ${reg.name || '未提供姓名'}
                </div>
                <div style="font-size:12px;color:#666;margin-bottom:2px;">
                  ${reg.event_title || '未命名活動'}
                </div>
                <div style="font-size:12px;color:#666;">
                  ${formattedDate}${timeStr}
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;margin-bottom:8px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${typeColors[reg.event_type] || '#999'};"></span>
              <span style="font-size:11px;color:#666;">${typeNames[reg.event_type] || reg.event_type}</span>
            </div>
            <div style="margin-bottom:8px;">
              <label style="font-size:11px;color:#666;display:block;margin-bottom:4px;">狀態：</label>
            </div>
            ${reg.phone_mobile ? `<div style="font-size:11px;color:#666;margin-top:4px;">📞 ${reg.phone_mobile}</div>` : ''}
            ${reg.email ? `<div style="font-size:11px;color:#666;">✉️ ${reg.email}</div>` : ''}
          `;
          
          const statusContainer = item.querySelector('div:last-of-type');
          if (statusContainer) {
            statusContainer.appendChild(statusSelect);
          }
          
          container.appendChild(item);
        });
      } catch (err) {
        console.error('Error loading latest registrations:', err);
        container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#c00;">載入失敗</div>';
      }
    }
    
    // 定期更新最新預約記錄（每30秒）
    loadLatestRegistrations(1);
    setInterval(() => loadLatestRegistrations(registrationsPage), 30000);
    
    renderCalendar();
    loadEventsList();
  }

  window.addEventListener('DOMContentLoaded', init);

  // POSTS rich editor (kept as is)
  async function initPostsEditor() {
    const table = document.getElementById('posts-table');
    const form = document.getElementById('posts-form');
    const editor = document.getElementById('post-editor');
    const toolbar = document.getElementById('post-toolbar');
    if (!table || !form || !editor) return;
    // load list
    const rows = await api('GET', '/api/admin/posts');
    const tbody = table.querySelector('tbody'); tbody.innerHTML = '';
    rows.forEach(r => { const tr=document.createElement('tr'); tr.innerHTML = `<td>${r.id}</td><td>${r.title}</td><td>${r.slug}</td><td>${r.is_published ? '✔' : '—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`; tbody.appendChild(tr); });
    // toolbar
    toolbar?.addEventListener('click', (e) => { const btn=e.target.closest('[data-cmd]'); if (!btn) return; const cmd=btn.getAttribute('data-cmd'); const val=btn.getAttribute('data-value')||null; document.execCommand(cmd,false,val); });
    document.getElementById('post-insert-img')?.addEventListener('click', ()=> document.getElementById('post-insert-file').click());
    document.getElementById('post-insert-file')?.addEventListener('change', async (e) => { const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.path){ const img=document.createElement('img'); img.src=j.path; img.alt=''; editor.appendChild(img);} });
    // pick/upload cover
    const picker = document.getElementById('posts-picker'); const pickerGrid=document.getElementById('posts-picker-grid'); const pickerPager=document.getElementById('posts-picker-pager');
    async function loadMedia(page=1){ const data=await api('GET', `/api/admin/media?page=${page}&limit=24`); pickerGrid.innerHTML=''; data.items.forEach(it=>{ const btn=document.createElement('button'); btn.className='btn ghost'; btn.style.display='block'; btn.style.padding='0'; btn.style.borderRadius='12px'; btn.style.overflow='hidden'; btn.style.border='1px solid #e5e7eb'; btn.style.background='#fff'; btn.innerHTML=`<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style="padding:8px 10px;font-size:12px;color:#374151;">${it.file_name}</div>`; btn.addEventListener('click',()=>{ document.getElementById('post-cover').value = it.id || ''; picker.style.display='none'; }); pickerGrid.appendChild(btn); }); pickerPager.innerHTML=''; const totalPages=Math.ceil(data.total/data.limit); for(let i=1;i<=totalPages;i++){ const a=document.createElement('a'); a.href='#'; a.textContent=i; a.className='btn ghost'; a.style.padding='6px 10px'; a.style.borderRadius='8px'; if (i===data.page){ a.style.background='#111827'; a.style.color='#fff'; } a.addEventListener('click',(e)=>{e.preventDefault(); loadMedia(i);}); pickerPager.appendChild(a);} }
    document.getElementById('posts-picker-close')?.addEventListener('click',(e)=>{e.preventDefault(); picker.style.display='none';});
    document.getElementById('post-cover-pick')?.addEventListener('click',()=>{ picker.style.display='block'; loadMedia(1); });
    document.getElementById('post-cover-upload')?.addEventListener('click',()=> document.getElementById('post-cover-file').click());
    document.getElementById('post-cover-file')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.media_id) document.getElementById('post-cover').value=j.media_id; });
    // edit/delete
    tbody.addEventListener('click', async (e)=>{
      const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return;
      if (e.target.dataset.edit){ const r = rows.find(x=> String(x.id)===String(id)); if (!r) return; document.getElementById('post-title').value=r.title||''; document.getElementById('post-slug').value=r.slug||''; document.getElementById('post-excerpt').value=r.excerpt||''; editor.innerHTML=r.content_html||''; document.getElementById('post-cover').value=r.cover_media_id||''; document.getElementById('post-published').value=r.published_at||''; document.getElementById('post-published-flag').checked=!!r.is_published; form.querySelector('[name="id"]').value=r.id; }
      else if (e.target.dataset.del){ if (!confirm('確定刪除？')) return; await api('DELETE', `/api/admin/posts/${id}`); location.reload(); }
    });
    form.addEventListener('submit', async (e)=>{ e.preventDefault(); const fd=new FormData(form); const data=Object.fromEntries(fd.entries()); data.excerpt=document.getElementById('post-excerpt').value; data.content_html=editor.innerHTML; data.cover_media_id=document.getElementById('post-cover').value||null; data.published_at=document.getElementById('post-published').value||null; data.is_published=document.getElementById('post-published-flag').checked?1:0; const id=data.id; delete data.id; if (id) await api('PUT', `/api/admin/posts/${id}`, data); else await api('POST', '/api/admin/posts', data); location.reload(); });
  }

  // PLANS rich editor (same UX as posts/news)
  async function initPlansEditor() {
    const table = document.getElementById('plans-table');
    const form = document.getElementById('plans-form');
    const editor = document.getElementById('plan-editor');
    const toolbar = document.getElementById('plan-toolbar');
    if (!table || !form || !editor) return;
    const rows = await api('GET', '/api/admin/plans');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.id}</td><td>${r.name || ''}</td><td>${r.slug || ''}</td><td>${r.is_published ? '✔' : '—'}</td><td><button data-edit="${r.id}">編輯</button> <button data-del="${r.id}">刪除</button></td>`;
      tbody.appendChild(tr);
    });
    toolbar?.addEventListener('click', (e) => { const btn=e.target.closest('[data-cmd]'); if (!btn) return; const cmd=btn.getAttribute('data-cmd'); const val=btn.getAttribute('data-value')||null; document.execCommand(cmd,false,val); });
    document.getElementById('plan-insert-img')?.addEventListener('click', ()=> document.getElementById('plan-insert-file').click());
    document.getElementById('plan-insert-file')?.addEventListener('change', async (e) => { const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.path || j?.file_path) { insertImageAtCursor(editor, j.path || j.file_path); } });
    // cover pick/upload
    const picker = document.createElement('div'); picker.id='plans-picker'; picker.className='modal'; picker.style.display='none'; picker.innerHTML = `<div class="modal-card"><header><strong>選擇封面</strong><button id="plans-picker-close" class="btn ghost">✕</button></header><div id="plans-picker-grid" class="grid horizontal-cards"></div><footer id="plans-picker-pager"></footer></div>`; document.body.appendChild(picker);
    const pickerGrid = picker.querySelector('#plans-picker-grid'); const pickerPager = picker.querySelector('#plans-picker-pager');
    async function loadMedia(page=1){ const data=await api('GET', `/api/admin/media?page=${page}&limit=24`); pickerGrid.innerHTML=''; data.items.forEach(it=>{ const btn=document.createElement('button'); btn.className='btn ghost'; btn.style.display='block'; btn.style.padding='0'; btn.style.borderRadius='12px'; btn.style.overflow='hidden'; btn.style.border='1px solid #e5e7eb'; btn.style.background='#fff'; btn.innerHTML=`<img src="${it.file_path}" alt="" style="width:100%;height:120px;object-fit:cover"><div style="padding:8px 10px;font-size:12px;color:#374151;">${it.file_name}</div>`; btn.addEventListener('click',()=>{ document.getElementById('plan-cover').value = it.id || ''; picker.style.display='none'; }); pickerGrid.appendChild(btn); }); pickerPager.innerHTML=''; const totalPages=Math.ceil(data.total/data.limit); for(let i=1;i<=totalPages;i++){ const a=document.createElement('a'); a.href='#'; a.textContent=i; a.className='btn ghost'; a.style.padding='6px 10px'; a.style.borderRadius='8px'; if (i===data.page){ a.style.background='#111827'; a.style.color='#fff'; } a.addEventListener('click',(e)=>{e.preventDefault(); loadMedia(i);}); pickerPager.appendChild(a);} }
    picker.querySelector('#plans-picker-close')?.addEventListener('click',(e)=>{e.preventDefault(); picker.style.display='none';});
    document.getElementById('plan-cover-pick')?.addEventListener('click',()=>{ picker.style.display='block'; loadMedia(1); });
    document.getElementById('plan-cover-upload')?.addEventListener('click',()=> document.getElementById('plan-cover-file').click());
    document.getElementById('plan-cover-file')?.addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if (!f) return; const csrf=await getCsrf(); const fd=new FormData(); fd.append('file', f); const res=await fetch('/api/admin/media/upload',{method:'POST', headers:{'CSRF-Token': csrf}, body: fd, credentials:'same-origin'}); const j=await res.json(); if (j?.media_id) document.getElementById('plan-cover').value=j.media_id; });
    // edit/delete
    tbody.addEventListener('click', async (e) => {
      const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return;
      if (e.target.dataset.edit) {
        const r = rows.find(x => String(x.id) === String(id)); if (!r) return;
        form.querySelector('[name="name"]').value = r.name || '';
        form.querySelector('[name="price"]').value = r.price || '';
        form.querySelector('[name="tagline"]').value = r.tagline || '';
        form.querySelector('[name="is_active"]').checked = !!r.is_active;
        document.getElementById('plan-slug').value = r.slug || '';
        editor.innerHTML = r.content_html || '';
        document.getElementById('plan-cover').value = r.cover_media_id || '';
        document.getElementById('plan-published').value = r.published_at || '';
        document.getElementById('plan-published-flag').checked = !!r.is_published;
        form.querySelector('[name="id"]').value = r.id;
      } else if (e.target.dataset.del) {
        if (!confirm('確定刪除？')) return;
        await api('DELETE', `/api/admin/plans/${id}`);
        location.reload();
      }
    });
    // save
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form); const data = Object.fromEntries(fd.entries());
      data.slug = document.getElementById('plan-slug').value;
      data.content_html = editor.innerHTML;
      data.cover_media_id = document.getElementById('plan-cover').value || null;
      data.published_at = document.getElementById('plan-published').value || null;
      data.is_published = document.getElementById('plan-published-flag').checked ? 1 : 0;
      const id = data.id; delete data.id;
      if (id) await api('PUT', `/api/admin/plans/${id}`, data);
      else await api('POST', '/api/admin/plans', data);
      location.reload();
    });
  }
})();
