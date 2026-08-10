(() => {
  'use strict';
  const SB = window.StockBattle;
  let battle;
  function renderHistory() {
    const rows = [...battle.prices].sort((a, b) => b.trade_date.localeCompare(a.trade_date) || String(a.player_id).localeCompare(String(b.player_id)));
    document.getElementById('empty-history').classList.toggle('hidden', rows.length > 0);
    document.getElementById('history-body').innerHTML = rows.map(price => {
      const player = battle.players.find(p => p.id === price.player_id);
      return `<tr><td>${SB.dateText(price.trade_date)}</td><td><strong>${SB.escapeHtml(player?.nickname || '')}</strong><span class="table-sub">${SB.escapeHtml(player?.security_name || '')}</span></td><td>${SB.yen(price.close_price)}</td><td><div class="action-group"><button class="secondary edit-price compact-button" data-id="${price.id}">修正</button><button class="danger delete-price compact-button" data-id="${price.id}">削除</button></div></td></tr>`;
    }).join('');
  }
  async function reload() { battle = await SB.loadBattle(); renderHistory(); }
  function openEdit(id) {
    const price = battle.prices.find(p => p.id === id); if (!price) return;
    document.getElementById('edit-price-id').value = price.id;
    document.getElementById('edit-date').value = price.trade_date;
    document.getElementById('edit-close').value = price.close_price;
    document.getElementById('edit-note').value = price.note || '';
    document.getElementById('edit-dialog').showModal();
  }
  async function editPrice(event) {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { document.getElementById('edit-dialog').close(); return; }
    try {
      const { error } = await SB.db.rpc('update_price', { p_share_token: SB.token, p_price_id: document.getElementById('edit-price-id').value, p_trade_date: document.getElementById('edit-date').value, p_close_price: Number(document.getElementById('edit-close').value), p_note: document.getElementById('edit-note').value.trim() });
      if (error) throw error;
      document.getElementById('edit-dialog').close(); await reload(); SB.showMessage('修正しました。');
    } catch (error) { SB.showMessage(error.message || '修正できませんでした。', 'error'); }
  }
  async function deletePrice(id) {
    if (!confirm('この終値を削除しますか？')) return;
    try {
      const { error } = await SB.db.rpc('delete_price', { p_share_token: SB.token, p_price_id: id });
      if (error) throw error;
      await reload(); SB.showMessage('削除しました。');
    } catch (error) { SB.showMessage(error.message || '削除できませんでした。', 'error'); }
  }
  async function init() {
    if (!SB.restoreOrRedirect('input.html')) return;
    SB.bindNav();
    if (!SB.configured) { document.getElementById('missing-battle').classList.remove('hidden'); return; }
    if (!SB.token) {
      try {
        const items = await SB.listBattles();
        if (items.length) {
          location.replace(SB.battleUrl('input.html', items[0].share_token));
          return;
        }
      } catch (error) { SB.showMessage(error.message || '対戦一覧を取得できませんでした。', 'error'); }
      document.getElementById('missing-battle').classList.remove('hidden');
      return;
    }
    try {
      battle = await SB.loadBattle();
      document.getElementById('input-content').classList.remove('hidden');
      document.getElementById('battle-label').textContent = battle.name;
      renderHistory();
      document.getElementById('edit-form').addEventListener('submit', editPrice);
      document.addEventListener('click', event => {
        const edit = event.target.closest('.edit-price');
        const del = event.target.closest('.delete-price');
        if (edit) openEdit(edit.dataset.id);
        if (del) deletePrice(del.dataset.id);
      });
    } catch (error) { document.getElementById('missing-battle').classList.remove('hidden'); SB.showMessage(error.message || '読み込めませんでした。', 'error'); }
  }
  init();
})();
