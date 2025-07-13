# AI Bot Blocker Tool

A Next.js web application that helps website owners check if their sites block AI crawlers and bots. This is a defensive security tool for understanding your website's protection against AI scraping.

## Features

- Upload CSV files containing website URLs
- Check multiple blocking mechanisms:
  - robots.txt analysis for AI bot blocks
  - HTTP status code testing with AI user agents
  - Content analysis for blocking messages
- Real-time progress tracking
- Comprehensive results dashboard

## Supported AI Crawlers

The tool tests against major AI crawlers including:
- GPTBot (OpenAI)
- Google-Extended
- anthropic-ai (Claude)
- PerplexityBot
- CCBot (Common Crawl)
- YouBot, Bytespider, and others

## Prerequisites

- Node.js 18+ 
- Vercel account (for KV and Postgres)

## Setup for Vercel Deployment

### 1. Database Setup

First, set up your Vercel Postgres database:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new Postgres database
3. Run the schema setup:

```sql
-- Copy and run the contents of schema.sql in your Vercel Postgres console
```

### 2. KV Store Setup

Set up Vercel KV for the job queue:

1. In your Vercel project, go to Storage tab
2. Create a new KV store
3. Note the connection details

### 3. Environment Variables

Set these environment variables in your Vercel project:

```bash
# From your Vercel KV setup
KV_REST_API_URL=your_kv_rest_api_url
KV_REST_API_TOKEN=your_kv_rest_api_token

# From your Vercel Postgres setup  
POSTGRES_URL=your_postgres_url
POSTGRES_PRISMA_URL=your_postgres_prisma_url
POSTGRES_URL_NO_SSL=your_postgres_url_no_ssl
POSTGRES_URL_NON_POOLING=your_postgres_url_non_pooling
POSTGRES_USER=your_postgres_user
POSTGRES_HOST=your_postgres_host
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DATABASE=your_postgres_database
```

### 4. Deploy

1. Push your code to GitHub
2. Connect the repository to Vercel
3. Deploy!

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

## Architecture

- **Frontend**: Next.js with Tailwind CSS
- **Queue System**: Vercel KV (Redis) for job processing
- **Database**: Vercel Postgres for results storage
- **Browser Automation**: Playwright with Chromium for testing
- **Runtime**: Edge runtime for optimal serverless performance

## How It Works

1. Upload a CSV file containing URLs
2. URLs are parsed and queued for processing
3. Each URL is tested using:
   - robots.txt analysis for bot-specific rules
   - HTTP requests with AI user agents
   - Content scanning for blocking messages
4. Results are stored and displayed in real-time

## Cron Job

The app includes a cron job (`vercel.json`) that processes the queue every minute. This ensures continuous processing of scan jobs.

## Security Note

This tool is designed for defensive security purposes - to help website owners understand their own site's protection mechanisms. Use responsibly and only on websites you own or have permission to test.