-- Applied to Supabase project nidkljhagbauuorhpwns on 2026-11-22.
-- Shared cloud sale summaries, payment aggregation, and atomic inventory decrement.

begin;

alter table public.sales
  add column if not exists customer_name text,
  add column if not exists paid_amount numeric(14,2) not null default 0,
  add column if not exists balance numeric(14,2) not null default 0,
  add column if not exists client_request_id uuid;

create unique index if not exists sales_seller_request_uidx
  on public.sales(seller_id, client_request_id)
  where client_request_id is not null;

revoke truncate, references, trigger on table
  public.profiles, public.products, public.customers, public.sales,
  public.sale_items, public.payments, public.stock_movements
from authenticated, anon;

drop policy if exists "Admin modifica perfiles" on public.profiles;
drop policy if exists "Usuarios modifican perfiles" on public.profiles;

drop policy if exists "Consultar pagos propios o admin" on public.payments;
create policy "Solo administrador consulta pagos"
  on public.payments for select to authenticated
  using (public.is_admin());

drop policy if exists "Solo admin registra pagos" on public.payments;
create policy "Solo administrador registra pagos"
  on public.payments for insert to authenticated
  with check (public.is_admin());

create or replace function public.refresh_sale_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sale uuid;
  paid numeric(14,2);
  total_due numeric(14,2);
begin
  target_sale := coalesce(new.sale_id, old.sale_id);
  select coalesce(sum(amount),0) into paid
  from public.payments where sale_id = target_sale;
  select total into total_due from public.sales where id = target_sale;
  update public.sales
     set paid_amount = paid,
         balance = greatest(total_due - paid, 0),
         payment_status = case
           when paid <= 0 then 'Pendiente'
           when paid >= total_due then 'Pagado'
           else 'Abonado'
         end
   where id = target_sale;
  return coalesce(new, old);
end;
$$;

drop trigger if exists payments_refresh_sale_totals on public.payments;
create trigger payments_refresh_sale_totals
after insert or update or delete on public.payments
for each row execute function public.refresh_sale_payment_totals();

create or replace function public.create_sale_with_item(
  p_client_request_id uuid,
  p_product_id uuid,
  p_product_name text,
  p_quantity integer,
  p_unit_price numeric,
  p_sale_date date,
  p_customer_name text default null
)
returns table(sale_id uuid, product_stock integer, sale_total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.products%rowtype;
  v_sale_id uuid;
  v_total numeric(14,2);
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Cantidad inválida.'; end if;
  if p_unit_price is null or p_unit_price <= 0 then raise exception 'Precio inválido.'; end if;
  if p_client_request_id is null then raise exception 'Falta identificador de solicitud.'; end if;

  select id into v_sale_id from public.sales
   where seller_id = v_uid and client_request_id = p_client_request_id;
  if v_sale_id is not null then
    select stock into product_stock from public.products where id = p_product_id;
    select total into sale_total from public.sales where id = v_sale_id;
    sale_id := v_sale_id;
    return next;
    return;
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  if v_product.stock < p_quantity then raise exception 'Existencias insuficientes. Disponibles: %', v_product.stock; end if;
  v_total := p_quantity * p_unit_price;

  insert into public.sales(
    seller_id, total, payment_status, sale_date, customer_name,
    client_request_id, paid_amount, balance
  ) values (
    v_uid, v_total, 'Pendiente', coalesce(p_sale_date, current_date),
    nullif(trim(p_customer_name), ''), p_client_request_id, 0, v_total
  ) returning id into v_sale_id;

  insert into public.sale_items(sale_id, product_id, product_name, quantity, unit_price, subtotal)
  values (v_sale_id, p_product_id, coalesce(nullif(p_product_name,''),v_product.name), p_quantity, p_unit_price, v_total);

  update public.products set stock = stock - p_quantity,
    status = case when stock - p_quantity <= 0 then 'Agotado' else 'Disponible' end
  where id = p_product_id returning stock into product_stock;

  insert into public.stock_movements(product_id,user_id,quantity,movement_type,notes)
  values (p_product_id,v_uid,-p_quantity,'Venta','Venta ' || v_sale_id::text);

  sale_id := v_sale_id;
  sale_total := v_total;
  return next;
end;
$$;

create or replace function public.record_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date
)
returns table(paid_amount numeric, balance numeric, payment_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total numeric(14,2);
  v_paid numeric(14,2);
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Solo el administrador puede registrar abonos.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'El valor del abono debe ser un entero positivo.';
  end if;
  if p_payment_method not in ('Efectivo','Transferencia con llaves','Nequi','Otros medios de pago') then
    raise exception 'Medio de pago inválido.';
  end if;

  select total into v_total from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where sale_id=p_sale_id;
  if p_amount > v_total-v_paid then raise exception 'El abono supera el saldo pendiente.'; end if;

  insert into public.payments(sale_id,seller_id,amount,payment_date,payment_method)
  values (p_sale_id,v_uid,p_amount,coalesce(p_payment_date,current_date)::timestamp with time zone,p_payment_method);

  select s.paid_amount,s.balance,s.payment_status
    into paid_amount,balance,payment_status
    from public.sales s where s.id=p_sale_id;
  return next;
end;
$$;

revoke all on function public.create_sale_with_item(uuid,uuid,text,integer,numeric,date,text) from public, anon;
grant execute on function public.create_sale_with_item(uuid,uuid,text,integer,numeric,date,text) to authenticated;
revoke all on function public.record_sale_payment(uuid,numeric,text,date) from public, anon;
grant execute on function public.record_sale_payment(uuid,numeric,text,date) to authenticated;
revoke all on function public.refresh_sale_payment_totals() from public, anon, authenticated;

update public.sales s
set paid_amount=coalesce(x.paid,0),
    balance=greatest(s.total-coalesce(x.paid,0),0),
    payment_status=case when coalesce(x.paid,0)<=0 then 'Pendiente' when coalesce(x.paid,0)>=s.total then 'Pagado' else 'Abonado' end
from (select s2.id,coalesce(sum(p.amount),0) as paid from public.sales s2 left join public.payments p on p.sale_id=s2.id group by s2.id) x
where x.id=s.id;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='products') then
    alter publication supabase_realtime add table public.products;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sales') then
    alter publication supabase_realtime add table public.sales;
  end if;
end $$;

commit;