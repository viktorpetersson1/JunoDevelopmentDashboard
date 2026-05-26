import { test, expect } from '@playwright/test';

/**
 * J5 — Issue a capital call → owners commit → record payments.
 *
 * Most-touched financial flow in P0. Auth + role gates verified here;
 * full payment lifecycle skipped pending a test editor user.
 */

test.describe('J5: capital calls (auth gate)', () => {
  test('unauthenticated /projects/p2?tab=capital redirects to /sign-in', async ({ page }) => {
    await page.goto('/projects/p2?tab=capital');
    await expect(page).toHaveURL(/\/sign-in/);
    // redirectTo preserves the pathname (query params are not guaranteed to
    // survive the round-trip — see J2 for the same pattern).
    expect(new URL(page.url()).searchParams.get('redirectTo')).toMatch(/^\/projects\/p2/);
  });

  test('unauthenticated POST /api/capital-calls returns 401', async ({ request }) => {
    const res = await request.post('/api/capital-calls', {
      data: { projectId: '00000000-0000-0000-0000-000000000000', totalAmountCents: 100_000_00, split: 'cap_table' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe.skip('J5: capital calls (real-user flow, needs editor + owner users)', () => {
  test('editor: issue call from cap_table split → owner shares sum to total', async () => {
    // 1. signInAsEditor
    // 2. /projects/p2?tab=capital
    // 3. click "New capital call", enter total $500k, split=cap_table, issue=true
    // 4. submit
    // 5. assert call appears in the list with status=issued, call_number=CC-yyyy-NNN
    // 6. assert N owner_shares rows whose share_amount_cents sum = total_amount_cents
  });

  test('owner: viewer_basic sees only their own commitment', async () => {
    // 1. signInAs(owner Peter — viewer_basic)
    // 2. /projects/p2?tab=capital
    // 3. assert: capital call card visible
    // 4. assert: "your share" column reflects Peter's owner_share only
    // 5. assert: no edit / mark-funded controls
  });

  test('record a wire payment marks the share as funded', async () => {
    // 1. signInAsEditor
    // 2. /projects/p2?tab=capital → expand an issued call
    // 3. click "Record payment" on Lars's share
    // 4. fill amount = full share, received_date = today
    // 5. submit
    // 6. assert: Lars's status flips to "funded"
    // 7. assert: call status flips to "partial" or "funded" depending on others
  });
});
