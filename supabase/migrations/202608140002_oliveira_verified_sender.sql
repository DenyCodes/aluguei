-- Use the PlayTecno root domain already verified in Resend.
alter table public.oliveira_settings
  alter column email_from_address set default 'noreply@playtecno.com.br';

update public.oliveira_settings
set email_from_address = 'noreply@playtecno.com.br',
    updated_at = now()
where id = 1
  and email_from_address in ('', 'noreply@contato.playtecno.com.br');

