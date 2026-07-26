-- 新規Supabaseプロジェクト向け完全版。既存プロジェクトは migration-v1.2.sql を実行してください。
create extension if not exists pgcrypto;

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  share_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  name text not null check (char_length(name) between 1 and 60),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 30),
  security_code text not null check (char_length(security_code) between 1 and 10),
  security_name text not null check (char_length(security_name) between 1 and 60),
  purchase_price numeric(14,4) not null check (purchase_price > 0),
  shares_owned numeric(14,4) not null default 1 check (shares_owned > 0),
  carryover_cash numeric(16,2) not null default 0 check (carryover_cash >= 0),
  color text not null,
  display_order smallint not null check (display_order between 1 and 4),
  unique (battle_id, display_order)
);

create table if not exists public.daily_prices (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  trade_date date not null,
  close_price numeric(14,4) not null check (close_price > 0),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, trade_date)
);

alter table public.battles enable row level security;
alter table public.players enable row level security;
alter table public.daily_prices enable row level security;
revoke all on public.battles, public.players, public.daily_prices from anon, authenticated;

create or replace function public.create_battle(p_name text, p_start_date date, p_end_date date, p_players jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_battle public.battles; v_player jsonb;
begin
  if jsonb_array_length(p_players) <> 4 then raise exception '参加者は4人必要です'; end if;
  insert into public.battles(name,start_date,end_date) values(trim(p_name),p_start_date,p_end_date) returning * into v_battle;
  for v_player in select * from jsonb_array_elements(p_players) loop
    insert into public.players(battle_id,nickname,security_code,security_name,purchase_price,shares_owned,carryover_cash,color,display_order)
    values(v_battle.id,trim(v_player->>'nickname'),trim(v_player->>'security_code'),trim(v_player->>'security_name'),
      (v_player->>'purchase_price')::numeric,coalesce((v_player->>'shares_owned')::numeric,1),
      coalesce((v_player->>'carryover_cash')::numeric,0),v_player->>'color',(v_player->>'display_order')::smallint);
  end loop;
  return v_battle.share_token;
end $$;

create or replace function public.get_battle(p_share_token text)
returns jsonb language sql security definer stable set search_path = public as $$
select jsonb_build_object(
  'id',b.id,'name',b.name,'start_date',b.start_date,'end_date',b.end_date,'created_at',b.created_at,
  'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order) from public.players p where p.battle_id=b.id),'[]'::jsonb),
  'prices',coalesce((select jsonb_agg(to_jsonb(d) order by d.trade_date,d.player_id) from public.daily_prices d where d.battle_id=b.id),'[]'::jsonb)
) from public.battles b where b.share_token=p_share_token;
$$;

create or replace function public.save_daily_prices(p_share_token text, p_trade_date date, p_prices jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_battle_id uuid; v_item jsonb; v_player_id uuid;
begin
  select id into v_battle_id from public.battles where share_token=p_share_token;
  if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
  if p_trade_date > current_date then raise exception '未来の日付は登録できません'; end if;
  if jsonb_array_length(p_prices) <> 4 then raise exception '4銘柄すべて入力してください'; end if;
  for v_item in select * from jsonb_array_elements(p_prices) loop
    v_player_id := (v_item->>'player_id')::uuid;
    if not exists(select 1 from public.players where id=v_player_id and battle_id=v_battle_id) then raise exception '参加者が不正です'; end if;
    insert into public.daily_prices(battle_id,player_id,trade_date,close_price,note)
    values(v_battle_id,v_player_id,p_trade_date,(v_item->>'close_price')::numeric,coalesce(v_item->>'note',''))
    on conflict(player_id,trade_date) do update set close_price=excluded.close_price,note=excluded.note,updated_at=now();
  end loop;
end $$;

create or replace function public.update_price(p_share_token text,p_price_id uuid,p_trade_date date,p_close_price numeric,p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_battle_id uuid;
begin
 select id into v_battle_id from public.battles where share_token=p_share_token;
 if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
 if p_trade_date > current_date then raise exception '未来の日付は登録できません'; end if;
 update public.daily_prices set trade_date=p_trade_date,close_price=p_close_price,note=coalesce(p_note,''),updated_at=now() where id=p_price_id and battle_id=v_battle_id;
 if not found then raise exception '対象データが見つかりません'; end if;
end $$;

create or replace function public.delete_price(p_share_token text,p_price_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_battle_id uuid;
begin
 select id into v_battle_id from public.battles where share_token=p_share_token;
 if v_battle_id is null then raise exception '対戦が見つかりません'; end if;
 delete from public.daily_prices where id=p_price_id and battle_id=v_battle_id;
 if not found then raise exception '対象データが見つかりません'; end if;
end $$;

grant execute on function public.create_battle(text,date,date,jsonb) to anon, authenticated;
grant execute on function public.get_battle(text) to anon, authenticated;
grant execute on function public.save_daily_prices(text,date,jsonb) to anon, authenticated;
grant execute on function public.update_price(text,uuid,date,numeric,text) to anon, authenticated;
grant execute on function public.delete_price(text,uuid) to anon, authenticated;
