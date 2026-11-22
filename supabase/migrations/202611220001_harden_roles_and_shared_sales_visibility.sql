-- Applied to Supabase project nidkljhagbauuorhpwns on 2026-11-22.
-- Security baseline and shared sales visibility. Additive; preserves existing rows.

begin;

drop policy if exists "Consultar ventas propias o admin" on public.sales;
create policy "Usuarios autenticados consultan todas las ventas"
on public.sales for select to authenticated
using (true);

drop policy if exists "Consultar detalle autorizado" on public.sale_items;
create policy "Usuarios autenticados consultan detalles de ventas"
on public.sale_items for select to authenticated
using (true);

drop policy if exists "Registrar pagos propios" on public.payments;
create policy "Solo admin registra pagos"
on public.payments for insert to authenticated
with check (public.is_admin());

alter table public.payments
  add column if not exists payment_method text not null default 'No especificado';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_payment_method_check'
  ) then
    alter table public.payments
      add constraint payments_payment_method_check
      check (payment_method in (
        'Efectivo',
        'Transferencia con llaves',
        'Nequi',
        'Otros medios de pago',
        'No especificado'
      ));
  end if;
end $$;

revoke all privileges on table
  public.profiles, public.products, public.customers, public.sales,
  public.sale_items, public.payments, public.stock_movements
from anon;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

commit;
