import { useState } from "react";
import { Mail, Phone, MapPin, Send, MessageCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useToast } from "../hooks/use-toast";
import { supabase } from "../integrations/supabase/client";

const ContactSection = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke("send-contact-email", {
        body: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          subject: formData.subject || "Contato pelo site",
          message: formData.message,
        },
      });

      if (error) throw error;

      toast({
        title: "Mensagem enviada!",
        description:
          "Você receberá uma confirmação por email. Entraremos em contato em breve.",
      });

      setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (error: unknown) {
      console.error("Error sending email:", error);
      toast({
        title: "Erro ao enviar",
        description: "Tente novamente ou entre em contato pelo WhatsApp.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const contactInfo = [
    {
      icon: Mail,
      label: "Email",
      value: "playtecno@outlook.com.br",
      href: "mailto:playtecno@outlook.com.br",
    },
    {
      icon: Phone,
      label: "WhatsApp",
      value: "(21) 99345-0137",
      href: "https://wa.me/5521993450137",
    },
    {
      icon: MapPin,
      label: "Localização",
      value: "Rio de Janeiro, Brasil",
      href: "#",
    },
  ];

  return (
    <section id="contato" className="bg-sage py-20 md:py-28">
      <div className="container mx-auto px-5">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="mb-14 grid gap-6 md:grid-cols-2 md:items-end">
            <div>
              <p className="section-kicker">Contato</p>
              <h2 className="section-title mt-5">
                Qual problema você quer resolver?
              </h2>
            </div>
            <p className="max-w-lg text-base leading-relaxed text-ink/60 md:justify-self-end">
              Conte um pouco do cenário. A primeira conversa serve para entender
              se e como podemos ajudar.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact form */}
            <div className="border border-ink/15 bg-cream p-6 md:p-8">
              <h3 className="text-2xl font-display font-bold text-foreground mb-6">
                Envie uma mensagem
              </h3>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Nome *
                    </label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Seu nome"
                      required
                      className="h-12"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Email *
                    </label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="seu@email.com"
                      required
                      className="h-12"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Telefone
                  </label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(21) 99999-9999"
                    className="h-12"
                  />
                </div>
                <div>
                  <label
                    htmlFor="subject"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    O que você precisa? *
                  </label>
                  <Input
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="Como podemos ajudar?"
                    required
                    className="h-12"
                  />
                </div>
                <div>
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Conte mais *
                  </label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Descreva"
                    required
                    rows={5}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-none bg-ink text-lg text-cream hover:bg-ink/90"
                >
                  {isSubmitting ? (
                    "Enviando..."
                  ) : (
                    <>
                      Enviar Mensagem
                      <Send className="ml-2 w-5 h-5" />
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* Contact info */}
            <div className="flex flex-col justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-foreground mb-6">
                  Informações de contato
                </h3>
                <p className="text-muted-foreground mb-8">
                  Prefere falar diretamente? Entre em contato através de
                  qualquer um dos canais abaixo.
                </p>

                <div className="space-y-6">
                  {contactInfo.map((info) => (
                    <a
                      key={info.label}
                      href={info.href}
                      target={
                        info.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        info.href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="group flex items-center gap-4 border-b border-ink/20 p-4 transition-colors hover:bg-cream/40"
                    >
                      <div className="flex h-12 w-12 items-center justify-center bg-ink transition-colors group-hover:bg-coral">
                        <info.icon className="h-5 w-5 text-cream group-hover:text-ink" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {info.label}
                        </p>
                        <p className="font-medium text-foreground">
                          {info.value}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* WhatsApp CTA */}
              <div className="mt-8 border border-ink/20 bg-cream/45 p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center bg-ink">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">
                      Atendimento rápido
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Fale conosco pelo WhatsApp
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-none border-ink/30 text-ink hover:bg-ink hover:text-cream"
                  >
                    <a
                      href="https://wa.me/5521993450137"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Chamar
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
