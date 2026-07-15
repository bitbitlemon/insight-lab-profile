import { lazy } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import LoginPage from "./pages/LoginPage";

const ProjectManagementPage = lazy(() => import("./pages/ProjectManagementPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const ProjectFormPage = lazy(() => import("./pages/ProjectFormPage"));
const PermissionSettingsPage = lazy(() => import("./pages/PermissionSettingsPage"));
const ProjectDashboardPage = lazy(() => import("./pages/ProjectDashboardPage"));
const TaskFormPage = lazy(() => import("./pages/TaskFormPage"));

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/projects" replace /> },
  { path: "/projects", element: <ProjectManagementPage /> },
  { path: "/approvals", element: <ProjectManagementPage /> },
  { path: "/projects/dashboard", element: <ProjectDashboardPage /> },
  { path: "/projects/new", element: <ProjectFormPage /> },
  { path: "/projects/:project_id/guidance", element: <Navigate to="/projects" replace /> },
  { path: "/projects/:project_id", element: <ProjectDetailPage /> },
  { path: "/projects/:project_id/edit", element: <ProjectFormPage /> },
  { path: "/tasks/new", element: <TaskFormPage /> },
  { path: "/tasks/:task_id/edit", element: <TaskFormPage /> },
  { path: "/permissions", element: <PermissionSettingsPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "*", element: <Navigate to="/projects" replace /> },
];
