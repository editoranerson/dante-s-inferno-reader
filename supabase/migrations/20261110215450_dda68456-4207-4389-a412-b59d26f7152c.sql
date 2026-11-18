ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS difficulty_stars integer NOT NULL DEFAULT 1;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS max_supply integer;
ALTER TABLE public.user_cards ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

CREATE TABLE public.card_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text NOT NULL DEFAULT '',
  card_count integer NOT NULL DEFAULT 3,
  guaranteed_card_type text,
  is_for_sale boolean NOT NULL DEFAULT true,
  price_dantes integer NOT NULL DEFAULT 50,
  has_promo_code boolean NOT NULL DEFAULT false,
  promo_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.card_packs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.card_packs TO authenticated;
GRANT ALL ON public.card_packs TO service_role;
ALTER TABLE public.card_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packs ativos visiveis" ON public.card_packs FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY "admin gerencia packs" ON public.card_packs FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.card_pack_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.card_packs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_id, user_id)
);
GRANT SELECT ON public.card_pack_redemptions TO authenticated;
GRANT ALL ON public.card_pack_redemptions TO service_role;
ALTER TABLE public.card_pack_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver proprios resgates" ON public.card_pack_redemptions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public._draw_pack_card(p_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT c.id INTO v_id FROM public.cards c
  WHERE (p_type IS NULL OR c.type = p_type)
    AND (c.max_supply IS NULL OR c.max_supply <= 0
         OR (SELECT count(*) FROM public.user_cards uc WHERE uc.card_id = c.id) < c.max_supply
         OR EXISTS (SELECT 1 FROM public.user_cards uc WHERE uc.card_id = c.id AND uc.user_id = auth.uid()))
  ORDER BY -ln(greatest(random(), 1e-12)) /
    (CASE greatest(1, least(5, c.difficulty_stars)) WHEN 1 THEN 60 WHEN 2 THEN 25 WHEN 3 THEN 10 WHEN 4 THEN 4 ELSE 1 END)
  LIMIT 1;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public._draw_pack_card(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.open_card_pack(p_pack_id uuid DEFAULT NULL, p_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pack public.card_packs;
  v_card uuid;
  v_cards jsonb := '[]'::jsonb;
  v_points int;
  i int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Faça login.'); END IF;

  IF p_code IS NOT NULL AND trim(p_code) <> '' THEN
    SELECT * INTO v_pack FROM public.card_packs
    WHERE is_active AND has_promo_code AND upper(promo_code) = upper(trim(p_code)) LIMIT 1;
    IF v_pack.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_pack'); END IF;
    BEGIN
      INSERT INTO public.card_pack_redemptions (pack_id, user_id) VALUES (v_pack.id, v_uid);
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Você já resgatou este código de pack.');
    END;
  ELSE
    SELECT * INTO v_pack FROM public.card_packs WHERE id = p_pack_id AND is_active AND is_for_sale;
    IF v_pack.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Pack indisponível.'); END IF;
    UPDATE public.profiles SET points = points - v_pack.price_dantes
    WHERE id = v_uid AND points >= v_pack.price_dantes;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Dantes insuficientes.'); END IF;
  END IF;

  FOR i IN 1..greatest(1, v_pack.card_count) LOOP
    v_card := public._draw_pack_card(CASE WHEN i = 1 THEN v_pack.guaranteed_card_type ELSE NULL END);
    IF v_card IS NULL AND i = 1 THEN v_card := public._draw_pack_card(NULL); END IF;
    IF v_card IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.user_cards (user_id, card_id, quantity) VALUES (v_uid, v_card, 1)
    ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1;
    v_cards := v_cards || jsonb_build_array(v_card);
  END LOOP;

  IF jsonb_array_length(v_cards) = 0 THEN
    RAISE EXCEPTION 'Nenhuma carta disponível para sorteio.';
  END IF;

  RETURN jsonb_build_object('ok', true, 'pack_name', v_pack.name, 'cards', v_cards);
END $$;
REVOKE EXECUTE ON FUNCTION public.open_card_pack(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.open_card_pack(uuid, text) TO authenticated;