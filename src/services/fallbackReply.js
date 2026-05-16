import { detectGuestTone } from './clients/baseClient.js';

export function generateFallbackReply(normalizedMessage) {
  const firstName = (normalizedMessage.guest_name || 'there').split(' ')[0];
  const tone = detectGuestTone(normalizedMessage.message_text);

  if (tone.startsWith('urgent')) {
    return `Hi ${firstName}, I'm sorry you're dealing with this. The team is checking it and will get back to you shortly.`;
  }

  if (tone.startsWith('excited')) {
    return `Hi ${firstName}! Thanks for your message — the team will get back to you very shortly.`;
  }

  return `Hi ${firstName}, thanks for your message. Our team will get back to you very shortly.`;
}
