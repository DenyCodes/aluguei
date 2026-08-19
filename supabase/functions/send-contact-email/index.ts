import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactEmailRequest {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  brand?: "playtecno" | "portfolio";
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, subject, message, brand = "playtecno" }: ContactEmailRequest = await req.json();

    console.log("Sending contact email from:", name, email);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const NOTIFICATION_EMAIL = "playtecno@outlook.com.br";
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "noreply@contato.playtecno.com.br";
    const isPortfolio = brand === "portfolio";
    const brandName = isPortfolio ? "Denis Oliveira" : "PlayTecno";
    
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Send notification to PlayTecno
    const notificationResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brandName} <${FROM_EMAIL}>`,
        to: [NOTIFICATION_EMAIL],
        subject: `${isPortfolio ? "Novo contato pelo portfólio" : "Novo Contato"}: ${subject}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; padding: 40px 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 32px; text-align: center; }
              .header h1 { color: white; margin: 0; font-size: 24px; }
              .content { padding: 32px; }
              .field { margin-bottom: 20px; }
              .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
              .value { font-size: 16px; color: #1f2937; }
              .message-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 8px; }
              .footer { background: #f9fafb; padding: 20px 32px; text-align: center; font-size: 12px; color: #6b7280; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚀 Novo Contato Recebido</h1>
              </div>
              <div class="content">
                <div class="field">
                  <div class="label">Nome</div>
                  <div class="value">${name}</div>
                </div>
                <div class="field">
                  <div class="label">Email</div>
                  <div class="value"><a href="mailto:${email}">${email}</a></div>
                </div>
                ${phone ? `
                <div class="field">
                  <div class="label">Telefone</div>
                  <div class="value"><a href="tel:${phone}">${phone}</a></div>
                </div>
                ` : ''}
                <div class="field">
                  <div class="label">Assunto</div>
                  <div class="value">${subject}</div>
                </div>
                <div class="field">
                  <div class="label">Mensagem</div>
                  <div class="message-box">${message.replace(/\n/g, '<br>')}</div>
                </div>
              </div>
              <div class="footer">
                Mensagem enviada através do site PlayTecno
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!notificationResponse.ok) {
      const error = await notificationResponse.text();
      console.error("Failed to send notification email:", error);
      throw new Error(`Failed to send notification: ${error}`);
    }

    console.log("Notification email sent successfully");

    const portfolioConfirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;background:#090b18;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#eaf3ff">
        <div style="max-width:600px;margin:0 auto;overflow:hidden;border:1px solid #24304d;border-radius:20px;background:#101626">
          <div style="padding:32px;background:linear-gradient(135deg,#164e63,#5b21b6)">
            <p style="margin:0 0 8px;color:#a5f3fc;font-size:12px;letter-spacing:2px;text-transform:uppercase">Mensagem recebida</p>
            <h1 style="margin:0;color:white;font-size:28px">Obrigado, ${name}.</h1>
          </div>
          <div style="padding:32px">
            <p style="line-height:1.7;color:#cbd5e1">Recebi sua mensagem sobre <strong style="color:white">${subject}</strong> e vou analisar o contexto do seu projeto.</p>
            <div style="margin:24px 0;padding:16px;border-left:3px solid #67e8f9;background:#162036;color:#cffafe">Retorno em até 24 horas úteis com perguntas objetivas e um próximo passo claro.</div>
            <p style="line-height:1.7;color:#94a3b8">Se precisar falar antes, envie uma mensagem pelo WhatsApp: <strong style="color:white">(21) 99345-0137</strong>.</p>
          </div>
          <div style="padding:20px 32px;background:#0b1020;color:#64748b;font-size:13px">Denis Oliveira · Produtos digitais, integrações e automações</div>
        </div>
      </body>
      </html>
    `;

    // Send confirmation to user
    const confirmationResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brandName} <${FROM_EMAIL}>`,
        to: [email],
        subject: isPortfolio ? "Recebi sua mensagem — Denis Oliveira" : "Recebemos sua mensagem! - PlayTecno",
        html: isPortfolio ? portfolioConfirmationHtml : `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; padding: 40px 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 32px; text-align: center; }
              .header h1 { color: white; margin: 0; font-size: 24px; }
              .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; }
              .content { padding: 32px; }
              .content p { color: #4b5563; line-height: 1.6; margin: 0 0 16px; }
              .highlight { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0; }
              .highlight p { margin: 0; color: #1e40af; }
              .footer { background: #f9fafb; padding: 20px 32px; text-align: center; }
              .footer p { margin: 0; font-size: 14px; color: #6b7280; }
              .social { margin-top: 16px; }
              .social a { display: inline-block; margin: 0 8px; color: #3b82f6; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Obrigado, ${name}!</h1>
                <p>Recebemos sua mensagem com sucesso</p>
              </div>
              <div class="content">
                <p>Olá <strong>${name}</strong>,</p>
                <p>Agradecemos por entrar em contato com a <strong>PlayTecno</strong>! Recebemos sua mensagem sobre "<em>${subject}</em>" e nossa equipe já está analisando.</p>
                
                <div class="highlight">
                  <p><strong>⏱️ Prazo de resposta:</strong> Retornaremos em até 24 horas úteis.</p>
                </div>
                
                <p>Enquanto isso, você pode conhecer mais sobre nossos projetos e serviços em nosso site.</p>
                
                <p>Se precisar de atendimento imediato, entre em contato pelo WhatsApp:</p>
                <p><strong>📱 (21) 99345-0137</strong></p>
              </div>
              <div class="footer">
                <p><strong>PlayTecno</strong> - Transformando ideias em soluções digitais</p>
                <div class="social">
                  <a href="https://playtecno.com.br">🌐 Site</a>
                  <a href="https://wa.me/5521993450137">💬 WhatsApp</a>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!confirmationResponse.ok) {
      console.error("Failed to send confirmation email:", await confirmationResponse.text());
      // Don't throw here, notification was sent successfully
    } else {
      console.log("Confirmation email sent successfully");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Emails sent successfully" 
      }), 
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
