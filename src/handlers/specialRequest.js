export function handleSpecialRequest({ firstName, messageText }) {
  // Check destination context first — determines what info we actually need
  if (/airport/i.test(messageText)) {
    return `Hi ${firstName}! We can arrange an airport transfer. Could you share your flight number, arrival date, landing time, terminal (if known), and number of passengers? We'll have a car ready.`;
  }

  if (/railway station|train station|\bstation\b/i.test(messageText)) {
    return `Hi ${firstName}! We can arrange a station pickup. Could you share your train number, arrival date, expected arrival time at the station, and number of passengers? We'll make sure a car is there.`;
  }

  if (/bus station|bus stop|bus terminal/i.test(messageText)) {
    return `Hi ${firstName}! We can arrange a bus station pickup. Please share the arrival date, time, station name, and number of passengers — we'll take care of it.`;
  }

  if (/taxi|cab|auto|rickshaw|transfer|transport|vehicle|ride|pickup|pick.?up/i.test(messageText)) {
    return `Hi ${firstName}! We can arrange a vehicle for you. Could you share the pickup location, date, time, and number of passengers? We'll confirm the booking.`;
  }

  if (/chef|cook|meal|dinner|breakfast|lunch|food/i.test(messageText)) {
    return `Hi ${firstName}! Our in-house chef is available with advance booking. Could you share the date, preferred meal time, number of guests, and any dietary preferences or allergies? We'll confirm once we have these details.`;
  }

  if (/early check.?in|check in early|arrive early/i.test(messageText)) {
    return `Hi ${firstName}! We'll do our best to accommodate an early check-in. What time are you expecting to arrive? We'll confirm availability and get back to you shortly.`;
  }

  if (/late check.?out|check out late|leave late/i.test(messageText)) {
    return `Hi ${firstName}! We'll check if a late check-out is available on your departure date. What time do you need until? We'll confirm shortly.`;
  }

  if (/birthday|anniversary|celebration|decor|flowers|surprise/i.test(messageText)) {
    return `Hi ${firstName}! We'd love to help make the occasion special. Could you share the date, the occasion, number of guests, and anything specific you have in mind? Our team will handle the rest.`;
  }

  if (/baby cot|crib|cot|high chair|baby/i.test(messageText)) {
    return `Hi ${firstName}! We can arrange a baby cot or high chair for your stay. Could you confirm which you need and your check-in date? We'll have everything ready.`;
  }

  return `Hi ${firstName}! Happy to help arrange that. Could you share the date, time, and any specific details so our team can confirm everything for you?`;
}
