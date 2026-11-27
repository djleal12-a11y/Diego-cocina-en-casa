-- Fix PL/pgSQL output-column ambiguity in the audited sale voiding RPC.
-- All sale_id references are qualified with table aliases because sale_id is also
-- an OUT column of this RETURNS TABLE function.
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns table(sale_id uuid, restored_units integer, reversed_payments integer, voided_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_item record;
  v_restored integer := 0;
  v_reversed integer := 0;
  v_count integer := 0;
  v_voided_at timestamptz;
  v_product_stock integer;
begin
  if v_uid is null or not private.is_admin() then
    raise exception 'Solo el administrador puede anular ventas.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 or length(trim(p_reason)) > 500 then
    raise exception 'Indica un motivo de anulación de entre 5 y 500 caracteres.';
  end if;

  select s.* into v_sale from public.sales as s where s.id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.'; end if;
  if v_sale.voided_at is not null then raise exception 'Esta venta ya fue anulada.'; end if;

  select count(*) into v_count
    from public.sale_items as si
   where si.sale_id = p_sale_id;
  if v_count = 0 then
    raise exception 'La venta no tiene productos asociados; no se puede restaurar el inventario automáticamente.';
  end if;
  if exists (
    select 1 from public.sale_items as si
     where si.sale_id = p_sale_id and si.product_id is null
  ) then
    raise exception 'Hay productos sin referencia de inventario; se requiere revisión manual antes de anular.';
  end if;

  update public.sales as s
     set voided_at = now(), voided_by = v_uid, void_reason = trim(p_reason),
         payment_status = 'ANULADA', paid_amount = 0, balance = 0
   where s.id = p_sale_id
   returning s.voided_at into v_voided_at;

  for v_item in
    select si.product_id, sum(si.quantity)::integer as quantity
      from public.sale_items as si
     where si.sale_id = p_sale_id
     group by si.product_id
     order by si.product_id
  loop
    update public.products as p
       set stock = p.stock + v_item.quantity,
           status = case when p.stock + v_item.quantity > 0 then 'Disponible' else p.status end
     where p.id = v_item.product_id
     returning p.stock into v_product_stock;
    if not found then
      raise exception 'No se encontró un producto asociado a la venta. No se aplicó la anulación.';
    end if;
    insert into public.stock_movements(product_id,user_id,quantity,movement_type,notes)
    values (v_item.product_id, v_uid, v_item.quantity, 'Anulación de venta',
      'Restitución por anulación de venta ' || p_sale_id::text || '. Motivo: ' || trim(p_reason));
    v_restored := v_restored + v_item.quantity;
  end loop;

  update public.payments as p
     set reversed_at = now(), reversed_by = v_uid, reversal_reason = trim(p_reason)
   where p.sale_id = p_sale_id and p.reversed_at is null;
  get diagnostics v_reversed = row_count;

  update public.sales as s
     set paid_amount = 0, balance = 0, payment_status = 'ANULADA'
   where s.id = p_sale_id;

  return query select p_sale_id, v_restored, v_reversed, v_voided_at;
end;
$function$;

revoke all on function public.void_sale(uuid,text) from public;
revoke all on function public.void_sale(uuid,text) from anon;
grant execute on function public.void_sale(uuid,text) to authenticated;
