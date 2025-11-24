
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/com1.db');

try {
    const db = new Database(dbPath);
    console.log(`Resetting admin password for DB at ${dbPath}...`);
    
    // Hash the password "admin"
    const hash = bcrypt.hashSync('admin', 10);
    
    // Update the user
    const info = db.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(hash);
    
    if (info.changes > 0) {
        console.log('Admin password reset to "admin" successfully.');
    } else {
        console.log('Admin user not found, creating it...');
        db.prepare('INSERT INTO users(username, password_hash, role, must_change_password) VALUES (?,?,?,?)')
          .run('admin', hash, 'admin', 1);
        console.log('Admin user created with password "admin".');
    }
    
    db.close();
} catch (e) {
    console.error('Failed to reset password:', e);
}

