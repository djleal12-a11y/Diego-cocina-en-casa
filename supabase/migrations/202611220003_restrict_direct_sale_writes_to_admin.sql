-- Applied to Supabase project nidkljhagbauuorhpwns on 2026-11-22.
-- Direct sale writes are administrator-only; sellers must use the atomic RPC.

begin;
drop policy if exists "Registrar ventas propias" on public.sales;
create policy "Solo administrador importa ventas"
  on public.sales for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Registrar detalle de venta propia" on public.sale_items;
create policy "Solo administrador importa detalles"
  on public.sale_items for insert to authenticated
  with check (public.is_admin());
commit;