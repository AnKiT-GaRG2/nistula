export function handleCheckin({ firstName, messageText }) {
  if (/wifi|wi.?fi|internet|password|network/i.test(messageText)) {
    return `Hi ${firstName}! The WiFi password is Nistula@2024. Let me know if you need anything else!`;
  }
  if (/check.?out|leave|departure|last day/i.test(messageText)) {
    return `Hi ${firstName}! Check-out is by 11:00 AM. If you need a late check-out, just let us know your preferred time and we'll do our best to arrange it.`;
  }
  if (/check.?in|get in|enter|arrive|access|key|door/i.test(messageText)) {
    return `Hi ${firstName}! Check-in is from 2:00 PM. Our caretaker will be there to welcome you — what time are you expecting to arrive?`;
  }
  if (/caretaker|contact|phone|number|reach/i.test(messageText)) {
    return `Hi ${firstName}! Our caretaker is available from 8:00 AM to 10:00 PM and can help with most things during your stay. I'll share their contact shortly.`;
  }
  return `Hi ${firstName}! Happy to help with your arrival details. Check-in is from 2:00 PM, check-out by 11:00 AM, and the WiFi password is Nistula@2024. Is there anything else you need?`;
}
