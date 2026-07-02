/* eslint-disable no-console */
/**
 * scripts/sonar-smoke.ts — T-PRC-1 manual smoke test (Viktor-tick; needs a LIVE key).
 *
 * Proves the key + endpoint + response_format json_schema + citations all work
 * against the real Sonar API, using the actual CompResearchSchema. It is a thin
 * replica of `callPerplexity`'s request shape (same model, response_format,
 * search filters) and does NOT write an audit row — the adapter's audit/error
 * paths are covered by lib/llm/__tests__/perplexity-client.test.ts.
 *
 * The key is set in the Cloudflare Pages dashboard only (never the repo). To run
 * locally, export it for the shell session:
 *   PowerShell:  $env:PERPLEXITY_API_KEY="..."; npx tsx scripts/sonar-smoke.ts
 *   bash:        PERPLEXITY_API_KEY=... npx tsx scripts/sonar-smoke.ts
 *
 * If the endpoint path is wrong (PerplexityError: HTTP 404), set PERPLEXITY_API_URL
 * to the correct full URL — the adapter reads the same env var, so no code change.
 */
import { CompResearchSchema } from '../lib/llm/perplexity-schemas';

async function main(): Promise<void> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error(
      'PERPLEXITY_API_KEY not set. This smoke needs a live key (set in CF Pages; export it locally to run).'
    );
    process.exit(1);
    return;
  }

  const url = process.env.PERPLEXITY_API_URL ?? 'https://api.perplexity.ai/chat/completions';
  const started = Date.now();

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content:
            'You are an exit pricing analyst for Hamptons new-construction luxury villas. Return the comp_research JSON shape only.',
        },
        {
          role: 'user',
          content:
            'Subject: Big Bing, Sound-front 5BR new construction, North Fork NY, ~7,500 AG sqft. Return closed and active comps in the Sound-front NC 5BR >= 5,000 sqft sub-cut over the last 24 months.',
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'comp_research', schema: CompResearchSchema },
      },
      search_domain_filter: [
        'zillow.com',
        'redfin.com',
        'compass.com',
        'douglaselliman.com',
        'corcoran.com',
        'saunders.com',
      ],
    }),
  });

  const latencyMs = Date.now() - started;

  if (!resp.ok) {
    console.error(`Sonar HTTP ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    process.exit(1);
    return;
  }

  const body = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    citations?: unknown;
  };

  const content = body.choices?.[0]?.message?.content ?? '';
  const inTok = Number(body.usage?.prompt_tokens ?? 0);
  const outTok = Number(body.usage?.completion_tokens ?? 0);
  const cost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15; // sonar-pro pricing

  console.log('--- Sonar smoke (Big Bing comp_research) ---');
  console.log(
    `latency: ${latencyMs}ms  in: ${inTok} tok  out: ${outTok} tok  cost: $${cost.toFixed(4)}`
  );
  console.log(`citations: ${Array.isArray(body.citations) ? body.citations.length : 0}`);

  try {
    const parsed = JSON.parse(content) as {
      sub_cut_definition?: string;
      closed?: unknown[];
      active?: unknown[];
    };
    console.log(`sub_cut: ${parsed.sub_cut_definition ?? '(none)'}`);
    console.log(`closed: ${parsed.closed?.length ?? 0}  active: ${parsed.active?.length ?? 0}`);
    console.log('response_format JSON parsed OK');
  } catch (e) {
    console.error('response_format did NOT yield valid JSON:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
