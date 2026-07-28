import { User } from './models/index.js';

/**
 * Ensure an admin account exists — WITHOUT dropping tables or loading sample
 * data (unlike `npm run seed`, which uses sync({force:true})).
 *
 * - If no user with this email exists → create one as admin.
 * - If a user exists → promote to admin and reset the password.
 *
 * The User model's beforeCreate/beforeUpdate hooks bcrypt-hash the password,
 * so we pass plaintext here. Idempotent — safe to run on every boot.
 */
export async function ensureAdmin({ email, password, name = 'Admin' }) {
  const normalized = String(email).trim().toLowerCase();
  const existing = await User.findOne({ where: { email: normalized } });
  if (existing) {
    existing.role = 'admin';
    if (!existing.name) existing.name = name;
    if (password) existing.password = password; // beforeUpdate hook re-hashes
    await existing.save();
    return { created: false, email: normalized };
  }
  await User.create({ name, email: normalized, password, role: 'admin' });
  return { created: true, email: normalized };
}

/**
 * Boot-time hook for hosts with no shell/npm (Hostinger). Set
 * BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD (+ optional
 * BOOTSTRAP_ADMIN_NAME) in the app's env, restart, log in, then DELETE those
 * env vars and restart again. Never throws — a failure here must not stop the
 * server from serving.
 */
export async function bootstrapAdminFromEnv() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Admin';
  if (!email || !password) return;
  try {
    const r = await ensureAdmin({ email, password, name });
    console.log(
      `[bootstrapAdmin] ${r.created ? 'created' : 'promoted/reset'} admin "${r.email}". ` +
      `Now DELETE the BOOTSTRAP_ADMIN_* env vars and restart.`,
    );
  } catch (err) {
    console.error('[bootstrapAdmin] failed:', err.message);
  }
}
