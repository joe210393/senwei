import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/com1.db');

const db = new Database(dbPath);

console.log('Migrating database content for new stationery site structure...');

try {
  // 1. Update Pages
  // about-teacher -> about-coop (關於合作社)
  // about-ftmo -> about-manufacturing (關於三星製造)
  // about-us -> about-us (關於我們) - Title update
  
  const updatePage = db.prepare('UPDATE pages SET slug = ?, title = ? WHERE slug = ?');
  const updatePageTitle = db.prepare('UPDATE pages SET title = ? WHERE slug = ?');
  
  // Try to update 'about-teacher' to 'about-coop'
  // If 'about-teacher' doesn't exist (e.g. already changed), this does nothing.
  updatePage.run('about-coop', '關於合作社', 'about-teacher');
  
  // If 'about-coop' didn't exist before but 'about-teacher' did, it's renamed.
  // If it already existed (unlikely in fresh DB unless run twice), we ensure title is correct.
  updatePageTitle.run('關於合作社', 'about-coop');

  // about-ftmo -> about-manufacturing
  updatePage.run('about-manufacturing', '關於三星製造', 'about-ftmo');
  updatePageTitle.run('關於三星製造', 'about-manufacturing');

  // about-us title
  updatePageTitle.run('關於我們', 'about-us');

  // 2. Update Menus
  // We'll delete existing menus and re-seed them to ensure clean structure match.
  db.prepare('DELETE FROM menus').run();
  
  const insertMenu = db.prepare('INSERT INTO menus (title, slug, url, order_index, parent_id, visible) VALUES (?, ?, ?, ?, ?, 1)');
  
  // Parent items
  const info = insertMenu.run('關於', null, null, 10, null);
  const parentId = info.lastInsertRowid;
  
  insertMenu.run('關於我們', 'about-us', null, 1, parentId);
  insertMenu.run('關於合作社', 'about-coop', null, 2, parentId);
  insertMenu.run('關於三星製造', 'about-manufacturing', null, 3, parentId);
  
  insertMenu.run('部落格', 'blog', null, 20, null);
  insertMenu.run('最新消息', 'news', null, 30, null);
  insertMenu.run('師資說明', 'leaderboard', null, 40, null); // URL stays leaderboard.html for now
  insertMenu.run('體驗課程專案', 'plans', null, 50, null); // URL stays plans.html
  insertMenu.run('聯絡我們', 'contact', null, 60, null);
  insertMenu.run('影像記錄', 'trial', null, 70, null); // URL stays trial.html

  console.log('Database migration completed.');
  
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  db.close();
}

