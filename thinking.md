# Part 3 — Thinking

Scenario: 3 AM. A guest at Villa B1 sends a WhatsApp message: *"There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight."*

---

## Question A — The Immediate Response

**The message:**

> Hi [name], I'm truly sorry — no hot water with guests arriving for breakfast in 4 hours is completely unacceptable. I'm waking the team up right now. You'll get a call within 15 minutes with a fix for tonight.

**Why this wording:** The system detects urgent tone and strips all emoji and cheerfulness from the reply — a distressed guest at 3 AM does not want sparkles. The reply names the specific detail (breakfast in 4 hours) so the guest knows their message was actually read. It commits to a concrete next step (call in 15 minutes) rather than vague reassurance. The refund request is not addressed in the AI reply — that is a human decision requiring context on fault, policy, and booking history.

---

## Question B — The System Design

Beyond sending the message, the platform does the following immediately:

1. **Logs everything** — `dispatch_status = 'escalated'`, conversation `status = 'escalated'`, full `raw_payload` stored in the DB for audit and replay.
2. **Notifies simultaneously** — push notification + SMS to the on-call caretaker and property manager at the same time, not sequentially.
3. **Starts a 30-minute timer** — if no human acknowledges (opens the platform, calls the guest, or logs an action), auto-escalate to the next tier: property manager's personal mobile, then the owner.
4. **60-minute fallback** — if still no resolution logged, a second automated message goes to the guest: *"Our caretaker is on the way. We haven't forgotten you."*
5. **Flags the refund** — sets a refund flag on the reservation row for staff to review in the morning. Not auto-approved.

---

## Question C — The Learning

Three hot water complaints at Villa B1 in two months is not a guest problem — it is a maintenance problem the platform has been watching but not acting on.

**What should have happened after complaint two:** the system should have required the property manager to log corrective action within 24 hours. No log = automatic escalation to the owner. This should be a platform rule enforced in code, not left to manual follow-up.

**What to build:** A recurring-issue detector — when the same `property_id` and keyword cluster (`hot water`, `boiler`, `no hot water`) appear 3+ times in a 60-day window, automatically create a maintenance ticket and hold new check-ins at that property for manual review until the ticket is marked resolved.

**How to prevent complaint four:** A mandatory pre-arrival digital checklist item — *"Hot water verified working"* — that the caretaker must sign off before each new guest checks in. If unsigned 2 hours before check-in, the guest comms team is proactively notified so they can get ahead of it before the guest arrives.
