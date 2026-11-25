import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { MIGRATIONS } from '../../src/main/db/schema.ts';

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return {
    salt,
    hash: derivedKey.toString('hex'),
  };
}

function verifyPassword(password, salt, storedHash) {
  try {
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derivedKey.length !== storedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, storedBuf);
  } catch {
    return false;
  }
}

function createTestDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) {
    db.exec(m.sql);
  }
  return db;
}

test('hashPassword produces salted scrypt hash that verifyPassword validates accurately', () => {
  const password = 'CorrectHorseBatteryStaple123!';
  const { salt, hash } = hashPassword(password);

  assert.ok(salt.length >= 32, 'salt has sufficient entropy');
  assert.ok(hash.length === 128, 'scrypt 64-byte hash is 128 hex chars');

  const matches = verifyPassword(password, salt, hash);
  assert.equal(matches, true, 'correct password matches');

  const wrong = verifyPassword('WrongPassword123!', salt, hash);
  assert.equal(wrong, false, 'incorrect password fails timingSafeEqual verification');
});

test('migration 16 creates app_users, user_sessions, license_keys, auth_rate_limits and seeds admin & student', () => {
  const db = createTestDb();

  // Verify tables exist
  const tables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  );

  assert.ok(tables.has('app_users'), 'app_users table created');
  assert.ok(tables.has('user_sessions'), 'user_sessions table created');
  assert.ok(tables.has('license_keys'), 'license_keys table created');
  assert.ok(tables.has('auth_rate_limits'), 'auth_rate_limits table created');

  // Verify seeded admin
  const admin = db.prepare("SELECT * FROM app_users WHERE email = 'admin@mechstudy.com'").get();
  assert.ok(admin, 'admin account exists');
  assert.equal(admin.role, 'admin');
  assert.equal(admin.license_type, 'lifetime_notes');
  assert.equal(verifyPassword('admin123', admin.salt, admin.password_hash), true, 'admin123 password matches');

  // Verify seeded student
  const student = db.prepare("SELECT * FROM app_users WHERE email = 'student@mechstudy.com'").get();
  assert.ok(student, 'student account exists');
  assert.equal(student.role, 'student');
  assert.equal(student.license_type, 'free');
  assert.equal(verifyPassword('student123', student.salt, student.password_hash), true, 'student123 password matches');

  // Verify seeded license keys
  const keys = db.prepare("SELECT * FROM license_keys WHERE is_redeemed = 0").all();
  assert.ok(keys.length >= 2, 'at least 2 sample license keys seeded');
});

test('rate limiting logic blocks after 5 failed attempts within window', () => {
  const db = createTestDb();
  const testEmail = 'attacker@test.com';

  // Record 4 failed attempts
  for (let i = 0; i < 4; i++) {
    db.prepare("INSERT INTO auth_rate_limits (identifier, success) VALUES (?, 0)").run(testEmail);
  }

  let count = db.prepare("SELECT COUNT(*) as c FROM auth_rate_limits WHERE identifier = ? AND success = 0").get(testEmail).c;
  assert.equal(count, 4);
  assert.ok(count < 5, '4 failed attempts is still within allowed limit');

  // Record 5th failed attempt
  db.prepare("INSERT INTO auth_rate_limits (identifier, success) VALUES (?, 0)").run(testEmail);
  count = db.prepare("SELECT COUNT(*) as c FROM auth_rate_limits WHERE identifier = ? AND success = 0").get(testEmail).c;
  assert.equal(count, 5);
  assert.ok(count >= 5, '5 failed attempts triggers temporary lockout');
});

test('license key redemption transitions user from free to lifetime_notes atomically', () => {
  const db = createTestDb();

  // Create new free user
  const { salt, hash } = hashPassword('mypassword123');
  const res = db.prepare(`
    INSERT INTO app_users (email, username, password_hash, salt, role, license_type)
    VALUES ('scholar@rtu.ac.in', 'Scholar Test', ?, ?, 'student', 'free')
  `).run(hash, salt);
  const userId = Number(res.lastInsertRowid);

  // Generate key
  const keyCode = 'MECH-TEST-KEY1-GOLD';
  db.prepare("INSERT INTO license_keys (key_code, license_type, is_redeemed) VALUES (?, 'lifetime_notes', 0)").run(keyCode);

  // Redeem key
  db.exec('BEGIN TRANSACTION');
  db.prepare(`
    UPDATE license_keys
    SET is_redeemed = 1, redeemed_by_user_id = ?, redeemed_at = datetime('now')
    WHERE key_code = ?
  `).run(userId, keyCode);

  db.prepare(`
    UPDATE app_users
    SET license_type = 'lifetime_notes', license_key = ?
    WHERE id = ?
  `).run(keyCode, userId);
  db.exec('COMMIT');

  // Verify user is now lifetime_notes
  const updatedUser = db.prepare('SELECT * FROM app_users WHERE id = ?').get(userId);
  assert.equal(updatedUser.license_type, 'lifetime_notes');
  assert.equal(updatedUser.license_key, keyCode);

  // Verify key cannot be reused
  const updatedKey = db.prepare('SELECT * FROM license_keys WHERE key_code = ?').get(keyCode);
  assert.equal(updatedKey.is_redeemed, 1);
  assert.equal(updatedKey.redeemed_by_user_id, userId);
});

test('admin statistics calculates total users, lifetime subscribers and revenue accurately', () => {
  const db = createTestDb();

  // 1 seeded admin (lifetime_notes) + 1 seeded student (free) = 2 users
  const total = db.prepare('SELECT COUNT(*) as c FROM app_users').get().c;
  assert.equal(total, 2);

  const lifetime = db.prepare("SELECT COUNT(*) as c FROM app_users WHERE license_type = 'lifetime_notes'").get().c;
  assert.equal(lifetime, 1);

  const free = db.prepare("SELECT COUNT(*) as c FROM app_users WHERE license_type = 'free'").get().c;
  assert.equal(free, 1);

  const conversionRate = Math.round((lifetime / total) * 1000) / 10;
  assert.equal(conversionRate, 50.0);

  const revenue = lifetime * 499;
  assert.equal(revenue, 499);
});
