const memberToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Kaliningrad'}).format(new Date());
const memberEditor = createAcesAdminDialog('member-editor-title', 'Добавить игрока', `
  <label for="member-name">Имя игрока</label><input id="member-name" name="nickname" maxlength="64" required autocomplete="off">
  <label for="member-joined">Дата вступления</label><input id="member-joined" name="joined" type="date" required>
  <label for="member-power">Боевая мощь</label><input id="member-power" name="power" type="number" min="1" max="2147483647" step="1" inputmode="numeric" required>`);
let memberIntakeKey;
function openMemberEditor() {
  if (!isLootVisible()) return;
  memberEditor.form.reset();
  memberIntakeKey = crypto.randomUUID();
  memberEditor.form.elements.joined.value = memberToday();
  memberEditor.form.elements.joined.max = memberToday();
  memberEditor.status.textContent = '';
  memberEditor.dialog.showModal();
  memberEditor.form.elements.nickname.focus();
}
memberEditor.form.onsubmit = async event => {
  event.preventDefault();
  if (memberEditor.save.disabled || !isLootVisible() || !memberEditor.form.reportValidity()) return;
  const nickname = memberEditor.form.elements.nickname.value.trim();
  if (!nickname) { memberEditor.status.textContent = 'Укажите имя игрока.'; return; }
  memberEditor.setBusy(true);
  memberEditor.status.textContent = 'Сохраняем игрока…';
  try {
    await acesAdminRequest('aces_add_member', {p_name: nickname,
      p_joined_on: memberEditor.form.elements.joined.value,
      p_battle_power: Number(memberEditor.form.elements.power.value), p_intake_key: memberIntakeKey});
    memberEditor.dialog.close();
    document.dispatchEvent(new Event('aces-member-saved'));
  } catch (error) {
    memberEditor.status.textContent = error.code === '23505'
      ? 'Игрок с таким именем уже есть. Выбывшего игрока можно вернуть в таблице.'
      : error.code === '42501' ? 'Войдите как администратор.' : error.message;
  } finally { memberEditor.setBusy(false); }
};
const memberConfirm = createAcesAdminDialog('member-confirm-title', 'Изменить состав', '<p id="member-confirm-message"></p>');
let memberToChange;
memberConfirm.form.onsubmit = async event => {
  event.preventDefault();
  if (!memberToChange || memberConfirm.save.disabled || !isLootVisible()) return;
  const player = memberToChange;
  memberConfirm.setBusy(true);
  memberConfirm.status.textContent = 'Сохраняем состав…';
  try {
    await acesAdminRequest('aces_set_member_active', {p_member_id: player.id, p_active: player.departed});
    memberConfirm.dialog.close();
    $('page-status').textContent = player.departed ? 'Игрок возвращён в клан.' : 'Игрок исключён из клана.';
    document.dispatchEvent(new Event('aces-member-saved'));
  } catch (error) {
    memberConfirm.status.textContent = error.code === '42501' ? 'Войдите как администратор.' : error.message;
  } finally { memberConfirm.setBusy(false); }
};
function memberIcon(paths) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
function decorateMemberActions(cell, player) {
  if (!isLootVisible()) return;
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'site-button site-icon-button event-member-action';
  const label = player.departed ? 'Вернуть' : 'Исключить';
  action.title = `${label} игрока ${player.name}`;
  action.setAttribute('aria-label', action.title);
  action.innerHTML = memberIcon(player.departed
    ? '<path d="M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5"/>'
    : '<path d="m7 7 10 10M17 7 7 17"/>');
  action.onclick = event => {
    event.stopPropagation();
    if (!isLootVisible()) return;
    closePlayerCard();
    memberToChange = player;
    memberConfirm.dialog.querySelector('h2').textContent = `${label} игрока?`;
    memberConfirm.dialog.querySelector('#member-confirm-message').textContent = player.departed
      ? `Вернуть ${player.name} в активный состав клана? Его история, вещи и лут сохранятся.`
      : `Исключить ${player.name} из активного состава клана? Его история, вещи и лут сохранятся.`;
    memberConfirm.save.textContent = label;
    memberConfirm.status.textContent = '';
    memberConfirm.dialog.showModal();
  };
  cell.append(action);
}

$('events-add-member')?.addEventListener('click', openMemberEditor);
