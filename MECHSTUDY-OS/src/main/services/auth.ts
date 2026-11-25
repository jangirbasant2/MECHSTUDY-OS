import crypto from 'node:crypto';
import { get, all, run, tx, getSetting, setSetting } from '../db';
import type {
  AppUser,
  AuthSession,
  LicenseKeyRecord,
  AdminStats,
  UserRole,
  LicenseType,
} from '../../shared/types';

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS: crypto.ScryptOptions = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

const MAX_FAILED_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 30;
const NOTES_PASS_PRICE_INR = 499;

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return {
    salt,
    hash: derivedKey.toString('hex'),
  };
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
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

export function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const cleanId = identifier.trim().toLowerCase();
  const windowSql = `datetime('now', '-${RATE_LIMIT_WINDOW_MINUTES} minutes')`;

  // Count recent failed attempts
  const failedRow = get<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM auth_rate_limits
    WHERE identifier = ? AND success = 0 AND attempt_time >= ${windowSql}
  `, cleanId);

  const failedCount = failedRow?.count ?? 0;
  if (failedCount >= MAX_FAILED_ATTEMPTS) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: RATE_LIMIT_WINDOW_MINUTES * 60,
    };
  }

  return {
    allowed: true,
    remainingAttempts: MAX_FAILED_ATTEMPTS - failedCount,
    retryAfterSeconds: 0,
  };
}

export function recordAuthAttempt(identifier: string, success: boolean): void {
  const cleanId = identifier.trim().toLowerCase();
  run(
    'INSERT INTO auth_rate_limits (identifier, success) VALUES (?, ?)',
    cleanId,
    success ? 1 : 0
  );
}

function rowToAppUser(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role as UserRole,
    licenseType: row.license_type as LicenseType,
    licenseKey: row.license_key ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

export function registerUser(email: string, username: string, password: string): { session: AuthSession } {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanUsername = (username || '').trim();

  // Defensive input validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    throw new Error('A valid email address is required.');
  }
  if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 50) {
    throw new Error('Username must be between 2 and 50 characters.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  // Check uniqueness
  const existing = get<{ id: number }>('SELECT id FROM app_users WHERE email = ?', cleanEmail);
  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const { salt, hash } = hashPassword(password);

  const res = run(`
    INSERT INTO app_users (email, username, password_hash, salt, role, license_type, last_login_at)
    VALUES (?, ?, ?, ?, 'student', 'free', datetime('now'))
  `, cleanEmail, cleanUsername, hash, salt);

  const userRow = get<any>('SELECT * FROM app_users WHERE id = ?', res.lastInsertRowid);
  const user = rowToAppUser(userRow);

  const session = createSession(user.id);
  setActiveSessionToken(session.token);

  return { session: { token: session.token, user, expiresAt: session.expiresAt } };
}

export function loginUser(email: string, password: string): { session: AuthSession } {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error('Email and password are required.');
  }

  const rateCheck = checkRateLimit(cleanEmail);
  if (!rateCheck.allowed) {
    throw new Error(
      `Too many failed login attempts. For security, your account is temporarily locked. Please wait ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`
    );
  }

  const userRow = get<any>('SELECT * FROM app_users WHERE email = ?', cleanEmail);
  if (!userRow || !userRow.is_active) {
    recordAuthAttempt(cleanEmail, false);
    throw new Error('Invalid email or password.');
  }

  const isValid = verifyPassword(password, userRow.salt, userRow.password_hash);
  if (!isValid) {
    recordAuthAttempt(cleanEmail, false);
    throw new Error('Invalid email or password.');
  }

  recordAuthAttempt(cleanEmail, true);
  run("UPDATE app_users SET last_login_at = datetime('now') WHERE id = ?", userRow.id);

  const user = rowToAppUser(userRow);
  const session = createSession(user.id);
  setActiveSessionToken(session.token);

  return { session: { token: session.token, user, expiresAt: session.expiresAt } };
}

export function createSession(userId: number): { token: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  run(`
    INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `, rawToken, userId, tokenHash, expiresAt);

  return { token: rawToken, expiresAt };
}

export function getSessionByToken(token: string): AuthSession | null {
  if (!token || typeof token !== 'string') return null;

  const row = get<any>(`
    SELECT s.id as token, s.expires_at, u.*
    FROM user_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
  `, token);

  if (!row) return null;

  return {
    token: row.token,
    expiresAt: row.expires_at,
    user: rowToAppUser(row),
  };
}

export function getCurrentSession(): AuthSession | null {
  const activeToken = getSetting('auth.activeSessionToken', '');
  if (!activeToken) return null;
  return getSessionByToken(activeToken);
}

export function setActiveSessionToken(token: string): void {
  setSetting('auth.activeSessionToken', token);
}

export function logout(): boolean {
  const activeToken = getSetting('auth.activeSessionToken', '');
  if (activeToken) {
    try {
      run('DELETE FROM user_sessions WHERE id = ?', activeToken);
    } catch {}
  }
  setSetting('auth.activeSessionToken', '');
  return true;
}

export function requireAdmin(token?: string): AppUser {
  const effectiveToken = token || getSetting('auth.activeSessionToken', '');
  const session = getSessionByToken(effectiveToken);
  if (!session || session.user.role !== 'admin') {
    throw new Error('Access Denied: Administrator privileges required.');
  }
  return session.user;
}

export function redeemLicenseKey(userId: number, keyCode: string): { success: boolean; user: AppUser; message: string } {
  const cleanCode = (keyCode || '').trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('Please enter a valid license activation key.');
  }

  const keyRow = get<any>('SELECT * FROM license_keys WHERE key_code = ?', cleanCode);
  if (!keyRow) {
    throw new Error('Invalid license key. Please check the code and try again.');
  }
  if (keyRow.is_redeemed) {
    throw new Error('This license key has already been redeemed.');
  }

  tx(() => {
    run(`
      UPDATE license_keys
      SET is_redeemed = 1, redeemed_by_user_id = ?, redeemed_at = datetime('now')
      WHERE id = ?
    `, userId, keyRow.id);

    run(`
      UPDATE app_users
      SET license_type = 'lifetime_notes', license_key = ?
      WHERE id = ?
    `, cleanCode, userId);
  });

  const updatedUserRow = get<any>('SELECT * FROM app_users WHERE id = ?', userId);
  const updatedUser = rowToAppUser(updatedUserRow);

  return {
    success: true,
    user: updatedUser,
    message: 'Congratulations! Your Lifetime Notes Pass has been successfully activated. All handwritten notes are now unlocked!',
  };
}

/* ---------------- Admin Dashboard Capabilities ---------------- */

export function getAdminStats(): AdminStats {
  requireAdmin();

  const totalUsersRow = get<{ c: number }>('SELECT COUNT(*) as c FROM app_users');
  const activeUsersRow = get<{ c: number }>(`
    SELECT COUNT(*) as c FROM app_users
    WHERE last_login_at >= datetime('now', '-30 days')
  `);
  const lifetimeRow = get<{ c: number }>(`
    SELECT COUNT(*) as c FROM app_users
    WHERE license_type = 'lifetime_notes'
  `);
  const freeUsersRow = get<{ c: number }>(`
    SELECT COUNT(*) as c FROM app_users
    WHERE license_type = 'free'
  `);
  const redeemedKeysRow = get<{ c: number }>('SELECT COUNT(*) as c FROM license_keys WHERE is_redeemed = 1');
  const availableKeysRow = get<{ c: number }>('SELECT COUNT(*) as c FROM license_keys WHERE is_redeemed = 0');

  const totalUsers = totalUsersRow?.c ?? 0;
  const activeUsers = activeUsersRow?.c ?? 0;
  const lifetimeSubscribers = lifetimeRow?.c ?? 0;
  const freeUsers = freeUsersRow?.c ?? 0;
  const conversionRate = totalUsers > 0 ? Math.round((lifetimeSubscribers / totalUsers) * 1000) / 10 : 0;
  const totalRevenueInr = lifetimeSubscribers * NOTES_PASS_PRICE_INR;

  return {
    totalUsers,
    activeUsers,
    lifetimeSubscribers,
    freeUsers,
    conversionRate,
    totalRevenueInr,
    redeemedKeysCount: redeemedKeysRow?.c ?? 0,
    availableKeysCount: availableKeysRow?.c ?? 0,
  };
}

export function listUsersForAdmin(filter?: { query?: string; role?: string; licenseType?: string }): AppUser[] {
  requireAdmin();

  const where: string[] = [];
  const params: any[] = [];

  if (filter?.query && filter.query.trim()) {
    where.push('(email LIKE ? OR username LIKE ?)');
    params.push(`%${filter.query.trim()}%`, `%${filter.query.trim()}%`);
  }
  if (filter?.role) {
    where.push('role = ?');
    params.push(filter.role);
  }
  if (filter?.licenseType) {
    where.push('license_type = ?');
    params.push(filter.licenseType);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = all<any>(`
    SELECT * FROM app_users
    ${whereClause}
    ORDER BY created_at DESC
  `, ...params);

  return rows.map(rowToAppUser);
}

export function updateUserRole(userId: number, role: UserRole): AppUser {
  requireAdmin();
  if (role !== 'student' && role !== 'admin') {
    throw new Error('Invalid user role.');
  }

  run('UPDATE app_users SET role = ? WHERE id = ?', role, userId);
  const row = get<any>('SELECT * FROM app_users WHERE id = ?', userId);
  if (!row) throw new Error('User not found.');
  return rowToAppUser(row);
}

export function updateUserLicense(userId: number, licenseType: LicenseType): AppUser {
  requireAdmin();
  if (licenseType !== 'free' && licenseType !== 'lifetime_notes') {
    throw new Error('Invalid license type.');
  }

  const keyToAssign = licenseType === 'lifetime_notes' ? `MECH-ADMIN-GRANT-${Date.now()}` : null;
  run('UPDATE app_users SET license_type = ?, license_key = ? WHERE id = ?', licenseType, keyToAssign, userId);

  const row = get<any>('SELECT * FROM app_users WHERE id = ?', userId);
  if (!row) throw new Error('User not found.');
  return rowToAppUser(row);
}

export function generateLicenseKeys(count: number = 5, note?: string): LicenseKeyRecord[] {
  requireAdmin();

  const safeCount = Math.min(Math.max(1, count), 50);
  const createdKeys: LicenseKeyRecord[] = [];

  tx(() => {
    for (let i = 0; i < safeCount; i++) {
      const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part3 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `MECH-${part1}-${part2}-${part3}`;

      const res = run(`
        INSERT INTO license_keys (key_code, license_type, is_redeemed, note)
        VALUES (?, 'lifetime_notes', 0, ?)
      `, code, note || 'Generated by Administrator');

      createdKeys.push({
        id: res.lastInsertRowid,
        keyCode: code,
        licenseType: 'lifetime_notes',
        isRedeemed: false,
        createdAt: new Date().toISOString(),
        note: note || 'Generated by Administrator',
      });
    }
  });

  return createdKeys;
}

export function listLicenseKeys(): LicenseKeyRecord[] {
  requireAdmin();

  const rows = all<any>(`
    SELECT k.*, u.email as redeemed_by_email
    FROM license_keys k
    LEFT JOIN app_users u ON u.id = k.redeemed_by_user_id
    ORDER BY k.created_at DESC
  `);

  return rows.map(r => ({
    id: r.id,
    keyCode: r.key_code,
    licenseType: r.license_type as LicenseType,
    isRedeemed: Boolean(r.is_redeemed),
    redeemedByUserId: r.redeemed_by_user_id ?? null,
    redeemedByEmail: r.redeemed_by_email ?? null,
    redeemedAt: r.redeemed_at ?? null,
    createdAt: r.created_at,
    note: r.note ?? null,
  }));
}

export function revokeUserLicense(userId: number): AppUser {
  return updateUserLicense(userId, 'free');
}
