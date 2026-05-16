import { detectGuestTone } from './clients/baseClient.js';
import { appendEmoji } from './clients/baseClient.js';

export function generateFallbackReply(normalizedMessage) {
  const firstName = (normalizedMessage.guest_name || 'there').split(' ')[0];
  const tone = detectGuestTone(normalizedMessage.message_text);
  const source = normalizedMessage.source;
  let reply;

  if (tone.startsWith('urgent')) {
    reply = `Hi ${firstName}, I'm sorry you're dealing with this. The team is checking it and will get back to you shortly.`;
    return appendEmoji(reply, { source, tone });
  }

  if (tone.startsWith('excited')) {
    reply = `Hi ${firstName}! Thanks for your message — the team will get back to you very shortly.`;
    return appendEmoji(reply, { source, tone });
  }

  if (tone.startsWith('polite')) {
    reply = `Hi ${firstName}, thanks for your message. Our team will get back to you very shortly.`;
    return appendEmoji(reply, { source, tone });
  }

  reply = `Hi ${firstName}, thanks for your message. Our team will get back to you very shortly.`;
  return appendEmoji(reply, { source, tone });
}
