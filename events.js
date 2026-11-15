const eventsGearFilter = $('events-gear-only');
let eventsEquipment = {};

const gearSlotNames = {
  weapon: 'Оружие', helmet: 'Шлем', armor: 'Броня', gloves: 'Перчатки', boots: 'Сапоги',
  necklace: 'Ожерелье', earrings: 'Серьги', ring: 'Кольцо', bracelet: 'Браслет', belt: 'Пояс'
};

function addEquipmentThumbnails(card, player) {
  if (!isLootVisible()) return;
  const equipment = eventsEquipment[player.id]?.items ?? [];
  if (!equipment.length) return;

  const list = document.createElement('ul');
  list.className = 'event-player-equipment';
  list.setAttribute('aria-label', 'Фиолетовые вещи');
  for (const item of equipment) {
    const entry = document.createElement('li');
    const label = item.name ?? gearSlotNames[item.type];
    const tier = item.grade === 'heroic_t2' ? 'T2' : 'T1';
    entry.title = label + ' · ' + tier;
    const badge = document.createElement('span');
    badge.textContent = tier;
    if (item.thumbnail) {
      const image = document.createElement('img');
      image.alt = label;
      image.width = image.height = 34;
      loadAwardedImage(image, item.thumbnail);
      entry.append(image);
    } else {
      entry.setAttribute('aria-label', entry.title);
      const fallback = document.createElement('span');
      fallback.className = 'event-equipment-fallback';
      fallback.textContent = label.slice(0, 1);
      entry.append(fallback);
    }
    entry.append(badge);
    list.append(entry);
  }
  card.append(list);
}

async function loadEventsEquipment() {
  const response = await fetch(siteProject + '/rest/v1/rpc/aces_events_equipment', {
    method: 'POST',
    headers: {apikey: lootProjectKey, 'Content-Type': 'application/json'},
    body: JSON.stringify({p_password: sessionStorage.getItem('aces-admin-password')}),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Не удалось загрузить экипировку');
  return response.json();
}

const clanDate = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Kaliningrad'});
const dayPlural = new Intl.PluralRules('ru-RU');
let closePlayerCard = () => {};

function playerCardRows(player, stats, rosterDays, today) {
  const left = player.departed && stats.lastSeen
    ? rosterDays.find(day => day > stats.lastSeen) : null;
  const end = player.departed ? left || stats.lastSeen : today;
  const days = stats.joined && end
    ? Math.max(0, (Date.parse(end) - Date.parse(stats.joined)) / 86400000) : null;
  const duration = days === null ? '—' : stats.joined === '2026-11-01'
    ? `более ${days} ${dayPlural.select(days) === 'one' ? 'дня' : 'дней'}`
    : `${days} ${{one: 'день', few: 'дня', many: 'дней'}[dayPlural.select(days)]}`;
  const total = stats.present + stats.absent;
  return [
    ['Вступление', stats.joined ? formatSiteDate(stats.joined) : '—'],
    ...(player.departed ? [['Уход', left ? `≈ ${formatSiteDate(left)}` : 'Дата неизвестна']] : []),
    ['В клане', duration === '—' || !player.departed || stats.joined === '2026-11-01'
      ? duration : `${left ? '≈ ' : 'не менее '}${duration}`],
    [player.departed ? 'Последняя БМ' : 'БМ', player.bm == null ? '—' : fmt(player.bm)],
    ['Посещаемость', total ? `${Math.round(100 * stats.present / total)}%` : 'Нет данных'],
    ['Посещено / пропущено', `${stats.present} / ${stats.absent}`]
  ];
}

function addPlayerCard(cell, player, stats, rosterDays) {
  const card = document.createElement('div');
  card.id = `event-player-card-${player.id}`;
  card.className = 'panel event-player-card';
  card.setAttribute('popover', 'manual');
  card.setAttribute('role', 'tooltip');
  cell.tabIndex = 0;
  cell.setAttribute('aria-describedby', card.id);
  const fields = document.createElement('dl');
  const title = document.createElement('strong');
  title.textContent = player.name;
  card.append(title, fields);
  cell.append(card);

  function close() {
    if (card.matches(':popover-open')) card.hidePopover();
    if (closePlayerCard === close) closePlayerCard = () => {};
  }
  function open() {
    if (card.matches(':popover-open')) return;
    closePlayerCard();
    fields.replaceChildren();
    for (const [label, value] of playerCardRows(player, stats, rosterDays, clanDate.format(new Date()))) {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      fields.append(term, detail);
    }
    if (!card.querySelector('.event-player-equipment')) addEquipmentThumbnails(card, player);
    const {right, top} = cell.getBoundingClientRect();
    const viewport = document.documentElement;
    const left = Math.max(8, right + 8);
    card.style.left = left + 'px';
    card.style.maxWidth = Math.max(0, viewport.clientWidth - left - 8) + 'px';
    card.showPopover();
    closePlayerCard = close;
    card.style.top = Math.max(8, Math.min(top, viewport.clientHeight - card.offsetHeight - 8)) + 'px';
  }
  cell.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') open(); });
  cell.addEventListener('pointerleave', () => { if (!cell.matches(':focus-visible')) close(); });
  cell.addEventListener('focus', () => { if (cell.matches(':focus-visible')) open(); });
  cell.addEventListener('blur', close);
  cell.addEventListener('click', event => {
    if (event.target.closest('.event-player-card')) return;
    if (event.pointerType === 'touch' && card.matches(':popover-open')) close();
    else open();
  });
}

siteData(true, true).then(snapshot => {
  roster = snapshot.members;
  const rosterDays = [...new Set(snapshot.history.map(([, day]) => day))].sort();
  const refresh = () => {
    closePlayerCard();
    const members = isLootVisible() && eventsGearFilter.checked
      ? roster.filter(player => eventsEquipment[player.id]?.completed)
      : roster;
    renderEvents(snapshot.events, snapshot.history,
      (cell, player, stats) => addPlayerCard(cell, player, stats, rosterDays), members);
  };
  refresh();
  for (const id of ['events-sort', 'events-direction']) {
    $(id).onchange = refresh;
  }
  document.querySelector('.events-scroll').addEventListener('scroll', () => closePlayerCard());
  window.addEventListener('resize', () => closePlayerCard());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closePlayerCard(); });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#events-table tbody th')) closePlayerCard();
  });
  $('page-status').textContent = '';
  eventsGearFilter.onchange = refresh;
  let gearRequest = 0;
  async function refreshEquipment() {
    const request = ++gearRequest;
    eventsGearFilter.closest('label').hidden = !isLootVisible();
    if (!isLootVisible()) return;
    try {
      const equipment = await loadEventsEquipment();
      if (request !== gearRequest) return;
      eventsEquipment = equipment;
      eventsGearFilter.disabled = false;
      $('page-status').textContent = '';
      refresh();
    } catch {
      if (request !== gearRequest) return;
      $('page-status').textContent = 'Не удалось загрузить сведения о вещах.';
    }
  }
  document.addEventListener('aces-auth-change', refreshEquipment);
  document.addEventListener('aces-gear-saved', refreshEquipment);
  refreshEquipment();
}).catch(() => {
  $('page-status').textContent = 'Не удалось загрузить мероприятия. Обновите страницу.';
});

const rulesDialog = $('loot-rules');
$('loot-rules-link').addEventListener('click', event => {
  event.preventDefault();
  rulesDialog.showModal();
});
rulesDialog.querySelector('[data-rules-close]').addEventListener('click', () => rulesDialog.close());
if (location.hash === '#loot-rules') rulesDialog.showModal();
