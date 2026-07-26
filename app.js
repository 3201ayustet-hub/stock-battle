(() => {
  'use strict';
  const COLORS = ['#2563eb','#dc2626','#16a34a','#9333ea'];
  const config = window.APP_CONFIG || {};
  const configured = config.supabaseUrl && !config.supabaseUrl.includes('YOUR_PROJECT') && config.supabasePublishableKey && !config.supabasePublishableKey.includes('YOUR_');
  const db = configured ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
  let token = new URLSearchParams(location.search).get('battle');
  let battle = null;
  let chart = null;

  const $ = (id) => document.getElementById(id);
  const views = ['setup','create','dashboard','input','history'];
  const show = (name) => views.forEach(v => $(`${v}-view`).classList.toggle('hidden', v !== name));
  const yen = (value) => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:2}).format(value);
  const pct = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const dateText = (date) => new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium'}).format(new Date(`${date}T00:00:00`));
  const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function message(text, type='notice') { const el=$(type); el.textContent=text; el.classList.remove('hidden'); setTimeout(()=>el.classList.add('hidden'),5000); }
  function setLoading(button, loading, label='保存中…') { if (!button) return; if (loading) { button.dataset.original=button.textContent; button.textContent=label; button.disabled=true; } else { button.textContent=button.dataset.original || button.textContent; button.disabled=false; } }

  function renderPlayerFields() {
    $('player-fields').innerHTML = COLORS.map((color,i)=>`<fieldset class="player-card"><h3><span class="color-dot" style="background:${color}"></span>参加者 ${i+1}</h3><div class="form-grid"><label>ニックネーム<input name="nickname_${i}" required maxlength="30" placeholder="例：たろう"></label><label>銘柄コード<input name="code_${i}" required maxlength="10" inputmode="numeric" placeholder="例：7203"></label><label>銘柄名<input name="security_${i}" required maxlength="60" placeholder="例：トヨタ自動車"></label><label>購入価格<input name="purchase_${i}" type="number" min="0.01" step="0.01" required placeholder="例：2850"></label><input name="color_${i}" type="hidden" value="${color}"></div></fieldset>`).join('');
  }

  async function createBattle(event) {
    event.preventDefault(); const button=event.submitter; setLoading(button,true,'作成中…');
    try {
      const form=new FormData(event.currentTarget); const start=form.get('start_date'); const end=form.get('end_date')||null;
      if (end && end < start) throw new Error('終了日は開始日以降にしてください。');
      const players=COLORS.map((_,i)=>({nickname:form.get(`nickname_${i}`).trim(),security_code:form.get(`code_${i}`).trim(),security_name:form.get(`security_${i}`).trim(),purchase_price:Number(form.get(`purchase_${i}`)),color:form.get(`color_${i}`),display_order:i+1}));
      const {data,error}=await db.rpc('create_battle',{p_name:form.get('battle_name').trim(),p_start_date:start,p_end_date:end,p_players:players});
      if(error) throw error; token=data; location.href=`${location.pathname}?battle=${encodeURIComponent(token)}#dashboard`;
    } catch(e) { message(e.message||'対戦を作成できませんでした。','error'); setLoading(button,false); }
  }

  async function loadBattle() {
    const {data,error}=await db.rpc('get_battle',{p_share_token:token});
    if(error) throw error; if(!data) throw new Error('対戦が見つかりません。URLを確認してください。'); battle=data; renderAll();
  }

  function renderAll() {
    $('main-nav').classList.remove('hidden'); $('battle-title').textContent=battle.name;
    $('battle-period').textContent=`${dateText(battle.start_date)} 〜 ${battle.end_date ? dateText(battle.end_date) : '終了日未設定'}`;
    renderDashboard(); renderPriceForm(); renderHistory(); route();
  }

  function latestCompleteDate() {
    const dates=[...new Set(battle.prices.map(p=>p.trade_date))].sort().reverse();
    return dates.find(d=>battle.players.every(pl=>battle.prices.some(p=>p.player_id===pl.id&&p.trade_date===d)))||null;
  }

  function renderDashboard() {
    const latest=latestCompleteDate(); $('latest-date').textContent=latest?`最新の比較日：${dateText(latest)}`:'終値はまだ登録されていません。';
    const rows=battle.players.map(player=>{ const price=latest?battle.prices.find(p=>p.player_id===player.id&&p.trade_date===latest):null; const growth=price?((Number(price.close_price)-Number(player.purchase_price))/Number(player.purchase_price))*100:null; return {player,price,growth}; }).sort((a,b)=>(b.growth??-Infinity)-(a.growth??-Infinity));
    $('ranking-cards').innerHTML=rows.map((r,i)=>`<article class="rank-card" style="--player-color:${escapeHtml(r.player.color)}"><div class="rank-number">${r.growth===null?'—':`${i+1}位`}</div><h3>${escapeHtml(r.player.nickname)}</h3><div class="muted">${escapeHtml(r.player.security_name)}（${escapeHtml(r.player.security_code)}）</div><div class="performance ${r.growth===null?'':r.growth>=0?'positive':'negative'}">${r.growth===null?'未登録':pct(r.growth)}</div><div>購入 ${yen(r.player.purchase_price)}</div><div>終値 ${r.price?yen(r.price.close_price):'—'}</div></article>`).join('');
    renderChart();
  }

  function renderChart() {
    const labels=[...new Set(battle.prices.map(p=>p.trade_date))].sort(); const empty=labels.length===0; $('empty-chart').classList.toggle('hidden',!empty); $('growth-chart').classList.toggle('hidden',empty); if(chart){chart.destroy();chart=null;} if(empty)return;
    const datasets=battle.players.map(player=>({label:`${player.nickname} / ${player.security_code}`,data:labels.map(date=>{const p=battle.prices.find(x=>x.player_id===player.id&&x.trade_date===date); return p?Number((((Number(p.close_price)-Number(player.purchase_price))/Number(player.purchase_price))*100).toFixed(4)):null;}),borderColor:player.color,backgroundColor:player.color,tension:.2,spanGaps:true,pointRadius:3}));
    chart=new Chart($('growth-chart'),{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},scales:{y:{title:{display:true,text:'成長率（%）'},grid:{color:(ctx)=>ctx.tick.value===0?'#7b8794':'#e8edf2'}},x:{title:{display:true,text:'取引日'}}},plugins:{tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${pct(ctx.parsed.y)}`}}}}});
  }

  function renderPriceForm() {
    $('price-fields').innerHTML=battle.players.map(p=>`<label class="price-card" style="--player-color:${escapeHtml(p.color)}"><span>${escapeHtml(p.nickname)} — ${escapeHtml(p.security_name)}（${escapeHtml(p.security_code)}）</span><small class="muted">購入価格 ${yen(p.purchase_price)}</small><input name="price_${p.id}" type="number" min="0.01" step="0.01" required placeholder="終値"></label>`).join('');
    $('trade-date').value=new Date().toLocaleDateString('sv-SE');
  }

  async function savePrices(event) {
    event.preventDefault(); const button=event.submitter; const fd=new FormData(event.currentTarget); const tradeDate=fd.get('trade_date');
    if(tradeDate>new Date().toLocaleDateString('sv-SE')) return message('未来の日付は登録できません。','error');
    const existing=battle.prices.some(p=>p.trade_date===tradeDate); if(existing&&!confirm(`${dateText(tradeDate)}のデータを上書きしますか？`))return;
    const prices=battle.players.map(p=>({player_id:p.id,close_price:Number(fd.get(`price_${p.id}`)),note:$('price-note').value.trim()})); setLoading(button,true);
    try { const {error}=await db.rpc('save_daily_prices',{p_share_token:token,p_trade_date:tradeDate,p_prices:prices}); if(error)throw error; await loadBattle(); message('終値を保存しました。'); location.hash='dashboard'; } catch(e){message(e.message||'保存できませんでした。','error');} finally{setLoading(button,false);}
  }

  function renderHistory() {
    const tbody=$('history-body'); const rows=[...battle.prices].sort((a,b)=>b.trade_date.localeCompare(a.trade_date)||a.player_id.localeCompare(b.player_id)); $('empty-history').classList.toggle('hidden',rows.length>0);
    tbody.innerHTML=rows.map(p=>{const player=battle.players.find(x=>x.id===p.player_id);return `<tr><td>${dateText(p.trade_date)}</td><td>${escapeHtml(player?.nickname||'')}</td><td>${escapeHtml(player?.security_name||'')}（${escapeHtml(player?.security_code||'')}）</td><td>${yen(p.close_price)}</td><td>${escapeHtml(p.note||'')}</td><td><div class="action-group"><button class="secondary edit-price" data-id="${p.id}">修正</button><button class="danger delete-price" data-id="${p.id}">削除</button></div></td></tr>`}).join('');
  }

  async function deletePrice(id) { if(!confirm('この終値を削除しますか？'))return; try{const {error}=await db.rpc('delete_price',{p_share_token:token,p_price_id:id});if(error)throw error;await loadBattle();message('削除しました。');}catch(e){message(e.message||'削除できませんでした。','error');} }
  function openEdit(id) { const p=battle.prices.find(x=>x.id===id); if(!p)return; $('edit-price-id').value=p.id;$('edit-date').value=p.trade_date;$('edit-close').value=p.close_price;$('edit-note').value=p.note||'';$('edit-dialog').showModal(); }
  async function editPrice(event) { event.preventDefault(); const submitter=event.submitter; if(submitter?.value==='cancel'){ $('edit-dialog').close(); return; } try{const {error}=await db.rpc('update_price',{p_share_token:token,p_price_id:$('edit-price-id').value,p_trade_date:$('edit-date').value,p_close_price:Number($('edit-close').value),p_note:$('edit-note').value.trim()});if(error)throw error;$('edit-dialog').close();await loadBattle();message('修正しました。');}catch(e){message(e.message||'修正できませんでした。','error');} }

  function exportJson() { const blob=new Blob([JSON.stringify(battle,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`stock-battle-${battle.name}-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href); }
  function route() { if(!battle)return; const name=(location.hash||'#dashboard').slice(1); show(['dashboard','input','history'].includes(name)?name:'dashboard'); window.scrollTo({top:0,behavior:'smooth'}); }

  document.addEventListener('click',(e)=>{const nav=e.target.closest('[data-view]');if(nav)location.hash=nav.dataset.view; const edit=e.target.closest('.edit-price');if(edit)openEdit(edit.dataset.id);const del=e.target.closest('.delete-price');if(del)deletePrice(del.dataset.id);});
  $('create-form').addEventListener('submit',createBattle); $('price-form').addEventListener('submit',savePrices); $('edit-form').addEventListener('submit',editPrice); $('export-button').addEventListener('click',exportJson); $('copy-link-button').addEventListener('click',async()=>{await navigator.clipboard.writeText(location.href.split('#')[0]);message('共有URLをコピーしました。');}); window.addEventListener('hashchange',route);

  async function init() { renderPlayerFields(); if(!configured){show('setup');return;} if(!token){show('create');$('create-form').start_date.value=new Date().toLocaleDateString('sv-SE');return;} try{await loadBattle();}catch(e){show('create');message(e.message||'データを読み込めませんでした。','error');} }
  init();
})();
