-- Security fixes: cross-tenant RPC, set_shop_id trigger hardening

-- C5: Fix increment_inventory_qty() to validate shop ownership
CREATE OR REPLACE FUNCTION public.increment_inventory_qty(p_id uuid, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Validate the target part belongs to the calling user's shop
  IF NOT EXISTS (
    SELECT 1 FROM parts_inventory
    WHERE id = p_id AND shop_id = get_shop_id()
  ) THEN
    RAISE EXCEPTION 'Access denied: part does not belong to your shop';
  END IF;

  UPDATE parts_inventory
  SET qty_on_hand = qty_on_hand + p_delta,
      updated_at = now()
  WHERE id = p_id;
END;
$function$;

-- C5: Fix next_po_id() to validate shop ownership when explicit shop_id is provided
CREATE OR REPLACE FUNCTION public.next_po_id(p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_shop_id uuid;
  max_num int;
BEGIN
  v_shop_id := COALESCE(p_shop_id, get_shop_id());

  -- If an explicit shop_id was provided, verify the caller belongs to that shop
  IF p_shop_id IS NOT NULL AND p_shop_id != get_shop_id() THEN
    RAISE EXCEPTION 'Access denied: cannot generate PO ID for another shop';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(display_id FROM 4) AS int)), 5000)
    INTO max_num
    FROM purchase_orders
    WHERE shop_id = v_shop_id;
  RETURN 'PO-' || (max_num + 1);
END;
$function$;

-- C6: Harden set_shop_id() trigger to ALWAYS overwrite shop_id
-- This prevents cross-tenant inserts even if an explicit foreign shop_id is provided
CREATE OR REPLACE FUNCTION public.set_shop_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    BEGIN
      -- Always overwrite shop_id with the caller's shop, preventing cross-tenant inserts
      NEW.shop_id := get_shop_id();
      IF NEW.shop_id IS NULL THEN
        RAISE EXCEPTION 'shop_id could not be determined';
      END IF;
      RETURN NEW;
    END;
    $function$;
