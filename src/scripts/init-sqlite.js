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
// If com1.db is missing, but we have site.db (old DB), let's use that instead of a fresh seed.
// This helps preserve data if we switched filenames but still have the old file in the volume.
if (!fs.existsSync(dbPath) && fs.existsSync(oldDbPath)) {
    console.log('Found old "site.db" but no "com1.db". Attempting to migrate/copy old data...');
    try {
        fs.copyFileSync(oldDbPath, dbPath);
        console.log('Migration successful: Copied site.db to com1.db');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

// 2. Standard Seeding Logic: Only seed if DB file is still missing
// We removed the forced overwrite logic to avoid data loss on subsequent restarts
if (!fs.existsSync(dbPath)) {
    const seedPath = path.join(__dirname, '../../seed/com1.db');
    if (fs.existsSync(seedPath)) {
        console.log(`Found seed database at ${seedPath}, attempting to restore...`);
        try {
            const dbDir = path.dirname(dbPath);
            if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
            
            fs.copyFileSync(seedPath, dbPath);
            console.log('Database seeded successfully from local backup.');
        } catch (e) {
            console.error('Failed to seed database:', e);
        }
    }
}

// Check for seed uploads
const uploadsDir = targetUploadsDir; // Use resolved target path
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
  // NOTE: This script previously deleted the DB.
  // We changed it to NOT delete by default to support safe re-runs on fresh deployments.
  // To force a clean slate, manually delete com1.db or run the clean-db script.
  const db = new Database(dbPath);
  
  // Check if 'users' table exists to determine if we need to run schema
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
     console.log('Tables already exist, skipping schema creation.');
  }
  
  // Create default admin user if not exists
  let adminExists = false;
  try {
      adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  } catch(e) {
      // Maybe table didn't exist before schema run, now it should
  }

  if (!adminExists) {
    console.log('Creating default admin user...');
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare('INSERT INTO users(username, password_hash, role, must_change_password) VALUES (?,?,?,?)')
      .run('admin', hash, 'admin', 1);
    
    // Insert default settings
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(`key`,`value`) VALUES (?,?)');
    insertSetting.run('site_name', 'My Site');
    insertSetting.run('line_url', process.env.LINE_OFFICIAL_ACCOUNT_URL || '');
    insertSetting.run('default_bg_color', '#f7f7f7');
    insertSetting.run('theme', 'default');
    
    console.log('Default admin user created: username="admin", password="admin"');
  } else {
    console.log('Admin user already exists.');
  }

  // Add Content Migration logic directly here to ensure it runs for new deployments
  console.log('Checking for content migration needs...');
  
  // Update Pages
  const renamePage = db.prepare('UPDATE pages SET slug = ?, title = ? WHERE slug = ?');
  renamePage.run('about-music', '關於音樂課程', 'about-teacher');
  renamePage.run('about-guchau', '關於鼓潮', 'about-us');
  db.prepare("DELETE FROM pages WHERE slug = 'about-ftmo' OR slug = 'about-manufacturing'").run();

  // Reset Menus if they look like the old default (simple heuristic or just always update on init?)
  // To be safe, we'll just ensure the new menu items exist or replace. 
  // Since this is often run on empty DB, let's just run the menu insertion if menus are empty.
  const menuCount = db.prepare('SELECT COUNT(*) as c FROM menus').get().c;
  
  if (menuCount === 0) {
      console.log('Seeding menus...');
      const insertMenu = db.prepare('INSERT INTO menus (title, slug, url, order_index, parent_id, visible) VALUES (?, ?, ?, ?, ?, 1)');
      
      // Parent items
      const info = insertMenu.run('關於', null, null, 10, null);
      const parentId = info.lastInsertRowid;
      
      insertMenu.run('關於鼓潮', 'about-guchau', '/about-guchau.html', 1, parentId);
      insertMenu.run('關於音樂課程', 'about-music', '/about-music.html', 2, parentId);
      
      insertMenu.run('部落格', 'blog', null, 20, null);
      insertMenu.run('最新消息', 'news', null, 30, null);
      insertMenu.run('師資說明', 'leaderboard', null, 40, null); 
      insertMenu.run('體驗課程專案', 'plans', null, 50, null); 
      insertMenu.run('聯絡我們', 'contact', null, 60, null);
      insertMenu.run('影像記錄', 'trial', null, 70, null); 
  }

  db.close();
} catch (err) {
  console.error('Error initializing database:', err);
  process.exit(1);
}
