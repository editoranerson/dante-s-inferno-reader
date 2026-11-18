REVOKE EXECUTE ON FUNCTION public.admin_affiliate_performance(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_performance(uuid) TO authenticated;