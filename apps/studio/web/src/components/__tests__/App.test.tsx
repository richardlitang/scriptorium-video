import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const projectMocks = vi.hoisted(() => ({
  projects: [] as Array<{ id: string }>,
  projectsLoading: false,
  createProject: vi.fn(),
}));

vi.mock("@/queries/projects", () => ({
  useProjects: () => ({
    data: projectMocks.projects,
    isLoading: projectMocks.projectsLoading,
  }),
  useCreateProject: () => ({
    mutateAsync: projectMocks.createProject,
    isPending: false,
  }),
}));

vi.mock("../ProjectSidebar", () => ({
  ProjectSidebar: () => <aside data-testid="project-sidebar" />,
}));

vi.mock("../ProjectWorkspace", () => ({
  ProjectWorkspace: ({ projectId }: { projectId: string }) => (
    <div data-testid="project-workspace">{projectId}</div>
  ),
}));

vi.mock("../StartupPanel", () => ({
  StartupPanel: ({ onCreate }: { onCreate: () => void }) => (
    <button onClick={onCreate}>Create first project</button>
  ),
}));

vi.mock("../TtsHealthPill", () => ({
  TtsHealthPill: () => null,
  TtsHealthDetail: () => null,
}));

describe("App startup project selection", () => {
  beforeEach(() => {
    localStorage.clear();
    projectMocks.projects = [];
    projectMocks.projectsLoading = false;
    projectMocks.createProject.mockReset();
  });

  it("opens the first project when no selection is persisted", async () => {
    projectMocks.projects = [{ id: "first" }, { id: "second" }];

    render(<App />);

    expect(await screen.findByTestId("project-workspace")).toHaveTextContent("first");
    expect(localStorage.getItem("lvstudio:selectedProjectId")).toBe("first");
  });

  it("replaces a stale persisted selection with the first available project", async () => {
    localStorage.setItem("lvstudio:selectedProjectId", "deleted");
    projectMocks.projects = [{ id: "available" }];

    render(<App />);

    expect(await screen.findByTestId("project-workspace")).toHaveTextContent("available");
    expect(localStorage.getItem("lvstudio:selectedProjectId")).toBe("available");
  });

  it("opens the project returned by first-project creation", async () => {
    projectMocks.createProject.mockImplementation(async () => {
      projectMocks.projects = [{ id: "created" }];
      return { project: { id: "created" } };
    });

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Create first project" }));

    expect(projectMocks.createProject).toHaveBeenCalledWith({ title: "Untitled project" });
    expect(await screen.findByTestId("project-workspace")).toHaveTextContent("created");
  });
});
