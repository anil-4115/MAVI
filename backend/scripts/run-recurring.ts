/**
 * Railway cron one-shot entry point for recurring-expense generation.
 *
 * Connects to MongoDB, generates at most one expense per active rule whose
 * schedule is due today (missed occurrences are skipped, never backfilled),
 * then disconnects and exits. Deployment runs this on a daily schedule instead
 * of an in-process timer.
 *
 * Exit code 1 indicates a systemic failure (connection) OR one or more per-rule
 * generation failures, so the platform can surface a failed cron run.
 *
 *   npm run recurring:run
 */
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { todayUtcDayKey } from "../src/modules/recurring/recurrence.js";
import { processDueRules } from "../src/modules/recurring/recurring.service.js";

const main = async (): Promise<void> => {
  await connectDatabase();

  const todayKey = todayUtcDayKey();
  console.log(`[recurring] processing due rules for ${todayKey}`);

  const result = await processDueRules(todayKey);
  console.log(
    `[recurring] done: processed=${result.processed} generated=${result.generated} failed=${result.failed}`,
  );

  await mongoose.disconnect();

  if (result.failed > 0) {
    process.exitCode = 1;
  }
};

main().catch(async (err: unknown) => {
  console.error("[recurring] run failed:", err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
