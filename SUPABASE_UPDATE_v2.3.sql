-- Ver.2.3: 画面表示・ランキング計算のみの更新です。
-- データベース構造はVer.2.2から変更ありません。
-- 新規環境やVer.2.1以前から更新する場合にも使える完全版SQLです。

-- 株価成長バトル Ver.2.3 更新SQL
-- 全文をSupabase SQL Editorへ貼り付けて1回実行してください。

alter table public.battles
  add column if not exists carryover_cash numeric(16,2) not null default 0,
  add column if not exists initial_assets numeric(16,2),
  add column if not exists rules text not null default '';

alter table public.players
  add column if not exists shares_owned numeric(14,4) not null default 1,
  add column if not exists is_sold boolean not null default false,
  add column if not exists sold_date date,
  add column if not exists sold_price numeric(14,4);

-- 既存対戦の初期資産額は「取得単価×株数の合計＋繰越余剰金」で補完します。
update public.battles b
set initial_assets = coalesce(x.purchase_total, 0) + coalesce(b.carryover_cash, 0)
from (
  select battle_id, sum(coalesce(purchase_price,0) * coalesce(shares_owned,1)) purchase_total
  from public.players group by battle_id
) x
where b.id = x.battle_id and b.initial_assets is null;

update public.battles set initial_assets = coalesce(carryover_cash,0) where initial_assets is null;

alter table public.battles alter column initial_assets set not null;

-- 制約は再実行可能な形で追加します。
do $$ begin
  alter table public.battles add constraint battles_initial_assets_nonnegative check (initial_assets >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.battles add constraint battles_carryover_cash_nonnegative check (carryover_cash >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.battles add constraint battles_rules_length check (char_length(rules) <= 5000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.players add constraint players_shares_1_to_10 check (shares_owned between 1 and 10 and trunc(shares_owned)=shares_owned);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.players add constraint players_sale_complete check (
    (is_sold=false and sold_date is null and sold_price is null)
    or (is_sold=true and sold_date is not null and sold_price > 0)
  );
exception when duplicate_object then null; end $$;

-- 旧版の関数シグネチャを整理します。
drop function if exists public.create_battle(text,date,date,numeric,jsonb);
drop function if exists public.create_battle(text,date,date,numeric,text,jsonb);
drop function if exists public.update_battle(text,text,date,date,numeric,jsonb);
drop function if exists public.update_battle(text,text,date,date,numeric,text,jsonb);

create or replace function public.create_battle(
  p_name text, p_start_date date, p_end_date date, p_initial_assets numeric,
  p_carryover_cash numeric, p_rules text, p_players jsonb
) returns text language plpgsql security definer set search_path=public as $$
declare v_battle public.battles; v_player jsonb; v_shares numeric;
begin
  if trim(coalesce(p_name,''))='' then raise exception '対戦名を入力してください'; end if;
  if p_start_date is null then raise exception '開始日を入力してください'; end if;
  if p_end_date is not null and p_end_date < p_start_date then raise exception '終了日は開始日以降にしてください'; end if;
  if p_initial_assets is null or p_initial_assets < 0 then raise exception '初期資産額は0円以上にしてください'; end if;
  if coalesce(p_carryover_cash,0) < 0 then raise exception '繰越余剰金は0円以上にしてください'; end if;
  if char_length(coalesce(p_rules,'')) > 5000 then raise exception '大会ルールは5000文字以内にしてください'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> 4 then raise exception '参加者は4人必要です'; end if;
  insert into public.battles(name,start_date,end_date,initial_assets,carryover_cash,rules)
  values(trim(p_name),p_start_date,p_end_date,p_initial_assets,coalesce(p_carryover_cash,0),coalesce(p_rules,'')) returning * into v_battle;
  for v_player in select * from jsonb_array_elements(p_players) loop
    v_shares:=coalesce((v_player->>'shares_owned')::numeric,1);
    if trim(coalesce(v_player->>'nickname',''))='' then raise exception '参加者名を入力してください'; end if;
    if coalesce((v_player->>'purchase_price')::numeric,0)<=0 then raise exception '取得単価を正しく入力してください'; end if;
    if v_shares<1 or v_shares>10 or trunc(v_shares)<>v_shares then raise exception '株数は1〜10株の整数にしてください'; end if;
    insert into public.players(battle_id,nickname,security_code,security_name,purchase_price,shares_owned,color,display_order)
    values(v_battle.id,trim(v_player->>'nickname'),trim(v_player->>'security_code'),trim(v_player->>'security_name'),(v_player->>'purchase_price')::numeric,v_shares,v_player->>'color',(v_player->>'display_order')::smallint);
  end loop;
  return v_battle.share_token;
end $$;

create or replace function public.update_battle(
  p_share_token text, p_name text, p_start_date date, p_end_date date, p_initial_assets numeric,
  p_carryover_cash numeric, p_rules text, p_players jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare v_battle_id uuid; v_player jsonb; v_player_id uuid; v_shares numeric;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  if trim(coalesce(p_name,''))='' then raise exception '対戦名を入力してください'; end if;
  if p_end_date is not null and p_end_date < p_start_date then raise exception '終了日は開始日以降にしてください'; end if;
  if p_initial_assets is null or p_initial_assets < 0 then raise exception '初期資産額は0円以上にしてください'; end if;
  if coalesce(p_carryover_cash,0)<0 then raise exception '繰越余剰金は0円以上にしてください'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players)<>4 then raise exception '参加者は4人必要です'; end if;
  update public.battles set name=trim(p_name),start_date=p_start_date,end_date=p_end_date,initial_assets=p_initial_assets,carryover_cash=coalesce(p_carryover_cash,0),rules=coalesce(p_rules,'') where id=v_battle_id;
  for v_player in select * from jsonb_array_elements(p_players) loop
    v_player_id:=(v_player->>'id')::uuid; v_shares:=coalesce((v_player->>'shares_owned')::numeric,1);
    if v_shares<1 or v_shares>10 or trunc(v_shares)<>v_shares then raise exception '株数は1〜10株の整数にしてください'; end if;
    update public.players set nickname=trim(v_player->>'nickname'),security_code=trim(v_player->>'security_code'),security_name=trim(v_player->>'security_name'),purchase_price=(v_player->>'purchase_price')::numeric,shares_owned=v_shares,color=v_player->>'color',display_order=(v_player->>'display_order')::smallint where id=v_player_id and battle_id=v_battle_id;
    if not found then raise exception '参加者情報が不正です'; end if;
  end loop;
end $$;

create or replace function public.get_battle(p_share_token text) returns jsonb language sql security definer stable set search_path=public as $$
select jsonb_build_object('id',b.id,'name',b.name,'start_date',b.start_date,'end_date',b.end_date,'initial_assets',b.initial_assets,'carryover_cash',b.carryover_cash,'rules',b.rules,'created_at',b.created_at,'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order) from public.players p where p.battle_id=b.id),'[]'::jsonb),'prices',coalesce((select jsonb_agg(to_jsonb(d) order by d.trade_date,d.player_id) from public.daily_prices d where d.battle_id=b.id),'[]'::jsonb)) from public.battles b where b.share_token=p_share_token;
$$;

create or replace function public.save_daily_prices(p_share_token text,p_trade_date date,p_prices jsonb) returns void language plpgsql security definer set search_path=public as $$
declare v_battle_id uuid; v_item jsonb; v_player_id uuid; v_active_count integer;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  if p_trade_date is null or p_trade_date>current_date then raise exception '日付を確認してください'; end if;
  select count(*) into v_active_count from public.players where battle_id=v_battle_id and is_sold=false;
  if jsonb_typeof(p_prices)<>'array' or jsonb_array_length(p_prices)<>v_active_count then raise exception '未利確の参加者全員の終値を入力してください'; end if;
  for v_item in select * from jsonb_array_elements(p_prices) loop
    v_player_id:=(v_item->>'player_id')::uuid;
    if not exists(select 1 from public.players where id=v_player_id and battle_id=v_battle_id and is_sold=false) then raise exception '利確済み、または不正な参加者です'; end if;
    if coalesce((v_item->>'close_price')::numeric,0)<=0 then raise exception '終値を正しく入力してください'; end if;
    insert into public.daily_prices(battle_id,player_id,trade_date,close_price,note) values(v_battle_id,v_player_id,p_trade_date,(v_item->>'close_price')::numeric,coalesce(v_item->>'note','')) on conflict(player_id,trade_date) do update set close_price=excluded.close_price,note=excluded.note,updated_at=now();
  end loop;
end $$;

create or replace function public.set_player_sale(p_share_token text,p_player_id uuid,p_sold_date date,p_sold_price numeric) returns void language plpgsql security definer set search_path=public as $$
declare v_battle_id uuid;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  if p_sold_date is null or p_sold_date>current_date then raise exception '売却日を確認してください'; end if;
  if p_sold_price is null or p_sold_price<=0 then raise exception '売却価格を正しく入力してください'; end if;
  update public.players set is_sold=true,sold_date=p_sold_date,sold_price=p_sold_price where id=p_player_id and battle_id=v_battle_id;
  if not found then raise exception '参加者が見つかりません'; end if;
end $$;

create or replace function public.clear_player_sale(p_share_token text,p_player_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_battle_id uuid;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  update public.players set is_sold=false,sold_date=null,sold_price=null where id=p_player_id and battle_id=v_battle_id;
  if not found then raise exception '参加者が見つかりません'; end if;
end $$;

create or replace function public.update_price(p_share_token text,p_price_id uuid,p_trade_date date,p_close_price numeric,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare v_battle_id uuid;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  if p_trade_date>current_date or p_close_price<=0 then raise exception '日付と終値を確認してください'; end if;
  update public.daily_prices set trade_date=p_trade_date,close_price=p_close_price,note=coalesce(p_note,''),updated_at=now() where id=p_price_id and battle_id=v_battle_id;
  if not found then raise exception '終値が見つかりません'; end if;
end $$;

create or replace function public.delete_price(p_share_token text,p_price_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_battle_id uuid;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  delete from public.daily_prices where id=p_price_id and battle_id=v_battle_id;
  if not found then raise exception '終値が見つかりません'; end if;
end $$;

create or replace function public.delete_battle(p_share_token text) returns void language plpgsql security definer set search_path=public as $$
declare v_battle_id uuid;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  delete from public.daily_prices where battle_id=v_battle_id;
  delete from public.players where battle_id=v_battle_id;
  delete from public.battles where id=v_battle_id;
end $$;

grant execute on function public.create_battle(text,date,date,numeric,numeric,text,jsonb) to anon,authenticated;
grant execute on function public.update_battle(text,text,date,date,numeric,numeric,text,jsonb) to anon,authenticated;
grant execute on function public.get_battle(text) to anon,authenticated;
grant execute on function public.save_daily_prices(text,date,jsonb) to anon,authenticated;
grant execute on function public.set_player_sale(text,uuid,date,numeric) to anon,authenticated;
grant execute on function public.clear_player_sale(text,uuid) to anon,authenticated;
grant execute on function public.update_price(text,uuid,date,numeric,text) to anon,authenticated;
grant execute on function public.delete_price(text,uuid) to anon,authenticated;
grant execute on function public.delete_battle(text) to anon,authenticated;


-- Ver.2.3: 全端末共通の保存済み対戦一覧
create or replace function public.list_battles()
returns table (
  share_token text,
  name text,
  start_date date,
  end_date date,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    b.share_token,
    b.name,
    b.start_date,
    b.end_date,
    b.created_at
  from public.battles b
  order by b.created_at desc;
$$;

grant execute
on function public.list_battles()
to anon, authenticated;
