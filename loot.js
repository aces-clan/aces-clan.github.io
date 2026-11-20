const group = $('loot-group');
const members = $('loot-members');
const memberList = $('loot-member-list');
const unchecked = new Map();
const exclude = $('exclude-last');
const excludeOwners = $('exclude-owners');
const excludeNewcomers = $('exclude-newcomers');
const requireGear = document.getElementById('require-gear');
let gearSubmitted = new Set();
let newcomers = new Set();
const ownersByItem = new Map();
let equipmentOwners = new Map();
let equipmentState = 'loading';
let equipmentRequest = 0;
const wheel = $('loot-wheel');
const context = wheel.getContext('2d');
const spin = $('spin');
const record = $('record-loot');
const status = $('page-status');
const turn = Math.PI * 2;
let lastRecipients = {};
let candidates = [];
let angle = 0;
let winner = '';
const queue = $('loot-queue');
const queueStatus = $('loot-queue-status');
let selectedItem = null;
let imageUrls = [];

async function supabase(path, options = {}) {
  const response = await fetch(siteProject + path, {
    ...options,
    headers: {
      apikey: lootProjectKey,
      ...(options.body ? {'Content-Type': 'application/json'} : {})
    }
  });
  if (!response.ok) throw new Error('Supabase: ' + response.status);
  return response;
}

async function loadLastRecipients() {
  const response = await supabase('/rest/v1/rpc/aces_last_recipients');
  lastRecipients = await response.json();
}

async function loadQueue() {
  selectedItem = null;
  queue.disabled = true;
  updateSpinAvailability();
  const response = await supabase('/rest/v1/aces_loot?select=id,item_id,name,thumbnail_path&winner_id=is.null&order=id.asc');
  const items = await response.json();
  imageUrls.forEach(url => URL.revokeObjectURL(url));
  imageUrls = [];
  const labels = await Promise.all(items.map(async item => {
    const entry = document.createElement('div');
    entry.className = 'loot-queue-item';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'loot-item';
    input.onchange = () => {
      selectedItem = item;
      renderMembers();
    };
    const image = document.createElement('img');
    image.alt = '';
    const thumbnail = itemThumbnailPlaceholder();
    label.append(input, thumbnail);
    try {
      const path = item.thumbnail_path.split('/').map(encodeURIComponent).join('/');
      const file = await supabase('/storage/v1/object/authenticated/aces-loot/' + path);
      image.src = URL.createObjectURL(await file.blob());
      imageUrls.push(image.src);
      image.onload = () => thumbnail.replaceChildren(image);
    } catch {
      // Keep the same-size placeholder when no thumbnail is available.
    }
    const caption = document.createElement('span');
    caption.textContent = item.name;
    label.append(caption);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'site-button site-icon-button';
    remove.title = 'Убрать из нераспределённых';
    remove.setAttribute('aria-label', `Убрать из нераспределённых: ${item.name}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    remove.onclick = async () => {
      if (remove.disabled || !isLootVisible()) return;
      remove.disabled = input.disabled = true;
      queueStatus.textContent = 'Убираем предмет…';
      try {
        const removed = await acesAdminRequest('aces_remove_loot', {p_loot_id: item.id});
        try {
          await loadQueue();
          if (!removed) queueStatus.textContent = 'Предмет уже распределён или недоступен. Очередь обновлена.';
        } catch {
          queueStatus.textContent = removed ? 'Предмет убран. Не удалось обновить очередь. Обновите страницу.'
            : 'Предмет уже распределён или недоступен. Обновите страницу.';
        }
      } catch {
        remove.disabled = input.disabled = false;
        queueStatus.textContent = 'Не удалось убрать предмет. Попробуйте ещё раз.';
      }
    };
    entry.append(label, remove);
    return entry;
  }));
  $('loot-items').replaceChildren(...labels);
  queue.hidden = !labels.length;
  queue.disabled = false;
  queueStatus.textContent = labels.length ? '' : 'Нераспределённых предметов нет.';
}

function loadVisibleQueue() {
  refreshEquipmentOwners();
  if (!isLootVisible()) return;
  queueStatus.textContent = 'Загрузка очереди…';
  loadQueue().catch(() => {
    queueStatus.textContent = 'Не удалось загрузить очередь. Обнови страницу.';
  });
}

document.addEventListener('aces-auth-change', loadVisibleQueue);
loadVisibleQueue();

function updateSpinAvailability() {
  spin.disabled = !candidates.length || selectedItem === null
    || (excludeOwners.checked && equipmentState !== 'ready');
}

function paint() {
  const center = wheel.width / 2;
  context.clearRect(0, 0, wheel.width, wheel.height);
  const step = turn / candidates.length;
  candidates.forEach((player, index) => {
    const start = angle + index * step - Math.PI / 2;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, center - 3, start, start + step);
    context.fillStyle = ['#562631', '#b68e54', '#203849', '#d4b586'][index % 4];
    context.fill();
    context.save();
    context.translate(center, center);
    context.rotate(start + step / 2);
    context.fillStyle = index % 2 ? '#201610' : '#f6e5c7';
    context.font = candidates.length > 20 ? '11px Arial' : '15px Arial';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillText(player.name, center - 14, 0, center - 26);
    context.restore();
  });
}

function selectedGroup() {
  return Number(group.querySelector('input:checked').value);
}

function renderMembers() {
  const groupId = selectedGroup();
  const lastRecipient = lastRecipients[groupId];
  const omitted = unchecked.get(groupId) || new Set();
  unchecked.set(groupId, omitted);

  const labels = roster.filter(player => player.group === groupId).map(player => {
    const label = document.createElement('label');
    const check = document.createElement('input');
    const isLast = exclude.checked && player.name === lastRecipient;
    const isOwner = ownsSelectedItem(player);
    const isNewcomer = excludeNewcomers.checked && newcomers.has(player.id);
    const missingGear = requiresGearForm(player);
    const excluded = isLast || isOwner || isNewcomer || missingGear;
    check.type = 'checkbox';
    check.checked = !excluded && !omitted.has(player.name);
    check.disabled = excluded;
    check.onchange = () => {
      if (check.checked) omitted.delete(player.name);
      else omitted.add(player.name);
      updateWheel();
    };
    label.append(check, ' ' + player.name + (missingGear ? ' (не заполнил сведения о вещах)' : isLast ? ' (последний получатель)' : isOwner ? ' (уже есть предмет)' : isNewcomer ? ' (в клане менее 7 дней)' : ''));
    return label;
  });
  memberList.replaceChildren(...labels);
  $('last-recipient').textContent = 'Последний получатель — ' + (lastRecipient || 'нет записи');
  updateWheel();
}

function ownsSelectedItem(player) {
  return excludeOwners.checked && selectedItem !== null
    && (ownersByItem.get(selectedItem.item_id)?.has(player.id)
      || equipmentOwners.get(selectedItem.thumbnail_path)?.has(String(player.id)));
}

async function refreshEquipmentOwners() {
  const request = ++equipmentRequest;
  equipmentOwners = new Map();
  equipmentState = 'loading';
  if (!isLootVisible()) return;
  updateSpinAvailability();
  try {
    const response = await supabase('/rest/v1/rpc/aces_events_equipment', {
      method: 'POST',
      body: JSON.stringify({p_password: sessionStorage.getItem('aces-admin-password')}),
      signal: AbortSignal.timeout(20000)
    });
    const equipment = await response.json();
    if (request !== equipmentRequest) return;
    for (const [memberId, {items}] of Object.entries(equipment)) {
      for (const {thumbnail} of items) {
        if (!thumbnail) continue;
        if (!equipmentOwners.has(thumbnail)) equipmentOwners.set(thumbnail, new Set());
        equipmentOwners.get(thumbnail).add(memberId);
      }
    }
    equipmentState = 'ready';
  } catch {
    if (request !== equipmentRequest) return;
    equipmentState = 'failed';
  }
  if (selectedItem !== null && !group.disabled) renderMembers();
}

function requiresGearForm(player) {
  return requireGear.checked && !gearSubmitted.has(String(player.id));
}

async function loadGearSubmissions() {
  const response = await supabase('/rest/v1/rpc/aces_gear_completed');
  gearSubmitted = new Set(await response.json());
}

requireGear.onchange = async () => {
  gearSubmitted = new Set();
  renderMembers();
  if (!requireGear.checked) return;
  requireGear.disabled = true;
  status.textContent = 'Проверяем, кто указал свои вещи…';
  try {
    await loadGearSubmissions();
    renderMembers();
  } catch {
    status.textContent = 'Не удалось проверить, кто заполнил сведения о вещах.';
  } finally {
    requireGear.disabled = false;
  }
};

document.addEventListener('aces-gear-saved', () => {
  if (requireGear.checked) requireGear.onchange();
});

function updateWheel() {
  const groupId = selectedGroup();
  const omitted = unchecked.get(groupId);
  candidates = roster.filter(player => player.group === groupId
    && !omitted.has(player.name)
    && !ownsSelectedItem(player)
    && !requiresGearForm(player)
    && (!excludeNewcomers.checked || !newcomers.has(player.id))
    && (!exclude.checked || player.name !== lastRecipients[groupId]));
  $('candidates').textContent = 'Участники (' + candidates.length + ')';
  updateSpinAvailability();
  angle = 0;
  winner = '';
  record.hidden = true;
  if (selectedItem !== null && excludeOwners.checked && equipmentState !== 'ready') {
    status.textContent = equipmentState === 'loading' ? 'Проверяем, у кого уже есть предмет…'
      : 'Не удалось проверить экипировку. Обнови страницу перед розыгрышем.';
  } else {
    status.textContent = candidates.length ? '' : 'В группе нет участников для розыгрыша.';
  }
  paint();
}

spin.onclick = () => {
  const index = Math.floor(Math.random() * candidates.length);
  winner = candidates[index].name;
  const from = angle;
  const target = turn - (index + 0.5) * turn / candidates.length;
  const distance = 5 * turn + (target - from % turn + turn) % turn;
  const start = performance.now();
  spin.disabled = queue.disabled = group.disabled = members.disabled = exclude.disabled = excludeOwners.disabled = excludeNewcomers.disabled = requireGear.disabled = true;
  record.hidden = true;
  status.textContent = 'Колесо крутится…';
  function animate(now) {
    const progress = Math.min(1, (now - start) / 3200);
    angle = from + distance * (1 - (1 - progress) ** 4);
    paint();
    if (progress < 1) {
      requestAnimationFrame(animate);
      return;
    }
    queue.disabled = group.disabled = members.disabled = exclude.disabled = excludeOwners.disabled = excludeNewcomers.disabled = requireGear.disabled = false;
    updateSpinAvailability();
    status.textContent = 'Победитель — ' + winner;
    record.hidden = false;
  }
  requestAnimationFrame(animate);
};

record.onclick = async () => {
  const recipient = winner;
  const groupId = selectedGroup();
  record.disabled = spin.disabled = queue.disabled = group.disabled = members.disabled = exclude.disabled = excludeOwners.disabled = excludeNewcomers.disabled = requireGear.disabled = true;
  let awarded = false;
  try {
    const response = await supabase('/rest/v1/rpc/aces_award_loot', {
      method: 'POST',
      body: JSON.stringify({item_id: selectedItem.id, recipient, draw_group: groupId, require_gear: requireGear.checked})
    });
    awarded = await response.json();
    if (awarded) {
      addOwner(selectedItem.item_id, roster.find(player => player.name === recipient).id);
      queue.querySelector('input:checked')?.closest('label').remove();
      queue.hidden = !queue.querySelector('input');
    }
    await Promise.all([loadQueue(), loadLastRecipients()]);
    renderMembers();
    status.textContent = awarded ? 'Лут выдан — ' + recipient : 'Предмет уже выдан или состав группы изменился.';
  } catch {
    status.textContent = awarded ? 'Выдача сохранена. Не удалось обновить очередь.' : 'Не удалось подтвердить выдачу. Проверь очередь перед повтором.';
  } finally {
    record.disabled = queue.disabled = group.disabled = members.disabled = exclude.disabled = excludeOwners.disabled = excludeNewcomers.disabled = requireGear.disabled = false;
    updateSpinAvailability();
  }
};
function addOwner(itemId, memberId) {
  if (itemId == null) return;
  if (!ownersByItem.has(itemId)) ownersByItem.set(itemId, new Set());
  ownersByItem.get(itemId).add(memberId);
}

function findNewcomers(history) {
  const snapshots = new Map();
  for (const [memberId, date] of history) {
    if (!snapshots.has(date)) snapshots.set(date, new Set());
    snapshots.get(date).add(memberId);
  }
  const dates = [...snapshots.keys()].sort();
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Kaliningrad'}).format(new Date());
  const probation = new Set();
  for (const player of roster) {
    if (player.departed) continue;
    const absent = dates.findLastIndex(date => !snapshots.get(date).has(player.id));
    const joined = player.joined_on || dates[absent + 1];
    // Players already present in the earliest snapshot have no known start date.
    if ((player.joined_on || absent >= 0) && joined && Date.parse(today) - Date.parse(joined) < 7 * 86400000) {
      probation.add(player.id);
    }
  }
  return probation;
}

group.onchange = exclude.onchange = excludeOwners.onchange = excludeNewcomers.onchange = renderMembers;
Promise.all([siteData(true, true), loadLastRecipients()]).then(([snapshot]) => {
  roster = snapshot.members;
  newcomers = findNewcomers(snapshot.history);
  for (const event of snapshot.events) {
    for (const item of event.loot) addOwner(item.item_id, item.winner);
  }
  group.disabled = members.disabled = false;
  requireGear.onchange();
}).catch(() => {
  status.textContent = 'Не удалось загрузить состав или историю выдач. Обновите страницу.';
});
