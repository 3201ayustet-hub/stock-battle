(() => {
  'use strict';
  const SB=window.StockBattle;
  const COLORS=['#2563eb','#ef4444','#10b981','#8b5cf6'];
  const form=document.getElementById('create-form');
  const playerFields=document.getElementById('player-fields');
  let editingBattle=null;

  const shareOptions=Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}株</option>`).join('');

  function renderPlayers(players=[]) {
    playerFields.innerHTML=COLORS.map((color,i)=>{
      const p=players[i]||{};
      return `<fieldset class="player-card" style="--player-color:${color}"><legend><span class="color-dot"></span>参加者 ${i+1}</legend><div class="form-grid two">
      <input type="hidden" name="id_${i}" value="${SB.escapeHtml(p.id||'')}">
      <label class="field full">ニックネーム<input name="nickname_${i}" required maxlength="30" value="${SB.escapeHtml(p.nickname||'')}"></label>
      <label class="field">銘柄コード<input name="code_${i}" required maxlength="10" inputmode="numeric" value="${SB.escapeHtml(p.security_code||'')}"></label>
      <label class="field">銘柄名<input name="security_${i}" required maxlength="60" value="${SB.escapeHtml(p.security_name||'')}"></label>
      <label class="field">取得単価<input name="purchase_${i}" type="number" min="0.01" step="0.01" required value="${p.purchase_price??''}"></label>
      <label class="field">所有株数<select name="shares_${i}" required>${shareOptions}</select></label>
      <input name="color_${i}" type="hidden" value="${color}"></div></fieldset>`;
    }).join('');
    players.forEach((p,i)=>{ const select=form.elements[`shares_${i}`]; if(select) select.value=String(Math.min(10,Math.max(1,Math.round(Number(p.shares_owned||1))))); });
  }

  function renderSaved() {
    const items=SB.savedBattles();
    if(!items.length)return;
    document.getElementById('saved-section').classList.remove('hidden');
    document.getElementById('saved-battles').innerHTML=items.map(item=>`<article class="saved-battle-item"><div><strong>${SB.escapeHtml(item.name)}</strong><small>${item.start_date?SB.dateText(item.start_date):''}</small></div><div class="saved-actions"><a class="primary button-link" href="${SB.battleUrl('index.html',item.token)}">開く</a><a class="secondary button-link" href="${SB.battleUrl('setup.html',item.token)}">編集</a></div></article>`).join('');
  }

  function payload() {
    const fd=new FormData(form);
    const start=fd.get('start_date'); const end=fd.get('end_date')||null;
    if(end&&end<start) throw new Error('終了日は開始日以降にしてください。');
    return {fd,start,end,carryoverCash:Number(fd.get('carryover_cash')||0),players:COLORS.map((_,i)=>({id:fd.get(`id_${i}`)||undefined,nickname:fd.get(`nickname_${i}`).trim(),security_code:fd.get(`code_${i}`).trim(),security_name:fd.get(`security_${i}`).trim(),purchase_price:Number(fd.get(`purchase_${i}`)),shares_owned:Number(fd.get(`shares_${i}`)),color:fd.get(`color_${i}`),display_order:i+1}))};
  }

  async function save(event) {
    event.preventDefault(); const button=event.submitter; SB.setLoading(button,true,editingBattle?'更新中…':'作成中…');
    try {
      const {fd,start,end,carryoverCash,players}=payload();
      if(editingBattle){
        const {error}=await SB.db.rpc('update_battle',{p_share_token:SB.token,p_name:fd.get('battle_name').trim(),p_start_date:start,p_end_date:end,p_carryover_cash:carryoverCash,p_players:players});
        if(error)throw error;
        editingBattle={...editingBattle,name:fd.get('battle_name').trim(),start_date:start,end_date:end,carryover_cash:carryoverCash,players}; SB.rememberBattle(editingBattle);
        location.href=SB.battleUrl('index.html');
      } else {
        const {data,error}=await SB.db.rpc('create_battle',{p_name:fd.get('battle_name').trim(),p_start_date:start,p_end_date:end,p_carryover_cash:carryoverCash,p_players:players});
        if(error)throw error;
        location.href=SB.battleUrl('index.html',data);
      }
    } catch(error){ SB.showMessage(error.message||'保存できませんでした。','error'); SB.setLoading(button,false); }
  }

  async function init(){
    if(!SB.configured){document.getElementById('setup-required').classList.remove('hidden');return;}
    renderSaved(); form.classList.remove('hidden'); renderPlayers(); form.start_date.value=SB.today();
    if(SB.token){
      try{
        editingBattle=await SB.loadBattle();
        document.getElementById('setup-mode-label').textContent='EDIT BATTLE'; document.getElementById('setup-title').textContent='対戦設定を変更'; document.getElementById('setup-description').textContent='変更すると既存の終値データは保持したまま、成長率が再計算されます。'; document.getElementById('submit-button').textContent='変更を保存する'; document.getElementById('new-battle-link').classList.remove('hidden');
        form.battle_name.value=editingBattle.name; form.start_date.value=editingBattle.start_date; form.end_date.value=editingBattle.end_date||''; form.carryover_cash.value=editingBattle.carryover_cash||0; renderPlayers(editingBattle.players);
      }catch(error){SB.showMessage(error.message,'error');}
    }
    form.addEventListener('submit',save);
  }
  init();
})();
