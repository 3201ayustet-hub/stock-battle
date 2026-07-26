-- 株価成長バトル Ver.1.4 更新用SQL
-- Supabase SQL Editorの新しいタブへ、このファイル全体を貼り付けて1回実行してください。

alter table public.battles
  add column if not exists carryover_cash numeric(16,2) not null default 0;

do $$ begin
  alter table public.battles
    add constraint battles_carryover_cash_nonnegative
    check (carryover_cash >= 0);
exception
  when duplicate_object then null;
end $$;

-- Ver.1.2〜1.3で参加者ごとに登録していた余剰金がある場合は、
-- 対戦全体の余剰金へ合計して引き継ぎます。
update public.battles b
set carryover_cash = coalesce(x.total_cash, 0)
from (
  select battle_id, sum(coalesce(carryover_cash, 0)) as total_cash
  from public.players
  group by battle_id
) x
where b.id = x.battle_id
  and b.carryover_cash = 0;

create or replace function public.create_battle(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_carryover_cash numeric,
  p_players jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.battles;
  v_player jsonb;
  v_shares numeric;
begin
  if jsonb_array_length(p_players) <> 4 then
    raise exception '参加者は4人必要です';
  end if;

  if p_carryover_cash < 0 then
    raise exception '繰越余剰金は0円以上にしてください';
  end if;

  insert into public.battles(name, start_date, end_date, carryover_cash)
  values(trim(p_name), p_start_date, p_end_date, coalesce(p_carryover_cash, 0))
  returning * into v_battle;

  for v_player in select * from jsonb_array_elements(p_players)
  loop
    v_shares := coalesce((v_player->>'shares_owned')::numeric, 1);
    if v_shares < 1 or v_shares > 10 or trunc(v_shares) <> v_shares then
      raise exception '所有株数は1〜10株の整数にしてください';
    end if;

    insert into public.players(
      battle_id, nickname, security_code, security_name,
      purchase_price, shares_owned, carryover_cash, color, display_order
    ) values (
      v_battle.id,
      trim(v_player->>'nickname'),
      trim(v_player->>'security_code'),
      trim(v_player->>'security_name'),
      (v_player->>'purchase_price')::numeric,
      v_shares,
      0,
      v_player->>'color',
      (v_player->>'display_order')::smallint
    );
  end loop;

  return v_battle.share_token;
end
$$;

create or replace function public.update_battle(
  p_share_token text,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_carryover_cash numeric,
  p_players jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle_id uuid;
  v_player jsonb;
  v_player_id uuid;
  v_shares numeric;
begin
  select id into v_battle_id
  from public.battles
  where share_token = p_share_token;

  if v_battle_id is null then
    raise exception '対戦が見つかりません';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception '終了日は開始日以降にしてください';
  end if;

  if p_carryover_cash < 0 then
    raise exception '繰越余剰金は0円以上にしてください';
  end if;

  if jsonb_array_length(p_players) <> 4 then
    raise exception '参加者は4人必要です';
  end if;

  update public.battles
  set name = trim(p_name),
      start_date = p_start_date,
      end_date = p_end_date,
      carryover_cash = coalesce(p_carryover_cash, 0)
  where id = v_battle_id;

  for v_player in select * from jsonb_array_elements(p_players)
  loop
    v_player_id := (v_player->>'id')::uuid;
    v_shares := coalesce((v_player->>'shares_owned')::numeric, 1);

    if v_shares < 1 or v_shares > 10 or trunc(v_shares) <> v_shares then
      raise exception '所有株数は1〜10株の整数にしてください';
    end if;

    update public.players
    set nickname = trim(v_player->>'nickname'),
        security_code = trim(v_player->>'security_code'),
        security_name = trim(v_player->>'security_name'),
        purchase_price = (v_player->>'purchase_price')::numeric,
        shares_owned = v_shares,
        carryover_cash = 0,
        color = v_player->>'color',
        display_order = (v_player->>'display_order')::smallint
    where id = v_player_id
      and battle_id = v_battle_id;

    if not found then
      raise exception '参加者情報が不正です';
    end if;
  end loop;
end
$$;

grant execute
on function public.create_battle(text, date, date, numeric, jsonb)
to anon, authenticated;

grant execute
on function public.update_battle(text, text, date, date, numeric, jsonb)
to anon, authenticated;
