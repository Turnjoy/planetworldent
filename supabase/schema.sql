-- Plannet World Entertainment multi-event ticketing schema.
-- Safe to re-run on the original single-event schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  tagline text,
  description text,
  event_date text not null,
  venue text not null,
  banner_url text,
  early_bird_price integer not null default 3000 check (early_bird_price >= 0),
  early_bird_limit integer not null default 200 check (early_bird_limit >= 0),
  regular_price integer not null check (regular_price >= 0),
  gate_pin text not null default '2027',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

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
alter table public.orders add column if not exists email_sent boolean not null default false;
alter table public.orders add column if not exists email_sending boolean not null default false;
alter table public.orders add column if not exists email_claimed_at timestamptz;
alter table public.orders add column if not exists email_message_id text;
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

alter table public.orders add column if not exists event_id uuid references public.events(id);
alter table public.orders add column if not exists ticket_phase text;
alter table public.tickets add column if not exists event_id uuid references public.events(id);
alter table public.tickets add column if not exists ticket_phase text;
alter table public.tickets add column if not exists amount_paid integer;
create index if not exists orders_event_status_idx on public.orders(event_id,status,expires_at);
create index if not exists tickets_event_phase_idx on public.tickets(event_id,ticket_phase,status);

insert into public.events(slug,title,tagline,description,event_date,venue,early_bird_price,early_bird_limit,regular_price,gate_pin,is_active)
values ('soakers-splash-squad-2027','Soakers Splash Squad 2027','Same Vibes, Bigger Moves!','The year begins at the water’s edge. A night of poolside heat, electric sound and memories that stay with you till sunrise.','Friday, 1 January 2027 · 10:00 PM till dawn','Igbekon, Ado-Odo, Ota, Ogun State',3000,200,5000,'2027',true)
on conflict(slug) do nothing;

update public.orders o set event_id=e.id, ticket_phase=coalesce(o.ticket_phase,case when o.tier='early' then 'Early Bird' else 'Regular' end)
from public.events e where e.slug='soakers-splash-squad-2027' and o.event_id is null;
update public.tickets t set event_id=o.event_id, ticket_phase=coalesce(t.ticket_phase,case when t.tier='early' then 'Early Bird' else 'Regular' end), amount_paid=coalesce(t.amount_paid,case when t.tier='early' then e.early_bird_price else e.regular_price end)
from public.orders o, public.events e where t.order_reference=o.reference and e.id=o.event_id and (t.event_id is null or t.ticket_phase is null or t.amount_paid is null);

alter table public.orders alter column event_id set not null;
alter table public.orders alter column ticket_phase set not null;
alter table public.tickets alter column event_id set not null;
alter table public.tickets alter column ticket_phase set not null;
alter table public.tickets alter column amount_paid set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='tickets_ticket_phase_check' and conrelid='public.tickets'::regclass) then
    alter table public.tickets add constraint tickets_ticket_phase_check check (ticket_phase in ('Early Bird','Regular'));
  end if;
end $$;

alter table public.events enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.gate_pin_attempts enable row level security;
revoke all on public.events,public.orders,public.tickets,public.gate_pin_attempts from anon,authenticated;
grant select,insert,update on public.events to service_role;
grant select,insert,update on public.orders to service_role;
grant select,insert,update on public.tickets to service_role;

create or replace function public.get_event_ticket_stats(p_event_id uuid)
returns table(paid_count integer,active_phase text,current_price integer,early_bird_remaining integer)
language sql stable security definer set search_path=public,extensions as $$
  select coalesce(sum(o.quantity) filter(where o.status='paid'),0)::integer,
    case when coalesce(sum(o.quantity) filter(where o.status='paid'),0) < e.early_bird_limit then 'Early Bird' else 'Regular' end,
    case when coalesce(sum(o.quantity) filter(where o.status='paid'),0) < e.early_bird_limit then e.early_bird_price else e.regular_price end,
    greatest(0,e.early_bird_limit-coalesce(sum(o.quantity) filter(where o.status='paid'),0))::integer
  from public.events e left join public.orders o on o.event_id=e.id
  where e.id=p_event_id group by e.id;
$$;

create or replace function public.early_bird_remaining() returns jsonb
language sql security definer set search_path=public,extensions as $$
  select jsonb_build_object('remaining', early_bird_remaining) from get_event_ticket_stats((select id from events where slug='soakers-splash-squad-2027'));
$$;

create or replace function public.gate_auth_attempt(p_key text,p_valid boolean) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare v_attempts integer; v_now timestamptz:=clock_timestamp();
begin
 if p_valid then delete from gate_pin_attempts where key_hash=p_key; return jsonb_build_object('allowed',true); end if;
 insert into gate_pin_attempts(key_hash,window_started_at,failed_attempts) values(p_key,v_now,1)
 on conflict(key_hash) do update set failed_attempts=case when gate_pin_attempts.window_started_at<v_now-interval '10 minutes' then 1 else gate_pin_attempts.failed_attempts+1 end,
 window_started_at=case when gate_pin_attempts.window_started_at<v_now-interval '10 minutes' then v_now else gate_pin_attempts.window_started_at end
 returning failed_attempts into v_attempts;
 return jsonb_build_object('allowed',v_attempts<=10);
end $$;

create or replace function public.reserve_tickets(p_reference text,p_full_name text,p_email text,p_phone text,p_tier text,p_quantity integer,p_subtotal integer,p_fee integer,p_total integer)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_event uuid; v_price integer; v_count integer; v_phase text;
begin
 select id into v_event from events where slug='soakers-splash-squad-2027' and is_active;
 if v_event is null then return jsonb_build_object('ok',false,'message','Event is not available.'); end if;
 perform pg_advisory_xact_lock(hashtext(v_event::text));
 select coalesce(s.paid_count,0),s.active_phase,s.current_price into v_count,v_phase,v_price from get_event_ticket_stats(v_event) s;
 if p_tier not in ('early','regular') or p_quantity<1 or p_quantity>10 then return jsonb_build_object('ok',false,'message','Invalid ticket selection.'); end if;
 if (p_tier='early')<>(v_phase='Early Bird') then return jsonb_build_object('ok',false,'message','Ticket pricing changed. Refresh the page and try again.'); end if;
 if p_subtotal<>v_price*p_quantity then return jsonb_build_object('ok',false,'message','Ticket pricing changed. Refresh the page and try again.'); end if;
 if v_phase='Early Bird' and v_count+p_quantity>(select early_bird_limit from events where id=v_event) then return jsonb_build_object('ok',false,'message','Not enough Early Bird tickets remain. Refresh the page for current pricing.'); end if;
 insert into orders(reference,full_name,email,phone,tier,quantity,subtotal,bank_fee,total,event_id,ticket_phase)
 values(p_reference,p_full_name,p_email,p_phone,p_tier,p_quantity,p_subtotal,p_fee,p_total,v_event,v_phase);
 return jsonb_build_object('ok',true,'event_id',v_event,'ticket_phase',v_phase,'unit_price',v_price);
end $$;

create or replace function public.reserve_event_tickets(p_event_id uuid,p_reference text,p_full_name text,p_email text,p_phone text,p_quantity integer,p_subtotal integer,p_fee integer,p_total integer)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare e events%rowtype; v_count integer; v_phase text; v_price integer; v_early_holds integer;
begin
 select * into e from events where id=p_event_id and is_active for update;
 if not found then return jsonb_build_object('ok',false,'message','Event is not available.'); end if;
 if p_quantity<1 or p_quantity>10 then return jsonb_build_object('ok',false,'message','Choose between 1 and 10 tickets.'); end if;
 perform pg_advisory_xact_lock(hashtext(e.id::text));
 select coalesce(sum(quantity),0) into v_count from orders where event_id=e.id and status='paid';
 select coalesce(sum(quantity),0) into v_early_holds from orders where event_id=e.id and ticket_phase='Early Bird' and status='pending' and expires_at>now();
 v_phase:=case when v_count>=e.early_bird_limit then 'Regular' else 'Early Bird' end;
 v_price:=case when v_phase='Early Bird' then e.early_bird_price else e.regular_price end;
 if v_phase='Early Bird' and v_count+v_early_holds+p_quantity>e.early_bird_limit then return jsonb_build_object('ok',false,'message','Early Bird inventory is being reserved right now. Refresh the page shortly for current pricing.'); end if;
 if p_subtotal<>v_price*p_quantity then return jsonb_build_object('ok',false,'message','Ticket pricing changed. Refresh the page and try again.'); end if;
 insert into orders(reference,full_name,email,phone,tier,quantity,subtotal,bank_fee,total,event_id,ticket_phase)
 values(p_reference,p_full_name,p_email,p_phone,'early',p_quantity,p_subtotal,p_fee,p_total,e.id,v_phase);
 update orders set tier='regular' where reference=p_reference and v_phase='Regular';
 return jsonb_build_object('ok',true,'event_id',e.id,'ticket_phase',v_phase,'unit_price',v_price);
end $$;

create or replace function public.cancel_ticket_hold(p_reference text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin update orders set status='cancelled' where reference=p_reference and status='pending'; return jsonb_build_object('ok',true); end $$;

create or replace function public.confirm_ticket_order(p_reference text,p_paystack_amount bigint,p_currency text,p_signing_secret text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare o orders%rowtype; t integer; v_existing integer; v_code text; v_payload text; v_sig text; v_unit integer;
begin
 select * into o from orders where reference=p_reference for update;
 if not found then return jsonb_build_object('ok',false,'message','Order not found'); end if;
 if p_currency<>'NGN' or p_paystack_amount<>o.total*100 then return jsonb_build_object('ok',false,'message','Payment amount mismatch'); end if;
 if o.status='cancelled' then return jsonb_build_object('ok',false,'message','Order was cancelled'); end if;
 if o.status<>'paid' then update orders set status='paid',paid_at=coalesce(paid_at,now()) where reference=p_reference; end if;
 select count(*) into v_existing from tickets where order_reference=p_reference;
 if v_existing>=o.quantity then return jsonb_build_object('ok',true,'idempotent',true); end if;
 v_unit:=o.subtotal/o.quantity;
 for t in v_existing+1..o.quantity loop
  v_code:='SSS-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,6)); v_payload:=v_code||'.'||p_reference;
  v_sig:=encode(hmac(v_payload,p_signing_secret,'sha256'),'hex');
  insert into tickets(code,order_reference,email,guest_name,tier,qr_token,event_id,ticket_phase,amount_paid)
  values(v_code,p_reference,o.email,o.full_name,o.tier,v_payload||'.'||v_sig,o.event_id,o.ticket_phase,v_unit);
 end loop;
 return jsonb_build_object('ok',true);
end $$;

-- Atomically claim an order email so Paystack webhook retries do not resend it.
create or replace function public.claim_order_email(p_reference text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare v_claimed boolean:=false;
begin
 update orders set email_sending=true,email_claimed_at=now()
 where reference=p_reference and status='paid' and email_sent=false
   and (email_sending=false or email_claimed_at<now()-interval '24 hours');
 v_claimed:=found;
 return jsonb_build_object('claimed',v_claimed);
end $$;

create or replace function public.finish_order_email(p_reference text,p_sent boolean,p_message_id text default null) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
begin
 update orders set email_sent=p_sent,
   email_message_id=case when p_sent then p_message_id else email_message_id end,
   email_sending=false,email_claimed_at=null
 where reference=p_reference;
 return jsonb_build_object('ok',found);
end $$;

create or replace function public.redeem_ticket(p_token text,p_signing_secret text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare v_parts text[]; v_payload text; v_ticket tickets%rowtype;
begin
 v_parts:=string_to_array(p_token,'.'); if array_length(v_parts,1)<>3 then return jsonb_build_object('ok',false,'message','Invalid QR code'); end if;
 v_payload:=v_parts[1]||'.'||v_parts[2];
 if encode(hmac(v_payload,p_signing_secret,'sha256'),'hex')<>v_parts[3] then return jsonb_build_object('ok',false,'message','QR signature is invalid'); end if;
 select * into v_ticket from tickets where code=v_parts[1] and order_reference=v_parts[2] for update;
 if not found or v_ticket.status='void' then return jsonb_build_object('ok',false,'message','Ticket not found'); end if;
 if v_ticket.status='used' then return jsonb_build_object('ok',false,'message','Ticket already checked in'); end if;
 update tickets set status='used',used_at=now() where code=v_ticket.code;
 return jsonb_build_object('ok',true,'ticket',jsonb_build_object('code',v_ticket.code,'guest_name',v_ticket.guest_name,'tier',v_ticket.tier,'event_id',v_ticket.event_id));
end $$;

do $$ declare f regprocedure; begin
 foreach f in array array[
  'public.reserve_tickets(text,text,text,text,text,integer,integer,integer,integer)'::regprocedure,
  'public.reserve_event_tickets(uuid,text,text,text,text,integer,integer,integer,integer)'::regprocedure,
  'public.cancel_ticket_hold(text)'::regprocedure,
  'public.confirm_ticket_order(text,bigint,text,text)'::regprocedure,
  'public.claim_order_email(text)'::regprocedure,
  'public.finish_order_email(text,boolean,text)'::regprocedure,
  'public.early_bird_remaining()'::regprocedure,
  'public.get_event_ticket_stats(uuid)'::regprocedure,
  'public.gate_auth_attempt(text,boolean)'::regprocedure,
  'public.redeem_ticket(text,text)'::regprocedure
 ] loop execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f); end loop;
end $$;
grant select on public.tickets,public.orders,public.events to service_role;

notify pgrst, 'reload schema';