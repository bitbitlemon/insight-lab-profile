from .members import Member
from .advising import Advising
from .papers import Paper
from .paper_authors import PaperAuthor
from .competitions import Competition
from .competition_members import CompetitionMember
from .meeting_notes import MeetingNote
from .meeting_participants import MeetingParticipant
from .awards import Award
from .trainings import Training
from .audit_log import AuditLog
from .sync_state import SyncState
from .contributions import Contribution, ContributionComment
from .ai_assistants import AIAssistantConfig
from .ai_chat_submissions import AIChatSubmission
from .lark_doc_watches import LarkDocWatch
from .lark_base_chat_sources import LarkBaseChatMessage, LarkBaseChatSource
from .points_ledger import PointsLedger
from .projects import (
    Project,
    ProjectChat,
    ProjectChatMessage,
    ProjectChatTopic,
    ProjectLog,
    ProjectLogComment,
    ProjectMember,
    ProjectRelation,
    SystemFeedback,
    Task,
    TaskFeedback,
)
from .calendar import CalendarEvent, ClassSchedule, LeaveRequest, LarkUserStatus
from .paper_milestones import PaperMilestone, PIPELINE_STAGES, PIPELINE_STAGE_LABEL
from .moments import MomentPost, MomentComment, MomentLike
from .chat_intent_logs import ChatIntentLog
from .lab import LabSpace, LabResource, LabReservation, LabOccupancy, LabInteraction
from .lab_message import LabMessageConfig
from .lab_daily import LabDailyReport
from .usage import AppPresence, AppUsageDaily, SnakeScore
from .permissions import PermissionAssignment
from .approvals import ApprovalRule, ProjectLogApproval
from .stage_flow import ProjectStageCheck, ProjectStageTransition, StageChecklistTemplate

try:
    from .lab_broadcast import LabBroadcastItem
except ModuleNotFoundError:  # production tree may lag this optional model
    LabBroadcastItem = None

__all__ = [
    "Member",
    "Advising",
    "Paper",
    "PaperAuthor",
    "Competition",
    "CompetitionMember",
    "MeetingNote",
    "MeetingParticipant",
    "Award",
    "Training",
    "AuditLog",
    "SyncState",
    "Contribution",
    "ContributionComment",
    "AIAssistantConfig",
    "AIChatSubmission",
    "LarkDocWatch",
    "LarkBaseChatSource",
    "LarkBaseChatMessage",
    "PointsLedger",
    "Project",
    "ProjectChat",
    "ProjectChatMessage",
    "ProjectChatTopic",
    "ProjectLog",
    "ProjectLogComment",
    "ProjectMember",
    "ProjectRelation",
    "Task",
    "TaskFeedback",
    "SystemFeedback",
    "CalendarEvent",
    "ClassSchedule",
    "LeaveRequest",
    "LarkUserStatus",
    "PaperMilestone",
    "PIPELINE_STAGES",
    "PIPELINE_STAGE_LABEL",
    "MomentPost",
    "MomentComment",
    "MomentLike",
    "LabSpace",
    "LabResource",
    "LabReservation",
    "LabOccupancy",
    "LabInteraction",
    "LabMessageConfig",
    "LabDailyReport",
    "ChatIntentLog",
    "AppPresence",
    "AppUsageDaily",
    "SnakeScore",
    "PermissionAssignment",
    "ApprovalRule",
    "ProjectLogApproval",
    "StageChecklistTemplate",
    "ProjectStageCheck",
    "ProjectStageTransition",
]

if LabBroadcastItem is not None:
    __all__.append("LabBroadcastItem")
