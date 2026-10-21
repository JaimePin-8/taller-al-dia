'use strict';

/* ================= Datos ================= */

const KEY = 'tallerAlDia.v1';
const DAY = 86400000;

const DEFAULT_SERVICES = [
  { id: 'aceite', name: 'Cambio de aceite y filtro', km: 5000, months: 4, price: 950 },
  { id: 'frenos', name: 'Revisión y ajuste de frenos', km: 10000, months: 6, price: 450 },
  { id: 'balatas', name: 'Cambio de balatas', km: 30000, months: 18, price: 1400 },
  { id: 'afinacion', name: 'Afinación', km: 20000, months: 12, price: 1900 },
  { id: 'rotacion', name: 'Rotación y balanceo', km: 10000, months: 6, price: 350 },
  { id: 'alineacion', name: 'Alineación', km: 10000, months: 6, price: 450 },
  { id: 'anticongelante', name: 'Cambio de anticongelante', km: 40000, months: 24, price: 700 },
  { id: 'liqfrenos', name: 'Cambio de líquido de frenos', km: 40000, months: 24, price: 600 },
  { id: 'transmision', name: 'Aceite de transmisión', km: 60000, months: 48, price: 1900 },
  { id: 'ac', name: 'Servicio de aire acondicionado', km: 0, months: 12, price: 850 },
  { id: 'bateria', name: 'Revisión de batería', km: 0, months: 12, price: 0 },
  { id: 'diagnostico', name: 'Diagnóstico con escáner', km: 0, months: 0, price: 400 }
];

const DEFAULT_MSGS = {
  reminder: 'Hola {cliente}, le saluda {taller}. Según nuestro registro, a su {vehiculo} ya le toca:\n{servicios}\n\n¿Le apartamos un lugar esta semana? Responda este mensaje y le damos su cita.',
  ready: 'Hola {cliente}, su {vehiculo} ya está listo ✅. Total: {total}. Saldo pendiente: {saldo}. Puede pasar por él en nuestro horario. — {taller}',
  quote: 'Hola {cliente}, le escribe {taller}. En la última revisión de su {vehiculo} le recomendamos: {trabajo} ({total}). Es importante para su seguridad. ¿Le agendamos para hacerlo?',
  debt: 'Hola {cliente}, le saluda {taller}. Le recordamos que quedó un saldo pendiente de {saldo} del servicio de su {vehiculo} del {fecha}. Puede pagar en el taller o por transferencia. ¡Gracias!',
  inactive: 'Hola {cliente}, hace tiempo que no vemos su {vehiculo} por {taller}. ¿Le hacemos una revisión general para que siga funcionando bien? Responda y le damos cita.'
};

const DEFAULT_SETTINGS = {
  shopName: 'Mi Taller', phone: '', address: '',
  leadDays: 10, inactiveMonths: 6, kmPerDay: 35, onboarded: false
};

const MSG_LABELS = {
  reminder: 'Recordatorio de servicio',
  ready: 'Auto listo para entregar',
  quote: 'Seguimiento de cotización',
  debt: 'Cobranza',
  inactive: 'Cliente inactivo'
};

let S = load();

function migrate(s) {
  s = s && typeof s === 'object' ? s : {};
  s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
  s.settings.msgs = Object.assign({}, DEFAULT_MSGS, s.settings.msgs || {});
  s.services ||= DEFAULT_SERVICES.map(x => ({ ...x }));
  s.clients ||= [];
  s.vehicles ||= [];
  s.orders ||= [];
  s.contacts ||= [];
  s.snooze ||= {};
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { /* datos dañados o almacenamiento bloqueado */ }
  return migrate({});
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('No se pudo guardar. Descarga un respaldo en Ajustes.'); }
}

/* ================= Utilidades ================= */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Math.round(+n || 0));
const num = n => new Intl.NumberFormat('es-MX').format(Math.round(+n || 0));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function localISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function todayISO() { return localISO(new Date()); }
function parseDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function daysFromToday(iso) { return Math.round((parseDate(iso) - startOfToday()) / DAY); }
function addDays(iso, n) { const d = parseDate(iso); d.setDate(d.getDate() + n); return localISO(d); }
function addMonths(iso, m) {
  const d = parseDate(iso), day = d.getDate();
  d.setMonth(d.getMonth() + m);
  if (d.getDate() < day) d.setDate(0);
  return localISO(d);
}
function fmtDate(iso) { return parseDate(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }); }
function rel(days) {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  const a = Math.abs(days);
  const txt = a < 60 ? `${a} días` : `${Math.round(a / 30)} meses`;
  return days < 0 ? `hace ${txt}` : `en ${txt}`;
}
function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
function fill(tpl, vars) { return String(tpl).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m); }

function waPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) d = '52' + d;
  else if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3);
  return d;
}
function waUrl(phone, text) {
  const p = waPhone(phone);
  return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] ??= {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}

/* ================= Consultas ================= */

const client = id => S.clients.find(c => c.id === id);
const vehicle = id => S.vehicles.find(v => v.id === id);
const service = id => S.services.find(s => s.id === id);
const order = id => S.orders.find(o => o.id === id);
const vehShort = v => (v ? [v.make, v.model].filter(Boolean).join(' ') : '') || 'vehículo';
const vehName = v => v ? [v.make, v.model, v.year].filter(Boolean).join(' ') + (v.plate ? ` · ${v.plate}` : '') : 'Vehículo';
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
const ordersOfVehicle = vid => S.orders.filter(o => o.vehicleId === vid).sort(byDateDesc);
const vehiclesOf = cid => S.vehicles.filter(v => v.clientId === cid);
const ordersOfClient = cid => { const ids = new Set(vehiclesOf(cid).map(v => v.id)); return S.orders.filter(o => ids.has(o.vehicleId)).sort(byDateDesc); };
const total = o => o.items.reduce((a, i) => a + (+i.price || 0), 0);
const paid = o => (o.payments || []).reduce((a, p) => a + (+p.amount || 0), 0);
const balance = o => Math.max(0, total(o) - paid(o));
const costOf = o => o.items.reduce((a, i) => a + (+i.cost || 0), 0);

function intervalText(s) {
  const p = [];
  if (s.km > 0) p.push(`cada ${num(s.km)} km`);
  if (s.months > 0) p.push(`${p.length ? '' : 'cada '}${s.months} ${s.months === 1 ? 'mes' : 'meses'}`);
  return p.length ? p.join(' o ') : 'Sin recordatorio';
}

/* ---------- Motor de recordatorios ---------- */

// Km por día: el que se capturó a mano, el calculado con el historial, o el promedio de Ajustes.
function kmPerDay(v) {
  if (+v.kmPerDay > 0) return +v.kmPerDay;
  const os = ordersOfVehicle(v.id).filter(o => o.km > 0);
  if (os.length >= 2) {
    const a = os[os.length - 1], b = os[0];
    const days = (parseDate(b.date) - parseDate(a.date)) / DAY, diff = b.km - a.km;
    if (days >= 20 && diff > 0) return Math.min(300, Math.max(5, diff / days));
  }
  return +S.settings.kmPerDay || 35;
}

function estKm(v) {
  const o = ordersOfVehicle(v.id).find(o => o.km > 0);
  if (!o) return null;
  return Math.round(o.km + kmPerDay(v) * Math.max(0, -daysFromToday(o.date)));
}

// Para cada servicio con intervalo que se le ha hecho al vehículo: cuándo le vuelve a tocar (lo que llegue primero, fecha o km).
function dueList(v) {
  const os = ordersOfVehicle(v.id), kpd = kmPerDay(v), ek = estKm(v), out = [];
  for (const s of S.services) {
    if (!(s.km > 0 || s.months > 0)) continue;
    const o = os.find(o => o.items.some(i => i.serviceId === s.id));
    if (!o) continue;
    let days = Infinity, dueDate = null, dueKm = null;
    if (s.months > 0) { dueDate = addMonths(o.date, s.months); days = Math.min(days, daysFromToday(dueDate)); }
    if (s.km > 0 && o.km > 0 && ek != null) { dueKm = o.km + s.km; days = Math.min(days, Math.round((dueKm - ek) / kpd)); }
    if (days === Infinity) continue;
    out.push({ s, o, dueDate, dueKm, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

const contactsFor = key => S.contacts.filter(c => c.key === key);
const lastContact = key => { const cs = contactsFor(key); return cs[cs.length - 1] || null; };
const isSnoozed = key => !!S.snooze[key] && S.snooze[key] > todayISO();

function avgTicket() {
  const os = S.orders.filter(o => total(o) > 0);
  return os.length ? os.reduce((a, o) => a + total(o), 0) / os.length : 0;
}

function pendientes() {
  const lead = +S.settings.leadDays || 10;
  const P = { svc: [], recs: [], debts: [], inact: [] };
  const openV = new Set(S.orders.filter(o => o.status !== 'entregado').map(o => o.vehicleId));
  const meta = key => ({ key, last: lastContact(key), snoozed: isSnoozed(key) });

  for (const v of S.vehicles) {
    const c = client(v.clientId);
    if (!c || openV.has(v.id) || v.archived) continue;
    const due = dueList(v).filter(d => d.days <= lead);
    if (!due.length) continue;
    const key = 'svc:' + v.id;
    const since = due.reduce((m, d) => d.o.date > m ? d.o.date : m, '');
    P.svc.push({ type: 'svc', v, c, due, days: due[0].days, value: due.reduce((a, d) => a + (+d.s.price || 0), 0),
      tries: contactsFor(key).filter(x => x.date >= since).length, ...meta(key) });
  }

  for (const o of S.orders) {
    const v = vehicle(o.vehicleId), c = v && client(v.clientId);
    if (!c) continue;
    for (const r of o.recs || []) {
      if (r.status !== 'pendiente') continue;
      const key = 'rec:' + r.id;
      P.recs.push({ type: 'rec', v, c, o, r, value: +r.price || 0, days: daysFromToday(o.date), tries: contactsFor(key).length, ...meta(key) });
    }
    if (o.status === 'entregado' && balance(o) > 0) {
      const key = 'debt:' + o.id;
      P.debts.push({ type: 'debt', v, c, o, value: balance(o), days: daysFromToday(o.deliveredAt || o.date), tries: contactsFor(key).length, ...meta(key) });
    }
  }

  const months = +S.settings.inactiveMonths || 6;
  const withSvc = new Set(P.svc.map(x => x.c.id));
  for (const c of S.clients) {
    if (withSvc.has(c.id)) continue;
    const os = ordersOfClient(c.id);
    if (!os.length || os.some(o => o.status !== 'entregado')) continue;
    const lastD = os[0].date;
    if (addMonths(lastD, months) > todayISO()) continue;
    const key = 'inact:' + c.id;
    P.inact.push({ type: 'inact', c, v: vehicle(os[0].vehicleId), o: os[0], value: avgTicket(), days: daysFromToday(lastD),
      tries: contactsFor(key).filter(x => x.date > lastD).length, ...meta(key) });
  }

  P.svc.sort((a, b) => a.days - b.days);
  P.recs.sort((a, b) => b.value - a.value);
  P.debts.sort((a, b) => b.value - a.value);
  P.inact.sort((a, b) => a.days - b.days);
  return P;
}

const allItems = P => [...P.svc, ...P.recs, ...P.debts, ...P.inact];
const findItem = key => allItems(pendientes()).find(x => x.key === key);

function messageFor(it) {
  const m = S.settings.msgs;
  const base = { cliente: firstName(it.c.name), vehiculo: vehShort(it.v), taller: S.settings.shopName, telefono: S.settings.phone };
  switch (it.type) {
    case 'svc': return fill(m.reminder, { ...base, servicios: it.due.map(d => '• ' + d.s.name).join('\n') });
    case 'rec': return fill(m.quote, { ...base, trabajo: it.r.text, total: money(it.r.price) });
    case 'debt': return fill(m.debt, { ...base, saldo: money(balance(it.o)), total: money(total(it.o)), fecha: fmtDate(it.o.date) });
    case 'inact': return fill(m.inactive, base);
  }
  return '';
}

// Lo que se cobró este mes en órdenes de clientes a los que se les avisó en los 45 días anteriores.
function recoveredThisMonth() {
  const m = todayISO().slice(0, 7);
  let sum = 0, n = 0;
  for (const o of S.orders) {
    if (o.date.slice(0, 7) !== m) continue;
    const v = vehicle(o.vehicleId);
    if (!v) continue;
    const from = addDays(o.date, -45);
    const hit = S.contacts.some(c => c.type !== 'debt' && (c.vehicleId === v.id || c.clientId === v.clientId) && c.date <= o.date && c.date >= from);
    if (hit) { sum += total(o); n++; }
  }
  return { sum, n };
}

/* ================= Íconos ================= */

const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'
};
const ic = (n, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ================= Piezas de interfaz ================= */

function header(title, { back, right = '', sub = '' } = {}) {
  return `<header class="top">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Regresar">${ic('back')}</a>` : ''}
    <div class="top-title"><h1>${esc(title)}</h1>${sub ? `<div class="top-sub">${sub}</div>` : ''}</div>
    <div class="top-right">${right}</div>
  </header>`;
}

const STATUS = { taller: ['En taller', 'warn'], listo: ['Listo', 'ok'], entregado: ['Entregado', 'muted'] };
const statusPill = s => `<span class="pill ${STATUS[s][1]}">${STATUS[s][0]}</span>`;

function dueTone(days) {
  const lead = +S.settings.leadDays || 10;
  return days < 0 ? 'bad' : days <= lead ? 'warn' : 'ok';
}
function dueText(d) {
  const when = d.days < 0 ? `vencido ${rel(d.days)}` : `toca ${rel(d.days)}`;
  return `${when}${d.dueKm ? ` · a los ${num(d.dueKm)} km` : ''}`;
}

function itemCard(it) {
  let pill, body, extra = '';
  const v = it.v;
  switch (it.type) {
    case 'svc':
      pill = it.days < 0 ? '<span class="pill bad">Vencido</span>' : '<span class="pill warn">Por vencer</span>';
      body = `<ul class="due">${it.due.map(d => `<li><b>${esc(d.s.name)}</b><span class="t-${dueTone(d.days)}">${dueText(d)}</span></li>`).join('')}</ul>
        <div class="item-meta">Km estimado hoy: ${num(estKm(v))} · última visita ${fmtDate(ordersOfVehicle(v.id)[0].date)}</div>`;
      extra = `<a class="btn small ghost" href="#/orden/nueva?v=${v.id}&svc=${it.due.map(d => d.s.id).join(',')}">Ya vino</a>`;
      break;
    case 'rec':
      pill = '<span class="pill accent">Cotización</span>';
      body = `<p><b>${esc(it.r.text)}</b> · ${money(it.r.price)}</p><div class="item-meta">Recomendado ${rel(it.days)} (${fmtDate(it.o.date)})</div>`;
      extra = `<a class="btn small ghost" href="#/orden/nueva?v=${v.id}&rec=${it.r.id}">Aceptó</a>
        <button class="btn small ghost" data-act="recStatus" data-id="${it.r.id}" data-s="rechazado">No quiso</button>`;
      break;
    case 'debt':
      pill = `<span class="pill bad">${money(it.value)}</span>`;
      body = `<p>Debe <b>${money(it.value)}</b> de ${money(total(it.o))}</p><div class="item-meta">Entregado ${rel(it.days)} (${fmtDate(it.o.deliveredAt || it.o.date)})</div>`;
      extra = `<button class="btn small ghost" data-act="payment" data-id="${it.o.id}">Pagó</button>`;
      break;
    case 'inact':
      pill = '<span class="pill muted">Inactivo</span>';
      body = `<p>Última visita ${rel(it.days)}</p><div class="item-meta">${fmtDate(it.o.date)} · ${esc(it.o.items.map(i => i.name).join(', '))}</div>`;
      break;
  }
  const tries = it.tries ? `<div class="item-meta tries">${ic('clock', 14)} Avisado ${it.tries} ${it.tries === 1 ? 'vez' : 'veces'} · último ${rel(daysFromToday(it.last.date))}${it.snoozed ? ` · vuelve ${rel(daysFromToday(S.snooze[it.key]))}` : ''}</div>` : '';
  return `<article class="card item">
    <div class="item-head">
      <a class="item-who" href="#/cliente/${it.c.id}"><div class="item-title">${esc(it.c.name)}</div><div class="item-sub">${v ? esc(vehName(v)) : ''}</div></a>
      ${pill}
    </div>
    <div class="item-body">${body}</div>
    ${tries}
    <div class="item-actions">
      <button class="btn wa" data-act="send" data-key="${it.key}">${ic('msg', 18)} WhatsApp</button>
      ${it.c.phone ? `<a class="btn icon" href="tel:${esc(it.c.phone)}" aria-label="Llamar">${ic('phone', 18)}</a>` : ''}
      <button class="btn icon" data-act="snoozeMenu" data-key="${it.key}" aria-label="Posponer">${ic('clock', 18)}</button>
    </div>
    ${extra ? `<div class="item-extra">${extra}</div>` : ''}
  </article>`;
}

function orderRow(o) {
  const v = vehicle(o.vehicleId), c = v && client(v.clientId), b = balance(o);
  return `<a class="card row" href="#/orden/${o.id}">
    <div class="row-ic">${ic('car')}</div>
    <div class="grow">
      <div class="row-title">${esc(vehName(v))}</div>
      <div class="row-sub">${esc(c?.name || 'Sin cliente')} · ${fmtDate(o.date)}</div>
    </div>
    <div class="row-end">${statusPill(o.status)}<div class="row-amt">${money(total(o))}${b > 0 ? `<small class="t-bad">debe ${money(b)}</small>` : ''}</div></div>
  </a>`;
}

function empty(icon, title, text, cta = '') {
  return `<div class="empty">${ic(icon, 34)}<h3>${title}</h3><p>${text}</p>${cta}</div>`;
}

/* ================= Vistas ================= */

function vWelcome() {
  return `<main class="welcome">
    <div class="welcome-logo"><img src="icons/icon-192.png" alt="" width="88" height="88"></div>
    <h1>Taller al Día</h1>
    <p class="lead">Avísale a cada cliente cuando le toca su servicio, da seguimiento a lo que cotizaste y no pierdas un peso en cuentas por cobrar.</p>
    <form data-form="welcome" class="stack">
      <label class="field"><span>Nombre del taller</span><input name="shopName" required placeholder="Ej. Taller Mecánico Garza" autocomplete="organization"></label>
      <label class="field"><span>WhatsApp del taller (opcional)</span><input name="phone" inputmode="tel" placeholder="10 dígitos"></label>
      <button class="btn primary big" type="submit">Empezar</button>
    </form>
    <button class="btn ghost" data-act="loadDemo">Probar con datos de ejemplo</button>
  </main>`;
}

function vHome() {
  const P = pendientes();
  const active = allItems(P).filter(x => !x.snoozed);
  const atRisk = active.filter(x => x.type !== 'inact').reduce((a, x) => a + x.value, 0);
  const month = todayISO().slice(0, 7);
  const cobrado = S.orders.flatMap(o => o.payments || []).filter(p => p.date.slice(0, 7) === month).reduce((a, p) => a + (+p.amount || 0), 0);
  const porCobrar = S.orders.reduce((a, o) => a + balance(o), 0);
  const rec = recoveredThisMonth();
  const open = S.orders.filter(o => o.status !== 'entregado').sort((a, b) => (a.status === 'listo' ? -1 : 1) - (b.status === 'listo' ? -1 : 1) || byDateDesc(a, b));
  const lead = +S.settings.leadDays || 10;
  let soonN = 0, soonV = 0;
  for (const v of S.vehicles) for (const d of dueList(v)) if (d.days > lead && d.days <= 30) { soonN++; soonV += +d.s.price || 0; }
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const counts = [['svc', 'Servicios por vencer'], ['recs', 'Cotizaciones sin respuesta'], ['debts', 'Clientes que deben'], ['inact', 'Clientes inactivos']]
    .map(([k, l]) => [k, l, P[k].filter(x => !x.snoozed).length]);

  if (!S.clients.length) {
    return header(S.settings.shopName, { sub: today, right: `<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${ic('gear')}</a>` }) +
      `<main class="page">${empty('wrench', 'Registra tu primer servicio', 'Cada servicio que captures programa solito el siguiente recordatorio para el cliente.',
        `<a class="btn primary big" href="#/orden/nueva">${ic('plus', 20)} Nuevo servicio</a>`)}</main>`;
  }

  return header(S.settings.shopName, { sub: today, right: `<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${ic('gear')}</a>` }) + `
  <main class="page">
    <a class="hero" href="#/avisos">
      <div class="hero-label">Dinero por recuperar</div>
      <div class="hero-amt">${money(atRisk)}</div>
      <div class="hero-sub">${active.length ? `${active.length} ${active.length === 1 ? 'cliente por contactar' : 'clientes por contactar'} hoy` : 'Todo al día. No hay a quién avisar hoy.'}</div>
      ${active.length ? `<div class="hero-cta">Empezar a avisar ${ic('chev', 18)}</div>` : ''}
    </a>

    <div class="kpis">
      <div class="kpi"><span>Cobrado este mes</span><b>${money(cobrado)}</b></div>
      <a class="kpi" href="#/ordenes/saldo"><span>Por cobrar</span><b class="${porCobrar > 0 ? 't-bad' : ''}">${money(porCobrar)}</b></a>
      <div class="kpi"><span>Regresaron por un aviso</span><b class="t-ok">${money(rec.sum)}</b><small>${rec.n} ${rec.n === 1 ? 'orden' : 'órdenes'} este mes</small></div>
      <div class="kpi"><span>Próximos 30 días</span><b>${soonN}</b><small>servicios · ${money(soonV)}</small></div>
    </div>

    <section>
      <h2 class="sec">Pendientes de hoy</h2>
      <div class="card list">
        ${counts.map(([k, l, n]) => `<a class="list-row" href="#/avisos/${k}"><span>${l}</span><span class="count ${n ? 'on' : ''}">${n}</span>${ic('chev', 18)}</a>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="sec">En el taller <span class="muted">${open.length}</span></h2>
      ${open.length ? open.map(orderRow).join('') : `<p class="muted pad">No hay autos en el taller.</p>`}
    </section>
  </main>`;
}

const AVISO_TABS = [
  ['svc', 'Servicios', 'Clientes a los que ya les toca un servicio por fecha o kilometraje.'],
  ['recs', 'Cotizaciones', 'Trabajos que recomendaste y el cliente no ha autorizado.'],
  ['debts', 'Cobranza', 'Autos entregados con saldo pendiente.'],
  ['inact', 'Inactivos', `Clientes que no vienen hace más de ${S.settings.inactiveMonths} meses.`]
];

function vAvisos(tab) {
  if (!AVISO_TABS.some(t => t[0] === tab)) tab = 'svc';
  const P = pendientes();
  const list = P[tab], act = list.filter(x => !x.snoozed), wait = list.filter(x => x.snoozed);
  const tip = AVISO_TABS.find(t => t[0] === tab)[2].replace(/\d+ meses/, `${S.settings.inactiveMonths} meses`);
  return header('Avisos') + `
  <div class="seg-wrap"><nav class="seg">${AVISO_TABS.map(([k, l]) => {
    const n = P[k].filter(x => !x.snoozed).length;
    return `<a class="seg-btn ${k === tab ? 'on' : ''}" href="#/avisos/${k}">${l}${n ? `<b>${n}</b>` : ''}</a>`;
  }).join('')}</nav></div>
  <main class="page">
    <p class="tip">${tip}</p>
    ${act.length ? act.map(itemCard).join('') : empty('check', 'Nada pendiente aquí', 'Cuando haya algo que avisar, aparecerá en esta lista.')}
    ${wait.length ? `<details class="waiting"><summary>Esperando respuesta o pospuestos (${wait.length})</summary>${wait.map(itemCard).join('')}</details>` : ''}
  </main>`;
}

const ORDER_TABS = [['taller', 'En taller'], ['listo', 'Listos'], ['saldo', 'Con saldo'], ['todas', 'Todas']];

function vOrders(tab) {
  if (!ORDER_TABS.some(t => t[0] === tab)) tab = 'taller';
  const filt = {
    taller: o => o.status === 'taller',
    listo: o => o.status === 'listo',
    saldo: o => balance(o) > 0,
    todas: () => true
  }[tab];
  const list = S.orders.filter(filt).sort(byDateDesc).slice(0, tab === 'todas' ? 100 : 500);
  return header('Órdenes') + `
  <div class="seg-wrap"><nav class="seg">${ORDER_TABS.map(([k, l]) => {
    const n = k === 'todas' ? 0 : S.orders.filter({ taller: o => o.status === 'taller', listo: o => o.status === 'listo', saldo: o => balance(o) > 0 }[k]).length;
    return `<a class="seg-btn ${k === tab ? 'on' : ''}" href="#/ordenes/${k}">${l}${n ? `<b>${n}</b>` : ''}</a>`;
  }).join('')}</nav></div>
  <main class="page">
    ${list.length ? list.map(orderRow).join('') : empty('clipboard', 'Sin órdenes', 'Las órdenes de servicio aparecerán aquí.', `<a class="btn primary" href="#/orden/nueva">${ic('plus', 18)} Nuevo servicio</a>`)}
  </main>`;
}

function clientRows(q) {
  const n = norm(q).trim();
  const P = pendientes();
  const flagged = new Set(allItems(P).filter(x => !x.snoozed).map(x => x.c.id));
  let list = S.clients.map(c => ({ c, vs: vehiclesOf(c.id) }));
  if (n) list = list.filter(({ c, vs }) => norm([c.name, c.phone, ...vs.map(v => [v.make, v.model, v.plate].join(' '))].join(' ')).includes(n));
  list.sort((a, b) => a.c.name.localeCompare(b.c.name, 'es'));
  if (!list.length) return n ? `<p class="muted pad">Sin resultados para “${esc(q)}”.</p>` : empty('users', 'Aún no hay clientes', 'Se agregan solos al registrar un servicio.');
  return list.map(({ c, vs }) => `<a class="card row" href="#/cliente/${c.id}">
    <div class="avatar">${esc(firstName(c.name).charAt(0).toUpperCase() || '?')}</div>
    <div class="grow"><div class="row-title">${esc(c.name)}${flagged.has(c.id) ? ' <span class="dot" title="Tiene avisos pendientes"></span>' : ''}</div>
    <div class="row-sub">${esc(vs.map(vehShort).join(', ') || 'Sin vehículo')}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div>
    ${ic('chev', 18)}
  </a>`).join('');
}

function vClients() {
  return header('Clientes', { right: `<button class="icon-btn" data-act="newClient" aria-label="Nuevo cliente">${ic('plus')}</button>` }) + `
  <main class="page">
    <label class="search">${ic('search', 20)}<input type="search" placeholder="Buscar nombre, teléfono o placas" data-live="clients" autocomplete="off"></label>
    <div id="list">${clientRows('')}</div>
  </main>`;
}

function vehicleCard(v) {
  const due = dueList(v), ek = estKm(v), os = ordersOfVehicle(v.id);
  return `<article class="card veh">
    <div class="veh-head">
      <div class="row-ic">${ic('car')}</div>
      <div class="grow"><div class="row-title">${esc([v.make, v.model, v.year].filter(Boolean).join(' '))}</div>
      <div class="row-sub">${v.plate ? esc(v.plate) + ' · ' : ''}${ek != null ? `≈ ${num(ek)} km hoy` : 'Sin kilometraje'} · ${num(kmPerDay(v))} km/día</div></div>
      <button class="icon-btn sm" data-act="editVehicle" data-id="${v.id}" aria-label="Editar vehículo">${ic('edit', 18)}</button>
    </div>
    ${due.length ? `<ul class="due">${due.slice(0, 5).map(d => `<li><b>${esc(d.s.name)}</b><span class="t-${dueTone(d.days)}">${dueText(d)}</span></li>`).join('')}</ul>` : '<p class="muted small">Aún sin servicios con recordatorio.</p>'}
    <div class="veh-actions"><a class="btn primary" href="#/orden/nueva?v=${v.id}">${ic('plus', 18)} Nuevo servicio</a></div>
    ${os.length ? `<div class="hist">${os.map(o => `<a class="hist-row" href="#/orden/${o.id}"><span>${fmtDate(o.date)}${o.km ? ` · ${num(o.km)} km` : ''}</span><span class="grow ell">${esc(o.items.map(i => i.name).join(', '))}</span><b>${money(total(o))}</b></a>`).join('')}</div>` : ''}
  </article>`;
}

function vClient(id) {
  const c = client(id);
  if (!c) return notFound();
  const vs = vehiclesOf(c.id), os = ordersOfClient(c.id);
  const spent = os.reduce((a, o) => a + total(o), 0), owes = os.reduce((a, o) => a + balance(o), 0);
  return header(c.name, { back: '#/clientes', right: `<button class="icon-btn" data-act="editClient" data-id="${c.id}" aria-label="Editar cliente">${ic('edit')}</button>` }) + `
  <main class="page">
    <div class="contact">
      ${c.phone ? `<a class="btn wa" href="${waUrl(c.phone, '')}" target="_blank" rel="noopener">${ic('msg', 18)} WhatsApp</a>
      <a class="btn ghost" href="tel:${esc(c.phone)}">${ic('phone', 18)} Llamar</a>` : `<button class="btn ghost" data-act="editClient" data-id="${c.id}">Agregar teléfono</button>`}
    </div>
    <div class="kpis three">
      <div class="kpi"><span>Visitas</span><b>${os.length}</b></div>
      <div class="kpi"><span>Ha gastado</span><b>${money(spent)}</b></div>
      <div class="kpi"><span>Debe</span><b class="${owes ? 't-bad' : ''}">${money(owes)}</b></div>
    </div>
    ${c.notes ? `<p class="note">${esc(c.notes)}</p>` : ''}
    <h2 class="sec">Vehículos</h2>
    ${vs.map(vehicleCard).join('')}
    <button class="btn ghost wide" data-act="addVehicle" data-id="${c.id}">${ic('plus', 18)} Agregar otro vehículo</button>
    <button class="btn danger-ghost wide" data-act="deleteClient" data-id="${c.id}">${ic('trash', 18)} Eliminar cliente</button>
  </main>`;
}

function vOrder(id) {
  const o = order(id);
  if (!o) return notFound();
  const v = vehicle(o.vehicleId), c = v && client(v.clientId);
  const t = total(o), p = paid(o), b = balance(o), cost = costOf(o);
  const steps = ['taller', 'listo', 'entregado'], idx = steps.indexOf(o.status);
  let primary = '';
  if (o.status === 'taller') primary = `<button class="btn wa big" data-act="readyWa" data-id="${o.id}">${ic('msg', 20)} Listo · avisar por WhatsApp</button>
    <button class="btn ghost" data-act="setStatus" data-id="${o.id}" data-s="listo">Solo marcar como listo</button>`;
  else if (o.status === 'listo') primary = `<button class="btn primary big" data-act="deliver" data-id="${o.id}">${ic('check', 20)} Entregar vehículo</button>
    <button class="btn ghost" data-act="readyWa" data-id="${o.id}">Reenviar aviso de listo</button>`;
  else primary = `<button class="btn wa big" data-act="sendNote" data-id="${o.id}">${ic('msg', 20)} Enviar nota por WhatsApp</button>`;

  const next = nextFromOrder(o);
  return header(vehName(v), { back: '#/ordenes/' + (o.status === 'entregado' ? 'todas' : o.status), sub: `${esc(c?.name || '')} · ${fmtDate(o.date)}${o.km ? ` · ${num(o.km)} km` : ''}`,
    right: `<a class="icon-btn" href="#/orden/editar/${o.id}" aria-label="Editar orden">${ic('edit')}</a>` }) + `
  <main class="page">
    <ol class="steps">${steps.map((s, i) => `<li class="${i <= idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><span>${i < idx || o.status === 'entregado' ? ic('check', 14) : i + 1}</span>${STATUS[s][0]}</li>`).join('')}</ol>
    <div class="stack">${primary}</div>

    <section class="card">
      <h2 class="card-h">Servicios</h2>
      ${o.items.map(i => `<div class="li"><span>${esc(i.name)}</span><b>${money(i.price)}</b></div>`).join('')}
      <div class="li total"><span>Total</span><b>${money(t)}</b></div>
      <div class="li"><span>Pagado</span><b>${money(p)}</b></div>
      <div class="li"><span>Saldo</span><b class="${b > 0 ? 't-bad' : 't-ok'}">${money(b)}</b></div>
      ${cost > 0 ? `<div class="li sub"><span>Costo de refacciones</span><span>${money(cost)}</span></div><div class="li sub"><span>Utilidad estimada</span><b class="t-ok">${money(t - cost)}</b></div>` : ''}
      ${(o.payments || []).length ? `<div class="pays">${o.payments.map(x => `<div class="li sub"><span>${fmtDate(x.date)} · ${esc(x.method)}</span><span>${money(x.amount)}</span></div>`).join('')}</div>` : ''}
      ${b > 0 ? `<button class="btn ghost wide" data-act="payment" data-id="${o.id}">${ic('cash', 18)} Registrar pago</button>` : ''}
    </section>

    ${(o.recs || []).length ? `<section class="card">
      <h2 class="card-h">Trabajo recomendado</h2>
      ${o.recs.map(r => `<div class="rec">
        <div class="grow"><div>${esc(r.text)}</div><small class="muted">${money(r.price)}</small></div>
        ${r.status === 'pendiente' ? `<a class="btn small ghost" href="#/orden/nueva?v=${v.id}&rec=${r.id}">Aceptó</a><button class="btn small ghost" data-act="recStatus" data-id="${r.id}" data-s="rechazado">No</button>`
          : `<span class="pill ${r.status === 'aceptado' ? 'ok' : 'muted'}">${r.status === 'aceptado' ? 'Aceptado' : 'No quiso'}</span>`}
      </div>`).join('')}
    </section>` : ''}

    ${next.length ? `<section class="card">
      <h2 class="card-h">Próximo servicio</h2>
      ${next.map(n => `<div class="li"><span>${esc(n.name)}</span><span class="muted">${n.text}</span></div>`).join('')}
    </section>` : ''}

    ${o.notes ? `<section class="card"><h2 class="card-h">Notas</h2><p>${esc(o.notes)}</p></section>` : ''}

    <div class="stack">
      ${o.status !== 'entregado' ? `<button class="btn ghost" data-act="sendNote" data-id="${o.id}">${ic('msg', 18)} Enviar nota por WhatsApp</button>` : ''}
      <a class="btn ghost" href="#/cliente/${c?.id}">${ic('users', 18)} Ver cliente</a>
      <button class="btn danger-ghost" data-act="deleteOrder" data-id="${o.id}">${ic('trash', 18)} Eliminar orden</button>
    </div>
  </main>`;
}

function nextFromOrder(o) {
  const out = [];
  for (const i of o.items) {
    const s = i.serviceId && service(i.serviceId);
    if (!s || !(s.km > 0 || s.months > 0)) continue;
    const p = [];
    if (s.km > 0 && o.km > 0) p.push(`${num(o.km + s.km)} km`);
    if (s.months > 0) p.push(fmtDate(addMonths(o.date, s.months)));
    if (p.length) out.push({ name: s.name, text: p.join(' o ') });
  }
  return out;
}

/* ---------- Formulario de orden ---------- */

let draft = null;

function newDraft(q) {
  const d = { id: null, vehicleId: null, date: todayISO(), km: '', items: [], recs: [], pay: '', payMethod: 'Efectivo', notes: '', status: 'taller', newClient: null, fromRec: null };
  const v = q.get('v') && vehicle(q.get('v'));
  if (v) d.vehicleId = v.id;
  for (const sid of (q.get('svc') || '').split(',').filter(Boolean)) {
    const s = service(sid);
    if (s) d.items.push({ key: uid(), serviceId: s.id, name: s.name, price: s.price, cost: '' });
  }
  const recId = q.get('rec');
  if (recId) {
    for (const o of S.orders) for (const r of o.recs || []) if (r.id === recId) {
      d.items.push({ key: uid(), serviceId: null, name: r.text, price: r.price, cost: '' });
      d.fromRec = r.id;
    }
  }
  if (q.get('c') && client(q.get('c'))) d.newClient = { clientId: q.get('c') };
  return d;
}

function draftFromOrder(o) {
  return { id: o.id, vehicleId: o.vehicleId, date: o.date, km: o.km ?? '', items: o.items.map(i => ({ key: uid(), ...i, cost: i.cost || '' })),
    recs: (o.recs || []).map(r => ({ ...r })), notes: o.notes || '', status: o.status, pay: '', payMethod: 'Efectivo', newClient: null };
}

function pickRows(q) {
  const n = norm(q).trim();
  let vs = S.vehicles.filter(v => client(v.clientId));
  if (n) vs = vs.filter(v => { const c = client(v.clientId); return norm([c.name, c.phone, v.make, v.model, v.plate, v.year].join(' ')).includes(n); });
  else {
    const last = v => (ordersOfVehicle(v.id)[0] || {}).date || v.createdAt || '';
    vs = vs.sort((a, b) => last(b).localeCompare(last(a))).slice(0, 6);
  }
  const rows = vs.slice(0, 20).map(v => `<button type="button" class="pick" data-act="pickVeh" data-id="${v.id}">
    <div class="row-ic">${ic('car', 20)}</div>
    <div class="grow"><div class="row-title">${esc(vehName(v))}</div><div class="row-sub">${esc(client(v.clientId).name)}</div></div>
  </button>`).join('');
  const clientsNoMatch = n ? S.clients.filter(c => norm(c.name).includes(n)).slice(0, 5) : [];
  const addFor = clientsNoMatch.map(c => `<button type="button" class="pick ghosty" data-act="pickClientNewVeh" data-id="${c.id}">${ic('plus', 18)} Otro vehículo de ${esc(c.name)}</button>`).join('');
  return (rows || (n ? `<p class="muted pad">Nadie con “${esc(q)}”.</p>` : '')) + addFor;
}

function vehicleFields(prefix, v = {}) {
  return `<div class="grid2">
    <label class="field"><span>Marca</span><input ${prefix ? `data-draft="${prefix}.make"` : 'name="make"'} value="${esc(v.make)}" placeholder="Nissan" autocapitalize="words"></label>
    <label class="field"><span>Modelo</span><input ${prefix ? `data-draft="${prefix}.model"` : 'name="model"'} value="${esc(v.model)}" placeholder="Versa" autocapitalize="words"></label>
    <label class="field"><span>Año</span><input ${prefix ? `data-draft="${prefix}.year"` : 'name="year"'} value="${esc(v.year)}" inputmode="numeric" placeholder="2019"></label>
    <label class="field"><span>Placas</span><input ${prefix ? `data-draft="${prefix}.plate"` : 'name="plate"'} value="${esc(v.plate)}" placeholder="ABC-123-A" autocapitalize="characters"></label>
  </div>`;
}

function vOrderForm(editId, q) {
  const hash = location.hash;
  if (!draft || draft._hash !== hash) {
    if (editId && !order(editId)) return notFound();
    draft = editId ? draftFromOrder(order(editId)) : newDraft(q);
    draft._hash = hash;
  }
  const d = draft, v = d.vehicleId && vehicle(d.vehicleId);
  let vehHtml;
  if (v) {
    const c = client(v.clientId);
    vehHtml = `<div class="card sel"><div class="row-ic">${ic('car')}</div><div class="grow"><div class="row-title">${esc(vehName(v))}</div><div class="row-sub">${esc(c?.name)}</div></div>
      ${editId ? '' : `<button type="button" class="btn small ghost" data-act="pickClear">Cambiar</button>`}</div>`;
  } else if (d.newClient) {
    const nc = d.newClient, ex = nc.clientId && client(nc.clientId);
    vehHtml = `<div class="card stack">
      ${ex ? `<div class="row-title">${esc(ex.name)}</div>` : `
        <label class="field"><span>Nombre del cliente</span><input data-draft="newClient.name" value="${esc(nc.name)}" placeholder="Nombre y apellido" autocapitalize="words" autocomplete="off"></label>
        <label class="field"><span>WhatsApp</span><input data-draft="newClient.phone" value="${esc(nc.phone)}" inputmode="tel" placeholder="10 dígitos" autocomplete="off"></label>`}
      ${vehicleFields('newClient', nc)}
      <button type="button" class="btn small ghost" data-act="pickClear">Buscar cliente existente</button>
    </div>`;
  } else {
    vehHtml = `<label class="search">${ic('search', 20)}<input type="search" placeholder="Buscar cliente, placas o auto" data-live="pick" autocomplete="off"></label>
      <div id="pick-results" class="picks">${pickRows('')}</div>
      <button type="button" class="btn ghost wide" data-act="pickNew">${ic('plus', 18)} Cliente nuevo</button>`;
  }
  const lastKmO = v && ordersOfVehicle(v.id).find(o => o.km > 0 && o.id !== d.id);
  const sel = new Set(d.items.map(i => i.serviceId).filter(Boolean));

  return header(editId ? 'Editar orden' : 'Nuevo servicio', { back: editId ? '#/orden/' + editId : '#/', right: editId ? '' : `<button class="icon-btn" data-act="discardDraft" aria-label="Descartar">${ic('x')}</button>` }) + `
  <main class="page form">
    <section><h2 class="sec">1. Vehículo</h2>${vehHtml}</section>

    <section><h2 class="sec">2. Kilometraje y fecha</h2>
      <div class="grid2">
        <label class="field"><span>Km del tablero</span><input class="big-in" data-draft="km" value="${esc(d.km)}" inputmode="numeric" placeholder="${lastKmO ? num(estKm(v)) : 'Ej. 61200'}"></label>
        <label class="field"><span>Fecha</span><input type="date" data-draft="date" value="${esc(d.date)}" max="${todayISO()}"></label>
      </div>
      ${lastKmO ? `<p class="hint">Último registro: ${num(lastKmO.km)} km el ${fmtDate(lastKmO.date)}</p>` : '<p class="hint">Con el kilometraje la app calcula cuándo le toca el siguiente servicio.</p>'}
    </section>

    <section><h2 class="sec">3. ¿Qué se le hizo?</h2>
      <div class="chips">${S.services.map(s => `<button type="button" class="chip ${sel.has(s.id) ? 'on' : ''}" data-act="toggleSvc" data-id="${s.id}">${sel.has(s.id) ? ic('check', 16) : ''}${esc(s.name)}</button>`).join('')}</div>
      <div class="lines">${d.items.map((it, i) => `<div class="line">
        <div class="line-top">
          ${it.serviceId ? `<div class="line-name">${esc(it.name)}</div>` : `<input class="line-name-in" placeholder="Concepto (refacción o mano de obra)" value="${esc(it.name)}" data-draft="items.${i}.name">`}
          <button type="button" class="icon-btn sm" data-act="rmItem" data-i="${i}" aria-label="Quitar">${ic('x', 18)}</button>
        </div>
        <div class="line-nums">
          <label class="money-in"><span>Precio $</span><input type="number" inputmode="decimal" min="0" value="${esc(it.price)}" data-draft="items.${i}.price"></label>
          <label class="money-in soft"><span>Costo refacción $</span><input type="number" inputmode="decimal" min="0" value="${esc(it.cost)}" data-draft="items.${i}.cost" placeholder="0"></label>
        </div>
      </div>`).join('')}</div>
      <button type="button" class="btn ghost wide" data-act="addItem">${ic('plus', 18)} Otro concepto</button>
    </section>

    <section><h2 class="sec">4. Trabajo recomendado que no autorizó</h2>
      <p class="hint">Ej. “Balatas traseras al 20%”. La app le dará seguimiento por WhatsApp.</p>
      <div class="lines">${d.recs.map((r, i) => `<div class="line">
        <div class="line-top">
          <input class="line-name-in" placeholder="¿Qué le recomendaste?" value="${esc(r.text)}" data-draft="recs.${i}.text" ${r.status && r.status !== 'pendiente' ? 'disabled' : ''}>
          <button type="button" class="icon-btn sm" data-act="rmRec" data-i="${i}" aria-label="Quitar">${ic('x', 18)}</button>
        </div>
        <div class="line-nums"><label class="money-in"><span>Precio aprox. $</span><input type="number" inputmode="decimal" min="0" value="${esc(r.price)}" data-draft="recs.${i}.price"></label></div>
      </div>`).join('')}</div>
      <button type="button" class="btn ghost wide" data-act="addRec">${ic('plus', 18)} Agregar recomendación</button>
    </section>

    ${editId ? '' : `<section><h2 class="sec">5. Pago o anticipo</h2>
      <div class="grid2">
        <label class="field"><span>Monto recibido</span><input type="number" inputmode="decimal" min="0" data-draft="pay" value="${esc(d.pay)}" placeholder="0"></label>
        <label class="field"><span>Forma de pago</span><select data-draft="payMethod">${['Efectivo', 'Transferencia', 'Tarjeta'].map(m => `<option ${d.payMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      </div>
    </section>`}

    <section><h2 class="sec">${editId ? '5' : '6'}. Estado</h2>
      <div class="radios">${['taller', 'listo', 'entregado'].map(s => `<label class="radio"><input type="radio" name="status" value="${s}" data-draft="status" ${d.status === s ? 'checked' : ''}><span>${STATUS[s][0]}</span></label>`).join('')}</div>
      <p class="hint">Si estás capturando un servicio que ya pasó, elige “Entregado”.</p>
      <label class="field"><span>Notas (opcional)</span><textarea data-draft="notes" rows="2" placeholder="Ruido en suspensión, cliente pide factura…">${esc(d.notes)}</textarea></label>
    </section>
  </main>
  <div class="savebar">
    <div><small>Total</small><b id="form-total">${money(d.items.reduce((a, i) => a + (+i.price || 0), 0))}</b></div>
    <button class="btn primary big" data-act="saveOrder">${ic('check', 20)} Guardar</button>
  </div>`;
}

function saveOrder() {
  const d = draft;
  const nc = d.newClient;
  if (!d.vehicleId) {
    if (!nc) return toast('Elige el vehículo o registra un cliente nuevo');
    if (!nc.clientId && !String(nc.name || '').trim()) return toast('Escribe el nombre del cliente');
    if (!String([nc.make, nc.model, nc.plate].join('')).trim()) return toast('Escribe la marca, modelo o placas');
  }
  const items = d.items.filter(i => String(i.name || '').trim()).map(i => ({ serviceId: i.serviceId || null, name: String(i.name).trim(), price: +i.price || 0, cost: +i.cost || 0 }));
  if (!items.length) return toast('Marca al menos un servicio o concepto');
  if (!d.date) return toast('Falta la fecha');

  let vId = d.vehicleId;
  if (!vId) {
    let cId = nc.clientId;
    if (!cId) {
      cId = uid();
      S.clients.push({ id: cId, name: nc.name.trim(), phone: String(nc.phone || '').trim(), notes: '', createdAt: todayISO() });
    }
    vId = uid();
    S.vehicles.push({ id: vId, clientId: cId, make: (nc.make || '').trim(), model: (nc.model || '').trim(), year: (nc.year || '').trim(), plate: (nc.plate || '').trim().toUpperCase(), kmPerDay: null, createdAt: todayISO() });
  }
  const recs = d.recs.filter(r => String(r.text || '').trim()).map(r => ({ id: r.id || uid(), text: String(r.text).trim(), price: +r.price || 0, status: r.status || 'pendiente' }));
  const km = +String(d.km).replace(/\D/g, '') || null;

  let o;
  if (d.id) {
    o = order(d.id);
    Object.assign(o, { date: d.date, km, items, recs, notes: d.notes.trim(), status: d.status });
  } else {
    o = { id: uid(), vehicleId: vId, date: d.date, km, status: d.status, items, recs, payments: [], notes: d.notes.trim(), createdAt: Date.now() };
    if (+d.pay > 0) o.payments.push({ id: uid(), date: todayISO(), amount: +d.pay, method: d.payMethod });
    S.orders.push(o);
  }
  if (o.status === 'entregado' && !o.deliveredAt) o.deliveredAt = d.date;
  if (o.status !== 'entregado') delete o.deliveredAt;
  if (d.fromRec) {
    for (const x of S.orders) for (const r of x.recs || []) if (r.id === d.fromRec) { r.status = 'aceptado'; r.orderId = o.id; }
  }
  save();
  draft = null;
  toast(d.id ? 'Orden actualizada' : 'Servicio guardado · recordatorio programado');
  go('#/orden/' + o.id);
}

/* ---------- Ajustes ---------- */

function vSettings() {
  const st = S.settings;
  return header('Ajustes', { back: '#/' }) + `
  <main class="page">
    <section class="card stack">
      <h2 class="card-h">Tu taller</h2>
      <label class="field"><span>Nombre</span><input data-setting="shopName" value="${esc(st.shopName)}"></label>
      <label class="field"><span>WhatsApp / teléfono</span><input data-setting="phone" value="${esc(st.phone)}" inputmode="tel"></label>
      <label class="field"><span>Dirección</span><input data-setting="address" value="${esc(st.address)}"></label>
    </section>

    <section class="card stack">
      <h2 class="card-h">Avisos</h2>
      <label class="field"><span>Avisar con cuántos días de anticipación</span><input type="number" min="0" max="60" data-setting="leadDays" value="${esc(st.leadDays)}" inputmode="numeric"></label>
      <label class="field"><span>Considerar inactivo después de (meses)</span><input type="number" min="1" max="36" data-setting="inactiveMonths" value="${esc(st.inactiveMonths)}" inputmode="numeric"></label>
      <label class="field"><span>Km por día promedio (cuando no hay historial)</span><input type="number" min="5" max="300" data-setting="kmPerDay" value="${esc(st.kmPerDay)}" inputmode="numeric"></label>
      <p class="hint">Con dos visitas o más, la app calcula cuánto maneja cada cliente y ajusta sus recordatorios.</p>
    </section>

    <section class="card">
      <h2 class="card-h">Servicios, intervalos y precios</h2>
      ${S.services.map(s => `<button class="list-row" data-act="editService" data-id="${s.id}"><span class="grow"><b>${esc(s.name)}</b><small>${intervalText(s)}</small></span><span>${money(s.price)}</span>${ic('chev', 18)}</button>`).join('')}
      <button class="btn ghost wide" data-act="editService">${ic('plus', 18)} Agregar servicio</button>
    </section>

    <section class="card stack">
      <h2 class="card-h">Mensajes de WhatsApp</h2>
      <p class="hint">Puedes usar: {cliente} {vehiculo} {taller} {servicios} {trabajo} {total} {saldo} {fecha} {telefono}</p>
      ${Object.keys(DEFAULT_MSGS).map(k => `<label class="field"><span>${MSG_LABELS[k]}</span><textarea rows="4" data-setting="msgs.${k}">${esc(st.msgs[k])}</textarea></label>`).join('')}
      <button class="btn ghost" data-act="resetMsgs">Restaurar mensajes originales</button>
    </section>

    <section class="card stack">
      <h2 class="card-h">Respaldo</h2>
      <p class="hint">Tus datos viven en este teléfono. Descarga un respaldo cada semana y guárdalo en tu correo o Drive.</p>
      <button class="btn primary" data-act="exportData">${ic('download', 18)} Descargar respaldo</button>
      <label class="btn ghost">${ic('upload', 18)} Restaurar respaldo<input type="file" accept="application/json,.json" data-file="import" hidden></label>
    </section>

    <section class="card stack">
      <h2 class="card-h">Datos</h2>
      <button class="btn ghost" data-act="loadDemo">Cargar datos de ejemplo</button>
      <button class="btn danger-ghost" data-act="wipe">${ic('trash', 18)} Borrar todos los datos</button>
    </section>
    <p class="muted center small">Taller al Día · v1.0</p>
  </main>`;
}

function notFound() {
  return header('No encontrado', { back: '#/' }) + `<main class="page">${empty('search', 'No existe', 'Puede que se haya eliminado.', '<a class="btn primary" href="#/">Ir al inicio</a>')}</main>`;
}

/* ================= Hojas (bottom sheets) ================= */

function sheet(html) {
  closeSheet();
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
}
function closeSheet() { document.querySelectorAll('.sheet-wrap').forEach(e => e.remove()); }

function paymentSheet(id, deliver = false) {
  const o = order(id), b = balance(o);
  sheet(`<h2>${deliver ? 'Entregar vehículo' : 'Registrar pago'}</h2>
    <p class="muted">Saldo pendiente: <b class="t-bad">${money(b)}</b> de ${money(total(o))}</p>
    <form data-form="payment" data-id="${o.id}" data-deliver="${deliver ? 1 : ''}" class="stack">
      <label class="field"><span>Monto</span><input class="big-in" name="amount" type="number" inputmode="decimal" min="0" step="any" value="${b || ''}"></label>
      <div class="radios">${['Efectivo', 'Transferencia', 'Tarjeta'].map((m, i) => `<label class="radio"><input type="radio" name="method" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>
      <button class="btn primary big" type="submit">${ic('check', 20)} ${deliver ? 'Cobrar y entregar' : 'Guardar pago'}</button>
      ${deliver ? `<button class="btn ghost" type="button" data-act="deliverNoPay" data-id="${o.id}">Entregar sin cobrar (queda a deber)</button>` : ''}
    </form>`);
}

function clientSheet(c) {
  sheet(`<h2>${c ? 'Editar cliente' : 'Nuevo cliente'}</h2>
    <form data-form="client" data-id="${c?.id || ''}" class="stack">
      <label class="field"><span>Nombre</span><input name="name" required value="${esc(c?.name)}" autocapitalize="words" autocomplete="off"></label>
      <label class="field"><span>WhatsApp</span><input name="phone" value="${esc(c?.phone)}" inputmode="tel" placeholder="10 dígitos" autocomplete="off"></label>
      ${c ? `<label class="field"><span>Notas</span><textarea name="notes" rows="2" placeholder="Prefiere que le llamen, factura a nombre de…">${esc(c.notes)}</textarea></label>` : `<h3 class="sub-h">Vehículo</h3>${vehicleFields('')}`}
      <button class="btn primary big" type="submit">Guardar</button>
    </form>`);
}

function vehicleSheet(v, clientId) {
  sheet(`<h2>${v ? 'Editar vehículo' : 'Agregar vehículo'}</h2>
    <form data-form="vehicle" data-id="${v?.id || ''}" data-client="${clientId || ''}" class="stack">
      ${vehicleFields('', v || {})}
      ${v ? `<label class="field"><span>Km por día (vacío = calcular solo)</span><input name="kmPerDay" type="number" min="0" inputmode="numeric" value="${esc(v.kmPerDay || '')}" placeholder="${num(kmPerDay(v))}"></label>` : ''}
      <button class="btn primary big" type="submit">Guardar</button>
      ${v ? `<button class="btn danger-ghost" type="button" data-act="deleteVehicle" data-id="${v.id}">${ic('trash', 18)} Eliminar vehículo</button>` : ''}
    </form>`);
}

function serviceSheet(s) {
  sheet(`<h2>${s ? 'Editar servicio' : 'Nuevo servicio'}</h2>
    <form data-form="service" data-id="${s?.id || ''}" class="stack">
      <label class="field"><span>Nombre</span><input name="name" required value="${esc(s?.name)}"></label>
      <div class="grid2">
        <label class="field"><span>Cada (km)</span><input name="km" type="number" min="0" inputmode="numeric" value="${esc(s?.km ?? '')}" placeholder="0 = no aplica"></label>
        <label class="field"><span>Cada (meses)</span><input name="months" type="number" min="0" inputmode="numeric" value="${esc(s?.months ?? '')}" placeholder="0 = no aplica"></label>
      </div>
      <label class="field"><span>Precio de lista</span><input name="price" type="number" min="0" inputmode="decimal" value="${esc(s?.price ?? '')}"></label>
      <p class="hint">Se avisa con lo que llegue primero: los km o los meses. Deja ambos en 0 si no quieres recordatorio.</p>
      <button class="btn primary big" type="submit">Guardar</button>
      ${s ? `<button class="btn danger-ghost" type="button" data-act="deleteService" data-id="${s.id}">${ic('trash', 18)} Quitar del catálogo</button>` : ''}
    </form>`);
}

function snoozeSheet(key) {
  const it = findItem(key);
  const opts = [[1, 'Mañana'], [3, 'En 3 días'], [7, 'En una semana'], [30, 'En un mes']];
  sheet(`<h2>Posponer aviso</h2>
    <p class="muted">${it ? esc(it.c.name) : ''}</p>
    <div class="stack">
      ${opts.map(([n, l]) => `<button class="btn ghost" data-act="snooze" data-key="${key}" data-days="${n}">${l}</button>`).join('')}
      <button class="btn danger-ghost" data-act="snooze" data-key="${key}" data-days="3650">No volver a avisar</button>
      ${isSnoozed(key) ? `<button class="btn ghost" data-act="snooze" data-key="${key}" data-days="0">Mostrar de nuevo hoy</button>` : ''}
    </div>`);
}

/* ================= Acciones ================= */

const SNOOZE_AFTER_SEND = { svc: 5, rec: 5, debt: 7, inact: 30 };

function openWa(phone, text) {
  const w = window.open(waUrl(phone, text), '_blank', 'noopener');
  if (!w) location.href = waUrl(phone, text);
}

function noteText(o) {
  const v = vehicle(o.vehicleId), st = S.settings;
  const lines = [`*${st.shopName}* — Nota de servicio`, `Fecha: ${fmtDate(o.date)}`, `Vehículo: ${vehName(v)}`];
  if (o.km) lines.push(`Kilometraje: ${num(o.km)} km`);
  lines.push('', ...o.items.map(i => `• ${i.name} — ${money(i.price)}`), '', `Total: ${money(total(o))}`, `Pagado: ${money(paid(o))}`);
  if (balance(o) > 0) lines.push(`Saldo pendiente: ${money(balance(o))}`);
  const next = nextFromOrder(o);
  if (next.length) lines.push('', '*Próximo servicio:*', ...next.map(n => `• ${n.name}: ${n.text}`));
  const pend = (o.recs || []).filter(r => r.status === 'pendiente');
  if (pend.length) lines.push('', '*Le recomendamos:*', ...pend.map(r => `• ${r.text} — ${money(r.price)}`));
  lines.push('', '¡Gracias por su preferencia!');
  if (st.address) lines.push(st.address);
  return lines.join('\n');
}

const actions = {
  closeSheet,
  loadDemo() {
    if (S.clients.length && !confirm('Esto reemplaza tus datos actuales con datos de ejemplo. ¿Continuar?')) return;
    S = buildDemo(); save(); closeSheet(); go('#/'); render(); toast('Datos de ejemplo cargados');
  },
  send(el) {
    const it = findItem(el.dataset.key);
    if (!it) return;
    openWa(it.c.phone, messageFor(it));
    S.contacts.push({ key: it.key, type: it.type, date: todayISO(), vehicleId: it.v?.id || null, clientId: it.c.id });
    const days = SNOOZE_AFTER_SEND[it.type];
    S.snooze[it.key] = addDays(todayISO(), days);
    save(); render();
    toast(`Avisado. Si no responde, vuelve a aparecer en ${days} días.`);
  },
  snoozeMenu(el) { snoozeSheet(el.dataset.key); },
  snooze(el) {
    const n = +el.dataset.days;
    if (n) S.snooze[el.dataset.key] = addDays(todayISO(), n); else delete S.snooze[el.dataset.key];
    save(); closeSheet(); render();
    toast(n ? (n > 1000 ? 'Ya no se avisará' : 'Pospuesto') : 'Listo');
  },
  recStatus(el) {
    for (const o of S.orders) for (const r of o.recs || []) if (r.id === el.dataset.id) r.status = el.dataset.s;
    save(); render(); toast('Cotización cerrada');
  },
  payment(el) { paymentSheet(el.dataset.id); },
  readyWa(el) {
    const o = order(el.dataset.id), v = vehicle(o.vehicleId), c = client(v.clientId);
    o.status = 'listo'; o.readyAt = todayISO();
    save();
    openWa(c.phone, fill(S.settings.msgs.ready, { cliente: firstName(c.name), vehiculo: vehShort(v), taller: S.settings.shopName, total: money(total(o)), saldo: money(balance(o)), telefono: S.settings.phone }));
    render();
  },
  setStatus(el) { const o = order(el.dataset.id); o.status = el.dataset.s; if (o.status === 'listo') o.readyAt = todayISO(); save(); render(); },
  deliver(el) {
    const o = order(el.dataset.id);
    if (balance(o) > 0) return paymentSheet(o.id, true);
    o.status = 'entregado'; o.deliveredAt = todayISO(); save(); render(); toast('Entregado');
  },
  deliverNoPay(el) {
    const o = order(el.dataset.id);
    o.status = 'entregado'; o.deliveredAt = todayISO(); save(); closeSheet(); render();
    toast(`Entregado con saldo de ${money(balance(o))}. Quedó en Cobranza.`);
  },
  sendNote(el) {
    const o = order(el.dataset.id), c = client(vehicle(o.vehicleId).clientId);
    openWa(c.phone, noteText(o));
  },
  deleteOrder(el) {
    if (!confirm('¿Eliminar esta orden? No se puede deshacer.')) return;
    S.orders = S.orders.filter(o => o.id !== el.dataset.id); save(); toast('Orden eliminada'); go('#/ordenes');
  },
  // Formulario de orden
  toggleSvc(el) {
    const i = draft.items.findIndex(x => x.serviceId === el.dataset.id);
    if (i >= 0) draft.items.splice(i, 1);
    else { const s = service(el.dataset.id); draft.items.push({ key: uid(), serviceId: s.id, name: s.name, price: s.price, cost: '' }); }
    render();
  },
  addItem() { draft.items.push({ key: uid(), serviceId: null, name: '', price: '', cost: '' }); render(); focusLast('.line-name-in'); },
  rmItem(el) { draft.items.splice(+el.dataset.i, 1); render(); },
  addRec() { draft.recs.push({ id: uid(), text: '', price: '', status: 'pendiente' }); render(); focusLast('[data-draft^="recs."][data-draft$=".text"]'); },
  rmRec(el) { draft.recs.splice(+el.dataset.i, 1); render(); },
  pickVeh(el) { draft.vehicleId = el.dataset.id; draft.newClient = null; render(); },
  pickClientNewVeh(el) { draft.newClient = { clientId: el.dataset.id }; render(); },
  pickNew() { draft.newClient = { name: '', phone: '' }; render(); $('[data-draft="newClient.name"]')?.focus(); },
  pickClear() { draft.vehicleId = null; draft.newClient = null; render(); },
  saveOrder,
  discardDraft() {
    if ((draft.items.length || draft.newClient) && !confirm('¿Descartar este servicio?')) return;
    draft = null; go('#/');
  },
  // Clientes y vehículos
  newClient() { clientSheet(null); },
  editClient(el) { clientSheet(client(el.dataset.id)); },
  addVehicle(el) { vehicleSheet(null, el.dataset.id); },
  editVehicle(el) { vehicleSheet(vehicle(el.dataset.id)); },
  deleteVehicle(el) {
    const v = vehicle(el.dataset.id);
    if (!confirm(`¿Eliminar ${vehShort(v)} y todo su historial?`)) return;
    S.orders = S.orders.filter(o => o.vehicleId !== v.id);
    S.vehicles = S.vehicles.filter(x => x.id !== v.id);
    save(); closeSheet(); render(); toast('Vehículo eliminado');
  },
  deleteClient(el) {
    const c = client(el.dataset.id);
    if (!confirm(`¿Eliminar a ${c.name} con sus vehículos y su historial?`)) return;
    const vids = new Set(vehiclesOf(c.id).map(v => v.id));
    S.orders = S.orders.filter(o => !vids.has(o.vehicleId));
    S.vehicles = S.vehicles.filter(v => !vids.has(v.id));
    S.clients = S.clients.filter(x => x.id !== c.id);
    save(); toast('Cliente eliminado'); go('#/clientes');
  },
  // Ajustes
  editService(el) { serviceSheet(el.dataset.id ? service(el.dataset.id) : null); },
  deleteService(el) {
    if (!confirm('¿Quitar este servicio del catálogo? El historial se conserva, pero ya no habrá recordatorios de él.')) return;
    S.services = S.services.filter(s => s.id !== el.dataset.id); save(); closeSheet(); render();
  },
  resetMsgs() { if (!confirm('¿Restaurar los mensajes originales?')) return; S.settings.msgs = { ...DEFAULT_MSGS }; save(); render(); toast('Mensajes restaurados'); },
  async exportData() {
    const name = `taller-al-dia-respaldo-${todayISO()}.json`;
    const file = new File([JSON.stringify(S, null, 2)], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Respaldo Taller al Día' }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  wipe() {
    if (!confirm('¿Borrar TODOS los datos de este teléfono? Descarga un respaldo antes.')) return;
    if (prompt('Escribe BORRAR para confirmar') !== 'BORRAR') return;
    S = migrate({}); save(); go('#/'); render();
  }
};

function focusLast(sel) { const els = document.querySelectorAll(sel); els[els.length - 1]?.focus(); }

const forms = {
  welcome(f) {
    S.settings.shopName = f.shopName.trim() || 'Mi Taller';
    S.settings.phone = f.phone.trim();
    S.settings.onboarded = true;
    save(); go('#/'); render();
  },
  payment(f, ds) {
    const o = order(ds.id), amt = +f.amount || 0;
    if (amt > 0) o.payments.push({ id: uid(), date: todayISO(), amount: amt, method: f.method || 'Efectivo' });
    if (ds.deliver) { o.status = 'entregado'; o.deliveredAt = todayISO(); }
    save(); closeSheet(); render();
    const b = balance(o);
    toast(b > 0 ? `Pago guardado. Queda a deber ${money(b)}.` : ds.deliver ? 'Pagado y entregado' : 'Pagado completo');
  },
  client(f, ds) {
    if (ds.id) {
      Object.assign(client(ds.id), { name: f.name.trim(), phone: f.phone.trim(), notes: (f.notes || '').trim() });
      save(); closeSheet(); render(); return;
    }
    const c = { id: uid(), name: f.name.trim(), phone: f.phone.trim(), notes: '', createdAt: todayISO() };
    S.clients.push(c);
    if ([f.make, f.model, f.plate].join('').trim()) S.vehicles.push({ id: uid(), clientId: c.id, make: f.make.trim(), model: f.model.trim(), year: f.year.trim(), plate: f.plate.trim().toUpperCase(), kmPerDay: null, createdAt: todayISO() });
    save(); closeSheet(); go('#/cliente/' + c.id);
  },
  vehicle(f, ds) {
    const data = { make: f.make.trim(), model: f.model.trim(), year: f.year.trim(), plate: f.plate.trim().toUpperCase() };
    if (ds.id) Object.assign(vehicle(ds.id), data, { kmPerDay: +f.kmPerDay > 0 ? +f.kmPerDay : null });
    else S.vehicles.push({ id: uid(), clientId: ds.client, ...data, kmPerDay: null, createdAt: todayISO() });
    save(); closeSheet(); render();
  },
  service(f, ds) {
    const data = { name: f.name.trim(), km: +f.km || 0, months: +f.months || 0, price: +f.price || 0 };
    if (ds.id) Object.assign(service(ds.id), data);
    else S.services.push({ id: uid(), ...data });
    save(); closeSheet(); render(); toast('Servicio guardado');
  }
};

/* ================= Datos de ejemplo ================= */

function buildDemo() {
  const s = migrate({});
  s.settings.shopName = S.settings.onboarded && S.settings.shopName !== 'Mi Taller' ? S.settings.shopName : 'Taller Mecánico Demo';
  s.settings.phone = S.settings.phone;
  s.settings.onboarded = true;
  const t = todayISO(), ago = n => addDays(t, -n);
  const svc = id => s.services.find(x => x.id === id);
  const COSTS = { aceite: 480, balatas: 620, afinacion: 850, anticongelante: 280, liqfrenos: 180, transmision: 900 };
  const sum = items => items.reduce((a, i) => a + i.price, 0);
  let n = 0;
  const add = (name, phone, car, orders) => {
    const first = orders.length ? Math.max(...orders.map(o => o[0])) : 0;
    const c = { id: uid() + n++, name, phone, notes: '', createdAt: ago(first) };
    const v = { id: uid() + n++, clientId: c.id, make: car[0], model: car[1], year: car[2], plate: car[3], kmPerDay: null, createdAt: ago(first) };
    s.clients.push(c); s.vehicles.push(v);
    for (const [days, km, ids, opt = {}] of orders) {
      const items = ids.map(x => typeof x === 'string'
        ? { serviceId: x, name: svc(x).name, price: svc(x).price, cost: COSTS[x] || 0 }
        : { serviceId: null, name: x[0], price: x[1], cost: x[2] || 0 });
      const o = { id: uid() + n++, vehicleId: v.id, date: ago(days), km, status: opt.status || 'entregado', items,
        recs: (opt.recs || []).map(([text, price]) => ({ id: uid() + n++, text, price, status: 'pendiente' })),
        payments: [], notes: opt.notes || '', createdAt: Date.now() - days * DAY };
      const pay = opt.paid ?? sum(items);
      if (pay > 0) o.payments.push({ id: uid() + n++, date: o.date, amount: pay, method: 'Efectivo' });
      if (o.status === 'entregado') o.deliveredAt = o.date;
      if (o.status === 'listo') o.readyAt = o.date;
      s.orders.push(o);
    }
    return { c, v };
  };
  const contact = (type, key, x, days) => s.contacts.push({ key, type, date: ago(days), vehicleId: x.v.id, clientId: x.c.id });

  add('Roberto Garza', '8445550101', ['Nissan', 'Versa', '2019', 'FRT-219-A'], [[270, 52000, ['aceite', 'rotacion']], [140, 57100, ['aceite', 'frenos']]]);
  add('María Fernanda López', '8445550102', ['Chevrolet', 'Aveo', '2017', 'GHK-552-B'], [[115, 88400, ['aceite', 'afinacion'], { recs: [['Balatas delanteras al 20%', 1400]] }]]);
  add('Jorge Treviño', '8445550103', ['Toyota', 'Hilux', '2020', 'XRA-882-C'], [[30, 120300, ['aceite', 'alineacion', 'rotacion'], { paid: 550 }]]);
  add('Lucía Ramírez', '8445550104', ['Volkswagen', 'Jetta', '2016', 'LMN-410-D'], [[230, 140000, ['diagnostico', ['Cambio de bomba de agua', 2300, 1150]]]]);
  add('Ana Sofía Cantú', '8445550105', ['Honda', 'CR-V', '2021', 'PQR-301-E'], [[0, 45200, ['aceite', 'frenos'], { status: 'taller', paid: 0, notes: 'Revisar ruido en suspensión delantera' }]]);
  add('Héctor Villarreal', '8445550106', ['Nissan', 'NP300', '2018', 'STU-774-F'], [[1, 160500, ['balatas', 'liqfrenos'], { status: 'listo', paid: 1000 }]]);
  add('Daniela Morales', '8445550107', ['Kia', 'Rio', '2022', 'VWX-118-G'], [[40, 22000, ['aceite'], { recs: [['Cambio de llantas traseras', 4800]] }]]);
  const carlos = add('Carlos Esquivel', '8445550108', ['Mazda', '3', '2018', 'YZA-635-H'], [[400, 70000, ['afinacion', 'anticongelante']], [125, 79500, ['aceite', 'ac']]]);
  const gerardo = add('Gerardo Salinas', '8445550109', ['Chevrolet', 'Spark', '2019', 'BCD-927-J'], [[140, 40000, ['aceite']], [6, 44800, ['aceite', 'rotacion']]]);
  add('Patricia Elizondo', '8445550110', ['Toyota', 'Corolla', '2020', 'EFG-246-K'], [[20, 35000, ['aceite', 'rotacion']]]);
  add('Luis Alberto Peña', '8445550111', ['Volkswagen', 'Vento', '2019', 'HIJ-583-L'], [[300, 60000, ['afinacion']], [100, 68000, ['aceite']]]);

  contact('svc', 'svc:' + carlos.v.id, carlos, 2);
  s.snooze['svc:' + carlos.v.id] = addDays(t, 3);
  contact('svc', 'svc:' + gerardo.v.id, gerardo, 12);
  return s;
}

/* ================= Router y eventos ================= */

const app = $('#app');
const NAV = [['', 'home', 'Inicio'], ['avisos', 'bell', 'Avisos'], ['nueva', 'plus', ''], ['ordenes', 'clipboard', 'Órdenes'], ['clientes', 'users', 'Clientes']];

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function parseHash() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}

function render() {
  const { parts, q } = parseHash();
  let view, tab = parts[0] || '';
  if (!S.settings.onboarded) { view = vWelcome(); tab = null; }
  else switch (parts[0]) {
    case undefined: view = vHome(); break;
    case 'avisos': view = vAvisos(parts[1] || 'svc'); break;
    case 'ordenes': view = vOrders(parts[1] || 'taller'); break;
    case 'clientes': view = vClients(); break;
    case 'cliente': view = vClient(parts[1]); tab = 'clientes'; break;
    case 'orden':
      if (parts[1] === 'nueva') { view = vOrderForm(null, q); tab = null; }
      else if (parts[1] === 'editar') { view = vOrderForm(parts[2], q); tab = null; }
      else { view = vOrder(parts[1]); tab = 'ordenes'; }
      break;
    case 'ajustes': view = vSettings(); tab = ''; break;
    default: view = vHome();
  }
  app.innerHTML = view;
  renderNav(tab);
}

function renderNav(tab) {
  const nav = $('#tabbar');
  nav.hidden = tab === null;
  document.body.classList.toggle('no-nav', tab === null);
  if (tab === null) return;
  const P = pendientes();
  const n = allItems(P).filter(x => !x.snoozed).length;
  nav.innerHTML = NAV.map(([k, i, l]) => k === 'nueva'
    ? `<a href="#/orden/nueva" class="fab" aria-label="Nuevo servicio">${ic(i, 28)}</a>`
    : `<a href="#/${k}" class="${tab === k ? 'on' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${ic(i, 24)}<span>${l}</span>${k === 'avisos' && n ? `<b class="badge">${n > 99 ? '99+' : n}</b>` : ''}</a>`).join('');
}

window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

function onDraftInput(e) {
  const el = e.target;
  if (el.dataset.draft && draft) {
    setPath(draft, el.dataset.draft, el.value);
    if (/^items\.\d+\.price$/.test(el.dataset.draft)) {
      const t = $('#form-total');
      if (t) t.textContent = money(draft.items.reduce((a, i) => a + (+i.price || 0), 0));
    }
  }
}

document.addEventListener('input', e => {
  const el = e.target;
  onDraftInput(e);
  if (el.dataset.live === 'clients') $('#list').innerHTML = clientRows(el.value);
  if (el.dataset.live === 'pick') $('#pick-results').innerHTML = pickRows(el.value);
});

document.addEventListener('change', e => {
  const el = e.target;
  onDraftInput(e);
  if (el.dataset.setting) {
    const val = el.type === 'number' ? (+el.value || 0) : el.value;
    setPath(S.settings, el.dataset.setting, val);
    save(); toast('Guardado');
  }
  if (el.dataset.file === 'import' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!Array.isArray(data.clients) || !Array.isArray(data.orders)) throw new Error('formato');
        if (!confirm(`Restaurar respaldo con ${data.clients.length} clientes y ${data.orders.length} órdenes? Reemplaza lo actual.`)) return;
        S = migrate(data); S.settings.onboarded = true; save(); go('#/'); toast('Respaldo restaurado');
      } catch (err) { toast('Ese archivo no es un respaldo válido'); }
    };
    r.readAsText(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('submit', e => {
  const f = e.target, h = forms[f.dataset.form];
  if (!h) return;
  e.preventDefault();
  h(Object.fromEntries(new FormData(f)), f.dataset);
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2800);
}

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});
