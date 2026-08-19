create table if not exists public.oliveira_contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  content jsonb not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oliveira_contract_templates enable row level security;
drop policy if exists oliveira_contract_templates_admin_read on public.oliveira_contract_templates;
create policy oliveira_contract_templates_admin_read on public.oliveira_contract_templates
for select using (public.oliveira_is_admin());

insert into public.oliveira_contract_templates (id, name, description, content, is_default)
values (
  '6d5331cc-2898-4d23-8acd-f695a8408475',
  'Contrato residencial Oliveira',
  'Modelo estruturado a partir do contrato_locacao_digital.pdf fornecido pelo proprietário.',
  jsonb_build_object(
    'title', 'CONTRATO PARTICULAR DE LOCAÇÃO RESIDENCIAL',
    'sections', jsonb_build_array(
      jsonb_build_object('title','1. DAS PARTES','body','LOCADOR: {{landlord_name}}, inscrito no CPF sob o nº {{landlord_tax_id}}. LOCATÁRIO: {{tenant_name}}, inscrito no CPF sob o nº {{tenant_tax_id}}, e-mail {{tenant_email}}.'),
      jsonb_build_object('title','2. DO OBJETO E ENDEREÇO','body','O objeto deste contrato é a locação do imóvel residencial de propriedade do LOCADOR, denominado {{property_title}}, situado em {{property_address}}, destinado exclusivamente à moradia do LOCATÁRIO e das pessoas por ele autorizadas.'),
      jsonb_build_object('title','3. DO PRAZO, VALOR DO ALUGUEL E PAGAMENTO','body','A locação vigorará de {{starts_on}} a {{ends_on}}. O aluguel mensal é de R$ {{monthly_rent}}, com vencimento no dia {{due_day}}, pago diretamente ao LOCADOR por transferência ou PIX. Reajuste: {{adjustment_index}}. Garantia: {{guarantee_type}}. O atraso sujeita o LOCATÁRIO à multa de {{late_fee_percent}}% e juros de {{monthly_interest_percent}}% ao mês.'),
      jsonb_build_object('title','4. DAS REFORMAS, BENFEITORIAS E MANUTENÇÃO','body','Reformas, melhorias e reparos somente poderão ser realizados após autorização escrita do LOCADOR, com escopo e limite definidos. Custos comprovados somente gerarão desconto após aprovação do valor e vinculação do crédito a parcelas específicas. Nenhum abatimento poderá ser realizado unilateralmente.'),
      jsonb_build_object('title','5. DO PRAZO DE DESOCUPAÇÃO E AVISO PRÉVIO','body','A parte que desejar encerrar a locação deverá comunicar a outra com antecedência mínima de {{notice_days}} dias, por escrito ou meio eletrônico formalizado, observadas as hipóteses e os prazos previstos em lei.'),
      jsonb_build_object('title','6. DAS OBRIGAÇÕES, CONSERVAÇÃO E DEVOLUÇÃO','body','O LOCATÁRIO manterá o imóvel em boas condições de higiene, limpeza e conservação e responderá por danos causados por si, familiares, visitantes ou prestadores. Problemas anteriores, estruturais ou atribuídos legalmente ao LOCADOR não serão transferidos automaticamente. Ao término, o imóvel será devolvido conforme a vistoria, ressalvado o desgaste natural.'),
      jsonb_build_object('title','7. DA ÁGUA, ENERGIA E DEMAIS ENCARGOS','body','Água: {{water_policy}}. Energia elétrica: {{electricity_policy}}. Os demais consumos e encargos seguirão o que estiver expressamente definido nesta locação.'),
      jsonb_build_object('title','8. DO SILÊNCIO E DA CONVIVÊNCIA','body','O LOCATÁRIO deverá evitar, em qualquer horário, ruídos excessivos, música, festas, obras ou comportamentos que perturbem vizinhos, respeitando a legislação local e as regras condominiais aplicáveis. Também responderá pela conduta de visitantes e ocupantes.'),
      jsonb_build_object('title','9. DA PRIVACIDADE E ASSINATURA ELETRÔNICA','body','Os dados pessoais serão tratados para execução da locação, exercício de direitos e segurança. O LOCATÁRIO assinará eletronicamente no portal mediante autenticação, nome completo e código de uso único. Serão registrados data, IP, navegador, versão e hash do PDF. Trata-se de assinatura eletrônica interna, sem certificado ICP-Brasil.'),
      jsonb_build_object('title','10. DO FORO','body','Fica eleito o foro de {{jurisdiction}}, ressalvadas as competências legais aplicáveis. E, por estarem de acordo, as partes formalizam este instrumento em {{issue_city}}, {{issue_date}}.')
    )
  ),
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  content = excluded.content,
  is_default = true,
  active = true,
  updated_at = now();

revoke all on table public.oliveira_contract_templates from anon, authenticated;
grant select on table public.oliveira_contract_templates to authenticated;
