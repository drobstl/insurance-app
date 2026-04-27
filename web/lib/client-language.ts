export type SupportedLanguage = 'en' | 'es';
export type HolidayCardKey = 'newyear' | 'valentines' | 'july4th' | 'thanksgiving' | 'christmas';
export type BeneficiaryRole = 'primary' | 'contingent';

export const DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_EN =
  'Hi {{beneficiaryFirstName}}, this is {{agentName}}. You were listed as a beneficiary for {{insuredFirstName}}. You can access your beneficiary view in AgentForLife with code {{beneficiaryCode}}: {{appUrl}}';
export const DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_ES =
  'Hola {{beneficiaryFirstName}}, soy {{agentName}}. Fuiste registrado(a) como beneficiario(a) de {{insuredFirstName}}. Puedes acceder a tu vista de beneficiario en AgentForLife con este codigo {{beneficiaryCode}}: {{appUrl}}';

export function resolveClientLanguage(value: unknown): SupportedLanguage {
  if (typeof value !== 'string') return 'en';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'es' || normalized === 'spanish' || normalized.startsWith('es-')) {
    return 'es';
  }
  return 'en';
}

export function languageInstruction(language: SupportedLanguage): string {
  if (language === 'es') {
    return 'LANGUAGE REQUIREMENT: Reply entirely in natural Latin American Spanish. Keep all style rules intact, but do not switch to English unless the user explicitly requests English.';
  }
  return 'LANGUAGE REQUIREMENT: Reply in natural English.';
}

export function buildWelcomeMessage(params: {
  firstName: string;
  agentName: string;
  code: string;
  appUrl: string;
  language: SupportedLanguage;
}): string {
  const firstName = params.firstName || 'there';
  const agentName = params.agentName || 'your agent';
  if (params.language === 'es') {
    return `Hola ${firstName}. Soy ${agentName}. Descarga la app de AgentForLife y usa el codigo ${params.code} para conectarte conmigo. ${params.appUrl}`;
  }
  return `Hey ${firstName}! ${agentName} here. Download the AgentForLife app and use code ${params.code} to connect with me. ${params.appUrl}`;
}

export function buildBeneficiaryWelcomeMessage(params: {
  beneficiaryFirstName: string;
  insuredFirstName: string;
  agentName: string;
  beneficiaryCode: string;
  appUrl: string;
  language: SupportedLanguage;
  template?: string | null;
}): string {
  const fallbackTemplate = params.language === 'es'
    ? DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_ES
    : DEFAULT_BENEFICIARY_WELCOME_TEMPLATE_EN;
  const template = (params.template || '').trim() || fallbackTemplate;
  const replacements: Record<string, string> = {
    beneficiaryFirstName: params.beneficiaryFirstName || 'there',
    insuredFirstName: params.insuredFirstName || 'your loved one',
    agentName: params.agentName || 'your AFL agent',
    beneficiaryCode: params.beneficiaryCode || '',
    appUrl: params.appUrl || 'https://agentforlife.app/app',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return replacements[key] ?? '';
  }).trim();
}

export function buildBeneficiaryFollowupMessage(params: {
  step: 1 | 2 | 3;
  beneficiaryFirstName: string;
  insuredFirstName: string;
  agentName: string;
  beneficiaryCode: string;
  appUrl: string;
  role: BeneficiaryRole;
  language: SupportedLanguage;
}): string {
  const firstName = params.beneficiaryFirstName || 'there';
  const insured = params.insuredFirstName || 'your loved one';
  const roleLabel = params.role === 'contingent'
    ? (params.language === 'es' ? 'beneficiario contingente' : 'contingent beneficiary')
    : (params.language === 'es' ? 'beneficiario principal' : 'primary beneficiary');
  if (params.language === 'es') {
    if (params.step === 1) {
      return `Hola ${firstName}, solo queria confirmar que pudiste entrar a AgentForLife con tu codigo ${params.beneficiaryCode}. Estas registrado(a) como ${roleLabel} de ${insured}. Si quieres, te lo reenvio aqui: ${params.appUrl}`;
    }
    if (params.step === 2) {
      return `Hola ${firstName}, estoy disponible para ayudarte a revisar lo que significa tu rol como ${roleLabel} y donde ver la informacion en la app. Si te sirve, coordinamos una llamada corta. -- ${params.agentName}`;
    }
    return `Hola ${firstName}, ultimo mensaje para no molestarte. Si necesitas acceso o tienes dudas sobre tu rol de beneficiario(a) de ${insured}, aqui estoy para ayudarte. -- ${params.agentName}`;
  }

  if (params.step === 1) {
    return `Hi ${firstName}, quick check-in to make sure you were able to open AgentForLife with code ${params.beneficiaryCode}. You are listed as a ${roleLabel} for ${insured}. If helpful, here is the link again: ${params.appUrl}`;
  }
  if (params.step === 2) {
    return `Hi ${firstName}, I can walk you through what your ${roleLabel} status means and where to find those details in the app. Happy to do a quick call if useful. -- ${params.agentName}`;
  }
  return `Hi ${firstName}, last follow-up so I do not keep pinging you. If you need help with access or questions about your beneficiary role for ${insured}, I am here when you need me. -- ${params.agentName}`;
}

export function buildBeneficiaryHolidayMessage(params: {
  holiday: HolidayCardKey;
  beneficiaryFirstName: string;
  insuredFirstName: string;
  role: BeneficiaryRole;
  agentSignature: string;
  language: SupportedLanguage;
}): { title: string; body: string } {
  const firstName = params.beneficiaryFirstName || 'there';
  const insured = params.insuredFirstName || 'your loved one';
  const roleLabel = params.role === 'contingent'
    ? (params.language === 'es' ? 'beneficiario contingente' : 'contingent beneficiary')
    : (params.language === 'es' ? 'beneficiario principal' : 'primary beneficiary');

  const base = buildHolidayCardMessage({
    holiday: params.holiday,
    firstName,
    agentSignature: params.agentSignature,
    language: params.language,
  });
  if (params.language === 'es') {
    return {
      title: base.title,
      body: `${base.body} Gracias por ser ${roleLabel} de ${insured}.`,
    };
  }
  return {
    title: base.title,
    body: `${base.body} Thank you for being listed as a ${roleLabel} for ${insured}.`,
  };
}

export function buildReferralDripMessage(params: {
  status: string;
  referralName: string;
  clientName: string;
  schedulingUrl: string | null;
  language: SupportedLanguage;
}): string {
  const referralName = params.referralName || 'there';
  const clientName = params.clientName || 'your friend';
  if (params.language === 'es') {
    if (params.status === 'outreach-sent') {
      return `Hola ${referralName}, ${clientName} me menciono y pense que tal vez te podria ayudar. Alcanzaste a ver mi mensaje anterior?`;
    }
    if (params.status === 'drip-1') {
      return `Hola ${referralName}, algo rapido: muchas familias no se dan cuenta de lo rapido que se acumulan los gastos si pasa algo inesperado. Hipoteca, cuentas y gastos de los hijos. Solo queria dejarte la idea, sin presion.`;
    }
    if (params.status === 'drip-2') {
      const bookingPart = params.schedulingUrl
        ? ` Si quieres, podemos revisar tu situacion en 15 minutos aqui: ${params.schedulingUrl}`
        : ' Si quieres platicar, estoy a un mensaje de distancia.';
      return `Hola ${referralName}, ultimo mensaje de mi parte para no molestarte.${bookingPart} Gracias por conectar por medio de ${clientName}.`;
    }
    return '';
  }

  if (params.status === 'outreach-sent') {
    return `Hey ${referralName}, ${clientName} mentioned something interesting about you that made me think I could help. Did you get my last message?`;
  }
  if (params.status === 'drip-1') {
    return `Hey ${referralName}, quick thought -- most families do not realize how fast things add up if something unexpected happens. The mortgage, bills, kids' expenses. It is easy to put off but hard to fix after the fact.`;
  }
  if (params.status === 'drip-2') {
    const bookingPart = params.schedulingUrl
      ? ` If you ever want to take 15 minutes to see where you stand, here is my calendar: ${params.schedulingUrl}`
      : ' If you ever want to chat, I am a text away.';
    return `Hey ${referralName}, last thing from me -- I do not want to keep bugging you.${bookingPart} Either way, it was great connecting through ${clientName}.`;
  }
  return '';
}

export function buildBirthdayPush(params: {
  firstName: string;
  agentSignature: string;
  language: SupportedLanguage;
}): { title: string; body: string } {
  if (params.language === 'es') {
    return {
      title: 'Feliz cumpleanos!',
      body: `Feliz cumpleanos, ${params.firstName}. Espero que hoy este lleno de momentos especiales con tu familia. Es un privilegio cuidar la proteccion de tu hogar. -- ${params.agentSignature}`,
    };
  }
  return {
    title: 'Happy Birthday! 🎂',
    body: `Happy Birthday, ${params.firstName}! Today is your day -- I hope it's filled with the people and moments that mean the most to you. It's a privilege to be the one looking after your family's protection. Enjoy every minute. -- ${params.agentSignature}`,
  };
}

export function buildHolidayCardMessage(params: {
  holiday: HolidayCardKey;
  firstName: string;
  agentSignature: string;
  language: SupportedLanguage;
}): { title: string; body: string } {
  if (params.language === 'es') {
    if (params.holiday === 'newyear') {
      return {
        title: 'Saludos de Ano Nuevo',
        body: `Feliz Ano Nuevo, ${params.firstName}. Te deseo un nuevo inicio lleno de buenas cosas. Es un privilegio cuidar a tu familia. -- ${params.agentSignature}`,
      };
    }
    if (params.holiday === 'valentines') {
      return {
        title: 'Saludos de San Valentin',
        body: `Feliz Dia de San Valentin, ${params.firstName}. Hoy celebramos a las personas que mas importan. Gracias por confiar en mi para proteger a tu familia. -- ${params.agentSignature}`,
      };
    }
    if (params.holiday === 'july4th') {
      return {
        title: 'Saludos del 4 de Julio',
        body: `Feliz 4 de Julio, ${params.firstName}. Te deseo un dia lleno de buena comida, buena compania y celebracion. -- ${params.agentSignature}`,
      };
    }
    if (params.holiday === 'thanksgiving') {
      return {
        title: 'Saludos de Accion de Gracias',
        body: `Feliz Dia de Accion de Gracias, ${params.firstName}. Estoy agradecido por tu confianza para proteger lo mas importante para tu familia. -- ${params.agentSignature}`,
      };
    }
    return {
      title: 'Saludos de Navidad',
      body: `Feliz Navidad, ${params.firstName}. Te deseo una temporada llena de paz, alegria y tiempo con tu familia. -- ${params.agentSignature}`,
    };
  }

  if (params.holiday === 'newyear') {
    return {
      title: "New Year's Day Greetings",
      body: `Happy New Year, ${params.firstName}! Here's to a fresh start and a year full of good things. I'm honored to be the one looking out for you and your family -- let's make this year a great one. -- ${params.agentSignature}`,
    };
  }
  if (params.holiday === 'valentines') {
    return {
      title: "Valentine's Day Greetings",
      body: `Happy Valentine's Day, ${params.firstName}! Today is all about the people who matter most -- and protecting the ones you love is something I never take lightly. Enjoy every moment with your loved ones today. -- ${params.agentSignature}`,
    };
  }
  if (params.holiday === 'july4th') {
    return {
      title: 'Independence Day Greetings',
      body: `Happy 4th of July, ${params.firstName}! Wishing you a day full of good food, great company, and maybe a few fireworks. Enjoy the celebration -- you and your family deserve it. -- ${params.agentSignature}`,
    };
  }
  if (params.holiday === 'thanksgiving') {
    return {
      title: 'Thanksgiving Greetings',
      body: `Happy Thanksgiving, ${params.firstName}! I'm grateful for the trust you place in me to protect what matters most to your family. I hope your table is full and your heart is fuller. Enjoy every bite. -- ${params.agentSignature}`,
    };
  }
  return {
    title: 'Christmas Greetings',
    body: `Merry Christmas, ${params.firstName}! Wishing you and your family a season full of warmth, joy, and time together. It's a privilege to be your agent -- I hope this holiday brings you everything you deserve. -- ${params.agentSignature}`,
  };
}
