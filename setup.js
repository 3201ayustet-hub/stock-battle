(() => {
  'use strict';
  const SB = window.StockBattle;
  const COLORS = ['#3b82f6', '#f43f5e', '#22c55e', '#a855f7'];
  const form = document.getElementById('create-form');
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'list';
  let editingBattle = null;
  const sharesOptions = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}株</option>`).join('');

  function showListMode() {
    document.getElementById('setup-title').textContent = '保存済みの対戦';
    document.getElementById('setup-description').textContent = '編集する対戦を選択します。';
    document.getElementById('new-battle-link').classList.remove('hidden');
    document.getElementById('back-to-list').classList.add('hidden');
    document.getElementById('saved-section').classList.remove('hidden');
    form.classList.add('hidden');
  }

  function showFormMode(isEdit) {
    document.getElementById('setup-title').textContent = isEdit ? '対戦内容を変更' : '新しい対戦';
    document.getElementById('setup-description').textContent = isEdit ? '大会・参加者・ルールを編集します。' : '大会・参加者・ルールを登録します。';
    document.getElementById('new-battle-link').classList.add('hidden');
    document.getElementById('back-to-list').classList.remove('hidden');
    document.getElementById('saved-section').classList.add('hidden');
    form.classList.remove('hidden');
    document.getElementById('submit-button').textContent = isEdit ? '変更を保存する' : '対戦を作成する';
    document.getElementById('danger-zone').classList.toggle('hidden', !isEdit);
  }

  function renderPlayers(players = []) {
    document.getElementById('player-fields').innerHTML = COLORS.map((color, i) => {
      const p = players[i] || {};
      const sale = p.is_sold ? `<div class="sale-admin"><span class="sold-badge">✓ 利確済み</span><span>${SB.yen(p.sold_price)} / ${SB.dateText(p.sold_date)}</span><button type="button" class="secondary compact-button edit-sale" data-player-id="${p.id}">修正</button><button type="button" class="danger compact-button clear-sale" data-player-id="${p.id}">取消</button></div>` : '';
      return `<fieldset class="player-line" style="--player-color:${color}"><legend><span class="color-dot"></span>参加者 ${i + 1}</legend><input type="hidden" name="id_${i}" value="${SB.escapeHtml(p.id || '')}"><div class="player-fields-row"><label class="field">名前<input name="nickname_${i}" required maxlength="30" value="${SB.escapeHtml(p.nickname || '')}"></label><label class="field">コード<input name="code_${i}" required maxlength="10" inputmode="numeric" value="${SB.escapeHtml(p.security_code || '')}"></label><label class="field wide">銘柄名<input name="security_${i}" required maxlength="60" value="${SB.escapeHtml(p.security_name || '')}"></label><label class="field">取得単価<input name="purchase_${i}" type="number" min="0.01" step="0.01" required value="${p.purchase_price ?? ''}"></label><label class="field small">株数<select name="shares_${i}">${sharesOptions}</select></label><input name="color_${i}" type="hidden" value="${color}"></div>${sale}</fieldset>`;
    }).join('');
    players.forEach((p, i) => {
      if (form.elements[`shares_${i}`]) form.elements[`shares_${i}`].value = String(Math.min(10, Math.max(1, Math.round(Number(p.shares_owned || 1)))));
    });
  }

  async function renderSaved() {
    const section = document.getElementById('saved-section');
    const list = document.getElementById('saved-battles');
    list.innerHTML = '<p class="muted">読み込み中…</p>';
    section.classList.remove('hidden');
    try {
      const items = await SB.listBattles();
      if (!items.length) {
        list.innerHTML = '<div class="empty-state"><p>保存済みの対戦はありません。</p><a class="primary button-link" href="setup.html?mode=new">新しい対戦を作成</a></div>';
        return;
      }
      list.innerHTML = items.map(item => `<article class="saved-battle-item"><div><strong>${SB.escapeHtml(item.name)}</strong><small>${item.start_date ? SB.dateText(item.start_date) : ''}</small></div><div class="saved-actions"><a class="primary button-link compact-button" href="${SB.battleUrl('index.html', item.share_token)}">開く</a><a class="secondary button-link compact-button" href="setup.html?mode=edit&battle=${encodeURIComponent(item.share_token)}">設定</a><button type="button" class="danger compact-button delete-saved-battle" data-token="${SB.escapeHtml(item.share_token)}" data-name="${SB.escapeHtml(item.name)}">削除</button></div></article>`).join('');
    } catch (error) {
      list.innerHTML = '<p class="muted">一覧を取得できませんでした。</p>';
      SB.showMessage(error.message || '保存済みの対戦を取得できませんでした。', 'error');
    }
  }

  async function deleteSavedBattle(token, name) {
    if (!token || !confirm(`「${name}」を削除しますか？\n終値履歴も削除され、元に戻せません。`)) return;
    try {
      const { error } = await SB.db.rpc('delete_battle', { p_share_token: token });
      if (error) throw error;
      SB.forgetBattle(token);
      await renderSaved();
      SB.showMessage('対戦を削除しました。');
    } catch (error) {
      SB.showMessage(error.message || '削除できませんでした。', 'error');
    }
  }

  function payload() {
    const fd = new FormData(form);
    const start = String(fd.get('start_date'));
    const end = String(fd.get('end_date') || '') || null;
    if (end && end < start) throw new Error('終了日は開始日以降にしてください。');
    const initialAssets = Number(fd.get('initial_assets'));
    const carryoverCash = Number(fd.get('carryover_cash') || 0);
    if (!Number.isFinite(initialAssets) || initialAssets < 0) throw new Error('初期資産額を入力してください。');
    return {
      fd, start, end, initialAssets, carryoverCash,
      rules: String(fd.get('rules') || '').trim(),
      players: COLORS.map((_, i) => ({
        id: fd.get(`id_${i}`) || undefined,
        nickname: String(fd.get(`nickname_${i}`)).trim(),
        security_code: String(fd.get(`code_${i}`)).trim(),
        security_name: String(fd.get(`security_${i}`)).trim(),
        purchase_price: Number(fd.get(`purchase_${i}`)),
        shares_owned: Number(fd.get(`shares_${i}`)),
        color: fd.get(`color_${i}`),
        display_order: i + 1
      }))
    };
  }

  async function save(event) {
    event.preventDefault();
    const button = event.submitter;
    SB.setLoading(button, true, editingBattle ? '更新中…' : '作成中…');
    try {
      const p = payload();
      const args = {
        p_name: p.fd.get('battle_name').trim(), p_start_date: p.start, p_end_date: p.end,
        p_initial_assets: p.initialAssets, p_carryover_cash: p.carryoverCash,
        p_rules: p.rules, p_players: p.players
      };
      if (editingBattle) {
        const { error } = await SB.db.rpc('update_battle', { p_share_token: SB.token, ...args });
        if (error) throw error;
      } else {
        const { data, error } = await SB.db.rpc('create_battle', args);
        if (error) throw error;
        if (data) SB.rememberBattle({ name: args.p_name, start_date: args.p_start_date, end_date: args.p_end_date }, data);
      }
      location.href = 'setup.html';
    } catch (error) {
      SB.showMessage(error.message || '保存できませんでした。', 'error');
      SB.setLoading(button, false);
    }
  }

  function openSaleEdit(playerId) {
    const player = editingBattle?.players.find(p => p.id === playerId);
    if (!player) return;
    document.getElementById('sale-edit-player-id').value = player.id;
    document.getElementById('sale-edit-label').textContent = `${player.nickname} / ${player.security_name}`;
    document.getElementById('sale-edit-date').value = player.sold_date;
    document.getElementById('sale-edit-price').value = player.sold_price;
    document.getElementById('sale-edit-dialog').showModal();
  }

  async function saveSaleEdit(event) {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { document.getElementById('sale-edit-dialog').close(); return; }
    try {
      const { error } = await SB.db.rpc('set_player_sale', {
        p_share_token: SB.token,
        p_player_id: document.getElementById('sale-edit-player-id').value,
        p_sold_date: document.getElementById('sale-edit-date').value,
        p_sold_price: Number(document.getElementById('sale-edit-price').value)
      });
      if (error) throw error;
      document.getElementById('sale-edit-dialog').close();
      editingBattle = await SB.loadBattle();
      renderPlayers(editingBattle.players);
      SB.showMessage('利確情報を修正しました。');
    } catch (error) { SB.showMessage(error.message || '修正できませんでした。', 'error'); }
  }

  async function clearSale(playerId) {
    const player = editingBattle?.players.find(p => p.id === playerId);
    if (!player || !confirm(`${player.nickname}さんの利確を取り消しますか？`)) return;
    try {
      const { error } = await SB.db.rpc('clear_player_sale', { p_share_token: SB.token, p_player_id: playerId });
      if (error) throw error;
      editingBattle = await SB.loadBattle();
      renderPlayers(editingBattle.players);
      SB.showMessage('利確を取り消しました。');
    } catch (error) { SB.showMessage(error.message || '取り消せませんでした。', 'error'); }
  }

  async function deleteBattle() {
    if (!editingBattle || !confirm(`「${editingBattle.name}」を削除しますか？\n終値履歴も削除され、元に戻せません。`)) return;
    try {
      const { error } = await SB.db.rpc('delete_battle', { p_share_token: SB.token });
      if (error) throw error;
      SB.forgetBattle(SB.token);
      location.href = 'setup.html';
    } catch (error) { SB.showMessage(error.message || '削除できませんでした。', 'error'); }
  }

  async function init() {
    SB.bindNav();
    if (!SB.configured) { document.getElementById('setup-required').classList.remove('hidden'); return; }

    form.addEventListener('submit', save);
    document.getElementById('sale-edit-form').addEventListener('submit', saveSaleEdit);
    document.getElementById('delete-battle').addEventListener('click', deleteBattle);
    document.addEventListener('click', event => {
      const edit = event.target.closest('.edit-sale');
      const clear = event.target.closest('.clear-sale');
      const deleteSaved = event.target.closest('.delete-saved-battle');
      if (edit) openSaleEdit(edit.dataset.playerId);
      if (clear) clearSale(clear.dataset.playerId);
      if (deleteSaved) deleteSavedBattle(deleteSaved.dataset.token, deleteSaved.dataset.name);
    });

    if (mode === 'new') {
      showFormMode(false);
      renderPlayers();
      form.start_date.value = SB.today();
      return;
    }

    if (mode === 'edit') {
      if (!SB.token) {
        SB.showMessage('編集する対戦が指定されていません。', 'error');
        showListMode();
        await renderSaved();
        return;
      }
      showFormMode(true);
      try {
        editingBattle = await SB.loadBattle();
        form.battle_name.value = editingBattle.name;
        form.start_date.value = editingBattle.start_date;
        form.end_date.value = editingBattle.end_date || '';
        form.initial_assets.value = editingBattle.initial_assets ?? '';
        form.carryover_cash.value = editingBattle.carryover_cash || 0;
        form.rules.value = editingBattle.rules || '';
        renderPlayers(editingBattle.players);
      } catch (error) {
        SB.showMessage(error.message || '読み込めませんでした。', 'error');
        showListMode();
        await renderSaved();
      }
      return;
    }

    showListMode();
    await renderSaved();
  }

  init();
})();
