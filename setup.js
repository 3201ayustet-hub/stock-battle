(() => {
  'use strict';
  const SB = window.StockBattle;
  const COLORS = ['#2563eb', '#ef4444', '#10b981', '#8b5cf6'];
  const form = document.getElementById('create-form');
  const playerFields = document.getElementById('player-fields');

  function renderPlayers() {
    playerFields.innerHTML = COLORS.map((color, i) => `
      <fieldset class="player-card" style="--player-color:${color}">
        <legend><span class="color-dot"></span>参加者 ${i + 1}</legend>
        <div class="form-grid two">
          <label class="field full">ニックネーム<input name="nickname_${i}" required maxlength="30" placeholder="例：たろう"></label>
          <label class="field">銘柄コード<input name="code_${i}" required maxlength="10" inputmode="numeric" placeholder="例：7203"></label>
          <label class="field">銘柄名<input name="security_${i}" required maxlength="60" placeholder="例：トヨタ自動車"></label>
          <label class="field">購入価格（1株）<input name="purchase_${i}" type="number" min="0.01" step="0.01" required placeholder="例：2850"></label>
          <label class="field">所有株数<input name="shares_${i}" type="number" min="1" step="1" required placeholder="例：100"></label>
          <label class="field full">繰越余剰金<input name="cash_${i}" type="number" min="0" step="1" required value="0" placeholder="例：15000"></label>
          <input name="color_${i}" type="hidden" value="${color}">
        </div>
        <p class="field-help">開始時資産 ＝ 購入価格 × 所有株数 ＋ 繰越余剰金</p>
      </fieldset>
    `).join('');
  }

  async function createBattle(event) {
    event.preventDefault();
    const button = event.submitter;
    SB.setLoading(button, true, '作成中…');
    try {
      const fd = new FormData(form);
      const start = fd.get('start_date');
      const end = fd.get('end_date') || null;
      if (end && end < start) throw new Error('終了日は開始日以降にしてください。');
      const players = COLORS.map((_, i) => ({
        nickname: fd.get(`nickname_${i}`).trim(),
        security_code: fd.get(`code_${i}`).trim(),
        security_name: fd.get(`security_${i}`).trim(),
        purchase_price: Number(fd.get(`purchase_${i}`)),
        shares_owned: Number(fd.get(`shares_${i}`)),
        carryover_cash: Number(fd.get(`cash_${i}`)),
        color: fd.get(`color_${i}`),
        display_order: i + 1
      }));
      const { data, error } = await SB.db.rpc('create_battle', {
        p_name: fd.get('battle_name').trim(),
        p_start_date: start,
        p_end_date: end,
        p_players: players
      });
      if (error) throw error;
      location.href = `index.html?battle=${encodeURIComponent(data)}`;
    } catch (error) {
      SB.showMessage(error.message || '対戦を作成できませんでした。', 'error');
      SB.setLoading(button, false);
    }
  }

  renderPlayers();
  if (!SB.configured) {
    document.getElementById('setup-required').classList.remove('hidden');
  } else {
    form.classList.remove('hidden');
    form.start_date.value = SB.today();
    form.addEventListener('submit', createBattle);
  }
})();
