(() => {
  'use strict';
  const SB = window.StockBattle;
  let chart;
  const num = v => Number(v || 0);
  const shares = p => num(p.shares_owned || 1);
  const growthAt = (p, value) => num(p.purchase_price) > 0 ? (num(value) - num(p.purchase_price)) / num(p.purchase_price) * 100 : 0;

  function playerSnapshot(battle, player) {
    const latest = SB.latestPrice(player.id, battle.prices);
    const sold = Boolean(player.is_sold && player.sold_price);
    const currentPrice = sold ? num(player.sold_price) : latest ? num(latest.close_price) : num(player.purchase_price);
    const hasMarketPrice = sold || Boolean(latest);
    const initialAsset = num(player.purchase_price) * shares(player);
    const currentAsset = currentPrice * shares(player);
    return {
      player, latest, sold, currentPrice, hasMarketPrice, initialAsset, currentAsset,
      profit: currentAsset - initialAsset,
      growth: growthAt(player, currentPrice)
    };
  }

  function renderRanking(battle) {
    const rows = battle.players.map(p => playerSnapshot(battle, p)).sort((a, b) => b.growth - a.growth);
    document.getElementById('ranking-cards').innerHTML = rows.map((row, index) => {
      const p = row.player;
      const status = row.sold
        ? `<span class="sold-badge">✓ 利確済み</span><small>${SB.dateText(p.sold_date)}</small>`
        : `<small>${SB.escapeHtml(p.security_name)} / ${SB.escapeHtml(p.security_code)}</small>`;
      return `<article class="ranking-row" style="--player-color:${SB.escapeHtml(p.color)}">
        <div class="member-cell"><span class="rank-number">${index + 1}</span><div><strong>${SB.escapeHtml(p.nickname)}</strong>${status}</div></div>
        <div data-label="取得単価"><strong>${SB.yen(p.purchase_price)}</strong><small>${SB.number(shares(p))}株</small></div>
        <div data-label="現在値"><strong>${row.hasMarketPrice ? SB.yen(row.currentPrice) : '未登録'}</strong><small>${row.sold ? '確定価格' : row.latest ? SB.dateText(row.latest.trade_date) : '取得単価で仮計算'}</small></div>
        <div data-label="成長率"><strong class="${row.growth >= 0 ? 'positive' : 'negative'}">${SB.pct(row.growth)}</strong><small class="${row.profit >= 0 ? 'positive' : 'negative'}">${SB.signedYen(row.profit)}</small></div>
      </article>`;
    }).join('');

    const cash = num(battle.carryover_cash);
    const initialTotal = rows.reduce((sum, r) => sum + r.initialAsset, 0) + cash;
    const currentTotal = rows.reduce((sum, r) => sum + r.currentAsset, 0) + cash;
    const profit = currentTotal - initialTotal;
    const growth = initialTotal ? profit / initialTotal * 100 : 0;
    document.getElementById('total-assets').textContent = SB.yen(currentTotal);
    const profitEl = document.getElementById('total-profit');
    profitEl.textContent = SB.signedYen(profit); profitEl.className = profit >= 0 ? 'positive' : 'negative';
    const growthEl = document.getElementById('total-growth');
    growthEl.textContent = SB.pct(growth); growthEl.className = growth >= 0 ? 'positive' : 'negative';
  }

  function chartDates(battle) {
    const dates = battle.prices.map(p => p.trade_date);
    battle.players.filter(p => p.is_sold && p.sold_date).forEach(p => dates.push(p.sold_date));
    return [...new Set(dates)].sort();
  }

  function chartValue(battle, player, date) {
    if (player.is_sold && player.sold_date && date >= player.sold_date) return growthAt(player, player.sold_price);
    const exact = battle.prices.find(p => p.player_id === player.id && p.trade_date === date);
    return exact ? growthAt(player, exact.close_price) : null;
  }

  function renderChart(battle) {
    const dates = chartDates(battle);
    const empty = !dates.length;
    document.getElementById('empty-chart').classList.toggle('hidden', !empty);
    document.querySelector('.chart-wrap').classList.toggle('hidden', empty);
    if (chart) chart.destroy();
    if (empty) return;

    chart = new Chart(document.getElementById('growth-chart'), {
      type: 'line',
      data: {
        labels: dates.map(SB.shortDate),
        datasets: battle.players.map(player => ({
          label: player.nickname,
          data: dates.map(date => chartValue(battle, player, date)),
          borderColor: player.color,
          backgroundColor: player.color,
          borderWidth: 3,
          tension: 0.28,
          spanGaps: true,
          pointRadius: 2.5,
          pointHoverRadius: 6
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: '#d8dee9', usePointStyle: true, boxWidth: 8, padding: 14 } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${SB.pct(ctx.parsed.y)}` } }
        },
        scales: {
          y: { title: { display: true, text: '成長率（%）', color: '#8993a4' }, ticks: { color: '#8993a4' }, grid: { color: ctx => ctx.tick.value === 0 ? '#6b7280' : '#252a33' } },
          x: { title: { display: true, text: '日付', color: '#8993a4' }, ticks: { color: '#8993a4', maxTicksLimit: 7 }, grid: { display: false } }
        }
      }
    });
  }

  async function init() {
    SB.bindNav();
    if (!SB.configured || !SB.token) { document.getElementById('missing-battle').classList.remove('hidden'); return; }
    try {
      const battle = await SB.loadBattle();
      document.getElementById('dashboard').classList.remove('hidden');
      document.getElementById('battle-title').textContent = battle.name;
      const dates = chartDates(battle);
      document.getElementById('latest-date').textContent = dates.length ? SB.dateText(dates.at(-1)) : '未登録';
      document.getElementById('price-days').textContent = `${dates.length}日`;
      renderRanking(battle);
      renderChart(battle);
      if ((battle.rules || '').trim()) {
        document.getElementById('rules-panel').classList.remove('hidden');
        document.getElementById('rules-text').textContent = battle.rules.trim();
      }
    } catch (error) {
      document.getElementById('missing-battle').classList.remove('hidden');
      SB.showMessage(error.message || '読み込めませんでした。', 'error');
    }
  }
  init();
})();
