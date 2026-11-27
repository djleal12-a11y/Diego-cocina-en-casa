-- Migration: audited sale voiding, payment reversal and stock restoration.
-- Applied to Supabase project nidkljhagbauuorhpwns on 2026-11-26.
-- This migration does not void or delete any existing sale/payment records.
alter table public.sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;
alter table public.payments
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.profiles(id),
  add column if not exists reversal_reason text;
create or replace function public.refresh_sale_payment_totals()
returns trigger language plpgsql security definer set search_path=public
as $function$
declare target_sale uuid; paid numeric(14,2); total_due numeric(14,2); sale_voided timestamptz;
begin
 target_sale:=coalesce(new.sale_id,old.sale_id);
 select coalesce(sum(amount),0) into paid from public.payments where sale_id=target_sale and reversed_at is null;
 select total,voided_at into total_due,sale_voided from public.sales where id=target_sale;
 update public.sales set
  paid_amount=case when sale_voided is null then paid else 0 end,
  balance=case when sale_voided is null then greatest(total_due-paid,0) else 0 end,
  payment_status=case when sale_voided is not null then 'ANULADA' when paid<=0 then 'Pendiente' when paid>=total_due then 'Pagado' else 'Abonado' end
 where id=target_sale;
 return coalesce(new,old);
end;
$function$;
create or replace function public.record_sale_payment(p_sale_id uuid,p_amount numeric,p_payment_method text,p_payment_date date)
returns table(paid_amount numeric,balance numeric,payment_status text)
language plpgsql security definer set search_path=public
as $function$
declare v_uid uuid:=auth.uid(); v_total numeric(14,2); v_paid numeric(14,2); v_voided_at timestamptz;
begin
 if v_uid is null or not private.is_admin() then raise exception 'Solo el administrador puede registrar abonos.'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>trunc(p_amount) then raise exception 'El valor del abono debe ser un entero positivo.'; end if;
 if p_payment_method not in ('Efectivo','Transferencia con llaves','Nequi','Otros medios de pago') then raise exception 'Medio de pago inválido.'; end if;
 select total,voided_at into v_total,v_voided_at from public.sales where id=p_sale_id for update;
 if not found then raise exception 'Venta no encontrada.'; end if;
 if v_voided_at is not null then raise exception 'No se pueden registrar abonos a una venta anulada.'; end if;
 select coalesce(sum(amount),0) into v_paid from public.payments where sale_id=p_sale_id and reversed_at is null;
 if p_amount>v_total-v_paid then raise exception 'El abono supera el saldo pendiente.'; end if;
 insert into public.payments(sale_id,seller_id,amount,payment_date,payment_method)
 values(p_sale_id,v_uid,p_amount,coalesce(p_payment_date,current_date)::timestamp with time zone,p_payment_method);
 select s.paid_amount,s.balance,s.payment_status into paid_amount,balance,payment_status from public.sales s where s.id=p_sale_id;
 return next;
end;
$function$;
create or replace function public.void_sale(p_sale_id uuid,p_reason text)
returns table(sale_id uuid,restored_units integer,reversed_payments integer,voided_at timestamptz)
language plpgsql security definer set search_path=public,private
as $function$
declare v_uid uuid:=auth.uid(); v_sale public.sales%rowtype; v_item record; v_restored integer:=0; v_reversed integer:=0; v_count integer:=0; v_voided_at timestamptz; v_product_stock integer;
begin
 if v_uid is null or not private.is_admin() then raise exception 'Solo el administrador puede anular ventas.'; end if;
 if p_reason is null or length(trim(p_reason))<5 or length(trim(p_reason))>500 then raise exception 'Indica un motivo de anulación de entre 5 y 500 caracteres.'; end if;
 select * into v_sale from public.sales where id=p_sale_id for update;
 if not found then raise exception 'Venta no encontrada.'; end if;
 if v_sale.voided_at is not null then raise exception 'Esta venta ya fue anulada.'; end if;
 select count(*) into v_count from public.sale_items where sale_id=p_sale_id;
 if v_count=0 then raise exception 'La venta no tiene productos asociados; no se puede restaurar el inventario automáticamente.'; end if;
 if exists(select 1 from public.sale_items where sale_id=p_sale_id and product_id is null) then raise exception 'Hay productos sin referencia de inventario; se requiere revisión manual antes de anular.'; end if;
 update public.sales set voided_at=now(),voided_by=v_uid,void_reason=trim(p_reason),payment_status='ANULADA',paid_amount=0,balance=0
 where id=p_sale_id returning public.sales.voided_at into v_voided_at;
 for v_item in select product_id,sum(quantity)::integer as quantity from public.sale_items where sale_id=p_sale_id group by product_id order by product_id loop
  update public.products set stock=stock+v_item.quantity,status=case when stock+v_item.quantity>0 then 'Disponible' else status end
  where id=v_item.product_id returning stock into v_product_stock;
  if not found then raise exception 'No se encontró un producto asociado a la venta. No se aplicó la anulación.'; end if;
  insert into public.stock_movements(product_id,user_id,quantity,movement_type,notes)
  values(v_item.product_id,v_uid,v_item.quantity,'Anulación de venta','Restitución por anulación de venta '||p_sale_id::text||'. Motivo: '||trim(p_reason));
  v_restored:=v_restored+v_item.quantity;
 end loop;
 update public.payments set reversed_at=now(),reversed_by=v_uid,reversal_reason=trim(p_reason) where sale_id=p_sale_id and reversed_at is null;
 get diagnostics v_reversed=row_count;
 update public.sales set paid_amount=0,balance=0,payment_status='ANULADA' where id=p_sale_id;
 return query select p_sale_id,v_restored,v_reversed,v_voided_at;
end;
$function$;
revoke all on function public.void_sale(uuid,text) from public;
revoke all on function public.void_sale(uuid,text) from anon;
grant execute on function public.void_sale(uuid,text) to authenticated;
