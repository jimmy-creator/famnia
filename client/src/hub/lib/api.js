import api from '@/api/axios';

/** Query keys all start with "femnia" so a mutation can invalidate the lot. */
export const qk = {
  all: ['femnia'],
  access: ['femnia', 'access'],
  permissionCatalogue: ['femnia', 'permission-catalogue'],
};

/** Who is signed in to the hub and what they may do (GET /api/hub/access). */
export const accessQuery = {
  queryKey: qk.access,
  queryFn: async () => (await api.get('/hub/access')).data,
  staleTime: 5 * 60_000,
  retry: false,
};

export const permissionCatalogueQuery = {
  queryKey: qk.permissionCatalogue,
  queryFn: async () => (await api.get('/hub/permission-catalogue')).data,
  staleTime: Infinity,
};

/** Human message from an axios error (server `message`), or the fallback. */
export function errorMessage(err, fallback = 'Something went wrong') {
  return err?.response?.data?.message || err?.message || fallback;
}

export async function hubSignUp({ name, email, password }) {
  return (await api.post('/hub/signup', { name, email, password })).data;
}

export async function sendPasswordReset(email) {
  return (await api.post('/auth/forgot-password', { email })).data;
}

export async function resetPasswordWithToken({ email, token, password }) {
  return (await api.post('/auth/reset-password', { email, token, password })).data;
}

export async function changePassword(currentPassword, newPassword) {
  return (await api.post('/auth/change-password', { currentPassword, newPassword })).data;
}

export async function completeForcedPasswordChange(password) {
  return (await api.post('/auth/forced-password', { password })).data;
}
