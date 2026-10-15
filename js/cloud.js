// Online accounts: talks to the Monsoon sync API (a Neon Function in front of Neon Auth + Postgres).
// The session token is kept in localStorage and sent as a bearer token; the API turns it into a
// Neon Auth session, so sign-in works the same in every browser (no third-party cookies).

export const API = 'https://br-long-resonance-b4d1o7do-sync.compute.c-6.us-east-2.aws.neon.tech';

const KEY = 'monsoon.cloud';

export function session() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.token && s.user ? s : null;
  } catch {
    return null;
  }
}
function setSession(s) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function call(method, path, body, { auth = true, keepalive = false } = {}) {
  const s = session();
  const headers = { 'Content-Type': 'application/json' };
  if (auth && s) headers.Authorization = `Bearer ${s.token}`;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, keepalive });
  } catch {
    throw new ApiError('Could not reach the server — check your connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) setSession(null);
    throw new ApiError(friendly(data.error, data.code, res.status), res.status, data);
  }
  return data;
}

function friendly(msg, code, status) {
  if (code === 'USER_ALREADY_EXISTS' || /already exists/i.test(msg || '')) return 'An account with that email already exists. Try signing in instead.';
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || /invalid email or password/i.test(msg || '')) return 'Incorrect email or password.';
  if (code === 'INVALID_EMAIL' || /invalid email/i.test(msg || '')) return 'That email address doesn’t look right.';
  if (code === 'INVALID_OTP' || /otp/i.test(msg || '')) return 'That code is wrong or has expired.';
  if (status === 429) return 'Too many attempts — wait a few seconds and try again.';
  return msg || 'Something went wrong. Please try again.';
}

export async function signUp(email, password, name) {
  const r = await call('POST', '/auth/sign-up', { email, password, name }, { auth: false });
  setSession({ token: r.session, user: r.user });
  return r.user;
}
export async function signIn(email, password) {
  const r = await call('POST', '/auth/sign-in', { email, password }, { auth: false });
  setSession({ token: r.session, user: r.user });
  return r.user;
}
export async function signOut() {
  try {
    await call('POST', '/auth/sign-out', {});
  } catch {}
  setSession(null);
}
// Confirms the stored session is still valid (and refreshes the user's name/email).
export async function refresh() {
  const r = await call('GET', '/auth/session');
  const s = session();
  if (s) setSession({ ...s, user: r.user });
  return r.user;
}
export async function updateName(name) {
  const r = await call('POST', '/auth/update-name', { name });
  const s = session();
  if (s) setSession({ ...s, user: r.user });
  return r.user;
}
export const changePassword = (currentPassword, newPassword) => call('POST', '/auth/change-password', { currentPassword, newPassword });
export const forgotPassword = (email) => call('POST', '/auth/forgot', { email }, { auth: false });
export const resetPassword = (email, otp, password) => call('POST', '/auth/reset', { email, otp, password }, { auth: false });
export async function deleteAccount(password) {
  await call('POST', '/auth/delete', { password });
  setSession(null);
}
export const forget = () => setSession(null);

// { data, version }: version 0 means nothing saved yet.
export const pull = () => call('GET', '/progress');
// Saves only if the server is still at `version`; otherwise throws ApiError 409 whose body
// carries the newer { data, version } to merge.
export const push = (data, version, opts) => call('PUT', '/progress', { data, version }, opts);
