/**
 * Health check tests.
 */
import { assertStatus, assertEqual, assertTrue } from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'health',
    tests: [
      {
        name: 'health-endpoint',
        fn: async () => {
          const res = await client.health();
          return [
            assertStatus(res, 200),
            assertEqual(res.body.status, 'healthy', 'status'),
            assertEqual(res.body.database, 'connected', 'database'),
          ];
        },
      },
      {
        name: 'api-info',
        fn: async () => {
          const res = await client.info();
          return [
            assertStatus(res, 200),
            assertTrue(res.body.name, 'name exists'),
            assertTrue(res.body.endpoints, 'endpoints exists'),
          ];
        },
      },
    ],
  };
}
