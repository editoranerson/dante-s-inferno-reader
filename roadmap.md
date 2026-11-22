# Roadmap

## Limpeza das telas — Dante 3.5
- [x] Retirar cafeína, garrafa, notas e recusa do perfil, cardápio e recibos.
- [x] Retirar consumo de energia e horário enviado pelo chat; preservar markdown e bloqueios.
- [x] Retirar diagnóstico de afinidade das telas administrativas.
- [x] Validar recibos antigos e novos, 11 testes e telas em celular e computador com dados simulados.

## Plano aprovado: Café e Chat do Dante
- [x] Blindar o aceite das notas 8 a 10 e avaliar separadamente os cafés de lotes mistos.
- [x] Atualizar recibos imediatamente com recusa carmim e mostrar “Avaliando café...” durante a avaliação.
- [x] Testar e publicar a função atualizada do Dante.
- [x] Publicar a Edge Function `chat-dante` com validação real da doação e agradecimento sem consumo de créditos.
- [x] Chamar a Edge Function após cada doação e exibir somente o agradecimento retornado pelo Dante.
- [x] Renderizar o recibo de café estilizado imediatamente e ao recarregar o histórico.
- [x] Permitir que usuários comuns denunciem respostas do Dante com os quatro motivos previstos.
- [x] Validar 25 testes, tipos, lint, build e fluxo visual móvel das três melhorias.
- [ ] Confirmar o fluxo com uma conta real no Supabase externo: não há sessão de teste disponível neste ambiente.

## Doação isolada e diagnóstico de afeto
- [x] Enviar ao modelo somente a doação atual, sem histórico, horário, conhecimento adicional ou modo de cafeína, com resposta curta.
- [x] Conectar diagnóstico de afeto às últimas 20 mensagens, exclusivo para ADMIN, com atualização imediata do perfil.
- [x] Executar 52 testes de regressão e verificar a interface com dados simulados em computador e celular.
- [x] Publicar a função chat-dante; ferramenta confirmou envio da versão atualizada.
- Diagnóstico de afeto removido das telas no Dante 3.5; validação autenticada de doações permanece no item acima.
