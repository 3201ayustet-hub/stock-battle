(() => {
  'use strict';
  const SB = window.StockBattle;
  const COLORS = ['#3b82f6', '#f43f5e', '#22c55e', '#a855f7'];
  const form = document.getElementById('create-form');
  const playerFields = document.getElementById('player-fields');
  let editingBattle = null;
  const shareOptions = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}株</option>`).join('');

  function renderPlayers(players = []) {
    playerFields.innerHTML = COLORS.map((color, i) => {
      const p = players[i] || {};
      const saleBox = p.is_sold ? `<div class="sale-admin-box"><div><span class="sold-badge">✓ 利確済み</span><strong>${SB.yen(p.sold_price)}</strong><small>${SB.dateText(p.sold_date)}</small></div><div class="action-group"><button type="button" class="secondary compact-button edit-sale" data-player-id="${p.id}">修正</button><button type="button" class="danger compact-button clear-sale" data-player-id="${p.id}">取消</button></div></div>` : '';
      return `<fieldset class="player-card" style="--player-color:${color}"><legend><span class="color-dot"></span>参加者 ${i + 1}</legend><div class="form-grid two">
        <input type="hidden" name="id_${i}" value="${SB.escapeHtml(p.id || '')}">
        <label class="field full">ニックネーム<input name="nickname_${i}" required maxlength="30" value="${SB.escapeHtml(p.nickname || '')}"></label>
        <label class="field">銘柄コード<input name="code_${i}" required maxlength="10" inputmode="numeric" value="${SB.escapeHtml(p.security_code || '')}"></label>
        <label class="field">銘柄名<input name="security_${i}" required maxlength="60" value="${SB.escapeHtml(p.security_name || '')}"></label>
        <label class="field">取得単価<input name="purchase_${i}" type="number" min="0.01" step="0.01" required value="${p.purchase_price ?? ''}"></label>
        <label class="field">所有株数<select name="shares_${i}" required>${shareOptions}</select></label>
        <input name="color_${i}" type="hidden" value="${color}">
      </div>${saleBox}</fieldset>`;
    }).join('');
    players.forEach((p, i) => { const select = form.elements[`shares_${i}`]; if (select) select.value = String(Math.min(10, Math.max(1, Math.round(Number(p.shares_owned || 1))))); });
  }

  function renderSaved() {
    const items = SB.savedBattles(); if (!items.length) return;
    document.getElementById('saved-section').classList.remove('hidden');
    document.getElementById('saved-battles').innerHTML = items.map(item => `<article class="saved-battle-item"><div><strong>${SB.escapeHtml(item.name)}</strong><small>${item.start_date ? SB.dateText(item.start_date) : ''}</small></div><div class="saved-actions"><a class="primary button-link compact-button" href="${SB.battleUrl('index.html', item.token)}">開く</a><a class="secondary button-link compact-button" href="${SB.battleUrl('setup.html', item.token)}">設定</a></div></article>`).join('');
  }

  function payload() {
    const fd = new FormData(form); const start = fd.get('start_date'); const end = fd.get('end_date') || null;
    if (end && end < start) throw new Error('終了日は開始日以降にしてください。');
    return { fd, start, end, carryoverCash: Number(fd.get('carryover_cash') || 0), rules: String(fd.get('rules') || '').trim(), players: COLORS.map((_, i) => ({ id: fd.get(`id_${i}`) || undefined, nickname: fd.get(`nickname_${i}`).trim(), security_code: fd.get(`code_${i}`).trim(), security_name: fd.get(`security_${i}`).trim(), purchase_price: Number(fd.get(`purchase_${i}`)), shares_owned: Number(fd.get(`shares_${i}`)), color: fd.get(`color_${i}`), display_order: i + 1 })) };
  }

  async function save(event) {
    event.preventDefault(); const button = event.submitter; SB.setLoading(button, true, editingBattle ? '更新中…' : '作成中…');
    try {
      const { fd, start, end, carryoverCash, rules, players } = payload();
      if (editingBattle) {
        const { error } = await SB.db.rpc('update_battle', { p_share_token: SB.token, p_name: fd.get('battle_name').trim(), p_start_date: start, p_end_date: end, p_carryover_cash: carryoverCash, p_rules: rules, p_players: players });
        if (error) throw error; location.href = SB.battleUrl('index.html');
      } else {
        const { data, error } = await SB.db.rpc('create_battle', { p_name: fd.get('battle_name').trim(), p_start_date: start, p_end_date: end, p_carryover_cash: carryoverCash, p_rules: rules, p_players: players });
        if (error) throw error; location.href = SB.battleUrl('index.html', data);
      }
    } catch (error) { SB.showMessage(error.message || '保存できませんでした。', 'error'); SB.setLoading(button, false); }
  }

  function openSaleEdit(playerId) {
    const player = editingBattle.players.find(p => p.id === playerId); if (!player) return;
    document.getElementById('sale-edit-player-id').value = player.id; document.getElementById('sale-edit-label').textContent = `${player.nickname} / ${player.security_name}`; document.getElementById('sale-edit-date').value = player.sold_date; document.getElementById('sale-edit-price').value = player.sold_price; document.getElementById('sale-edit-dialog').showModal();
  }
  async function saveSaleEdit(event) {
    event.preventDefault(); if (event.submitter?.value === 'cancel') { document.getElementById('sale-edit-dialog').close(); return; }
    try { const { error } = await SB.db.rpc('set_player_sale', { p_share_token: SB.token, p_player_id: document.getElementById('sale-edit-player-id').value, p_sold_date: document.getElementById('sale-edit-date').value, p_sold_price: Number(document.getElementById('sale-edit-price').value) }); if (error) throw error; document.getElementById('sale-edit-dialog').close(); editingBattle = await SB.loadBattle(); renderPlayers(editingBattle.players); SB.showMessage('利確情報を修正しました。'); }
    catch (error) { SB.showMessage(error.message || '修正できませんでした。', 'error'); }
  }
  async function clearSale(playerId) {
    const player = editingBattle.players.find(p => p.id === playerId); if (!player || !confirm(`${player.nickname}さんの利確を取り消しますか？`)) return;
    try { const { error } = await SB.db.rpc('clear_player_sale', { p_share_token: SB.token, p_player_id: playerId }); if (error) throw error; editingBattle = await SB.loadBattle(); renderPlayers(editingBattle.players); SB.showMessage('利確を取り消しました。'); }
    catch (error) { SB.showMessage(error.message || '取り消せませんでした。', 'error'); }
  }

  async function init() {
    SB.bindNav();
    if (!SB.configured) { document.getElementById('setup-required').classList.remove('hidden'); return; }
    renderSaved(); form.classList.remove('hidden'); renderPlayers(); form.start_date.value = SB.today();
    if (SB.token) {
      try {
        editingBattle = await SB.loadBattle(); document.getElementById('setup-title').textContent = '対戦内容を変更'; document.getElementById('setup-description').textContent = '変更しても過去の終値データは保持されます。'; document.getElementById('submit-button').textContent = '変更を保存する'; document.getElementById('new-battle-link').classList.remove('hidden');
        form.battle_name.value = editingBattle.name; form.start_date.value = editingBattle.start_date; form.end_date.value = editingBattle.end_date || ''; form.carryover_cash.value = editingBattle.carryover_cash || 0; form.rules.value = editingBattle.rules || ''; renderPlayers(editingBattle.players);
      } catch (error) { SB.showMessage(error.message, 'error'); }
    }
    form.addEventListener('submit', save); document.getElementById('sale-edit-form').addEventListener('submit', saveSaleEdit);
    document.addEventListener('click', event => { const edit = event.target.closest('.edit-sale'); const clear = event.target.closest('.clear-sale'); if (edit) openSaleEdit(edit.dataset.playerId); if (clear) clearSale(clear.dataset.playerId); });
  }
  init();
})();
