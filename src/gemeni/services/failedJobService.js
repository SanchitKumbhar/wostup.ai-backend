const { FailedQueueJob } = require("../models");
const { enqueueVerificationEmail } = require("../queues/emailVerificationQueue");

async function getFailedJobs(options = {}) {
  const limit = Number(options.limit || 20);
  const offset = Number(options.offset || 0);
  const query = {};

  if (options.status) {
    query.status = options.status;
  }
  if (options.queueName) {
    query.queueName = options.queueName;
  }

  const [jobs, total] = await Promise.all([
    FailedQueueJob.find(query)
      .sort({ failedAt: -1 })
      .skip(offset)
      .limit(limit),
    FailedQueueJob.countDocuments(query),
  ]);

  return {
    jobs,
    total,
    limit,
    offset,
  };
}

async function retryFailedJob(failedJobRecordId) {
  const failedRecord = await FailedQueueJob.findById(failedJobRecordId);

  if (!failedRecord) {
    throw new Error(`Failed job record with ID ${failedJobRecordId} not found`);
  }

  if (!failedRecord.jobData || !failedRecord.jobData.toEmail) {
    throw new Error("Cannot retry job: jobData payload is incomplete");
  }

  // Re-enqueue job back onto BullMQ / Redis queue
  const newJob = await enqueueVerificationEmail(failedRecord.jobData);

  // Update status in MongoDB audit log
  failedRecord.status = "retried";
  failedRecord.resolvedAt = new Date();
  await failedRecord.save();

  return {
    success: true,
    failedJobRecordId: failedRecord.id,
    newJobId: newJob.id,
    message: "Job re-enqueued successfully to Redis queue",
  };
}

module.exports = {
  getFailedJobs,
  retryFailedJob,
};
