import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/site.db');

console.log(`Cleaning data from ${dbPath}...`);

try {
  const db = new Database(dbPath);

  // List of tables to clear (content tables)
  const tables = [
    'pages',
    'posts',
    'news',
    'leaderboard',
    'plans',
    'trial_contents',
    'contacts',
    'media',
    'members',
    'slides',
    'course_contents',
    'course_materials',
    'menus'
  ];

  const deleteStmt = db.prepare("DELETE FROM sqlite_sequence WHERE name = ?");

  db.transaction(() => {
    for (const table of tables) {
      try {
        db.prepare(`DELETE FROM ${table}`).run();
        // Reset auto-increment
        deleteStmt.run(table);
        console.log(`Cleared table: ${table}`);
      } catch (e) {
        // Table might not exist if schema changed, ignore
        console.log(`Skipped table: ${table} (or error: ${e.message})`);
      }
    }
    
    // Reset settings to defaults (optional, but "clean" implies reset)
    // Or just leave them? User said "empty database".
    // Let's leave settings and users alone so the site is still runnable.
  })();

  console.log('Data cleanup completed. Admin user and Settings are preserved.');
  db.close();
} catch (err) {
  console.error('Error cleaning database:', err);
  process.exit(1);
}

