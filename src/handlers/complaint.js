export function handleComplaint({ firstName, messageText }) {
  if (/hot water|no water|water not|geyser|heater/i.test(messageText)) {
    return `Hi ${firstName}, I'm truly sorry about the hot water issue — that's completely unacceptable. I've flagged this as urgent and our caretaker will contact you immediately to get it fixed.`;
  }

  if (/ac|air con|air conditioning|cooling|fan|hot room/i.test(messageText)) {
    return `Hi ${firstName}, I sincerely apologise for the AC problem. This has been escalated to our caretaker who will attend to it as soon as possible. Please bear with us.`;
  }

  if (/dirty|clean|hygiene|smell|odour|odor|stain|mess/i.test(messageText)) {
    return `Hi ${firstName}, I'm very sorry about the cleanliness issue — this is not the standard we hold ourselves to. I've escalated this immediately and our team will address it right away.`;
  }

  if (/noise|loud|neighbour|neighbor|music|party/i.test(messageText)) {
    return `Hi ${firstName}, I sincerely apologise for the disturbance. This has been flagged urgently and our caretaker will intervene immediately to resolve it.`;
  }

  if (/wifi|wi.?fi|internet|connection|no signal/i.test(messageText)) {
    return `Hi ${firstName}, I'm sorry about the connectivity issue. Our caretaker has been alerted and will come by to fix it shortly. Thank you for your patience.`;
  }

  if (/power|electricity|light|lights|no power|outage/i.test(messageText)) {
    return `Hi ${firstName}, I apologise for the power issue. Our caretaker has been notified and will be there as soon as possible to resolve it.`;
  }

  if (/refund|compensation|money back/i.test(messageText)) {
    return `Hi ${firstName}, I completely understand your frustration and I'm truly sorry for the experience. I've escalated this to our team and someone will be in touch with you shortly to make this right.`;
  }

  return `Hi ${firstName}, I'm really sorry to hear this. This has been flagged as urgent and a team member will contact you very shortly to resolve the issue. We appreciate your patience.`;
}
