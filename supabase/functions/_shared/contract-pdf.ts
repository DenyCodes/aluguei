import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

type ContractSection = { title: string; body: string };
type ContractContent = Record<string, unknown> & { title?: string; sections?: ContractSection[] };
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 52;

function value(content: ContractContent, key: string, fallback = "não informado") {
  const current = String(content[key] ?? "").trim();
  return current || fallback;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    if (!words.length) lines.push("");
  }
  return lines;
}

async function buildLegacyContractPdf(content: ContractContent, signature?: { name: string; email: string; signedAt: string; ip: string; hash: string }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const addPage = () => { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; };
  const drawLines = (text: string, font = regular, size = 10.25, gap = 14.5) => {
    const lines = wrap(text, font, size, PAGE_WIDTH - MARGIN * 2);
    for (const line of lines) {
      if (y < MARGIN + 25) addPage();
      if (line) page.drawText(line, { x: MARGIN, y, size, font, color: rgb(.08, .12, .17) });
      y -= gap;
    }
    y -= 5;
  };
  const section = (title: string, body: string) => {
    if (y < MARGIN + 80) addPage();
    y -= 6;
    page.drawText(title, { x: MARGIN, y, size: 11.5, font: bold, color: rgb(.04, .16, .27) });
    y -= 21;
    drawLines(body);
  };

  const title = value(content, "title", "CONTRATO PARTICULAR DE LOCAÇÃO RESIDENCIAL");
  const titleLines = wrap(title, bold, 15, PAGE_WIDTH - MARGIN * 2);
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y, size: 15, font: bold, color: rgb(.04, .16, .27) });
    y -= 20;
  }
  y -= 12;
  const sections = Array.isArray(content.sections) ? content.sections : [];
  for (const item of sections) {
    if (!item || typeof item !== "object") continue;
    section(String(item.title ?? "CLÁUSULA"), String(item.body ?? ""));
  }

  if (y < 430) addPage(); else y -= 34;
  page.drawText("EMISSÃO E ASSINATURA DO CONTRATO", { x: MARGIN, y, size: 15, font: bold, color: rgb(.04, .16, .27) });
  y -= 42;
  section("LOCADOR / EMISSOR AUTENTICADO", `${value(content, "landlord_name")} - CPF ${value(content, "landlord_tax_id")}. O locador figura como emissor autenticado deste instrumento, sem simulação de assinatura digital.`);
  section("LOCATÁRIO / SIGNATÁRIO", `${value(content, "tenant_name")} - CPF ${value(content, "tenant_tax_id")} - ${value(content, "tenant_email")}.`);
  section("MODELO CONTRATUAL", `${value(content, "template_name", "Contrato residencial Oliveira")} - versão ${value(content, "template_version", "1")}. As cláusulas e os campos exibidos neste PDF formam a versão congelada enviada ao locatário.`);
  if (!signature) {
    section("STATUS", "Aguardando assinatura eletrônica interna do locatário. O signatário deve acessar o portal privado, revisar este PDF, solicitar o código OTP e confirmar o aceite com o nome completo cadastrado.");
    section("INTEGRIDADE", "A versão emitida recebe hash SHA-256 e permanece armazenada em bucket privado. Qualquer edição exige uma nova emissão e cancela a versão pendente anterior.");
  } else {
    addPage();
    page.drawText("CERTIFICADO DE EVIDÊNCIAS DA ASSINATURA", { x: MARGIN, y, size: 15, font: bold, color: rgb(.04, .16, .27) });
    y -= 42;
    section("LOCATÁRIO SIGNATÁRIO", `${signature.name} - ${signature.email}`);
    section("CONFIRMAÇÃO", `Assinatura confirmada em ${signature.signedAt}, após autenticação e código de uso único enviado ao e-mail cadastrado.`);
    section("EVIDÊNCIAS TÉCNICAS", `Endereço IP: ${signature.ip || "não informado"}. Hash do documento original: ${signature.hash}. A modificação posterior do arquivo altera seu hash e rompe a correspondência com esta evidência.`);
    section("NATUREZA", "Assinatura eletrônica interna, sem certificado ICP-Brasil. O locador aparece no instrumento como emissor autenticado, sem simulação de assinatura.");
  }
  const pages = pdf.getPages();
  pages.forEach((item, index) => item.drawText(`${index + 1} / ${pages.length}`, { x: PAGE_WIDTH - MARGIN - 30, y: 24, size: 8, font: regular, color: rgb(.4, .45, .5) }));
  return pdf.save();
}

type SignatureEvidence = { name: string; email: string; signedAt: string; ip: string; hash: string };

async function buildOliveiraV3Pdf(content: ContractContent, signature?: SignatureEvidence) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.035, 0.14, 0.22);
  const green = rgb(0.08, 0.47, 0.35);
  const pale = rgb(0.94, 0.975, 0.965);
  const ink = rgb(0.09, 0.12, 0.15);
  const muted = rgb(0.38, 0.43, 0.47);
  const rule = rgb(0.84, 0.88, 0.87);
  const left = 54;
  const right = PAGE_WIDTH - 54;
  const textWidth = right - left;
  let page: PDFPage;
  let y = 0;

  const addPage = (sectionLabel = "INSTRUMENTO PARTICULAR") => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 9, width: PAGE_WIDTH, height: 9, color: green });
    page.drawText("IMOBILIARIA OLIVEIRA", { x: left, y: PAGE_HEIGHT - 37, size: 9, font: bold, color: navy });
    page.drawText(sectionLabel, { x: right - regular.widthOfTextAtSize(sectionLabel, 7.5), y: PAGE_HEIGHT - 36, size: 7.5, font: regular, color: muted });
    page.drawLine({ start: { x: left, y: PAGE_HEIGHT - 49 }, end: { x: right, y: PAGE_HEIGHT - 49 }, thickness: 0.7, color: rule });
    y = PAGE_HEIGHT - 75;
  };

  const ensure = (height: number, label?: string) => {
    if (y - height < 62) addPage(label);
  };
  const paragraph = (text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number; indent?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const color = options.color ?? ink;
    const gap = options.gap ?? 14.2;
    const indent = options.indent ?? 0;
    const lines = wrap(text, font, size, textWidth - indent);
    for (const line of lines) {
      ensure(gap + 4);
      if (line) page.drawText(line, { x: left + indent, y, size, font, color });
      y -= gap;
    }
  };
  const labelValue = (label: string, text: string, x: number, top: number, width: number) => {
    page.drawText(label.toUpperCase(), { x, y: top, size: 7, font: bold, color: green });
    const lines = wrap(text, bold, 9.3, width);
    lines.slice(0, 2).forEach((line, index) => page.drawText(line, { x, y: top - 15 - index * 12, size: 9.3, font: bold, color: navy }));
  };
  const section = (index: number, title: string, body: string) => {
    const estimatedHeight = 43 + wrap(body, regular, 10, textWidth - 30).length * 14.2;
    ensure(Math.min(estimatedHeight, 260), "CLAUSULAS CONTRATUAIS");
    const number = String(index).padStart(2, "0");
    page.drawText(number, { x: left, y, size: 9.5, font: bold, color: green });
    page.drawText(title.toUpperCase(), { x: left + 30, y, size: 10.5, font: bold, color: navy });
    y -= 20;
    paragraph(body, { indent: 30 });
    y -= 13;
  };

  addPage("RESUMO DO CONTRATO");
  page.drawText("CONTRATO PARTICULAR", { x: left, y, size: 12, font: bold, color: green });
  y -= 27;
  const title = value(content, "title", "CONTRATO PARTICULAR DE LOCACAO RESIDENCIAL");
  wrap(title, bold, 24, textWidth).forEach((line) => {
    page.drawText(line, { x: left, y, size: 24, font: bold, color: navy });
    y -= 29;
  });
  y -= 8;
  paragraph("Instrumento emitido digitalmente e disponibilizado em ambiente privado para leitura e assinatura eletronica do locatario.", { size: 10.3, color: muted, gap: 15 });
  y -= 18;

  page.drawRectangle({ x: left, y: y - 122, width: textWidth, height: 122, color: pale, borderColor: rgb(0.75, 0.87, 0.82), borderWidth: 0.8 });
  labelValue("Imovel", value(content, "property_title"), left + 18, y - 22, 205);
  labelValue("Endereco", value(content, "property_address"), left + 250, y - 22, 220);
  labelValue("Locatario", value(content, "tenant_name"), left + 18, y - 78, 205);
  labelValue("Vigencia", `${value(content, "starts_on")} a ${value(content, "ends_on")}`, left + 250, y - 78, 220);
  y -= 151;

  const cards = [
    ["ALUGUEL MENSAL", `R$ ${value(content, "monthly_rent")}`],
    ["VENCIMENTO", `Dia ${value(content, "due_day")}`],
    ["REAJUSTE", value(content, "adjustment_index")],
  ];
  cards.forEach(([label, text], index) => {
    const cardWidth = (textWidth - 20) / 3;
    const x = left + index * (cardWidth + 10);
    page.drawRectangle({ x, y: y - 68, width: cardWidth, height: 68, borderColor: rule, borderWidth: 0.8 });
    page.drawText(label, { x: x + 13, y: y - 20, size: 7, font: bold, color: muted });
    const valueSize = text.length > 16 ? 10 : 12;
    page.drawText(text, { x: x + 13, y: y - 44, size: valueSize, font: bold, color: navy });
  });
  y -= 99;
  page.drawText("PARTES", { x: left, y, size: 8, font: bold, color: green });
  y -= 22;
  paragraph(`LOCADOR / EMISSOR: ${value(content, "landlord_name")} - CPF ${value(content, "landlord_tax_id")}.`, { font: bold });
  paragraph(`LOCATARIO / SIGNATARIO: ${value(content, "tenant_name")} - CPF ${value(content, "tenant_tax_id")} - ${value(content, "tenant_email")}.`);
  y -= 10;
  page.drawRectangle({ x: left, y: y - 52, width: textWidth, height: 52, color: signature ? rgb(0.92, 0.98, 0.94) : rgb(1, 0.97, 0.89) });
  page.drawText(signature ? "DOCUMENTO ASSINADO" : "AGUARDANDO ASSINATURA", { x: left + 16, y: y - 21, size: 9, font: bold, color: signature ? green : rgb(0.69, 0.42, 0.04) });
  page.drawText(signature ? "A pagina final contem as evidencias da assinatura." : "A assinatura sera concluida no portal privado apos a leitura integral.", { x: left + 16, y: y - 38, size: 8.5, font: regular, color: ink });

  addPage("CLAUSULAS CONTRATUAIS");
  page.drawText("CLAUSULAS E CONDICOES", { x: left, y, size: 19, font: bold, color: navy });
  y -= 35;
  const sections = Array.isArray(content.sections) ? content.sections : [];
  sections.forEach((item, index) => {
    if (item && typeof item === "object") section(index + 1, String(item.title ?? "CLAUSULA"), String(item.body ?? ""));
  });

  addPage("FORMALIZACAO");
  page.drawText("EMISSAO E ASSINATURA", { x: left, y, size: 19, font: bold, color: navy });
  y -= 20;
  paragraph("Identificacao das partes e informacoes de integridade desta versao contratual.", { color: muted });
  y -= 18;
  section(1, "LOCADOR / EMISSOR AUTENTICADO", `${value(content, "landlord_name")} - CPF ${value(content, "landlord_tax_id")}. O locador figura como emissor autenticado deste instrumento, sem simulacao de assinatura digital.`);
  section(2, "LOCATARIO / SIGNATARIO", `${value(content, "tenant_name")} - CPF ${value(content, "tenant_tax_id")} - ${value(content, "tenant_email")}.`);
  section(3, "MODELO CONTRATUAL", `${value(content, "template_name", "Contrato residencial Oliveira")} - versao ${value(content, "template_version", "1")}. As clausulas e os campos deste PDF formam a versao congelada enviada ao locatario.`);
  if (!signature) {
    section(4, "STATUS", "Aguardando assinatura eletronica interna do locatario. O signatario deve acessar o portal privado, revisar este PDF, solicitar o codigo OTP e confirmar o aceite com o nome completo cadastrado.");
    section(5, "INTEGRIDADE", "A versao emitida recebe hash SHA-256 e permanece armazenada em repositorio privado. Qualquer edicao exige uma nova emissao e cancela a versao pendente anterior.");
  } else {
    addPage("CERTIFICADO DE EVIDENCIAS");
    page.drawRectangle({ x: left, y: y - 64, width: 64, height: 64, color: green });
    page.drawText("OK", { x: left + 18, y: y - 41, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText("CERTIFICADO DE EVIDENCIAS", { x: left + 82, y: y - 22, size: 17, font: bold, color: navy });
    page.drawText("Assinatura eletronica interna", { x: left + 82, y: y - 44, size: 10, font: regular, color: muted });
    y -= 103;
    section(1, "LOCATARIO SIGNATARIO", `${signature.name} - ${signature.email}`);
    section(2, "CONFIRMACAO", `Assinatura confirmada em ${signature.signedAt}, apos autenticacao e codigo de uso unico enviado ao e-mail cadastrado.`);
    section(3, "EVIDENCIAS TECNICAS", `Endereco IP: ${signature.ip || "nao informado"}. Hash do documento original: ${signature.hash}. A modificacao posterior do arquivo altera seu hash e rompe a correspondencia com esta evidencia.`);
    section(4, "NATUREZA", "Assinatura eletronica interna, sem certificado ICP-Brasil. O locador aparece no instrumento como emissor autenticado, sem simulacao de assinatura.");
  }

  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: left, y: 43 }, end: { x: right, y: 43 }, thickness: 0.6, color: rule });
    item.drawText(`Imobiliaria Oliveira  |  Documento privado  |  Versao ${value(content, "template_version", "1")}`, { x: left, y: 25, size: 7, font: regular, color: muted });
    const count = `${index + 1} / ${pages.length}`;
    item.drawText(count, { x: right - regular.widthOfTextAtSize(count, 7), y: 25, size: 7, font: regular, color: muted });
  });
  return pdf.save();
}

export async function buildContractPdf(content: ContractContent, signature?: SignatureEvidence) {
  return content.renderer_version === "oliveira-pdf-v3"
    ? buildOliveiraV3Pdf(content, signature)
    : buildLegacyContractPdf(content, signature);
}

export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((entry) => entry.toString(16).padStart(2, "0")).join("");
}
