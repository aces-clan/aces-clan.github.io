const eventEditor = createAcesAdminDialog('event-editor-title', 'Добавить мероприятие', `
  <label for="event-type">Тип мероприятия</label><select id="event-type" class="gear-picker" required>
    <option value="">Выберите тип</option><option>Клан босс</option><option>Война за захват</option><option>Защита</option></select>
  <label for="event-date">Дата</label><input id="event-date" type="date" required>
  <p class="gear-hint">Всем, кто состоял в клане на эту дату, автоматически ставится «+». Статистика обновится после сохранения.</p>`);
$('events-add-event').onclick = () => {
  if (!isLootVisible()) return;
  eventEditor.form.reset();
  $('event-date').value = memberToday();
  eventEditor.status.textContent = '';
  eventEditor.dialog.showModal();
};
eventEditor.form.onsubmit = async event => {
  event.preventDefault();
  if (eventEditor.save.disabled || !isLootVisible() || !eventEditor.form.reportValidity()) return;
  eventEditor.setBusy(true);
  eventEditor.status.textContent = 'Сохраняем мероприятие…';
  try {
    await acesAdminRequest('aces_create_event', {p_event_type: $('event-type').value, p_event_date: $('event-date').value});
    eventEditor.dialog.close();
    await refreshEventsData('Мероприятие сохранено.');
  } catch (error) {
    eventEditor.status.textContent = error.code === '42501' ? 'Войдите как администратор.' : error.message;
  } finally { eventEditor.setBusy(false); }
};
function decorateEventAttendance(cell, player, event, wasMember, attended) {
  if (cell.classList.contains('loot-cell')) return;
  if (!isLootVisible() || !wasMember || event.date > memberToday()) return;
  const mark = event.marks?.find(mark => mark.member_id === player.id);
  const current = event.confirmed === false && !mark ? null : mark ? mark.present : attended;
  const actions = document.createElement('span');
  actions.className = 'attendance-actions';
  actions.dataset.eventId = event.id;
  actions.dataset.memberId = player.id;
  const choices = current === null ? [true, false] : [!current];
  for (const value of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-button attendance-edit ' + ((current === null ? value : current) ? 'event-present' : 'event-absent');
    button.textContent = (current === null ? value : current) ? '+' : '−';
    button.title = (value ? 'Отметить присутствие' : 'Отметить отсутствие') + ' · ' + player.name;
    button.setAttribute('aria-label', `${button.title} · ${event.name}, ${formatSiteDate(event.date)}`);
    button.onclick = async () => {
      if (button.disabled || !isLootVisible()) return;
      actions.querySelectorAll('button').forEach(control => { control.disabled = true; });
      $('page-status').textContent = 'Сохраняем посещаемость…';
      try {
        await acesAdminRequest('aces_set_event_attendance', {p_event_id: event.id, p_member_id: player.id,
          p_present: value, p_expected_revision: event.revision ?? 0});
        await refreshEventsData('Посещаемость сохранена.');
      } catch (error) {
        if (error.code === 'PT409') {
          await refreshEventsData('Посещаемость уже изменилась. Таблица обновлена, проверьте отметки.');
        } else {
          actions.querySelectorAll('button').forEach(control => { control.disabled = false; });
          $('page-status').textContent = error.code === '22023' ? 'Игрок не состоял в клане на дату мероприятия.' : error.message;
        }
      }
    };
    actions.append(button);
  }
  cell.replaceChildren(actions);
}

const eventDeleteDialog = createAcesAdminDialog('event-delete-title', 'Удалить мероприятие?', '<p id="event-delete-message"></p>');
let eventToDelete;
function decorateEventHeading(cell, event) {
  if (!isLootVisible()) return;
  cell.classList.add('event-editable-heading');
  cell.tabIndex = 0;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'site-button site-icon-button event-delete';
  remove.setAttribute('aria-label', `Удалить мероприятие ${event.name}, ${formatSiteDate(event.date)}`);
  remove.title = 'Удалить мероприятие';
  remove.innerHTML = memberIcon('<path d="m6 6 12 12M18 6 6 18"/>');
  remove.onclick = () => {
    if (!isLootVisible()) return;
    eventToDelete = event;
    eventDeleteDialog.dialog.querySelector('#event-delete-message').textContent = `${event.name}, ${formatSiteDate(event.date)} исчезнет из таблицы и расчётов посещаемости. Нераспределённый лут будет скрыт; выданные вещи сохранятся.`;
    eventDeleteDialog.save.textContent = 'Удалить';
    eventDeleteDialog.status.textContent = '';
    eventDeleteDialog.dialog.showModal();
  };
  cell.append(remove);
}
eventDeleteDialog.form.onsubmit = async event => {
  event.preventDefault();
  if (!eventToDelete || eventDeleteDialog.save.disabled || !isLootVisible()) return;
  eventDeleteDialog.setBusy(true);
  eventDeleteDialog.status.textContent = 'Удаляем мероприятие…';
  try {
    await acesAdminRequest('aces_delete_event', {p_event_id: eventToDelete.id, p_expected_revision: eventToDelete.revision ?? 0});
    eventDeleteDialog.dialog.close();
    await refreshEventsData('Мероприятие удалено.');
  } catch (error) {
    if (error.code === 'PT409') {
      eventDeleteDialog.dialog.close();
      await refreshEventsData('Мероприятие уже изменилось. Таблица обновлена, выберите его заново.');
    } else {
      eventDeleteDialog.status.textContent = error.code === '42501' ? 'Войдите как администратор.' : error.message;
    }
  } finally { eventDeleteDialog.setBusy(false); }
};
