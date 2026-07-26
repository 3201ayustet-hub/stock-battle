(() => {
  'use strict';
  const SB = window.StockBattle;
  let chart;

  const num = value => Number(value || 0);
  const shares = player => num(player.shares_owned || 1);
  const cash = player => num(player.carryover_cash || 0);
  const initialAsset = player => num(player.purchase_price) * shares(player) + cash(player);
  const currentAsset = (player, close) => num(close) * shares(player) + cash(player);

  function completeDates(battle) {
    const dates = [...new Set(battle.prices.map(p => p.trade_date))].sort();
    return dates.filter(date => battle.players.every(player =>
      battle.prices.some(price => price.player_id === player.id && price.trade_date === date)
    ));
  }

  function portfolioRows(battle, date) {
    return battle.players.map(player => {
      const price = date ? battle.prices.find(p => p.player_id === player.id && p.trade_date === date) : null;
      const initial = initialAsset(player);
      const asset = price ? currentAsset(player, price.close_price) : null;
      const profit = asset === null ? null : asset - initial;
      const growth = asset === null || initial <= 0 ? null : (profit / initial) * 100;
      return { player, price, initial, asset, profit, growth };
    }).sort((a, b) => (b.asset ?? -Infinity) - (a.asset ?? -Infinity));
  }

  function renderRanking(battle, latest) {
    const rows = portfolioRows(battle, latest);
    document.getElementById('ranking-cards').innerHTML = rows.map((row, index) => `
      <article class="portfolio-rank-card" style="--player-color:${SB.escapeHtml(row.player.color)}">
        <div class="portfolio-rank-head">
          <span class="rank-number">${row.asset === null ? '—' : index + 1}</span>
          <div><h3>${SB.escapeHtml(row.player.nickname)}</h3><p>${SB.escapeHtml(row.player.security_name)} <span>${SB.escapeHtml(row.player.security_code)}</span></p></div>
          <span class="growth-chip ${row.growth === null ? '' : row.growth >= 0 ? 'positive' : 'negative'}">${row.growth === null ? '未登録' : SB.pct(row.growth)}</span>
        </div>
        <div class="portfolio-main-value"><small>現在資産</small><strong>${row.asset === null ? '—' : SB.yen(row.asset)}</strong></div>
        <div class="portfolio-details">
          <span>終値 <b>${row.price ? SB.yen(row.price.close_price) : '—'}</b></span>
          <span>所有 <b>${SB.number(shares(row.player))}株</b></span>
          <span>余剰金 <b>${SB.yen(cash(row.player))}</b></span>
          <span>損益 <b class="${row.profit === null ? '' : row.profit >= 0 ? 'positive' : 'negative'}">${row.profit === null ? '—' : SB.signedYen(row.profit)}</b></span>
        </div>
      </article>
    `).join('');

    const initialTotal = rows.reduce((sum, row) => sum + row.initial, 0);
    document.getElementById('initial-total-assets').textContent = SB.yen(initialTotal);
    if (!latest) {
      document.getElementById('total-assets').textContent = '—';
      document.getElementById('total-profit').textContent = '—';
      document.getElementById('total-growth').textContent = '—';
      return;
    }
    const total = rows.reduce((sum, row) => sum + row.asset, 0);
    const profit = total - initialTotal;
    const growth = initialTotal > 0 ? profit / initialTotal * 100 : 0;
    document.getElementById('total-assets').textContent = SB.yen(total);
    const profitEl = document.getElementById('total-profit');
    profitEl.textContent = SB.signedYen(profit);
    profitEl.className = profit >= 0 ? 'positive' : 'negative';
    const growthEl = document.getElementById('total-growth');
    growthEl.textContent = SB.pct(growth);
    growthEl.className = growth >= 0 ? 'positive' : 'negative';
  }

  function renderChart(battle) {
    const labels = [...new Set(battle.prices.map(p => p.trade_date))].sort();
    const empty = labels.length === 0;
    document.getElementById('empty-chart').classList.toggle('hidden', !empty);
    document.querySelector('.chart-wrap').classList.toggle('hidden', empty);
    if (chart) chart.destroy();
    if (empty) return;

    const datasets = battle.players.map(player => {
      const initial = initialAsset(player);
      return {
        label: `${player.nickname} / ${player.security_code}`,
        data: labels.map(date => {
          const p = battle.prices.find(x => x.player_id === player.id && x.trade_date === date);
          if (!p || initial <= 0) return null;
          return ((currentAsset(player, p.close_price) - initial) / initial) * 100;
        }),
        borderColor: player.color,
        backgroundColor: player.color,
        borderWidth: 3,
        tension: 0.28,
        spanGaps: true,
        pointRadius: 2.5,
        pointHoverRadius: 6
      };
    });

    chart = new Chart(document.getElementById('growth-chart'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${SB.pct(ctx.parsed.y)}` } }
        },
        scales: {
          y: { title: { display: true, text: '資産成長率（%）' }, grid: { color: ctx => ctx.tick.value === 0 ? '#667085' : '#e6ebf0' } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } }
        }
      }
    });
  }

  async function init() {
    SB.bindNav();
    if (!SB.configured || !SB.token) {
      document.getElementById('missing-battle').classList.remove('hidden');
      return;
    }
    try {
      const battle = await SB.loadBattle();
      document.getElementById('dashboard').classList.remove('hidden');
      document.getElementById('battle-title').textContent = battle.name;
      document.getElementById('battle-period').textContent = `${SB.dateText(battle.start_date)} 〜 ${battle.end_date ? SB.dateText(battle.end_date) : '終了日未設定'}`;
      const dates = completeDates(battle);
      const latest = dates.at(-1) || null;
      document.getElementById('latest-date').textContent = latest ? SB.dateText(latest) : '未登録';
      document.getElementById('price-days').textContent = `${dates.length}日`;
      renderRanking(battle, latest);
      renderChart(battle);
      document.getElementById('copy-link').addEventListener('click', async () => {
        await navigator.clipboard.writeText(location.href);
        SB.showMessage('共有URLをコピーしました。');
      });
    } catch (error) {
      document.getElementById('missing-battle').classList.remove('hidden');
      SB.showMessage(error.message || 'データを読み込めませんでした。', 'error');
    }
  }
  init();
})();
