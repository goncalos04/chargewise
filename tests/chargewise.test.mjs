import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, estimateMinutes, fuelCost, assessCharge } from '../docs/finance.js';
import { defaults, toCSV, fromCSV, validate } from '../docs/data.js';

test('Electroverse aplica crédito até ao valor elegível', () => {
  const [tariff] = defaults().tariffs;
  const result = quote(tariff, 7, 120, 17);
  assert.equal(result.total, 0);
  assert.equal(result.credit.toFixed(2), '3.24');
  assert.equal(quote(tariff, 7, 120, 17, false).total, 3.24);
});

test('Telpark desconta só energia por defeito e permite descontar o OPC', () => {
  const [, tariff] = defaults().tariffs;
  const result = quote(tariff, 7, 120, 17);
  assert.equal(result.total, 8.67);
  assert.equal(result.perKWh.toFixed(3), '1.239');
  assert.equal(result.per100.toFixed(2), '21.06');
  tariff.time.discount = true;
  assert.equal(quote(tariff, 7, 120, 17).total, 7.90);
});

test('IVA, desconto e elegibilidade do crédito são independentes em cada componente', () => {
  const [tariff] = defaults().tariffs;
  tariff.energy.vatIncluded = false;
  tariff.energy.discount = true;
  tariff.session.credit = false;
  tariff.discount = 10;
  let result = quote(tariff, 7, 120, 17);
  assert.equal(result.credit.toFixed(4), '3.2546');
  assert.equal(result.total, 0.30);
  tariff.credit = 1;
  result = quote(tariff, 7, 120, 17);
  assert.equal(result.total, 2.55);
});

test('duração respeita o menor limite e potência zero impede estimativa', () => {
  assert.equal(estimateMinutes(7, 3.3, 7.4), 128);
  assert.equal(estimateMinutes(7, 11, 7.4), 57);
  assert.equal(estimateMinutes(7, 0, 50), null);
  assert.equal(estimateMinutes(7, 11, 0), null);
});

test('custo a gasolina por 100 km', () => {
  assert.equal(fuelCost(1.75, 5.4).toFixed(2), '9.45');
});

test('CSV e JSON preservam tarifários, veículos, histórico e configuração', () => {
  const original = defaults();
  original.tariffs[0].name = 'Operador; "A"\nPortugal';
  original.history.push({ id: 'a', name: 'Operador', vehicle: original.vehicles[0].name,
    date: '2026-11-18', kWh: 7, minutes: 120, total: 0 });
  assert.deepEqual(fromCSV('\uFEFF' + toCSV(original)), original);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(original))), original);
});

test('rejeita IVA e descontos inválidos e CSV incompatível', () => {
  const data = defaults();
  data.tariffs[0].vat = -1;
  assert.throws(() => validate(data));
  data.tariffs[0].vat = 23;
  data.tariffs[0].discount = 101;
  assert.throws(() => validate(data));
  assert.throws(() => fromCSV('outro;formato'));
});

test('avalia a sessão pela distância equivalente a gasolina ou pelo limite por kWh', () => {
  assert.deepEqual(assessCharge({ total: 3.24 }, 7, 17, 9.45, 'per100'), { difference: 0.65 });
  assert.deepEqual(assessCharge({ total: 8.67 }, 7, 17, 9.45, 'per100'), { difference: -4.78 });
  assert.deepEqual(assessCharge({ total: 3.24 }, 7, 19, 0.5, 'perKWh'), { difference: 0.26 });
  assert.deepEqual(assessCharge({ total: 3.50 }, 7, 19, 0.5, 'perKWh'), { difference: 0 });
  assert.equal(assessCharge({ total: 3.24 }, 7, 19, null, 'perKWh'), null);
});

test('importa cópias CSV anteriores à seleção de tarifário e limite', () => {
  const original = defaults();
  const legacy = toCSV(original).split('\r\n').map(row => row.replace(/;"[^"]*";"[^"]*"$/, '')).join('\r\n');
  delete original.simulation.tariff;
  delete original.simulation.target;
  assert.deepEqual(fromCSV(legacy), original);
});
