import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const pdf = await PDFDocument.create();
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const width = 595.28;
const height = 841.89;
const left = 54;
const right = width - 54;
const textWidth = right - left;
const navy = rgb(0.035, 0.14, 0.22);
const green = rgb(0.08, 0.47, 0.35);
const pale = rgb(0.94, 0.975, 0.965);
const ink = rgb(0.09, 0.12, 0.15);
const muted = rgb(0.38, 0.43, 0.47);
const rule = rgb(0.84, 0.88, 0.87);
let page;
let y;

const wrap = (text, font, size, maxWidth) => {
  const lines = [];
  for (const source of String(text).split("\n")) {
    let line = "";
    for (const word of source.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
};
const addPage = (label) => {
  page = pdf.addPage([width, height]);
  page.drawRectangle({ x: 0, y: height - 9, width, height: 9, color: green });
  page.drawText("IMOBILIARIA OLIVEIRA", { x: left, y: height - 37, size: 9, font: bold, color: navy });
  page.drawText(label, { x: right - regular.widthOfTextAtSize(label, 7.5), y: height - 36, size: 7.5, font: regular, color: muted });
  page.drawLine({ start: { x: left, y: height - 49 }, end: { x: right, y: height - 49 }, thickness: 0.7, color: rule });
  y = height - 75;
};
const ensure = (space, label = "CLAUSULAS CONTRATUAIS") => { if (y - space < 62) addPage(label); };
const paragraph = (text, indent = 0, font = regular, color = ink) => {
  for (const line of wrap(text, font, 10, textWidth - indent)) {
    ensure(18);
    page.drawText(line, { x: left + indent, y, size: 10, font, color });
    y -= 14.2;
  }
};
const labelValue = (label, text, x, top, boxWidth) => {
  page.drawText(label.toUpperCase(), { x, y: top, size: 7, font: bold, color: green });
  wrap(text, bold, 9.3, boxWidth).slice(0, 2).forEach((line, i) => page.drawText(line, { x, y: top - 15 - i * 12, size: 9.3, font: bold, color: navy }));
};
const section = (index, title, body) => {
  const estimatedHeight = 43 + wrap(body, regular, 10, textWidth - 30).length * 14.2;
  ensure(Math.min(estimatedHeight, 260));
  page.drawText(String(index).padStart(2, "0"), { x: left, y, size: 9.5, font: bold, color: green });
  page.drawText(title.toUpperCase(), { x: left + 30, y, size: 10.5, font: bold, color: navy });
  y -= 20;
  paragraph(body, 30);
  y -= 13;
};

addPage("RESUMO DO CONTRATO");
page.drawText("CONTRATO PARTICULAR", { x: left, y, size: 12, font: bold, color: green });
y -= 27;
page.drawText("LOCACAO RESIDENCIAL", { x: left, y, size: 24, font: bold, color: navy });
y -= 42;
paragraph("Instrumento emitido digitalmente e disponibilizado em ambiente privado para leitura e assinatura eletronica do locatario.", 0, regular, muted);
y -= 18;
page.drawRectangle({ x: left, y: y - 122, width: textWidth, height: 122, color: pale, borderColor: rgb(0.75, 0.87, 0.82), borderWidth: 0.8 });
labelValue("Imovel", "Casa com varanda em vila residencial", left + 18, y - 22, 205);
labelValue("Endereco", "Rua de Exemplo, 100 - Rio de Janeiro - RJ", left + 250, y - 22, 220);
labelValue("Locatario", "Inquilina de exemplo", left + 18, y - 78, 205);
labelValue("Vigencia", "14/08/2026 a 14/08/2027", left + 250, y - 78, 220);
y -= 151;
[["ALUGUEL MENSAL", "R$ 450,00"], ["VENCIMENTO", "Dia 12"], ["REAJUSTE", "IPCA anual"]].forEach(([label, text], index) => {
  const boxWidth = (textWidth - 20) / 3;
  const x = left + index * (boxWidth + 10);
  page.drawRectangle({ x, y: y - 68, width: boxWidth, height: 68, borderColor: rule, borderWidth: 0.8 });
  page.drawText(label, { x: x + 13, y: y - 20, size: 7, font: bold, color: muted });
  page.drawText(text, { x: x + 13, y: y - 44, size: 12, font: bold, color: navy });
});
y -= 99;
page.drawText("PARTES", { x: left, y, size: 8, font: bold, color: green });
y -= 22;
paragraph("LOCADOR / EMISSOR: PROPRIETARIO DE EXEMPLO - CPF 000.000.000-00.", 0, bold);
paragraph("LOCATARIO / SIGNATARIO: INQUILINA DE EXEMPLO - CPF 111.111.111-11 - inquilina@example.com.");
y -= 10;
page.drawRectangle({ x: left, y: y - 52, width: textWidth, height: 52, color: rgb(1, 0.97, 0.89) });
page.drawText("AGUARDANDO ASSINATURA", { x: left + 16, y: y - 21, size: 9, font: bold, color: rgb(0.69, 0.42, 0.04) });
page.drawText("A assinatura sera concluida no portal privado apos a leitura integral.", { x: left + 16, y: y - 38, size: 8.5, font: regular, color: ink });

addPage("CLAUSULAS CONTRATUAIS");
page.drawText("CLAUSULAS E CONDICOES", { x: left, y, size: 19, font: bold, color: navy });
y -= 35;
const clauses = [
  ["DAS PARTES", "O LOCADOR e o LOCATARIO, identificados no resumo deste instrumento, celebram o presente contrato de locacao residencial conforme as clausulas seguintes."],
  ["DO OBJETO E DA DESTINACAO", "O imovel descrito neste documento destina-se exclusivamente a moradia do LOCATARIO e de sua familia, vedada a cessao, sublocacao ou uso comercial sem autorizacao escrita do LOCADOR."],
  ["DO PRAZO, ALUGUEL E PAGAMENTO", "A locacao vigorara de 14/08/2026 a 14/08/2027. O aluguel mensal e de R$ 450,00, com vencimento todo dia 12, mediante PIX ou transferencia conforme instrucoes do LOCADOR."],
  ["DO ATRASO E DO REAJUSTE", "O atraso sujeita o valor a multa moratoria de 2% e juros de 1% ao mes, calculados proporcionalmente, sem prejuizo das medidas previstas em lei. O reajuste sera anual pelo IPCA, ou indice legal substituto."],
  ["DA MANUTENCAO E DAS BENFEITORIAS", "O LOCATARIO responde pela conservacao cotidiana e pelos danos causados por si, familiares ou visitantes. Reparos com desconto exigem autorizacao escrita previa, escopo, limite, comprovantes e aprovacao do LOCADOR."],
  ["DA AGUA, ENERGIA E ENCARGOS", "Agua e energia seguirao a politica registrada para o imovel e exibida no contrato. Nenhum encargo nao previsto sera transferido automaticamente ao LOCATARIO."],
  ["DO SILENCIO E DA CONVIVENCIA", "O LOCATARIO devera evitar, em qualquer horario, ruidos excessivos, musica, festas, obras ou comportamentos que perturbem vizinhos, respeitando as normas locais e condominiais."],
  ["DA RESCISAO E DEVOLUCAO", "A desocupacao devera ser comunicada com antecedencia minima de 30 dias, observadas as hipoteses legais. O imovel sera devolvido no estado compativel com a vistoria, ressalvado o desgaste natural."],
  ["DA PRIVACIDADE E ASSINATURA", "A assinatura sera realizada no portal mediante autenticacao, nome completo e codigo de uso unico. O sistema registrara data, IP, navegador, versao e hash para demonstrar autoria e integridade."],
  ["DO FORO", "Fica eleito o foro do Rio de Janeiro - RJ, ressalvadas as competencias legais aplicaveis."],
];
clauses.forEach(([title, body], index) => section(index + 1, title, body));

addPage("FORMALIZACAO");
page.drawText("EMISSAO E ASSINATURA", { x: left, y, size: 19, font: bold, color: navy });
y -= 42;
section(1, "LOCADOR / EMISSOR AUTENTICADO", "PROPRIETARIO DE EXEMPLO - CPF 000.000.000-00. O locador figura como emissor autenticado deste instrumento, sem simulacao de assinatura digital.");
section(2, "LOCATARIO / SIGNATARIO", "INQUILINA DE EXEMPLO - CPF 111.111.111-11 - inquilina@example.com.");
section(3, "MODELO CONTRATUAL", "Contrato residencial Oliveira - versao de demonstracao. As clausulas e os campos deste PDF formam a versao congelada enviada ao locatario.");
section(4, "STATUS", "Aguardando assinatura eletronica interna do locatario. O signatario deve acessar o portal privado, revisar este PDF, solicitar o codigo OTP e confirmar o aceite com o nome completo cadastrado.");
section(5, "INTEGRIDADE", "A versao emitida recebe hash SHA-256 e permanece armazenada em repositorio privado. Qualquer edicao exige uma nova emissao e cancela a versao pendente anterior.");

addPage("CERTIFICADO DE EVIDENCIAS");
page.drawRectangle({ x: left, y: y - 64, width: 64, height: 64, color: green });
page.drawText("OK", { x: left + 18, y: y - 41, size: 20, font: bold, color: rgb(1, 1, 1) });
page.drawText("CERTIFICADO DE EVIDENCIAS", { x: left + 82, y: y - 22, size: 17, font: bold, color: navy });
page.drawText("Pagina demonstrativa da versao assinada", { x: left + 82, y: y - 44, size: 10, font: regular, color: muted });
y -= 103;
section(1, "LOCATARIO SIGNATARIO", "INQUILINA DE EXEMPLO - inquilina@example.com");
section(2, "CONFIRMACAO", "Assinatura confirmada apos autenticacao e codigo de uso unico enviado ao e-mail cadastrado.");
section(3, "EVIDENCIAS TECNICAS", "Endereco IP e hash SHA-256 sao registrados na versao final. Qualquer modificacao posterior rompe a correspondencia com a evidencia.");
section(4, "AVISO", "Documento demonstrativo para inspecao visual. Nao possui dados reais, assinatura valida ou efeito contratual.");

const pages = pdf.getPages();
pages.forEach((current, index) => {
  current.drawLine({ start: { x: left, y: 43 }, end: { x: right, y: 43 }, thickness: 0.6, color: rule });
  current.drawText("Imobiliaria Oliveira  |  Documento privado  |  Modelo visual v3", { x: left, y: 25, size: 7, font: regular, color: muted });
  const count = `${index + 1} / ${pages.length}`;
  current.drawText(count, { x: right - regular.widthOfTextAtSize(count, 7), y: 25, size: 7, font: regular, color: muted });
});

await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
await writeFile(new URL("../output/pdf/contrato-locacao-modelo-verificacao.pdf", import.meta.url), await pdf.save());
