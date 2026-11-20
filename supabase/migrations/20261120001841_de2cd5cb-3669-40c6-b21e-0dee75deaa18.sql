ALTER TABLE public.dante_coffee_items ADD COLUMN IF NOT EXISTS dante_rating numeric(3,1) NOT NULL DEFAULT 5;
CREATE OR REPLACE FUNCTION public.validate_dante_rating() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.dante_rating < 0 OR NEW.dante_rating > 10 THEN RAISE EXCEPTION 'Nota do Dante deve ficar entre 0 e 10'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_dante_rating ON public.dante_coffee_items;
CREATE TRIGGER trg_validate_dante_rating BEFORE INSERT OR UPDATE ON public.dante_coffee_items FOR EACH ROW EXECUTE FUNCTION public.validate_dante_rating();