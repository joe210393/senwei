import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/com1.db');
const schemaPath = path.join(__dirname, '../../db/schema.sqlite.sql');
const oldDbPath = path.join(__dirname, '../../data/site.db');

// Support Zeabur persistent path for seed uploads
let targetUploadsDir = path.join(__dirname, '../../public/uploads');
if (fs.existsSync('/app/public/uploads')) {
    targetUploadsDir = '/app/public/uploads';
    console.log('Using Zeabur persistent uploads path for seeding:', targetUploadsDir);
}

console.log('--- DB INIT DEBUG START ---');
console.log('Time:', new Date().toISOString());
console.log('__dirname:', __dirname);
console.log('Target dbPath:', dbPath);

try {
    const dataDir = path.dirname(dbPath);
    console.log('Checking Data Directory:', dataDir);
    if (fs.existsSync(dataDir)) {
        console.log('Data Directory Exists. Contents:', fs.readdirSync(dataDir));
    } else {
        console.log('Data Directory DOES NOT EXIST. It will be created.');
    }
} catch (e) {
    console.error('Error inspecting data directory:', e);
}

// 1. Recovery/Migration Logic:
if (!fs.existsSync(dbPath) && fs.existsSync(oldDbPath)) {
    console.log('Found old "site.db" but no "com1.db". Attempting to migrate/copy old data...');
    try {
        fs.copyFileSync(oldDbPath, dbPath);
        console.log('Migration successful: Copied site.db to com1.db');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

// 2. Standard Seeding Logic
if (!fs.existsSync(dbPath)) {
    const seedPath = path.join(__dirname, '../../seed/com1.db');
    if (fs.existsSync(seedPath)) {
        console.log(`Found seed database at ${seedPath}, attempting to restore...`);
        try {
            const dbDir = path.dirname(dbPath);
            if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
            
            fs.copyFileSync(seedPath, dbPath);
            
            const walPath = seedPath + '-wal';
            const shmPath = seedPath + '-shm';
            if (fs.existsSync(walPath)) fs.copyFileSync(walPath, dbPath + '-wal');
            if (fs.existsSync(shmPath)) fs.copyFileSync(shmPath, dbPath + '-shm');

            console.log('Database seeded successfully from local backup.');
        } catch (e) {
            console.error('Failed to seed database:', e);
        }
    }
}

// Check for seed uploads
const uploadsDir = targetUploadsDir;
const seedUploadsDir = path.join(__dirname, '../../seed/uploads');
if (fs.existsSync(seedUploadsDir)) {
    console.log('Seeding uploads...');
    try {
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const files = fs.readdirSync(seedUploadsDir);
        for (const file of files) {
            const src = path.join(seedUploadsDir, file);
            const dest = path.join(uploadsDir, file);
            if (!fs.existsSync(dest)) {
                fs.copyFileSync(src, dest);
            }
        }
        console.log(`Seeded ${files.length} upload files.`);
    } catch (e) {
        console.error('Failed to seed uploads:', e);
    }
}

console.log(`Initializing SQLite database at ${dbPath}...`);

try {
  const db = new Database(dbPath);
  
  let tablesExist = false;
  try {
    const test = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (test) tablesExist = true;
  } catch (e) {}

  if (!tablesExist) {
     console.log('Tables missing, applying schema...');
     const schema = fs.readFileSync(schemaPath, 'utf8');
     db.exec(schema);
     console.log('Database schema applied.');
  } else {
     console.log('Tables already exist, checking for new tables...');
     // Even if tables exist, check for new tables like events
     try {
       const testEvents = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
       if (!testEvents) {
         console.log('Events table missing, creating...');
         db.prepare(`CREATE TABLE IF NOT EXISTS events (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           event_date TEXT NOT NULL,
           event_type TEXT NOT NULL,
           title TEXT NOT NULL,
           description TEXT NULL,
           start_time TEXT NULL,
           end_time TEXT NULL,
           max_participants INTEGER NULL,
           is_active INTEGER DEFAULT 1,
           created_at TEXT DEFAULT (datetime('now')),
           updated_at TEXT DEFAULT (datetime('now'))
         )`).run();
         db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)`).run();
         db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`).run();
         db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active)`).run();
       }
       
       const testRegistrations = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='event_registrations'").get();
       if (!testRegistrations) {
         console.log('Event_registrations table missing, creating...');
         db.prepare(`CREATE TABLE IF NOT EXISTS event_registrations (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           event_id INTEGER NOT NULL,
           member_id INTEGER NOT NULL,
           status TEXT DEFAULT 'interested',
           notes TEXT NULL,
           created_at TEXT DEFAULT (datetime('now')),
           updated_at TEXT DEFAULT (datetime('now')),
           FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
           FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
         )`).run();
         db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id)`).run();
         db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_registrations_member ON event_registrations(member_id)`).run();
         db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_unique ON event_registrations(event_id, member_id)`).run();
       }
     } catch (e) {
       console.error('Error creating events tables:', e);
     }
  }
  
  let adminExists = false;
  try {
      adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  } catch(e) {}

  if (!adminExists) {
    console.log('Creating default admin user...');
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare('INSERT INTO users(username, password_hash, role, must_change_password) VALUES (?,?,?,?)')
      .run('admin', hash, 'admin', 1);
    
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(`key`,`value`) VALUES (?,?)');
    insertSetting.run('site_name', '鼓潮音樂');
    insertSetting.run('default_bg_color', '#f7f7f7');
    insertSetting.run('theme', 'default');
    console.log('Default admin user created.');
  }

  console.log('Applying structure updates...');
  
  // Insert default pages if missing (use INSERT OR REPLACE to ensure they exist)
  const insertPage = db.prepare('INSERT OR REPLACE INTO pages (slug, title, content_html, is_published) VALUES (?, ?, COALESCE((SELECT content_html FROM pages WHERE slug = ?), ?), 1)');
  // For new pages, use INSERT OR IGNORE to avoid overwriting existing content
  const insertPageNew = db.prepare('INSERT OR IGNORE INTO pages (slug, title, content_html, is_published) VALUES (?, ?, ?, 1)');
  
  insertPageNew.run('about-senwei', '關於我們', '<p>關於我們的內容...</p>');
  insertPageNew.run('about-story', '品牌故事', '<p>品牌故事內容...</p>');
  insertPageNew.run('about-history', '開發歷程', '<p>開發歷程內容...</p>');
  
  // Ensure service pages exist (create if missing, but don't overwrite existing content)
  insertPageNew.run('service-courses', '音樂課程', '<p>音樂課程內容...</p>');
  insertPageNew.run('service-commercial', '商業演出', '<p>商業演出內容...</p>');
  insertPageNew.run('service-sales', '樂器販售', '<p>樂器販售內容...</p>');
  insertPageNew.run('service-space', '共享與藝術空間', '<p>共享與藝術空間內容...</p>');
  insertPageNew.run('service-tourism', '音樂觀光體驗', '<p>音樂觀光體驗內容...</p>');
  
  insertPageNew.run('media-records', '影像紀錄', '<p>影像紀錄內容...</p>');
  
  // Double-check: if any service page is still missing, create it with minimal content
  const checkPage = db.prepare('SELECT id FROM pages WHERE slug = ?');
  const servicePages = [
    { slug: 'service-courses', title: '音樂課程' },
    { slug: 'service-commercial', title: '商業演出' },
    { slug: 'service-sales', title: '樂器販售' },
    { slug: 'service-space', title: '共享與藝術空間' },
    { slug: 'service-tourism', title: '音樂觀光體驗' }
  ];
  servicePages.forEach(page => {
    const exists = checkPage.get(page.slug);
    if (!exists) {
      console.log(`Creating missing page: ${page.slug}`);
      insertPageNew.run(page.slug, page.title, `<p>${page.title}內容...</p>`);
    }
  });

  // Re-seed Menus to match requested structure
  // We check if the new structure exists, if not (or partial), we enforce it.
  // Simpler: Delete all and re-insert to guarantee order and structure.
  // Users can re-order later if they really want, but this fixes the "broken" state.
  db.prepare('DELETE FROM menus').run();
  const insertMenu = db.prepare('INSERT INTO menus (title, slug, url, order_index, parent_id, visible) VALUES (?, ?, ?, ?, ?, 1)');
  
  // 關於
  const aboutInfo = insertMenu.run('關於', null, '#', 10, null);
  const aboutId = aboutInfo.lastInsertRowid;
  insertMenu.run('關於我們', 'about-senwei', '/about-senwei.html', 1, aboutId);
  insertMenu.run('品牌故事', 'about-story', '/about-story.html', 2, aboutId);
  insertMenu.run('開發歷程', 'about-history', '/about-history.html', 3, aboutId);
  
  // 服務項目
  const servicesInfo = insertMenu.run('服務項目', null, '#', 20, null);
  const servicesId = servicesInfo.lastInsertRowid;
  insertMenu.run('音樂課程', 'service-courses', '/service-courses.html', 1, servicesId);
  insertMenu.run('商業演出', 'service-commercial', '/service-commercial.html', 2, servicesId);
  insertMenu.run('樂器販售', 'service-sales', '/service-sales.html', 3, servicesId);
  insertMenu.run('共享與藝術空間', 'service-space', '/service-space.html', 4, servicesId);
  insertMenu.run('音樂觀光體驗', 'service-tourism', '/service-tourism.html', 5, servicesId);
  
  // Others
  insertMenu.run('相關報導', 'news', '/news.html', 30, null);
  insertMenu.run('影像紀錄', 'media-records', '/media-records.html', 40, null);
  insertMenu.run('預約報名', 'booking', '/booking.html', 45, null);
  insertMenu.run('聯絡我們', 'contact', '/contact.html', 50, null);

  // Check for product_categories and products tables
  try {
    const testCategories = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_categories'").get();
    if (!testCategories) {
      console.log('Creating product_categories table...');
      db.prepare(`CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        order_index INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_product_categories_order ON product_categories(order_index)`).run();
    }
    
    const testProducts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
    if (!testProducts) {
      console.log('Creating products table...');
      db.prepare(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        price REAL NOT NULL,
        category_id INTEGER NULL,
        cover_media_id INTEGER NULL,
        description_html TEXT NULL,
        is_published INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
        FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_published ON products(is_published)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)`).run();
    }
    
    const testProductImages = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_images'").get();
    if (!testProductImages) {
      console.log('Creating product_images table...');
      db.prepare(`CREATE TABLE IF NOT EXISTS product_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_product_images_order ON product_images(product_id, order_index)`).run();
    }
  } catch (e) { console.error('Failed to check/create product tables', e); }

  // Check for media_records table
  try {
    const test = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='media_records'").get();
    if (!test) {
      console.log('Creating media_records table...');
      db.prepare(`CREATE TABLE IF NOT EXISTS media_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        slug TEXT UNIQUE,
        content_html TEXT,
        excerpt TEXT,
        embed_url TEXT,
        cover_media_id INTEGER,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_published INTEGER DEFAULT 0
      )`).run();
    }
  } catch (e) { console.error('Failed to check/create media_records table', e); }
  
  // Check for events table
  try {
    const testEvents = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
    if (!testEvents) {
      console.log('Creating events table...');
      db.prepare(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_date TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NULL,
        start_time TEXT NULL,
        end_time TEXT NULL,
        max_participants INTEGER NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active)`).run();
    }
    
    const testRegistrations = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='event_registrations'").get();
    if (!testRegistrations) {
      console.log('Creating event_registrations table...');
      db.prepare(`CREATE TABLE IF NOT EXISTS event_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        member_id INTEGER NOT NULL,
        status TEXT DEFAULT 'interested',
        notes TEXT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_registrations_member ON event_registrations(member_id)`).run();
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_unique ON event_registrations(event_id, member_id)`).run();
    }
  } catch (e) { console.error('Failed to check/create events tables', e); }

  console.log('Menu structure updated.');

  db.close();
} catch (err) {
  console.error('Error initializing database:', err);
  // process.exit(1); // Don't crash server if init fails slightly
}
