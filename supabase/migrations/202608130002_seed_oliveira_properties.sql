insert into public.oliveira_properties
  (id, title, neighborhood, neighborhood_label, address, price, bedrooms, bathrooms, area, water_policy, electricity_policy, contact, active)
values
  ('10000000-0000-4000-8000-000000000001', 'Casa com área de serviço', 'sepetiba', 'Sepetiba', 'Avenida Santa Ursulina', 500, 1, 1, 120, 'individual', 'individual', '(21) 99345-0137', true),
  ('10000000-0000-4000-8000-000000000002', 'Casa com cômodo extra', 'sepetiba', 'Sepetiba', 'Avenida Santa Ursulina, 500', 650, 2, 1, 250, 'shared', 'individual', '(21) 99345-0137', true),
  ('10000000-0000-4000-8000-000000000003', 'Casa econômica com varanda', 'vila-nova', 'Vila Nova', 'Rua 10, 88', 500, 2, 1, 80, 'individual', 'individual', '(21) 99345-0137', true),
  ('10000000-0000-4000-8000-000000000004', 'Casa com varanda em vila residencial', 'sepetiba', 'Sepetiba', 'Avenida Santa Ursulina, 340A, casa 3', 500, 2, 1, 80, 'included', 'included', '(21) 99345-0137', true)
on conflict (id) do update set
  title = excluded.title,
  neighborhood = excluded.neighborhood,
  neighborhood_label = excluded.neighborhood_label,
  address = excluded.address,
  price = excluded.price,
  bedrooms = excluded.bedrooms,
  bathrooms = excluded.bathrooms,
  area = excluded.area,
  water_policy = excluded.water_policy,
  electricity_policy = excluded.electricity_policy,
  contact = excluded.contact,
  active = excluded.active,
  updated_at = now();

