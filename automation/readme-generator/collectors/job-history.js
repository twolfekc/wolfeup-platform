'use strict';

const ORCH_URL   = process.env.REPLY_ORCHESTRATOR_URL   || 'http://localhost:7890';
const ORCH_TOKEN = process.env.REPLY_ORCHESTRATOR_TOKEN || '';

async function collect() {
  try {
    const res = await fetch(`${ORCH_URL}/api/jobs?limit=20`, {
      headers: ORCH_TOKEN ? { Authorization: `Bearer ${ORCH_TOKEN}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const jobs = data.jobs || [];
    const completed = jobs.filter(j => j.status === 'DONE' || j.status === 'done');
    const failed    = jobs.filter(j => j.status === 'ERROR' || j.status === 'error');
    const lastJob   = jobs[0] || null;

    return {
      totalJobs:     jobs.length,
      completedJobs: completed.length,
      failedJobs:    failed.length,
      lastJobAt:     lastJob?.updatedAt || lastJob?.createdAt || null,
      lastJobStatus: lastJob?.status || null,
      online: true,
    };
  } catch (err) {
    return { totalJobs: 0, completedJobs: 0, failedJobs: 0, lastJobAt: null, online: false, error: err.message };
  }
}

module.exports = { collect };
