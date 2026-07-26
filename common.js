(() => {
  'use strict';
  const config = window.APP_CONFIG || {};
  const configured = Boolean(
    config.supabaseUrl && !config.supabaseUrl.includes('YOUR_PROJECT') &&
    config.supabasePublishableKey && !config.supabasePublishableKey.includes('YOUR_')
  );
  const STORAGE_KEY = 'stock-battle-saved-battles-v2';
  const LEGACY_KEYS = ['stock-battle-saved-battles-v1', 'stock-battle-saved-battles'];

  function parseList(raw) {
    try {
      const value = JSON.parse(raw || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  function readSaved() {
    const current = parseList(localStorage.getItem(STORAGE_KEY));
    const merged = [...current];
    for (const key of LEGACY_KEYS) {
      for (const item of parseList(localStorage.getItem(key))) {
        if (item?.token && !merged.some(x => x.token === item.token)) merged.push(item);
      }
    }
    return merged.filter(x => x?.token);
  }
  function writeSaved(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
  }
  function queryToken() {
    return new URLSearchParams(location.search).get('battle');
  }

  const api = {
    configured,
    db: configured ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null,
    token: queryToken(),
    yen(value) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
      return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Number(value));
    },
    number(value) { return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 }).format(Number(value)); },
    signedYen(value) {
      const n = Number(value || 0);
      return `${n >= 0 ? '+' : '-'}${this.yen(Math.abs(n))}`;
    },
    pct(value) {
      const n = Number(value || 0);
      return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
    },
    dateText(date) {
      if (!date) return '未登録';
      return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(`${date}T00:00:00`));
    },
    shortDate(date) {
      return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T00:00:00`));
    },
    escapeHtml(value = '') {
      return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    },
    today() { return new Date().toLocaleDateString('sv-SE'); },
    battleUrl(page = 'index.html', token = this.token) {
      return token ? `${page}?battle=${encodeURIComponent(token)}` : page;
    },
    savedBattles() { return readSaved(); },
    async listBattles() {
      if (!this.configured) throw new Error('Supabaseの初期設定が必要です。');
      const { data, error } = await this.db.rpc('list_battles');
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    lastToken() { return readSaved()[0]?.token || null; },
    rememberBattle(battle, token = this.token) {
      if (!token || !battle) return;
      const items = readSaved().filter(x => x.token !== token);
      items.unshift({
        token,
        name: battle.name,
        start_date: battle.start_date,
        end_date: battle.end_date,
        last_opened: new Date().toISOString()
      });
      writeSaved(items);
    },
    forgetBattle(token) { writeSaved(readSaved().filter(x => x.token !== token)); },
    restoreOrRedirect(page = 'index.html') {
      if (this.token) return true;
      const token = this.lastToken();
      if (token) {
        location.replace(this.battleUrl(page, token));
        return false;
      }
      return true;
    },
    async loadBattle(token = this.token) {
      if (!this.configured) throw new Error('Supabaseの初期設定が必要です。');
      if (!token) throw new Error('対戦IDがありません。');
      const { data, error } = await this.db.rpc('get_battle', { p_share_token: token });
      if (error) throw error;
      if (!data) throw new Error('対戦が見つかりません。');
      this.rememberBattle(data, token);
      return data;
    },
    bindNav() {
      document.querySelectorAll('[data-page]').forEach(link => {
        link.href = link.dataset.page === 'setup.html' ? 'setup.html' : this.battleUrl(link.dataset.page);
      });
    },
    latestPrice(playerId, prices, onOrBefore = null) {
      return prices
        .filter(p => p.player_id === playerId && (!onOrBefore || p.trade_date <= onOrBefore))
        .sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0] || null;
    },
    showMessage(text, type = 'notice') {
      const el = document.getElementById(type);
      if (!el) return;
      el.textContent = text;
      el.classList.remove('hidden');
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.add('hidden'), 5000);
    },
    setLoading(button, loading, label = '保存中…') {
      if (!button) return;
      if (loading) {
        button.dataset.original = button.textContent;
        button.textContent = label;
        button.disabled = true;
      } else {
        button.textContent = button.dataset.original || button.textContent;
        button.disabled = false;
      }
    }
  };
  window.StockBattle = api;
})();
