# Student Opportunities Platform — Master Build Instructions

## 1. Product Goal
Build a production-ready web platform for students to discover hackathons, coding competitions, workshops, conferences, and major student tech events.

The product should launch **India-first** but be architected for **global expansion**.

Core promise:

> Every student opportunity you are actually eligible for, automatically discovered, explained, and tracked.

The platform should:
- automatically discover and sync events from trusted sources
- personalize opportunities for each student
- explain eligibility and relevance
- let users save events and add them to calendars
- notify users before deadlines or when event details change
- link every opportunity to its original official registration/source page
- include an AI assistant grounded in verified event data
- allow organizers to submit events
- include an admin workflow for moderation and source health

---

# 2. Target Users
Primary:
- college/university students in India
- undergraduate students initially
- tech-focused students first, but architecture should support broader student events later

Future:
- international students
- event organizers
- university clubs
- companies
- communities

---

# 3. MVP Event Categories
Include:
- hackathons
- coding competitions
- workshops
- conferences
- student technology events

Do NOT include internships, jobs, scholarships, or unrelated opportunities in the first MVP unless explicitly added later.

---

# 4. Core Product Modules

## 4.1 Opportunity Discovery
Users should be able to:
- browse all active opportunities
- search
- filter
- sort
- view trending opportunities
- see deadlines closing soon
- browse by category
- view online/offline/hybrid events
- see personalized recommendations

Required filters:
- category
- topic/domain
- online / offline / hybrid
- city
- country
- eligibility
- year of study
- degree/course
- team size
- registration deadline
- event date
- free/paid
- prize pool where available

---

## 4.2 User Profiles
User profiles should contain:
- name
- email
- college/university
- degree/course
- year of study
- city
- country
- skills
- interests
- preferred event categories
- online/offline preference
- willingness to travel
- preferred team size
- optional portfolio/social links

Profile data should power eligibility checks and recommendations.

---

## 4.3 Recommendation System
Each relevant event should show:
- match percentage or match level
- whether the user appears eligible
- explanation of why it matches

Example:

> 91% Match  
> You qualify because this event accepts undergraduate students, supports online participation, and matches your AI/ML and Python interests.

Start with a deterministic weighted scoring system rather than complex ML.

Suggested initial weighting:
- eligibility: 25%
- interest/domain match: 25%
- skills: 15%
- location/mode: 10%
- academic year: 10%
- preferred category: 10%
- other preferences: 5%

The scoring system must be explainable.

---

# 5. Event Detail Page
Every event page should clearly show:

- title
- organizer
- event logo/image when available
- verification level
- match score
- short summary
- official website
- official registration URL
- event category
- tags/domains
- start date
- end date
- registration deadline
- event mode
- location/venue
- city/country
- eligibility
- eligible degree/course/year
- individual participation allowed or not
- minimum team size
- maximum team size
- fee
- prize pool
- important stages/timeline
- participation process
- source(s)
- last checked timestamp
- event status
- save/bookmark button
- Google Calendar option
- .ics calendar option
- Ask AI option

The official registration button must always send users to the original organizer/platform page.

Do NOT process official registrations inside this platform in the MVP.

---

# 6. Verification Levels
Use these trust levels:

## Verified
Confirmed against the organizer's official website.

## Source Confirmed
Confirmed through a trusted event platform such as Devpost, Unstop, MLH, HackerEarth, Devfolio, etc.

## Community Submitted
Submitted by a user/organizer and not yet fully verified.

Never present uncertain AI-extracted information as verified fact.

---

# 7. Data Sources and Ingestion

Initial candidate sources:
- Devpost
- Unstop
- Devfolio
- HackerEarth
- MLH
- company hackathon pages
- university event pages
- government/student portals
- conference/event websites

Use sources in this priority:

1. official API
2. structured feed / RSS
3. structured public webpage
4. permitted scraping
5. AI-assisted extraction from collected source content

Do NOT build the system around uncontrolled scraping.

Respect website terms, robots policies, rate limits, and legal restrictions.

---

# 8. Event Ingestion Pipeline

Required pipeline:

Source
→ collector
→ raw event record
→ parser/extractor
→ normalization
→ validation
→ duplicate detection
→ verification
→ canonical event record
→ database
→ search/recommendation/chatbot

Every source connector should track:
- source name
- source URL
- connector type
- last sync
- last successful sync
- sync status
- error count
- enabled/disabled status

---

# 9. Automatic Sync / Freshness System

Scheduled background jobs should:
- discover new events
- refresh existing events
- detect changed deadlines
- detect changed venues
- detect changed dates
- detect registration status changes
- detect postponement
- detect cancellation
- detect removed events

When a meaningful event change occurs:
- update canonical event data
- record the change
- notify affected saved/interested users

Every event should have:
- last_checked_at
- source_updated_at if known
- status
- verification_status

---

# 10. Duplicate Detection
The same event may exist on multiple platforms.

The system must avoid showing duplicates.

Use a combination of:
- title similarity
- organizer
- official URL
- registration URL
- dates
- event domain
- source IDs

Maintain:
- one canonical event
- multiple source records where needed

Do not destroy alternate source information.

---

# 11. Recommended Technical Stack

## Frontend
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui as a starting component foundation only
- Motion / Framer Motion for animation

## Backend
- Next.js server routes / server actions where appropriate
- Supabase

## Database
- PostgreSQL through Supabase

## Authentication
- Supabase Auth

## Hosting
- Vercel

## Scheduled Jobs
Prefer:
- Vercel Cron
or
- GitHub Actions where better suited

## Email
- Resend free tier initially

## Analytics
- PostHog free tier

## Monitoring
- Sentry free tier

## Search
Start with PostgreSQL full-text search.
Do not add Elasticsearch/Algolia until clearly needed.

## AI
Use OpenAI API or another cost-efficient supported model.
AI provider implementation should be abstracted enough to replace later.

---

# 12. Core Database Entities

Minimum tables/entities:

- users
- profiles
- interests
- user_interests
- skills
- user_skills

- events
- event_sources
- event_categories
- event_tags
- event_deadlines
- event_changes

- organizers
- organizer_submissions

- saved_events
- calendar_exports
- notifications
- notification_preferences

- source_connectors
- sync_runs

- chat_sessions
- chat_messages

Add tables only when actually justified.

---

# 13. Event Data Model

Each canonical event should support at minimum:

- id
- slug
- title
- short_description
- full_description
- organizer_id
- official_url
- registration_url
- category
- tags
- start_date
- end_date
- registration_deadline
- mode
- venue
- city
- state
- country
- latitude/longitude if available
- eligibility_text
- eligible_years
- eligible_degrees
- individual_allowed
- min_team_size
- max_team_size
- fee
- prize_pool
- currency
- status
- verification_level
- last_checked_at
- created_at
- updated_at

Use normalized child tables where appropriate instead of bloating a single table.

---

# 14. Saving and Calendar Integration

Users should be able to:

## Save inside platform
Store saved events in the user's account.

## Google Calendar
Allow authenticated users to add relevant event dates to Google Calendar.

Include:
- title
- start/end dates
- registration deadline where relevant
- event description
- official link

## Universal Calendar
Generate `.ics` files for:
- Apple Calendar
- Outlook
- other calendar apps

---

# 15. Notifications

MVP notification channels:
- in-app
- email

Notify for:
- registration deadline approaching
- event starting soon
- new highly relevant event
- saved event date changed
- venue changed
- event postponed
- event cancelled
- registration reopened/closed

Future:
- push
- WhatsApp
- Telegram

Do not add these future channels in MVP unless explicitly requested.

---

# 16. AI Assistant

The assistant should NOT be a generic chatbot.

It should:
- search relevant events
- explain eligibility
- explain rules simply
- compare events
- recommend events using the user's profile
- answer questions about deadlines, mode, fees, teams, prizes, eligibility
- create event preparation checklists
- create preparation plans
- identify events within a time range
- explain why an event matches the user
- provide official source links

Example queries:
- "Show me online AI hackathons next month where first-year students are eligible."
- "Can I participate in this hackathon?"
- "Compare these three events."
- "Which opportunity suits my current Python skills?"
- "Explain the rules in simple language."
- "Create a 10-day preparation plan for this hackathon."

---

# 17. AI Grounding Rules

For event-specific answers:

User query
→ identify intent
→ retrieve user profile when relevant
→ retrieve event/database records
→ retrieve supporting event sources
→ generate answer grounded in those records
→ surface source/original event link

Critical rules:
- do not invent eligibility
- do not invent deadlines
- do not invent prize amounts
- do not state uncertain information as fact
- distinguish verified data from assumptions
- show source when answering event-specific questions
- prefer database/source data over model memory

---

# 18. Organizer Flow

Allow event organizers to submit events.

Submission form should include:
- organization
- organizer contact
- official website
- official event page
- registration page
- title
- description
- dates
- registration deadline
- eligibility
- event mode
- venue
- fees
- prizes
- team rules

Workflow:

Submission
→ automated validation
→ duplicate detection
→ source verification
→ admin moderation
→ publish

Future:
- verified organizer accounts
- organizer dashboard
- self-service event updates

---

# 19. Admin Dashboard

Create an internal admin area.

It should support:
- event management
- source management
- verification queue
- organizer submissions
- duplicate review
- failed sync review
- event change history
- reported events
- user reports
- connector health
- manual refresh
- disable bad source
- publish/unpublish event

Admin access must be protected by authorization.

---

# 20. Design Direction

Desired visual direction:

**Editorial × futuristic × technical**

The website should feel professionally designed and NOT like AI-generated template output.

Avoid:
- generic purple/blue gradients everywhere
- glowing blobs
- random neon
- excessive glassmorphism
- excessive rounded cards
- giant meaningless hero text
- generic 3D illustrations
- floating AI icons
- random particle animations
- every section inside a card
- fake testimonials
- generic startup copy

Prefer:
- strong typography
- clear hierarchy
- editorial layouts
- whitespace
- restrained color system
- thoughtful grids
- asymmetric layouts when appropriate
- real event logos/art where legally allowed
- one strong accent color
- consistent spacing
- functional UI

---

# 21. Motion Design

Motion must communicate state or improve comprehension.

Good uses:
- filter results smoothly reorganize
- bookmark/save animation
- subtle match-score animation
- timeline reveal
- page transitions
- hover metadata
- search/filter transitions
- skeleton/loading states
- subtle hero interaction

Avoid:
- continuous distracting animations
- gratuitous parallax everywhere
- random floating objects
- excessive scroll-triggered motion

Performance and accessibility take priority over decoration.

Respect reduced-motion accessibility settings.

---

# 22. Main Pages

Required:
- Home
- Explore
- For You
- Search
- Event Detail
- Saved
- Notifications
- AI Assistant
- Profile
- Edit Profile
- Submit Event
- Organizer area
- Login
- Signup
- About
- Privacy
- Terms
- Admin

---

# 23. Suggested Homepage Structure

Navbar

Hero:
"Discover what's worth showing up for."

Search bar

Trending Opportunities

For You

Closing Soon

Online This Month

Categories:
- AI / ML
- Development
- Cybersecurity
- Robotics
- Entrepreneurship
- others from event data

Explore by Category

How Recommendations Work

Trusted Sources

Create Your Student Profile CTA

The homepage should feel like a real discovery product, not a marketing landing page.

---

# 24. Security and Privacy

Minimum requirements:
- secure authentication
- server-side authorization
- no secrets exposed to client
- row-level security where appropriate
- validate all form input
- rate-limit sensitive endpoints
- protect admin routes
- sanitize externally sourced content
- secure OAuth tokens
- collect only needed profile data
- allow users to delete their account/data
- create Privacy Policy and Terms before public launch

---

# 25. SEO / Discoverability
Event pages should be indexable where appropriate.

Add:
- descriptive metadata
- canonical URLs
- event structured data where valid
- sitemap
- robots configuration
- clean slugs
- Open Graph metadata

Do not index private user/profile/chat pages.

---

# 26. Accessibility
Meet practical WCAG standards.

Include:
- keyboard navigation
- visible focus
- proper labels
- semantic HTML
- accessible contrast
- reduced motion support
- screen-reader-friendly controls

---

# 27. Performance
Prioritize:
- server rendering where useful
- caching
- optimized images
- lazy loading
- minimal client JS
- fast search
- efficient database queries
- pagination/infinite loading rather than fetching all events

Do not sacrifice performance for animation.

---

# 28. Development Order

Follow this order unless a technical dependency requires a justified change:

1. product specification
2. system architecture
3. repository setup
4. database schema
5. authentication
6. event CRUD/backend
7. minimal functional frontend
8. source ingestion
9. normalization
10. duplicate detection
11. search/filtering
12. user profiles
13. recommendation system
14. event detail experience
15. saved events
16. calendar integration
17. notifications
18. AI assistant
19. organizer submission
20. admin dashboard
21. design system refinement
22. motion design refinement
23. testing
24. security review
25. analytics/monitoring
26. deployment
27. final QA

Do NOT start by polishing the homepage before the backend/event model works.

---

# 29. Release Plan

## V0.1 — Functional MVP
Must include:
- authentication
- student profile
- event database
- 5–8 reliable event sources
- explore page
- search
- filtering
- event details
- verified official links
- save/bookmark
- basic match/recommendation system
- basic admin controls

## V0.2 — Smart Platform
Add:
- AI assistant
- Google Calendar
- .ics
- email + in-app notifications
- event change detection
- improved recommendation explanations
- organizer submissions
- stronger admin dashboard

## V1 — Public Product
Add/refine:
- stronger source ingestion
- verified organizers
- production monitoring
- global sources
- advanced personalization
- SEO
- analytics
- PWA/mobile improvements
- scalability improvements

---

# 30. Explicit MVP Non-Goals

Do NOT build these unless requested later:
- internal event registration
- payments
- social network
- public messaging/chat between users
- team formation marketplace
- leaderboards
- internships/jobs
- scholarships
- native mobile apps
- WhatsApp notifications
- Telegram notifications
- complex ML recommendation models
- microservice architecture
- Kubernetes
- Elasticsearch
- blockchain/Web3 functionality

Keep the architecture expandable without prematurely adding complexity.

---

# 31. Work Mode Responsibilities

Use ChatGPT Work / Astra for:
- PRD
- architecture
- research
- source strategy
- technical decisions
- data model review
- workflow design
- UX review
- security review
- integration planning
- QA
- feature prioritization
- acceptance testing
- project coordination

Work should treat this file as the source of truth.

Any proposed change to:
- core scope
- stack
- data model
- ingestion architecture
- verification model
- recommendation logic
must be explicitly justified before implementation.

---

# 32. Codex Responsibilities

Use Codex / Astra for:
- repository setup
- coding
- Next.js implementation
- Supabase integration
- migrations
- authentication
- APIs/server actions
- collectors/connectors
- scheduled sync jobs
- deduplication
- search
- recommendation logic
- Google Calendar integration
- email
- admin tools
- AI retrieval layer
- testing
- debugging
- refactoring
- deployment configuration

Codex must:
- inspect existing code before editing
- preserve working functionality
- make incremental changes
- run tests/build/lint after meaningful changes
- avoid rewriting unrelated parts of the project
- document schema/environment changes
- never hardcode secrets

---

# 33. Engineering Rules

1. Prefer simple, maintainable solutions.
2. Keep frontend and backend strongly typed.
3. Validate external data before inserting it.
4. Store raw/source data when useful for debugging.
5. Use migrations for schema changes.
6. Avoid duplicate business logic.
7. Do not place privileged database logic in the browser.
8. Keep source connectors modular.
9. Log ingestion failures clearly.
10. Make scheduled jobs idempotent.
11. Preserve provenance for event fields where possible.
12. Prefer official source data over AI interpretation.
13. Write tests for high-risk logic.
14. Avoid premature abstractions.
15. Keep the app deployable throughout development.

---

# 34. Acceptance Criteria for Public MVP

The MVP is ready only when:

- users can sign up/login
- users can create/edit a student profile
- events from several real sources are ingested
- duplicates are reasonably controlled
- events display official source links
- event freshness is tracked
- search works
- filters work
- eligibility/recommendation logic works
- recommendation explanations are visible
- users can save events
- event detail pages are complete
- basic admin moderation works
- ingestion failures can be inspected
- mobile layout is usable
- accessibility basics pass
- build/lint/tests pass
- secrets are secure
- production database has proper access controls
- deployment works reliably

V0.2 additionally requires:
- Google Calendar
- .ics
- notifications
- AI assistant
- event change notifications
- organizer submission workflow

---

# 35. First Task for Work

Before writing production code:

1. Read this entire file.
2. Convert it into a concise PRD.
3. Produce the final system architecture.
4. Identify legal/technical constraints for the proposed event sources.
5. Define the canonical event schema.
6. Define the source connector interface.
7. Define the recommendation scoring rules.
8. Define the verification model.
9. Define V0.1 milestones.
10. Create the implementation task list for Codex.

Do not redesign the product beyond this file without explaining why.

---

# 36. First Task for Codex

When the repository is ready:

1. Read this entire file.
2. Inspect the repository.
3. Summarize the current state.
4. Create/confirm the Next.js + TypeScript structure.
5. Configure Supabase safely.
6. Create the initial database migrations.
7. Implement authentication.
8. Implement canonical event CRUD.
9. Build the minimal Explore/Event Detail UI.
10. Add one reliable source connector end-to-end.
11. Add sync logging.
12. Add duplicate-safe ingestion.
13. Verify with tests/build.
14. Continue incrementally according to the development order.

Do not attempt to build every feature in one giant change.

---

# 37. Product Principle

This is not merely a hackathon listing website.

The product should answer:

> What opportunities can I actually participate in, why are they relevant to me, what do I need to know, and what am I about to miss?

That principle should guide product, data, design, and AI decisions.
