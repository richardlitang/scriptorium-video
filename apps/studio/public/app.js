const projectList = document.getElementById("project-list");
const projectTitle = document.getElementById("project-title");
const projectMeta = document.getElementById("project-meta");
const planOutput = document.getElementById("plan-output");
const timelineOutput = document.getElementById("timeline-output");
const captionsOutput = document.getElementById("captions-output");
const qualityOutput = document.getElementById("quality-output");
const renderBtn = document.getElementById("render-btn");

let selectedProjectId = null;

function fmt(value) {
  return JSON.stringify(value, null, 2);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? "Request failed.");
  }
  return data;
}

async function loadProjects() {
  const data = await fetchJson("/api/projects");
  projectList.innerHTML = "";
  for (const project of data.projects) {
    const el = document.createElement("div");
    el.className = "project-item";
    el.innerHTML = `<strong>${project.id}</strong><br/><small>${project.mode} · ${project.status}</small>`;
    el.onclick = () => selectProject(project.id, el);
    projectList.appendChild(el);
  }
}

async function selectProject(projectId, element) {
  selectedProjectId = projectId;
  [...projectList.querySelectorAll(".project-item")].forEach((node) => node.classList.remove("active"));
  element?.classList.add("active");
  renderBtn.disabled = false;

  const details = await fetchJson(`/api/projects/${projectId}`);
  projectTitle.textContent = `${details.data.project.title} (${projectId})`;
  projectMeta.textContent = fmt({
    status: details.data.project.status,
    mode: details.data.plan.mode,
    targetPlatform: details.data.plan.targetPlatform,
    assets: details.data.assetCount,
    captions: details.data.captionCount
  });
  planOutput.textContent = fmt(details.data.plan);
  timelineOutput.textContent = fmt(details.data.timeline ?? { message: "timeline.json missing" });
  captionsOutput.textContent = fmt({ captionCount: details.data.captionCount });

  const quality = await fetchJson(`/api/projects/${projectId}/quality`);
  qualityOutput.textContent = quality.output;
}

renderBtn.onclick = async () => {
  if (!selectedProjectId) return;
  renderBtn.disabled = true;
  renderBtn.textContent = "Rendering...";
  try {
    const result = await fetchJson(`/api/projects/${selectedProjectId}/render?quality=draft`, { method: "POST" });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nRender:\n${result.output}`;
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nRender failed:\n${String(error)}`;
  } finally {
    renderBtn.disabled = false;
    renderBtn.textContent = "Render Draft";
  }
};

loadProjects().catch((error) => {
  projectMeta.textContent = String(error);
});
