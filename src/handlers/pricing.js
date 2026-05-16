export function handlePricing({ firstName, messageText }) {
  const guestMatch = messageText.match(/(\d+)\s*(adults?|guests?|people|persons?|pax)/i);
  const nightMatch = messageText.match(/(\d+)\s*(nights?|days?)/i);

  if (guestMatch && nightMatch) {
    const guests = parseInt(guestMatch[1], 10);
    const nights = parseInt(nightMatch[1], 10);
    const extraGuests = Math.max(0, guests - 4);
    const perNight = 18000 + extraGuests * 2000;
    const total = perNight * nights;
    const extraLine = extraGuests > 0
      ? ` (INR 18,000 base + INR ${(extraGuests * 2000).toLocaleString('en-IN')} for ${extraGuests} extra guest${extraGuests > 1 ? 's' : ''})`
      : '';
    return `Hi ${firstName}! For ${guests} guests over ${nights} nights: INR ${perNight.toLocaleString('en-IN')}/night${extraLine} × ${nights} = INR ${total.toLocaleString('en-IN')} total. Let me know if you'd like to book!`;
  }

  if (guestMatch) {
    const guests = parseInt(guestMatch[1], 10);
    const extraGuests = Math.max(0, guests - 4);
    const perNight = 18000 + extraGuests * 2000;
    return `Hi ${firstName}! For ${guests} guests the nightly rate is INR ${perNight.toLocaleString('en-IN')}. How many nights are you planning to stay? I'll give you the full total.`;
  }

  if (nightMatch) {
    const nights = parseInt(nightMatch[1], 10);
    const total = 18000 * nights;
    return `Hi ${firstName}! For ${nights} nights the base rate is INR ${total.toLocaleString('en-IN')} (up to 4 guests). If you have more than 4 guests, it's INR 2,000 extra per person per night. How many guests are joining?`;
  }

  return `Hi ${firstName}! The base rate is INR 18,000 per night for up to 4 guests. Extra guests are INR 2,000 per person per night. Could you share the number of guests and nights so I can work out the exact total for you?`;
}
