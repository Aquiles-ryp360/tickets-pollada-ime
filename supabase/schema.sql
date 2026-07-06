create extension if not exists pgcrypto;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null,
  dni text,
  una_code text,
  career_code text,
  career_name text,
  full_name text not null,
  phone text,
  seller text not null,
  identity_source text not null default 'manual'
    check (identity_source in ('manual', 'unap_tramites', 'peruapi')),
  paid boolean not null default false,
  picked_up boolean not null default false,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tickets_ticket_number_unique
  on public.tickets (lower(ticket_number));

create index if not exists tickets_dni_idx on public.tickets (dni)
  where dni is not null and dni <> '';

create index if not exists tickets_una_code_idx on public.tickets (una_code)
  where una_code is not null and una_code <> '';

create index if not exists tickets_paid_idx on public.tickets (paid);
create index if not exists tickets_picked_up_idx on public.tickets (picked_up);
create index if not exists tickets_created_at_idx on public.tickets (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

alter table public.tickets enable row level security;
