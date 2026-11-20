const lootIntake = createAcesAdminDialog('loot-intake-title', 'Добавить лут', `
  <div class="loot-intake-event-fields"><div><label for="loot-intake-event">Тип мероприятия</label>
  <select id="loot-intake-event" class="gear-picker" required><option value="">Выберите тип</option>
    <option>Клан босс</option><option>Война за захват</option><option>Защита</option></select></div>
  <div><label for="loot-intake-date">Дата</label><input id="loot-intake-date" type="date" required></div></div>
  <div class="loot-catalog" aria-label="Каталог предметов"></div>
  <fieldset class="loot-catalog-category loot-other"><legend>Другое</legend>
    <div class="loot-catalog-item loot-custom-choice"><label class="loot-custom-select"><input type="radio" name="catalog-item" value="other" required aria-label="Другой предмет">
      <span class="loot-other-thumbnail"></span></label>
      <input id="loot-custom-name" type="text" maxlength="128" autocomplete="off" placeholder="Название предмета" aria-label="Название предмета"></div>
  </fieldset>`, 'loot-intake-dialog');
const intakeBody = document.createElement('div');
intakeBody.className = 'admin-dialog-body';
const intakeFields = lootIntake.form.querySelector('.admin-fields');
intakeFields.before(intakeBody);
intakeBody.append(intakeFields);
lootIntake.dialog.querySelector('.loot-other-thumbnail').replaceWith(itemThumbnailPlaceholder());
const customLootName = $('loot-custom-name');
function updateCustomLootField() {
  const custom = lootIntake.form.querySelector('[name="catalog-item"]:checked')?.value === 'other';
  customLootName.required = custom;
  customLootName.setCustomValidity('');
}
lootIntake.form.addEventListener('change', updateCustomLootField);
customLootName.addEventListener('focus', () => {
  lootIntake.form.querySelector('[name="catalog-item"][value="other"]').checked = true;
  updateCustomLootField();
});
customLootName.addEventListener('input', () => customLootName.setCustomValidity(''));
const intakeOpen = document.createElement('button');
intakeOpen.type = 'button';
intakeOpen.className = 'site-button';
intakeOpen.textContent = 'Добавить лут';
const lootTitle = document.querySelector('.loot-panel h1');
const lootHeading = document.createElement('div');
lootHeading.className = 'loot-heading';
lootTitle.before(lootHeading);
lootHeading.append(lootTitle, intakeOpen);
const intakeCategories = [
  ['weapon','Оружие'],['helmet','Шлемы'],['armor','Броня'],['gloves','Перчатки'],['boots','Сапоги'],
  ['necklace','Ожерелья'],['earrings','Серьги'],['ring','Кольца'],['bracelet','Браслеты'],['belt','Пояса']
];
let intakeKey, intakeVersion = 0, intakeBusy = false;
let intakeImageUrls = [];
function clearIntakeImages() {
  intakeImageUrls.forEach(url => URL.revokeObjectURL(url));
  intakeImageUrls = [];
}
lootIntake.dialog.addEventListener('close', () => { ++intakeVersion; clearIntakeImages(); });
intakeOpen.onclick = async () => {
  if (!isLootVisible() || intakeBusy) return;
  const version = ++intakeVersion;
  lootIntake.form.reset();
  updateCustomLootField();
  intakeKey = crypto.randomUUID();
  $('loot-intake-date').value = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Kaliningrad'}).format(new Date());
  const catalog = lootIntake.dialog.querySelector('.loot-catalog');
  catalog.replaceChildren();
  clearIntakeImages();
  lootIntake.status.textContent = 'Загружаем предметы…';
  lootIntake.save.disabled = true;
  lootIntake.dialog.showModal();
  try {
    const data = await acesAdminRequest('aces_loot_intake_catalog');
    if (version !== intakeVersion || !lootIntake.dialog.open || !isLootVisible()) return;
    for (const [type, name] of intakeCategories) {
      const items = data.items.filter(item => item.type === type);
      if (!items.length) continue;
      const category = document.createElement('fieldset');
      category.className = 'loot-catalog-category';
      const title = document.createElement('legend');
      title.textContent = name;
      const list = document.createElement('div');
      list.className = 'loot-catalog-items';
      category.append(title, list);
      for (const item of items) {
        const label = document.createElement('label');
        label.className = 'loot-catalog-item';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'catalog-item'; radio.value = String(item.id);
        radio.required = true;
        const caption = document.createElement('span');
        caption.className = 'loot-catalog-name';
        caption.textContent = item.name || name;
        const tier = document.createElement('span');
        tier.className = 'loot-catalog-tier';
        tier.textContent = item.grade === 'heroic_t2' ? 'T2' : 'T1';
        const thumbnail = itemThumbnailPlaceholder();
        label.append(radio, thumbnail);
        if (item.thumbnail) {
          const image = document.createElement('img');
          image.alt = ''; image.width = image.height = 40;
          image.hidden = true;
          const path = item.thumbnail.split('/').map(encodeURIComponent).join('/');
          fetch(siteProject + '/storage/v1/object/authenticated/aces-loot/' + path, {
            headers: {apikey: lootProjectKey}, signal: AbortSignal.timeout(15000)
          }).then(async response => {
            if (!response.ok) return;
            const blob = await response.blob();
            if (version !== intakeVersion || !lootIntake.dialog.open) return;
            const url = URL.createObjectURL(blob);
            intakeImageUrls.push(url);
            image.onload = () => { image.hidden = false; thumbnail.replaceChildren(image); };
            image.src = url;
          }).catch(() => {});
        }
        label.append(caption, tier);
        list.append(label);
      }
      catalog.append(category);
    }
    lootIntake.status.textContent = '';
    lootIntake.save.disabled = false;
  } catch (error) {
    if (version === intakeVersion) lootIntake.status.textContent = error.code === '42501'
      ? 'Войдите как администратор.' : 'Не удалось загрузить каталог. Откройте окно ещё раз.';
  }
};
lootIntake.form.onsubmit = async event => {
  event.preventDefault();
  if (intakeBusy || lootIntake.save.disabled || !isLootVisible() || !lootIntake.form.reportValidity()) return;
  const selected = lootIntake.form.querySelector('[name="catalog-item"]:checked').value;
  const customName = selected === 'other' ? customLootName.value.trim() : null;
  if (selected === 'other' && !customName) {
    customLootName.setCustomValidity('Укажите название предмета.');
    customLootName.reportValidity();
    return;
  }
  intakeBusy = true;
  lootIntake.setBusy(true);
  lootIntake.status.textContent = 'Добавляем лут…';
  try {
    await acesAdminRequest('aces_add_loot', {p_event_type: $('loot-intake-event').value, p_event_date: $('loot-intake-date').value,
      p_item_id: selected === 'other' ? null : Number(selected), p_custom_name: customName, p_intake_key: intakeKey});
    lootIntake.dialog.close();
    try { await loadQueue(); }
    catch { queueStatus.textContent = 'Лут добавлен. Не удалось обновить очередь. Обновите страницу.'; }
  } catch (error) {
    lootIntake.status.textContent = error.code === '42501' ? 'Войдите как администратор.' : error.message;
  } finally { intakeBusy = false; lootIntake.setBusy(false); }
};
function refreshIntakeAccess() { intakeOpen.hidden = !isLootVisible(); }
document.addEventListener('aces-auth-change', refreshIntakeAccess);
refreshIntakeAccess();
