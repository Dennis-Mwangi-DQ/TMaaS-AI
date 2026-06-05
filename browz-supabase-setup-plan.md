# Browz — Supabase Setup Plan
## Schema · Seed Data · pgvector FAQ · Session Memory

> **For AI IDE Use (Cursor / Windsurf / Copilot)**
> Execute each section in order. All SQL runs in the Supabase SQL editor unless a section is marked **TypeScript** (run as a Node script locally).

---

## Overview

This plan converts `data.ts` into a fully seeded Supabase PostgreSQL database for the Browz Booking Concierge agent. It covers:

1. Schema creation (all tables with correct types and constraints)
2. Seed SQL — branches, practitioners, artists, services (with correct tier/gating flags), packages, FAQ records
3. Demo client seed — appointments, clearances, screenings for all 25 agent test scenarios
4. Time slot generation — pre-seeded availability for the next 14 days
5. pgvector setup — FAQ embeddings for semantic lookup
6. Session memory table — agent conversation persistence

---

## Section 1 — Enable Extensions

Run first. Required before any other DDL.

```sql
-- Enable pgvector for FAQ semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

---

## Section 2 — Full Schema

Run in one block. Tables are ordered to satisfy foreign key dependencies.

```sql
-- ─── BRANCHES ────────────────────────────────────────────────────────────────
CREATE TABLE branches (
  id          text PRIMARY KEY,  -- "br-dxb", "br-dxb-clinic", "br-auh"
  name        text NOT NULL,
  city        text NOT NULL,
  address     text,
  phone       text,
  hours       jsonb,             -- { "Sun": "9:00 AM–9:00 PM", ... }
  categories  text[],            -- ["Facials", "Brows, Lips & Lashes", ...]
  status      text DEFAULT 'open',
  created_at  timestamptz DEFAULT now()
);

-- ─── ARTISTS (practitioners) ──────────────────────────────────────────────────
CREATE TABLE artists (
  id              text PRIMARY KEY,  -- "pr-mia", "pr-noor", "pr-jade", "pr-lara"
  name            text NOT NULL,
  role            text,
  title           text,
  branch_id       text REFERENCES branches(id),
  bio             text,
  specialities    text[],
  qualifications  text[],
  years_exp       integer,
  avg_rating      numeric(3,2),
  review_count    integer DEFAULT 0,
  service_ids     text[],            -- ["s-001", "s-011", ...]
  active          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- ─── SERVICES ─────────────────────────────────────────────────────────────────
CREATE TABLE services (
  id                    text PRIMARY KEY,  -- "s-001", "s-003", etc.
  title                 text NOT NULL,
  cat                   text NOT NULL,     -- "Brows", "Brows, Lips & Lashes", "SPMU", "Medical", "Advanced Skin", "Facials"
  service_tier          text NOT NULL DEFAULT 'T1'
                          CHECK (service_tier IN ('T1', 'T2', 'T3')),
  city                  text,
  duration_min          integer,           -- parsed from "60 min" → 60
  price_aed             numeric(8,2) NOT NULL DEFAULT 0,
  currency              text DEFAULT 'AED',
  is_featured           boolean DEFAULT false,
  tag                   text,              -- "Most popular", "Premium", etc.
  rating                numeric(3,2),
  review_count          integer DEFAULT 0,
  description           text,
  sessions_info         text,             -- "1 session", "Course of 4–6"
  maintenance           text,
  prep                  text,
  aftercare             text,
  contraindications     text[],
  trust_signals         text[],
  requires_consultation boolean DEFAULT false,
  requires_patch_test   boolean DEFAULT false,
  requires_screening    boolean DEFAULT false,
  is_medical_gated      boolean DEFAULT false,
  min_frequency_weeks   integer,          -- null = no restriction
  frequency_hard_block  boolean DEFAULT false,
  complementary_ids     text[],           -- ["s-011", "s-012"]
  package_ids           text[],           -- ["pkg-001"]
  steps                 jsonb,            -- [{n, label, desc, duration}]
  service_reviews       jsonb,            -- [{name, rating, date, text, verified}]
  faq                   jsonb,            -- [{q, a}]
  active                boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

-- ─── PACKAGES ─────────────────────────────────────────────────────────────────
CREATE TABLE packages (
  id                  text PRIMARY KEY,  -- "pkg-001"
  title               text NOT NULL,
  service_ids         text[],
  cat                 text,
  tag                 text,
  description         text,
  session_count       integer,
  rebook_weeks        integer,           -- weeks between sessions
  price_per_session   numeric(8,2),
  total_price         numeric(8,2),
  single_price        numeric(8,2),
  savings_pct         integer,
  savings_amount      numeric(8,2),
  currency            text DEFAULT 'AED',
  validity            text,
  includes            text[],
  requires_consultation boolean DEFAULT false,
  sessions            jsonb,             -- [{sessionNumber, label, desc}]
  active              boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- ─── CLIENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text UNIQUE,
  phone         text UNIQUE,
  tier          text DEFAULT 'STANDARD',  -- STANDARD | PREFERRED | GOLD | VIP | DIAMOND
  auth_user_id  uuid UNIQUE,              -- links to Supabase auth.users (prototype: nullable)
  preferences   text,
  skin_notes    text,
  allergies     text[],
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ─── TIME SLOTS ───────────────────────────────────────────────────────────────
CREATE TABLE time_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   text REFERENCES branches(id) ON DELETE CASCADE,
  service_id  text REFERENCES services(id) ON DELETE CASCADE,
  artist_id   text REFERENCES artists(id),
  start_time  timestamptz NOT NULL,
  end_time    timestamptz NOT NULL,
  status      text DEFAULT 'available'
                CHECK (status IN ('available', 'booked', 'blocked')),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_time_slots_branch_service_date
  ON time_slots (branch_id, service_id, DATE(start_time));
CREATE INDEX idx_time_slots_status ON time_slots (status);

-- ─── BOOKINGS ─────────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id                  text PRIMARY KEY,    -- "BRZ-2026-NNNNN" or "CON-YYYYMMDD-XXXX"
  client_id           uuid REFERENCES clients(id) NULL,
  visitor_name        text,
  visitor_contact     text,
  service_id          text REFERENCES services(id),
  branch_id           text REFERENCES branches(id),
  slot_id             uuid REFERENCES time_slots(id),
  artist_id           text REFERENCES artists(id) NULL,
  status              text DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed','modified','cancelled','pending_payment','completed')),
  notes               text,
  booking_type        text DEFAULT 'single'
                        CHECK (booking_type IN ('single','consultation','package_first_session')),
  payment_type        text DEFAULT 'full_upfront'
                        CHECK (payment_type IN ('full_upfront','deposit','package','free')),
  deposit_amount_aed  numeric(8,2) DEFAULT 0,
  balance_due_aed     numeric(8,2) DEFAULT 0,
  payment_status      text DEFAULT 'unpaid'
                        CHECK (payment_status IN ('unpaid','link_sent','deposit_paid','paid')),
  payment_link        text,
  screening_ref       text,
  clearance_ref       text,
  consent_status      text DEFAULT 'not_required'
                        CHECK (consent_status IN ('not_required','pending','signed')),
  channel             text CHECK (channel IN ('web','whatsapp')),
  booking_source      text DEFAULT 'ai_concierge',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_bookings_client ON bookings(client_id);
CREATE INDEX idx_bookings_status ON bookings(status);

-- ─── SPMU CLEARANCES ──────────────────────────────────────────────────────────
CREATE TABLE spmu_clearances (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid REFERENCES clients(id) NULL,
  visitor_contact         text,
  service_category        text NOT NULL,   -- "spmu_brow" | "spmu_lip" | "spmu_eyeliner"
  consultation_booking_id text REFERENCES bookings(id) NULL,
  patch_test_done         boolean DEFAULT false,
  patch_test_cleared      boolean DEFAULT false,
  cleared_at              timestamptz,
  valid_until             timestamptz,     -- cleared_at + 6 months
  created_at              timestamptz DEFAULT now()
);

-- ─── MEDICAL SCREENINGS ───────────────────────────────────────────────────────
CREATE TABLE medical_screenings (
  id                text PRIMARY KEY,      -- "SCR-2026-NNNN"
  client_id         uuid REFERENCES clients(id) NULL,
  visitor_name      text,
  visitor_contact   text,
  service_category  text NOT NULL,         -- "injectable" | "laser" | "medical_facial" | "energy_device"
  answers           jsonb NOT NULL,
  flagged_questions text[] DEFAULT '{}',
  status            text DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','APPROVED','FLAGGED','EXPIRED','DECLINED','NEEDS_INFO')),
  reviewed_by       text,
  reviewed_at       timestamptz,
  approved_until    timestamptz,           -- reviewed_at + 90 days
  reviewer_note     text,
  created_at        timestamptz DEFAULT now()
);

-- ─── CONSULTATION REQUESTS ────────────────────────────────────────────────────
CREATE TABLE consultation_requests (
  id                  text PRIMARY KEY,    -- "CON-YYYYMMDD-XXXX"
  client_id           uuid REFERENCES clients(id) NULL,
  visitor_name        text,
  visitor_contact     text,
  service_id          text REFERENCES services(id),
  service_category    text,
  branch_id           text REFERENCES branches(id),
  slot_id             uuid REFERENCES time_slots(id) NULL,
  status              text DEFAULT 'booked'
                        CHECK (status IN ('booked','completed','no_show','cancelled')),
  patch_test_done     boolean DEFAULT false,
  patch_test_cleared  boolean DEFAULT false,
  clearance_valid_until timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- ─── SESSIONS (agent memory) ──────────────────────────────────────────────────
CREATE TABLE sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel               text CHECK (channel IN ('web','whatsapp')),
  user_tier             text CHECK (user_tier IN ('visitor','client')),
  client_id             uuid REFERENCES clients(id) NULL,
  whatsapp_number       text,
  conversation_history  jsonb DEFAULT '[]',
  screening_state       jsonb,             -- active screening Q&A state
  last_intent           text,
  last_booking_ref      text,
  status                text DEFAULT 'active'
                          CHECK (status IN ('active','escalated','closed')),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_sessions_whatsapp ON sessions(whatsapp_number);
CREATE INDEX idx_sessions_client ON sessions(client_id);

-- ─── AGENT LOGS ───────────────────────────────────────────────────────────────
CREATE TABLE agent_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid REFERENCES sessions(id),
  turn                integer,
  channel             text,
  user_message        text,
  intent              text,
  confidence          numeric(4,3),
  entities_extracted  jsonb,
  tool_called         text,
  tool_result         jsonb,
  agent_response      text,
  latency_ms          integer,
  escalated           boolean DEFAULT false,
  timestamp           timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_logs_session ON agent_logs(session_id);

-- ─── SCREENING QUESTIONS (static config) ──────────────────────────────────────
CREATE TABLE screening_questions (
  id              text PRIMARY KEY,    -- "q1" – "q7"
  question        text NOT NULL,
  type            text DEFAULT 'yesno',
  has_follow_up   boolean DEFAULT false,
  follow_up_placeholder text,
  blocks_if_yes   boolean DEFAULT false,
  review_if_yes   boolean DEFAULT false,
  caution_if_yes  boolean DEFAULT false,
  sort_order      integer
);

-- ─── FAQs (with pgvector for semantic search) ─────────────────────────────────
CREATE TABLE faqs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question    text NOT NULL,
  answer      text NOT NULL,
  category    text,                    -- "pricing" | "booking" | "aftercare" | "services" | "policy" | "medical"
  embedding   vector(1536),            -- text-embedding-3-small dimension
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX ON faqs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- ─── PRODUCTS (read-only reference, not used by agent — for completeness) ─────
CREATE TABLE products (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  brand       text,
  price_aed   numeric(8,2),
  currency    text DEFAULT 'AED',
  cat         text,
  tag         text,
  description text,
  stock       integer DEFAULT 0,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

---

## Section 3 — Seed Branches

```sql
INSERT INTO branches (id, name, city, address, phone, hours, categories, status) VALUES
(
  'br-dxb', 'Browz 1', 'Umm Suqeim',
  'Al Wasl Road, Opposite ENOC Petrol Station, Umm Suqeim 3, Dubai, UAE',
  '600 564 668',
  '{"Sun":"9:00 AM–9:00 PM","Mon":"9:00 AM–9:00 PM","Tue":"9:00 AM–9:00 PM","Wed":"9:00 AM–9:00 PM","Thu":"9:00 AM–9:00 PM","Fri":"9:00 AM–9:00 PM","Sat":"9:00 AM–9:00 PM"}',
  ARRAY['Facials','Brows, Lips & Lashes','Advanced Skin','SPMU','Grooming'],
  'busy'
),
(
  'br-dxb-clinic', 'Browz 2', 'Umm Suqeim',
  'Al Wasl Road, Opposite ENOC Petrol Station, Umm Suqeim 3, Dubai, UAE',
  '600 564 668',
  '{"Sun":"9:00 AM–9:00 PM","Mon":"9:00 AM–9:00 PM","Tue":"9:00 AM–9:00 PM","Wed":"9:00 AM–9:00 PM","Thu":"9:00 AM–9:00 PM","Fri":"9:00 AM–9:00 PM","Sat":"9:00 AM–9:00 PM"}',
  ARRAY['Facials','Brows, Lips & Lashes','Advanced Skin','Medical','SPMU'],
  'open'
),
(
  'br-auh', 'Browz AD', 'Saadiyat Island',
  'Jumeirah Saadiyat Hotel Spa, Abu Dhabi, UAE',
  '600 564 668',
  '{"Sun":"9:00 AM–9:00 PM","Mon":"9:00 AM–9:00 PM","Tue":"9:00 AM–9:00 PM","Wed":"9:00 AM–9:00 PM","Thu":"9:00 AM–9:00 PM","Fri":"9:00 AM–9:00 PM","Sat":"9:00 AM–9:00 PM"}',
  ARRAY['Facials','Brows, Lips & Lashes','Advanced Skin','Medical','SPMU'],
  'open'
);
```

---

## Section 4 — Seed Artists (Practitioners)

```sql
INSERT INTO artists (id, name, role, title, branch_id, bio, specialities, qualifications, years_exp, avg_rating, review_count, service_ids, active) VALUES
(
  'pr-mia', 'Dr Zack Ally',
  'Global Trainer & Medical Director at BROWZ',
  'Global Trainer & Medical Director at BROWZ',
  'br-dxb',
  'Dr Zack Ally is Global Trainer and Medical Director at BROWZ, setting clinical standards and training across brows, lashes, and aesthetic medicine.',
  ARRAY['Medical Aesthetics','Brows, Lips & Lashes','SPMU'],
  ARRAY['DHA Licensed','Global Trainer'],
  4, 4.95, 142,
  ARRAY['s-900','s-001','s-011','s-012','s-015','s-004','s-021'],
  true
),
(
  'pr-noor', 'Dr Costas Papageorgiou',
  'Medical Director at Harrods',
  'Medical Director at Harrods',
  'br-dxb',
  'Dr Costas Papageorgiou brings world-class aesthetic medicine as Medical Director at Harrods, specialising in advanced skin and facial rejuvenation.',
  ARRAY['Advanced Skin','Facials','Medical Aesthetics'],
  ARRAY['DHA Licensed','Medical Director'],
  5, 4.90, 210,
  ARRAY['s-900','s-003','s-005','s-013','s-014','s-017','s-022'],
  true
),
(
  'pr-jade', 'Dr Richard Devine',
  'MBBS, MSc MRCGP',
  'MBBS, MSc MRCGP',
  'br-auh',
  'Dr Richard Devine practises with MBBS, MSc, and MRCGP credentials, delivering evidence-based medical aesthetics and energy-based skin treatments.',
  ARRAY['Medical Aesthetics','Advanced Skin','Injectables'],
  ARRAY['MBBS','MSc','MRCGP','DHA Licensed'],
  6, 4.88, 97,
  ARRAY['s-900','s-007','s-008','s-009'],
  true
),
(
  'pr-lara', 'Dr Irena Ivanovska',
  'Dermatologist and Trichologist',
  'Dermatologist and Trichologist',
  'br-auh',
  'Dr Irena Ivanovska is a dermatologist and trichologist focused on skin, hair, and scalp health within BROWZ medical aesthetics.',
  ARRAY['Medical Aesthetics','Advanced Skin','Dermatology'],
  ARRAY['Dermatologist','Trichologist','DHA Licensed'],
  8, 4.85, 156,
  ARRAY['s-900','s-007','s-008','s-009'],
  true
);
```

---

## Section 5 — Seed Services

> **Critical:** `service_tier`, `min_frequency_weeks`, and `frequency_hard_block` drive agent gating logic. Values below are authoritative — do not change without updating the spec.

### Service Tier Reference

| Tier | Category | Gate |
|---|---|---|
| T1 | Brows, Brows/Lips/Lashes, Facials, Advanced Skin (non-medical) | None — direct booking |
| T2 | SPMU | Free consultation + patch test (48h before) |
| T3 | Medical | Medical screening form + practitioner clearance (90 days) |

```sql
INSERT INTO services (
  id, title, cat, service_tier, city, duration_min, price_aed, currency,
  is_featured, tag, rating, review_count, description,
  sessions_info, maintenance, requires_consultation, requires_patch_test,
  requires_screening, is_medical_gated, min_frequency_weeks, frequency_hard_block,
  complementary_ids, package_ids, active
) VALUES

-- ── CONSULTATION (T1 — free, no gate) ──────────────────────────────────────
('s-900', 'Aesthetic Face and Skin Consultation', 'Advanced Skin', 'T1',
 'Dubai · Abu Dhabi', 30, 0, 'AED',
 true, 'Start here', 4.92, 164,
 'A complimentary consultation for face and skin concerns. Meet a BROWZ specialist, understand suitability, and leave with a clear treatment direction before you commit.',
 '1 session', 'As needed', false, false, false, false, null, false,
 ARRAY['s-001','s-003','s-007'], null, true),

-- ── BROWS (T1) ─────────────────────────────────────────────────────────────
('s-001', 'HD Brows', 'Brows', 'T1',
 'Dubai · Umm Suqeim', 60, 290, 'AED',
 true, 'Most popular', 4.95, 318,
 'HD Brows are the easiest way to structure and revamp your look. Our therapist designs the perfect shape, then applies tint to fill in the gaps of hair and achieve your desired look.',
 '1 session', 'Every 4–6 weeks', false, false, false, false, null, false,
 ARRAY['s-011','s-012','s-015'], null, true),

('s-011', 'Brow Lamination', 'Brows, Lips & Lashes', 'T1',
 'Dubai · Umm Suqeim', 60, 440, 'AED',
 false, null, 4.87, 203,
 'Brow lamination is a technique for making your brows look uniformly fuller and thicker for an extended period of time.',
 '1 session', 'Every 6–8 weeks', false, false, false, false, 6, false,
 ARRAY['s-001','s-012','s-002'], null, true),

-- ── LASHES (T1) ────────────────────────────────────────────────────────────
('s-015', 'Lash Lift', 'Brows, Lips & Lashes', 'T1',
 'Dubai · Umm Suqeim', 60, 495, 'AED',
 false, null, 4.88, 178,
 'Lash Lift is a revolutionary beauty treatment specifically designed to create a dramatic eye-opening look.',
 '1 session', 'Every 6–8 weeks', false, false, false, false, 6, false,
 ARRAY['s-002','s-016','s-001'], null, true),

('s-002', 'Lash Extension', 'Brows, Lips & Lashes', 'T1',
 'Dubai · Umm Suqeim', 90, 550, 'AED',
 false, null, 4.83, 142,
 'Premium individual lash extensions applied strand by strand for a natural to dramatic finish.',
 '1 session', 'Every 2–3 weeks (infill)', false, false, false, false, null, false,
 ARRAY['s-015','s-016','s-001'], null, true),

('s-016', 'Lash Tint', 'Brows, Lips & Lashes', 'T1',
 'Dubai · Umm Suqeim', 30, 180, 'AED',
 false, null, 4.80, 89,
 'A professional lash tint to darken and define natural lashes without mascara.',
 '1 session', 'Every 4–6 weeks', false, false, false, false, null, false,
 ARRAY['s-015','s-002','s-001'], null, true),

-- ── FACIALS (T1) ───────────────────────────────────────────────────────────
('s-003', 'HydraFacial', 'Advanced Skin', 'T1',
 'Dubai · Umm Suqeim', 60, 595, 'AED',
 true, 'Most popular', 4.90, 241,
 'HydraFacial is the only hydradermabrasion procedure that combines cleansing, exfoliation, extraction, hydration and antioxidant protection simultaneously.',
 '1 session', 'Monthly', false, false, false, false, 4, false,
 ARRAY['s-013','s-006','s-017'], ARRAY['pkg-003'], true),

('s-006', 'LED Light Therapy', 'Facials', 'T1',
 'Dubai · Umm Suqeim', 30, 250, 'AED',
 false, null, 4.75, 67,
 'Clinical-grade LED light therapy targeting acne, inflammation, and skin renewal using precise red and near-infrared wavelengths.',
 '1 session', 'Weekly or as course', false, false, false, false, null, false,
 ARRAY['s-003','s-013','s-017'], null, true),

('s-017', 'Collagen Boost Facial', 'Facials', 'T1',
 'Dubai · Umm Suqeim', 60, 550, 'AED',
 false, null, 4.82, 93,
 'A results-driven facial combining collagen-stimulating actives with targeted massage and biocellulose masking for immediate plumpness and radiance.',
 '1 session', 'Monthly', false, false, false, false, null, false,
 ARRAY['s-003','s-013','s-006'], null, true),

-- ── ADVANCED SKIN (T1) ────────────────────────────────────────────────────
('s-013', 'CO2 Lift', 'Advanced Skin', 'T1',
 'Dubai · Umm Suqeim', 45, 650, 'AED',
 false, null, 4.85, 104,
 'CO2 Lift is a professional carboxytherapy treatment that dissolves CO2 into the skin to trigger an oxygen-delivery response, instantly brightening, firming and improving skin texture.',
 '1 session', 'Every 2–4 weeks', false, false, false, false, null, false,
 ARRAY['s-003','s-017','s-006'], null, true),

('s-014', 'Pico Laser', 'Advanced Skin', 'T1',
 'Dubai · Umm Suqeim', 45, 1200, 'AED',
 false, null, 4.88, 71,
 'Pico laser delivers ultra-short pulses to break down pigmentation, tattoos, and stimulate collagen without thermal damage.',
 '3–6 sessions', 'Every 4–6 weeks', false, false, false, false, 4, false,
 ARRAY['s-009','s-005','s-014'], null, true),

('s-019', 'Dermaplaning', 'Advanced Skin', 'T1',
 'Dubai · Umm Suqeim', 45, 450, 'AED',
 false, null, 4.78, 62,
 'A physical exfoliation technique that uses a sterile surgical blade to remove dead skin cells and vellus hair, leaving skin instantly smoother.',
 '1 session', 'Every 4–6 weeks', false, false, false, false, null, false,
 ARRAY['s-003','s-013','s-017'], null, true),

('s-022', 'Microneedling', 'Advanced Skin', 'T1',
 'Dubai · Abu Dhabi', 60, 900, 'AED',
 false, null, 4.84, 78,
 'Medical-grade microneedling using the DermaPen to create controlled micro-injuries that trigger natural collagen and elastin production.',
 '3 sessions', 'Every 4–6 weeks', false, false, false, false, 4, false,
 ARRAY['s-007','s-010','s-008'], null, true),

('s-023', 'Chemical Peel', 'Advanced Skin', 'T1',
 'Dubai · Abu Dhabi', 45, 650, 'AED',
 false, null, 4.81, 84,
 'A precisely formulated chemical peel that removes the outer layer of skin to reveal fresher, brighter skin beneath. Strength is customised to your skin type and goals.',
 '1 session', 'Every 4–6 weeks', false, false, false, false, 4, false,
 ARRAY['s-003','s-019','s-013'], ARRAY['pkg-004'], true),

('s-005', 'Mesotherapy', 'Advanced Skin', 'T1',
 'Abu Dhabi · Saadiyat Island', 60, 750, 'AED',
 false, null, 4.79, 94,
 'Mesotherapy is a non-surgical treatment that uses tiny injections to deliver vitamins, peptides, hyaluronic acid, and plant extracts into the skin.',
 'Course of 4–6', 'Every 3–6 months', false, false, false, false, null, false,
 ARRAY['s-009','s-008','s-014'], null, true),

-- ── SPMU — T2 (consultation + patch test required) ─────────────────────────
('s-012', 'Microblading', 'SPMU', 'T2',
 'Dubai · Umm Suqeim', 120, 1800, 'AED',
 true, 'Best for sparse brows', 4.92, 168,
 'Microblading is a form of semi-permanent makeup using a fine blade to deposit pigment in hair-like strokes, creating realistic brow hairs.',
 '1 session + touch-up', 'Every 12–18 months', true, true, false, false, 42, false,
 ARRAY['s-004','s-021','s-001'], ARRAY['pkg-001'], true),

('s-004', 'Lip Blush', 'SPMU', 'T2',
 'Dubai · Umm Suqeim', 120, 2200, 'AED',
 true, 'Most popular', 4.94, 201,
 'Lip blush is a semi-permanent makeup treatment that enhances the natural colour, shape and definition of the lips using a cosmetic tattoo technique.',
 '1 session + 6-week perfector', 'Every 18–24 months', true, true, false, false, 42, false,
 ARRAY['s-001','s-011','s-021'], ARRAY['pkg-002'], true),

('s-021', 'Eyeliner SPMU', 'SPMU', 'T2',
 'Dubai · Umm Suqeim', 90, 1600, 'AED',
 false, null, 4.88, 112,
 'Semi-permanent eyeliner that defines and enhances the eyes with natural to dramatic results that last years.',
 '1 session + touch-up', 'Every 18 months', true, true, false, false, 42, false,
 ARRAY['s-004','s-001','s-012'], null, true),

-- ── MEDICAL — T3 (screening + medical clearance required) ──────────────────
('s-007', 'Profhilo', 'Medical', 'T3',
 'Abu Dhabi · Saadiyat Island', 30, 6000, 'AED',
 false, null, 4.91, 96,
 'Profhilo is an advanced anti-ageing treatment that rejuvenates the skin from within by boosting hydration and stimulating collagen and elastin production.',
 '2 sessions', 'Every 6 months', false, false, true, true, 24, false,
 ARRAY['s-008','s-010','s-022'], null, true),

('s-008', 'Morpheus8', 'Medical', 'T3',
 'Abu Dhabi · Saadiyat Island', 60, 3500, 'AED',
 false, 'Premium', 4.86, 72,
 'Morpheus8 merges microneedling with radiofrequency energy to remodel and rejuvenate the skin from deep within.',
 '1–3 sessions', 'Annual', false, false, true, true, 12, false,
 ARRAY['s-007','s-009','s-005'], null, true),

('s-009', 'Sofwave', 'Medical', 'T3',
 'Abu Dhabi · Saadiyat Island', 60, 10000, 'AED',
 false, 'Gold standard', 4.93, 38,
 'Sofwave uses ultrasound technology to emit sound waves that generate heat at exactly 1.5 mm — the ideal depth to treat wrinkles in the dermis.',
 '1 session', 'Annual', false, false, true, true, 52, false,
 ARRAY['s-008','s-005','s-014'], null, true);
```

---

## Section 6 — Seed Packages

```sql
INSERT INTO packages (
  id, title, service_ids, cat, tag, description,
  session_count, rebook_weeks, price_per_session, total_price, single_price,
  savings_pct, savings_amount, currency, validity, includes,
  requires_consultation, sessions, active
) VALUES
(
  'pkg-001', 'Brow SPMU Signature Package',
  ARRAY['s-012'], 'SPMU', 'Best Value',
  'Complete brow transformation across three visits — initial procedure, 4-week colour boost, and 8-week refinement.',
  3, 4, 1620, 4860, 5400, 10, 540, 'AED',
  '12 months from first session',
  ARRAY['3 SPMU sessions with the same artist','Aftercare kit (post-procedure balm)','Priority rebooking for touch-up sessions','Artist-led brow design and pigment planning at your first session'],
  false,
  '[{"sessionNumber":1,"label":"Initial procedure","desc":"Full brow design, pigment selection, and application — 2 hours."},{"sessionNumber":2,"label":"4-week colour boost","desc":"Pigment top-up as colour settles — 90 min."},{"sessionNumber":3,"label":"8-week refinement","desc":"Final shape and colour calibration — 60 min."}]',
  true
),
(
  'pkg-002', 'Lip Blush SPMU Package',
  ARRAY['s-004'], 'SPMU', 'Most Popular',
  'Natural lip colour enhancement in two sessions — initial application and 6-week perfector.',
  2, 6, 1275, 2550, 2900, 12, 350, 'AED',
  '10 months from first session',
  ARRAY['Free consultation + patch test','2 Lip Blush sessions with dedicated artist','Aftercare lip balm kit'],
  true,
  '[{"sessionNumber":1,"label":"Initial lip blush","desc":"Colour mapping, pigment selection, full application — 2 hours."},{"sessionNumber":2,"label":"6-week perfector","desc":"Colour refresh and detail refinement — 60 min."}]',
  true
),
(
  'pkg-003', 'HydraFacial Skin Series',
  ARRAY['s-003'], 'Advanced Skin', 'Best Value',
  'Five HydraFacial sessions spaced 4 weeks apart — the full transformation course for visible, lasting skin clarity.',
  5, 4, 440, 2200, 2475, 11, 275, 'AED',
  '8 months from first session',
  ARRAY['5 × HydraFacial sessions','Complimentary skin analysis at session 1','Personalised skincare advice after each session'],
  false,
  '[{"sessionNumber":1,"label":"Baseline cleanse","desc":"Deep clean and hydration reset."},{"sessionNumber":2,"label":"Extraction & brightening","desc":"Targeted extraction + vitamin C infusion."},{"sessionNumber":3,"label":"Peptide boost","desc":"Anti-ageing peptide serum infusion."},{"sessionNumber":4,"label":"Radiance session","desc":"LED light therapy add-on."},{"sessionNumber":5,"label":"Maintenance & review","desc":"Final results assessment + maintenance plan."}]',
  true
),
(
  'pkg-004', 'Chemical Peel Transformation Series',
  ARRAY['s-023'], 'Advanced Skin', null,
  'Three-peel course designed for progressive skin renewal. Each peel builds on the last.',
  3, 4, 550, 1650, 1980, 17, 330, 'AED',
  '9 months from first session',
  ARRAY['3 × Chemical Peel sessions','Pre-peel skin prep advice','Aftercare recovery kit included'],
  false,
  '[{"sessionNumber":1,"label":"Superficial peel","desc":"Mild resurfacing to prep skin."},{"sessionNumber":2,"label":"Medium peel","desc":"Deeper exfoliation targeting pigmentation."},{"sessionNumber":3,"label":"Deep renewal peel","desc":"Full skin renewal with recovery plan."}]',
  true
);
```

---

## Section 7 — Seed Screening Questions

```sql
INSERT INTO screening_questions (id, question, type, has_follow_up, follow_up_placeholder, blocks_if_yes, review_if_yes, caution_if_yes, sort_order) VALUES
('q1', 'Are you currently pregnant or breastfeeding?', 'yesno', false, null, false, true, false, 1),
('q2', 'Are you taking any prescription medications?', 'yesno', true, 'Please list your medications…', false, false, true, 2),
('q3', 'Do you have known allergies to anaesthetics, lidocaine, or hyaluronic acid?', 'yesno', true, 'Describe the allergy and reaction…', false, true, false, 3),
('q4', 'Have you ever had an adverse reaction to an aesthetic or cosmetic treatment?', 'yesno', true, 'Describe what happened and when…', false, true, false, 4),
('q5', 'Do you have an autoimmune condition or are you taking blood-thinners or anticoagulants?', 'yesno', false, null, false, true, false, 5),
('q6', 'Are you currently using prescription acne treatment (e.g. Roaccutane / isotretinoin)?', 'yesno', false, null, false, true, false, 6),
('q7', 'Do you have an active skin infection, cold sore, or open wounds in the treatment area?', 'yesno', false, null, true, false, false, 7);
```

---

## Section 8 — Seed FAQ Records

> These records need embeddings generated (Section 11). Insert the text now; embeddings are added in the TypeScript step.

```sql
INSERT INTO faqs (question, answer, category) VALUES

-- Pricing
('How much does HD Brows cost?', 'HD Brows is AED 290 per session. It includes brow tinting, waxing, threading, tweezing and trimming — all tailored to your face shape.', 'pricing'),
('How much does Brow Lamination cost?', 'Brow Lamination is AED 440 per session. Results typically last 6–8 weeks.', 'pricing'),
('How much does Lip Blush SPMU cost?', 'Lip Blush is AED 2,200 per session. A consultation and patch test are required before your first session. We also offer a package of 2 sessions for AED 2,550.', 'pricing'),
('How much does Microblading cost?', 'Microblading is AED 1,800 per session. A consultation and patch test are required first. Our SPMU Signature Package covers 3 sessions for AED 4,860.', 'pricing'),
('How much is a HydraFacial?', 'HydraFacial is AED 595 per session. We also offer a 5-session skin series package for AED 2,200 (a saving of AED 275).', 'pricing'),
('How much does Profhilo cost?', 'Profhilo is AED 6,000 per treatment. Two sessions are recommended, 4 weeks apart. Medical consultation and screening are required before booking.', 'pricing'),
('How much does Morpheus8 cost?', 'Morpheus8 is AED 3,500 per session. Medical consultation and screening are required before treatment.', 'pricing'),
('How much does Sofwave cost?', 'Sofwave is AED 10,000 per session. It requires medical consultation and screening. Results are visible from one session and improve over 3 months.', 'pricing'),
('Do you offer any packages or deals?', 'Yes — we offer four packages: Brow SPMU Signature (3 sessions, AED 4,860), Lip Blush Package (2 sessions, AED 2,550), HydraFacial Skin Series (5 sessions, AED 2,200), and Chemical Peel Series (3 sessions, AED 1,650).', 'pricing'),
('What currency do you charge in?', 'All prices are in AED (United Arab Emirates Dirhams).', 'pricing'),

-- Booking policy
('How do I book an appointment?', 'You can book directly through this chat or visit our website. Just tell me the treatment you are interested in, your preferred branch, and a date and time that works for you.', 'booking'),
('Can I book without an account?', 'Yes — visitors can book without an account. We will collect your name and contact number during the booking process.', 'booking'),
('Can I modify or cancel my booking?', 'Authenticated clients can modify or cancel bookings through this chat. Visitors should contact our reception team directly on 600 564 668.', 'booking'),
('How far in advance can I book?', 'You can book up to 3 months in advance for standard treatments and up to 6 months for SPMU and medical treatments.', 'booking'),
('What is your cancellation policy?', 'We ask for at least 24 hours notice for cancellations or rescheduling. Late cancellations may incur a fee.', 'policy'),
('What payment methods do you accept?', 'We accept all major credit and debit cards, Apple Pay, and cash at the branch. For online bookings, a secure payment link is sent after confirming your appointment.', 'booking'),
('Do I need to pay a deposit?', 'For services priced AED 1,000 and below, full payment is required at booking. For services over AED 1,000, a 20% deposit secures your slot and the balance is payable at the branch. Packages are paid in full upfront.', 'booking'),

-- Locations & hours
('Where are your branches located?', 'We have three locations: Browz 1 and Browz 2 in Umm Suqeim, Dubai (Al Wasl Road, Opposite ENOC), and Browz AD on Saadiyat Island, Abu Dhabi (Jumeirah Saadiyat Hotel Spa). All branches are open 9:00 AM–9:00 PM, seven days a week.', 'locations'),
('What are your opening hours?', 'All branches are open Sunday to Saturday, 9:00 AM to 9:00 PM.', 'locations'),
('Do you have a branch in Abu Dhabi?', 'Yes — Browz AD is located at the Jumeirah Saadiyat Hotel Spa on Saadiyat Island, Abu Dhabi. Open 9:00 AM–9:00 PM, seven days a week.', 'locations'),
('What is your phone number?', 'You can reach all branches on 600 564 668.', 'locations'),

-- Medical gating
('Why do I need a consultation before SPMU?', 'SPMU treatments (like Microblading and Lip Blush) are semi-permanent and require a patch test at least 48 hours before your main appointment to check for any reactions. The free consultation covers brow design, pigment selection, and patch test — it takes about 30 minutes.', 'medical'),
('What happens at a medical screening?', 'For medical treatments, we collect a 7-question health screening to check for contraindications. Our medical team reviews your answers within 24 hours. Once cleared, your clearance is valid for 90 days.', 'medical'),
('Is a consultation free?', 'Yes — consultations for both SPMU and skin/medical treatments are complimentary. There is no payment required at the consultation.', 'medical'),
('Do I need a consultation for HD Brows?', 'No — HD Brows and other standard brow and lash treatments can be booked directly without a prior consultation.', 'medical'),
('What medical conditions prevent treatment?', 'This depends on the treatment. For medical and injectable treatments, contraindications include pregnancy, breastfeeding, active skin infections, recent surgery, and certain medications. We assess this during a health screening. Please let us know your specific treatment and we can advise.', 'medical'),

-- Aftercare
('What is the aftercare for brow lamination?', 'Avoid water on the brow area for 24 hours. No makeup or skincare on the brows for 12 hours. Avoid rubbing or touching the brows during this period.', 'aftercare'),
('What is the aftercare for SPMU treatments?', 'Keep the area clean and dry for 7–10 days. Apply the provided healing balm as directed. Avoid sun, steam, and swimming during healing. A touch-up session is included 6–8 weeks after your initial treatment.', 'aftercare'),
('What is the aftercare for Profhilo or injectables?', 'Avoid strenuous exercise for 24 hours. Do not touch or massage the treated area. Mild swelling and bruising is normal and resolves within 48–72 hours. Avoid alcohol for 24 hours after treatment.', 'aftercare'),
('What is the aftercare for a chemical peel?', 'Apply SPF 50 immediately after and daily for 2 weeks. Avoid heat, saunas, and sun exposure for 5–7 days. Use a gentle, fragrance-free moisturiser only. Avoid exfoliating products for 2 weeks.', 'aftercare'),
('Can I wear makeup after brow treatment?', 'After standard brow treatments (threading, tinting, waxing), avoid makeup on the brow area for 12 hours. After SPMU, the area must be kept dry and makeup-free for 7–10 days.', 'aftercare'),

-- Treatment suitability
('Is brow lamination suitable for sensitive skin?', 'Brow lamination uses a gentle sculpting formula suitable for most skin types. If you have highly sensitive skin or a history of reactions to perming solutions, we recommend a patch test and a brief consultation first.', 'services'),
('How long does a lash lift last?', 'A lash lift typically lasts 6–8 weeks, depending on your natural lash growth cycle and aftercare.', 'services'),
('How long do SPMU results last?', 'SPMU results typically last 1–3 years depending on the treatment, skin type, and lifestyle. A touch-up is recommended every 12–18 months to maintain the result.', 'services'),
('What is the difference between microblading and SPMU?', 'Microblading uses a hand tool with a fine blade to create hair-stroke patterns. It is a form of SPMU. Other SPMU techniques (like powder brows or nano brows) use a machine. Both are semi-permanent and require a consultation first.', 'services'),
('Who performs the medical treatments?', 'All medical and injectable treatments are performed by DHA-licensed medical practitioners: Dr Richard Devine (MBBS, MSc, MRCGP) and Dr Irena Ivanovska (Dermatologist and Trichologist), both based at our Abu Dhabi branch.', 'services'),
('How many sessions of Profhilo do I need?', 'Two sessions, 4 weeks apart, are recommended for the initial course. Maintenance sessions every 6 months keep the results.', 'services');
```

---

## Section 9 — Seed Demo Clients

These records are required to run all 25 agent test scenarios. Seed before running any demo.

```sql
-- Demo client 1: Sara Al Mansoori (VIP — used for general client flows)
INSERT INTO clients (id, name, email, phone, tier, preferences, skin_notes, allergies)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  'Sara Al Mansoori',
  'sara@demo.browz.ae',
  '+971501234567',
  'VIP',
  'Prefers Dr Zack Ally. Moderate pressure. Quiet during treatment.',
  'Sensitive skin around brow area. Prefers lighter tint shade.',
  null
);

-- Demo client 2: Layla Hassan (GOLD — has SPMU clearance on file for SC-13 gate bypass)
INSERT INTO clients (id, name, email, phone, tier, preferences)
VALUES (
  '11111111-0000-0000-0000-000000000002',
  'Layla Hassan',
  'layla@demo.browz.ae',
  '+971564412290',
  'GOLD',
  'Prefers female practitioners.'
);

-- Demo client 3: Jules Tessier (VIP — has medical clearance on file for SC-16 T3 gate bypass)
INSERT INTO clients (id, name, email, phone, tier, preferences, allergies)
VALUES (
  '11111111-0000-0000-0000-000000000003',
  'Jules Tessier',
  'jules@demo.browz.ae',
  '+971508841212',
  'VIP',
  'Named practitioner Dr Richard Devine.',
  ARRAY['Lidocaine — confirmed allergy. Use alternative anaesthetic.']
);

-- Demo client 4: Maya Khoury (GOLD — has recent brow lamination for SC-20 frequency soft warn)
INSERT INTO clients (id, name, email, phone, tier)
VALUES (
  '11111111-0000-0000-0000-000000000004',
  'Maya Khoury',
  'maya@demo.browz.ae',
  '+971504123344',
  'GOLD'
);

-- Demo client 5: Reema Al Rashid (VIP — has recent injectables for SC-21 hard block)
-- Note: injectables = Profhilo (s-007) or Morpheus8 (s-008); use Profhilo for demo
INSERT INTO clients (id, name, email, phone, tier)
VALUES (
  '11111111-0000-0000-0000-000000000005',
  'Reema Al Rashid',
  'reema@demo.browz.ae',
  '+971552209011',
  'VIP'
);
```

---

## Section 10 — Seed Demo Clearances & Appointment History

### 10.1 SPMU Clearance (Client 2 — Layla Hassan) — For SC-13 gate bypass

```sql
-- Layla has a valid SPMU Lip Blush clearance on file
INSERT INTO spmu_clearances (
  client_id, service_category,
  patch_test_done, patch_test_cleared,
  cleared_at, valid_until
)
VALUES (
  '11111111-0000-0000-0000-000000000002',
  'spmu_lip',
  true, true,
  NOW() - INTERVAL '2 months',
  NOW() + INTERVAL '4 months'   -- valid_until = cleared_at + 6 months
);
```

### 10.2 Medical Clearance (Client 3 — Jules Tessier) — For SC-16 T3 gate bypass

```sql
-- Jules has an approved medical clearance for Profhilo (injectable category)
INSERT INTO medical_screenings (
  id, client_id,
  service_category,
  answers,
  flagged_questions,
  status,
  reviewed_by,
  reviewed_at,
  approved_until,
  reviewer_note
)
VALUES (
  'SCR-2026-DEMO1',
  '11111111-0000-0000-0000-000000000003',
  'injectable',
  '{"q1_pregnant":false,"q2_medications":false,"q3_allergies":true,"q3_detail":"Lidocaine allergy — alternative anaesthetic confirmed","q4_adverse_reaction":false,"q5_autoimmune":false,"q6_roaccutane":false,"q7_active_infection":false}',
  ARRAY['q3_allergies'],
  'APPROVED',
  'pr-jade',
  NOW() - INTERVAL '1 month',
  NOW() + INTERVAL '2 months',   -- approved_until = reviewed_at + 90 days
  'Approved. Lidocaine allergy flagged and noted — alternative anaesthetic required. All other criteria clear.'
);
```

### 10.3 Completed Appointment History — Frequency Checks

```sql
-- Client 4 (Maya Khoury): Brow Lamination completed 3 weeks ago
-- Used for SC-20: soft warn (min interval = 6 weeks, hard_block = false)
INSERT INTO bookings (
  id, client_id, service_id, branch_id,
  status, booking_type, payment_type,
  payment_status, channel, booking_source,
  created_at, updated_at
)
VALUES (
  'BRZ-2026-DEMO01',
  '11111111-0000-0000-0000-000000000004',
  's-011',        -- Brow Lamination
  'br-dxb',
  'completed',
  'single',
  'full_upfront',
  'paid',
  'web',
  'ai_concierge',
  NOW() - INTERVAL '3 weeks',
  NOW() - INTERVAL '3 weeks'
);

-- Client 5 (Reema Al Rashid): Profhilo (T3 Medical) completed 6 weeks ago
-- Used for SC-21: hard block (min interval = 24 weeks for Profhilo, hard_block = false but T3 has 12w medical block)
-- Note: For demo purposes Profhilo has min_frequency_weeks=24; 6 weeks ago triggers the block clearly.
INSERT INTO bookings (
  id, client_id, service_id, branch_id,
  status, booking_type, payment_type,
  payment_status, channel, booking_source,
  created_at, updated_at
)
VALUES (
  'BRZ-2026-DEMO02',
  '11111111-0000-0000-0000-000000000005',
  's-007',        -- Profhilo (Medical / T3)
  'br-auh',
  'completed',
  'single',
  'deposit',
  'paid',
  'whatsapp',
  'ai_concierge',
  NOW() - INTERVAL '6 weeks',
  NOW() - INTERVAL '6 weeks'
);
```

---

## Section 11 — Time Slot Generation

> **Run as a TypeScript script** (`seed/generateSlots.ts`). SQL-only slot generation would require a stored procedure for the date loop; the TypeScript approach is cleaner and easier to control.

Create `seed/generateSlots.ts` and run with `npx tsx seed/generateSlots.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// Slot times for each branch (UAE working day: 9am–9pm)
const SLOT_TIMES = [
  '09:00', '10:00', '10:30', '11:00', '11:30', '12:00',
  '13:00', '13:30', '14:00', '15:00', '15:30',
  '16:00', '17:00', '17:30', '18:00', '19:00'
];

// Which services each artist provides, at which branch
const ARTIST_BRANCH_SERVICES = [
  { artistId: 'pr-mia',  branchId: 'br-dxb',        serviceIds: ['s-001','s-011','s-015','s-002','s-016','s-012','s-004','s-021'] },
  { artistId: 'pr-noor', branchId: 'br-dxb-clinic',  serviceIds: ['s-003','s-006','s-013','s-014','s-017','s-019','s-022','s-023','s-005'] },
  { artistId: 'pr-jade', branchId: 'br-auh',          serviceIds: ['s-007','s-008','s-009'] },
  { artistId: 'pr-lara', branchId: 'br-auh',          serviceIds: ['s-007','s-008','s-009','s-005','s-022'] },
];

// Service durations in minutes (must match services table)
const SERVICE_DURATION: Record<string, number> = {
  's-001': 60, 's-002': 90, 's-003': 60, 's-004': 120, 's-005': 60,
  's-006': 30, 's-007': 30, 's-008': 60, 's-009': 60, 's-011': 60,
  's-012': 120,'s-013': 45, 's-014': 45, 's-015': 60, 's-016': 30,
  's-017': 60, 's-019': 45, 's-021': 90, 's-022': 60, 's-023': 45,
  's-900': 30,
};

function generateDates(daysAhead: number): string[] {
  const dates: string[] = [];
  const base = new Date();
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);  // YYYY-MM-DD
  }
  return dates;
}

async function main() {
  const dates = generateDates(14);  // next 14 days
  const slots: object[] = [];

  for (const { artistId, branchId, serviceIds } of ARTIST_BRANCH_SERVICES) {
    for (const serviceId of serviceIds) {
      const durationMin = SERVICE_DURATION[serviceId] ?? 60;
      for (const date of dates) {
        for (const time of SLOT_TIMES) {
          const start = new Date(`${date}T${time}:00+04:00`);  // UAE = UTC+4
          const end = new Date(start.getTime() + durationMin * 60000);

          // Only include if end time is before 21:00
          if (end.getHours() > 21 || (end.getHours() === 21 && end.getMinutes() > 0)) continue;

          slots.push({
            branch_id: branchId,
            service_id: serviceId,
            artist_id: artistId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            status: 'available',
          });
        }
      }
    }
  }

  // Insert in batches of 500
  for (let i = 0; i < slots.length; i += 500) {
    const batch = slots.slice(i, i + 500);
    const { error } = await supabase.from('time_slots').insert(batch);
    if (error) {
      console.error(`Batch ${i / 500} failed:`, error.message);
    } else {
      console.log(`Inserted batch ${i / 500 + 1} (${batch.length} slots)`);
    }
  }

  console.log(`Done. Total slots generated: ${slots.length}`);
}

main().catch(console.error);
```

Run: `npx tsx seed/generateSlots.ts`

---

## Section 12 — pgvector FAQ Embeddings

> **Run as a TypeScript script** (`seed/generateEmbeddings.ts`). This must run AFTER Section 8 FAQ records are inserted.

This script fetches all FAQ rows without embeddings, calls the Anthropic embeddings API (or OpenAI — see note), and updates the `embedding` column.

> **Important:** Use `text-embedding-3-small` (OpenAI, 1536 dims) OR Anthropic's embedding model. The `embedding vector(1536)` column dimension must match the model you choose. The FAQ lookup tool at runtime must use the same model. Whichever you pick, keep it consistent.

Create `seed/generateEmbeddings.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';  // or use @anthropic-ai/sdk with their embedding endpoint
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function main() {
  // Fetch all FAQs that don't yet have an embedding
  const { data: faqs, error } = await supabase
    .from('faqs')
    .select('id, question, answer')
    .is('embedding', null);

  if (error) throw new Error(error.message);
  if (!faqs || faqs.length === 0) {
    console.log('All FAQs already have embeddings.');
    return;
  }

  console.log(`Generating embeddings for ${faqs.length} FAQ records...`);

  for (const faq of faqs) {
    // Embed the question + answer together for richer semantic match
    const text = `${faq.question}\n${faq.answer}`;
    const embedding = await getEmbedding(text);

    const { error: updateError } = await supabase
      .from('faqs')
      .update({ embedding })
      .eq('id', faq.id);

    if (updateError) {
      console.error(`Failed to update FAQ ${faq.id}:`, updateError.message);
    } else {
      console.log(`Embedded: ${faq.question.slice(0, 60)}...`);
    }

    // Rate limit: 1 request per 100ms
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('All FAQ embeddings generated successfully.');
}

main().catch(console.error);
```

Run: `npx tsx seed/generateEmbeddings.ts`

---

## Section 13 — FAQ Vector Search Function

Create this SQL function in Supabase for the agent's `lookupFaq` tool to call:

```sql
CREATE OR REPLACE FUNCTION match_faqs (
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.72,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  question text,
  answer text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    faqs.id,
    faqs.question,
    faqs.answer,
    faqs.category,
    1 - (faqs.embedding <=> query_embedding) AS similarity
  FROM faqs
  WHERE 1 - (faqs.embedding <=> query_embedding) > match_threshold
  ORDER BY faqs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

The agent's `lookupFaq` tool calls this with:

```typescript
// In src/tools/faq.ts
const { data, error } = await supabase.rpc('match_faqs', {
  query_embedding: embedding,   // float[] from your embedding model
  match_threshold: 0.72,
  match_count: 1,
});
```

---

## Section 14 — Row Level Security (RLS) Settings

For the prototype, disable RLS on all tables and use the service role key (already configured in `.env` as `SUPABASE_KEY`). RLS will be enabled in the production build.

```sql
-- Disable RLS for all agent tables (prototype only)
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE artists DISABLE ROW LEVEL SECURITY;
ALTER TABLE services DISABLE ROW LEVEL SECURITY;
ALTER TABLE packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE spmu_clearances DISABLE ROW LEVEL SECURITY;
ALTER TABLE medical_screenings DISABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE screening_questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE faqs DISABLE ROW LEVEL SECURITY;
```

---

## Section 15 — Environment Variable for Default Branch

After seeding, set `DEFAULT_BRANCH_ID` in `.env` to `br-dxb` (Dubai Umm Suqeim) — the branch assigned when the user does not specify one.

```
DEFAULT_BRANCH_ID=br-dxb
```

---

## Section 16 — Seed Execution Order

Run in this exact order. Each step depends on the previous.

| Step | Location | Action |
|---|---|---|
| 1 | Supabase SQL editor | Section 1 — Enable extensions |
| 2 | Supabase SQL editor | Section 2 — Full schema |
| 3 | Supabase SQL editor | Section 3 — Seed branches |
| 4 | Supabase SQL editor | Section 4 — Seed artists |
| 5 | Supabase SQL editor | Section 5 — Seed services |
| 6 | Supabase SQL editor | Section 6 — Seed packages |
| 7 | Supabase SQL editor | Section 7 — Seed screening questions |
| 8 | Supabase SQL editor | Section 8 — Seed FAQ text records |
| 9 | Supabase SQL editor | Section 9 — Seed demo clients |
| 10 | Supabase SQL editor | Section 10 — Seed clearances + appointment history |
| 11 | Terminal | `npx tsx seed/generateSlots.ts` |
| 12 | Terminal | `npx tsx seed/generateEmbeddings.ts` |
| 13 | Supabase SQL editor | Section 13 — Create `match_faqs` function |
| 14 | Supabase SQL editor | Section 14 — Disable RLS |
| 15 | `.env` | Set `DEFAULT_BRANCH_ID=br-dxb` |

---

## Section 17 — Verification Queries

Run these after seeding to confirm everything is in place before starting agent development.

```sql
-- Branch and artist count
SELECT 'branches' as tbl, COUNT(*) FROM branches
UNION ALL SELECT 'artists', COUNT(*) FROM artists
UNION ALL SELECT 'services', COUNT(*) FROM services
UNION ALL SELECT 'packages', COUNT(*) FROM packages
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'time_slots', COUNT(*) FROM time_slots
UNION ALL SELECT 'faqs', COUNT(*) FROM faqs
UNION ALL SELECT 'screening_questions', COUNT(*) FROM screening_questions;

-- Confirm service tiers are correctly assigned
SELECT id, title, service_tier, min_frequency_weeks, frequency_hard_block, price_aed
FROM services
ORDER BY service_tier, cat;
-- Expected: s-900 to s-023 as T1, s-012/s-004/s-021 as T2, s-007/s-008/s-009 as T3

-- Confirm SPMU clearance for demo client 2 (Layla)
SELECT c.name, sc.service_category, sc.patch_test_cleared, sc.valid_until
FROM spmu_clearances sc
JOIN clients c ON c.id = sc.client_id
WHERE c.id = '11111111-0000-0000-0000-000000000002';

-- Confirm medical clearance for demo client 3 (Jules)
SELECT c.name, ms.service_category, ms.status, ms.approved_until
FROM medical_screenings ms
JOIN clients c ON c.id = ms.client_id
WHERE c.id = '11111111-0000-0000-0000-000000000003';

-- Confirm completed appointment history for frequency checks
SELECT c.name, b.service_id, b.status, b.created_at
FROM bookings b
JOIN clients c ON c.id = b.client_id
WHERE b.id IN ('BRZ-2026-DEMO01', 'BRZ-2026-DEMO02');

-- Confirm FAQ embeddings are populated
SELECT COUNT(*) AS faqs_with_embeddings FROM faqs WHERE embedding IS NOT NULL;
-- Expected: 36 (matches number of FAQ inserts in Section 8)

-- Sample vector search (replace the zeros with a real embedding for a live test)
-- SELECT question, answer, similarity FROM match_faqs('[0,0,...0]'::vector, 0.72, 3);
```

---

## Section 18 — Mapping: data.ts IDs → Supabase IDs

The original `data.ts` uses string IDs (e.g. `"s-001"`, `"br-dxb"`, `"pr-mia"`). The Supabase schema preserves these as `text PRIMARY KEY` on all reference tables so existing frontend code does not need ID remapping.

| data.ts field | Supabase table | Primary key type |
|---|---|---|
| `Service.id` (`"s-001"`) | `services.id` | `text` |
| `Branch.id` (`"br-dxb"`) | `branches.id` | `text` |
| `Practitioner.id` (`"pr-mia"`) | `artists.id` | `text` |
| `ServicePackage.id` (`"pkg-001"`) | `packages.id` | `text` |
| `Client` (new) | `clients.id` | `uuid` |
| `Booking.id` (`"BRZ-..."`) | `bookings.id` | `text` |
| `TimeSlot` (new) | `time_slots.id` | `uuid` |

Clients and time slots are new tables with no counterpart in `data.ts` — they are generated fresh by the seed scripts.

---

## Section 19 — What Is NOT in Supabase (Stays in TypeScript)

The following data from `data.ts` is UI-only or read-only reference data. It does not need to be in Supabase for the agent to function:

- `execRevenuePlan`, `execDailyRevenue`, `execCategoryBreakdown`, `execTodaySnapshot`, `execServiceRanking` — executive dashboard only
- `walkins` — receptionist console only
- `inbox`, `partner_orders`, `licenses` — UI mock data
- `appointments` (the `AppointmentRow` records in data.ts) — replaced by the real `bookings` table
- `complaints`, `cases`, `leads` — CRM / customer care surfaces; separate from agent scope
- `products` — e-commerce reference; not used by the booking agent
- `loyaltyPoints`, `loyaltyHistory`, `voucherCodes` — loyalty module; out of prototype scope
- `medicalRecords`, `consents`, `serviceNotes` — practitioner console; out of prototype scope
- `TIER_META`, `WALK_IN_STATUSES`, `tierThresholds` — UI display config; keep in TypeScript constants
