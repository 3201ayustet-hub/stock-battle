(() => {
  'use strict';
  const SB = window.StockBattle;
  let battle;

  function renderPriceForm() {
    document.getElementById('price-fields').innerHTML = battle.players.map(player => `
      <label class="price-entry-card" style="--player-color:${SB.escapeHtml(player.color)}">
        <span class="price-card-top"><span class="color-dot"></span><strong>${SB.escapeHtml(player.nickname)}</strong></span>
        <span class="stock-name">${SB.escapeHtml(player.security_name)}（${SB.escapeHtml(player.security_code)}）</span>
        <small>購入価格 ${SB.yen(player.purchase_price)}</small>
        <input name="price_${player.id}" type="number" min="0.01" step="0.01" required placeholder="終値を入力">
      </label>
    `).join('');
    document.getElementById('trade-date').value = SB.today();
  }

  function renderHistory() {
    const rows = [...battle.prices].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    document.getElementById('empty-history').classList.toggle('hidden', rows.length > 0);
    document.getElementById('history-body').innerHTML = rows.map(price => {
      const player = battle.players.find(p => p.id === price.player_id);
      return `<tr>
        <td>${SB.dateText(price.trade_date)}</td>
        <td>${SB.escapeHtml(player?.nickname || '')}</td>
        <td>${SB.escapeHtml(player?.security_name || '')}<span class="table-sub">${SB.escapeHtml(player?.security_code || '')}</span></td>
        <td>${SB.yen(price.close_price)}</td>
        <td>${SB.escapeHtml(price.note || '')}</td>
        <td><div class="action-group"><button class="secondary edit-price" data-id="${price.id}">修正</button><button class="danger delete-price" data-id="${price.id}">削除</button></div></td>
      </tr>`;
    }).join('');
  }

  async function reload() {
    battle = await SB.loadBattle();
    renderPriceForm();
    renderHistory();
  }

  async function savePrices(event) {
    event.preventDefault();
    const button = event.submitter;
    const fd = new FormData(event.currentTarget);
    const tradeDate = fd.get('trade_date');
    if (tradeDate > SB.today()) return SB.showMessage('未来の日付は登録できません。', 'error');
    const existing = battle.prices.some(p => p.trade_date === tradeDate);
    if (existing && !confirm(`${SB.dateText(tradeDate)}のデータを上書きしますか？`)) return;

    const prices = battle.players.map(player => ({
      player_id: player.id,
      close_price: Number(fd.get(`price_${player.id}`)),
      note: document.getElementById('price-note').value.trim()
    }));
    SB.setLoading(button, true);
    try {
      const { error } = await SB.db.rpc('save_daily_prices', {
        p_share_token: SB.token,
        p_trade_date: tradeDate,
        p_prices: prices
      });
      if (error) throw error;
      await reload();
      SB.showMessage('終値を保存しました。');
    } catch (error) {
      SB.showMessage(error.message || '保存できませんでした。', 'error');
    } finally {
      SB.setLoading(button, false);
    }
  }

  function openEdit(id) {
    const price = battle.prices.find(p => p.id === id);
    if (!price) return;
    document.getElementById('edit-price-id').value = price.id;
    document.getElementById('edit-date').value = price.trade_date;
    document.getElementById('edit-close').value = price.close_price;
    document.getElementById('edit-note').value = price.note || '';
    document.getElementById('edit-dialog').showModal();
  }

  async function editPrice(event) {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') {
      document.getElementById('edit-dialog').close();
      return;
    }
    try {
      const { error } = await SB.db.rpc('update_price', {
        p_share_token: SB.token,
        p_price_id: document.getElementById('edit-price-id').value,
        p_trade_date: document.getElementById('edit-date').value,
        p_close_price: Number(document.getElementById('edit-close').value),
        p_note: document.getElementById('edit-note').value.trim()
      });
      if (error) throw error;
      document.getElementById('edit-dialog').close();
      await reload();
      SB.showMessage('修正しました。');
    } catch (error) {
      SB.showMessage(error.message || '修正できませんでした。', 'error');
    }
  }

  async function deletePrice(id) {
    if (!confirm('この終値を削除しますか？')) return;
    try {
      const { error } = await SB.db.rpc('delete_price', { p_share_token: SB.token, p_price_id: id });
      if (error) throw error;
      await reload();
      SB.showMessage('削除しました。');
    } catch (error) {
      SB.showMessage(error.message || '削除できませんでした。', 'error');
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(battle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stock-battle-${battle.name}-${SB.today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function init() {
    SB.bindNav();
    if (!SB.configured || !SB.token) {
      document.getElementById('missing-battle').classList.remove('hidden');
      return;
    }
    try {
      battle = await SB.loadBattle();
      document.getElementById('input-content').classList.remove('hidden');
      document.getElementById('battle-label').textContent = battle.name;
      renderPriceForm();
      renderHistory();
      document.getElementById('price-form').addEventListener('submit', savePrices);
      document.getElementById('edit-form').addEventListener('submit', editPrice);
      document.getElementById('export-button').addEventListener('click', exportJson);
      document.addEventListener('click', event => {
        const edit = event.target.closest('.edit-price');
        const del = event.target.closest('.delete-price');
        if (edit) openEdit(edit.dataset.id);
        if (del) deletePrice(del.dataset.id);
      });
    } catch (error) {
      document.getElementById('missing-battle').classList.remove('hidden');
      SB.showMessage(error.message || 'データを読み込めませんでした。', 'error');
    }
  }
  init();
})();
