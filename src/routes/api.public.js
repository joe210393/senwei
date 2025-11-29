import { Router } from 'express';
import { query } from '../config/db.js';
import bcrypt from 'bcrypt';
import sanitizeHtml from 'sanitize-html';
import { exposeCsrfToken } from '../middleware/csrf.js';
import { sendContactMail } from '../config/mailer.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

export const apiPublicRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '..', '..', 'logs');

// CSRF 取得端點（回傳前端可用之 CSRF Token）
apiPublicRouter.get('/csrf', exposeCsrfToken);

// 站台設定（含背景與 LINE 連結等）
apiPublicRouter.get('/settings', async (_req, res) => {
  try {
    const rows = await query('SELECT `key`, `value` FROM settings');
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (!('default_bg_color' in settings)) settings.default_bg_color = '#f5f6f8';
    return res.json(settings);
  } catch {
    // DB 異常時提供安全預設，避免前端報錯
    return res.json({ default_bg_color: '#f5f6f8' });
  }
});

// 導覽選單（前台渲染使用）
apiPublicRouter.get('/menus', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM menus WHERE visible = 1 ORDER BY parent_id IS NOT NULL, parent_id, order_index');
    res.json(rows);
  } catch {
    // 發生錯誤時回傳空清單，保留靜態導覽列
    res.json([]);
  }
});

// 單一頁面（後台發佈的靜態內容）
apiPublicRouter.get('/pages/:slug', async (req, res) => {
  const { slug } = req.params;
  const rows = await query('SELECT p.*, m.file_path AS background_image_url FROM pages p LEFT JOIN media m ON m.id = p.background_image_id WHERE p.slug = ? AND p.is_published = 1', [slug]);
  const page = rows[0];
  if (!page) return res.status(404).json({ error: 'Not found' });
  res.json(page);
});

// 部落格列表（支援分頁與搜尋）
apiPublicRouter.get('/posts', async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const where = ['is_published = 1'];
  const params = [];
  if (search) {
    where.push('(title LIKE ? OR excerpt LIKE ? )');
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 10;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const items = await query(
    `SELECT p.id, p.title, p.slug, p.excerpt, p.cover_media_id, p.published_at, m.file_path AS cover_url
     FROM posts p LEFT JOIN media m ON m.id = p.cover_media_id
     ${whereSql.replaceAll('posts','p')} ORDER BY p.published_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  const [{ cnt }] = await query(`SELECT COUNT(1) AS cnt FROM posts ${whereSql}`, params);
  res.json({ items, page, limit, total: cnt });
});

// 部落格內頁
apiPublicRouter.get('/posts/:slug', async (req, res) => {
  const rows = await query('SELECT * FROM posts WHERE slug = ? AND is_published = 1', [req.params.slug]);
  const post = rows[0];
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post);
});

// 最新消息 列表／內頁
apiPublicRouter.get('/news', async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const where = ['is_published = 1'];
  const params = [];
  if (search) {
    where.push('(title LIKE ? )');
    params.push(`%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeLimit2 = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 10;
  const safeOffset2 = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const items = await query(
    `SELECT n.id, n.title, n.slug, n.published_at, n.excerpt, m.file_path AS cover_url
     FROM news n LEFT JOIN media m ON m.id = n.cover_media_id
     ${whereSql.replaceAll('news','n')} ORDER BY n.published_at DESC LIMIT ${safeLimit2} OFFSET ${safeOffset2}`,
    params
  );
  const [{ cnt }] = await query(`SELECT COUNT(1) AS cnt FROM news ${whereSql}`, params);
  res.json({ items, page, limit, total: cnt });
});

apiPublicRouter.get('/news/:slug', async (req, res) => {
  const rows = await query('SELECT * FROM news WHERE slug = ? AND is_published = 1', [req.params.slug]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// 影像紀錄 列表／內頁
apiPublicRouter.get('/media-records', async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const offset = (page - 1) * limit;
  const where = ['m.is_published = 1'];
  const params = [];
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 10;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const items = await query(
    `SELECT m.id, m.title, m.slug, m.published_at, m.excerpt, m.embed_url, md.file_path AS cover_url
     FROM media_records m LEFT JOIN media md ON md.id = m.cover_media_id
     ${whereSql} ORDER BY COALESCE(m.published_at, m.id) DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  const [{ cnt }] = await query(`SELECT COUNT(1) AS cnt FROM media_records m ${whereSql}`, params);
  console.log('[GET /media-records] Found', items.length, 'items, total:', cnt);
  console.log('[GET /media-records] WHERE clause:', whereSql);
  console.log('[GET /media-records] Sample items:', items.slice(0, 2).map(i => ({ id: i.id, title: i.title, is_published: 'N/A (not in SELECT)' })));
  
  // Debug: Also check raw database values
  const debugRows = await query('SELECT id, title, is_published FROM media_records ORDER BY id DESC LIMIT 5');
  console.log('[GET /media-records] Debug - Raw DB values:', debugRows);
  
  res.json({ items, page, limit, total: cnt });
});

apiPublicRouter.get('/media-records/:slug', async (req, res) => {
  const rows = await query('SELECT * FROM media_records WHERE slug = ? AND is_published = 1', [req.params.slug]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// 傳奇榜清單（僅已發佈、含封面）
apiPublicRouter.get('/leaderboard', async (_req, res) => {
  const rows = await query(
    'SELECT l.id, l.title, l.slug, l.excerpt, m.file_path AS cover_url FROM leaderboard l LEFT JOIN media m ON m.id = l.cover_media_id WHERE l.is_published = 1 ORDER BY COALESCE(l.published_at, l.id) DESC'
  );
  res.json(rows);
});

// 傳奇榜內頁
apiPublicRouter.get('/leaderboard/:slug', async (req, res) => {
  const rows = await query('SELECT l.*, m.file_path AS cover_url FROM leaderboard l LEFT JOIN media m ON m.id = l.cover_media_id WHERE l.slug = ? AND l.is_published = 1 LIMIT 1', [req.params.slug]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// 課程方案清單
apiPublicRouter.get('/plans', async (_req, res) => {
  const rows = await query('SELECT p.id, p.name, p.price, p.tagline, p.slug, p.content_html, p.published_at, m.file_path AS cover_url FROM plans p LEFT JOIN media m ON m.id = p.cover_media_id WHERE p.is_active = 1 AND p.is_published = 1 ORDER BY COALESCE(p.published_at, p.id) DESC');
  res.json(rows);
});

// 課程方案內頁
apiPublicRouter.get('/plans/:slug', async (req, res) => {
  const rawParam = String(req.params.slug || '').trim();
  if (!rawParam) return res.status(404).json({ error: 'Not found' });
  const lookupById = req.query.by_id === '1' && /^[0-9]+$/.test(rawParam);
  const condition = lookupById ? 'p.id = ?' : 'p.slug = ?';
  const bindValue = lookupById ? Number(rawParam) : rawParam;
  const rows = await query(
    `SELECT p.*, m.file_path AS cover_url
     FROM plans p
     LEFT JOIN media m ON m.id = p.cover_media_id
     WHERE ${condition} AND p.is_active = 1 AND p.is_published = 1
     LIMIT 1`,
    [bindValue]
  );
  const plan = rows[0];
  if (!plan) return res.status(404).json({ error: 'Not found' });
  res.json(plan);
});

// 課程試讀清單（公開可見）
apiPublicRouter.get('/trial', async (_req, res) => {
  const rows = await query('SELECT * FROM trial_contents WHERE is_public = 1 ORDER BY id');
  res.json(rows);
});

// 首頁輪播圖（公開）
apiPublicRouter.get('/slides', async (_req, res) => {
  const rows = await query('SELECT s.id, s.title, s.link_url, s.order_index, m.file_path AS image_url FROM slides s JOIN media m ON m.id = s.media_id WHERE s.is_active = 1 ORDER BY s.order_index ASC, s.id DESC');
  res.json(rows);
});

// 商品類別列表（公開）
apiPublicRouter.get('/product-categories', async (_req, res) => {
  const rows = await query('SELECT * FROM product_categories ORDER BY order_index, id');
  res.json(rows);
});

// 商品列表（公開，支援類別篩選和分頁）
apiPublicRouter.get('/products', async (req, res) => {
  const categoryId = req.query.category_id;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 15; // 一頁15個商品
  const offset = (page - 1) * limit;
  
  let countQuery, dataQuery, countParams, dataParams;
  
  if (categoryId) {
    countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE p.is_published = 1 AND p.category_id = ?
    `;
    countParams = [categoryId];
    dataQuery = `
      SELECT p.id, p.name, p.slug, p.price, p.category_id, c.name AS category_name, m.file_path AS cover_url
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN media m ON m.id = p.cover_media_id
      WHERE p.is_published = 1 AND p.category_id = ?
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `;
    dataParams = [categoryId, limit, offset];
  } else {
    countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE p.is_published = 1
    `;
    countParams = [];
    dataQuery = `
      SELECT p.id, p.name, p.slug, p.price, p.category_id, c.name AS category_name, m.file_path AS cover_url
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN media m ON m.id = p.cover_media_id
      WHERE p.is_published = 1
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `;
    dataParams = [limit, offset];
  }
  
  const countResult = await query(countQuery, countParams);
  const total = countResult[0]?.total || 0;
  const rows = await query(dataQuery, dataParams);
  
  res.json({
    items: rows,
    page: page,
    limit: limit,
    total: total,
    totalPages: Math.ceil(total / limit)
  });
});

// ========== 預約報名系統（公開） ==========

// 獲取活動列表（公開，只顯示啟用的）
apiPublicRouter.get('/events', async (req, res) => {
  const { year, month, date } = req.query;
  let whereClause = 'e.is_active = 1';
  const params = [];
  
  if (date) {
    whereClause += ' AND e.event_date = ?';
    params.push(String(date));
  } else if (year && month) {
    whereClause += ' AND strftime(\'%Y\', e.event_date) = ? AND strftime(\'%m\', e.event_date) = ?';
    params.push(String(year), String(month).padStart(2, '0'));
  }
  
  const memberId = req.session?.member?.id;
  
  // 如果有登入會員，同時查詢報名狀態
  if (memberId) {
    const rows = await query(`
      SELECT e.*, 
             CASE WHEN er.id IS NOT NULL THEN 1 ELSE 0 END AS is_registered,
             er.status AS registration_status
      FROM events e
      LEFT JOIN event_registrations er ON er.event_id = e.id AND er.member_id = ?
      WHERE ${whereClause}
      ORDER BY e.event_date ASC, e.start_time ASC
    `, [memberId, ...params]);
    res.json(rows);
  } else {
    const rows = await query(`
      SELECT e.*
      FROM events e
      WHERE ${whereClause}
      ORDER BY e.event_date ASC, e.start_time ASC
    `, params);
    res.json(rows);
  }
});

// 獲取單個活動（公開）
apiPublicRouter.get('/events/:id', async (req, res) => {
  const rows = await query('SELECT * FROM events WHERE id = ? AND is_active = 1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// 報名活動（需登入會員）
apiPublicRouter.post('/events/:id/register', async (req, res) => {
  if (!req.session?.member?.id) {
    return res.status(401).json({ error: '請先登入會員' });
  }
  
  const eventId = req.params.id;
  const memberId = req.session.member.id;
  
  // 檢查活動是否存在且啟用
  const event = await query('SELECT * FROM events WHERE id = ? AND is_active = 1', [eventId]);
  if (!event.length) {
    return res.status(404).json({ error: '活動不存在或已關閉' });
  }
  
  // 檢查是否已經報名
  const existing = await query('SELECT * FROM event_registrations WHERE event_id = ? AND member_id = ?', [eventId, memberId]);
  if (existing.length) {
    return res.status(400).json({ error: '您已經報名過此活動' });
  }
  
  // 創建報名記錄
  await query(`
    INSERT INTO event_registrations (event_id, member_id, status, updated_at)
    VALUES (?, ?, 'interested', datetime('now'))
  `, [eventId, memberId]);
  
  res.json({ ok: true, message: '報名成功！工作人員將與您聯繫確認。' });
});

// 商品詳情（公開）
apiPublicRouter.get('/products/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) return res.status(404).json({ error: 'Not found' });
  
  const rows = await query(`
    SELECT p.*, c.name AS category_name, m.file_path AS cover_url
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    WHERE p.slug = ? AND p.is_published = 1
    LIMIT 1
  `, [slug]);
  
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  
  // Get product images
  const images = await query(`
    SELECT pi.*, m.file_path, m.file_name
    FROM product_images pi
    LEFT JOIN media m ON m.id = pi.media_id
    WHERE pi.product_id = ?
    ORDER BY pi.order_index, pi.id
  `, [rows[0].id]);
  
  res.json({ ...rows[0], images });
});

// 上課內容（YouTube 連結），依會員等級篩選
apiPublicRouter.get('/courses', async (req, res) => {
  const tierOrder = { free: 0, basic: 1, advanced: 2, platinum: 3 };
  const memberTier = req.session?.member?.tier || 'free';
  const minRank = tierOrder[memberTier] ?? 0;
  const allowedTiers = Object.entries(tierOrder).filter(([,v]) => v <= minRank).map(([k]) => `'${k}'`).join(',');
  const rows = await query(`SELECT id, title, video_url, category, min_tier FROM course_contents WHERE is_active = 1 AND min_tier IN (${allowedTiers}) ORDER BY id DESC`);
  res.json(rows);
});

// 上課教材清單，依會員等級篩選
apiPublicRouter.get('/materials', async (req, res) => {
  const tierOrder = { free: 0, basic: 1, advanced: 2, platinum: 3 };
  const memberTier = req.session?.member?.tier || 'free';
  const minRank = tierOrder[memberTier] ?? 0;
  const allowedTiers = Object.entries(tierOrder).filter(([,v]) => v <= minRank).map(([k]) => `'${k}'`).join(',');
  const rows = await query(`SELECT cm.id, cm.title, cm.min_tier, m.file_path, m.file_name FROM course_materials cm JOIN media m ON m.id = cm.media_id WHERE cm.is_active = 1 AND cm.min_tier IN (${allowedTiers}) ORDER BY cm.id DESC`);
  res.json(rows);
});

// 聯絡表單送出（會寄通知信）
apiPublicRouter.post('/contact', async (req, res) => {
  const { name = '', email = '', phone = '', message = '' } = req.body || {};
  const cleanName = String(name).slice(0, 100).trim();
  const cleanEmail = String(email).slice(0, 150).trim();
  const cleanPhone = String(phone).slice(0, 30).trim();
  const cleanMessage = sanitizeHtml(String(message).slice(0, 5000), { allowedTags: [], allowedAttributes: {} });
  if (!cleanName || !cleanEmail || !cleanMessage) return res.status(400).json({ error: 'Missing required fields' });
  await query('INSERT INTO contacts(name, email, phone, message, created_at) VALUES (?,?,?,?, NOW())', [cleanName, cleanEmail, cleanPhone, cleanMessage]);
  try { await sendContactMail({ name: cleanName, email: cleanEmail, phone: cleanPhone, message: cleanMessage }); } catch {}
  
  // Log contact
  try { 
    const logEntry = `[${new Date().toISOString()}] Contact: ${cleanName} (${cleanEmail}) - ${cleanPhone}\n`;
    fs.appendFileSync(path.join(logsDir, 'contact.log'), logEntry); 
  } catch {}

  res.json({ ok: true });
});

apiPublicRouter.get('/debug-paths', async (_req, res) => {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  const privateDir = path.join(process.cwd(), 'private_member_uploads');
  
  // Also check Zeabur paths
  const zeaburData = '/app/data';
  const zeaburUploads = '/app/public/uploads';

  let zeaburDataFiles = [];
  try { zeaburDataFiles = fs.readdirSync(zeaburData); } catch(e) { zeaburDataFiles = [String(e)]; }

  let zeaburUploadsFiles = [];
  try { zeaburUploadsFiles = fs.readdirSync(zeaburUploads); } catch(e) { zeaburUploadsFiles = [String(e)]; }

  let uploadsFiles = [];
  let privateFiles = [];
  try { uploadsFiles = fs.readdirSync(uploadDir); } catch(e) { uploadsFiles = [String(e)]; }
  try { privateFiles = fs.readdirSync(privateDir); } catch(e) { privateFiles = [String(e)]; }
  
  res.json({
    cwd: process.cwd(),
    uploadDir,
    zeaburUploads,
    zeaburData,
    zeaburDataFiles_sample: zeaburDataFiles,
    zeaburUploadsFiles_sample: zeaburUploadsFiles,
    uploads_content_sample: uploadsFiles.slice(0, 20),
    private_content_sample: privateFiles.slice(0, 20)
  });
});

// 會員註冊與登入（公開）
apiPublicRouter.post('/members/register', async (req, res) => {
  const { email, password, name, chinese_name, english_name, gender, birth_date, id_number, phone_mobile, phone_landline, address, line_id, special_needs, referrer, username, password_hint_question, password_hint_answer } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const exists = await query('SELECT id FROM members WHERE email = ? OR username = ? LIMIT 1', [String(email), String(username || '')]);
  if (exists.length) return res.status(400).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(String(password), 10);
  const hintHash = password_hint_answer ? await bcrypt.hash(String(password_hint_answer), 10) : null;
  await query(`INSERT INTO members(email, username, password_hash, name, chinese_name, english_name, gender, birth_date, id_number, passport_number, phone_mobile, phone_landline, address, line_id, wechat_id, special_needs, referrer, password_hint_question, password_hint_answer_hash)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    String(email), username || null, hash, name || null, chinese_name || null, english_name || null,
    ['male','female','other'].includes(gender) ? gender : null,
    birth_date || null, id_number || null, null, phone_mobile || null, phone_landline || null,
    address || null, line_id || null, null, special_needs || null, referrer || null,
    password_hint_question || null, hintHash
  ]);
  // 註冊後自動登入（若帳號啟用）
  const [{ id, tier, is_active }] = await query('SELECT id, tier, is_active FROM members WHERE email = ? LIMIT 1', [String(email)]);
  if (is_active) {
    req.session.member = { id, email: String(email), name: name || null, tier };
  }
  res.json({ ok: true });
});

apiPublicRouter.post('/members/login', async (req, res) => {
  const { account, password } = req.body || {};
  const rows = await query('SELECT id, email, username, password_hash, name, tier, is_active FROM members WHERE email = ? OR username = ? LIMIT 1', [String(account), String(account)]);
  const m = rows[0];
  if (!m || !m.is_active) {
    try { fs.appendFileSync(path.join(logsDir, 'auth.log'), `[${new Date().toISOString()}] member_login_fail account=${account}\n`); } catch {}
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(String(password || ''), m.password_hash);
  if (!ok) {
    try { fs.appendFileSync(path.join(logsDir, 'auth.log'), `[${new Date().toISOString()}] member_login_fail account=${account}\n`); } catch {}
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const preserveAdmin = req.session?.user || null;
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.member = { id: m.id, email: m.email, name: m.name, tier: m.tier };
    if (preserveAdmin) req.session.user = preserveAdmin;
    res.json({ id: m.id, email: m.email, name: m.name, tier: m.tier });
  });
});

apiPublicRouter.post('/members/logout', async (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.member = null;
  res.json({ ok: true });
});

apiPublicRouter.get('/members/me', async (req, res) => {
  res.json(req.session?.member || null);
});

// 會員完整資料（需已登入）
apiPublicRouter.get('/members/profile', async (req, res) => {
  const member = req.session?.member;
  if (!member?.id) return res.status(401).json({ error: 'Unauthorized' });
  const rows = await query('SELECT id, email, username, name, chinese_name, english_name, gender, birth_date, id_number, phone_mobile, phone_landline, address, line_id, special_needs, referrer, tier, is_active, created_at FROM members WHERE id = ? LIMIT 1', [member.id]);
  const m = rows[0];
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

// 獲取會員的活動報名記錄（需已登入）
apiPublicRouter.get('/members/registrations', async (req, res) => {
  const member = req.session?.member;
  if (!member?.id) return res.status(401).json({ error: 'Unauthorized' });
  
  const rows = await query(`
    SELECT er.*,
           e.title AS event_title, e.event_date, e.event_type, e.start_time, e.end_time, e.description
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    WHERE er.member_id = ?
    ORDER BY er.created_at DESC
  `, [member.id]);
  
  res.json(rows);
});

// 會員檔案上傳（需已登入）
// 儲存路徑：每位會員一個獨立資料夾（私有目錄）
const memberStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const member = req.session?.member;
    if (!member?.id) return cb(new Error('Unauthorized'), '');
    const dir = path.join(process.cwd(), 'private_member_uploads', String(member.id));
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const member = req.session?.member;
    // keep original filename (sanitized), make unique if already exists
    let original = file.originalname || `upload-${Date.now()}`;
    try {
      const recoded = Buffer.from(original, 'latin1').toString('utf8');
      if (recoded && recoded !== original) original = recoded;
    } catch {}
    const base = path.basename(original);
    const safe = base.replace(/[\/:*?"<>|]+/g, '_').slice(0, 180);
    const dir = path.join(process.cwd(), 'private_member_uploads', String(member?.id || '')); 
    let finalName = safe || `file-${Date.now()}`;
    try {
      const ext = path.extname(finalName);
      const stem = finalName.slice(0, finalName.length - ext.length) || 'file';
      let idx = 1;
      while (fs.existsSync(path.join(dir, finalName))) {
        finalName = `${stem} (${idx})${ext}`;
        idx += 1;
      }
    } catch {}
    cb(null, finalName);
  }
});

const memberUpload = multer({
  storage: memberStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mt = file.mimetype || '';
    const allowedPrefixes = ['image/', 'video/'];
    const allowedExact = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'application/octet-stream'
    ]);
    if (allowedPrefixes.some(p => mt.startsWith(p)) || allowedExact.has(mt)) cb(null, true);
    else cb(new Error('Invalid file type'));
  }
});

function requireMemberAuth(req, res, next) {
  if (!req.session?.member?.id) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

apiPublicRouter.post('/members/upload', requireMemberAuth, memberUpload.array('files', 20), async (req, res) => {
  // 若為 multipart 多檔上傳：回傳可下載連結（受保護路由）
  if (Array.isArray(req.files) && req.files.length) {
    const items = req.files.map(f => ({ name: path.basename(f.filename || f.originalname || f.path), url: `/api/public/members/files/${encodeURIComponent(path.basename(f.filename || f.path))}` }));
    return res.json({ ok: true, items });
  }
  // 後備方案：原始串流上傳（單檔，透過 X-Filename）
  try {
    const member = req.session?.member;
    const chunks = [];
    const rawName = req.headers['x-filename'] ? String(req.headers['x-filename']) : `upload-${Date.now()}`;
    // decode and sanitize filename
    const safeName = path.basename(decodeURIComponent(rawName));
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const dir = path.join(process.cwd(), 'private_member_uploads', String(member.id));
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      const target = path.join(dir, safeName);
      fs.writeFileSync(target, buf);
      res.json({ ok: true, items: [{ name: safeName, url: `/api/public/members/files/${encodeURIComponent(safeName)}` }] });
    });
  } catch (e) {
    try { fs.appendFileSync(path.join(logsDir, 'upload.log'), `[${new Date().toISOString()}] member_upload_raw_fail id=${req.session?.member?.id||''} reason=${e?.message||''}\n`); } catch {}
    res.status(400).json({ error: 'Upload failed' });
  }
});

// 列出本人上傳之檔案（合併顯示舊 public 與新私有目錄）
apiPublicRouter.get('/members/files', requireMemberAuth, async (req, res) => {
  const memberId = String(req.session.member.id);
  const baseDir = path.join(process.cwd(), 'private_member_uploads', memberId);
  const legacyDir = path.join(process.cwd(), 'public', 'member_uploads', memberId);
  let items = [];
  try {
    const files = fs.readdirSync(baseDir);
    items = files.map((f) => ({ name: f, url: `/api/public/members/files/${encodeURIComponent(f)}` }));
  } catch {
    items = [];
  }
  // Also include legacy public folder files for backward compatibility
  try {
    const legacy = fs.readdirSync(legacyDir);
    const existing = new Set(items.map(i => i.name));
    legacy.forEach(f => { if (!existing.has(f)) items.push({ name: f, url: `/member_uploads/${memberId}/${encodeURIComponent(f)}` }); });
  } catch {}
  res.json({ items });
});

// 受保護下載路由（需登入且僅能下載自己的檔案）
apiPublicRouter.get('/members/files/:filename', requireMemberAuth, async (req, res) => {
  const memberId = String(req.session.member.id);
  const filename = path.basename(String(req.params.filename));
  const baseDir = path.join(process.cwd(), 'private_member_uploads', memberId);
  const target = path.join(baseDir, filename);
  try {
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.sendFile(target);
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});


