ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS credits_pool_pending integer NOT NULL DEFAULT 0;

-- Move existing per-referral pending into the global pool
UPDATE public.affiliate_accounts a SET credits_pool_pending = COALESCE((SELECT sum(credits_pending) FROM public.affiliate_referrals r WHERE r.ambassador_id = a.user_id),0);
UPDATE public.affiliate_referrals SET credits_pending = 0;

CREATE OR REPLACE FUNCTION public.affiliate_add_credits_to_pool(p_ambassador_id uuid, p_credits integer, p_desc text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  acc affiliate_accounts; cr affiliate_custom_rules; v_found boolean;
  v_threshold integer; v_coins_per integer; v_batches integer; v_coins integer;
BEGIN
  SELECT * INTO acc FROM affiliate_accounts WHERE user_id = p_ambassador_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'no_account'); END IF;
  SELECT NULLIF(value,'')::integer INTO v_threshold FROM site_content WHERE key='affiliate_credits_threshold';
  SELECT NULLIF(value,'')::integer INTO v_coins_per FROM site_content WHERE key='affiliate_credits_coins_per';
  SELECT * INTO cr FROM affiliate_custom_rules WHERE ambassador_id = p_ambassador_id;
  v_found := FOUND;
  IF v_found THEN
    v_threshold := COALESCE(cr.credits_threshold, v_threshold);
    v_coins_per := COALESCE(cr.credits_coins_per, v_coins_per);
  END IF;
  v_threshold := GREATEST(COALESCE(v_threshold,100),1);
  v_coins_per := COALESCE(v_coins_per,1);

  UPDATE affiliate_accounts SET credits_pool_pending = credits_pool_pending + GREATEST(p_credits,0)
   WHERE user_id = p_ambassador_id RETURNING * INTO acc;
  v_batches := acc.credits_pool_pending / v_threshold;
  IF v_batches <= 0 THEN RETURN json_build_object('ok', true, 'coins', 0, 'pending', acc.credits_pool_pending); END IF;

  UPDATE affiliate_accounts SET credits_pool_pending = credits_pool_pending - v_batches * v_threshold WHERE user_id = p_ambassador_id;
  v_coins := v_batches * v_coins_per;
  IF public.is_subscriber(p_ambassador_id) THEN v_coins := v_coins * 2; END IF;
  IF v_coins <= 0 OR acc.is_blocked THEN RETURN json_build_object('ok', true, 'coins', 0); END IF;

  UPDATE affiliate_accounts SET coins = coins + v_coins WHERE user_id = p_ambassador_id;
  INSERT INTO affiliate_earnings (ambassador_id, amount, source_type, source_description)
  VALUES (p_ambassador_id, v_coins, 'referral_credits',
    COALESCE(p_desc, 'Indicados usaram ' || (v_batches * v_threshold) || ' créditos conversando com o Dante'));
  RETURN json_build_object('ok', true, 'coins', v_coins);
END; $$;
REVOKE EXECUTE ON FUNCTION public.affiliate_add_credits_to_pool(uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_add_credits_to_pool(uuid,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.track_referral_credit_use(p_referred_id uuid, p_credits integer DEFAULT 1)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r affiliate_referrals;
BEGIN
  SELECT * INTO r FROM affiliate_referrals WHERE referred_id = p_referred_id LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'no_referral'); END IF;
  RETURN public.affiliate_add_credits_to_pool(r.ambassador_id, p_credits);
END; $$;

CREATE OR REPLACE FUNCTION public.award_referral_signup(p_referred_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r affiliate_referrals; cr affiliate_custom_rules; v integer;
BEGIN
  SELECT * INTO r FROM affiliate_referrals WHERE referred_id = p_referred_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'no_referral'); END IF;
  SELECT NULLIF(value,'')::integer INTO v FROM site_content WHERE key='affiliate_signup_coins';
  SELECT * INTO cr FROM affiliate_custom_rules WHERE ambassador_id = r.ambassador_id;
  IF FOUND AND cr.signup_coins IS NOT NULL THEN v := cr.signup_coins; END IF;
  v := COALESCE(v, 20);
  IF public.is_subscriber(r.ambassador_id) THEN v := v * 2; END IF;
  IF v <= 0 THEN RETURN json_build_object('ok', true, 'coins', 0); END IF;
  UPDATE affiliate_accounts SET coins = coins + v WHERE user_id = r.ambassador_id AND NOT is_blocked;
  IF FOUND THEN
    INSERT INTO affiliate_earnings (ambassador_id, amount, source_type, source_description)
    VALUES (r.ambassador_id, v, 'referral_signup', CASE WHEN r.is_manual THEN 'Indicado vinculado manualmente' ELSE 'Indicado se cadastrou' END);
  END IF;
  RETURN json_build_object('ok', true, 'coins', v);
END; $$;

CREATE OR REPLACE FUNCTION public.award_referral_credits(p_referred_id uuid, p_credits_used integer)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN RETURN public.track_referral_credit_use(p_referred_id, p_credits_used); END; $$;

CREATE OR REPLACE FUNCTION public.award_referral_dantes(p_referred_id uuid, p_dantes_amount integer)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r affiliate_referrals; cr affiliate_custom_rules; t integer; c integer; v integer;
BEGIN
  SELECT * INTO r FROM affiliate_referrals WHERE referred_id = p_referred_id LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'no_referral'); END IF;
  SELECT NULLIF(value,'')::integer INTO t FROM site_content WHERE key='affiliate_dantes_threshold';
  SELECT NULLIF(value,'')::integer INTO c FROM site_content WHERE key='affiliate_dantes_coins_per';
  SELECT * INTO cr FROM affiliate_custom_rules WHERE ambassador_id = r.ambassador_id;
  IF FOUND THEN t := COALESCE(cr.dantes_threshold, t); c := COALESCE(cr.dantes_coins_per, c); END IF;
  v := (p_dantes_amount / GREATEST(COALESCE(t,50),1)) * COALESCE(c,1);
  IF public.is_subscriber(r.ambassador_id) THEN v := v * 2; END IF;
  IF v <= 0 THEN RETURN json_build_object('ok', true, 'coins', 0); END IF;
  UPDATE affiliate_accounts SET coins = coins + v WHERE user_id = r.ambassador_id AND NOT is_blocked;
  IF FOUND THEN
    INSERT INTO affiliate_earnings (ambassador_id, amount, source_type, source_description)
    VALUES (r.ambassador_id, v, 'referral_dantes', 'Indicado ganhou ' || p_dantes_amount || ' Dantes');
  END IF;
  RETURN json_build_object('ok', true, 'coins', v);
END; $$;

CREATE OR REPLACE FUNCTION public.award_referral_subscription(p_referred_id uuid, p_plan text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r affiliate_referrals; cr affiliate_custom_rules; v integer;
BEGIN
  SELECT * INTO r FROM affiliate_referrals WHERE referred_id = p_referred_id LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'no_referral'); END IF;
  SELECT NULLIF(value,'')::integer INTO v FROM site_content WHERE key = 'affiliate_plan_' || p_plan || '_coins';
  SELECT * INTO cr FROM affiliate_custom_rules WHERE ambassador_id = r.ambassador_id;
  IF FOUND AND cr.plan_coins_override IS NOT NULL AND (cr.plan_coins_override ->> p_plan) IS NOT NULL
     AND (cr.plan_coins_override ->> p_plan) <> '' THEN
    v := (cr.plan_coins_override ->> p_plan)::integer;
  END IF;
  v := COALESCE(v, 0);
  IF v <= 0 THEN RETURN json_build_object('ok', true, 'coins', 0, 'note', 'no_coins_for_plan'); END IF;
  IF public.is_subscriber(r.ambassador_id) THEN v := v * 2; END IF;
  UPDATE affiliate_accounts SET coins = coins + v WHERE user_id = r.ambassador_id AND NOT is_blocked;
  IF FOUND THEN
    INSERT INTO affiliate_earnings (ambassador_id, amount, source_type, source_description)
    VALUES (r.ambassador_id, v, 'referral_subscription', 'Indicado assinou plano: ' || p_plan);
  END IF;
  RETURN json_build_object('ok', true, 'coins', v);
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_visit_retention(p_visit_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE visit affiliate_visits; cr affiliate_custom_rules; bs integer; bc integer; total integer; done integer; valid integer;
BEGIN
  SELECT * INTO visit FROM affiliate_visits WHERE id = p_visit_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'visit_not_found'); END IF;
  IF visit.retained THEN RETURN json_build_object('ok', true, 'already_retained', true); END IF;
  UPDATE affiliate_visits SET retained = true WHERE id = p_visit_id;
  PERFORM 1 FROM affiliate_accounts WHERE user_id = visit.ambassador_id FOR UPDATE;
  SELECT NULLIF(value,'')::integer INTO bs FROM site_content WHERE key='affiliate_visit_batch_size';
  SELECT NULLIF(value,'')::integer INTO bc FROM site_content WHERE key='affiliate_visit_batch_coins';
  SELECT * INTO cr FROM affiliate_custom_rules WHERE ambassador_id = visit.ambassador_id;
  IF FOUND THEN bs := COALESCE(cr.visit_batch_size, bs); bc := COALESCE(cr.visit_batch_coins, bc); END IF;
  bs := GREATEST(COALESCE(bs,100),1); bc := COALESCE(bc,1);
  IF public.is_subscriber(visit.ambassador_id) THEN bc := bc * 2; END IF;
  SELECT count(*) INTO total FROM affiliate_visits WHERE ambassador_id = visit.ambassador_id AND retained;
  BEGIN
    SELECT COALESCE(sum((source_description::json->>'visits')::integer),0) INTO done
      FROM affiliate_earnings WHERE ambassador_id = visit.ambassador_id AND source_type='visit_batch' AND source_description LIKE '{%';
  EXCEPTION WHEN OTHERS THEN done := 0; END;
  valid := total - done;
  IF valid >= bs THEN
    UPDATE affiliate_accounts SET coins = coins + bc WHERE user_id = visit.ambassador_id AND NOT is_blocked;
    INSERT INTO affiliate_earnings (ambassador_id, amount, source_type, source_description)
    VALUES (visit.ambassador_id, bc, 'visit_batch', json_build_object('visits', bs, 'last_visit_id', visit.id)::text);
    RETURN json_build_object('ok', true, 'retained', true, 'batch_credited', true, 'coins', bc);
  END IF;
  RETURN json_build_object('ok', true, 'retained', true, 'batch_credited', false, 'valid_visits', valid);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_attach_referral(p_ambassador_id uuid, p_referred_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_used integer; v_signup json; v_credits json;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_ambassador_id = p_referred_id THEN RETURN json_build_object('ok', false, 'error', 'self_referral'); END IF;
  IF EXISTS (SELECT 1 FROM affiliate_referrals WHERE referred_id = p_referred_id) THEN
    RETURN json_build_object('ok', false, 'error', 'already_linked');
  END IF;
  INSERT INTO affiliate_referrals (ambassador_id, referred_id, is_manual) VALUES (p_ambassador_id, p_referred_id, true);
  v_signup := public.award_referral_signup(p_referred_id);
  SELECT count(*) INTO v_used FROM chat_messages WHERE user_id = p_referred_id AND role = 'user';
  v_credits := public.affiliate_add_credits_to_pool(p_ambassador_id, v_used,
    'Créditos do indicado vinculado manualmente');
  RETURN json_build_object('ok', true, 'signup', v_signup, 'credits_imported', v_used, 'credits', v_credits);
END; $$;

-- Performance: pending now comes from the global pool
CREATE OR REPLACE FUNCTION public.admin_affiliate_performance(p_ambassador_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE vt integer; vr integer; rf integer; cu integer; cp integer;
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('ok', false, 'error', 'not_admin'); END IF;
  SELECT count(*), count(*) FILTER (WHERE retained) INTO vt, vr FROM affiliate_visits WHERE ambassador_id = p_ambassador_id;
  SELECT count(*) INTO rf FROM affiliate_referrals WHERE ambassador_id = p_ambassador_id;
  SELECT count(*) INTO cu FROM chat_messages m JOIN affiliate_referrals r ON r.referred_id = m.user_id
   WHERE r.ambassador_id = p_ambassador_id AND m.role = 'user';
  SELECT credits_pool_pending INTO cp FROM affiliate_accounts WHERE user_id = p_ambassador_id;
  RETURN json_build_object('ok', true, 'visits_total', vt, 'visits_retained', vr, 'referrals', rf, 'credits_used', cu, 'credits_pending', COALESCE(cp,0));
END; $$;

REVOKE EXECUTE ON FUNCTION public.award_referral_signup(uuid), public.award_referral_credits(uuid,integer), public.award_referral_dantes(uuid,integer), public.award_referral_subscription(uuid,text), public.track_referral_credit_use(uuid,integer) FROM PUBLIC, anon, authenticated;