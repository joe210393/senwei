import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use environment variable for DB path or default to 'data/com1.db' relative to project root
// If running in container, standard is often /app/data/com1.db
const projectRoot = path.join(__dirname, '../../');
// Allow overriding via env var, default to project_root/data/com1.db
const dbPath = process.env.DB_PATH || path.join(projectRoot, 'data/com1.db');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
try {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
} catch (e) {
  console.error('Failed to create DB directory:', e);
}

let db;
try {
  db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.error(`Failed to open SQLite database at ${dbPath}:`, err);
  process.exit(1);
}

console.log(`Using SQLite database at ${dbPath}`);
try {
  const count = db.prepare('SELECT COUNT(*) as c FROM pages').get().c;
  console.log(`DB Connection Active. Pages count: ${count}`);
} catch (e) {
  console.log('DB Connection Active. Pages table might be missing or empty.');
}

// Helper to convert MySQL style queries to SQLite
function adaptSql(sql) {
  let s = sql;
  // NOW() -> datetime('now')
  s = s.replace(/NOW\(\)/gi, "datetime('now')");
  // INSERT IGNORE -> INSERT OR IGNORE
  s = s.replace(/INSERT\s+IGNORE/gi, "INSERT OR IGNORE");
  
  // Fix for "ON DUPLICATE KEY UPDATE" which is MySQL specific
  // This is hard to regex perfectly, but we can try to catch common patterns or rely on manual fixes in the code.
  // We will let the manual fixes handle the complex ON DUPLICATE KEY cases.
  
  return s;
}

export async function query(sql, params = []) {
  try {
    const adaptedSql = adaptSql(sql);
    const stmt = db.prepare(adaptedSql);
    
    // Detect if it's a SELECT
    const isSelect = /^\s*SELECT/i.test(adaptedSql);
    
    if (isSelect) {
      const rows = stmt.all(params);
      return rows;
    } else {
      const info = stmt.run(params);
      // Emulate MySQL OkPacket
      return {
        affectedRows: info.changes,
        insertId: info.lastInsertRowid,
        warningStatus: 0,
      };
    }
  } catch (err) {
    console.error('SQLite Query Error:', err.message, '\nSQL:', sql);
    throw err;
  }
}

// Mock connection for transactions
// Since SQLite (via better-sqlite3) is synchronous and locks the DB, 
// we can't easily do async transactions across multiple event loop ticks with the same API.
// For this local dev setup, we will treat transactions as a no-op for safety (no locking),
// or we simply execute queries directly.
// Given the low concurrency, omitting strict transaction isolation is acceptable.
export async function getConnection() {
  return {
    execute: async (sql, params) => {
      const res = await query(sql, params);
      return [res]; // MySQL execute returns [rows/result]
    },
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
}

// Default export mostly for compatibility (though unused by most except maybe legacy)
const pool = {
  execute: async (sql, params) => {
    const res = await query(sql, params);
    return [res];
  },
  getConnection
};

export default pool;
