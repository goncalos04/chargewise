const rule = (rate, discount = false) => ({ rate, vatIncluded: true, discount, credit: true });
export const blankTariff = () => ({
  id: crypto.randomUUID(), name: '', vat: 23, discount: 0, credit: 0,
  energy: rule(0), time: rule(0), session: rule(0)
});

export const defaults = () => ({
  version: 1,
  tariffs: [
    { ...blankTariff(), id: 'electroverse', name: 'Electroverse', energy: rule(0.42), session: rule(0.30), credit: 5 },
    { ...blankTariff(), id: 'telpark', name: 'Telpark', energy: rule(0.59, true), time: rule(0.043), discount: 15 }
  ],
  vehicles: [
    { id: 'niro', name: 'Kia Niro Urban PHEV · 01/2020', ac: 3.3, dc: 0, consumption: 17, fuelPrice: 1.75, fuelConsumption: 5.4 },
    { id: 'b10', name: 'Leapmotor B10 · 100% elétrico', ac: 11, dc: 140, consumption: 19, fuelPrice: 0, fuelConsumption: 0 }
  ],
  history: [],
  theme: 'dark',
  simulation: { vehicle: 'niro', kWh: 7, minutes: 120, charging: 'ac', power: 7.4, auto: false, credit: true }
});

const key = 'chargewise-v1';
export function load() {
  const saved = localStorage.getItem(key);
  return saved ? validate(JSON.parse(saved)) : defaults();
}

export function save(data) {
  localStorage.setItem(key, JSON.stringify(data));
}

const columns = ['tipo', 'id', 'nome', 'iva', 'desconto', 'credito',
  ...['energia', 'tempo', 'sessao'].flatMap(key => [key, key + '_iva', key + '_desconto', key + '_credito']),
  'ac', 'dc', 'consumo', 'preco_gasolina', 'consumo_gasolina', 'data', 'veiculo',
  'kwh', 'minutos', 'total', 'tema', 'modo', 'potencia', 'automatico', 'usar_credito'];

export function toCSV(data) {
  const rows = [
    ['configuracao', ...Array(23).fill(''), data.simulation.vehicle, data.simulation.kWh,
      data.simulation.minutes, '', data.theme, data.simulation.charging, data.simulation.power,
      data.simulation.auto, data.simulation.credit],
    ...data.tariffs.map(t => ['tarifario', t.id, t.name, t.vat, t.discount, t.credit,
      ...[t.energy, t.time, t.session].flatMap(r => [r.rate, r.vatIncluded, r.discount, r.credit])]),
    ...data.vehicles.map(v => ['veiculo', v.id, v.name, ...Array(15).fill(''),
      v.ac, v.dc, v.consumption, v.fuelPrice, v.fuelConsumption]),
    ...data.history.map(h => ['carregamento', h.id, h.name, ...Array(20).fill(''),
      h.date, h.vehicle, h.kWh, h.minutes, h.total])
  ];
  return [columns, ...rows].map(row => columns.map((_, i) =>
    '"' + String(row[i] ?? '').replaceAll('"', '""') + '"').join(';')).join('\r\n');
}

function parseCSV(source) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"' && quoted && source[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === ';') { row.push(field); field = ''; }
    else if (!quoted && c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (quoted || c !== '\r') field += c;
  }
  if (quoted) throw Error('Aspas incompletas no CSV.');
  if (row.length || field) rows.push([...row, field]);
  return rows;
}

export function fromCSV(source) {
  const [header, ...rows] = parseCSV(source.replace(/^\uFEFF/, ''));
  if (header?.join(';') !== columns.join(';') || rows.some(row => row.length !== columns.length)) {
    throw Error('Usa o formato CSV exportado pela ChargeWise.');
  }
  const sets = { version: 1, tariffs: [], vehicles: [], history: [] };
  const num = value => value.trim() ? Number(value.replace(',', '.')) : NaN;
  const bool = value => ({ true: true, false: false })[value];
  for (const r of rows) {
    const cell = Object.fromEntries(columns.map((name, i) => [name, r[i]]));
    const rule = k => ({ rate: num(cell[k]), vatIncluded: bool(cell[k + '_iva']),
      discount: bool(cell[k + '_desconto']), credit: bool(cell[k + '_credito']) });
    const identity = { id: cell.id, name: cell.nome };
    switch (cell.tipo) {
      case 'configuracao':
        if (sets.simulation) throw Error('Configuração duplicada.');
        sets.theme = cell.tema;
        sets.simulation = { vehicle: cell.veiculo, kWh: num(cell.kwh), minutes: num(cell.minutos),
          charging: cell.modo, power: num(cell.potencia), auto: bool(cell.automatico), credit: bool(cell.usar_credito) };
        break;
      case 'tarifario':
        sets.tariffs.push({ ...identity, vat: num(cell.iva), discount: num(cell.desconto), credit: num(cell.credito),
          energy: rule('energia'), time: rule('tempo'), session: rule('sessao') });
        break;
      case 'veiculo':
        sets.vehicles.push({ ...identity, ac: num(cell.ac), dc: num(cell.dc), consumption: num(cell.consumo),
          fuelPrice: num(cell.preco_gasolina), fuelConsumption: num(cell.consumo_gasolina) });
        break;
      case 'carregamento':
        sets.history.push({ ...identity, date: cell.data, vehicle: cell.veiculo, kWh: num(cell.kwh),
          minutes: num(cell.minutos), total: num(cell.total) });
        break;
      default: throw Error('Tipo de linha CSV desconhecido.');
    }
  }
  return validate(sets);
}

export function validate(data) {
  const number = (n, min = 0, max = 1000000) => Number.isFinite(n) && n >= min && n <= max;
  const string = s => typeof s === 'string' && s.trim().length > 0 && s.length <= 200;
  const flag = b => typeof b === 'boolean';
  const list = (values, test) => Array.isArray(values) && values.every(v => v && string(v.id) && string(v.name) && test(v))
    && new Set(values.map(v => v.id)).size === values.length;
  const component = r => r && number(r.rate) && [r.vatIncluded, r.discount, r.credit].every(flag);
  const s = data?.simulation;
  if (data?.version !== 1 || !['dark', 'light'].includes(data.theme) ||
    !list(data.tariffs, t => number(t.vat, 0, 100) && number(t.discount, 0, 100) && number(t.credit)
      && [t.energy, t.time, t.session].every(component)) ||
    !list(data.vehicles, v => [v.ac, v.dc, v.fuelPrice, v.fuelConsumption].every(n => number(n)) && number(v.consumption, 0.01)) ||
    data.vehicles.length !== 2 || !['niro', 'b10'].every(id => data.vehicles.some(v => v.id === id)) ||
    !list(data.history, h => typeof h.date === 'string' && Number.isFinite(Date.parse(h.date)) && string(h.vehicle)
      && number(h.kWh, 0.01) && number(h.minutes) && number(h.total, 0, Number.MAX_SAFE_INTEGER / 100)) ||
    !s || !data.vehicles.some(v => v.id === s.vehicle) || !['ac', 'dc'].includes(s.charging) ||
    !number(s.kWh, 0.01) || !number(s.minutes) || !number(s.power) || !flag(s.auto) || !flag(s.credit)) {
    throw Error('O ficheiro contém dados inválidos ou uma versão incompatível.');
  }
  return data;
}
