ALTER TABLE public.affiliate_referrals ADD COLUMN IF NOT EXISTS credits_pending integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.track_referral_credit_use(p_referred_id uuid, p_credits integer DEFAULT 1)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  referral affiliate_referrals;
  custom_rule affiliate_custom_rules;
  v_threshold integer;
  v_coins_per integer;
  v_batches integer;
  v_coins integer;
BEGIN
  SELECT * INTO referral FROM affiliate_referrals WHERE referred_id = p_referred_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'no_referral'); END IF;

  SELECT NULLIF(value,'')::integer INTO v_threshold FROM site_content WHERE key = 'affiliate_credits_threshold';
  SELECT NULLIF(value,'')::integer INTO v_coins_per FROM site_content WHERE key = 'affiliate_credits_coins_per';
  SELECT * INTO custom_rule FROM affiliate_custom_rules WHERE ambassador_id = referral.ambassador_id;
  IF FOUND THEN
    v_threshold := COALESCE(custom_rule.credits_threshold, v_threshold);
    v_coins_per := COALESCE(custom_rule.credits_coins_per, v_coins_per);
  END IF;
  v_threshold := GREATEST(COALESCE(v_threshold, 100), 1);
  v_coins_per := COALESCE(v_coins_per, 1);

  UPDATE affiliate_referrals SET credits_pending = credits_pending + GREATEST(p_credits,0)
  WHERE id = referral.id RETURNING * INTO referral;

  v_batches := referral.credits_pending / v_threshold;
  IF v_batches <= 0 THEN
    RETURN json_build_object('ok', true, 'coins', 0, 'pending', referral.credits_pending);
  END IF;

  UPDATE affiliate_referrals SET credits_pending = credits_pending - v_batches * v_threshold WHERE id = referral.id;

  v_coins := v_batches * v_coins_per;
  IF public.is_subscriber(referral.ambassador_id) THEN v_coins := v_coins * 2; END IF;
  IF v_coins <= 0 THEN RETURN json_build_object('ok', true, 'coins', 0); END IF;

  UPDATE affiliate_accounts SET coins = coins + v_coins
  WHERE user_id = referral.ambassador_id AND NOT is_blocked;
  IF FOUND THEN
    INSERT INTO affiliate_earnings (ambassador_id, amount, source_type, source_description)
    VALUES (referral.ambassador_id, v_coins, 'referral_credits',
      'Indicado usou ' || (v_batches * v_threshold) || ' créditos conversando com o Dante');
  END IF;
  RETURN json_build_object('ok', true, 'coins', v_coins);
END; $$;

REVOKE ALL ON FUNCTION public.track_referral_credit_use(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_referral_credit_use(uuid, integer) TO service_role;