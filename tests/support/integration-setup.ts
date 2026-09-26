import "dotenv/config";

if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST is required for integration tests");
// never run integration tests against the main database
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
