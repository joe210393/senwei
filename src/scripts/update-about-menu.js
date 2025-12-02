import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use same DB path logic as db.js
const projectRoot = path.join(__dirname, '../../');
let dbPath = process.env.DB_PATH;

if (!dbPath) {
  const zeaburDataPath = '/app/data';
  try {
    if (fs.existsSync(zeaburDataPath)) {
      dbPath = path.join(zeaburDataPath, 'com1.db');
      console.log('Detected Zeabur environment, using persistent path:', dbPath);
    }
  } catch (e) {}
}

if (!dbPath) {
  dbPath = path.join(projectRoot, 'data/com1.db');
}

console.log(`Updating database at ${dbPath}...`);

const db = new Database(dbPath);

try {
  // Update pages table
  console.log('Updating pages...');
  const updatePage = db.prepare('UPDATE pages SET slug = ?, title = ? WHERE slug = ?');
  
  // Update about-guchau to about-senwei
  const result1 = updatePage.run('about-senwei', '關於我們', 'about-guchau');
  console.log(`Updated ${result1.changes} page(s): about-guchau -> about-senwei`);
  
  // Update about-history title
  const updateHistoryTitle = db.prepare('UPDATE pages SET title = ? WHERE slug = ?');
  const result2 = updateHistoryTitle.run('開發歷程', 'about-history');
  console.log(`Updated ${result2.changes} page(s): about-history title -> 開發歷程`);
  
  // Insert about-senwei if it doesn't exist (in case about-guchau didn't exist)
  const insertPage = db.prepare('INSERT OR IGNORE INTO pages (slug, title, content_html, is_published) VALUES (?, ?, ?, 1)');
  insertPage.run('about-senwei', '關於我們', '<p>關於我們的內容...</p>');
  
  // Update menus table
  console.log('Updating menus...');
  const updateMenu = db.prepare('UPDATE menus SET title = ?, slug = ?, url = ? WHERE title = ? OR slug = ?');
  
  // Update 關於鼓潮 menu
  const result3 = updateMenu.run('關於我們', 'about-senwei', '/about-senwei.html', '關於鼓潮', 'about-guchau');
  console.log(`Updated ${result3.changes} menu item(s): 關於鼓潮 -> 關於我們`);
  
  // Update 鼓潮音樂歷程 menu
  const updateHistoryMenu = db.prepare('UPDATE menus SET title = ? WHERE title = ? OR (slug = ? AND title = ?)');
  const result4 = updateHistoryMenu.run('開發歷程', '鼓潮音樂歷程', 'about-history', '鼓潮音樂歷程');
  console.log(`Updated ${result4.changes} menu item(s): 鼓潮音樂歷程 -> 開發歷程`);
  
  // If menu doesn't exist, insert it
  const getAboutParent = db.prepare('SELECT id FROM menus WHERE title = ? AND parent_id IS NULL LIMIT 1');
  const aboutParent = getAboutParent.get('關於');
  
  if (aboutParent) {
    const insertMenu = db.prepare('INSERT OR IGNORE INTO menus (title, slug, url, order_index, parent_id, visible) VALUES (?, ?, ?, ?, ?, 1)');
    insertMenu.run('關於我們', 'about-senwei', '/about-senwei.html', 1, aboutParent.id);
  }
  
  console.log('Database update completed successfully!');
  
} catch (err) {
  console.error('Error updating database:', err);
  process.exit(1);
} finally {
  db.close();
}

