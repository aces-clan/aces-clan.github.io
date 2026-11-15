function balancePartyPool(players, seedTops = false) {
  if (!players.length) return [];
  const count = Math.ceil(players.length / 5);
  const groups = Array.from({length: count}, (_, index) => ({
    players: [], total: 0, capacity: Math.min(5, players.length - index * 5)
  }));
  const locked = new Set();
  let remaining = players;
  if (seedTops) {
    players.slice(0, count).forEach((player, index) => {
      groups[index].players.push(player);
      groups[index].total = player.bm;
      locked.add(player.id);
    });
    remaining = players.slice(count);
  }
  for (const player of remaining) {
    const group = groups.filter(g => g.players.length < g.capacity)
      .sort((a, b) => a.total / a.capacity - b.total / b.capacity)[0];
    group.players.push(player);
    group.total += player.bm;
  }
  // Improve balance through swaps; the four strongest players stay in their parties.
  for (let pass = 0; pass < 200; pass++) {
    let best = null, improvement = 0;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const left = groups[a], right = groups[b];
        for (let i = 0; i < left.players.length; i++) {
          if (locked.has(left.players[i].id)) continue;
          for (let j = 0; j < right.players.length; j++) {
            if (locked.has(right.players[j].id)) continue;
            const delta = right.players[j].bm - left.players[i].bm;
            const gain = left.total ** 2 / left.capacity + right.total ** 2 / right.capacity
              - (left.total + delta) ** 2 / left.capacity - (right.total - delta) ** 2 / right.capacity;
            if (gain > improvement + 0.01) { improvement = gain; best = {left, right, i, j, delta}; }
          }
        }
      }
    }
    if (!best) break;
    const {left, right, i, j, delta} = best;
    [left.players[i], right.players[j]] = [right.players[j], left.players[i]];
    left.total += delta;
    right.total -= delta;
  }
  groups.forEach(group => group.players.sort((a, b) => b.bm - a.bm));
  return groups;
}

function partyAttendance(player, events, history) {
  const days = new Set(history.filter(([id]) => id === player.id).map(([, day]) => day));
  let present = 0, absent = 0;
  for (const event of events) {
    if (event.attendance.includes(player.id)) present++;
    else if (days.has(event.date) && !(event.loot || []).some(item => item.winner === player.id)) absent++;
  }
  return {present, absent};
}

function partyAbsenceRate(player, events, history) {
  const {present, absent} = partyAttendance(player, events, history);
  return present + absent ? absent / (present + absent) : 0;
}

function buildParties(members, considerAttendance = false, events = [], history = []) {
  const active = members.filter(player => !player.departed)
    .map(player => ({...player, bm: Number(player.bm) || 0}))
    .sort((a, b) => b.bm - a.bm || a.name.localeCompare(b.name, 'ru'));
  const first = active.filter(player => !considerAttendance || partyAbsenceRate(player, events, history) <= 0.3).slice(0, 20);
  const ids = new Set(first.map(player => player.id));
  const remaining = active.filter(player => !ids.has(player.id));
  const groups = balancePartyPool(first, true);
  if (remaining.length) while (groups.length < 4) groups.push({players: [], total: 0, capacity: 5});
  return [...groups, ...balancePartyPool(remaining)];
}

function partySwapIndex(target, targetPlayerId) {
  const index = target.players.findIndex(player => String(player.id) === String(targetPlayerId));
  return index >= 0 ? index : target.players.length >= 5 ? target.players.length - 1 : -1;
}

function clearPartyDropHighlight() {
  document.querySelectorAll('.party-drop-target, .party-swap-target').forEach(node => {
    node.classList.remove('party-drop-target', 'party-swap-target');
  });
}

function movePartyPlayer(groups, sourceIndex, targetIndex, playerId, targetPlayerId, allowed) {
  if (sourceIndex === targetIndex || !groups[sourceIndex] || !groups[targetIndex]) return false;
  const source = groups[sourceIndex], target = groups[targetIndex];
  const from = source.players.findIndex(player => String(player.id) === String(playerId));
  if (from < 0) return false;
  const player = source.players[from];
  const to = partySwapIndex(target, targetPlayerId);
  const swapped = to >= 0 ? target.players[to] : null;
  if (!allowed(player, targetIndex) || (swapped && !allowed(swapped, sourceIndex))) return false;
  if (swapped) {
    source.players[from] = swapped;
    target.players[to] = player;
  } else {
    source.players.splice(from, 1);
    target.players.push(player);
  }
  for (const group of [source, target]) group.total = group.players.reduce((sum, member) => sum + member.bm, 0);
  return true;
}

let partySnapshot, partyGroups = [], draggedPartyPlayer = null, partyManuallyChanged = false;
let partySavedState = null, partySaving = false, partyStorageAvailable = false, partyRecalculating = false;
const canEditParties = () => typeof isLootVisible === 'function' && isLootVisible();

function partyStateKey(groups, attendance) {
  return JSON.stringify({groups: groups.map(ids => [...ids].sort((a, b) => a - b)), attendance: Boolean(attendance)});
}

function partyHasChanges() {
  if (!partySnapshot) return false;
  if (!partySavedState) return true;
  return partyStateKey(partyGroups.map(group => group.players.map(player => player.id)), $('party-attendance').checked) !==
    partyStateKey(partySavedState.groups, partySavedState.attendance);
}

function restorePartyGroups(saved, members) {
  const active = new Map(members.filter(player => !player.departed).map(player => [player.id, {...player, bm: Number(player.bm) || 0}]));
  const used = new Set();
  const groups = saved.groups.map(ids => {
    const players = ids.filter(id => active.has(id) && !used.has(id)).map(id => {
      used.add(id);
      return active.get(id);
    });
    return {players, total: players.reduce((sum, player) => sum + player.bm, 0), capacity: 5};
  });
  const newcomers = [...active.values()].filter(player => !used.has(player.id));
  if (newcomers.length || groups.some((group, index) => group.players.length !== saved.groups[index].length)) {
    return buildParties(members, saved.attendance, partySnapshot.events, partySnapshot.history);
  }
  return groups;
}

async function partyRpc(name, body = {}) {
  const response = await fetch(siteProject + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: {apikey: lootProjectKey, 'Content-Type': 'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : null; }
  catch { throw new Error('Сервер временно недоступен'); }
  if (!response.ok) throw Object.assign(new Error(result.message || 'Ошибка сохранения'), {code: result.code});
  return result;
}

async function persistPartyDraft(payload, rpc = partyRpc) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await rpc('aces_save_parties', payload); }
    catch (error) {
      if (error.code && error.code !== '40001' && error.code !== 'PT409') throw error;
      let saved;
      try { saved = await rpc('aces_load_parties'); }
      catch { throw error; }
      if (saved && partyStateKey(saved.groups, saved.attendance) === partyStateKey(payload.p_groups, payload.p_attendance)) return saved;
      if ((saved?.revision || 0) !== payload.p_revision) throw Object.assign(new Error('Состав изменён'), {code: 'PT409'});
      if (attempt === 1 || error.code === '40001' || error.code === 'PT409') throw error;
    }
  }
}

async function recalculateParties() {
  if (!canEditParties() || partySaving || !partySavedState || !partyStorageAvailable || (partyManuallyChanged && partyHasChanges())) return;
  partySaving = true;
  partyRecalculating = true;
  renderParties();
  $('page-status').textContent = 'Обновление BM и посещаемости…';
  try {
    const [snapshot, saved] = await Promise.all([siteData(true, true), partyRpc('aces_load_parties')]);
    const groups = buildParties(snapshot.members, $('party-attendance').checked, snapshot.events, snapshot.history);
    partySnapshot = snapshot;
    partySavedState = saved;
    partyGroups = groups;
    partyManuallyChanged = partyHasChanges();
    $('page-status').textContent = partyManuallyChanged ? 'Пати пересчитаны. Сохраните новый состав.' : 'Пати пересчитаны. Состав уже актуален.';
  } catch {
    $('page-status').textContent = 'Не удалось обновить данные. Состав оставлен без изменений. Попробуйте ещё раз.';
  } finally { partySaving = false; partyRecalculating = false; renderParties(); }
}

async function saveParties() {
  if (!canEditParties() || partySaving || !partyStorageAvailable || !partyHasChanges()) return;
  const password = sessionStorage.getItem('aces-admin-password');
  if (!password) { $('page-status').textContent = 'Для сохранения подтвердите вход ещё раз.'; openAcesAuth(); return; }
  partySaving = true;
  renderParties();
  $('page-status').textContent = 'Сохранение…';
  try {
    partySavedState = await persistPartyDraft({
      p_groups: partyGroups.map(group => group.players.map(player => player.id)),
      p_attendance: $('party-attendance').checked,
      p_password: password, p_revision: partySavedState?.revision || 0
    });
    partyManuallyChanged = false;
    $('page-status').textContent = 'Составы пати сохранены.';
  } catch (error) {
    $('page-status').textContent = (error.code === '40001' || error.code === 'PT409') ? 'Состав уже изменён другим администратором. Ваши изменения оставлены на странице. Обновите страницу, чтобы загрузить актуальный состав.' :
      error.code === '42501' ? 'Войдите заново для сохранения.' :
      error.code === 'P0001' && error.message.includes('Attendance') ? 'В первых четырёх пати есть игрок с более чем 30% прогулов. Пересчитайте состав.' :
      error.code === 'P0001' ? 'Состав клана изменился. Обновите страницу и пересчитайте пати.' : 'Не удалось подтвердить сохранение: сервер не ответил. Изменения оставлены на странице; попробуйте сохранить ещё раз.';
  } finally { partySaving = false; renderParties(); }
}
function partyPlayerAllowed(player, index) {
  return index >= 4 || !$('party-attendance').checked ||
    partyAbsenceRate(player, partySnapshot.events, partySnapshot.history) <= 0.3;
}

function renderParties() {
  const host = $('party-groups');
  host.replaceChildren();
  $('party-edit-hint').hidden = !canEditParties();
  $('party-attendance-control').hidden = !canEditParties();
  $('party-attendance').disabled = partySaving || !canEditParties();
  $('party-save').hidden = !canEditParties();
  const changed = partyHasChanges();
  $('party-save').disabled = partySaving || !partyStorageAvailable || !changed;
  $('party-save').textContent = partySaving && !partyRecalculating ? 'Сохранение…' : 'Сохранить';
  $('party-recalculate').hidden = !canEditParties() || (partyManuallyChanged && changed) || !partySavedState;
  $('party-recalculate').disabled = partySaving || !partyStorageAvailable;
  $('party-recalculate').textContent = partyRecalculating ? 'Пересчёт…' : 'Пересчитать';
  $('party-reset').disabled = partySaving;
  $('party-reset').hidden = !canEditParties() || !partyManuallyChanged || !changed;
  $('party-manual-status').hidden = !partyManuallyChanged || !changed;
  partyGroups.forEach((group, index) => {
    const card = document.createElement('section');
    card.className = 'panel party-card';
    const header = document.createElement('div');
    header.className = 'party-card-heading';
    const title = document.createElement('h2');
    title.textContent = 'Пати ' + (index + 1);
    const power = document.createElement('strong');
    power.className = 'party-power';
    power.textContent = fmt(group.total);
    power.setAttribute('aria-label', 'Суммарный BM: ' + fmt(group.total));
    header.append(title, power);
    const list = document.createElement('ol');
    for (const player of group.players) {
      const row = document.createElement('li');
      row.dataset.playerId = player.id;
      row.draggable = canEditParties() && !partySaving;
      if (canEditParties()) {
        const grip = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        grip.setAttribute('viewBox', '0 0 12 18');
        grip.setAttribute('aria-hidden', 'true');
        grip.classList.add('party-grip');
        grip.innerHTML = '<g fill="currentColor"><circle cx="3" cy="4" r="1.2"/><circle cx="9" cy="4" r="1.2"/><circle cx="3" cy="9" r="1.2"/><circle cx="9" cy="9" r="1.2"/><circle cx="3" cy="14" r="1.2"/><circle cx="9" cy="14" r="1.2"/></g>';
        row.append(grip);
      }
      const name = document.createElement('span');
      name.className = 'party-player-name';
      name.textContent = player.name;
      const identity = document.createElement('span');
      identity.className = 'party-player-identity';
      identity.append(name);
      let attendanceCounts;
      if ($('party-attendance').checked) {
        const stats = partyAttendance(player, partySnapshot.events, partySnapshot.history);
        const counts = document.createElement('span');
        counts.className = 'party-attendance-counts';
        counts.setAttribute('aria-label', `Посещено: ${stats.present}, пропущено: ${stats.absent}`);
        const present = document.createElement('strong');
        present.className = 'event-present';
        present.textContent = stats.present;
        const absent = document.createElement('strong');
        absent.className = 'event-absent';
        absent.textContent = stats.absent;
        counts.append(present, document.createTextNode(' / '), absent);
        attendanceCounts = counts;
      }
      const bm = document.createElement('span');
      bm.className = 'party-player-bm';
      bm.textContent = fmt(player.bm);
      row.append(identity, bm);
      if (attendanceCounts) row.append(attendanceCounts);
      row.addEventListener('dragstart', event => {
        if (!canEditParties() || partySaving) { event.preventDefault(); return; }
        draggedPartyPlayer = {source: index, id: player.id};
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(player.id));
        row.classList.add('party-dragging');
      });
      row.addEventListener('dragend', () => {
        draggedPartyPlayer = null;
        row.classList.remove('party-dragging');
        clearPartyDropHighlight();
      });
      list.append(row);
    }
    card.addEventListener('dragover', event => {
      clearPartyDropHighlight();
      if (!canEditParties() || partySaving || !draggedPartyPlayer || draggedPartyPlayer.source === index) return;
      event.preventDefault();
      const player = partyGroups[draggedPartyPlayer.source].players.find(player => player.id === draggedPartyPlayer.id);
      const targetId = event.target.closest('li[data-player-id]')?.dataset.playerId;
      const swapIndex = partySwapIndex(group, targetId);
      const swapped = group.players[swapIndex];
      if (!partyPlayerAllowed(player, index) || (swapped && !partyPlayerAllowed(swapped, draggedPartyPlayer.source))) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      event.dataTransfer.dropEffect = 'move';
      card.classList.add('party-drop-target');
      if (swapped) list.children[swapIndex].classList.add('party-swap-target');
    });
    card.addEventListener('dragleave', event => {
      if (!card.contains(event.relatedTarget)) {
        card.classList.remove('party-drop-target');
        list.querySelectorAll('.party-swap-target').forEach(row => row.classList.remove('party-swap-target'));
      }
    });
    card.addEventListener('drop', event => {
      event.preventDefault();
      clearPartyDropHighlight();
      if (!canEditParties() || partySaving || !draggedPartyPlayer) return;
      const targetId = event.target.closest('li[data-player-id]')?.dataset.playerId;
      const moved = movePartyPlayer(partyGroups, draggedPartyPlayer.source, index, draggedPartyPlayer.id, targetId, partyPlayerAllowed);
      draggedPartyPlayer = null;
      if (moved) { partyManuallyChanged = true; renderParties(); $('page-status').textContent = ''; }
      else $('page-status').textContent = 'Игроков с более чем 30% прогулов нельзя помещать в первые четыре пати.';
    });
    card.append(header, list);
    host.append(card);
  });
}

function rebuildParties() {
  if (!partySnapshot || partySaving || !canEditParties()) return;
  partyManuallyChanged = false;
  partyGroups = buildParties(partySnapshot.members, $('party-attendance').checked, partySnapshot.events, partySnapshot.history);
  renderParties();
  $('page-status').textContent = partyGroups.length ? '' : 'Нет активных игроков.';
}

if (typeof document !== 'undefined' && $('party-groups')) {
  $('party-attendance').onchange = () => { rebuildParties(); partyManuallyChanged = true; renderParties(); };
  $('party-reset').onclick = () => {
    if (partySaving || !canEditParties()) return;
    if (partySavedState) {
      $('party-attendance').checked = partySavedState.attendance;
      partyGroups = restorePartyGroups(partySavedState, partySnapshot.members);
      partyManuallyChanged = false;
      renderParties();
      $('page-status').textContent = '';
    } else rebuildParties();
  };
  $('party-save').onclick = saveParties;
  $('party-recalculate').onclick = recalculateParties;
  document.addEventListener('aces-auth-change', () => { if (partySnapshot) renderParties(); });
  Promise.all([siteData(true, true), partyRpc('aces_load_parties').then(saved => {
    partyStorageAvailable = true;
    return saved;
  }).catch(() => null)]).then(([snapshot, saved]) => {
    partySnapshot = snapshot;
    partySavedState = saved;
    $('party-attendance').checked = saved?.attendance || false;
    partyGroups = saved ? restorePartyGroups(saved, snapshot.members) : buildParties(snapshot.members);
    renderParties();
    $('page-status').textContent = partyStorageAvailable ? '' : 'Не удалось загрузить сохранённые пати. Показан автоматический подбор; сохранение временно недоступно.';
  }).catch(() => {
    $('page-status').textContent = 'Не удалось загрузить состав. Обновите страницу.';
  });
}

