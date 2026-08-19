# Imobiliária Oliveira

Sistema React/Vite para catálogo de imóveis, autenticação por convite, contratos PDF com assinatura eletrônica interna, aluguel manual e manutenção com crédito previamente aprovado.

## Limites operacionais

- O sistema **não cobra** aluguel. PIX e transferência ocorrem fora dele.
- Comprovante enviado não significa quitação antes da aprovação do proprietário.
- A assinatura é interna, com autenticação, OTP, nome completo, hash, data, IP e navegador. Não é certificado ICP-Brasil nem assinatura de plataforma externa.
- O texto contratual precisa de revisão jurídica antes de uma locação real.

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e informe a URL e a chave `anon` do Supabase.
2. No Supabase compartilhado, vincule este diretório com `npx supabase link --project-ref ...`.
3. Revise e aplique a migração com `npx supabase db push`.
4. Configure `SITE_URL`, `RESEND_API_KEY` e `OLIVEIRA_OTP_PEPPER` nos secrets das Edge Functions.
5. Publique as funções da pasta `supabase/functions`.
6. Não altere os templates globais do Supabase Auth: convite, recuperação e OTP da imobiliária são enviados pelas funções `oliveira-*` para não afetar os outros sistemas do projeto compartilhado.
7. Crie/confirme a conta `playtecno@outlook.com.br`; somente ela passa na verificação administrativa server-side.
8. Execute `npm run dev`.

O cadastro de inquilinos é feito pelo painel administrativo. O convite permite ao inquilino definir a própria senha. Cadastro público deve permanecer desabilitado no Supabase Auth.

## Validação

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

Antes da produção, teste com duas contas de inquilino para confirmar o isolamento RLS, a expiração do OTP, os URLs privados temporários, a aprovação de pagamentos e o crédito de manutenção.

## Vercel

1. Confirme a conta/equipe e o projeto antes de vincular o checkout.
2. Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nos ambientes Preview e Production.
3. No Supabase Auth, inclua os domínios Vercel autorizados e `/convite` nas URLs de redirecionamento.
4. Use `npm run build` como build command e `dist` como output.
5. Atualize `SITE_URL` das Edge Functions com a URL final e repita convite, OTP e download do PDF no ambiente publicado.

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no Vite ou na Vercel do frontend.

## E-mails automáticos

- Remetente: `Imobiliária Oliveira <noreply@playtecno.com.br>` (domínio confirmado pelo Resend).
- Respostas e cópia administrativa: `playtecno@outlook.com.br`.
- A cobrança é apenas um lembrete no dia do vencimento; nenhum pagamento é processado automaticamente.
- O job `oliveira-rent-due-0800-sao-paulo` roda diariamente às 11:00 UTC, equivalente a 08:00 em `America/Sao_Paulo`.
- Contratos são entregues por link autenticado para a área do inquilino, nunca como anexo público.
- O painel administrativo permite acompanhar falhas, enviar um teste e repetir uma entrega.
- O código de assinatura tem seis dígitos, expira em dez minutos, aceita no máximo cinco tentativas e é armazenado somente como HMAC.

As entregas ficam em `oliveira_email_deliveries`; os códigos temporários ficam em `oliveira_signature_otps`. Ambos usam RLS e não ficam acessíveis ao inquilino.
