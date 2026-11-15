(() => {
  const data = [
    [[100,100,100,100,100,100,85,70,55,50,45,40,35,30,25],[100,100,100,100,100,100,100,150,150,150,200,200,250,300,400,500]],
    [[100,100,100,100,85,70,55,50,45,40,35,30,25,20,15],[40,40,40,40,40,60,60,60,80,80,100,120,160,200,240,280]],
    [[100,85,70,55,50,45,40,35,30,25,20,15,12,9,6],[200,200,300,300,300,400,400,500,600,800,1000,1200,1400,1800,2400,3000]]
  ];
  const scale = 100n ** 15n;
  const [weapon, armor, accessory] = data.map(([rates, salvage]) => {
    const result = [BigInt(salvage[15]) * scale];
    for (let level = 14; level >= 0; level--) {
      const success = BigInt(rates[level]);
      result.unshift((success * result[0] + (100n - success) * BigInt(salvage[level + 1]) * scale) / 100n);
    }
    return result;
  });
  const columns = [weapon, armor, armor.map(value => value * 2n), accessory];
  const rate = document.getElementById('trinity-rate');
  const status = document.getElementById('trinity-status');
  const body = document.querySelector('.trinity-panel tbody');
  const labels = [...body.parentElement.querySelectorAll('thead th')].slice(1);
  const cells = [];
  let threshold = { numerator: 4n, denominator: 1n };
  let source = null;

  function updatePrices() {
    for (const { input, expected } of cells) {
      if (input === source) continue;
      const limit = (expected * threshold.denominator - 1n) / (scale * threshold.numerator);
      input.value = limit >= 50n ? String(limit) : '';
    }
  }

  rate.addEventListener('input', () => {
    const raw = rate.value.trim().replace(',', '.');
    const valid = /^\d{0,12}(?:\.\d{0,12})?$/.test(raw) && /[1-9]/.test(raw);
    rate.setAttribute('aria-invalid', String(!valid));
    status.textContent = valid ? '' : 'Введи положительное число.';
    if (!valid) return;
    const [whole, fraction = ''] = raw.split('.');
    threshold = { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
    source = null;
    updatePrices();
  });

  for (let level = 0; level <= 15; level++) {
    const row = body.insertRow();
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = '+' + level;
    row.append(heading);

    columns.forEach((values, column) => {
      const expected = values[level];
      const input = document.createElement('input');
      input.inputMode = 'numeric';
      input.placeholder = '—';
      input.setAttribute('aria-label', labels[column].textContent + ' +' + level + ', цена в бриллиантах');
      input.setAttribute('aria-describedby', 'trinity-status');
      row.insertCell().append(input);
      cells.push({ input, expected });

      input.addEventListener('input', () => {
        const raw = input.value.trim();
        const valid = /^\d{1,12}$/.test(raw) && BigInt(raw) >= 50n;
        input.setAttribute('aria-invalid', String(!valid));
        status.textContent = valid ? 'Порог рассчитан по введённой цене.' : 'Введи целую цену от 50 бриллиантов.';
        if (!valid) return;
        source = input;
        threshold = { numerator: expected, denominator: scale * BigInt(raw) };
        rate.value = (Number(expected) / Number(threshold.denominator)).toLocaleString('ru-RU', {
          useGrouping: false,
          maximumFractionDigits: 12
        });
        rate.setAttribute('aria-invalid', 'false');
        updatePrices();
      });
      input.addEventListener('blur', () => {
        if (input.getAttribute('aria-invalid') !== 'true') return;
        if (input === source) input.value = String(threshold.denominator / scale);
        input.setAttribute('aria-invalid', 'false');
        status.textContent = '';
        updatePrices();
      });
    });
  }
  updatePrices();
})();
