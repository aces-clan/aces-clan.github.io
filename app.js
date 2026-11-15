const selected=new Set(['Dobbi']); let data=[],dates=[],roster=[],rosterUpdated='',request=0;
const $=id=>document.getElementById(id),fmt=n=>Math.round(n).toLocaleString('ru-RU');
const siteProject = 'https://tcgrrvicfwlqwdivnwmk.supabase.co';

async function siteData(includeHistory = false, includeEvents = false) {
  const response = await fetch(siteProject + '/rest/v1/rpc/aces_site_data', {
    method: 'POST',
    headers: {apikey: lootProjectKey, 'Content-Type': 'application/json'},
    body: JSON.stringify({include_history: includeHistory, include_events: includeEvents}),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Ошибка загрузки ACES');
  return response.json();
}

function formatSiteDate(date) {
  return date.split('-').reverse().join('.');
}

function parseSiteHistory(snapshot) {
  const days = [...new Set(snapshot.history.map(([, day]) => day))];
  const dayIndex = new Map(days.map((day, index) => [day, index]));
  const players = new Map(snapshot.members.map(player => [player.id, {
    name: player.name, values: days.map(() => null)
  }]));
  for (const [id, day, power] of snapshot.history) {
    players.get(id).values[dayIndex.get(day)] = power > 0 ? power : null;
  }
  return {dates: days.map(formatSiteDate), data: [...players.values()]};
}
function bounds(people){const values=people.flatMap(p=>p.values.filter(v=>v!==null));if(!values.length)return null;const min=Math.min(...values),max=Math.max(...values),pad=(max-min||Math.max(max*.05,1))*.07;return {min:Math.max(0,min-pad),max:max+pad};}
function color(name){const i=data.findIndex(p=>p.name===name);return `hsl(${(i*137.508+151)%360} 65% 70%)`;}
function list(){const q=$('search').value.toLocaleLowerCase();$('players').replaceChildren();const groups=[{id:1,title:'Группа 1',sub:'Места 1–4'},{id:2,title:'Группа 2',sub:'Места 5–20'},{id:3,title:'Группа 3',sub:'Остальные'},{id:0,title:'Выбыли',sub:'История сохранена'}];for(const group of groups){const members=roster.filter(p=>p.group===group.id&&p.name.toLocaleLowerCase().includes(q));if(!members.length)continue;const section=document.createElement('section');section.className='roster-group group-'+group.id;const heading=document.createElement('h3');heading.append(document.createTextNode(group.title));const sub=document.createElement('span');sub.textContent=group.sub;heading.append(sub);section.append(heading);for(const p of members){const label=document.createElement('label');label.className='player-row';label.dataset.name=p.name;const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(p.name);check.setAttribute('aria-label',p.name);check.onchange=()=>{check.checked?selected.add(p.name):selected.delete(p.name);draw();};const delta=document.createElement('span');delta.className='delta '+(/[▲↑]/.test(p.change)?'up':/[▼↓]/.test(p.change)?'down':p.change==='New'?'new':'same');delta.textContent=p.change;const name=document.createElement('span');name.className='player-name';name.textContent=p.name;const bm=document.createElement('span');bm.className='player-bm';bm.textContent=fmt(p.bm);label.append(check,delta,name,bm);section.append(label);}$('players').append(section);}updateSelection();}
function updateSelection(){document.querySelectorAll('.player-row').forEach(row=>{const on=selected.has(row.dataset.name);row.classList.toggle('chosen',on);row.querySelector('input').checked=on;});$('count').textContent=selected.size;$('none').disabled=selected.size===0;}
function draw(){
 updateSelection();const people=data.filter(p=>selected.has(p.name)),range=bounds(people),host=$('chart');host.replaceChildren();$('legend').replaceChildren();
 if(!range){const e=document.createElement('p');e.className='empty';e.textContent=selected.size?'Нет ненулевых значений у выбранных игроков':'Выберите одного или нескольких игроков';host.append(e);return;}
 const w=Math.max(host.clientWidth,300),h=Math.max(host.clientHeight,120),L=w<500?65:79,R=18,T=20,B=34,pw=w-L-R,ph=h-T-B;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`История BM: ${people.map(p=>p.name).join(', ')}. От ${fmt(range.min)} до ${fmt(range.max)}`);
 function el(tag,attrs,text){const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;svg.append(e);return e;}
 const x=i=>L+(dates.length>1?i/(dates.length-1):.5)*pw,y=v=>T+ph-(v-range.min)/(range.max-range.min)*ph;
 for(let j=0;j<=4;j++){const v=range.min+(range.max-range.min)*j/4,yy=y(v);el('line',{x1:L,y1:yy,x2:w-R,y2:yy,stroke:'#8d7d6538','stroke-width':1});el('text',{x:L-12,y:yy+4,'text-anchor':'end',fill:'#b5b3a6','font-size':10},fmt(v));}
 const stride=Math.max(1,Math.ceil(dates.length/(w<500?4:9)));
 dates.forEach((d,i)=>{if(i%stride&&i!==dates.length-1)return;el('text',{x:x(i),y:h-18,'text-anchor':'middle',fill:'#b5b3a6','font-size':10},d.replace(/\.20\d\d$/,''));});
 people.forEach(p=>{let path='',open=false;p.values.forEach((v,i)=>{if(v===null){open=false;return;}path+=`${open?'L':'M'}${x(i)},${y(v)} `;open=true;});el('path',{d:path,fill:'none',stroke:color(p.name),'stroke-width':people.length>15?1.5:2.5,'stroke-linejoin':'round','stroke-linecap':'round'});p.values.forEach((v,i)=>{if(v!==null)el('circle',{cx:x(i),cy:y(v),r:people.length>15?1.5:3,fill:color(p.name),stroke:'#111921','stroke-width':1});});const chip=document.createElement('button'),dot=document.createElement('i');dot.style.background=color(p.name);chip.append(dot,document.createTextNode(p.name));chip.title='Убрать игрока';chip.onclick=()=>{selected.delete(p.name);list();draw();};$('legend').append(chip);});
 const cross=el('line',{x1:0,x2:0,y1:T,y2:h-B,stroke:'#b09a77','stroke-dasharray':'3 4',visibility:'hidden'});host.append(svg);const tip=document.createElement('div');tip.className='tip';tip.hidden=true;host.append(tip);
 function hover(clientX){const rect=svg.getBoundingClientRect(),pos=(clientX-rect.left)*w/rect.width,index=dates.length===1?0:Math.max(0,Math.min(dates.length-1,Math.round((pos-L)/pw*(dates.length-1))));cross.setAttribute('x1',x(index));cross.setAttribute('x2',x(index));cross.setAttribute('visibility','visible');tip.replaceChildren();const title=document.createElement('strong');title.textContent=dates[index];tip.append(title);people.filter(p=>p.values[index]!==null).sort((a,b)=>b.values[index]-a.values[index]).forEach(p=>{const row=document.createElement('div'),name=document.createElement('span'),value=document.createElement('span'),dot=document.createElement('i');dot.style.background=color(p.name);name.append(dot,document.createTextNode(p.name));value.textContent=fmt(p.values[index]);row.append(name,value);tip.append(row);});tip.hidden=false;tip.style.left=Math.max(0,Math.min(w-tip.offsetWidth-5,x(index)+15))+'px';tip.style.top='35px';}
 svg.addEventListener('pointermove',e=>hover(e.clientX));svg.addEventListener('pointerleave',()=>{tip.hidden=true;cross.setAttribute('visibility','hidden');});
}
async function load() {
  const id = ++request;
  try {
    const snapshot = await siteData(true);
    if (id !== request) return;
    const parsed = parseSiteHistory(snapshot);
    data = parsed.data;
    dates = parsed.dates;
    roster = snapshot.members;
    const timestamp = snapshot.updated_at && new Date(snapshot.updated_at);
    rosterUpdated = timestamp ? 'Обновлено ' + timestamp.toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short'
    }) + ' МСК' : '';
    for (const name of selected) if (!roster.some(player => player.name === name)) selected.delete(name);
    $('period').textContent = dates.length ? dates[0] + ' — ' + dates.at(-1) : '';
    $('roster-updated').textContent = rosterUpdated;
    $('active-count').textContent = roster.filter(player => !player.departed).length + ' активных';
    list();
    draw();
  } catch {
    if (id === request && !data.length) {
      $('chart').innerHTML = '<p class="empty">Данные временно недоступны. Нажмите «Обновить».</p>';
      $('players').textContent = 'Не удалось загрузить состав.';
    }
  }
}
if(typeof document!=='undefined' && document.getElementById('chart')){$('search').oninput=list;$('all').onclick=()=>{roster.filter(p=>!p.departed).forEach(p=>selected.add(p.name));draw();};$('none').onclick=()=>{selected.clear();draw();};let resize;window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(draw,100);});load();}

async function loadAwardedImage(image, path) {
  const objectPath = path.split('/').map(encodeURIComponent).join('/');
  try {
    const response = await fetch(siteProject + '/storage/v1/object/authenticated/aces-loot/' + objectPath, {
      headers: {apikey: lootProjectKey}
    });
    if (!response.ok) throw new Error('Не удалось загрузить изображение');
    image.src = URL.createObjectURL(await response.blob());
    image.onload = () => URL.revokeObjectURL(image.src);
  } catch {
    image.remove();
  }
}

function eventMemberStats(player, clanEvents, history) {
  const days = new Set(history.filter(([id]) => id === player.id).map(([, day]) => day));
  let present = 0, total = 0;
  for (const event of clanEvents) {
    const attended = event.attendance.includes(player.id);
    if (attended || days.has(event.date)) {
      total++;
      if (attended) present++;
    }
  }
  const orderedDays = [...days].sort();
  return {joined: orderedDays[0] || null, lastSeen: orderedDays.at(-1), present, absent: total - present};
}

function sortEventMembers(members, clanEvents, history, key, direction) {
  const stats = new Map(members.map(player => [player.id, eventMemberStats(player, clanEvents, history)]));
  const active = members.filter(player => !player.departed);
  active.sort((a, b) => {
    if (key === 'attendance') {
      const as = stats.get(a.id), bs = stats.get(b.id);
      const comparison = as.absent - bs.absent || bs.present - as.present;
      return comparison * (direction === 'asc' ? -1 : 1);
    }
    const av = key === 'bm' ? a.bm : stats.get(a.id)[key];
    const bv = key === 'bm' ? b.bm : stats.get(b.id)[key];
    if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
    const comparison = av < bv ? -1 : av > bv ? 1 : 0;
    return comparison * (direction === 'asc' ? 1 : -1);
  });
  return [...active, ...members.filter(player => player.departed)];
}

function renderEvents(clanEvents, history, decoratePlayer, members = roster) {
  const membersByDate = new Map();
  for (const [memberId, date] of history) {
    if (!membersByDate.has(date)) membersByDate.set(date, new Set());
    membersByDate.get(date).add(memberId);
  }
  const eventTable = $('events-table');
  eventTable.style.setProperty('--event-count', clanEvents.length);
  const heading = document.createElement('tr');
  const playerHeading = document.createElement('th');
  playerHeading.scope = 'col';
  playerHeading.textContent = 'Игрок';
  heading.append(playerHeading);
  for (const event of clanEvents) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    const date = document.createElement('time');
    date.textContent = formatSiteDate(event.date);
    date.dateTime = event.date;
    cell.append(document.createTextNode(event.name), date);
    heading.append(cell);
  }
  eventTable.tHead.replaceChildren(heading);

  const body = document.createDocumentFragment();
  const sortKey = document.querySelector('input[name="events-sort"]:checked')?.value || 'bm';
  const sortedRoster = sortEventMembers(members, clanEvents, history,
    sortKey, document.querySelector('input[name="events-direction"]:checked')?.value || 'desc');
  for (const player of sortedRoster) {
    const row = document.createElement('tr');
    row.classList.toggle('departed-player', player.departed);
    const name = document.createElement('th');
    name.scope = 'row';
    const playerName = document.createElement('span');
    playerName.className = 'event-player-name';
    playerName.textContent = player.name;
    const value = document.createElement('span');
    value.className = 'event-player-value';
    const stats = eventMemberStats(player, clanEvents, history);
    if (sortKey === 'attendance') {
      const present = document.createElement('strong');
      present.className = 'event-present';
      present.textContent = stats.present;
      const absent = document.createElement('strong');
      absent.className = 'event-absent';
      absent.textContent = stats.absent;
      value.append(present, document.createTextNode(' / '), absent);
      value.setAttribute('aria-label', `Посещено: ${stats.present}, пропущено: ${stats.absent}`);
    } else if (sortKey === 'joined') {
      value.textContent = stats.joined ? formatSiteDate(stats.joined) : '—';
    } else {
      value.textContent = player.bm == null ? '—' : fmt(player.bm);
    }
    const playerSummary = document.createElement('span');
    playerSummary.className = 'event-player-summary';
    playerSummary.append(playerName, value);
    name.append(playerSummary);
    decoratePlayer?.(name, player, stats);
    row.append(name);
    for (const event of clanEvents) {
      const cell = document.createElement('td');
      const awards = event.loot.filter(item => item.winner === player.id);
      for (const item of awards) {
        const badge = document.createElement('span');
        badge.className = 'event-loot';
        if (item.thumbnail) {
          const thumbnail = document.createElement('img');
          thumbnail.className = 'loot-thumbnail';
          thumbnail.alt = '';
          badge.append(thumbnail);
          loadAwardedImage(thumbnail, item.thumbnail);
        }
        badge.append(item.name);
        const entry = document.createElement('span');
        entry.className = 'loot-entry';
        entry.append(badge);
        if (item.card) {
          badge.tabIndex = 0;
          const preview = document.createElement('img');
          preview.className = 'loot-preview';
          preview.alt = item.name;
          entry.append(preview);
          const loadPreview = () => {
            entry.removeEventListener('pointerenter', loadPreview);
            badge.removeEventListener('focus', loadPreview);
            loadAwardedImage(preview, item.card);
          };
          entry.addEventListener('pointerenter', loadPreview);
          badge.addEventListener('focus', loadPreview);
        }
        cell.append(entry);
      }
      if (!awards.length) {
        const attended = event.attendance.includes(player.id);
        const wasMember = membersByDate.get(event.date)?.has(player.id);
        cell.textContent = attended ? '+' : wasMember ? '−' : '·';
        if (attended) cell.className = 'event-present';
        else if (wasMember) cell.className = 'event-absent';
      } else {
        cell.className = 'loot-cell';
      }
      row.append(cell);
    }
    body.append(row);
  }
  eventTable.tBodies[0].replaceChildren(body);
}









