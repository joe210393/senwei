import { Router } from 'express';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, getConnection } from '../config/db.js';
import { requireAuth, requireAdmin, requireEditorOrAdmin } from '../middleware/auth.js';
import sanitizeHtml from 'sanitize-html';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '..', '..', 'logs');

// Determine Upload Directory (Prioritize Zeabur persistent volume)
let uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (fs.existsSync('/app/public/uploads')) {
    uploadDir = '/app/public/uploads';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // Keep original filename (sanitize + fix common latin1->utf8 mojibake)
    let original = file.originalname || `upload-${Date.now()}`;
    try {
      const recoded = Buffer.from(original, 'latin1').toString('utf8');
      if (recoded && recoded !== original) original = recoded;
    } catch {}
    const base = path.basename(original);
    const safe = base.replace(/[\/:*?"<>|]+/g, '_').slice(0, 180);
    let finalName = safe || `file-${Date.now()}`;
    try {
      const ext = path.extname(finalName);
      const stem = finalName.slice(0, finalName.length - ext.length) || 'file';
      let idx = 1;
      while (fs.existsSync(path.join(uploadDir, finalName))) {
        finalName = `${stem} (${idx})${ext}`;
        idx += 1;
      }
    } catch {}
    cb(null, finalName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedPrefixes = ['image/', 'video/'];
    const allowedExact = new Set([
      'application/pdf',
      // Word
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // PowerPoint
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Excel
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]);
    if (allowedPrefixes.some(p => file.mimetype.startsWith(p)) || allowedExact.has(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  }
});

export const apiAdminRouter = Router();

// 後台登入／登出
apiAdminRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
  const user = rows[0];
  if (!user) {
    try { fs.appendFileSync(path.join(logsDir, 'auth.log'), `[${new Date().toISOString()}] admin_login_fail user=${username}\n`); } catch {}
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) {
    try { fs.appendFileSync(path.join(logsDir, 'auth.log'), `[${new Date().toISOString()}] admin_login_fail user=${username}\n`); } catch {}
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const preserveMember = req.session?.member || null;
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.user = { id: user.id, username: user.username, role: user.role, must_change_password: !!user.must_change_password };
    if (preserveMember) req.session.member = preserveMember;
    res.json({ id: user.id, username: user.username, role: user.role, must_change_password: !!user.must_change_password });
  });
});

apiAdminRouter.post('/logout', requireAuth, (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.user = null;
  res.json({ ok: true });
});

apiAdminRouter.get('/me', (req, res) => {
  res.json(req.session.user || null);
});

// Change own password
apiAdminRouter.post('/users/me/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const rows = await query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  const user = rows[0];
  if (!user) return res.status(400).json({ error: 'User not found' });
  const ok = await bcrypt.compare(String(current_password || ''), user.password_hash);
  if (!ok) return res.status(400).json({ error: 'Current password incorrect' });
  const hash = await bcrypt.hash(String(new_password || ''), 10);
  await query('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', [hash, user.id]);
  req.session.user.must_change_password = false;
  res.json({ ok: true });
});

// 站台設定 CRUD
apiAdminRouter.get('/settings', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM settings');
  res.json(rows);
});
apiAdminRouter.post('/settings', requireEditorOrAdmin, async (req, res) => {
  const entries = Object.entries(req.body || {});
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of entries) {
      await conn.execute('INSERT INTO settings(`key`,`value`) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET `value`=excluded.`value`', [key, String(value)]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// 內容清洗（允許 iframe/img 以供編輯器使用）
function sanitizeContent(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'iframe', 'video', 'source']),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt'],
      iframe: ['src', 'allow', 'allowfullscreen', 'frameborder'],
      '*': ['style', 'class']
    }
  });
}

// Example: pages CRUD (similar patterns apply to posts, news, etc.)
apiAdminRouter.get('/pages', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM pages ORDER BY id DESC');
  res.json(rows);
});
apiAdminRouter.get('/pages/:slug', requireAuth, async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const rows = await query('SELECT * FROM pages WHERE slug = ?', [slug]);
  if (rows[0]) {
    return res.json(rows[0]);
  }
  // If page doesn't exist, return a default structure instead of 404
  // This allows admin panel to create new pages
  res.json({
    id: null,
    slug: slug,
    title: slug,
    content_html: '',
    background_image_id: null,
    is_published: 1
  });
});
apiAdminRouter.post('/pages', requireAuth, async (req, res) => {
  const { slug, title, content_html, background_image_id, is_published } = req.body || {};
  await query(
    'INSERT INTO pages(slug, title, content_html, background_image_id, is_published) VALUES (?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, content_html=excluded.content_html, background_image_id=excluded.background_image_id, is_published=excluded.is_published'
    , [
      String(slug), String(title), sanitizeContent(content_html), background_image_id || null, is_published ? 1 : 0
    ]
  );
  res.json({ ok: true });
});
apiAdminRouter.put('/pages/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { slug, title, content_html, background_image_id, is_published } = req.body || {};
  await query('UPDATE pages SET slug=?, title=?, content_html=?, background_image_id=?, is_published=? WHERE id=?', [
    String(slug), String(title), sanitizeContent(content_html), background_image_id || null, is_published ? 1 : 0, id
  ]);
  res.json({ ok: true });
});

// 關於頁（關於鼓潮／關於音樂課程）讀取與儲存
apiAdminRouter.get('/about', requireAuth, async (_req, res) => {
  const guchau = await query('SELECT content_html, background_image_id FROM pages WHERE slug = ? LIMIT 1', ['about-guchau']);
  const music = await query('SELECT content_html, background_image_id FROM pages WHERE slug = ? LIMIT 1', ['about-music']);
  res.json({ guchau: guchau[0] || null, music: music[0] || null });
});
apiAdminRouter.delete('/pages/:id', requireEditorOrAdmin, async (req, res) => {
  await query('DELETE FROM pages WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// 媒體上傳（含圖片縮圖）
apiAdminRouter.post('/media/upload', requireAuth, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file' });
  let thumbPath = null;
  if (file.mimetype.startsWith('image/')) {
    try {
      const thumbName = file.filename.replace(/(\.[^.]+)$/, '_thumb$1');
      const fullThumbPath = path.join(uploadDir, thumbName);
      await sharp(file.path).resize(480).jpeg({ quality: 80 }).toFile(fullThumbPath);
      thumbPath = `/uploads/${thumbName}`;
    } catch {}
  }
  // Store a display name with utf8 fixed for DB as well
  let displayName = file.originalname || '';
  try {
    const recoded = Buffer.from(displayName, 'latin1').toString('utf8');
    if (recoded) displayName = recoded;
  } catch {}
  const result = await query('INSERT INTO media(file_name, file_path, mime_type, file_size, created_at) VALUES (?,?,?,?, NOW())', [
    displayName,
    `/uploads/${file.filename}`,
    file.mimetype,
    file.size
  ]);
  const mediaId = result && typeof result === 'object' && 'insertId' in result ? result.insertId : null;
  res.json({ ok: true, media_id: mediaId, path: `/uploads/${file.filename}`, thumb: thumbPath });
});

// List media
apiAdminRouter.get('/media', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 24)));
  const offset = (page - 1) * limit;
  const qstr = String(req.query.q || '').trim();
  const where = [];
  const params = [];
  if (qstr) { where.push('(file_name LIKE ? OR mime_type LIKE ?)'); params.push(`%${qstr}%`, `%${qstr}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 24;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const items = await query(
    `SELECT id, file_name, file_path, mime_type, created_at FROM media ${whereSql}
     ORDER BY id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`, params
  );
  const [{ cnt }] = await query(`SELECT COUNT(1) AS cnt FROM media ${whereSql}`, params);
  res.json({ items, page, limit, total: cnt });
});

// 媒體刪除（會一併刪實體檔與縮圖）
apiAdminRouter.delete('/media/:id', requireEditorOrAdmin, async (req, res) => {
  const { id } = req.params;
  const rows = await query('SELECT file_path FROM media WHERE id = ? LIMIT 1', [id]);
  const record = rows[0];
  await query('DELETE FROM media WHERE id = ?', [id]);
  if (record && record.file_path) {
    try {
      const original = path.join(uploadDir, path.basename(record.file_path));
      try { fs.unlinkSync(original); } catch {}
      const thumb = original.replace(/(\.[^.]+)$/, '_thumb$1');
      try { fs.unlinkSync(thumb); } catch {}
    } catch {}
  }
  res.json({ ok: true });
});

// 媒體使用處查詢
apiAdminRouter.get('/media/:id/usage', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [posts, news, leaderboard, plans, pages, slides] = await Promise.all([
    query('SELECT id, title, slug FROM posts WHERE cover_media_id = ?', [id]),
    query('SELECT id, title, slug FROM news WHERE cover_media_id = ?', [id]),
    query('SELECT id, title, slug FROM leaderboard WHERE cover_media_id = ?', [id]),
    query('SELECT id, name AS title, slug FROM plans WHERE cover_media_id = ?', [id]),
    query('SELECT id, title, slug FROM pages WHERE background_image_id = ?', [id]),
    query('SELECT id, title FROM slides WHERE media_id = ?', [id])
  ]);
  res.json({ posts, news, leaderboard, plans, pages, slides });
});

// 部落格 CRUD
apiAdminRouter.get('/posts', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM posts ORDER BY id DESC');
  res.json(rows);
});
apiAdminRouter.post('/posts', requireAuth, async (req, res) => {
  const { title, slug, excerpt, content_html, cover_media_id, published_at, is_published } = req.body || {};
  await query('INSERT INTO posts(title, slug, excerpt, content_html, cover_media_id, published_at, is_published) VALUES (?,?,?,?,?,?,?)', [
    String(title), String(slug), String(excerpt || ''), sanitizeContent(content_html), cover_media_id || null, published_at || null, is_published ? 1 : 0
  ]);
  res.json({ ok: true });
});
apiAdminRouter.put('/posts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, slug, excerpt, content_html, cover_media_id, published_at, is_published } = req.body || {};
  await query('UPDATE posts SET title=?, slug=?, excerpt=?, content_html=?, cover_media_id=?, published_at=?, is_published=? WHERE id=?', [
    String(title), String(slug), String(excerpt || ''), sanitizeContent(content_html), cover_media_id || null, published_at || null, is_published ? 1 : 0, id
  ]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/posts/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM posts WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 最新消息 CRUD
apiAdminRouter.get('/news', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM news ORDER BY id DESC');
  res.json(rows);
});
apiAdminRouter.post('/news', requireAuth, async (req, res) => {
  try {
    const { title, slug, content_html, excerpt, cover_media_id, published_at, is_published } = req.body || {};
    
    console.log('[POST /api/admin/news] Received data:', {
      title: title ? String(title).substring(0, 50) : 'empty',
      slug: slug ? String(slug).substring(0, 50) : 'empty',
      content_html_length: content_html ? String(content_html).length : 0,
      content_html_preview: content_html ? String(content_html).substring(0, 200) : 'empty',
      excerpt_length: excerpt ? String(excerpt).length : 0,
      cover_media_id,
      published_at,
      is_published,
      content_html_type: typeof content_html,
      content_html_is_null: content_html === null,
      content_html_is_undefined: content_html === undefined
    });
    
    // Validate required fields
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!slug || !String(slug).trim()) {
      return res.status(400).json({ error: 'Slug is required' });
    }
    
    const pubValue = (is_published === 1 || is_published === '1' || is_published === true) ? 1 : 0;
    
    // Ensure content_html is a string, even if empty
    const contentHtmlString = content_html !== null && content_html !== undefined ? String(content_html) : '';
    const sanitizedContent = sanitizeContent(contentHtmlString);
    
    console.log('[POST /api/admin/news] Content processing:', {
      original_length: contentHtmlString.length,
      original_preview: contentHtmlString.substring(0, 200),
      sanitized_length: sanitizedContent.length,
      sanitized_preview: sanitizedContent.substring(0, 200)
    });
    
    // Try to INSERT directly - let the database UNIQUE constraint handle conflicts
    // This avoids race conditions with pre-checking
    try {
      const result = await query('INSERT INTO news(title, slug, content_html, excerpt, cover_media_id, published_at, is_published) VALUES (?,?,?,?,?,?,?)', [
        String(title).trim(), 
        String(slug).trim(), 
        sanitizedContent, 
        String(excerpt || ''), 
        cover_media_id ? parseInt(cover_media_id) : null, 
        published_at || null, 
        pubValue
      ]);
      
      // Use insertId (not lastInsertRowid) as per db.js query function return format
      const insertedId = result.insertId;
      console.log('[POST /api/admin/news] Insert result:', {
        insertId: insertedId,
        affectedRows: result.affectedRows,
        result_type: typeof result,
        result_keys: Object.keys(result || {})
      });
      
      // Check if INSERT actually succeeded
      // In SQLite, if INSERT succeeds, we get a valid insertId (number > 0)
      // If insertId is 0 or undefined, something went wrong
      if (insertedId && insertedId > 0) {
        console.log('[POST /api/admin/news] Insert successful, returning success with id:', insertedId);
        return res.json({ ok: true, id: insertedId });
      } else {
        // INSERT didn't throw an error, but we didn't get a valid ID
        // This could happen if the row was inserted but ID is 0 (shouldn't happen with AUTOINCREMENT)
        // Or if there was a silent failure
        console.warn('[POST /api/admin/news] INSERT returned invalid insertId:', insertedId);
        // Try to query by slug to see if it was actually inserted
        const check = await query('SELECT id, title FROM news WHERE slug = ?', [String(slug).trim()]);
        if (check && check.length > 0) {
          console.log('[POST /api/admin/news] Found existing record after INSERT, returning it:', check[0]);
          return res.json({ ok: true, id: check[0].id });
        }
        // If we can't find it, return an error
        return res.status(500).json({ error: 'Insert failed unexpectedly' });
      }
    } catch (insertErr) {
      // If INSERT fails due to UNIQUE constraint, query the existing record and return it
      console.error('[POST /api/admin/news] INSERT failed with error:', {
        message: insertErr.message,
        code: insertErr.code,
        errno: insertErr.errno,
        name: insertErr.name,
        stack: insertErr.stack
      });
      
      // Check for UNIQUE constraint error - SQLite error codes and messages
      const isUniqueError = insertErr.message && (
        insertErr.message.includes('UNIQUE constraint') ||
        insertErr.message.includes('UNIQUE') ||
        insertErr.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        insertErr.code === 'SQLITE_CONSTRAINT' ||
        insertErr.errno === 2067 || // SQLITE_CONSTRAINT_UNIQUE
        insertErr.errno === 19     // SQLITE_CONSTRAINT
      );
      
      if (isUniqueError) {
        // Query the existing record
        try {
          const existing = await query('SELECT id, title FROM news WHERE slug = ?', [String(slug).trim()]);
          if (existing && existing.length > 0) {
            console.log('[POST /api/admin/news] UNIQUE constraint - slug exists:', existing[0]);
            return res.status(400).json({ 
              error: 'Slug already exists',
              existing_id: existing[0].id,
              existing_title: existing[0].title
            });
          }
        } catch (queryErr) {
          console.error('[POST /api/admin/news] Failed to query existing record:', queryErr);
        }
        // If we can't find the existing record, return a generic error
        return res.status(400).json({ 
          error: 'Slug already exists',
          details: 'A record with this slug already exists'
        });
      }
      // For other errors, re-throw to be caught by outer try-catch
      throw insertErr;
    }
  } catch (err) {
    console.error('[POST /api/admin/news] Error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    // Don't send error details in production, but log them
    const errorMsg = err.message || 'Internal Server Error';
    res.status(500).json({ error: 'Internal Server Error', details: errorMsg });
  }
});
apiAdminRouter.put('/news/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, slug, content_html, excerpt, cover_media_id, published_at, is_published } = req.body || {};
    
    // Validate required fields
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!slug || !String(slug).trim()) {
      return res.status(400).json({ error: 'Slug is required' });
    }
    
    // Check if slug already exists for another news item
    const existing = await query('SELECT id FROM news WHERE slug = ? AND id != ?', [String(slug).trim(), id]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    
    // Verify the news item exists
    const newsItem = await query('SELECT id FROM news WHERE id = ?', [id]);
    if (!newsItem || newsItem.length === 0) {
      return res.status(404).json({ error: 'News item not found' });
    }
    
    const pubValue = (is_published === 1 || is_published === '1' || is_published === true) ? 1 : 0;
    const sanitizedContent = sanitizeContent(content_html || '');
    
    await query('UPDATE news SET title=?, slug=?, content_html=?, excerpt=?, cover_media_id=?, published_at=?, is_published=? WHERE id=?', [
      String(title).trim(), 
      String(slug).trim(), 
      sanitizedContent, 
      String(excerpt || ''), 
      cover_media_id ? parseInt(cover_media_id) : null, 
      published_at || null, 
      pubValue, 
      id
    ]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/admin/news/:id] Error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});
apiAdminRouter.delete('/news/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM news WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 影像紀錄 CRUD
apiAdminRouter.get('/media-records', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM media_records ORDER BY id DESC');
  // Debug: log the is_published values
  console.log('[GET /api/admin/media-records] Found', rows.length, 'records');
  rows.forEach(r => {
    console.log(`  - ID ${r.id}: "${r.title}" - is_published: ${r.is_published} (type: ${typeof r.is_published})`);
  });
  res.json(rows);
});
apiAdminRouter.post('/media-records', requireAuth, async (req, res) => {
  const { title, slug, content_html, excerpt, embed_url, cover_media_id, published_at, is_published } = req.body || {};
  const pubValue = (is_published === 1 || is_published === '1' || is_published === true) ? 1 : 0;
  console.log('[POST /media-records] Saving with is_published:', pubValue, 'from input:', is_published);
  await query('INSERT INTO media_records(title, slug, content_html, excerpt, embed_url, cover_media_id, published_at, is_published) VALUES (?,?,?,?,?,?,?,?)', [
    String(title), String(slug), sanitizeContent(content_html), String(excerpt || ''), String(embed_url || ''), cover_media_id || null, published_at || null, pubValue
  ]);
  res.json({ ok: true });
});
apiAdminRouter.put('/media-records/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, slug, content_html, excerpt, embed_url, cover_media_id, published_at, is_published } = req.body || {};
  const pubValue = (is_published === 1 || is_published === '1' || is_published === true) ? 1 : 0;
  console.log('[PUT /media-records/:id] Updating id:', id, 'with is_published:', pubValue, 'from input:', is_published);
  await query('UPDATE media_records SET title=?, slug=?, content_html=?, excerpt=?, embed_url=?, cover_media_id=?, published_at=?, is_published=? WHERE id=?', [
    String(title), String(slug), sanitizeContent(content_html), String(excerpt || ''), String(embed_url || ''), cover_media_id || null, published_at || null, pubValue, id
  ]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/media-records/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM media_records WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 傳奇榜 CRUD（文章型）
apiAdminRouter.get('/leaderboard', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM leaderboard ORDER BY id DESC');
  res.json(rows);
});
apiAdminRouter.post('/leaderboard', requireAuth, async (req, res) => {
  const { title, slug, excerpt, content_html, cover_media_id, published_at, is_published } = req.body || {};
  await query('INSERT INTO leaderboard(title, slug, excerpt, content_html, cover_media_id, published_at, is_published) VALUES (?,?,?,?,?,?,?)', [
    String(title), String(slug), String(excerpt || ''), sanitizeContent(content_html), cover_media_id || null, published_at || null, is_published ? 1 : 0
  ]);
  res.json({ ok: true });
});
apiAdminRouter.put('/leaderboard/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, slug, excerpt, content_html, cover_media_id, published_at, is_published } = req.body || {};
  await query('UPDATE leaderboard SET title=?, slug=?, excerpt=?, content_html=?, cover_media_id=?, published_at=?, is_published=? WHERE id=?', [
    String(title), String(slug), String(excerpt || ''), sanitizeContent(content_html), cover_media_id || null, published_at || null, is_published ? 1 : 0, id
  ]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/leaderboard/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM leaderboard WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 方案 CRUD（文章欄位）
apiAdminRouter.get('/plans', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM plans ORDER BY id DESC');
  res.json(rows);
});
apiAdminRouter.post('/plans', requireAuth, async (req, res) => {
  const { name, price, tagline, features_json, is_active, title, slug, excerpt, content_html, cover_media_id, published_at, is_published } = req.body || {};
  const effectiveTitle = (title && String(title).trim()) ? String(title).trim() : String(name || '').trim();
  await query('INSERT INTO plans(name, price, tagline, features_json, is_active, title, slug, excerpt, content_html, cover_media_id, published_at, is_published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
    String(name || ''), Number(price || 0), tagline || null, JSON.stringify([]), is_active ? 1 : 0,
    effectiveTitle, String(slug || ''), String(excerpt || ''), sanitizeContent(content_html), cover_media_id || null, published_at || null, is_published ? 1 : 0
  ]);
  res.json({ ok: true });
});
apiAdminRouter.put('/plans/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, price, tagline, features_json, is_active, title, slug, excerpt, content_html, cover_media_id, published_at, is_published } = req.body || {};
  const effectiveTitle = (title && String(title).trim()) ? String(title).trim() : String(name || '').trim();
  await query('UPDATE plans SET name=?, price=?, tagline=?, features_json=?, is_active=?, title=?, slug=?, excerpt=?, content_html=?, cover_media_id=?, published_at=?, is_published=? WHERE id=?', [
    String(name || ''), Number(price || 0), tagline || null, JSON.stringify([]), is_active ? 1 : 0,
    effectiveTitle, String(slug || ''), String(excerpt || ''), sanitizeContent(content_html), cover_media_id || null, published_at || null, is_published ? 1 : 0, id
  ]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/plans/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM plans WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 課程試讀 CRUD
apiAdminRouter.get('/trial', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM trial_contents ORDER BY id DESC');
  res.json(rows);
});
apiAdminRouter.post('/trial', requireAuth, async (req, res) => {
  const { title, type, content_html, video_url, is_public } = req.body || {};
  await query('INSERT INTO trial_contents(title, type, content_html, video_url, is_public) VALUES (?,?,?,?,?)', [
    String(title), type === 'video' ? 'video' : 'article', sanitizeContent(content_html), video_url || null, is_public ? 1 : 0
  ]);
  res.json({ ok: true });
});
apiAdminRouter.put('/trial/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, type, content_html, video_url, is_public } = req.body || {};
  await query('UPDATE trial_contents SET title=?, type=?, content_html=?, video_url=?, is_public=? WHERE id=?', [
    String(title), type === 'video' ? 'video' : 'article', sanitizeContent(content_html), video_url || null, is_public ? 1 : 0, id
  ]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/trial/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM trial_contents WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 聯絡表單列表與已處理標記
apiAdminRouter.get('/contacts', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM contacts ORDER BY created_at DESC');
  res.json(rows);
});
apiAdminRouter.put('/contacts/:id/process', requireAuth, async (req, res) => {
  await query('UPDATE contacts SET processed=1 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 選單 CRUD 與排序
apiAdminRouter.get('/menus', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM menus ORDER BY parent_id IS NOT NULL, parent_id, order_index');
  res.json(rows);
});
apiAdminRouter.post('/menus', requireAuth, async (req, res) => {
  const { parent_id, title, slug, url, order_index, visible } = req.body || {};
  await query('INSERT INTO menus(parent_id, title, slug, url, order_index, visible) VALUES (?,?,?,?,?,?)', [
    parent_id || null, String(title), String(slug || ''), url || null, Number(order_index || 0), visible ? 1 : 0
  ]);
  res.json({ ok: true });
});
apiAdminRouter.put('/menus/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { parent_id, title, slug, url, order_index, visible } = req.body || {};
  await query('UPDATE menus SET parent_id=?, title=?, slug=?, url=?, order_index=?, visible=? WHERE id=?', [
    parent_id || null, String(title), String(slug || ''), url || null, Number(order_index || 0), visible ? 1 : 0, id
  ]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/menus/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM menus WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
apiAdminRouter.post('/menus/reorder', requireAuth, async (req, res) => {
  const { orders } = req.body || {};
  if (!Array.isArray(orders)) return res.status(400).json({ error: 'orders required' });
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    for (const { id, order_index } of orders) {
      await conn.execute('UPDATE menus SET order_index=? WHERE id=?', [Number(order_index || 0), id]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
});

// 後台使用者管理
apiAdminRouter.get('/users', requireAdmin, async (_req, res) => {
  const rows = await query('SELECT id, username, role, must_change_password, created_at FROM users ORDER BY id');
  res.json(rows);
});
apiAdminRouter.post('/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  const hash = await bcrypt.hash(String(password || ''), 10);
  await query('INSERT INTO users(username, password_hash, role, must_change_password) VALUES (?,?,?,?)', [
    String(username), hash, role === 'editor' ? 'editor' : 'admin', 0
  ]);
  res.json({ ok: true });
});

// 首頁輪播 CRUD
apiAdminRouter.get('/slides', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM slides ORDER BY order_index ASC, id DESC');
  res.json(rows);
});

// 上課內容 CRUD（YouTube 連結）
apiAdminRouter.get('/courses', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM course_contents ORDER BY id DESC');
  res.json(rows);
});
apiAdminRouter.post('/courses', requireAuth, async (req, res) => {
  const { title, video_url, category, min_tier, is_active } = req.body || {};
  const allowed = new Set(['free','basic','advanced','platinum']);
  const tier = allowed.has(String(min_tier)) ? String(min_tier) : 'free';
  await query('INSERT INTO course_contents(title, video_url, category, min_tier, is_active) VALUES (?,?,?,?,?)', [String(title), String(video_url), String(category || 'general'), tier, is_active ? 1 : 0]);
  res.json({ ok: true });
});
apiAdminRouter.put('/courses/:id', requireAuth, async (req, res) => {
  const { title, video_url, category, min_tier, is_active } = req.body || {};
  const allowed = new Set(['free','basic','advanced','platinum']);
  const tier = allowed.has(String(min_tier)) ? String(min_tier) : 'free';
  await query('UPDATE course_contents SET title=?, video_url=?, category=?, min_tier=?, is_active=? WHERE id=?', [String(title), String(video_url), String(category || 'general'), tier, is_active ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/courses/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM course_contents WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// 上課教材 CRUD（透過媒體庫檔案）
apiAdminRouter.get('/materials', requireAuth, async (_req, res) => {
  const rows = await query('SELECT cm.*, m.file_name, m.file_path FROM course_materials cm JOIN media m ON m.id = cm.media_id ORDER BY cm.id DESC');
  res.json(rows);
});
apiAdminRouter.post('/materials', requireAuth, async (req, res) => {
  const { title, media_id, min_tier, is_active } = req.body || {};
  const allowed = new Set(['free','basic','advanced','platinum']);
  const tier = allowed.has(String(min_tier)) ? String(min_tier) : 'free';
  await query('INSERT INTO course_materials(title, media_id, min_tier, is_active) VALUES (?,?,?,?)', [String(title), Number(media_id), tier, is_active ? 1 : 0]);
  res.json({ ok: true });
});
apiAdminRouter.put('/materials/:id', requireAuth, async (req, res) => {
  const { title, media_id, min_tier, is_active } = req.body || {};
  const allowed = new Set(['free','basic','advanced','platinum']);
  const tier = allowed.has(String(min_tier)) ? String(min_tier) : 'free';
  await query('UPDATE course_materials SET title=?, media_id=?, min_tier=?, is_active=? WHERE id=?', [String(title), Number(media_id), tier, is_active ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/materials/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM course_materials WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
apiAdminRouter.post('/slides', requireAuth, async (req, res) => {
  const { media_id, title, link_url, order_index, is_active } = req.body || {};
  await query('INSERT INTO slides(media_id, title, link_url, order_index, is_active) VALUES (?,?,?,?,?)', [
    Number(media_id), title || null, link_url || null, Number(order_index || 0), is_active ? 1 : 0
  ]);
  res.json({ ok: true });
});
apiAdminRouter.put('/slides/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { media_id, title, link_url, order_index, is_active } = req.body || {};
  await query('UPDATE slides SET media_id=?, title=?, link_url=?, order_index=?, is_active=? WHERE id=?', [
    Number(media_id), title || null, link_url || null, Number(order_index || 0), is_active ? 1 : 0, id
  ]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/slides/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  // get media file path
  const rows = await query('SELECT m.file_path FROM slides s JOIN media m ON m.id = s.media_id WHERE s.id = ?', [id]);
  const r = rows[0];
  await query('DELETE FROM slides WHERE id = ?', [id]);
  if (r && r.file_path) {
    try {
      const p = path.join(uploadDir, path.basename(r.file_path));
      fs.unlinkSync(p);
      const thumb = p.replace(/(\.[^.]+)$/, '_thumb$1');
      try { fs.unlinkSync(thumb); } catch {}
      // also delete from media table
      await query('DELETE FROM media WHERE file_path = ?', [r.file_path]);
    } catch {}
  }
  res.json({ ok: true });
});
apiAdminRouter.put('/users/:id', requireAdmin, async (req, res) => {
  const { role, must_change_password } = req.body || {};
  await query('UPDATE users SET role=?, must_change_password=? WHERE id=?', [
    role === 'editor' ? 'editor' : 'admin', must_change_password ? 1 : 0, req.params.id
  ]);
  res.json({ ok: true });
});

// Delete user (admin only)
apiAdminRouter.delete('/users/:id', requireAdmin, async (req, res) => {
  const userId = req.params.id;
  // Prevent deleting yourself
  if (String(userId) === String(req.session?.user?.id)) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  // Check if user exists
  const rows = await query('SELECT id FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  await query('DELETE FROM users WHERE id = ?', [userId]);
  res.json({ ok: true });
});

// Reset another user's password (admin only)
apiAdminRouter.post('/users/:id/password', requireAdmin, async (req, res) => {
  const { new_password } = req.body || {};
  const userId = req.params.id;
  if (!new_password || String(new_password).length < 4) {
    return res.status(400).json({ error: 'New password too short' });
  }
  const hash = await bcrypt.hash(String(new_password), 10);
  await query('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', [hash, userId]);
  res.json({ ok: true });
});

// 會員管理（後台）
apiAdminRouter.get('/members', requireEditorOrAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await query(
      'SELECT id, email, username, name, chinese_name, english_name, tier, is_active, created_at FROM members WHERE email LIKE ? OR name LIKE ? OR username LIKE ? OR id_number LIKE ? ORDER BY id DESC',
      [like, like, like, like]
    );
  } else {
    rows = await query('SELECT id, email, username, name, chinese_name, english_name, tier, is_active, created_at FROM members ORDER BY id DESC');
  }
  res.json(rows);
});
apiAdminRouter.put('/members/:id', requireEditorOrAdmin, async (req, res) => {
  const { tier, is_active, name } = req.body || {};
  const allowed = new Set(['free','basic','advanced','platinum']);
  const t = allowed.has(String(tier)) ? String(tier) : 'free';
  await query('UPDATE members SET name=?, tier=?, is_active=? WHERE id=?', [name || null, t, is_active ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});
apiAdminRouter.delete('/members/:id', requireEditorOrAdmin, async (req, res) => {
  const memberId = String(req.params.id);
  await query('DELETE FROM members WHERE id=?', [memberId]);
  // remove uploaded folder
  try {
    const baseDir = path.join(__dirname, '..', '..', 'private_member_uploads', memberId);
    if (fs.existsSync(baseDir)) {
      try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {
        // fallback: attempt to delete files then dir
        try { fs.readdirSync(baseDir).forEach(f => { try { fs.unlinkSync(path.join(baseDir, f)); } catch {} }); fs.rmdirSync(baseDir); } catch {}
      }
    }
  } catch {}
  res.json({ ok: true });
});

// 會員完整資料
apiAdminRouter.get('/members/:id', requireEditorOrAdmin, async (req, res) => {
  const rows = await query('SELECT id, email, username, name, chinese_name, english_name, gender, birth_date, id_number, phone_mobile, phone_landline, address, line_id, special_needs, referrer, tier, is_active, created_at FROM members WHERE id = ? LIMIT 1', [req.params.id]);
  res.json(rows[0] || null);
});

// 會員上傳檔案列表
apiAdminRouter.get('/members/:id/files', requireEditorOrAdmin, async (req, res) => {
  const memberId = String(req.params.id);
  const baseDir = path.join(__dirname, '..', '..', 'private_member_uploads', memberId);
  let items = [];
  try {
    const files = fs.readdirSync(baseDir);
    items = files.map((f) => ({ name: f, url: `/api/public/members/files/${encodeURIComponent(f)}` }));
  } catch {
    items = [];
  }
  res.json({ items });
});

// 刪除會員上傳檔案（後台）
apiAdminRouter.delete('/members/:id/files/:filename', requireEditorOrAdmin, async (req, res) => {
  const memberId = String(req.params.id);
  const filename = path.basename(String(req.params.filename));
  const baseDir = path.join(__dirname, '..', '..', 'private_member_uploads', memberId);
  const target = path.join(baseDir, filename);
  try {
    fs.unlinkSync(target);
  } catch {}
  // if directory becomes empty, it's fine to keep
  res.json({ ok: true });
});

// ========== 商品類別管理 ==========
apiAdminRouter.get('/product-categories', requireAuth, async (_req, res) => {
  const rows = await query('SELECT * FROM product_categories ORDER BY order_index, id');
  res.json(rows);
});

apiAdminRouter.post('/product-categories', requireAuth, async (req, res) => {
  const { name, order_index } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const result = await query('INSERT INTO product_categories (name, order_index) VALUES (?, ?)', [String(name).trim(), Number(order_index || 0)]);
  res.json({ id: result.lastInsertRowid });
});

apiAdminRouter.put('/product-categories/:id', requireAuth, async (req, res) => {
  const { name, order_index } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  await query('UPDATE product_categories SET name=?, order_index=? WHERE id=?', [String(name).trim(), Number(order_index || 0), req.params.id]);
  res.json({ ok: true });
});

apiAdminRouter.delete('/product-categories/:id', requireEditorOrAdmin, async (req, res) => {
  await query('DELETE FROM product_categories WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ========== 商品管理 ==========
apiAdminRouter.get('/products', requireAuth, async (req, res) => {
  const categoryId = req.query.category_id;
  let rows;
  if (categoryId) {
    rows = await query(`
      SELECT p.*, c.name AS category_name, m.file_path AS cover_url
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN media m ON m.id = p.cover_media_id
      WHERE p.category_id = ?
      ORDER BY p.id DESC
    `, [categoryId]);
  } else {
    rows = await query(`
      SELECT p.*, c.name AS category_name, m.file_path AS cover_url
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN media m ON m.id = p.cover_media_id
      ORDER BY p.id DESC
    `);
  }
  res.json(rows);
});

apiAdminRouter.get('/products/:id', requireAuth, async (req, res) => {
  const rows = await query(`
    SELECT p.*, c.name AS category_name, m.file_path AS cover_url
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    WHERE p.id = ?
    LIMIT 1
  `, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  
  // Get product images
  const images = await query(`
    SELECT pi.*, m.file_path, m.file_name
    FROM product_images pi
    LEFT JOIN media m ON m.id = pi.media_id
    WHERE pi.product_id = ?
    ORDER BY pi.order_index, pi.id
  `, [req.params.id]);
  
  res.json({ ...rows[0], images });
});

apiAdminRouter.post('/products', requireAuth, async (req, res) => {
  try {
    const { name, price, category_id, cover_media_id, description_html, is_published, images } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    if (price === undefined || price === null) return res.status(400).json({ error: 'price required' });
    
    // Normalize category_id and cover_media_id (convert empty string to null)
    const normalizedCategoryId = (category_id && String(category_id).trim()) ? Number(category_id) : null;
    const normalizedCoverMediaId = (cover_media_id && String(cover_media_id).trim()) ? Number(cover_media_id) : null;
    
    // Generate slug from name
    const slugBase = String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
    let slug = slugBase;
    let counter = 1;
    while (true) {
      const existing = await query('SELECT id FROM products WHERE slug = ?', [slug]);
      if (existing.length === 0) break;
      slug = `${slugBase}-${counter}`;
      counter++;
    }
    
    const sanitizedHtml = sanitizeContent(description_html || '');
    const result = await query(
      'INSERT INTO products (name, slug, price, category_id, cover_media_id, description_html, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [String(name).trim(), slug, Number(price), normalizedCategoryId, normalizedCoverMediaId, sanitizedHtml, is_published ? 1 : 0]
    );
    const productId = result.insertId || result.lastInsertRowid;
    
    // Validate productId before inserting images
    if (!productId || productId === 0) {
      console.error('[POST /products] Failed to get product ID from insert result:', result);
      return res.status(500).json({ error: 'Internal Server Error', details: 'Failed to create product' });
    }
    
    // Insert product images
    if (Array.isArray(images) && images.length > 0 && productId) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img && img.media_id) {
          try {
            await query('INSERT INTO product_images (product_id, media_id, order_index) VALUES (?, ?, ?)', [productId, Number(img.media_id), i]);
          } catch (imgErr) {
            console.error(`[POST /products] Error inserting product image ${i}:`, imgErr);
            // Continue with other images even if one fails
          }
        }
      }
    }
    
    res.json({ id: productId });
  } catch (err) {
    console.error('[POST /products] Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

apiAdminRouter.put('/products/:id', requireAuth, async (req, res) => {
  try {
    const { name, price, category_id, cover_media_id, description_html, is_published, images } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    if (price === undefined || price === null) return res.status(400).json({ error: 'price required' });
    
    // Normalize category_id and cover_media_id (convert empty string to null)
    const normalizedCategoryId = (category_id && String(category_id).trim()) ? Number(category_id) : null;
    const normalizedCoverMediaId = (cover_media_id && String(cover_media_id).trim()) ? Number(cover_media_id) : null;
    
    // Update slug if name changed
    const existing = await query('SELECT slug FROM products WHERE id = ?', [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    let slug = existing[0]?.slug;
    if (!slug || slug !== String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '')) {
      const slugBase = String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
      slug = slugBase;
      let counter = 1;
      while (true) {
        const check = await query('SELECT id FROM products WHERE slug = ? AND id != ?', [slug, req.params.id]);
        if (check.length === 0) break;
        slug = `${slugBase}-${counter}`;
        counter++;
      }
    }
    
    const sanitizedHtml = sanitizeContent(description_html || '');
    await query(
      'UPDATE products SET name=?, slug=?, price=?, category_id=?, cover_media_id=?, description_html=?, is_published=?, updated_at=datetime(\'now\') WHERE id=?',
      [String(name).trim(), slug, Number(price), normalizedCategoryId, normalizedCoverMediaId, sanitizedHtml, is_published ? 1 : 0, req.params.id]
    );
    
    // Update product images (delete all and re-insert)
    await query('DELETE FROM product_images WHERE product_id = ?', [req.params.id]);
    if (Array.isArray(images) && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img && img.media_id) {
          await query('INSERT INTO product_images (product_id, media_id, order_index) VALUES (?, ?, ?)', [req.params.id, Number(img.media_id), i]);
        }
      }
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /products/:id] Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

apiAdminRouter.delete('/products/:id', requireEditorOrAdmin, async (req, res) => {
  await query('DELETE FROM products WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ========== 預約報名系統 ==========

// 獲取活動列表（後台）
apiAdminRouter.get('/events', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = '1=1';
    const params = [];
    
    if (year && month) {
      whereClause += ' AND strftime(\'%Y\', event_date) = ? AND strftime(\'%m\', event_date) = ?';
      params.push(String(year), String(month).padStart(2, '0'));
    }
    
    const rows = await query(`
      SELECT e.*, 
             COUNT(er.id) as registration_count
      FROM events e
      LEFT JOIN event_registrations er ON er.event_id = e.id AND er.status = 'interested'
      WHERE ${whereClause}
      GROUP BY e.id
      ORDER BY e.event_date ASC, e.start_time ASC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/admin/events] Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// 獲取單個活動（後台）
apiAdminRouter.get('/events/:id', requireAuth, async (req, res) => {
  const rows = await query('SELECT * FROM events WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// 創建活動（後台）
apiAdminRouter.post('/events', requireEditorOrAdmin, async (req, res) => {
  try {
    const { event_date, event_type, title, description, start_time, end_time, max_participants, is_active } = req.body;
    
    if (!event_date || !event_type || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await query(`
      INSERT INTO events (event_date, event_type, title, description, start_time, end_time, max_participants, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      String(event_date),
      String(event_type),
      String(title),
      description || null,
      start_time || null,
      end_time || null,
      max_participants ? Number(max_participants) : null,
      is_active ? 1 : 0
    ]);
    
    res.json({ ok: true, id: result.insertId || result.lastInsertRowid });
  } catch (err) {
    console.error('[POST /api/admin/events] Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// 更新活動（後台）
apiAdminRouter.put('/events/:id', requireEditorOrAdmin, async (req, res) => {
  try {
    const { event_date, event_type, title, description, start_time, end_time, max_participants, is_active } = req.body;
    
    await query(`
      UPDATE events 
      SET event_date = ?, event_type = ?, title = ?, description = ?, 
          start_time = ?, end_time = ?, max_participants = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      String(event_date),
      String(event_type),
      String(title),
      description || null,
      start_time || null,
      end_time || null,
      max_participants ? Number(max_participants) : null,
      is_active ? 1 : 0,
      req.params.id
    ]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/admin/events/:id] Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// 刪除活動（後台）
apiAdminRouter.delete('/events/:id', requireEditorOrAdmin, async (req, res) => {
  await query('DELETE FROM events WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// 獲取活動報名記錄（後台）
apiAdminRouter.get('/events/:id/registrations', requireAuth, async (req, res) => {
  const rows = await query(`
    SELECT er.*, 
           COALESCE(m.chinese_name, m.name, m.english_name, m.email) AS name,
           m.email, m.phone_mobile
    FROM event_registrations er
    JOIN members m ON m.id = er.member_id
    WHERE er.event_id = ?
    ORDER BY er.created_at DESC
  `, [req.params.id]);
  res.json(rows);
});

// 獲取最新報名記錄（後台，用於側邊欄顯示）
apiAdminRouter.get('/events/registrations/latest', requireAuth, async (req, res) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
  const rows = await query(`
    SELECT er.*, 
           COALESCE(m.chinese_name, m.name, m.english_name, m.email) AS name,
           m.email, m.phone_mobile,
           e.title AS event_title, e.event_date, e.event_type, e.start_time
    FROM event_registrations er
    JOIN members m ON m.id = er.member_id
    JOIN events e ON e.id = er.event_id
    ORDER BY er.created_at DESC
    LIMIT ?
  `, [limit]);
  res.json(rows);
});

// 更新報名記錄狀態（後台）
apiAdminRouter.put('/events/registrations/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['interested', 'confirmed', 'cancelled', 'pending', 'contacted'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  await query('UPDATE event_registrations SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
});


