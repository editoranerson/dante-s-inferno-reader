DROP POLICY "Usuários podem denunciar respostas do Dante" ON public.dante_reports;

ALTER POLICY "Apenas admin acessa denúncias"
ON public.dante_reports
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
  OR (
    auth.uid() = user_id
    AND reason_type IN ('insult', 'threat_violence', 'jailbreak', 'other')
    AND severity = 'medium'
    AND status = 'pending'
  )
);