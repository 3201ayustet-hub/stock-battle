-- 既存のSupabaseプロジェクトをVer.1.2へ更新するSQLです。
-- SQL Editorでファイル全体を1回実行してください。

alter table public.players
  add column if not exists shares_owned numeric(14,4) not null default 1,
  add column if not exists carryover_cash numeric(16,2) not null default 0;

do $$ begin
  alter table public.players add constraint players_shares_owned_positive check (shares_owned > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.players add constraint players_carryover_cash_nonnegative check (carryover_cash >= 0);
exception when duplicate_object then null; end $$;

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

grant execute on function public.create_battle(text,date,date,jsonb) to anon, authenticated;
