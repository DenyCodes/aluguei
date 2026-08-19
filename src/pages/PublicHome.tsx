import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { PropertyGallery } from "../components/PropertyGallery";
import { seedProperties } from "../data/properties";
import { supabase } from "../lib/supabase";
import type { Property } from "../lib/types";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

type PropertyRow = Omit<Property, "images"> & {
  oliveira_property_media?: { public_url: string; position: number }[];
};

export function PublicHome() {
  const [properties, setProperties] = useState<Property[]>(seedProperties);
  const [selected, setSelected] = useState<Property | null>(null);
  const [neighborhood, setNeighborhood] = useState("all");
  const [bedrooms, setBedrooms] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [availability, setAvailability] = useState<
    "all" | Property["availability_status"]
  >("all");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("oliveira_properties")
      .select("*, oliveira_property_media(public_url,position)")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data?.length) return;
        const mapped = (data as PropertyRow[]).map((row) => ({
          ...row,
          images: [...(row.oliveira_property_media ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((media) => media.public_url),
        }));
        setProperties(mapped);
      });
  }, []);

  const neighborhoods = useMemo(
    () => Array.from(new Set(properties.map((item) => item.neighborhood))),
    [properties],
  );
  const filtered = useMemo(
    () =>
      properties.filter(
        (item) =>
          (neighborhood === "all" || item.neighborhood === neighborhood) &&
          item.bedrooms >= bedrooms &&
          (availability === "all" ||
            item.availability_status === availability) &&
          (!maxPrice || item.price <= maxPrice),
      ),
    [properties, neighborhood, bedrooms, maxPrice, availability],
  );

  const sendContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = `Olá, meu nome é ${data.get("name")}. ${data.get("message")} E-mail: ${data.get("email")}.`;
    window.open(
      `https://wa.me/5521993450137?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <>
      <AppHeader />
      <main>
        <section className="hero">
          <div className="shell hero-grid">
            <div>
              <span className="eyebrow light">
                Imóveis residenciais no Rio de Janeiro
              </span>
              <h1>Seu novo lar, com uma locação mais clara.</h1>
              <p>
                Encontre um imóvel, formalize seu contrato e acompanhe seus
                aluguéis em um só lugar.
              </p>
              <a href="#imoveis" className="hero-button">
                Ver imóveis
              </a>
            </div>
            <div className="hero-card">
              <span>Gestão completa</span>
              <strong>Contrato digital, pagamentos e manutenção</strong>
              <p>Acesso protegido por convite para cada inquilino.</p>
              <Link className="hero-card-link" to="/sistema">
                Conheça o sistema
              </Link>
            </div>
          </div>
        </section>

        <section className="shell listing-section" id="imoveis">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Escolha com tranquilidade</span>
              <h2>Imóveis para consulta</h2>
            </div>
            <p>Clique em uma foto para abrir a galeria completa.</p>
          </div>
          <div className="filter-bar">
            <label>
              Bairro
              <select
                value={neighborhood}
                onChange={(event) => setNeighborhood(event.target.value)}
              >
                <option value="all">Todos</option>
                {neighborhoods.map((item) => (
                  <option key={item} value={item}>
                    {properties.find(
                      (property) => property.neighborhood === item,
                    )?.neighborhood_label ?? item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quartos
              <select
                value={bedrooms}
                onChange={(event) => setBedrooms(Number(event.target.value))}
              >
                <option value="0">Qualquer quantidade</option>
                <option value="1">1 ou mais</option>
                <option value="2">2 ou mais</option>
                <option value="3">3 ou mais</option>
              </select>
            </label>
            <label>
              Valor máximo
              <input
                type="number"
                min="0"
                value={maxPrice || ""}
                onChange={(event) => setMaxPrice(Number(event.target.value))}
                placeholder="Sem limite"
              />
            </label>
            <label>
              Situação
              <select
                value={availability}
                onChange={(event) =>
                  setAvailability(event.target.value as typeof availability)
                }
              >
                <option value="all">Todas</option>
                <option value="available">Disponíveis</option>
                <option value="rented">Alugados</option>
                <option value="maintenance">Em manutenção</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setNeighborhood("all");
                setBedrooms(0);
                setMaxPrice(0);
                setAvailability("all");
              }}
            >
              Limpar filtros
            </button>
          </div>
          <div className="property-grid">
            {filtered.map((property) => (
              <article className="property-card" key={property.id}>
                <button
                  type="button"
                  className="property-photo"
                  onClick={() => setSelected(property)}
                  aria-label={`Abrir fotos de ${property.title}`}
                >
                  {property.images[0] ? (
                    <img src={property.images[0]} alt={property.title} />
                  ) : (
                    <span>Sem imagem</span>
                  )}
                  <span
                    className={`property-status-badge ${property.availability_status}`}
                  >
                    {property.availability_status === "rented"
                      ? "Alugado"
                      : property.availability_status === "available"
                        ? "Disponível"
                        : property.availability_status === "maintenance"
                          ? "Em manutenção"
                          : "Arquivado"}
                  </span>
                  <span className="photo-count">
                    {property.images.length} fotos
                  </span>
                </button>
                <div className="property-body">
                  <div className="property-topline">
                    <span>{property.neighborhood_label}</span>
                    <strong>
                      {money.format(property.price)}
                      <small>/mês</small>
                    </strong>
                  </div>
                  <h3>{property.title}</h3>
                  <p>{property.address}</p>
                  <div className="feature-row">
                    <span>{property.bedrooms} quarto(s)</span>
                    <span>{property.bathrooms} banheiro(s)</span>
                    <span>{property.area} m²</span>
                  </div>
                  <button
                    type="button"
                    className="card-button"
                    onClick={() => setSelected(property)}
                  >
                    Ver todas as fotos
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="empty-state">
              Nenhum imóvel corresponde aos filtros escolhidos.
            </div>
          )}
        </section>

        <section className="service-band">
          <div className="shell">
            <div className="section-heading light-heading">
              <div>
                <span className="eyebrow light">Da visita ao contrato</span>
                <h2>Uma locação bem acompanhada</h2>
              </div>
            </div>
            <div className="service-grid">
              <article>
                <span>01</span>
                <h3>Contrato transparente</h3>
                <p>
                  Condições, responsabilidades, água, luz e regras ficam
                  registradas antes da assinatura.
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>Aluguel organizado</h3>
                <p>
                  Parcelas, comprovantes, aprovações e recibos reunidos na área
                  do inquilino.
                </p>
              </article>
              <article>
                <span>03</span>
                <h3>Manutenção acordada</h3>
                <p>
                  Solicitações e descontos só avançam depois da autorização
                  registrada do proprietário.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="shell contact-section" id="contato">
          <div>
            <span className="eyebrow">Fale diretamente conosco</span>
            <h2>Quer conhecer um imóvel?</h2>
            <p>
              Envie sua dúvida. A mensagem será aberta no WhatsApp da
              Imobiliária Oliveira.
            </p>
          </div>
          <form className="contact-form" onSubmit={sendContact}>
            <label>
              Nome
              <input name="name" required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required />
            </label>
            <label>
              Mensagem
              <textarea name="message" required rows={4} />
            </label>
            <button className="primary-button" type="submit">
              Enviar pelo WhatsApp
            </button>
          </form>
        </section>
      </main>
      <footer className="site-footer">
        <div className="shell">
          <strong>Imobiliária Oliveira</strong>
          <span>Atendimento: (21) 99345-0137</span>
          <Link to="/privacidade">Privacidade</Link>
          <span>© 2026 Denis Oliveira</span>
        </div>
      </footer>
      {selected && (
        <PropertyGallery
          property={selected}
          onClose={() => setSelected(null)}
        />
      )}
      <a
        className="floating-whatsapp"
        href="https://wa.me/5521993450137"
        target="_blank"
        rel="noreferrer"
        aria-label="Falar pelo WhatsApp"
      >
        WA
      </a>
    </>
  );
}
