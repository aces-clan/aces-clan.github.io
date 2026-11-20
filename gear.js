(() => {
  const nicknameKey = 'aces-gear-nickname';
  const items = [
    ['weapon', 'Оружие'], ['helmet', 'Шлем'], ['armor', 'Броня'],
    ['gloves', 'Перчатки'], ['boots', 'Сапоги'], ['necklace', 'Ожерелье'],
    ['earrings', 'Серьги'], ['ring', 'Кольцо'], ['bracelet', 'Браслет'], ['belt', 'Пояс']
  ];
  const tiers = [['blue', 'Синька'], ['purple_t1', 'Фиол T1'], ['purple_t2', 'Фиол T2']];
  const tierNames = new Map(tiers);

  function button(label, primary = false) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = primary ? 'site-button site-button-primary' : 'site-button';
    element.textContent = label;
    return element;
  }

  function makeDialog(id, title, content) {
    const dialog = document.createElement('dialog');
    dialog.className = 'site-auth-dialog panel gear-dialog';
    dialog.setAttribute('aria-labelledby', id);
    dialog.innerHTML = `
      <header class="site-dialog-header">
        <h2 id="${id}">${title}</h2>
        <button type="button" class="site-button site-dialog-close" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18"/>
          </svg>
        </button>
      </header>${content}`;
    document.body.append(dialog);
    dialog.querySelector('.site-dialog-close').onclick = () => dialog.close();
    return dialog;
  }

  const open = button('Указать вещи и BM');
  open.classList.add('gear-open');
  const actions = document.createElement('div');
  actions.className = 'gear-header-actions';
  authButton.before(actions);
  actions.append(open, authButton);

  const dialog = makeDialog('gear-title', 'Указать вещи и BM', `
    <form>
      <label for="gear-nickname">Выберите игрока из списка</label>
      <select id="gear-nickname" class="gear-picker" required disabled autofocus>
        <option value="">Выберите никнейм</option>
      </select>
      <fieldset class="gear-fields" disabled>
        <legend class="sr-only">Вещи</legend>
        <div class="gear-field-heading"><label for="gear-power">Боевая мощь</label>
          <span id="gear-power-hint" class="gear-hint">Укажите, если изменилась.</span></div>
        <input id="gear-power" type="number" min="1" max="2147483647" step="1" inputmode="numeric" autocomplete="off" aria-describedby="gear-power-hint">
        ${items.map(([key, label]) => `
          <div class="gear-item${['weapon', 'boots', 'belt'].includes(key) ? ' gear-group-end' : ''}" role="group" aria-labelledby="gear-${key}">
            <span id="gear-${key}">${label}</span>
            <div class="loot-segments">
              ${tiers.map(([value, title], index) => `
                <label><input type="radio" name="${key}" value="${value}" ${index === 0 ? 'checked' : ''}>
                  <span>${title}</span></label>`).join('')}
            </div>
          </div>`).join('')}
      </fieldset>
      <p class="gear-hint">Вещи и боевая мощь обновятся после подтверждения заявки.</p>
      <p role="status"></p>
      <button type="submit" class="site-button site-button-primary gear-save" disabled>Сохранить</button>
    </form>`);
  const form = dialog.querySelector('form');
  const picker = dialog.querySelector('#gear-nickname');
  const fields = dialog.querySelector('.gear-fields');
  const power = dialog.querySelector('#gear-power');
  const status = dialog.querySelector('[role="status"]');
  const save = form.querySelector('[type="submit"]');
  const close = dialog.querySelector('.site-dialog-close');
  let originalEquipment;
  let selectionVersion = 0;

  async function gearRequest(endpoint, payload) {
    const response = await fetch(siteProject + '/rest/v1/rpc/' + endpoint, {
      method: 'POST',
      headers: {apikey: lootProjectKey, 'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Equipment request failed');
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }

  picker.onchange = async () => {
    const selection = ++selectionVersion;
    originalEquipment = undefined;
    power.value = '';
    fields.disabled = true;
    save.disabled = true;
    const player = picker.value;
    status.textContent = player ? 'Загружаем вещи…' : '';
    if (!player) return;
    try {
      const equipment = await gearRequest('aces_player_gear', {player_id: player});
      if (selection !== selectionVersion || !dialog.open) return;
      originalEquipment = Object.fromEntries(items.map(([key]) => [key, equipment[key] ?? 'blue']));
      for (const [key, tier] of Object.entries(originalEquipment)) form.elements[key].value = tier;
      try {
        localStorage.setItem(nicknameKey, picker.selectedOptions[0].text);
      } catch {
        // The form remains usable without local storage.
      }
      status.textContent = '';
      fields.disabled = false;
    } catch {
      if (selection !== selectionVersion || !dialog.open) return;
      picker.value = '';
      status.textContent = 'Не удалось загрузить вещи. Выберите игрока ещё раз.';
    }
  };

  open.onclick = async () => {
    const opening = ++selectionVersion;
    originalEquipment = undefined;
    form.reset();
    picker.length = 1;
    picker.disabled = true;
    fields.disabled = true;
    save.disabled = true;
    status.textContent = 'Загружаем список игроков…';
    dialog.showModal();
    try {
      const {members} = await siteData();
      if (opening !== selectionVersion || !dialog.open) return;
      const active = members.filter(player => !player.departed)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      for (const player of active) picker.add(new Option(player.name, player.id));
      status.textContent = active.length ? '' : 'Нет активных игроков.';
      picker.disabled = !active.length;
      if (active.length) picker.focus();
      let cachedName;
      try {
        cachedName = localStorage.getItem(nicknameKey);
      } catch {
        // The form remains usable without local storage.
      }
      const cachedPlayer = active.find(player => player.name === cachedName);
      if (cachedPlayer) {
        picker.value = String(cachedPlayer.id);
        await picker.onchange();
      }
    } catch {
      if (opening !== selectionVersion || !dialog.open) return;
      status.textContent = 'Не удалось загрузить игроков. Откройте форму ещё раз.';
    }
  };

  fields.oninput = fields.onchange = () => {
    status.textContent = '';
    save.disabled = !originalEquipment || !power.validity.valid || (power.value === '' &&
      items.every(([key]) => form.elements[key].value === originalEquipment[key]));
  };
  dialog.addEventListener('cancel', event => {
    if (close.disabled) event.preventDefault();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    if (save.disabled || !picker.value || !form.reportValidity()) return;
    const equipment = Object.fromEntries(new FormData(form));
    const battlePower = power.value === '' ? null : Number(power.value);
    close.disabled = picker.disabled = fields.disabled = save.disabled = true;
    status.textContent = 'Отправляем заявку…';
    try {
      await gearRequest('aces_submit_gear', {player_id: picker.value, equipment, p_battle_power: battlePower});
      dialog.close();
      refreshQueue();
    } catch {
      status.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз.';
      save.disabled = false;
    } finally {
      close.disabled = picker.disabled = fields.disabled = false;
    }
  };

  const queue = document.getElementById('gear-queue');
  const gate = document.getElementById('gear-queue-gate');
  const requestsNav = document.querySelector('[data-requests-nav]');
  const queueStatus = queue?.querySelector('[role="status"]');
  const requestList = queue?.querySelector('.gear-requests');
  let queueVersion = 0;

  function adminRequest(endpoint, payload = {}) {
    return gearRequest(endpoint, {
      ...payload,
      p_password: sessionStorage.getItem('aces-admin-password')
    });
  }

  async function loadQueue(result = '') {
    const version = ++queueVersion;
    if (queue && !requestList.children.length && !queueStatus.textContent) {
      queueStatus.textContent = 'Загружаем заявки…';
    }
    try {
      const requests = await adminRequest('aces_pending_gear');
      if (version !== queueVersion || !isLootVisible()) return;
      if (requestsNav) requestsNav.textContent = requests.length ? `Заявки (${requests.length})` : 'Заявки';
      if (queue) {
        const empty = requests.length ? '' : 'Нет заявок на подтверждение.';
        queueStatus.textContent = result
          ? `Заявка ${result}.${requests.length ? '' : ' Очередь пуста.'}`
          : empty;
        requestList.replaceChildren(...requests.map(renderRequest));
      }
    } catch {
      if (version !== queueVersion || !queue) return;
      queueStatus.textContent = result
        ? `Заявка ${result}. Не удалось обновить список.`
        : 'Не удалось загрузить заявки. Проверьте вход и откройте раздел ещё раз.';
    }
  }

  function renderRequest(request) {
    const card = document.createElement('li');
    card.className = 'panel gear-request';
    const name = document.createElement('h3');
    name.textContent = request.name;
    card.append(name);

    const changes = items.filter(([key]) => Object.hasOwn(request.changes, key));
    if (changes.length) {
      const list = document.createElement('ul');
      for (const [key, label] of changes) {
        const change = document.createElement('li');
        change.textContent = `${label} · ${tierNames.get(request.before[key])} → ${tierNames.get(request.changes[key])}`;
        list.append(change);
      }
      card.append(list);
    } else {
      const unchanged = document.createElement('p');
      unchanged.textContent = 'Без изменений по вещам.';
      card.append(unchanged);
    }
    if (Object.hasOwn(request.changes, 'battle_power')) {
      const change = document.createElement('p');
      const previous = request.before.battle_power;
      change.textContent = `Боевая мощь · ${previous == null ? 'не указана' : fmt(previous)} → ${fmt(request.changes.battle_power)}`;
      card.append(change);
    }

    const approve = button('Подтвердить', true);
    const reject = button('Отклонить');
    reject.setAttribute('aria-label', `Отклонить заявку игрока ${request.name}`);
    approve.setAttribute('aria-label', `Подтвердить заявку игрока ${request.name}`);
    approve.disabled = !request.active;
    if (!request.active) {
      const inactive = document.createElement('p');
      inactive.textContent = 'Игрок вышел из клана.';
      card.append(inactive);
    }
    approve.onclick = async () => {
      approve.disabled = reject.disabled = true;
      queueStatus.textContent = '';
      try {
        const approved = await adminRequest('aces_approve_gear', {
          p_request_id: request.id, p_before: request.before
        });
        if (!approved) {
          await loadQueue();
          queueStatus.textContent = 'Заявка или данные игрока изменились. Проверьте список ещё раз.';
          return;
        }
        card.remove();
        document.dispatchEvent(new Event('aces-gear-saved'));
        await loadQueue('подтверждена');
      } catch {
        approve.disabled = !request.active;
        reject.disabled = false;
        queueStatus.textContent = 'Не удалось подтвердить заявку. Попробуйте ещё раз.';
      }
    };
    reject.onclick = async () => {
      approve.disabled = reject.disabled = true;
      queueStatus.textContent = '';
      try {
        const rejected = await adminRequest('aces_reject_gear', {p_request_id: request.id});
        if (!rejected) {
          await loadQueue();
          queueStatus.textContent = 'Заявка уже изменилась или обработана. Проверьте список ещё раз.';
          return;
        }
        card.remove();
        await loadQueue('отклонена');
      } catch {
        approve.disabled = !request.active;
        reject.disabled = false;
        queueStatus.textContent = 'Не удалось отклонить заявку. Попробуйте ещё раз.';
      }
    };
    const actions = document.createElement('div');
    actions.className = 'gear-header-actions';
    actions.append(approve, reject);
    card.append(actions);
    return card;
  }

  function refreshQueue() {
    const allowed = isLootVisible();
    if (queue) {
      queue.hidden = !allowed;
      gate.hidden = allowed;
    }
    if (allowed && requestsNav) loadQueue();
  }
  gate?.querySelector('button').addEventListener('click', openAcesAuth);
  document.addEventListener('aces-auth-change', refreshQueue);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshQueue();
  });
  refreshQueue();
})();
