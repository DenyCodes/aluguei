import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Property } from "../lib/types";
import { utilityLabel } from "../lib/contract";

type Props = { property: Property; onClose: () => void };

export function PropertyGallery({ property, onClose }: Props) {
  const [slide, setSlide] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<number | null>(null);
  const images = property.images.length ? property.images : [""];

  const changeSlide = useCallback((direction: number) => {
    setSlide((current) => (current + direction + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") changeSlide(-1);
      if (event.key === "ArrowRight") changeSlide(1);
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          "button, a, [tabindex]:not([tabindex='-1'])",
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, changeSlide]);

  const pointerDown = (event: ReactPointerEvent) => {
    pointerStart.current = event.clientX;
  };
  const pointerUp = (event: ReactPointerEvent) => {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    if (Math.abs(distance) > 45) changeSlide(distance > 0 ? -1 : 1);
    pointerStart.current = null;
  };

  return (
    <div className="gallery-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="gallery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button className="gallery-close" type="button" onClick={onClose} aria-label="Fechar galeria">
          ×
        </button>
        <section className="gallery-stage" onPointerDown={pointerDown} onPointerUp={pointerUp}>
          {images[slide] ? (
            <img
              className="gallery-image"
              src={images[slide]}
              alt={`${property.title} - foto ${slide + 1} de ${images.length}`}
            />
          ) : (
            <div className="image-placeholder">Imagem não disponível</div>
          )}
          <span className="gallery-counter">{slide + 1} / {images.length}</span>
          {images.length > 1 && (
            <>
              <button className="gallery-arrow gallery-prev" type="button" onClick={() => changeSlide(-1)} aria-label="Foto anterior">
                ‹
              </button>
              <button className="gallery-arrow gallery-next" type="button" onClick={() => changeSlide(1)} aria-label="Próxima foto">
                ›
              </button>
            </>
          )}
        </section>
        <aside className="gallery-details">
          <span className="eyebrow">Disponível para locação</span>
          <h2 id="gallery-title">{property.title}</h2>
          <p className="property-address">{property.address} - {property.neighborhood_label}</p>
          <p className="gallery-price">{property.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}<small>/mês</small></p>
          <div className="feature-row">
            <span>{property.bedrooms} quarto(s)</span>
            <span>{property.bathrooms} banheiro(s)</span>
            <span>{property.area} m²</span>
          </div>
          <div className="utility-box">
            <p><strong>Água:</strong> {utilityLabel[property.water_policy]}</p>
            <p><strong>Luz:</strong> {utilityLabel[property.electricity_policy]}</p>
          </div>
          <div className="thumb-strip" aria-label="Miniaturas das fotos">
            {images.map((image, index) => (
              <button key={`${image}-${index}`} type="button" className={index === slide ? "active" : ""} onClick={() => setSlide(index)} aria-label={`Abrir foto ${index + 1}`}>
                {image && <img src={image} alt="" />}
              </button>
            ))}
          </div>
          <a className="whatsapp-button" href={`https://wa.me/5521993450137?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel ${property.title}.`)}`} target="_blank" rel="noreferrer">
            Conversar no WhatsApp
          </a>
        </aside>
      </div>
    </div>
  );
}
