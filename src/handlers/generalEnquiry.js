const FACTS = {
  pets:        () => 'Pets are not permitted at the villa.',
  parking:     () => 'Yes, parking is available on the property.',
  pool:        () => 'The villa has a private pool exclusively for guests.',
  smoking:     () => 'Smoking is not allowed indoors. There is an outdoor area where guests may smoke.',
  capacity:    () => 'The villa sleeps up to 6 guests across 3 bedrooms.',
  caretaker:   () => 'Our caretaker is available from 8:00 AM to 10:00 PM and can help with most requests during your stay.',
  chef:        () => 'A chef is available on request with advance booking — just let us know the date and meal preferences.',
  cancellation:() => 'Cancellations are free up to 7 days before check-in.',
  pool_heating:() => 'The pool is not heated. It is an outdoor pool and temperature depends on the season.',
  bbq:         () => 'A BBQ / barbecue setup can be arranged on request — let us know in advance.',
};

const PATTERNS = [
  { key: 'pets',         re: /pets?|dog|cat|animal/i },
  { key: 'parking',      re: /parking|car park|vehicle|park/i },
  { key: 'pool',         re: /\bpool\b|swim/i },
  { key: 'smoking',      re: /smok/i },
  { key: 'capacity',     re: /capacity|how many (guests?|people)|max(imum)? guests?|bedrooms?/i },
  { key: 'caretaker',    re: /caretaker|staff|support|help|someone.*there/i },
  { key: 'chef',         re: /chef|cook|food service|meals? service/i },
  { key: 'cancellation', re: /cancel|refund policy|cancellation/i },
  { key: 'pool_heating', re: /heated pool|pool heat|warm pool/i },
  { key: 'bbq',          re: /bbq|barbecue|grill/i },
];

export function handleGeneralEnquiry({ firstName, messageText }) {
  const matches = PATTERNS.filter(({ re }) => re.test(messageText));

  if (matches.length === 0) {
    return `Hi ${firstName}! Happy to help. Could you share a bit more detail so I can give you the right answer?`;
  }

  // Answer every matched question in one reply
  const answers = matches.map(({ key }) => FACTS[key]()).join(' ');
  return `Hi ${firstName}! ${answers} Let me know if you have any other questions!`;
}
