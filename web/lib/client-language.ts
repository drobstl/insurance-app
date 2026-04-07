export type SupportedLanguage = 'en' | 'es';

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
