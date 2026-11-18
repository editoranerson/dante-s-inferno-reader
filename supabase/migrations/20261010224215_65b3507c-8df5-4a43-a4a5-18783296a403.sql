CREATE TABLE public.affiliate_scratch_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  multiplier numeric(6,2) NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_scratch_cards TO authenticated;
GRANT ALL ON public.affiliate_scratch_cards TO service_role;
ALTER TABLE public.affiliate_scratch_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage scratch cards" ON public.affiliate_scratch_cards FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.affiliate_user_scratch_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid NOT NULL REFERENCES public.affiliate_accounts(user_id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.affiliate_scratch_cards(id) ON DELETE CASCADE,
  code text NOT NULL,
  multiplier numeric(6,2) NOT NULL,
  obtained_by text NOT NULL,
  coins_paid integer NOT NULL DEFAULT 0,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (ambassador_id, card_id)
);
GRANT SELECT ON public.affiliate_user_scratch_cards TO authenticated;
GRANT ALL ON public.affiliate_user_scratch_cards TO service_role;
ALTER TABLE public.affiliate_user_scratch_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ambassador reads own tickets" ON public.affiliate_user_scratch_cards FOR SELECT TO authenticated
  USING (ambassador_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.affiliate_scratch_event_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT value FROM site_content WHERE key='affiliate_scratch_event_active') = 'true', false);
$$;

CREATE OR REPLACE FUNCTION public.affiliate_active_multiplier(p_ambassador_id uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v numeric;
BEGIN
  IF NOT public.affiliate_scratch_event_active() THEN RETURN 1; END IF;
  SELECT CASE WHEN plan_expires_at > now() THEN plan ELSE 'free' END INTO v_plan FROM profiles WHERE id = p_ambassador_id;
  IF v_plan = 'dante_premium_plus' THEN
    SELECT sum(multiplier) INTO v FROM affiliate_user_scratch_cards WHERE ambassador_id = p_ambassador_id AND expires_at > now();
  ELSE
    SELECT max(multiplier) INTO v FROM affiliate_user_scratch_cards WHERE ambassador_id = p_ambassador_id AND expires_at > now();
  END IF;
  RETURN GREATEST(COALESCE(v, 1), 1);
END; $$;

-- Aplica o multiplicador em todo ganho de Coins
CREATE OR REPLACE FUNCTION public.affiliate_apply_multiplier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m numeric; extra integer;
BEGIN
  IF NEW.amount <= 0 OR NEW.source_type NOT IN ('visit_batch','referral_signup','referral_subscription','referral_credits','referral_dantes') THEN
    RETURN NEW;
  END IF;
  m := public.affiliate_active_multiplier(NEW.ambassador_id);
  IF m <= 1 THEN RETURN NEW; END IF;
  extra := round(NEW.amount * (m - 1))::integer;
  IF extra <= 0 THEN RETURN NEW; END IF;
  UPDATE affiliate_accounts SET coins = coins + extra WHERE user_id = NEW.ambassador_id AND NOT is_blocked;
  IF NOT FOUND THEN RETURN NEW; END IF;
  NEW.amount := NEW.amount + extra;
  NEW.source_description := CASE WHEN NEW.source_description LIKE '{%' THEN NEW.source_description
    ELSE NEW.source_description || ' (multiplicador ' || trim(to_char(m,'FM999990.##')) || 'x)' END;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_affiliate_apply_multiplier BEFORE INSERT ON public.affiliate_earnings
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_apply_multiplier();

CREATE OR REPLACE FUNCTION public.affiliate_scratch_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_plan text; v_free int; v_used_free int; v_total int; v_price int;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT CASE WHEN plan_expires_at > now() THEN plan ELSE 'free' END INTO v_plan FROM profiles WHERE id = v_uid;
  v_plan := COALESCE(v_plan,'free');
  v_free := CASE v_plan WHEN 'dante_plus' THEN 1 WHEN 'dante_premium' THEN 2 WHEN 'dante_premium_plus' THEN 3 ELSE 0 END;
  v_price := CASE WHEN v_plan = 'dante_premium_plus' THEN 5 ELSE 10 END;
  SELECT count(*), count(*) FILTER (WHERE obtained_by='free') INTO v_total, v_used_free
    FROM affiliate_user_scratch_cards WHERE ambassador_id = v_uid;
  RETURN jsonb_build_object(
    'active', public.affiliate_scratch_event_active(),
    'plan', v_plan, 'accumulates', v_plan = 'dante_premium_plus',
    'free_left', GREATEST(v_free - v_used_free, 0), 'price', v_price,
    'used', v_total, 'limit', 5,
    'multiplier', public.affiliate_active_multiplier(v_uid));
END; $$;

CREATE OR REPLACE FUNCTION public.affiliate_scratch_draw() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); st jsonb; acc affiliate_accounts; c affiliate_scratch_cards; v_by text; v_cost int := 0; v_row affiliate_user_scratch_cards;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  SELECT * INTO acc FROM affiliate_accounts WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Você ainda não é embaixador'); END IF;
  IF acc.is_blocked THEN RETURN jsonb_build_object('ok',false,'error','Conta bloqueada'); END IF;
  st := public.affiliate_scratch_status();
  IF NOT (st->>'active')::boolean THEN RETURN jsonb_build_object('ok',false,'error','Evento encerrado'); END IF;
  IF (st->>'used')::int >= 5 THEN RETURN jsonb_build_object('ok',false,'error','Limite de 5 bilhetes atingido'); END IF;
  IF (st->>'free_left')::int > 0 THEN v_by := 'free';
  ELSE
    v_by := 'coins'; v_cost := (st->>'price')::int;
    IF acc.coins < v_cost THEN RETURN jsonb_build_object('ok',false,'error','Coins insuficientes'); END IF;
  END IF;
  SELECT * INTO c FROM affiliate_scratch_cards s WHERE s.is_active
    AND NOT EXISTS (SELECT 1 FROM affiliate_user_scratch_cards u WHERE u.ambassador_id = v_uid AND u.card_id = s.id)
    ORDER BY random() LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Nenhum bilhete disponível no momento'); END IF;
  IF v_cost > 0 THEN
    UPDATE affiliate_accounts SET coins = coins - v_cost WHERE user_id = v_uid;
    INSERT INTO affiliate_earnings (ambassador_id, amount, source_type, source_description)
    VALUES (v_uid, -v_cost, 'redemption', 'Bilhete da raspadinha ' || c.code);
  END IF;
  INSERT INTO affiliate_user_scratch_cards (ambassador_id, card_id, code, multiplier, obtained_by, coins_paid, expires_at)
  VALUES (v_uid, c.id, c.code, c.multiplier, v_by, v_cost, now() + interval '5 days') RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok',true,'code',c.code,'multiplier',c.multiplier,'obtained_by',v_by,
    'expires_at',v_row.expires_at,'total_multiplier',public.affiliate_active_multiplier(v_uid));
END; $$;

REVOKE EXECUTE ON FUNCTION public.affiliate_active_multiplier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.affiliate_apply_multiplier() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.affiliate_scratch_draw() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.affiliate_scratch_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.affiliate_scratch_draw() TO authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_scratch_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_scratch_event_active() TO anon, authenticated;