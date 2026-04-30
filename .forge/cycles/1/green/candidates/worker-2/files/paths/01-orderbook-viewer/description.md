# Orderbook Viewer

In this learning path you will build a real-time orderbook viewer for DeepBook v3 on Sui.

## What you will learn

- Query DeepBook v3 pools using the Sui TypeScript SDK
- Render live bid/ask spreads and order depth
- Subscribe to orderbook updates via Sui events
- Structure a production-grade DeFi data pipeline

## Prerequisites

- Basic Sui/Move knowledge (objects, transactions, PTBs)
- Familiarity with `sui client` and Move packages
- Node.js ≥ 18 and `pnpm` installed
- A funded Sui testnet address

## What you will build

A CLI tool that connects to a DeepBook v3 pool, fetches the current orderbook snapshot, and streams live updates as new orders arrive. By the end of this path you will have a reusable data-fetching foundation that any DeFi front-end can build on.

## Time estimate

Approximately 2–3 hours across three phases: environment setup, data querying, and live display.
