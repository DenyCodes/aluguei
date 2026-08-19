import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export async function buildRentReceiptPdf(input: { receiptNumber:string; tenantName:string; propertyTitle:string; referenceMonth:string; amount:number; paidAt:string; issuedBy:string }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28,841.89]);
  const navy = rgb(.035,.14,.22), green = rgb(.08,.47,.35), muted = rgb(.38,.43,.47);
  page.drawRectangle({ x:0,y:832.89,width:595.28,height:9,color:green });
  page.drawText("IMOBILIARIA OLIVEIRA",{ x:54,y:790,size:10,font:bold,color:navy });
  page.drawText("RECIBO DE PAGAMENTO DE ALUGUEL",{ x:54,y:724,size:21,font:bold,color:navy });
  page.drawText(input.receiptNumber,{ x:54,y:696,size:10,font:regular,color:muted });
  page.drawRectangle({ x:54,y:575,width:487,height:88,color:rgb(.94,.975,.965),borderColor:rgb(.75,.87,.82),borderWidth:.8 });
  page.drawText("VALOR RECEBIDO",{ x:76,y:632,size:8,font:bold,color:green });
  page.drawText(new Intl.NumberFormat("pt-BR",{ style:"currency",currency:"BRL" }).format(input.amount),{ x:76,y:597,size:24,font:bold,color:navy });
  const rows = [["LOCATARIO",input.tenantName],["IMOVEL",input.propertyTitle],["COMPETENCIA",input.referenceMonth],["PAGO EM",new Date(input.paidAt).toLocaleString("pt-BR",{ timeZone:"America/Sao_Paulo" })],["REGISTRADO POR",input.issuedBy]];
  let y=525;
  for(const [label,value] of rows){ page.drawText(label,{ x:54,y,size:8,font:bold,color:green }); page.drawText(value,{ x:170,y,size:10,font:regular,color:navy }); y-=38; }
  page.drawText("Declaramos o recebimento do valor acima referente a parcela identificada neste recibo.",{ x:54,y:y-20,size:10,font:regular,color:muted });
  page.drawLine({ start:{ x:54,y:43 },end:{ x:541,y:43 },thickness:.6,color:rgb(.84,.88,.87) });
  page.drawText("Documento emitido pelo sistema da Imobiliaria Oliveira",{ x:54,y:25,size:7,font:regular,color:muted });
  return pdf.save();
}
