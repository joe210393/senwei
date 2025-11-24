import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/site.db');
const schemaPath = path.join(__dirname, '../../db/schema.sqlite.sql');

console.log(`Initializing SQLite database at ${dbPath}...`);

try {
  // NOTE: This script previously deleted the DB.
  // We changed it to NOT delete by default to support safe re-runs on fresh deployments.
  // To force a clean slate, manually delete site.db or run the clean-db script.
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
  const updatePage = db.prepare('UPDATE pages SET slug = ?, title = ? WHERE slug = ?');
  const updatePageTitle = db.prepare('UPDATE pages SET title = ? WHERE slug = ?');
  
  updatePage.run('about-coop', '關於合作社', 'about-teacher');
  updatePageTitle.run('關於合作社', 'about-coop');
  updatePage.run('about-manufacturing', '關於三星製造', 'about-ftmo');
  updatePageTitle.run('關於三星製造', 'about-manufacturing');
  updatePageTitle.run('關於我們', 'about-us');

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
      
      insertMenu.run('關於我們', 'about-us', null, 1, parentId);
      insertMenu.run('關於合作社', 'about-coop', null, 2, parentId);
      insertMenu.run('關於三星製造', 'about-manufacturing', null, 3, parentId);
      
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
