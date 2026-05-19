function formatJobTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleTimeString();
}

export function createJobCenterController({ listEl, fetchJobs, onRetry }) {
  let expandedJobIds = new Set();
  let pollTimer = null;
  let lastJobs = [];

  function clearExpanded() {
    expandedJobIds = new Set();
  }

  function render(jobs = []) {
    lastJobs = jobs;
    listEl.innerHTML = "";
    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "feedback-row feedback-info";
      empty.textContent = "No draft jobs yet.";
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
      strong.textContent = job.label || "Draft job";
      const small = document.createElement("small");
      small.textContent = `${job.status} · ${formatJobTime(job.startedAt)}`;
      title.append(strong, small);
      top.appendChild(title);
      card.appendChild(top);

      const meta = document.createElement("div");
      meta.className = "job-card-meta";
      const progressText = typeof job.completed === "number" && typeof job.total === "number"
        ? `Progress ${Math.min(job.total, job.completed)}/${job.total}`
        : "Progress n/a";
      const sectionText = job.currentSectionTitle ? ` · ${job.currentSectionTitle}` : "";
      meta.textContent = `${progressText}${sectionText}`;
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
      listEl.appendChild(card);
    }
  }

  async function refresh(projectId) {
    if (!projectId) return [];
    try {
      const jobs = await fetchJobs(projectId);
      render(jobs);
      return jobs;
    } catch {
      render([]);
      return [];
    }
  }

  async function poll(projectId) {
    const jobs = await refresh(projectId);
    if (!jobs.some((job) => ["queued", "running"].includes(job.status))) stopPolling();
  }

  function startPolling(projectId) {
    stopPolling();
    poll(projectId).catch(() => {});
    pollTimer = setInterval(() => {
      poll(projectId).catch(() => {});
    }, 2500);
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
