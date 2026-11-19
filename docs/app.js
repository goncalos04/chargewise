import { components, estimateMinutes, quote, fuelCost, assessCharge } from './finance.js';
import { blankTariff, defaults, load, save, toCSV, fromCSV, validate } from './data.js';

const $ = id => document.getElementById(id);
const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const decimal = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 });
const money = value => euro.format(value);
const fmt = value => decimal.format(value);
const labels = { energy: 'Energia', time: 'Tempo / OPC', session: 'Sessão' };
const units = { energy: '€/kWh', time: '€/min', session: '€' };
const safe = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const checked = value => value ? 'checked' : '';
const form = $('simulation');
const editForm = $('edit-form');
const editor = $('editor');
const results = $('results');
let data;
let editAction;
let currentLogOptions = [];
let installPrompt;

function status(message) {
  $('status').textContent = message;
  $('status').hidden = !message;
}
try { data = load(); }
catch { data = defaults(); status('Não foi possível ler os dados locais. Podes recuperar uma cópia de segurança nas definições.'); }

function persist(next) {
  try {
    save(validate(next));
    data = next;
    return true;
  } catch (error) {
    status('Não foi possível guardar. ' + error.message);
    return false;
  }
}

function numberField(name, label, value, min = 0, max = 1000000) {
  return `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="any" value="${value}" required></label>`;
}

function checkField(name, label, value) {
  return `<label class="check"><input name="${name}" type="checkbox" ${checked(value)}> ${label}</label>`;
}

function openEditor(title, fields, action) {
  $('fields').innerHTML = `<h2 id="edit-title">${title}</h2>${fields}<p id="edit-error" role="alert"></p>`;
  editor.setAttribute('aria-labelledby', 'edit-title');
  editAction = action;
  editor.showModal();
}

editForm.addEventListener('submit', event => {
  event.preventDefault();
  if (editAction(new FormData(editForm))) {
    editor.close();
    render();
  } else {
    $('edit-error').textContent = 'Verifica os valores e o espaço disponível no dispositivo.';
  }
});
$('cancel').onclick = () => editor.close();

function editTariff(existing) {
  const t = existing ?? blankTariff();
  openEditor(existing ? 'Editar tarifário' : 'Novo tarifário', `
    <label>Nome do operador<input name="name" maxlength="200" value="${safe(t.name)}" required></label>
    <div class="grid">${numberField('vat', 'IVA (%)', t.vat, 0, 100)}
    ${numberField('discount', 'Desconto (%)', t.discount, 0, 100)}
    ${numberField('credit', 'Crédito disponível (€)', t.credit)}</div>
    ${components.map(key => `<fieldset><legend>${labels[key]}</legend>
      ${numberField(key, 'Preço (' + units[key] + ')', t[key].rate)}
      <div class="actions">${checkField(key + 'Vat', 'IVA incluído', t[key].vatIncluded)}
      ${checkField(key + 'Discount', 'Aplicar desconto', t[key].discount)}
      ${checkField(key + 'Credit', 'Aceita crédito', t[key].credit)}</div>
    </fieldset>`).join('')}`,
  values => {
    const tariff = { ...t, name: values.get('name').trim(), vat: +values.get('vat'),
      discount: +values.get('discount'), credit: +values.get('credit') };
    for (const key of components) {
      tariff[key] = { rate: +values.get(key), vatIncluded: values.has(key + 'Vat'),
        discount: values.has(key + 'Discount'), credit: values.has(key + 'Credit') };
    }
    const tariffs = existing ? data.tariffs.map(row => row.id === t.id ? tariff : row) : [...data.tariffs, tariff];
    return persist({ ...data, tariffs });
  });
}

function editVehicle(vehicle) {
  openEditor('Editar veículo', `<p>${safe(vehicle.name)}</p><div class="grid">
    ${numberField('ac', 'Potência máxima AC (kW)', vehicle.ac)}
    ${numberField('dc', 'Potência máxima DC (kW)', vehicle.dc)}
    ${numberField('consumption', 'Energia da rede (kWh/100 km)', vehicle.consumption, 0.01)}
    ${vehicle.id === 'niro' ? numberField('fuelPrice', 'Gasolina (€/l)', vehicle.fuelPrice) +
      numberField('fuelConsumption', 'Consumo (l/100 km)', vehicle.fuelConsumption) : ''}
    </div><p class="muted">Usa 0 kW para ligações indisponíveis e um consumo elétrico que inclua as perdas de carregamento.</p>`, values => {
    const updated = { ...vehicle };
    for (const [key, value] of values) updated[key] = +value;
    return persist({ ...data, vehicles: data.vehicles.map(v => v.id === vehicle.id ? updated : v) });
  });
}

function writeSimulation() {
  for (const [key, value] of Object.entries(data.simulation)) {
    const input = form.elements.namedItem(key);
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value ?? '';
  }
}

function renderSimulation() {
  const s = { ...data.simulation };
  const vehicle = data.vehicles.find(v => v.id === s.vehicle);
  const estimate = estimateMinutes(s.kWh, vehicle[s.charging], s.power);
  const minutes = s.auto ? estimate : s.minutes;
  form.elements.minutes.disabled = s.auto;
  if (s.auto) form.elements.minutes.value = estimate ?? '';
  const budget = $('budget');
  budget.hidden = vehicle.id === 'niro';
  form.elements.target.disabled = budget.hidden;
  const valid = Array.from(form.elements).filter(input => input.willValidate).every(input => input.validity.valid);
  $('duration-note').textContent = estimate === null
    ? 'Estimativa indisponível com esta ligação ou potência.'
    : `A ${fmt(Math.min(vehicle[s.charging], s.power))} kW, a duração mínima estimada é ${estimate} min.` +
      (minutes < estimate && !s.auto ? ' A duração manual é inferior a este valor.' : '');
  const fuel = vehicle.id === 'niro' ? fuelCost(vehicle.fuelPrice, vehicle.fuelConsumption) : null;
  currentLogOptions = [];
  const decision = $('decision');
  decision.className = 'panel verdict';
  if (!valid || minutes === null) {
    decision.textContent = 'Preenche valores válidos ou introduz a duração manualmente.';
    results.replaceChildren();
    return;
  }
  const ranked = data.tariffs.map(t => ({ t, q: quote(t, s.kWh, minutes, vehicle.consumption, s.credit) }))
    .sort((a, b) => a.q.total - b.q.total);
  currentLogOptions = ranked.map(({ t, q }) => ({
    name: t.name, vehicle: vehicle.name, kWh: s.kWh, minutes, total: q.total
  }));
  const selectedIndex = ranked.findIndex(({ t }) => t.id === form.elements.tariff.value);
  if (selectedIndex === -1) {
    decision.textContent = 'Cria um tarifário para avaliar este carregamento.';
  } else {
    const { t, q } = ranked[selectedIndex];
    const target = s.target ?? null;
    const assessment = assessCharge(q, s.kWh, vehicle.consumption, fuel ?? target, fuel === null ? 'perKWh' : 'per100');
    const difference = assessment?.difference;
    const verdict = difference === undefined ? 'Define o teu limite' : difference > 0 ? 'Compensa carregar'
      : difference < 0 ? 'Não compensa carregar' : 'Fica ao mesmo preço';
    const reference = fuel === null
      ? (target === null ? 'Introduz o preço máximo por kWh que estás disposto a pagar.' : `Limite escolhido · ${fmt(target)} €/kWh`)
      : `Gasolina · ${money(fuel)}/100 km · ${money(fuel * s.kWh / vehicle.consumption)} para a mesma distância`;
    const savings = difference ? `<p><strong>${money(Math.abs(difference))} ${difference > 0 ? 'abaixo' : 'acima'} da referência nesta sessão</strong></p>` : '';
    decision.classList.toggle('best', difference > 0);
    decision.classList.toggle('unfavourable', difference < 0);
    decision.innerHTML = `<p class="badge">${safe(t.name)}</p><h3>${verdict}</h3>
      <strong class="total">${money(q.total)}</strong>
      <div class="metrics"><span>${fmt(q.perKWh)} €/kWh</span><span>${money(q.per100)}/100 km</span></div>
      ${savings}<p class="muted">${reference}</p>
      ${q.credit > 0 ? `<p class="muted">Com ${money(q.credit)} de crédito promocional.</p>` : ''}
      <div class="actions"><button type="button" class="primary" data-log="${selectedIndex}">Registar sessão</button>
      <button type="button" data-tariff="${data.tariffs.indexOf(t)}">Editar preço e taxas</button>
      ${fuel === null ? '' : '<button type="button" id="edit-fuel">Ajustar gasolina</button>'}</div>`;
    if ($('edit-fuel')) $('edit-fuel').onclick = () => editVehicle(vehicle);
  }
  const open = new Set([...results.querySelectorAll('details[open]')].map(d => d.dataset.key));
  results.innerHTML = ranked.map(({ t, q }, i) => {
    const best = q.total === ranked[0].q.total;
    const delta = fuel === null ? null : Number((fuel - q.per100).toFixed(2));
    const comparison = delta === null ? '' : delta === 0 ? 'Custo igual à gasolina'
      : `${money(Math.abs(delta))}/100 km ${delta > 0 ? 'abaixo' : 'acima'} da gasolina`;
    return `<article class="panel ${best ? 'best' : ''}">
      <div class="result-head"><h3>${safe(t.name)}</h3>${best ? '<span class="badge">Mais barato</span>' : ''}</div>
      <strong class="total">${money(q.total)}</strong>
      <div class="metrics"><span>${fmt(q.perKWh)} €/kWh</span><span>${money(q.per100)}/100 km</span></div>
      ${comparison ? `<p class="muted">${comparison}</p>` : ''}
      <details data-key="${safe(t.id)}" ${open.has(t.id) ? 'open' : ''}><summary>Cálculo e hipóteses</summary>
        <p>${fmt(s.kWh)} kWh · ${fmt(minutes)} min · ${fmt(vehicle.consumption)} kWh/100 km da rede</p>
        <ul>${q.lines.map(line => {
          const rule = t[line.key];
          return `<li>${labels[line.key]} · ${fmt(rule.rate)} ${units[line.key]} · ${rule.vatIncluded ? 'IVA incluído' : 'IVA de ' + fmt(t.vat) + '% acrescentado'} ·
            ${rule.discount ? 'desconto de ' + fmt(t.discount) + '%' : 'sem desconto'} ·
            ${rule.credit ? 'aceita crédito' : 'fora do crédito'} · ${money(line.afterDiscount)}</li>`;
        }).join('')}</ul>
        <p>Subtotal ${money(q.subtotal)} · Crédito usado ${money(q.credit)}</p>
      </details>
      <button type="button" data-log="${i}">Registar</button>
    </article>`;
  }).join('') || '<p class="muted">Cria um tarifário para comparar preços.</p>';
}

form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', event => {
  const input = event.target;
  if (!input.name || !input.validity.valid) {
    renderSimulation();
    return;
  }
  const value = input.type === 'checkbox' ? input.checked : input.type === 'number'
    ? (input.value === '' ? null : input.valueAsNumber) : input.value;
  persist({ ...data, simulation: { ...data.simulation, [input.name]: value } });
  if (input.name === 'auto' && !value) form.elements.minutes.value = data.simulation.minutes;
  renderSimulation();
});

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function editRecord(seed = {}, existing = false) {
  openEditor(existing ? 'Editar sessão' : 'Registar sessão', `
    <label>Operador<input name="name" maxlength="200" value="${safe(seed.name ?? '')}" required></label>
    <label>Veículo<input name="vehicle" maxlength="200" value="${safe(seed.vehicle ?? data.vehicles.find(v => v.id === data.simulation.vehicle).name)}" required></label>
    <label>Data<input type="date" name="date" value="${safe(seed.date ?? localDate())}" required></label>
    <div class="grid">${numberField('kWh', 'Energia (kWh)', seed.kWh ?? data.simulation.kWh, 0.01)}
    ${numberField('minutes', 'Duração (min)', seed.minutes ?? data.simulation.minutes)}
    ${numberField('total', 'Valor pago (€)', seed.total ?? '', 0, Number.MAX_SAFE_INTEGER / 100)}</div>`,
  values => {
    const entry = { id: seed.id ?? crypto.randomUUID(), name: values.get('name').trim(), vehicle: values.get('vehicle').trim(),
      date: values.get('date'), kWh: +values.get('kWh'), minutes: +values.get('minutes'), total: +values.get('total') };
    return persist({ ...data, history: existing ? data.history.map(h => h.id === entry.id ? entry : h) : [...data.history, entry] });
  });
}

function render() {
  document.documentElement.dataset.theme = data.theme;
  $('theme').textContent = data.theme === 'dark' ? 'Modo claro' : 'Modo escuro';
  form.elements.vehicle.innerHTML = data.vehicles.map(v => `<option value="${safe(v.id)}">${safe(v.name)}</option>`).join('');
  form.elements.tariff.innerHTML = data.tariffs.map(t => `<option value="${safe(t.id)}">${safe(t.name)}</option>`).join('');
  writeSimulation();
  if (!form.elements.tariff.value) form.elements.tariff.selectedIndex = 0;
  if (data.simulation.target === undefined) form.elements.target.value = '';
  renderSimulation();
  $('tariff-list').innerHTML = data.tariffs.map((t, i) => `<article class="panel">
    <h3>${safe(t.name)}</h3><p class="muted">${components.map(key => fmt(t[key].rate) + ' ' + units[key]).join(' · ')}</p>
    <div class="actions"><button data-tariff="${i}">Editar</button><button data-remove-tariff="${i}">Eliminar</button></div>
  </article>`).join('') || '<p class="muted">Ainda não tens tarifários.</p>';
  $('vehicles').innerHTML = data.vehicles.map((v, i) => `<article class="panel">
    <h3>${safe(v.name)}</h3><p class="muted">${fmt(v.ac)} kW AC · ${v.dc ? fmt(v.dc) + ' kW DC · ' : ''}${fmt(v.consumption)} kWh/100 km da rede</p>
    <button data-vehicle="${i}">Editar pressupostos</button></article>`).join('');
  const kWh = data.history.reduce((sum, h) => sum + h.kWh, 0);
  const costs = data.history.reduce((sum, h) => sum + h.total, 0);
  $('stats').innerHTML = [[data.history.length, 'Sessões'], [fmt(kWh) + ' kWh', 'Energia'],
    [money(costs), 'Total pago'], [kWh ? fmt(costs / kWh) + ' €/kWh' : '—', 'Média ponderada']]
    .map(([value, label]) => `<div class="panel"><strong>${value}</strong><br><small>${label}</small></div>`).join('');
  $('records').innerHTML = data.history.map((h, index) => ({ h, index }))
    .sort((a, b) => Date.parse(b.h.date) - Date.parse(a.h.date) || b.index - a.index)
    .map(({ h, index }) => `<article class="panel"><h3>${safe(h.name)} · ${money(h.total)}</h3>
      <p class="muted">${new Date(h.date).toLocaleDateString('pt-PT', { timeZone: 'UTC' })} · ${safe(h.vehicle)} · ${fmt(h.kWh)} kWh · ${fmt(h.minutes)} min</p>
      <div class="actions"><button data-record="${index}">Editar</button><button data-remove-record="${index}">Eliminar</button></div></article>`).join('')
    || '<p class="muted">Ainda não registaste carregamentos.</p>';
}

function remove(collection, index) {
  if (confirm('Eliminar «' + data[collection][index].name + '»?')) {
    if (persist({ ...data, [collection]: data[collection].filter((_, i) => i !== index) })) render();
  }
}

function download(format) {
  const csv = format === 'csv';
  const blob = new Blob([csv ? '\uFEFF' + toCSV(data) : JSON.stringify(data, null, 2)],
    { type: csv ? 'text/csv;charset=utf-8' : 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'chargewise-' + localDate() + '.' + format;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$('add').onclick = () => editTariff();
$('add-log').onclick = () => editRecord();
$('theme').onclick = () => {
  if (persist({ ...data, theme: data.theme === 'dark' ? 'light' : 'dark' })) render();
};
$('import').onclick = () => $('file').click();
$('file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const contents = await file.text();
    const incoming = file.name.toLowerCase().endsWith('.csv') ? fromCSV(contents) : validate(JSON.parse(contents.replace(/^\uFEFF/, '')));
    const merge = (old, next) => [...new Map([...old, ...next].map(item => [item.id, item])).values()];
    if (persist({ ...incoming, tariffs: merge(data.tariffs, incoming.tariffs), history: merge(data.history, incoming.history) })) {
      render();
      status('Dados importados com sucesso.');
    }
  } catch (error) {
    status('Importação falhou. ' + error.message);
  } finally {
    event.target.value = '';
  }
};

document.querySelector('main').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const d = button.dataset;
  if (d.page) {
    for (const tab of document.querySelectorAll('[data-page]')) {
      const selected = tab === button;
      $(tab.dataset.page).hidden = !selected;
      if (selected) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
  }
  if (d.tariff !== undefined) editTariff(data.tariffs[d.tariff]);
  if (d.vehicle !== undefined) editVehicle(data.vehicles[d.vehicle]);
  if (d.log !== undefined) editRecord(currentLogOptions[d.log]);
  if (d.record !== undefined) editRecord(data.history[d.record], true);
  if (d.removeTariff !== undefined) remove('tariffs', +d.removeTariff);
  if (d.removeRecord !== undefined) remove('history', +d.removeRecord);
  if (d.export) download(d.export);
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('install').hidden = false;
});
$('install').onclick = async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  $('install').hidden = true;
  await prompt.prompt();
};
window.addEventListener('appinstalled', () => { $('install').hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {
  status('O modo offline está indisponível neste endereço.');
});
render();
