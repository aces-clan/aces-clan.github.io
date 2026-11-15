(() => {
  const nicknameKey = 'aces-gear-nickname';
  const items = [
    ['weapon', 'Оружие'], ['helmet', 'Шлем'], ['armor', 'Броня'],
    ['gloves', 'Перчатки'], ['boots', 'Сапоги'], ['necklace', 'Ожерелье'],
    ['earrings', 'Серьги'], ['ring', 'Кольцо'], ['bracelet', 'Браслет'], ['belt', 'Пояс']
  ];
  const tiers = [['blue', 'Синька'], ['purple_t1', 'Фиол T1'], ['purple_t2', 'Фиол T2']];
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'site-button';
  open.textContent = 'Указать свои вещи';
  const actions = document.createElement('div');
  actions.className = 'gear-header-actions';
  authButton.before(actions);
  actions.append(open, authButton);

  const dialog = document.createElement('dialog');
  dialog.className = 'site-auth-dialog panel gear-dialog';
  dialog.setAttribute('aria-labelledby', 'gear-title');
  dialog.innerHTML = `
    <form>
      <header class="site-dialog-header">
        <h2 id="gear-title">Указать свои вещи</h2>
        <button type="button" class="site-button site-dialog-close" data-close aria-label="Закрыть">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18"/>
          </svg>
        </button>
      </header>
      <label for="gear-nickname">Никнейм (как в игре)</label>
      <div class="gear-picker">
        <input id="gear-nickname" role="combobox" aria-autocomplete="list"
          aria-controls="gear-options" aria-expanded="false" autocomplete="off" autofocus>
        <div id="gear-options" class="panel" role="listbox" hidden></div>
      </div>
      ${items.map(([key, label]) => `
        <div class="gear-item${['weapon', 'boots', 'belt'].includes(key) ? ' gear-group-end' : ''}" role="group" aria-labelledby="gear-${key}">
          <span id="gear-${key}">${label}</span>
          <div class="loot-segments">
            ${tiers.map(([value, title], index) => `
              <label><input type="radio" name="${key}" value="${value}" ${index === 0 ? 'checked' : ''}>
                <span>${title}</span></label>`).join('')}
          </div>
        </div>`).join('')}
      <p role="status"></p>
      <button type="submit" class="site-button site-button-primary gear-save" aria-disabled="true">Сохранить</button>
    </form>`;
  document.body.append(dialog);

  const form = dialog.querySelector('form');
  const input = dialog.querySelector('#gear-nickname');
  const options = dialog.querySelector('#gear-options');
  const status = dialog.querySelector('[role="status"]');
  const save = dialog.querySelector('[type="submit"]');
  let members;
  let member;
  let matches = [];
  let active = -1;
  let saving = false;
  let selectionVersion = 0;

  async function gearRequest(endpoint, payload) {
    const response = await fetch(siteProject + '/rest/v1/rpc/' + endpoint, {
      method: 'POST',
      headers: {apikey: lootProjectKey, 'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Ошибка загрузки вещей');
    return endpoint === 'aces_player_gear' ? response.json() : undefined;
  }

  function syncSave() {
    save.setAttribute('aria-disabled', String(!member || saving));
  }

  function closeOptions() {
    options.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function showOptions() {
    closeOptions();
    const query = input.value.trim().toLocaleLowerCase('ru');
    matches = members?.filter(player => player.name.toLocaleLowerCase('ru').includes(query)) ?? [];
    options.replaceChildren(...matches.map((player, index) => {
      const option = document.createElement('div');
      option.id = 'gear-option-' + index;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = player.name;
      option.onpointerdown = event => event.preventDefault();
      option.onclick = () => choose(player);
      return option;
    }));
    options.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', String(!options.hidden));
    if (members) status.textContent = matches.length ? '' : 'Игроки не найдены.';
  }

  async function choose(player) {
    member = undefined;
    input.value = player.name;
    try {
      localStorage.setItem(nicknameKey, player.name);
    } catch {
      // The form remains usable without local storage.
    }
    input.removeAttribute('aria-invalid');
    status.textContent = '';
    closeOptions();
    syncSave();
    const selection = ++selectionVersion;
    status.textContent = 'Загружаем вещи…';
    try {
      const equipment = await gearRequest('aces_player_gear', {player_id: String(player.id)});
      if (selection !== selectionVersion || !dialog.open) return;
      for (const [key] of items) form.elements[key].value = equipment[key] ?? 'blue';
      member = player;
      status.textContent = '';
    } catch {
      if (selection !== selectionVersion || !dialog.open) return;
      status.textContent = 'Не удалось загрузить вещи. Выберите игрока ещё раз.';
    }
    syncSave();
  }

  input.oninput = () => {
    selectionVersion++;
    member = undefined;
    input.removeAttribute('aria-invalid');
    syncSave();
    showOptions();
  };
  input.onfocus = () => { if (!member && members) showOptions(); };
  input.onblur = closeOptions;
  input.onkeydown = event => {
    if (event.key === 'Escape' && !options.hidden) {
      event.preventDefault();
      closeOptions();
    }
    if (event.key === 'Enter' && !options.hidden && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (options.hidden) showOptions();
    if (options.hidden) return;
    options.children[active]?.setAttribute('aria-selected', 'false');
    active = event.key === 'ArrowDown'
      ? (active + 1) % matches.length
      : (active <= 0 ? matches.length - 1 : active - 1);
    const option = options.children[active];
    option.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({block: 'nearest'});
  };

  open.onclick = async () => {
    const opening = ++selectionVersion;
    form.reset();
    member = undefined;
    input.removeAttribute('aria-invalid');
    status.textContent = '';
    syncSave();
    let cachedName = '';
    try {
      cachedName = localStorage.getItem(nicknameKey) ?? '';
    } catch {
      // The form remains usable without local storage.
    }
    input.value = cachedName;
    dialog.showModal();
    try {
      if (!members) {
        status.textContent = 'Загружаем список игроков…';
        members = (await siteData()).members;
      }
      if (!dialog.open) return;
      const cachedPlayer = opening === selectionVersion && cachedName
        && members.find(player => player.name === cachedName);
      if (cachedPlayer) {
        await choose(cachedPlayer);
      } else if (document.activeElement === input) {
        showOptions();
      } else {
        status.textContent = '';
      }
    } catch {
      status.textContent = 'Не удалось загрузить игроков. Откройте форму ещё раз.';
    }
  };

  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    if (!member) {
      input.focus();
      input.setAttribute('aria-invalid', 'true');
      status.textContent = 'Заполните имя персонажа, выбрав игрока из списка.';
      return;
    }

    saving = true;
    syncSave();
    const equipment = Object.fromEntries(new FormData(form));
    const cancel = dialog.querySelector('[data-close]');
    cancel.disabled = true;
    input.readOnly = true;
    const radios = form.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => { radio.disabled = true; });
    status.textContent = 'Сохраняем…';
    try {
      await gearRequest('aces_save_gear', {player_id: String(member.id), equipment});
      dialog.close();
      document.dispatchEvent(new Event('aces-gear-saved'));
    } catch {
      status.textContent = 'Не удалось сохранить вещи. Попробуйте ещё раз.';
    } finally {
      saving = false;
      cancel.disabled = false;
      input.readOnly = false;
      radios.forEach(radio => { radio.disabled = false; });
      syncSave();
    }
  };
})();
