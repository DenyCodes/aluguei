import { useMemo, useState, type FormEvent, type MouseEvent } from "react";

const propertyImageModules = import.meta.glob(
  "./imagens/{casa1,casa4,casa5,casa3}/*.jpg",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const getPropertyImages = (folder: "casa1" | "casa4" | "casa5"| "casa3") =>
  Object.entries(propertyImageModules)
    .filter(([path]) => path.includes(`/imagens/${folder}/`))
    .sort(([firstPath], [secondPath]) => {
      const firstNumber = Number(firstPath.match(/\((\d+)\)/)?.[1] ?? 0);
      const secondNumber = Number(secondPath.match(/\((\d+)\)/)?.[1] ?? 0);
      return firstNumber - secondNumber;
    })
    .map(([, imageUrl]) => imageUrl);

type Property = {
  id: number;
  title: string;
  neighborhood: string;
  neighborhoodLabel: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  utilities: string;
  contact: string;
  images: string[];
};

const properties: Property[] = [
  {
    id: 1,
    title: "Casa com área de serviço",
    neighborhood: "sepetiba",
    neighborhoodLabel: "Sepetiba",
    address: "Avenida Santa Ursulina",
    price: 500,
    bedrooms: 1,
    bathrooms: 1,
    area: 120,
    utilities: "Contas individuais",
    contact: "(21) 99345-0137",
    images: getPropertyImages("casa5"),
  },
  {
    id: 2,
    title: "Casa com cômodo extra",
    neighborhood: "sepetiba",
    neighborhoodLabel: "Sepetiba",
    address: "Avenida Santa Ursulina, 500",
    price: 650,
    bedrooms: 2,
    bathrooms: 1,
    area: 250,
    utilities: "Condomínio gerenciado",
    contact: "(21) 99345-0137",
    images: getPropertyImages("casa1"),
  },
  {
    id: 3,
    title: "Casa econômica com varanda",
    neighborhood: "vila-nova",
    neighborhoodLabel: "Vila Nova",
    address: "Rua 10, 88",
    price: 500,
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    utilities: "Contas individuais",
    contact: "(21) 99345-0137",
    images: getPropertyImages("casa4"),
  },
  {
    id: 4,
    title: "Casa econômica com varanda em vila",
    neighborhood: "vila-nova",
    neighborhoodLabel: "Vila Nova",
    address: "Avenida santa ursulina, 340a casa 3",
    price: 500,
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    utilities: "Contas individuais",
    contact: "(21) 99345-0137",
    images: getPropertyImages("casa3"),
  },
  
];

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function Index() {
  const [neighborhood, setNeighborhood] = useState("todos");
  const [bedrooms, setBedrooms] = useState("0");
  const [maxPrice, setMaxPrice] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    neighborhood: "todos",
    bedrooms: 0,
    maxPrice: 0,
  });
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null,
  );
  const [slide, setSlide] = useState(0);

  const filteredProperties = useMemo(
    () =>
      properties.filter((property) => {
        const matchesNeighborhood =
          appliedFilters.neighborhood === "todos" ||
          property.neighborhood === appliedFilters.neighborhood;
        const matchesBedrooms = property.bedrooms >= appliedFilters.bedrooms;
        const matchesPrice =
          appliedFilters.maxPrice === 0 ||
          property.price <= appliedFilters.maxPrice;
        return matchesNeighborhood && matchesBedrooms && matchesPrice;
      }),
    [appliedFilters],
  );

  const applyFilters = () => {
    setAppliedFilters({
      neighborhood,
      bedrooms: Number(bedrooms),
      maxPrice: Number(maxPrice) || 0,
    });
  };

  const clearFilters = () => {
    setNeighborhood("todos");
    setBedrooms("0");
    setMaxPrice("");
    setAppliedFilters({ neighborhood: "todos", bedrooms: 0, maxPrice: 0 });
  };

  const openDetails = (property: Property) => {
    setSelectedProperty(property);
    setSlide(0);
  };

  const closeDetails = () => setSelectedProperty(null);

  const changeSlide = (direction: number) => {
    if (!selectedProperty) return;
    setSlide(
      (current) =>
        (current + direction + selectedProperty.images.length) %
        selectedProperty.images.length,
    );
  };

  const handleModalClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeDetails();
  };

  const handleContactSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = [
      `Olá, meu nome é ${form.get("name")}.`,
      String(form.get("message")),
      `E-mail para retorno: ${form.get("email")}.`,
    ].join("\n");
    window.open(
      `https://wa.me/5521993450137?text=${encodeURIComponent(message)}`,
      "_blank",
    );
  };

  return (
    <>
      <a
        href="https://wa.me/5521993450137"
        className="whatsapp-float"
        target="_blank"
        rel="noreferrer"
        aria-label="Falar com a Imobiliária Oliveira pelo WhatsApp"
      >
        <i className="fab fa-whatsapp" aria-hidden="true" />
      </a>

      <header>
        <div className="container">
          <h1>Imobiliária Oliveira</h1>
          <nav aria-label="Navegação principal">
            <ul>
              <li>
                <a href="#imoveis">Imóveis</a>
              </li>
              <li>
                <a href="#servicos">Serviços</a>
              </li>
              <li>
                <a href="#imoveis">Venda</a>
              </li>
              <li>
                <a href="#contato">Contato</a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main>
        <div className="container">
          <section id="imoveis" className="filtro-secao">
            <h2>🔎 Filtre sua busca</h2>
            <div className="campos-filtro">
              <select
                aria-label="Bairro"
                value={neighborhood}
                onChange={(event) => setNeighborhood(event.target.value)}
              >
                <option value="todos">Bairro (todos)</option>
                <option value="sepetiba">Sepetiba</option>
                <option value="jardim-america">Jardim América</option>
                <option value="vila-nova">Vila Nova</option>
              </select>
              <select
                aria-label="Quantidade mínima de quartos"
                value={bedrooms}
                onChange={(event) => setBedrooms(event.target.value)}
              >
                <option value="0">Quartos (mínimo)</option>
                <option value="1">1 quarto</option>
                <option value="2">2 quartos</option>
                <option value="3">3 quartos</option>
                <option value="4">4+ quartos</option>
              </select>
              <input
                type="number"
                min="0"
                aria-label="Valor máximo"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="Valor máximo (R$)"
              />
            </div>
            <div className="botoes-filtro">
              <button type="button" onClick={applyFilters}>
                Filtrar
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="btn-limpar"
              >
                Limpar pesquisa
              </button>
            </div>
          </section>

          <section id="anuncios" className="grid-anuncios" aria-live="polite">
            {filteredProperties.map((property) => (
              <article
                className="card"
                key={property.id}
                onClick={() => openDetails(property)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    openDetails(property);
                }}
                role="button"
                tabIndex={0}
              >
                <div className="card-img">
                  <img src={property.images[0]} alt={property.title} />
                  <span className="valor">{money.format(property.price)}</span>
                </div>
                <div className="card-info">
                  <h3>{property.title}</h3>
                  <p className="endereco">
                    <i className="fas fa-map-marker-alt" aria-hidden="true" />{" "}
                    {property.neighborhoodLabel}
                  </p>
                  <div className="detalhes">
                    <span>🛏️ {property.bedrooms}</span>
                    <span>🚿 {property.bathrooms}</span>
                    <span>📐 {property.area}m²</span>
                  </div>
                </div>
              </article>
            ))}
            {filteredProperties.length === 0 && (
              <p className="sem-resultados">
                Nenhum imóvel corresponde aos filtros informados.
              </p>
            )}
          </section>

          <hr />

          <section id="servicos" className="servicos-secao">
            <h2>Nossos Serviços de Administração Residencial</h2>
            <p className="descricao-servicos">
              Oferecemos soluções completas para proprietários, garantindo
              tranquilidade e valorização do patrimônio.
            </p>
            <div className="servicos-grid">
              <div className="servico-item">
                <i
                  className="fas fa-file-invoice-dollar fa-3x"
                  aria-hidden="true"
                />
                <h3>Gestão Financeira e Cobrança</h3>
                <p>
                  Controle de aluguéis, emissão de boletos, repasses e gestão de
                  inadimplência.
                </p>
              </div>
              <div className="servico-item">
                <i className="fas fa-handshake fa-3x" aria-hidden="true" />
                <h3>Intermediação de Locação</h3>
                <p>
                  Contratos, assinatura online e vistorias detalhadas de entrada
                  e saída.
                </p>
              </div>
              <div className="servico-item">
                <i className="fas fa-tools fa-3x" aria-hidden="true" />
                <h3>Manutenção e Reparos</h3>
                <p>
                  Acompanhamento de reparos e contratação de prestadores
                  confiáveis.
                </p>
              </div>
            </div>
            <h3 className="servicos-padrao">Padrão de Serviços Imobiliários</h3>
            <ul className="lista-padrao">
              <li>✓ Venda e compra de imóveis residenciais e comerciais</li>
              <li>✓ Avaliação profissional de imóveis</li>
              <li>✓ Assessoria jurídica imobiliária</li>
            </ul>
          </section>

          <hr />

          <section id="contato" className="contato-secao">
            <h2>📞 Fale Conosco</h2>
            <p className="descricao-contato">
              Nossa equipe está pronta para atender você. Escolha o contato
              direto ou envie uma mensagem.
            </p>
            <div className="contatos-grid">
              <div className="contato-card">
                <i className="fas fa-user-tie fa-3x" aria-hidden="true" />
                <h3>Proprietário / Diretor</h3>
                <p>Nome: Damião Oliveira</p>
              </div>
              <div className="contato-card">
                <i className="fas fa-headset fa-3x" aria-hidden="true" />
                <h3>Gerente de Imóveis</h3>
                <p>Nome: Denis Oliveira</p>
                <p>Telefone: (21) 99345-0137</p>
                <a
                  href="https://wa.me/5521993450137"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-contato-wa"
                >
                  Chat do gerente
                </a>
              </div>
            </div>
            <div className="contato-form">
              <h3>Ou envie uma mensagem:</h3>
              <form onSubmit={handleContactSubmit}>
                <input
                  name="name"
                  type="text"
                  placeholder="Seu nome completo"
                  required
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Seu e-mail"
                  required
                />
                <textarea
                  name="message"
                  placeholder="Sua dúvida sobre o imóvel"
                  required
                />
                <button type="submit">Enviar pelo WhatsApp</button>
              </form>
            </div>
          </section>
        </div>
      </main>

      {selectedProperty && (
        <div className="modal" onClick={handleModalClick} role="presentation">
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-titulo"
          >
            <button
              className="close-button"
              type="button"
              onClick={closeDetails}
              aria-label="Fechar detalhes"
            >
              ×
            </button>
            <div className="modal-body">
              <div className="carousel-container">
                <img
                  src={selectedProperty.images[slide]}
                  alt={`${selectedProperty.title} — foto ${slide + 1}`}
                />
                {selectedProperty.images.length > 1 && (
                  <>
                    <button
                      className="prev-btn"
                      type="button"
                      onClick={() => changeSlide(-1)}
                      aria-label="Foto anterior"
                    >
                      ‹
                    </button>
                    <button
                      className="next-btn"
                      type="button"
                      onClick={() => changeSlide(1)}
                      aria-label="Próxima foto"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>
              <div className="modal-info">
                <h2 id="modal-titulo">{selectedProperty.title}</h2>
                <p className="modal-preco">
                  {money.format(selectedProperty.price)}
                </p>
                <div className="modal-detalhes">
                  <p>
                    <strong>Endereço:</strong> {selectedProperty.address}
                  </p>
                  <p>
                    <strong>Quartos:</strong> {selectedProperty.bedrooms}
                  </p>
                  <p>
                    <strong>Banheiros:</strong> {selectedProperty.bathrooms}
                  </p>
                  <p>
                    <strong>Área:</strong> {selectedProperty.area}m²
                  </p>
                  <p>
                    <strong>Luz/água:</strong> {selectedProperty.utilities}
                  </p>
                </div>
                <div className="modal-contato">
                  <p>
                    <strong>Fale conosco:</strong> {selectedProperty.contact}
                  </p>
                  <a
                    href={`https://wa.me/5521993450137?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel: ${selectedProperty.title}.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-whatsapp-modal"
                  >
                    Chamar no WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer>
        <p>Desenvolvido por Denis Oliveira © 2026.</p>
      </footer>
    </>
  );
}

export default Index;
