function formatJobTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleTimeString();
}

function formatElapsed(startedAt, finishedAt) {
  const start = Date.parse(startedAt || "");
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

export function createJobCenterController({ listEl, fetchJobs, fetchTrace, onRetry }) {
  let expandedJobIds = new Set();
  let pollTimer = null;
  let lastJobs = [];
  const traceCache = new Map();

  function clearExpanded() {
    expandedJobIds = new Set();
  }

  function render(jobs = []) {
    lastJobs = jobs;
    listEl.innerHTML = "";
    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "feedback-row feedback-info";
      empty.textContent = "No jobs yet.";
      listEl.appendChild(empty);
      return;
    }

    for (const job of jobs) {
      const card = document.createElement("article");
      card.className = `job-card job-card-${job.status}`;
      const top = document.createElement("div");
      top.className = "job-card-top";
      const title = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = job.label || "Job";
      const small = document.createElement("small");
      const elapsed = formatElapsed(job.startedAt, job.finishedAt);
      small.textContent = `${job.status} · ${formatJobTime(job.startedAt)}${elapsed ? ` · ${elapsed}` : ""}`;
      title.append(strong, small);
      top.appendChild(title);
      card.appendChild(top);

      const meta = document.createElement("div");
      meta.className = "job-card-meta";
      const progressText = typeof job.completed === "number" && typeof job.total === "number"
        ? `Progress ${Math.min(job.total, job.completed)}/${job.total}`
        : "Progress n/a";
      const sectionText = job.currentSectionTitle ? ` · ${job.currentSectionTitle}` : "";
      const updatedText = job.updatedAt ? ` · updated ${formatJobTime(job.updatedAt)}` : "";
      meta.textContent = `${progressText}${sectionText}${updatedText}`;
      card.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "job-card-actions";
      const viewOutput = document.createElement("button");
      viewOutput.type = "button";
      viewOutput.textContent = expandedJobIds.has(job.id) ? "Hide Output" : "View Output";
      viewOutput.onclick = () => {
        if (expandedJobIds.has(job.id)) expandedJobIds.delete(job.id);
        else expandedJobIds.add(job.id);
        render(lastJobs);
      };
      actions.appendChild(viewOutput);

      if (job.tracePath) {
        const trace = document.createElement("button");
        trace.type = "button";
        trace.textContent = expandedJobIds.has(`${job.id}:trace`) ? "Hide Trace" : "View Trace";
        trace.onclick = async () => {
          const key = `${job.id}:trace`;
          if (expandedJobIds.has(key)) {
            expandedJobIds.delete(key);
          } else {
            expandedJobIds.add(key);
            if (!traceCache.has(job.id) && fetchTrace) {
              trace.disabled = true;
              trace.textContent = "Loading trace...";
              try {
                traceCache.set(job.id, await fetchTrace(job));
              } catch (error) {
                traceCache.set(job.id, { raw: `Trace unavailable:\n${String(error)}`, path: job.tracePath });
              }
            }
          }
          render(lastJobs);
        };
        actions.appendChild(trace);
      }

      if (job.status === "failed") {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Retry";
        retry.onclick = async () => {
          retry.disabled = true;
          retry.textContent = "Queueing...";
          try {
            await onRetry?.(job);
          } finally {
            retry.disabled = false;
            retry.textContent = "Retry";
          }
        };
        actions.appendChild(retry);
      }
      card.appendChild(actions);

      if (expandedJobIds.has(job.id)) {
        const output = document.createElement("pre");
        output.className = "job-output";
        output.textContent = job.output || job.error || "No output captured.";
        card.appendChild(output);
      }
      if (job.tracePath && expandedJobIds.has(`${job.id}:trace`)) {
        const trace = document.createElement("pre");
        trace.className = "job-output";
        const data = traceCache.get(job.id);
        trace.textContent = data?.raw || `Operational trace file:\n${job.tracePath}`;
        card.appendChild(trace);
      }
      listEl.appendChild(card);
    }
  }

  async function refresh(projectId) {
    if (!projectId) return [];
    try {
      const jobs = await fetchJobs(projectId);
      for (const job of jobs) {
        if (["queued", "running", "cancelling"].includes(job.status)) traceCache.delete(job.id);
      }
      render(jobs);
      return jobs;
    } catch {
      render([]);
      return [];
    }
  }

  async function poll(projectId) {
    const jobs = await refresh(projectId);
    if (!jobs.some((job) => ["queued", "running", "cancelling"].includes(job.status))) stopPolling();
  }

  function startPolling(projectId) {
    stopPolling();
    poll(projectId).catch(() => {});
    pollTimer = setInterval(() => {
      poll(projectId).catch(() => {});
    }, 1000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  return {
    render,
    refresh,
    startPolling,
    stopPolling,
    clearExpanded
  };
}
