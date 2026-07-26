(() => {
  'use strict';
  const SB = window.StockBattle;
  let battle;

  function renderPriceForm() {
    const date = document.getElementById('trade-date').value || SB.today();
    document.getElementById('price-fields').innerHTML = battle.players.map(player => {
      const sold = Boolean(player.is_sold);
      const latest = SB.latestPrice(player.id, battle.prices);
      return `<div class="compact-price-row ${sold ? 'is-sold' : ''}" style="--player-color:${SB.escapeHtml(player.color)}">
        <div class="price-member"><span class="color-dot"></span><div><strong>${SB.escapeHtml(player.nickname)}</strong><small>${SB.escapeHtml(player.security_name)} / 取得 ${SB.yen(player.purchase_price)}</small></div></div>
        <div>${sold ? `<div class="sold-value"><strong>${SB.yen(player.sold_price)}</strong><span class="sold-badge">✓ 利確済み</span></div>` : `<input class="close-input" name="price_${player.id}" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="終値">`}</div>
        <div>${sold ? `<small>${SB.dateText(player.sold_date)}</small>` : `<button type="button" class="sell-button" data-player-id="${player.id}">利確</button>`}</div>
      </div>`;
    }).join('');
    document.getElementById('trade-date').value = date;
  }

  function renderHistory() {
    const rows = [...battle.prices].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    document.getElementById('empty-history').classList.toggle('hidden', rows.length > 0);
    document.getElementById('history-body').innerHTML = rows.map(price => {
      const player = battle.players.find(p => p.id === price.player_id);
      return `<tr><td>${SB.dateText(price.trade_date)}</td><td><strong>${SB.escapeHtml(player?.nickname || '')}</strong><span class="table-sub">${SB.escapeHtml(player?.security_name || '')}</span></td><td>${SB.yen(price.close_price)}</td><td><div class="action-group"><button class="secondary edit-price compact-button" data-id="${price.id}">修正</button><button class="danger delete-price compact-button" data-id="${price.id}">削除</button></div></td></tr>`;
    }).join('');
  }

  async function reload() { battle = await SB.loadBattle(); renderPriceForm(); renderHistory(); }

  async function savePrices(event) {
    event.preventDefault();
    const activePlayers = battle.players.filter(p => !p.is_sold);
    if (!activePlayers.length) return SB.showMessage('全員が利確済みです。', 'error');
    const button = event.submitter;
    const fd = new FormData(event.currentTarget);
    const tradeDate = fd.get('trade_date');
    if (tradeDate > SB.today()) return SB.showMessage('未来の日付は登録できません。', 'error');
    const prices = activePlayers.map(player => ({ player_id: player.id, close_price: Number(fd.get(`price_${player.id}`)), note: document.getElementById('price-note').value.trim() }));
    if (prices.some(p => !Number.isFinite(p.close_price) || p.close_price <= 0)) return SB.showMessage('未利確の参加者全員の終値を入力してください。', 'error');
    const existing = battle.prices.some(p => p.trade_date === tradeDate && activePlayers.some(a => a.id === p.player_id));
    if (existing && !confirm(`${SB.dateText(tradeDate)}の登録済みデータを上書きしますか？`)) return;
    SB.setLoading(button, true);
    try {
      const { error } = await SB.db.rpc('save_daily_prices', { p_share_token: SB.token, p_trade_date: tradeDate, p_prices: prices });
      if (error) throw error;
      document.getElementById('price-note').value = '';
      await reload(); SB.showMessage('終値を保存しました。');
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
    const player = battle.players.find(p => p.id === document.getElementById('sell-player-id').value);
    const soldDate = document.getElementById('sell-date').value;
    const soldPrice = Number(document.getElementById('sell-price').value);
    if (!confirm(`${player.nickname}さんを${SB.yen(soldPrice)}で利確確定しますか？`)) return;
    try {
      const { error } = await SB.db.rpc('set_player_sale', { p_share_token: SB.token, p_player_id: player.id, p_sold_date: soldDate, p_sold_price: soldPrice });
      if (error) throw error;
      document.getElementById('sell-dialog').close(); await reload(); SB.showMessage('利確を確定しました。');
    } catch (error) { SB.showMessage(error.message || '利確を確定できませんでした。', 'error'); }
  }

  function openEdit(id) {
    const price = battle.prices.find(p => p.id === id); if (!price) return;
    document.getElementById('edit-price-id').value = price.id; document.getElementById('edit-date').value = price.trade_date; document.getElementById('edit-close').value = price.close_price; document.getElementById('edit-note').value = price.note || ''; document.getElementById('edit-dialog').showModal();
  }
  async function editPrice(event) {
    event.preventDefault(); if (event.submitter?.value === 'cancel') { document.getElementById('edit-dialog').close(); return; }
    try { const { error } = await SB.db.rpc('update_price', { p_share_token: SB.token, p_price_id: document.getElementById('edit-price-id').value, p_trade_date: document.getElementById('edit-date').value, p_close_price: Number(document.getElementById('edit-close').value), p_note: document.getElementById('edit-note').value.trim() }); if (error) throw error; document.getElementById('edit-dialog').close(); await reload(); SB.showMessage('修正しました。'); }
    catch (error) { SB.showMessage(error.message || '修正できませんでした。', 'error'); }
  }
  async function deletePrice(id) {
    if (!confirm('この終値を削除しますか？')) return;
    try { const { error } = await SB.db.rpc('delete_price', { p_share_token: SB.token, p_price_id: id }); if (error) throw error; await reload(); SB.showMessage('削除しました。'); }
    catch (error) { SB.showMessage(error.message || '削除できませんでした。', 'error'); }
  }
  function exportJson() { const blob = new Blob([JSON.stringify(battle, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stock-battle-${battle.name}-${SB.today()}.json`; a.click(); URL.revokeObjectURL(a.href); }

  async function init() {
    SB.bindNav();
    if (!SB.configured || !SB.token) { document.getElementById('missing-battle').classList.remove('hidden'); return; }
    try {
      battle = await SB.loadBattle(); document.getElementById('input-content').classList.remove('hidden'); document.getElementById('battle-label').textContent = battle.name; document.getElementById('trade-date').value = SB.today(); renderPriceForm(); renderHistory();
      document.getElementById('price-form').addEventListener('submit', savePrices); document.getElementById('sell-form').addEventListener('submit', confirmSell); document.getElementById('edit-form').addEventListener('submit', editPrice); document.getElementById('export-button').addEventListener('click', exportJson);
      document.addEventListener('click', event => { const sell = event.target.closest('.sell-button'); const edit = event.target.closest('.edit-price'); const del = event.target.closest('.delete-price'); if (sell) openSell(sell.dataset.playerId); if (edit) openEdit(edit.dataset.id); if (del) deletePrice(del.dataset.id); });
    } catch (error) { document.getElementById('missing-battle').classList.remove('hidden'); SB.showMessage(error.message || 'データを読み込めませんでした。', 'error'); }
  }
  init();
})();
