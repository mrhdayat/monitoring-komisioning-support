import { SELF } from 'cloudflare:test';
import { it, expect } from 'vitest';

it('api tak dikenal → 404 json', async () => {
  const res = await SELF.fetch('https://x/api/tidak-ada');
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'not_found' });
});
