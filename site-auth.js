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

authForm.onsubmit = event => {
  event.preventDefault();
  const values = new FormData(authForm);
  if (String(values.get('username')).trim().toLowerCase() !== 'aces' || values.get('password') !== 'Aces7!') {
    authForm.querySelector('[role=status]').textContent = 'Неверный логин или пароль.';
    return;
  }
  sessionStorage.setItem(acesAuthKey, 'true');
  sessionStorage.setItem('aces-admin-password', values.get('password'));
  try {
    localStorage.setItem(adminLoginKey, String(values.get('username')).trim());
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
