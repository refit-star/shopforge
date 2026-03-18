-- Fix set_shop_id() trigger: unconditional overwrite broke service_role inserts.
-- New logic:
--   1. If caller has a JWT (authenticated user), ALWAYS use get_shop_id() (prevents cross-tenant)
--   2. If no JWT (service_role / admin context), trust the explicitly provided shop_id
--   3. If neither JWT nor explicit shop_id, raise exception

CREATE OR REPLACE FUNCTION public.set_shop_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      resolved_shop uuid;
    BEGIN
      resolved_shop := get_shop_id();

      IF resolved_shop IS NOT NULL THEN
        -- Authenticated user: always enforce their shop (prevents cross-tenant inserts)
        NEW.shop_id := resolved_shop;
      ELSIF NEW.shop_id IS NOT NULL THEN
        -- Service role (no JWT): trust the explicitly provided shop_id
        NULL; -- keep NEW.shop_id as-is
      ELSE
        RAISE EXCEPTION 'shop_id could not be determined';
      END IF;

      RETURN NEW;
    END;
    $function$;

-- Also fix increment_inventory_qty to handle service_role context
-- (when called from PO receive route via admin client, get_shop_id() returns NULL)
CREATE OR REPLACE FUNCTION public.increment_inventory_qty(p_id uuid, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  caller_shop uuid;
BEGIN
  caller_shop := get_shop_id();

  -- If caller has a shop context, validate ownership
  IF caller_shop IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM parts_inventory
      WHERE id = p_id AND shop_id = caller_shop
    ) THEN
      RAISE EXCEPTION 'Access denied: part does not belong to your shop';
    END IF;
  END IF;
  -- If no shop context (service_role), allow the update (caller is trusted server code)

  UPDATE parts_inventory
  SET qty_on_hand = qty_on_hand + p_delta,
      updated_at = now()
  WHERE id = p_id;
END;
$function$;
