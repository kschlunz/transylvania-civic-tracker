# Civic Ledger — Transylvania County Commissioner Tracker

## Project Context
A non-partisan civic accountability tool tracking Transylvania County Board of Commissioners activity across meetings, votes, public statements, and follow-through on commitments. Built with Next.js, Tailwind, Supabase, and Anthropic API for AI-powered meeting minutes processing.

## Tech Stack
- Next.js (App Router) with TypeScript
- Tailwind CSS
- Supabase (Postgres DB + Auth)
- Anthropic API (Claude Sonnet) for meeting minutes processing
- Vercel hosting
- Recharts for data visualization

## Architecture
- src/app/ — pages and API routes
- src/components/ — reusable UI components
- src/lib/ — types, constants, Supabase client, data utilities
- src/data/ — seed data and config files
- scripts/ — one-off scripts for resyncing data

## Key Concepts
- Meetings are processed through /admin/intake by pasting raw minutes text
- Claude extracts commissioner activity, votes, follow-ups, staff activity, and topic threads
- Follow-ups track commitments made in meetings with open/resolved status and days-open counters
- Topic threads connect specific recurring items across multiple meetings
- Only one admin user (UUID locked) can write data, public site is read-only
- All data sourced from official county meeting minutes with source PDF links

## Design System
- Brand: "Civic Ledger" — editorial newspaper aesthetic
- Dark green header (#1C2B1F) with gold accent (#D4A843)
- Warm parchment background (#F5F2ED)
- Playfair Display for headings, clean serif editorial feel
- Top navigation only, no sidebar
- Non-partisan tone — present facts, no editorial scores or political spectrum ratings

## Commissioners
- Teresa McCall (Chair, since 2020)
- Larry Chapman (Vice-Chair, since 2010)
- Jason Chappell (Commissioner, since 2004)
- Jake Dalton (Commissioner, since 2020 — not running 2026)
- Chase McKelvey (Commissioner, since 2024 — not running 2026)

## When making changes
- Keep the non-partisan editorial tone in all UI copy
- All category tags should be clickable and navigate to topic detail pages
- Meeting data comes from Supabase, not local files
- Admin features are gated behind Supabase auth + UUID check
- Run npm run build before committing to catch TypeScript errors
- Push to main triggers auto-deploy on Vercel
