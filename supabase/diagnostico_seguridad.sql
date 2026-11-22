-- DIAGNOSTICO DE SOLO LECTURA PARA LA SINCRONIZACION
-- Ejecutar en Supabase > SQL Editor.
-- Este archivo NO modifica tablas, datos, permisos ni politicas.

-- 1) Politicas RLS existentes en las tablas de la aplicacion.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'products',
    'customers',
    'sales',
    'sale_items',
    'payments',
    'stock_movements'
  )
order by tablename, policyname;

-- 2) Columnas reales y tipos (incluye columnas opcionales/no documentadas).
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'products',
    'customers',
    'sales',
    'sale_items',
    'payments',
    'stock_movements'
  )
order by table_name, ordinal_position;

-- 3) Claves, restricciones e indices existentes para evitar duplicados
-- o proponer cambios incompatibles con la estructura actual.
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_schema = kcu.constraint_schema
 and tc.table_name = kcu.table_name
 and tc.constraint_name = kcu.constraint_name
left join information_schema.constraint_column_usage ccu
  on tc.constraint_schema = ccu.constraint_schema
 and tc.constraint_name = ccu.constraint_name
where tc.constraint_schema = 'public'
  and tc.table_name in (
    'profiles',
    'products',
    'customers',
    'sales',
    'sale_items',
    'payments',
    'stock_movements'
  )
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'profiles',
    'products',
    'customers',
    'sales',
    'sale_items',
    'payments',
    'stock_movements'
  )
order by tablename, indexname;
