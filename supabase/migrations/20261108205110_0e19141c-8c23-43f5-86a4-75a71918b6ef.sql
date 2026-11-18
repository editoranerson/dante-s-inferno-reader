CREATE TABLE public.chat_wallpapers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  access text NOT NULL DEFAULT 'free',
  price_dantes integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chat_wallpapers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.chat_wallpapers TO authenticated;
GRANT ALL ON public.chat_wallpapers TO service_role;
ALTER TABLE public.chat_wallpapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallpapers visible" ON public.chat_wallpapers FOR SELECT
  USING ((is_active AND access <> 'admin') OR public.is_admin());
CREATE POLICY "wallpapers admin write" ON public.chat_wallpapers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.user_wallpapers (
  user_id uuid NOT NULL,
  wallpaper_id uuid NOT NULL REFERENCES public.chat_wallpapers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, wallpaper_id)
);
GRANT SELECT ON public.user_wallpapers TO authenticated;
GRANT ALL ON public.user_wallpapers TO service_role;
ALTER TABLE public.user_wallpapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallpapers" ON public.user_wallpapers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.buy_wallpaper(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.chat_wallpapers; bal integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Faça login'); END IF;
  SELECT * INTO w FROM chat_wallpapers WHERE id = p_id AND is_active AND access = 'paid';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Papel de parede indisponível'); END IF;
  IF EXISTS (SELECT 1 FROM user_wallpapers WHERE user_id = auth.uid() AND wallpaper_id = p_id) THEN
    RETURN jsonb_build_object('ok',true,'already',true); END IF;
  SELECT points INTO bal FROM profiles WHERE id = auth.uid() FOR UPDATE;
  IF coalesce(bal,0) < w.price_dantes THEN RETURN jsonb_build_object('ok',false,'error','Dantes insuficientes'); END IF;
  UPDATE profiles SET points = points - w.price_dantes WHERE id = auth.uid();
  INSERT INTO user_wallpapers(user_id, wallpaper_id) VALUES (auth.uid(), p_id);
  RETURN jsonb_build_object('ok',true);
END $$;
GRANT EXECUTE ON FUNCTION public.buy_wallpaper(uuid) TO authenticated;