GRANT INSERT ON public.dante_reports TO authenticated;

CREATE POLICY "Usuários podem denunciar respostas do Dante"
ON public.dante_reports
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND reason_type IN ('insult', 'threat_violence', 'jailbreak', 'other')
  AND severity = 'medium'
  AND status = 'pending'
);