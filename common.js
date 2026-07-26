(() => {
  'use strict';
  const config = window.APP_CONFIG || {};
  const configured = Boolean(
    config.supabaseUrl &&
    !config.supabaseUrl.includes('YOUR_PROJECT') &&
    config.supabasePublishableKey &&
    !config.supabasePublishableKey.includes('YOUR_')
  );

  window.StockBattle = {
    configured,
    db: configured ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null,
    token: new URLSearchParams(location.search).get('battle'),
    yen(value) {
      return new Intl.NumberFormat('ja-JP', {
        style: 'currency', currency: 'JPY', maximumFractionDigits: 2
      }).format(Number(value));
    },
    number(value) {
      return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 }).format(Number(value));
    },
    signedYen(value) {
      const number = Number(value);
      const formatted = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Math.abs(number));
      return `${number >= 0 ? '+' : '-'}${formatted}`;
    },
    pct(value) {
      const number = Number(value);
      return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
    },
    dateText(date) {
      return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' })
        .format(new Date(`${date}T00:00:00`));
    },
    escapeHtml(value = '') {
      return String(value).replace(/[&<>'"]/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
      }[c]));
    },
    today() {
      return new Date().toLocaleDateString('sv-SE');
    },
    battleUrl(page = 'index.html') {
      const token = this.token;
      return token ? `${page}?battle=${encodeURIComponent(token)}` : page;
    },
    showMessage(text, type = 'notice') {
      const el = document.getElementById(type);
      if (!el) return;
      el.textContent = text;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 5000);
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
    },
    async loadBattle() {
      if (!this.configured) throw new Error('Supabaseの初期設定が必要です。');
      if (!this.token) throw new Error('共有URLに対戦IDがありません。');
      const { data, error } = await this.db.rpc('get_battle', { p_share_token: this.token });
      if (error) throw error;
      if (!data) throw new Error('対戦が見つかりません。共有URLを確認してください。');
      return data;
    },
    bindNav() {
      document.querySelectorAll('[data-page]').forEach(link => {
        const page = link.dataset.page;
        link.href = this.battleUrl(page);
      });
    }
  };
})();
