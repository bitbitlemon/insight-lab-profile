import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import LoginPage from "./pages/LoginPage";

const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const PaperFormPage = lazy(() => import("./pages/PaperFormPage"));
const PaperCyclePage = lazy(() => import("./pages/PaperPipelinePage"));
const PaperDetailPage = lazy(() => import("./pages/PaperDetailPage"));
const CompetitionFormPage = lazy(() => import("./pages/CompetitionFormPage"));
const CompetitionDetailPage = lazy(() => import("./pages/CompetitionDetailPage"));
const AchievementsPage = lazy(() => import("./pages/AchievementsPage"));
const AchievementDetailPage = lazy(() => import("./pages/AchievementDetailPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const ContributionFormPage = lazy(() => import("./pages/ContributionFormPage"));
const ContributionDetailPage = lazy(() => import("./pages/ContributionDetailPage"));
const AwardDetailPage = lazy(() => import("./pages/AwardDetailPage"));
const TrainingDetailPage = lazy(() => import("./pages/TrainingDetailPage"));
const BoardPage = lazy(() => import("./pages/BoardPage"));
const PersonnelPage = lazy(() => import("./pages/PersonnelPage"));
const CloudLabPage = lazy(() => import("./pages/CloudLabPage"));
const MemberDetailPage = lazy(() => import("./pages/MemberDetailPage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const ProjectListPage = lazy(() => import("./pages/ProjectListPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const ProjectFormPage = lazy(() => import("./pages/ProjectFormPage"));
const TaskFormPage = lazy(() => import("./pages/TaskFormPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const MeetingFormPage = lazy(() => import("./pages/MeetingFormPage"));
const MeetingNotesPage = lazy(() => import("./pages/MeetingNotesPage"));
const AdminConsolePage = lazy(() => import("./pages/AdminConsolePage"));
const MomentsPage = lazy(() => import("./pages/MomentsPage"));
const FileConfirmPage = lazy(() => import("./pages/FileConfirmPage"));
const NotificationReceiptPage = lazy(() => import("./pages/NotificationReceiptPage"));
const ChatInsightsPage = lazy(() => import("./pages/ChatInsightsPage"));

export const routes: RouteObject[] = [
  { path: "/", element: <ProfilePage /> },
  { path: "/profile", element: <ProfilePage /> },
  { path: "/calendar", element: <CalendarPage /> },
  { path: "/calendar/meetings/new", element: <MeetingFormPage /> },
  { path: "/meeting-notes", element: <MeetingNotesPage /> },
  { path: "/papers/new", element: <PaperFormPage /> },
  { path: "/papers/:paper_id/edit", element: <PaperFormPage /> },
  { path: "/papers/:paper_id/pipeline", element: <PaperCyclePage /> },
  { path: "/papers/:paper_id", element: <PaperDetailPage /> },
  { path: "/competitions/new", element: <CompetitionFormPage /> },
  { path: "/competitions/:comp_id/edit", element: <CompetitionFormPage /> },
  { path: "/competitions/:comp_id", element: <CompetitionDetailPage /> },
  { path: "/achievements", element: <AchievementsPage /> },
  { path: "/achievements/:id", element: <AchievementDetailPage /> },
  { path: "/gallery", element: <GalleryPage /> },
  { path: "/moments", element: <MomentsPage /> },
  { path: "/contributions/new", element: <ContributionFormPage /> },
  { path: "/contributions/:contribution_id/edit", element: <ContributionFormPage /> },
  { path: "/contributions/:contribution_id", element: <ContributionDetailPage /> },
  { path: "/awards/:award_id", element: <AwardDetailPage /> },
  { path: "/trainings/:training_id", element: <TrainingDetailPage /> },
  { path: "/projects", element: <ProjectListPage /> },
  { path: "/projects/new", element: <ProjectFormPage /> },
  { path: "/projects/:project_id", element: <ProjectDetailPage /> },
  { path: "/projects/:project_id/edit", element: <ProjectFormPage /> },
  { path: "/tasks/new", element: <TaskFormPage /> },
  { path: "/tasks/:task_id/edit", element: <TaskFormPage /> },
  { path: "/board", element: <BoardPage /> },
  { path: "/personnel", element: <PersonnelPage /> },
  { path: "/cloud-lab", element: <CloudLabPage /> },
  { path: "/board/leaderboard", element: <LeaderboardPage /> },
  { path: "/admin", element: <AdminConsolePage /> },
  { path: "/members/:open_id", element: <MemberDetailPage /> },
  { path: "/files/confirm", element: <FileConfirmPage /> },
  { path: "/notifications/receipt", element: <NotificationReceiptPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/chat-insights", element: <ChatInsightsPage /> },

];
