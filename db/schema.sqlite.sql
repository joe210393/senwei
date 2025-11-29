-- SQLite Schema
-- 用途：建立本地 SQLite 資料庫
-- 使用方式：由 Node.js script 執行

-- 後台使用者
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin', -- ENUM('admin','editor')
  must_change_password INTEGER DEFAULT 0, -- TINYINT(1)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 站台設定（key-value）
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  `key` TEXT UNIQUE,
  `value` TEXT
);

-- 導覽選單
CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NULL,
  title TEXT,
  slug TEXT,
  url TEXT,
  order_index INTEGER,
  visible INTEGER DEFAULT 1 -- TINYINT(1)
);
CREATE INDEX IF NOT EXISTS idx_menus_parent_id ON menus(parent_id);

-- 單一頁面（含關於頁）
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  title TEXT,
  content_html TEXT,
  background_image_id INTEGER NULL,
  is_published INTEGER DEFAULT 1 -- TINYINT(1)
);

-- 部落格文章
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  slug TEXT UNIQUE,
  excerpt TEXT,
  content_html TEXT,
  cover_media_id INTEGER NULL,
  published_at TEXT NULL,
  is_published INTEGER DEFAULT 0
);

-- 最新消息
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  slug TEXT UNIQUE,
  content_html TEXT,
  excerpt TEXT NULL,
  cover_media_id INTEGER NULL,
  published_at TEXT NULL,
  is_published INTEGER DEFAULT 0
);

-- 傳奇榜（文章型）
CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  slug TEXT UNIQUE,
  excerpt TEXT,
  content_html TEXT,
  cover_media_id INTEGER NULL,
  published_at TEXT NULL,
  is_published INTEGER DEFAULT 1
);

-- 課程方案（含文章欄位）
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  price REAL, -- DECIMAL(10,2)
  tagline TEXT NULL,
  features_json TEXT, -- JSON
  is_active INTEGER DEFAULT 1,
  title TEXT NULL,
  slug TEXT UNIQUE NULL,
  excerpt TEXT NULL,
  content_html TEXT NULL,
  cover_media_id INTEGER NULL,
  published_at TEXT NULL,
  is_published INTEGER DEFAULT 0
);

-- 課程試讀
CREATE TABLE IF NOT EXISTS trial_contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  type TEXT, -- ENUM('video','article')
  content_html TEXT NULL,
  video_url TEXT NULL,
  is_public INTEGER DEFAULT 1
);

-- 聯絡表單
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  created_at TEXT,
  processed INTEGER DEFAULT 0
);

-- 媒體庫
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT,
  file_path TEXT,
  mime_type TEXT,
  file_size INTEGER,
  alt_text TEXT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 會員
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  username TEXT UNIQUE NULL,
  password_hash TEXT,
  name TEXT NULL,
  chinese_name TEXT NULL,
  english_name TEXT NULL,
  gender TEXT NULL, -- ENUM
  birth_date TEXT NULL, -- DATE
  id_number TEXT NULL,
  passport_number TEXT NULL,
  phone_mobile TEXT NULL,
  phone_landline TEXT NULL,
  address TEXT NULL,
  line_id TEXT NULL,
  wechat_id TEXT NULL,
  special_needs TEXT NULL,
  referrer TEXT NULL,
  password_hint_question TEXT NULL,
  password_hint_answer_hash TEXT NULL,
  tier TEXT DEFAULT 'free', -- ENUM
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 首頁輪播
CREATE TABLE IF NOT EXISTS slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL,
  title TEXT NULL,
  link_url TEXT NULL,
  order_index INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_slides_order ON slides(order_index);
CREATE INDEX IF NOT EXISTS idx_slides_active ON slides(is_active);

-- 上課內容（YouTube 連結）
CREATE TABLE IF NOT EXISTS course_contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  min_tier TEXT DEFAULT 'free',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 上課教材（媒體檔案）
CREATE TABLE IF NOT EXISTS course_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  media_id INTEGER NOT NULL,
  min_tier TEXT DEFAULT 'free',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_course_materials_media ON course_materials(media_id);

-- 商品類別
CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  order_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_categories_order ON product_categories(order_index);

-- 商品
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  price REAL NOT NULL, -- DECIMAL(10,2)
  category_id INTEGER NULL,
  cover_media_id INTEGER NULL,
  description_html TEXT NULL,
  is_published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_published ON products(is_published);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- 商品照片（多張）
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_order ON product_images(product_id, order_index);

-- 預約報名活動
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL, -- DATE format: YYYY-MM-DD
  event_type TEXT NOT NULL, -- 'course', 'performance', 'space'
  title TEXT NOT NULL,
  description TEXT NULL,
  start_time TEXT NULL, -- TIME format: HH:MM
  end_time TEXT NULL, -- TIME format: HH:MM
  max_participants INTEGER NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active);

-- 活動報名記錄
CREATE TABLE IF NOT EXISTS event_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  status TEXT DEFAULT 'interested', -- 'interested', 'confirmed', 'cancelled'
  notes TEXT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_member ON event_registrations(member_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_unique ON event_registrations(event_id, member_id);

-- 預設關於頁
INSERT OR IGNORE INTO pages(slug, title, content_html, background_image_id, is_published)
VALUES
 ('about-guchau','關於鼓潮','',NULL,1),
 ('about-music','關於音樂課程','',NULL,1);

