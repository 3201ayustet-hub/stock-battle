(() => {
  'use strict';
  const SB = window.StockBattle;
  let battle;
  let chart;
  const num = value => Number(value || 0);
  const shares = player => num(player.shares_owned || 1);
  const growth = (player, price) => num(player.purchase_price) > 0 ? (num(price) - num(player.purchase_price)) / num(player.purchase_price) * 100 : 0;

  function snapshot(player) {
    const latest = SB.latestPrice(player.id, battle.prices);
    const sold = Boolean(player.is_sold && player.sold_price && player.sold_date);
    const currentPrice = sold ? num(player.sold_price) : latest ? num(latest.close_price) : num(player.purchase_price);
    const currentAsset = currentPrice * shares(player);
    const purchaseAsset = num(player.purchase_price) * shares(player);
    return { player, latest, sold, currentPrice, currentAsset, purchaseAsset, profit: currentAsset - purchaseAsset, growth: growth(player, currentPrice) };
  }

  function renderSummary(rows) {
    const cash = num(battle.carryover_cash);
    const currentTotal = rows.reduce((sum, row) => sum + row.currentAsset, 0) + cash;
    const periodProfit = rows.reduce((sum, row) => sum + row.profit, 0);
    const initialAssets = battle.initial_assets === null || battle.initial_assets === undefined ? null : num(battle.initial_assets);
    const totalProfit = initialAssets === null ? null : currentTotal - initialAssets;
    document.getElementById('total-assets').textContent = SB.yen(currentTotal);
    const periodEl = document.getElementById('period-profit');
    periodEl.textContent = SB.signedYen(periodProfit);
    periodEl.className = periodProfit >= 0 ? 'positive' : 'negative';
    const totalEl = document.getElementById('total-profit');
    totalEl.textContent = totalProfit === null ? '未設定' : SB.signedYen(totalProfit);
    totalEl.className = totalProfit === null ? '' : totalProfit >= 0 ? 'positive' : 'negative';
  }

  function rankLabel(index) {
    return String(index + 1).padStart(2, '0');
  }

  function highestRecordedPrice(player) {
    const recorded = battle.prices
      .filter(price => price.player_id === player.id)
      .map(price => num(price.close_price))
      .filter(price => Number.isFinite(price) && price > 0);

    if (player.is_sold && num(player.sold_price) > 0) recorded.push(num(player.sold_price));

    if (!recorded.length) {
      const latest = SB.latestPrice(player.id, battle.prices);
      const fallback = latest ? num(latest.close_price) : num(player.purchase_price);
      return fallback > 0 ? fallback : null;
    }
    return Math.max(...recorded);
  }

  function renderRanking(rows) {
    rows.sort((a, b) => {
      const growthDifference = b.growth - a.growth;
      if (growthDifference !== 0) return growthDifference;

      const profitDifference = b.profit - a.profit;
      if (profitDifference !== 0) return profitDifference;

      const assetDifference = b.currentAsset - a.currentAsset;
      if (assetDifference !== 0) return assetDifference;

      return num(a.player.display_order) - num(b.player.display_order);
    });
    document.getElementById('ranking-cards').innerHTML = rows.map((row, index) => {
      const p = row.player;
      return `<details class="ranking-card ${row.sold ? 'is-sold' : ''}" style="--player-color:${SB.escapeHtml(p.color || '#3b82f6')}">
        <summary>
          <span class="rank-mark"><small>RANK</small><strong>${rankLabel(index)}</strong></span>
          <span class="member-name"><small>INVESTOR</small><strong>${SB.escapeHtml(p.nickname)}</strong><em>${SB.escapeHtml(p.security_code)} / ${SB.escapeHtml(p.security_name)}</em>${row.sold ? '<span class="sold-badge">利確済み</span>' : ''}</span>
          <span class="asset-block"><small>CURRENT VALUE</small><strong>${SB.yen(row.currentAsset)}</strong></span>
          <span class="profit-block"><small>PERIOD P/L</small><strong class="${row.profit >= 0 ? 'positive' : 'negative'}">${SB.signedYen(row.profit)}</strong></span>
          <span class="growth-block"><small>GROWTH</small><strong class="${row.growth >= 0 ? 'positive' : 'negative'}">${SB.pct(row.growth)}</strong></span>
          <span class="chevron">⌄</span>
        </summary>
        <div class="ranking-detail">
          <span>銘柄<strong>${SB.escapeHtml(p.security_name)} (${SB.escapeHtml(p.security_code)})</strong></span>
          <span>取得単価<strong>${SB.yen(p.purchase_price)}</strong></span>
          <span>${row.sold ? '売却価格' : '現在値'}<strong>${SB.yen(row.currentPrice)}</strong></span>
          <span>株数<strong>${SB.number(shares(p))}株</strong></span>
          <span>最高値<strong>${highestRecordedPrice(p) ? SB.yen(highestRecordedPrice(p)) : '—'}</strong></span>
          <span>${row.sold ? '利確日' : '更新日'}<strong>${row.sold ? SB.dateText(p.sold_date) : row.latest ? SB.dateText(row.latest.trade_date) : '未登録'}</strong></span>
        </div>
      </details>`;
    }).join('');
  }

  function chartDates() {
    const dates = battle.prices.map(p => p.trade_date);
    battle.players.filter(p => p.is_sold && p.sold_date).forEach(p => dates.push(p.sold_date));
    return [...new Set(dates)].sort();
  }
  function chartValue(player, date) {
    if (player.is_sold && player.sold_date && date >= player.sold_date) return growth(player, player.sold_price);
    const price = SB.latestPrice(player.id, battle.prices, date);
    return price ? growth(player, price.close_price) : null;
  }
  function performanceRows() {
    const dates = chartDates();
    const latestDate = dates.at(-1) || null;
    const rows = battle.players.map(player => {
      const value = latestDate ? chartValue(player, latestDate) : growth(player, player.purchase_price);
      return { player, growth: value === null ? 0 : Number(value) };
    }).sort((a, b) => b.growth - a.growth || num(a.player.display_order) - num(b.player.display_order));
    return { dates, latestDate, rows };
  }

  function renderPerformanceReport() {
    const { dates, latestDate, rows } = performanceRows();
    const status = document.getElementById('performance-status');
    const ticker = document.getElementById('performance-ticker');
    if (!status || !ticker) return;

    const visible = dates.length > 0 && rows.length > 0;
    status.classList.toggle('hidden', !visible);
    ticker.classList.toggle('hidden', !visible);
    if (!visible) return;

    const leader = rows[0];
    const second = rows[1];
    const spread = second ? leader.growth - second.growth : 0;

    document.getElementById('performance-leader').textContent = leader.player.nickname;
    document.getElementById('performance-leader-growth').textContent = SB.pct(leader.growth);
    document.getElementById('performance-spread').textContent = `${spread.toFixed(2)} pt`;
    document.getElementById('performance-updated').textContent = latestDate ? SB.shortDate(latestDate) : '—';

    ticker.innerHTML = rows.map((row, index) => `
      <div class="performance-ticker-row" style="--player-color:${SB.escapeHtml(row.player.color || '#8c8c8c')}">
        <span class="performance-ticker-line"></span>
        <span class="performance-ticker-rank">${String(index + 1).padStart(2, '0')}</span>
        <span class="performance-ticker-name">${SB.escapeHtml(row.player.nickname)}</span>
        <span class="performance-ticker-code">${SB.escapeHtml(row.player.security_code || '')}</span>
        <strong class="${row.growth >= 0 ? 'positive' : 'negative'}">${SB.pct(row.growth)}</strong>
      </div>`).join('');
  }

  function renderChart() {
    const dates = chartDates();
    renderPerformanceReport();

    document.getElementById('empty-chart').classList.toggle('hidden', dates.length > 0);
    document.querySelector('.chart-wrap').classList.toggle('hidden', dates.length === 0);
    if (chart) chart.destroy();
    if (!dates.length) return;

    const datasets = battle.players.map(player => ({
      label: player.nickname,
      data: dates.map(date => chartValue(player, date)),
      borderColor: player.color,
      backgroundColor: player.color,
      borderWidth: 2,
      tension: 0,
      pointRadius: ctx => ctx.dataIndex === ctx.dataset.data.length - 1 ? 3 : 0,
      pointHoverRadius: 4,
      pointBorderWidth: 0,
      spanGaps: true
    }));

    chart = new Chart(document.getElementById('growth-chart'), {
      type: 'line',
      data: { labels: dates.map(SB.shortDate), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 16, right: 10, bottom: 0, left: 0 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: '#101411',
            borderColor: '#3a403a',
            borderWidth: 1,
            titleColor: '#aeb4ae',
            bodyColor: '#f0ede4',
            titleFont: { family: '"SFMono-Regular","SF Mono",Menlo,Consolas,monospace', size: 10, weight: 'normal' },
            bodyFont: { family: '"Yu Mincho","Hiragino Mincho ProN",Georgia,serif', size: 12 },
            callbacks: { label: ctx => `${ctx.dataset.label}  ${SB.pct(ctx.parsed.y)}` }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#747b75',
              maxTicksLimit: 6,
              maxRotation: 0,
              autoSkip: true,
              font: { family: '"SFMono-Regular","SF Mono",Menlo,Consolas,monospace', size: 9 }
            },
            grid: { display: false },
            border: { color: '#343934' }
          },
          y: {
            ticks: {
              color: '#747b75',
              padding: 8,
              callback: value => `${value}%`,
              font: { family: '"SFMono-Regular","SF Mono",Menlo,Consolas,monospace', size: 9 }
            },
            border: { display: false },
            grid: {
              drawTicks: false,
              color: ctx => ctx.tick.value === 0 ? '#756b4c' : 'rgba(115,123,116,.13)',
              lineWidth: ctx => ctx.tick.value === 0 ? 1.2 : .7
            }
          }
        }
      }
    });
  }

  function renderPriceFields() {
    document.getElementById('price-fields').innerHTML = battle.players.map(player => {
      const sold = Boolean(player.is_sold);
      const latest = SB.latestPrice(player.id, battle.prices);
      return `<div class="compact-price-row ${sold ? 'is-sold' : ''}" style="--player-color:${SB.escapeHtml(player.color || '#3b82f6')}">
        <div class="price-member"><span class="color-dot"></span><div><strong>${SB.escapeHtml(player.nickname)}</strong><small>取得 ${SB.yen(player.purchase_price)}</small></div></div>
        ${sold ? `<div class="sold-value"><strong>${SB.yen(player.sold_price)}</strong><span class="sold-badge">✓ 利確済み</span></div><button type="button" class="secondary compact-button undo-sale" data-player-id="${player.id}">取消</button>` : `<input class="close-input" name="price_${player.id}" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="終値" value="${latest?.trade_date === document.getElementById('trade-date').value ? latest.close_price : ''}"><button type="button" class="sell-button" data-player-id="${player.id}">利確</button>`}
      </div>`;
    }).join('');
  }

  function openSheet() {
    document.getElementById('trade-date').value = SB.today();
    renderPriceFields();
    document.getElementById('price-sheet').showModal();
  }
  async function reload() {
    battle = await SB.loadBattle();
    renderAll();
  }
  function renderAll() {
    document.getElementById('battle-title').textContent = battle.name;
    const rows = battle.players.map(snapshot);
    renderSummary(rows);
    renderRanking(rows);
    renderChart();
    const dates = chartDates();
    document.getElementById('latest-date').textContent = dates.length ? SB.shortDate(dates.at(-1)) : '未登録';
    if ((battle.rules || '').trim()) {
      document.getElementById('rules-panel').classList.remove('hidden');
      document.getElementById('rules-text').textContent = battle.rules.trim();
    } else document.getElementById('rules-panel').classList.add('hidden');
  }

  async function savePrices(event) {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { document.getElementById('price-sheet').close(); return; }
    const active = battle.players.filter(p => !p.is_sold);
    if (!active.length) return SB.showMessage('全員が利確済みです。', 'error');
    const fd = new FormData(event.currentTarget);
    const tradeDate = fd.get('trade_date');
    const prices = active.map(p => ({ player_id: p.id, close_price: Number(fd.get(`price_${p.id}`)), note: document.getElementById('price-note').value.trim() }));
    if (tradeDate > SB.today() || prices.some(p => !Number.isFinite(p.close_price) || p.close_price <= 0)) return SB.showMessage('日付と終値を確認してください。', 'error');
    const button = event.submitter;
    SB.setLoading(button, true);
    try {
      const { error } = await SB.db.rpc('save_daily_prices', { p_share_token: SB.token, p_trade_date: tradeDate, p_prices: prices });
      if (error) throw error;
      document.getElementById('price-sheet').close();
      await reload();
      SB.showMessage('終値を保存しました。');
    } catch (error) { SB.showMessage(error.message || '保存できませんでした。', 'error'); }
    finally { SB.setLoading(button, false); }
  }
  function openSell(playerId) {
    const player = battle.players.find(p => p.id === playerId);
    if (!player || player.is_sold) return;
    const entered = document.querySelector(`[name="price_${player.id}"]`)?.value;
    const latest = SB.latestPrice(player.id, battle.prices);
    document.getElementById('sell-player-id').value = player.id;
    document.getElementById('sell-player-label').textContent = `${player.nickname} / ${player.security_name}`;
    document.getElementById('sell-date').value = document.getElementById('trade-date').value || SB.today();
    document.getElementById('sell-price').value = entered || latest?.close_price || player.purchase_price;
    document.getElementById('sell-dialog').showModal();
  }
  async function confirmSell(event) {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { document.getElementById('sell-dialog').close(); return; }
    const playerId = document.getElementById('sell-player-id').value;
    const player = battle.players.find(p => p.id === playerId);
    const soldPrice = Number(document.getElementById('sell-price').value);
    if (!player || !confirm(`${player.nickname}さんを${SB.yen(soldPrice)}で利確しますか？`)) return;
    try {
      const { error } = await SB.db.rpc('set_player_sale', { p_share_token: SB.token, p_player_id: playerId, p_sold_date: document.getElementById('sell-date').value, p_sold_price: soldPrice });
      if (error) throw error;
      document.getElementById('sell-dialog').close();
      await reload(); renderPriceFields();
      SB.showMessage('利確しました。');
    } catch (error) { SB.showMessage(error.message || '利確できませんでした。', 'error'); }
  }
  async function clearSale(playerId) {
    const player = battle.players.find(p => p.id === playerId);
    if (!player || !confirm(`${player.nickname}さんの利確を取り消しますか？\n売却日と売却価格が削除され、終値入力が再開します。`)) return;
    try {
      const { error } = await SB.db.rpc('clear_player_sale', { p_share_token: SB.token, p_player_id: playerId });
      if (error) throw error;
      await reload(); renderPriceFields();
      SB.showMessage('利確を取り消しました。');
    } catch (error) { SB.showMessage(error.message || '取り消せませんでした。', 'error'); }
  }

  async function init() {
    if (!SB.token) {
      location.replace('setup.html');
      return;
    }
    if (!SB.restoreOrRedirect('index.html')) return;
    SB.bindNav();
    if (!SB.configured) { document.getElementById('missing-battle').classList.remove('hidden'); return; }
    if (!SB.token) {
      location.replace('setup.html');
      return;
    }
    try {
      battle = await SB.loadBattle();
      document.getElementById('dashboard').classList.remove('hidden');
      renderAll();
      document.getElementById('trade-date').value = SB.today();
      document.getElementById('open-price-sheet').addEventListener('click', openSheet);
      document.getElementById('title-price-button').addEventListener('click', openSheet);
      document.getElementById('trade-date').addEventListener('change', renderPriceFields);
      document.getElementById('price-form').addEventListener('submit', savePrices);
    const priceSheet = document.getElementById('price-sheet');
    document.getElementById('close-price-sheet').addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      priceSheet.close();
    });
    priceSheet.addEventListener('click', event => {
      if (event.target === priceSheet) priceSheet.close();
    });
      document.getElementById('sell-form').addEventListener('submit', confirmSell);
      document.addEventListener('click', event => {
        const sell = event.target.closest('.sell-button');
        const undo = event.target.closest('.undo-sale');
        if (sell) openSell(sell.dataset.playerId);
        if (undo) clearSale(undo.dataset.playerId);
      });
    } catch (error) {
      SB.forgetBattle(SB.token);
      document.getElementById('missing-battle').classList.remove('hidden');
      SB.showMessage(error.message || '読み込めませんでした。', 'error');
    }
  }
  init();
})();
