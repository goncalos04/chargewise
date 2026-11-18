export const components = ['energy', 'time', 'session'];

export function estimateMinutes(kWh, vehiclePower, stationPower) {
  if (![kWh, vehiclePower, stationPower].every(value => Number.isFinite(value) && value > 0)) return null;
  return Math.ceil(kWh * 60 / Math.min(vehiclePower, stationPower));
}

export function quote(tariff, kWh, minutes, consumption, useCredit = true) {
  const quantities = { energy: kWh, time: minutes, session: 1 };
  const lines = components.map(key => {
    const rule = tariff[key];
    const base = rule.rate * quantities[key];
    const gross = base * (rule.vatIncluded ? 1 : 1 + tariff.vat / 100);
    const afterDiscount = gross * (rule.discount ? 1 - tariff.discount / 100 : 1);
    return { key, gross, afterDiscount, creditEligible: rule.credit };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.afterDiscount, 0);
  const eligible = lines.reduce((sum, line) => sum + (line.creditEligible ? line.afterDiscount : 0), 0);
  const credit = useCredit ? Math.min(eligible, tariff.credit) : 0;
  const cents = Math.round((subtotal - credit + 1e-9) * 100);
  const total = cents / 100;
  return { lines, subtotal, credit, total, perKWh: total / kWh, per100: total / kWh * consumption };
}

export function fuelCost(price, consumption) {
  return price * consumption;
}
