async function acesAdminRequest(endpoint, payload = {}) {
  const response = await fetch(siteProject + '/rest/v1/rpc/' + endpoint, {
    method: 'POST',
    headers: {apikey: lootProjectKey, 'Content-Type': 'application/json'},
    body: JSON.stringify({...payload, p_password: sessionStorage.getItem('aces-admin-password')}),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    let code;
    try { code = (await response.json()).code; } catch {}
    const error = new Error('Не удалось сохранить изменения. Попробуйте ещё раз.');
    error.code = code;
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function createAcesAdminDialog(id, title, content, className = '') {
  const dialog = document.createElement('dialog');
  dialog.className = 'site-auth-dialog panel admin-dialog ' + className;
  dialog.setAttribute('aria-labelledby', id);
  dialog.innerHTML = `<header class="site-dialog-header"><h2 id="${id}">${title}</h2>
    <button type="button" class="site-button site-dialog-close" aria-label="Закрыть">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button></header><form><fieldset class="admin-fields">${content}</fieldset>
    <p role="status" aria-live="polite"></p><div class="admin-dialog-actions"><button type="button" class="site-button" data-cancel>Отмена</button><button type="submit" class="site-button site-button-primary admin-save">Сохранить</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const fields = form.querySelector('fieldset');
  const save = form.querySelector('[type="submit"]');
  const status = form.querySelector('[role="status"]');
  const close = dialog.querySelector('.site-dialog-close');
  const cancel = form.querySelector('[data-cancel]');
  let busy = false;
  cancel.onclick = () => { if (!busy) dialog.close(); };
  close.onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  document.addEventListener('aces-auth-change', () => { if (!isLootVisible() && !busy) dialog.close(); });
  return {dialog, form, status, save, setBusy(value) {
    busy = value;
    fields.disabled = save.disabled = close.disabled = cancel.disabled = value;
  }};
}
