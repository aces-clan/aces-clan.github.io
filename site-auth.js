const acesAuthKey = 'aces-loot-visible';

function isLootVisible() {
  return sessionStorage.getItem(acesAuthKey) === 'true';
}

const authButton = document.createElement('button');
authButton.type = 'button';
authButton.className = 'site-auth-button';
const signInIcon = '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>';
const signOutIcon = '<path d="M10 4H5v16h5m4-13 5 5-5 5m-5-5h10"/>';
document.querySelector('.compact-header').append(authButton);

const authDialog = document.createElement('dialog');
authDialog.className = 'site-auth-dialog panel';
authDialog.setAttribute('aria-labelledby', 'site-auth-title');
authDialog.innerHTML = `
  <form class="site-auth-form">
    <h2 id="site-auth-title">Вход</h2>
    <label>Логин <input name="username" autocomplete="username" required></label>
    <label>Пароль <input name="password" type="password" autocomplete="current-password" required></label>
    <p role="status"></p>
    <div class="site-auth-actions">
      <button type="button" data-close>Отмена</button>
      <button type="submit">Войти</button>
    </div>
  </form>`;
document.body.append(authDialog);
const authForm = authDialog.querySelector('form');
const adminLoginKey = 'aces-admin-login';
const adminLogin = authForm.elements.username;

function updateAcesAuth() {
  const session = isLootVisible();
  document.querySelector('[data-loot-nav]').hidden = !session;
  const requestsNav = document.querySelector('[data-requests-nav]');
  if (requestsNav) requestsNav.hidden = !session;
  const panel = document.querySelector('.loot-panel');
  if (panel) panel.hidden = !session;
  const gate = document.getElementById('loot-auth-required');
  if (gate) gate.hidden = Boolean(session);
  authButton.setAttribute('aria-label', session ? 'Выйти' : 'Войти');
  authButton.title = session ? 'Выйти' : 'Войти';
  authButton.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    (session ? signOutIcon : signInIcon) + '</svg>';
  return session;
}

function openAcesAuth() {
  authForm.querySelector('[role=status]').textContent = '';
  try {
    adminLogin.value = localStorage.getItem(adminLoginKey) ?? '';
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  authDialog.showModal();
}

authButton.onclick = () => {
  if (isLootVisible()) {
    sessionStorage.removeItem(acesAuthKey);
    sessionStorage.removeItem('aces-admin-password');
    location.reload();
  } else {
    openAcesAuth();
  }
};
document.getElementById('loot-auth-open')?.addEventListener('click', openAcesAuth);
authForm.querySelector('[data-close]').onclick = () => authDialog.close();
authDialog.onclose = () => authForm.reset();

authForm.onsubmit = async event => {
  event.preventDefault();
  const submit = authForm.querySelector('[type=submit]');
  if (submit.disabled) return;
  const values = new FormData(authForm);
  const status = authForm.querySelector('[role=status]');
  const username = String(values.get('username')).trim();
  if (username.toLowerCase() !== 'aces') {
    status.textContent = 'Неверный логин или пароль.';
    return;
  }
  submit.disabled = true;
  status.textContent = 'Входим…';
  try {
    const response = await fetch(siteProject + '/rest/v1/rpc/aces_check_admin', {
      method: 'POST',
      headers: {apikey: lootProjectKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({p_password: values.get('password')}),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Login request failed');
    if (!await response.json()) {
      status.textContent = 'Неверный логин или пароль.';
      return;
    }
  } catch {
    status.textContent = 'Не удалось войти. Попробуйте ещё раз.';
    return;
  } finally {
    submit.disabled = false;
  }
  if (!authDialog.open) return;
  sessionStorage.setItem(acesAuthKey, 'true');
  sessionStorage.setItem('aces-admin-password', values.get('password'));
  try {
    localStorage.setItem(adminLoginKey, username);
  } catch {
    // Sign-in works without remembering the login.
  }
  if (window.PasswordCredential && navigator.credentials) {
    navigator.credentials.store(new PasswordCredential(authForm)).catch(() => {});
  }
  authDialog.close();
  updateAcesAuth();
  document.dispatchEvent(new Event('aces-auth-change'));
};

updateAcesAuth();
