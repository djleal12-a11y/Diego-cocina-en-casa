-- Applied to Supabase project nidkljhagbauuorhpwns on 2026-11-22.
-- Require an available product and the current catalog price for every sale.
create or replace function public.create_sale_with_item(
 p_client_request_id uuid,p_product_id uuid,p_product_name text,p_quantity integer,
 p_unit_price numeric,p_sale_date date,p_customer_name text default null
)
returns table(sale_id uuid,product_stock integer,sale_total numeric)
language plpgsql security definer set search_path=public
as $$
declare v_uid uuid:=auth.uid(); v_product public.products%rowtype; v_sale_id uuid; v_total numeric(14,2);
begin
 if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
 if p_quantity is null or p_quantity<1 then raise exception 'Cantidad inválida.'; end if;
 if p_client_request_id is null then raise exception 'Falta identificador de solicitud.'; end if;
 select id into v_sale_id from public.sales where seller_id=v_uid and client_request_id=p_client_request_id;
 if v_sale_id is not null then
  select stock into product_stock from public.products where id=p_product_id;
  select total into sale_total from public.sales where id=v_sale_id;
  sale_id:=v_sale_id;return next;return;
 end if;
 select * into v_product from public.products where id=p_product_id for update;
 if not found then raise exception 'Producto no encontrado.'; end if;
 if v_product.status<>'Disponible' then raise exception 'Este producto no está disponible para la venta.'; end if;
 if v_product.stock<p_quantity then raise exception 'Existencias insuficientes. Disponibles: %',v_product.stock; end if;
 if p_unit_price is null or p_unit_price<>v_product.price then raise exception 'El precio del producto cambió. Actualiza el catálogo antes de vender.'; end if;
 v_total:=p_quantity*v_product.price;
 insert into public.sales(seller_id,total,payment_status,sale_date,customer_name,client_request_id,paid_amount,balance)
 values(v_uid,v_total,'Pendiente',coalesce(p_sale_date,current_date),nullif(trim(p_customer_name),''),p_client_request_id,0,v_total)
 returning id into v_sale_id;
 insert into public.sale_items(sale_id,product_id,product_name,quantity,unit_price,subtotal)
 values(v_sale_id,p_product_id,v_product.name,p_quantity,v_product.price,v_total);
 update public.products set stock=stock-p_quantity,status=case when stock-p_quantity<=0 then 'Agotado' else 'Disponible' end
 where id=p_product_id returning stock into product_stock;
 insert into public.stock_movements(product_id,user_id,quantity,movement_type,notes)
 values(p_product_id,v_uid,-p_quantity,'Venta','Venta '||v_sale_id::text);
 sale_id:=v_sale_id;sale_total:=v_total;return next;
end;
$$;