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
  // Remove existing DB if we want a fresh start (User asked for NEW db)
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('Removed existing site.db');
  }

  const db = new Database(dbPath);
  const schema = fs.readFileSync(schemaPath, 'utf8');

  db.exec(schema);
  console.log('Database initialized successfully.');
  
  // Create default admin user if not exists
  const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
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
  }
  
  db.close();
} catch (err) {
  console.error('Error initializing database:', err);
  process.exit(1);
}

