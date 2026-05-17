import { detectGuestTone } from './clients/baseClient.js';

export function generateFallbackReply(normalizedMessage) {
  const firstName = (normalizedMessage.guest_name || 'there').split(' ')[0];
  const tone = detectGuestTone(normalizedMessage.message_text);
  const replyLanguage = String(normalizedMessage.languageProfile?.replyLanguage || 'English').toLowerCase();
  const isHindi = replyLanguage.includes('hindi');

  if (isHindi) {
    if (tone.startsWith('urgent')) {
      return `Hi ${firstName}, mujhe maaf kijiye — hum isse turant dekh rahe hain aur jaldi update denge.`;
    }

    if (tone.startsWith('excited')) {
      return `Hi ${firstName}! Aapke message ke liye dhanyavaad — team jaldi aapko update karegi.`;
    }

    return `Hi ${firstName}, aapke message ke liye dhanyavaad. Hamari team jaldi aapko update karegi.`;
  }

  if (tone.startsWith('urgent')) {
    return `Hi ${firstName}, I'm sorry you're dealing with this. The team is checking it and will get back to you shortly.`;
  }

  if (tone.startsWith('excited')) {
    return `Hi ${firstName}! Thanks for your message — the team will get back to you very shortly.`;
  }

  return `Hi ${firstName}, thanks for your message. Our team will get back to you very shortly.`;
}
