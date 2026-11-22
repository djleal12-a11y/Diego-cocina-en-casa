-- Applied to Supabase project nidkljhagbauuorhpwns on 2026-11-22.
-- Keep the SECURITY DEFINER authorization helper outside the exposed API schema.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_admin() set schema private;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

drop policy if exists "Admin modifica clientes" on public.customers;
create policy "Admin modifica clientes" on public.customers for update to authenticated
using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Consultar clientes propios o admin" on public.customers;
create policy "Consultar clientes propios o admin" on public.customers for select to authenticated
using (seller_id=(select auth.uid()) or private.is_admin());
drop policy if exists "Registrar clientes propios" on public.customers;
create policy "Registrar clientes propios" on public.customers for insert to authenticated
with check (seller_id=(select auth.uid()) or private.is_admin());

drop policy if exists "Solo administrador consulta pagos" on public.payments;
create policy "Solo administrador consulta pagos" on public.payments for select to authenticated
using (private.is_admin());
drop policy if exists "Solo administrador registra pagos" on public.payments;
create policy "Solo administrador registra pagos" on public.payments for insert to authenticated
with check (private.is_admin());

drop policy if exists "Admin administra productos" on public.products;
create policy "Admin administra productos" on public.products for all to authenticated
using (private.is_admin()) with check (private.is_admin());

drop policy if exists "Leer perfil propio o admin" on public.profiles;
create policy "Leer perfil propio o admin" on public.profiles for select to authenticated
using (id=(select auth.uid()) or private.is_admin());

drop policy if exists "Solo administrador importa detalles" on public.sale_items;
create policy "Solo administrador importa detalles" on public.sale_items for insert to authenticated
with check (private.is_admin());
drop policy if exists "Solo administrador importa ventas" on public.sales;
create policy "Solo administrador importa ventas" on public.sales for insert to authenticated
with check (private.is_admin());

drop policy if exists "Admin consulta inventario" on public.stock_movements;
create policy "Admin consulta inventario" on public.stock_movements for select to authenticated
using (private.is_admin());
drop policy if exists "Admin registra movimientos" on public.stock_movements;
create policy "Admin registra movimientos" on public.stock_movements for insert to authenticated
with check (private.is_admin());

create or replace function public.record_sale_payment(
  p_sale_id uuid,p_amount numeric,p_payment_method text,p_payment_date date
)
returns table(paid_amount numeric,balance numeric,payment_status text)
language plpgsql security definer set search_path=public
as $$
declare v_uid uuid:=auth.uid(); v_total numeric(14,2); v_paid numeric(14,2);
begin
  if v_uid is null or not private.is_admin() then raise exception 'Solo el administrador puede registrar abonos.'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>trunc(p_amount) then raise exception 'El valor del abono debe ser un entero positivo.'; end if;
  if p_payment_method not in ('Efectivo','Transferencia con llaves','Nequi','Otros medios de pago') then raise exception 'Medio de pago inválido.'; end if;
  select total into v_total from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where sale_id=p_sale_id;
  if p_amount>v_total-v_paid then raise exception 'El abono supera el saldo pendiente.'; end if;
  insert into public.payments(sale_id,seller_id,amount,payment_date,payment_method)
  values(p_sale_id,v_uid,p_amount,coalesce(p_payment_date,current_date)::timestamp with time zone,p_payment_method);
  select s.paid_amount,s.balance,s.payment_status into paid_amount,balance,payment_status from public.sales s where s.id=p_sale_id;
  return next;
end;
$$;
revoke all on function public.record_sale_payment(uuid,numeric,text,date) from public,anon;
grant execute on function public.record_sale_payment(uuid,numeric,text,date) to authenticated;
commit;