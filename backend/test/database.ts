import 'dotenv/config';
export function testDatabaseUrl() {
  const base = new URL(process.env.DATABASE_URL!);
  const url = new URL(process.env.TEST_DATABASE_URL || base.toString());
  if (!process.env.TEST_DATABASE_URL) url.pathname = '/bazaar_test';
  if (
    !/^\/[a-zA-Z0-9_]*test[a-zA-Z0-9_]*$/.test(url.pathname) ||
    url.toString() === base.toString()
  )
    throw new Error('Integration tests require a separate database with test in its name');
  return url;
}
