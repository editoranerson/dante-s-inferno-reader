CREATE OR REPLACE FUNCTION public.admin_affiliate_performance(p_ambassador_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visits_total integer;
  v_visits_retained integer;
  v_referrals integer;
  v_credits_used integer;
  v_credits_pending integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT count(*), count(*) FILTER (WHERE retained)
    INTO v_visits_total, v_visits_retained
    FROM public.affiliate_visits
   WHERE ambassador_id = p_ambassador_id;

  SELECT count(*), COALESCE(sum(credits_pending), 0)
    INTO v_referrals, v_credits_pending
    FROM public.affiliate_referrals
   WHERE ambassador_id = p_ambassador_id;

  SELECT COALESCE(sum((c.value ->> 'n')::integer), 0)
    INTO v_credits_used
    FROM public.affiliate_referrals r
    CROSS JOIN LATERAL (
      SELECT jsonb_build_object('n', count(*)) AS value
        FROM public.chat_messages m
       WHERE m.user_id = r.referred_id
         AND m.role = 'user'
    ) c
   WHERE r.ambassador_id = p_ambassador_id;

  RETURN json_build_object(
    'ok', true,
    'visits_total', v_visits_total,
    'visits_retained', v_visits_retained,
    'referrals', v_referrals,
    'credits_used', v_credits_used,
    'credits_pending', v_credits_pending
  );
END;
$$;