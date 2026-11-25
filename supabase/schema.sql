create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  full_name text not null,
  email text not null,
  phone text not null,
  tier text not null check (tier in ('early','regular')),
  quantity integer not null check (quantity between 1 and 10),
  subtotal integer not null,
  bank_fee integer not null,
  total integer not null,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  expires_at timestamptz not null default now() + interval '20 minutes',
  paystack_access_code text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create table if not exists public.tickets (
  code text primary key,
  order_reference text not null references public.orders(reference),
  email text not null,
  guest_name text not null,
  tier text not null check (tier in ('early','regular')),
  qr_token text not null,
  status text not null default 'valid' check(status in ('valid','used','void')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create table if not exists public.gate_pin_attempts (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0
);
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.gate_pin_attempts enable row level security;
revoke all on public.orders, public.tickets, public.gate_pin_attempts from anon, authenticated;

create or replace function public.early_bird_remaining() returns jsonb
language sql security definer set search_path=public,extensions as $$
  select jsonb_build_object('remaining',greatest(0,200-coalesce(sum(quantity),0))::integer)
  from orders where tier='early' and (status='paid' or (status='pending' and expires_at>now()));
$$;

create or replace function public.gate_auth_attempt(p_key text, p_valid boolean) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare v_attempts integer; v_now timestamptz := clock_timestamp();
begin
  if p_valid then
    delete from gate_pin_attempts where key_hash=p_key;
    return jsonb_build_object('allowed',true);
  end if;
  insert into gate_pin_attempts(key_hash,window_started_at,failed_attempts) values(p_key,v_now,1)
  on conflict(key_hash) do update set
    failed_attempts=case when gate_pin_attempts.window_started_at < v_now - interval '10 minutes' then 1 else gate_pin_attempts.failed_attempts + 1 end,
    window_started_at=case when gate_pin_attempts.window_started_at < v_now - interval '10 minutes' then v_now else gate_pin_attempts.window_started_at end
  returning failed_attempts into v_attempts;
  return jsonb_build_object('allowed',v_attempts <= 10);
end $$;

create or replace function public.reserve_tickets(
  p_reference text, p_full_name text, p_email text, p_phone text,
  p_tier text, p_quantity integer, p_subtotal integer, p_fee integer, p_total integer
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_reserved integer;
begin
  if p_tier not in ('early','regular') or p_quantity < 1 or p_quantity > 10 then return jsonb_build_object('ok',false,'message','Invalid ticket selection.'); end if;
  if p_tier='early' then
    perform pg_advisory_xact_lock(27012027);
    select coalesce(sum(quantity),0) into v_reserved from orders where tier='early' and (status='paid' or (status='pending' and expires_at>now()));
    if v_reserved + p_quantity > 200 then return jsonb_build_object('ok',false,'message','Early Bird passes just sold out. Please choose Regular.'); end if;
  end if;
  insert into orders(reference,full_name,email,phone,tier,quantity,subtotal,bank_fee,total)
    values(p_reference,p_full_name,p_email,p_phone,p_tier,p_quantity,p_subtotal,p_fee,p_total);
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.cancel_ticket_hold(p_reference text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
begin update orders set status='cancelled' where reference=p_reference and status='pending'; return jsonb_build_object('ok',true); end $$;

create or replace function public.confirm_ticket_order(p_reference text, p_paystack_amount bigint, p_currency text, p_signing_secret text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare o orders%rowtype; t record; v_code text; v_payload text; v_sig text;
begin
  select * into o from orders where reference=p_reference for update;
  if not found then return jsonb_build_object('ok',false,'message','Order not found'); end if;
  if o.status='paid' then return jsonb_build_object('ok',true,'idempotent',true); end if;
  if p_currency <> 'NGN' or p_paystack_amount <> o.total * 100 then return jsonb_build_object('ok',false,'message','Payment amount mismatch'); end if;
  update orders set status='paid',paid_at=now() where reference=p_reference;
  for t in 1..o.quantity loop
    v_code := 'SSS-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,6));
    v_payload := v_code || '.' || p_reference;
    v_sig := encode(hmac(v_payload,p_signing_secret,'sha256'),'hex');
    insert into tickets(code,order_reference,email,guest_name,tier,qr_token) values(v_code,p_reference,o.email,o.full_name,o.tier,v_payload || '.' || v_sig);
  end loop;
  return jsonb_build_object('ok',true);
end $$;
create or replace function public.redeem_ticket(p_token text, p_signing_secret text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare v_parts text[]; v_payload text; v_ticket tickets%rowtype;
begin
  v_parts := string_to_array(p_token,'.');
  if array_length(v_parts,1)<>3 then return jsonb_build_object('ok',false,'message','Invalid QR code'); end if;
  v_payload:=v_parts[1]||'.'||v_parts[2];
  if encode(hmac(v_payload,p_signing_secret,'sha256'),'hex')<>v_parts[3] then return jsonb_build_object('ok',false,'message','QR signature is invalid'); end if;
  select * into v_ticket from tickets where code=v_parts[1] and order_reference=v_parts[2] for update;
  if not found or v_ticket.status='void' then return jsonb_build_object('ok',false,'message','Ticket not found'); end if;
  if v_ticket.status='used' then return jsonb_build_object('ok',false,'message','Ticket already checked in'); end if;
  update tickets set status='used',used_at=now() where code=v_ticket.code;
  return jsonb_build_object('ok',true,'ticket',jsonb_build_object('code',v_ticket.code,'guest_name',v_ticket.guest_name,'tier',v_ticket.tier));
end $$;
revoke all on function public.reserve_tickets(text,text,text,text,text,integer,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.cancel_ticket_hold(text) from public, anon, authenticated;
revoke all on function public.confirm_ticket_order(text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.early_bird_remaining() from public, anon, authenticated;
revoke all on function public.gate_auth_attempt(text,boolean) from public, anon, authenticated;
revoke all on function public.redeem_ticket(text,text) from public, anon, authenticated;
grant execute on function public.reserve_tickets(text,text,text,text,text,integer,integer,integer,integer) to service_role;
grant execute on function public.cancel_ticket_hold(text) to service_role;
grant execute on function public.confirm_ticket_order(text,bigint,text,text) to service_role;
grant execute on function public.early_bird_remaining() to service_role;
grant execute on function public.gate_auth_attempt(text,boolean) to service_role;
grant execute on function public.redeem_ticket(text,text) to service_role;
grant select on public.tickets to service_role;
