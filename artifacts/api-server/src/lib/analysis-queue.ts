/**
 * CB-1: Simple in-process analysis queue.
 * Limits concurrent heavy analysis jobs to 1 so the event loop
 * isn't starved when multiple users trigger analysis simultaneously.
 *
 * NOTE: For production scale, replace this with BullMQ + Redis
 * (or Trigger.dev) to move work off the web process entirely.
 */
import { logger } from "./logger";

class AnalysisQueue {
  private running = 0;
  private readonly maxConcurrent: number;
  private readonly queue: Array<{ fn: () => Promise<void>; jobId: string }> = [];

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Enqueue an analysis job. Runs immediately if a slot is free,
   * otherwise waits in line.
   */
  enqueue(jobId: string, fn: () => Promise<void>): void {
    this.queue.push({ fn, jobId });
    logger.debug({ jobId, queued: this.queue.length, running: this.running }, "Analysis job enqueued");
    void this.flush();
  }

  private async flush(): Promise<void> {
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const task = this.queue.shift()!;
      this.running++;
      logger.info({ jobId: task.jobId, running: this.running }, "Analysis job starting");

      // Use setImmediate to yield to the event loop before starting
      setImmediate(() => {
        task.fn()
          .catch((err) => {
            logger.error({ err, jobId: task.jobId }, "Analysis job threw unhandled error");
          })
          .finally(() => {
            this.running--;
            logger.info({ jobId: task.jobId, running: this.running, queued: this.queue.length }, "Analysis job finished");
            void this.flush();
          });
      });
    }

    if (this.queue.length > 0 && this.running >= this.maxConcurrent) {
      logger.info(
        { queued: this.queue.length, running: this.running },
        "Analysis queue full — job will wait for a free slot",
      );
    }
  }

  get queueLength(): number { return this.queue.length; }
  get runningCount(): number { return this.running; }
}

/** Singleton queue — one active analysis at a time per process. */
export const analysisQueue = new AnalysisQueue(1);
