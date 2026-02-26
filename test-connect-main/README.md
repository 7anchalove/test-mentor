# Test Mentor

## Project setup

Requirements:

- Node.js 18+
- npm

Install and run:

```sh
npm install
npm run dev
```

Useful scripts:

- `npm run dev` — start local dev server
- `npm run build` — production build
- `npm run preview` — preview production build
- `npm run lint` — run ESLint
- `npm run test` — run Vitest

## Stack

- Vite
- React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase
- TanStack Query

## Supabase sessions migration

This app uses **bookings** (requests) and **sessions** (appointments).

Run in Supabase SQL Editor:

- `supabase/migrations/20260218_create_sessions.sql`

This migration adds:

- `public.sessions` table
- `session_status` enum
- uniqueness constraints/indexes for safe booking/session flows
