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
2. **Categorizes the alert** into **critical** and **non-critical**:
	- **Critical** means the task is guest-impacting, safety-related, or time-sensitive: no hot water, AC failure, water leak, lockout, power cut, medical emergency, or any issue that can ruin the stay right away.
	- **Non-critical** means the task can wait without immediate guest harm: extra towels, late checkout, restaurant suggestions, minor amenity questions, or housekeeping requests.
	- If a non-critical issue is raised repeatedly over a threshold, it is promoted to **critical**. For example, if the same "extra towels" or "slow WiFi" complaint appears 3 times within a short window for the same reservation or property, the platform upgrades it to critical because it is no longer a one-off request.
3. **Notifies simultaneously** — push notification + SMS to the on-call caretaker and property manager at the same time, not sequentially.
4. **Starts a 30-minute timer** — if no human acknowledges (opens the platform, calls the guest, or logs an action), auto-escalate to the next tier: property manager's personal mobile, then the owner.
5. **Critical alerts get faster escalation** — if the alert is already categorized as critical, the system skips the normal queue and immediately pages the higher-priority contacts. Non-critical alerts stay in the standard queue unless they cross the repeat threshold.
6. **60-minute fallback** — if still no resolution logged, a second automated message goes to the guest: *"Our caretaker is on the way. We haven't forgotten you."*
7. **Flags the refund** — sets a refund flag on the reservation row for staff to review in the morning. Not auto-approved.

**Example:**

- Guest says: *"There is no hot water and we have guests arriving for breakfast in 4 hours."*
- The system marks this as **critical** immediately because it affects the stay right away.
- It logs the incident, sends push + SMS at once, starts the 30-minute acknowledgement timer, and escalates to the next tier if nobody responds.
- If instead the guest said *"Can I get two extra towels?"*, the alert would start as **non-critical**. But if the same request is raised multiple times and crosses the threshold, it is promoted to **critical** and handled with higher urgency.

---

## Question C — The Learning

Three hot water complaints at Villa B1 in two months is not a guest problem — it is a maintenance problem the platform has been watching but not acting on.

**How this connects to Question B:** the first hot-water complaint is already a **critical** alert because it affects the stay immediately. If the property manager does not log corrective action within 24 hours, the platform should automatically escalate it to the owner. That makes critical alerts a closed loop, not just a notification.

**What should have happened after complaint two:** the system should have required the property manager to log corrective action within 24 hours, and if the same critical issue reappears, the escalation timer should shorten rather than reset. No log = automatic escalation to the owner. This should be a platform rule enforced in code, not left to manual follow-up.

**What to build:** A recurring-issue detector — when the same `property_id` and keyword cluster (`hot water`, `boiler`, `no hot water`) appear 3+ times in a 60-day window, automatically create a maintenance ticket, mark the property as **critical-watch**, and hold new check-ins at that property for manual review until the ticket is marked resolved. If the repeated issue is already in the critical category, the ticket should bypass the normal queue and notify the owner immediately.

**How to prevent complaint four:** A mandatory pre-arrival digital checklist item — *"Hot water verified working"* — that the caretaker must sign off before each new guest checks in. If unsigned 2 hours before check-in, the guest comms team is proactively notified so they can get ahead of it before the guest arrives. If the checklist is skipped twice for the same property, it should auto-promote from a routine operations task to a critical maintenance compliance issue.

**Example:**

- Complaint 1: guest reports no hot water → **critical** alert, immediate escalation.
- Complaint 2: same property, same issue within a week → the property is flagged for corrective action within 24 hours.
- Complaint 3: same keyword cluster appears again inside the 60-day window → recurring-issue detector creates a maintenance ticket, freezes automated confidence in that property, and routes it straight to the owner.
- Next check-in: caretaker cannot mark *"Hot water verified working"* → the system notifies guest comms before arrival instead of waiting for the next complaint.
