import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { Button, Dialog, TextArea, Toast } from "antd-mobile";
import { createCalendarEvent, getFreeBusy, listClassSchedules, listLarkUserStatuses, setLarkUserStatus, type BusySlot, type ClassSchedule, type LarkUserStatus } from "../api/calendar";
import { createLabInteraction, getLabMessageConfig, listLabChatClusters, listLabCommonChats, listLabInteractionSummary, saveLabMessageConfig, sendLabMentionMessage, type LabChatCluster, type LabInteractionKind, type LabInteractionSummary, type LabMessageConfig, type LabVisibleChat } from "../api/lab";
import { getMemberWorkloads, listMembers } from "../api/members";
import { createTask, updateTask } from "../api/tasks";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Member, MemberWorkload, MemberWorkloadTask } from "../types/api";

const cloudLabStyles = `
  body {
    background: #f5f5f3;
    overflow: hidden;
  }
  .cloud-lab-stage {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: #f5f5f3;
    z-index: 900;
  }
  .cloud-lab-canvas {
    width: 100vw;
    height: 100dvh;
    background: #f5f5f3;
    overflow: hidden;
    position: relative;
    touch-action: none;
    user-select: none;
  }
  .cloud-lab-canvas canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .cloud-lab-task-panel {
    position: absolute;
    right: 18px;
    top: 18px;
    width: 280px;
    max-height: 420px;
    overflow: hidden;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.82);
    box-shadow: 0 14px 32px rgba(31,41,55,0.12);
    backdrop-filter: blur(10px);
    padding: 12px;
    font-family: Arial, sans-serif;
    color: #111827;
    pointer-events: auto;
    z-index: 3;
  }
  .cloud-lab-task-toggle {
    position: absolute;
    right: 18px;
    top: 18px;
    z-index: 3;
    pointer-events: auto;
  }
  .cloud-lab-toolbar {
    position: absolute;
    left: 18px;
    top: 18px;
    display: flex;
    gap: 8px;
    z-index: 3;
    pointer-events: auto;
  }
  .cloud-lab-interaction-toolbox {
    position: absolute;
    right: 18px;
    top: 62px;
    z-index: 4;
    pointer-events: auto;
    display: grid;
    justify-items: end;
    gap: 8px;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-interaction-menu {
    width: 124px;
    display: grid;
    gap: 6px;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 12px;
    background: rgba(255,255,255,0.92);
    box-shadow: 0 14px 32px rgba(31,41,55,0.14);
    backdrop-filter: blur(10px);
    padding: 8px;
  }
  .cloud-lab-interaction-menu .cloud-lab-chip-button {
    width: 100%;
    text-align: left;
  }
  .cloud-lab-tool-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    margin-right: 6px;
    font-size: 15px;
    vertical-align: -2px;
  }
  .cloud-lab-game-overlay {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(17,24,39,0.46);
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-snake-game {
    width: min(440px, calc(100vw - 24px));
    border: 1px solid rgba(148,163,184,0.56);
    border-radius: 10px;
    background: #111827;
    box-shadow: 0 22px 52px rgba(15,23,42,0.35);
    padding: 12px;
    color: #e5e7eb;
  }
  .cloud-lab-snake-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 800;
  }
  .cloud-lab-snake-board {
    display: grid;
    grid-template-columns: repeat(18, 1fr);
    aspect-ratio: 1;
    border: 3px solid #334155;
    background: #020617;
    image-rendering: pixelated;
  }
  .cloud-lab-snake-cell {
    border: 1px solid rgba(30,41,59,0.55);
    background: #020617;
  }
  .cloud-lab-snake-cell[data-kind="snake"] {
    background: #22c55e;
    box-shadow: inset 0 0 0 2px rgba(187,247,208,0.35);
  }
  .cloud-lab-snake-cell[data-kind="head"] {
    background: #86efac;
  }
  .cloud-lab-snake-cell[data-kind="food"] {
    background: #f43f5e;
  }
  .cloud-lab-snake-controls {
    display: grid;
    grid-template-columns: repeat(3, 44px);
    justify-content: center;
    gap: 6px;
    margin-top: 10px;
  }
  .cloud-lab-view-hint {
    position: absolute;
    left: 18px;
    bottom: calc(82px + env(safe-area-inset-bottom));
    z-index: 3;
    pointer-events: none;
    border: 1px solid rgba(156,163,175,0.36);
    border-radius: 999px;
    background: rgba(255,255,255,0.76);
    box-shadow: 0 10px 24px rgba(31,41,55,0.08);
    backdrop-filter: blur(10px);
    padding: 7px 10px;
    color: #64748b;
    font: 800 11px Arial, sans-serif;
  }
  .cloud-lab-chip-button {
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 999px;
    background: rgba(255,255,255,0.86);
    color: #374151;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 800;
    box-shadow: 0 8px 18px rgba(31,41,55,0.08);
    backdrop-filter: blur(10px);
    cursor: pointer;
  }
  .cloud-lab-message-config {
    position: absolute;
    left: 18px;
    top: 62px;
    width: 320px;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.94);
    box-shadow: 0 18px 40px rgba(31,41,55,0.14);
    backdrop-filter: blur(12px);
    padding: 12px;
    z-index: 6;
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-availability-panel {
    position: absolute;
    left: 18px;
    top: 62px;
    width: min(460px, calc(100vw - 36px));
    max-height: calc(100% - 92px);
    overflow: auto;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.94);
    box-shadow: 0 18px 40px rgba(31,41,55,0.14);
    backdrop-filter: blur(12px);
    padding: 12px;
    z-index: 6;
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-availability-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 7px;
    align-items: end;
    margin-top: 9px;
  }
  .cloud-lab-field-label {
    display: block;
    color: #64748b;
    font-size: 11px;
    font-weight: 900;
    margin-bottom: 4px;
  }
  .cloud-lab-availability-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    margin-top: 10px;
  }
  .cloud-lab-availability-list {
    display: grid;
    gap: 7px;
    margin-top: 10px;
  }
  .cloud-lab-availability-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: start;
    border: 1px solid rgba(226,232,240,0.95);
    border-radius: 10px;
    background: rgba(248,250,252,0.92);
    padding: 8px;
  }
  .cloud-lab-availability-row[data-busy="false"] {
    border-color: rgba(187,247,208,0.95);
    background: rgba(240,253,244,0.88);
  }
  .cloud-lab-availability-slots {
    margin-top: 4px;
    color: #64748b;
    font-size: 11px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .cloud-lab-message-fields {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
  .cloud-lab-message-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(148,163,184,0.55);
    border-radius: 10px;
    background: rgba(255,255,255,0.92);
    padding: 8px 10px;
    color: #111827;
    font: 800 12px Arial, sans-serif;
    outline: none;
  }
  .cloud-lab-department-panel {
    position: absolute;
    left: 18px;
    top: 62px;
    width: 320px;
    max-height: calc(100% - 88px);
    overflow: auto;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.92);
    box-shadow: 0 18px 40px rgba(31,41,55,0.14);
    backdrop-filter: blur(12px);
    padding: 12px;
    z-index: 5;
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-department-group {
    border: 1px solid rgba(229,231,235,0.96);
    border-radius: 12px;
    background: rgba(249,250,251,0.9);
    overflow: hidden;
    margin-top: 8px;
  }
  .cloud-lab-department-head {
    width: 100%;
    border: 0;
    background: transparent;
    padding: 10px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
    color: #111827;
    font-size: 13px;
    font-weight: 900;
    text-align: left;
    cursor: pointer;
  }
  .cloud-lab-department-head span {
    min-width: 0;
  }
  .cloud-lab-department-count {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .cloud-lab-department-toggle {
    border: 1px solid rgba(148,163,184,0.5);
    border-radius: 999px;
    background: rgba(255,255,255,0.85);
    color: #475569;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }
  .cloud-lab-department-member {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border-top: 1px solid rgba(229,231,235,0.75);
    cursor: pointer;
  }
  .cloud-lab-department-member[data-selected="true"] {
    background: rgba(224,242,254,0.72);
  }
  .cloud-lab-area-strip {
    position: absolute;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: min(760px, calc(100vw - 36px));
    bottom: calc(82px + env(safe-area-inset-bottom));
    display: flex;
    gap: 14px;
    align-items: stretch;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding: 2px 2px 10px;
    scrollbar-width: thin;
    z-index: 3;
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-area-strip::-webkit-scrollbar {
    height: 6px;
  }
  .cloud-lab-area-strip::-webkit-scrollbar-thumb {
    background: rgba(148,163,184,0.5);
    border-radius: 999px;
  }
  .cloud-lab-area-card {
    flex: 0 0 176px;
    text-align: left;
    border: 1px solid rgba(148,163,184,0.5);
    border-top: 4px solid #64748b;
    border-radius: 16px;
    background: rgba(255,255,255,0.92);
    box-shadow: 0 16px 34px rgba(31,41,55,0.14);
    backdrop-filter: blur(10px);
    padding: 11px 12px;
    min-width: 0;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
  }
  .cloud-lab-area-card[data-active="true"] {
    border-color: rgba(17,24,39,0.55);
    background: rgba(255,255,255,0.98);
    transform: translateY(-4px);
    box-shadow: 0 22px 44px rgba(31,41,55,0.2);
  }
  .cloud-lab-area-card[data-area="overview"] {
    border-top-color: #111827;
  }
  .cloud-lab-area-card[data-area="workspace"] {
    border-top-color: #2563eb;
  }
  .cloud-lab-area-card[data-area="classroom"] {
    border-top-color: #059669;
  }
  .cloud-lab-area-card[data-area="meeting_room"] {
    border-top-color: #7c3aed;
  }
  .cloud-lab-area-card strong {
    display: block;
    color: #111827;
    font-size: 13px;
    line-height: 1.2;
  }
  .cloud-lab-area-card span {
    display: block;
    margin-top: 4px;
    color: #6b7280;
    font-size: 11px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .cloud-lab-space-panel {
    position: absolute;
    left: 18px;
    bottom: 112px;
    width: 360px;
    max-height: 310px;
    overflow: auto;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.94);
    box-shadow: 0 18px 40px rgba(31,41,55,0.16);
    backdrop-filter: blur(12px);
    padding: 12px;
    z-index: 4;
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-space-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    border: 1px solid rgba(229,231,235,0.9);
    border-radius: 10px;
    background: rgba(248,250,252,0.9);
    cursor: pointer;
  }
  .cloud-lab-voice-panel {
    position: absolute;
    left: 18px;
    bottom: 18px;
    width: 360px;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.94);
    box-shadow: 0 18px 40px rgba(31,41,55,0.16);
    backdrop-filter: blur(12px);
    padding: 12px;
    z-index: 6;
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-focus-pill strong {
    color: #111827;
    font-size: 12px;
    line-height: 1.2;
  }
  .cloud-lab-focus-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 7px;
    padding: 5px 8px;
    border-radius: 999px;
    background: #fff7ed;
    border: 1px solid #fed7aa;
    color: #9a3412;
    font-size: 11px;
    font-weight: 900;
  }
  .cloud-lab-focus-pill img {
    width: 16px;
    height: 16px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .cloud-lab-task-row[data-focus="true"],
  .cloud-lab-space-row[data-focus="true"],
  .cloud-lab-department-member[data-focus="true"] {
    border-color: rgba(234,88,12,0.65);
    background: #fff7ed;
  }
  .cloud-lab-schedule-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }
  .cloud-lab-schedule-row {
    border-radius: 9px;
    background: #f8fafc;
    border: 1px solid rgba(226,232,240,0.95);
    padding: 7px 8px;
    color: #374151;
    font-size: 11px;
    line-height: 1.35;
  }
  .cloud-lab-chip-button[data-active="true"] {
    background: #111827;
    border-color: #111827;
    color: #ffffff;
  }
  .cloud-lab-task-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 800;
  }
  .cloud-lab-filter-row {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x;
    scrollbar-width: none;
  }
  .cloud-lab-filter-row::-webkit-scrollbar {
    display: none;
  }
  .cloud-lab-filter-row .cloud-lab-chip-button {
    flex: 0 0 auto;
    box-shadow: none;
    padding: 6px 8px;
    font-size: 11px;
    white-space: nowrap;
  }
  .cloud-lab-status-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    margin-top: 10px;
    touch-action: manipulation;
  }
  .cloud-lab-status-row .cloud-lab-chip-button {
    width: 100%;
    min-width: 0;
    box-shadow: none;
    padding: 8px 6px;
    font-size: 11px;
    white-space: nowrap;
  }
  .cloud-lab-task-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    margin-top: 10px;
  }
  .cloud-lab-task-metric {
    border-radius: 10px;
    background: rgba(243,244,246,0.9);
    border: 1px solid rgba(229,231,235,0.9);
    padding: 8px 6px;
  }
  .cloud-lab-task-metric span {
    display: block;
    color: #6b7280;
    font-size: 11px;
    line-height: 1;
  }
  .cloud-lab-task-metric strong {
    display: block;
    margin-top: 5px;
    font-size: 18px;
    line-height: 1;
  }
  .cloud-lab-resource-advice {
    margin-top: 8px;
    border-radius: 10px;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
    padding: 7px 8px;
    font-size: 11px;
    line-height: 1.35;
    font-weight: 850;
  }
  .cloud-lab-task-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 10px;
    max-height: 284px;
    overflow: hidden;
  }
  .cloud-lab-task-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    border-radius: 10px;
    background: rgba(249,250,251,0.86);
    border: 1px solid rgba(229,231,235,0.86);
    padding: 8px;
    cursor: pointer;
  }
  .cloud-lab-task-row[data-selected="true"],
  .cloud-lab-task-row[data-drop-ready="true"] {
    border-color: rgba(17,24,39,0.45);
    background: rgba(255,255,255,0.96);
  }
  .cloud-lab-task-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
    font-weight: 800;
  }
  .cloud-lab-task-detail {
    margin-top: 3px;
    color: #6b7280;
    font-size: 11px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .cloud-lab-task-badge {
    border-radius: 999px;
    padding: 4px 7px;
    font-size: 11px;
    font-weight: 800;
    background: #f3f4f6;
    color: #4b5563;
  }
  .cloud-lab-member-sheet {
    position: absolute;
    left: 18px;
    top: 70px;
    width: 330px;
    max-height: calc(100% - 150px);
    overflow: auto;
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.9);
    box-shadow: 0 18px 40px rgba(31,41,55,0.14);
    backdrop-filter: blur(12px);
    padding: 13px;
    z-index: 4;
    pointer-events: auto;
    font-family: Arial, sans-serif;
  }
  .cloud-lab-sheet-header {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }
  .cloud-lab-member-name {
    font-size: 17px;
    line-height: 1.2;
    font-weight: 900;
    color: #111827;
  }
  .cloud-lab-member-meta {
    margin-top: 4px;
    color: #6b7280;
    font-size: 12px;
  }
  .cloud-lab-close {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(209,213,219,0.9);
    background: #ffffff;
    color: #374151;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .cloud-lab-mini-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    margin-top: 12px;
  }
  .cloud-lab-mini-metric {
    border-radius: 10px;
    background: #f8fafc;
    border: 1px solid rgba(226,232,240,0.9);
    padding: 8px 5px;
    text-align: center;
  }
  .cloud-lab-mini-metric span {
    display: block;
    color: #6b7280;
    font-size: 10px;
  }
  .cloud-lab-mini-metric strong {
    display: block;
    margin-top: 4px;
    font-size: 16px;
    color: #111827;
  }
  .cloud-lab-progress {
    height: 8px;
    margin-top: 10px;
    border-radius: 999px;
    background: #e5e7eb;
    overflow: hidden;
  }
  .cloud-lab-progress > div {
    height: 100%;
    border-radius: inherit;
  }
  .cloud-lab-action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .cloud-lab-task-mini-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 12px;
  }
  .cloud-lab-task-mini {
    border: 1px solid rgba(229,231,235,0.95);
    border-radius: 10px;
    background: rgba(249,250,251,0.94);
    padding: 9px;
    cursor: grab;
  }
  .cloud-lab-task-mini:active {
    cursor: grabbing;
  }
  .cloud-lab-task-mini-title {
    color: #111827;
    font-size: 12px;
    font-weight: 900;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .cloud-lab-task-mini-detail {
    margin-top: 4px;
    color: #6b7280;
    font-size: 11px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .cloud-lab-task-project-badge {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    margin-top: 6px;
    padding: 2px 7px;
    border-radius: 8px;
    background: #e0f2fe;
    color: #075985;
    border: 1px solid #bae6fd;
    font-size: 11px;
    font-weight: 900;
    line-height: 1.2;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .cloud-lab-task-project-badge[data-linked="false"] {
    background: #f1f5f9;
    color: #475569;
    border-color: #cbd5e1;
  }
  @media (max-width: 720px) {
    .cloud-lab-stage {
      background: #f5f5f3;
    }
    .cloud-lab-canvas {
      width: 100vw;
      height: 100dvh;
      max-width: none;
      max-height: none;
    }
    .cloud-lab-toolbar {
      left: 10px;
      top: 10px;
    }
    .cloud-lab-interaction-toolbox {
      right: 10px;
      top: 52px;
    }
    .cloud-lab-view-hint {
      left: 10px;
      bottom: calc(74px + env(safe-area-inset-bottom));
      max-width: calc(100vw - 132px);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .cloud-lab-department-panel {
      left: 10px;
      right: 10px;
      top: 52px;
      width: auto;
      max-height: 42vh;
    }
    .cloud-lab-chip-button {
      padding: 7px 9px;
      font-size: 11px;
    }
    .cloud-lab-status-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .cloud-lab-status-row .cloud-lab-chip-button {
      min-height: 34px;
      font-size: 12px;
    }
    .cloud-lab-task-panel {
      left: 10px;
      right: 10px;
      top: auto;
      bottom: calc(74px + env(safe-area-inset-bottom));
      width: auto;
      max-height: 34vh;
      padding: 10px;
      border-radius: 12px;
    }
    .cloud-lab-task-toggle {
      right: 10px;
      top: auto;
      bottom: 10px;
    }
    .cloud-lab-task-summary {
      margin-top: 8px;
    }
    .cloud-lab-task-list {
      max-height: 115px;
      margin-top: 8px;
    }
    .cloud-lab-member-sheet {
      left: 10px;
      right: 10px;
      top: auto;
      bottom: calc(10px + env(safe-area-inset-bottom));
      width: auto;
      max-height: 58vh;
      border-radius: 12px;
      z-index: 8;
    }
    .cloud-lab-area-strip {
      left: 10px;
      right: auto;
      transform: none;
      width: calc(100vw - 20px);
      bottom: calc(88px + env(safe-area-inset-bottom));
      gap: 10px;
    }
    .cloud-lab-area-card {
      flex-basis: 154px;
      border-radius: 14px;
      padding: 10px;
    }
    .cloud-lab-space-panel {
      left: 10px;
      right: 10px;
      width: auto;
      bottom: calc(34vh + 130px);
      max-height: 30vh;
    }
    .cloud-lab-voice-panel {
      left: 10px;
      right: 10px;
      width: auto;
      bottom: 10px;
    }
  }
`;

const emojiAsset = (name: string) => `/emojis/${name}.png`;

const interactionToolIcons: Record<InteractionTool, string> = {
  flower: "🌹",
  egg: "🥚",
  hammer: "🔨",
  whip: "〰",
  water: "🪣",
  throw: "↗",
};

const makeInteractionTexture = (kind: InteractionTool) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (kind === "whip") {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#7c2d12";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(24, 86);
    ctx.bezierCurveTo(48, 24, 92, 108, 108, 36);
    ctx.stroke();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(16, 96);
    ctx.lineTo(36, 78);
    ctx.stroke();
  } else {
    ctx.font = kind === "throw" ? "800 66px Arial" : "76px Arial";
    ctx.fillText(interactionToolIcons[kind], 64, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeMat = (color: number, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });

const makeTransparentMat = (color: number, opacity = 0.34, roughness = 0.72) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    transparent: true,
    opacity,
    depthWrite: false,
  });

const makeLoadMat = (color: number, opacity = 0.82) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.46,
    metalness: 0.04,
    emissive: new THREE.Color(color).multiplyScalar(0.22),
    transparent: true,
    opacity,
  });

const getLoadHeatColor = (score: number) => {
  if (score >= 85) return 0xef4444;
  if (score >= 70) return 0xf97316;
  if (score >= 50) return 0xfacc15;
  if (score >= 35) return 0xa3e635;
  return 0x86efac;
};

const getCapacityStyle = (workload?: MemberWorkload, fallbackScore = 22) => {
  const score = workload?.summary.capacity_score ?? fallbackScore;
  const heat = getLoadHeatColor(score);
  if (score >= 70) return { role: "focused" as const, body: heat, accent: 0xdc2626, label: "繁忙", emoji: [emojiAsset("fendou"), emojiAsset("jizhi"), emojiAsset("sikao")] };
  if (score >= 35) return { role: "normal" as const, body: heat, accent: 0xca8a04, label: "适中", emoji: [emojiAsset("lingguangyishan"), emojiAsset("kafei"), emojiAsset("jiayou")] };
  return { role: "patrol" as const, body: heat, accent: 0x16a34a, label: "空闲", emoji: [emojiAsset("weixiao"), emojiAsset("zaijian"), emojiAsset("xiao")] };
};

const addBox = (
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  color: number,
  roughness = 0.9,
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), makeMat(color, roughness));
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

const addCylinder = (
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  pos: [number, number, number],
  color: number,
  rotation?: [number, number, number],
) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16), makeMat(color));
  mesh.position.set(...pos);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

const addSphere = (
  parent: THREE.Object3D,
  radius: number,
  pos: [number, number, number],
  color: number,
  scale: [number, number, number] = [1, 1, 1],
) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), makeMat(color));
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

const createTextSprite = (text: string, selected = false) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 2);
    ctx.font = lines.length > 1 ? "700 32px Arial, sans-serif" : "700 44px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (selected) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.roundRect(58, 20, 396, lines.length > 1 ? 120 : 104, 20);
      ctx.fill();
      ctx.strokeStyle = "rgba(107, 114, 128, 0.34)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.fillStyle = "#050505";
    if (lines.length > 1) {
      ctx.fillText(lines[0], 256, 58);
      ctx.font = "600 25px Arial, sans-serif";
      ctx.fillStyle = "#374151";
      ctx.fillText(lines[1], 256, 104);
    } else {
      ctx.fillText(lines[0] || text, 256, 72);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(selected ? 1.56 : 1.58, 0.48, 1);
  return sprite;
};

const createEmojiSprite = (source: string) => {
  const texture = new THREE.TextureLoader().load(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.58, 0.58, 1);
  sprite.visible = false;
  return sprite;
};

type MonitorSurface = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  index: number;
  kind: number;
  phase: number;
  animated: boolean;
  lastFrame: number;
  lastMode: "active" | "static" | "locked" | "";
};

type DraggableKind = "computer" | "coffee";

type DraggableSceneObject = {
  object: THREE.Object3D;
  kind: DraggableKind;
  ownerDeskIndex?: number;
};

const paintMonitorFrame = (surface: MonitorSurface, time: number) => {
  const { canvas, ctx, index, kind, phase } = surface;
  const t = time + phase;
  const gradients = [
    ["#0f172a", "#1d4ed8"],
    ["#111827", "#7c2d12"],
    ["#052e16", "#16a34a"],
    ["#18181b", "#a21caf"],
    ["#172554", "#0284c7"],
    ["#0c0a09", "#b45309"],
  ];
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, gradients[kind][0]);
  gradient.addColorStop(1, gradients[kind][1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let line = 0; line < 5; line += 1) {
    const shift = ((t * (18 + kind * 4) + line * 19 + index * 7) % 46) - 23;
    ctx.fillRect(18 + shift * 0.35, 18 + line * 20, 110 + seededOffset(index + line, 81) * 90, 5);
  }
  if (kind === 0) {
    const bars = [62, 58, 56].map((width, item) => width + Math.sin(t * 2.4 + item + index) * 10);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(18, 92 - Math.sin(t + index) * 8, bars[0], 28);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(92, 72 - Math.cos(t * 1.3 + index) * 10, bars[1], 48);
    ctx.fillStyle = "#f97316";
    ctx.fillRect(162, 48 - Math.sin(t * 1.7) * 7, bars[2], 72);
    ctx.fillStyle = "#e0f2fe";
    ctx.fillRect(20, 22, 72 + Math.sin(t * 2) * 18, 8);
  } else if (kind === 1) {
    const x = 128 + Math.sin(t * 1.8 + index) * 34;
    const y = 72 + Math.cos(t * 1.3 + index) * 18;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 17);
    ctx.lineTo(x - 10, y + 17);
    ctx.lineTo(x + 20, y);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.48)";
    ctx.fillRect(0, 112, 256, 32);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(18, 124, 210 * ((Math.sin(t * 0.45 + index) + 1) / 2), 5);
  } else if (kind === 2) {
    ctx.font = "700 15px monospace";
    const lines = ["const app = lab();", "sync.status.ok", "render(scene)", "commit --fix", "deploy.cloud()"];
    lines.forEach((line, row) => {
      const visibleChars = Math.max(3, Math.floor(((t * 8 + row * 5 + index) % (line.length + 4))));
      ctx.fillStyle = row % 2 ? "#86efac" : "#d9f99d";
      ctx.fillText(line.slice(0, visibleChars), 18, 26 + row * 22);
    });
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(18 + ((t * 32) % 178), 126, 8, 4);
  } else if (kind === 3) {
    for (let card = 0; card < 4; card += 1) {
      const x = 16 + card * 60 - ((t * 28 + index * 9) % 60);
      ctx.fillStyle = ["#f472b6", "#60a5fa", "#fde68a", "#86efac"][card % 4];
      ctx.fillRect(x, 18, 48, 108);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(x + 8, 92 + Math.sin(t * 2 + card) * 8, 32, 18);
    }
  } else if (kind === 4) {
    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(18, 22, 220, 18);
    ctx.fillStyle = "#bae6fd";
    [52, 70, 88].forEach((y, row) => ctx.fillRect(18, y, 120 + ((t * 30 + row * 41 + index * 11) % 96), 8));
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 4;
    const cursor = 18 + ((t * 42 + index * 17) % 210);
    ctx.strokeRect(18, 112, 220, 18);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(cursor, 114, 18, 14);
  } else {
    const playerX = 60 + Math.sin(t * 2.5 + index) * 36;
    const enemyY = 36 + ((t * 26 + index * 9) % 74);
    ctx.fillStyle = "#fef3c7";
    ctx.beginPath();
    ctx.arc(playerX, 82, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(146 + Math.cos(t * 1.8) * 24, enemyY, 52, 52);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(122, 94, 28 + Math.sin(t * 5) * 10, 18);
  }
};

const paintMonitorLockScreen = (surface: MonitorSurface) => {
  const { canvas, ctx, index } = surface;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#020617");
  gradient.addColorStop(1, "#111827");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(148,163,184,0.22)";
  ctx.beginPath();
  ctx.arc(128, 58, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(226,232,240,0.42)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 58, 27, Math.PI * 0.12, Math.PI * 1.86);
  ctx.stroke();
  ctx.fillStyle = "rgba(226,232,240,0.78)";
  ctx.font = "700 18px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LAB", 128, 105);
  ctx.font = "600 11px Arial, sans-serif";
  ctx.fillStyle = "rgba(148,163,184,0.72)";
  ctx.fillText(`LOCKED ${String(index + 1).padStart(2, "0")}`, 128, 124);
};

const createMonitorSurface = (index: number): MonitorSurface => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const surface: MonitorSurface = {
    canvas,
    ctx,
    texture,
    index,
    kind: index % 6,
    phase: seededOffset(index, 97) * Math.PI * 2,
    animated: index % 3 === 0,
    lastFrame: -1,
    lastMode: "",
  };
  paintMonitorLockScreen(surface);
  surface.lastMode = "locked";
  return surface;
};

const addMonitorScreen = (parent: THREE.Object3D, index: number, monitors: MonitorSurface[]) => {
  const surface = createMonitorSurface(index);
  monitors.push(surface);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.49, 0.27),
    new THREE.MeshBasicMaterial({
      map: surface.texture,
      side: THREE.DoubleSide,
    }),
  );
  screen.position.set(0, 1.035, -0.203);
  parent.add(screen);
};

const buildDesk = (
  scene: THREE.Scene,
  x: number,
  z: number,
  rotationY = -0.08,
  index = 0,
  monitors: MonitorSurface[] = [],
  draggables: DraggableSceneObject[] = [],
) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;

  addBox(group, [1.8, 0.08, 0.75], [0, 0.75, 0], 0xeeeeea);
  [
    [-0.82, 0.36, -0.31],
    [0.82, 0.36, -0.31],
    [-0.82, 0.36, 0.31],
    [0.82, 0.36, 0.31],
  ].forEach((pos) => addBox(group, [0.06, 0.72, 0.06], pos as [number, number, number], 0xd8d8d3));

  const computer = new THREE.Group();
  computer.userData.draggableKind = "computer";
  computer.userData.ownerDeskIndex = index;
  computer.userData.homeParent = group;
  computer.userData.homePosition = computer.position.clone();
  computer.userData.homeRotation = computer.rotation.clone();
  addBox(computer, [0.55, 0.35, 0.04], [0, 1.03, -0.23], 0x111111);
  addMonitorScreen(computer, index, monitors);
  addBox(computer, [0.05, 0.25, 0.05], [0, 0.85, -0.18], 0xc8c8c3);
  addBox(computer, [0.28, 0.03, 0.18], [0, 0.77, -0.12], 0xc8c8c3);
  addBox(computer, [0.55, 0.015, 0.16], [0, 0.81, 0.18], 0xdeded8);
  group.add(computer);
  draggables.push({ object: computer, kind: "computer", ownerDeskIndex: index });

  addBox(group, [0.55, 0.08, 0.5], [0, 0.45, 0.78], 0xf1f1ee);
  addBox(group, [0.55, 0.65, 0.08], [0, 0.74, 1.0], 0xeeeeea);
  [
    [-0.21, 0.22, 0.62],
    [0.21, 0.22, 0.62],
    [-0.21, 0.22, 0.94],
    [0.21, 0.22, 0.94],
  ].forEach((pos) => addBox(group, [0.04, 0.45, 0.04], pos as [number, number, number], 0xd7d7d2));

  scene.add(group);
};

const buildCoffeeBar = (scene: THREE.Scene, draggables: DraggableSceneObject[] = []) => {
  const group = new THREE.Group();
  group.position.copy(coffeeBarCenter);
  addBox(group, [coffeeBarSize.width, 0.025, coffeeBarSize.depth], [0, 0.012, 0], 0xf7f2ea);
  addBox(group, [4.4, 0.76, 0.82], [0, 0.38, 0], 0xeeeeea);
  addBox(group, [4.48, 0.08, 0.9], [0, 0.8, 0], 0xf5f5f2);
  [-1.65, -0.95, -0.25, 0.45, 1.15, 1.85].forEach((x) => addBox(group, [0.022, 0.48, 0.025], [x, 0.38, 0.45], 0xd6d6d0));

  const cupColors = [0x8a4f2b, 0xb36b35, 0xc47a3c];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      addCylinder(group, 0.055, 0.062, 0.1, [-1.75 + col * 0.25, 0.92, -0.25 + row * 0.22], cupColors[(row + col) % cupColors.length]);
    }
  }

  addBox(group, [0.62, 0.72, 0.58], [1.55, 1.16, -0.05], 0xbfc0bd);
  addBox(group, [0.46, 0.32, 0.035], [1.55, 1.16, 0.28], 0x777777);
  addBox(group, [0.48, 0.1, 0.34], [1.55, 1.52, -0.05], 0xd4d5d2);
  addBox(group, [0.58, 0.04, 0.42], [1.55, 0.82, 0.25], 0x999999);
  [
    [0.95, 0.86, 0.54],
    [1.25, 0.86, 0.54],
    [1.85, 0.86, 0.54],
  ].forEach((pos, index) => {
    const cup = new THREE.Group();
    cup.position.set(pos[0], pos[1], pos[2]);
    cup.userData.draggableKind = "coffee";
    cup.userData.homeParent = group;
    cup.userData.homePosition = cup.position.clone();
    cup.userData.homeRotation = cup.rotation.clone();
    addCylinder(cup, 0.08, 0.068, 0.12, [0, 0.06, 0], [0x7c2d12, 0xb45309, 0xf59e0b][index]);
    addCylinder(cup, 0.064, 0.06, 0.018, [0, 0.128, 0], 0xfef3c7);
    addBox(cup, [0.018, 0.056, 0.018], [0.082, 0.064, 0], 0xf8fafc);
    group.add(cup);
    draggables.push({ object: cup, kind: "coffee" });
  });
  scene.add(group);
};

const buildTrashBin = (scene: THREE.Scene) => {
  const group = new THREE.Group();
  group.position.copy(trashBinCenter);
  addCylinder(group, 0.32, 0.25, 0.64, [0, 0.32, 0], 0x6b7280);
  addCylinder(group, 0.36, 0.32, 0.08, [0, 0.68, 0], 0x374151);
  addCylinder(group, 0.24, 0.2, 0.55, [0, 0.36, 0], 0x111827);
  addBox(group, [0.54, 0.055, 0.18], [0, 0.85, 0], 0x4b5563);
  const label = createTextSprite("回收桶", true);
  label.position.set(0, 1.16, 0);
  label.scale.set(0.9, 0.28, 1);
  group.add(label);
  scene.add(group);
};

const buildRestroom = (scene: THREE.Scene) => {
  const group = new THREE.Group();
  group.position.copy(restroomCenter);
  addBox(group, [restroomSize.width, 0.025, restroomSize.depth], [0, 0.012, 0], 0xf3f3f0);
  addBox(group, [0.08, 0.92, restroomSize.depth], [-restroomSize.width / 2, 0.46, 0], 0xeeeeea);
  addBox(group, [restroomSize.width, 0.92, 0.08], [0, 0.46, -restroomSize.depth / 2], 0xeeeeea);
  addBox(group, [2.45, 0.92, 0.08], [-0.72, 0.46, restroomSize.depth / 2], 0xeeeeea);

  addCylinder(group, 0.24, 0.2, 0.2, [0.78, 0.2, -0.48], 0xffffff);
  addCylinder(group, 0.24, 0.2, 0.055, [0.78, 0.36, -0.48], 0xf1f1ed);
  addBox(group, [0.44, 0.3, 0.18], [0.78, 0.52, -0.82], 0xf1f1ed);

  addBox(group, [0.56, 0.18, 0.36], [-1.05, 0.68, 0.58], 0xf0f0ed);
  addBox(group, [0.12, 0.66, 0.12], [-1.05, 0.35, 0.58], 0xe2e2dc);
  addCylinder(group, 0.014, 0.014, 0.28, [-1.05, 0.86, 0.44], 0x9b9b96, [Math.PI / 2, 0, 0]);
  addBox(group, [0.72, 0.5, 0.045], [-1.05, 0.84, -restroomSize.depth / 2 + 0.1], 0xdbeafe);
  scene.add(group);
};

const buildClassroom = (scene: THREE.Scene) => {
  const group = new THREE.Group();
  group.position.copy(classroomCenter);
  addBox(group, [classroomSize.width, 0.025, classroomSize.depth], [0, 0.012, 0], 0xf7f7f2);
  addBox(group, [classroomSize.width, 0.96, 0.08], [0, 0.48, -classroomSize.depth / 2], 0xe5e7eb);
  addBox(group, [0.08, 0.96, classroomSize.depth], [-classroomSize.width / 2, 0.48, 0], 0xeeeeea);
  addBox(group, [0.08, 0.96, classroomSize.depth * 0.52], [classroomSize.width / 2, 0.48, -classroomSize.depth * 0.22], 0xeeeeea);
  addBox(group, [2.95, 0.68, 0.045], [-0.25, 0.72, -classroomSize.depth / 2 + 0.18], 0x3f5f55);
  addBox(group, [0.92, 0.38, 0.035], [2.0, 0.78, -classroomSize.depth / 2 + 0.17], 0x111827);
  addBox(group, [1.65, 0.06, 0.42], [-0.25, 0.43, -classroomSize.depth / 2 + 0.78], 0xeeeeea);
  addBox(group, [0.32, 0.58, 0.08], [-0.92, 0.24, -classroomSize.depth / 2 + 0.78], 0xd8d8d3);
  addBox(group, [0.32, 0.58, 0.08], [0.42, 0.24, -classroomSize.depth / 2 + 0.78], 0xd8d8d3);
  addCylinder(group, 0.055, 0.055, 0.8, [2.48, 0.42, -classroomSize.depth / 2 + 0.52], 0xcbd5e1);
  addBox(group, [0.76, 0.42, 0.04], [2.48, 0.84, -classroomSize.depth / 2 + 0.66], 0xffffff);
  [-2.1, -1.05, 0, 1.05, 2.1].forEach((x) => {
    [-0.9, -0.32, 0.26, 0.84, 1.42].forEach((z) => {
      addBox(group, [0.72, 0.06, 0.42], [x, 0.42, z], 0xeeeeea);
      addBox(group, [0.48, 0.08, 0.42], [x, 0.28, z + 0.38], 0xf0f0ec);
      addBox(group, [0.05, 0.32, 0.05], [x - 0.28, 0.22, z - 0.14], 0xd6d6d0);
      addBox(group, [0.05, 0.32, 0.05], [x + 0.28, 0.22, z - 0.14], 0xd6d6d0);
    });
  });
  const label = createTextSprite("教室", false);
  label.position.set(0, 1.35, -0.15);
  label.scale.set(1.05, 0.32, 1);
  group.add(label);
  scene.add(group);
};

const buildMeetingRoom = (scene: THREE.Scene) => {
  const group = new THREE.Group();
  group.position.copy(meetingRoomCenter);
  addBox(group, [meetingRoomSize.width, 0.025, meetingRoomSize.depth], [0, 0.012, 0], 0xf6f6f1);
  addBox(group, [meetingRoomSize.width, 0.9, 0.08], [0, 0.45, -meetingRoomSize.depth / 2], 0xe5e7eb);
  addBox(group, [0.08, 0.9, meetingRoomSize.depth], [-meetingRoomSize.width / 2, 0.45, 0], 0xeff6ff);
  addBox(group, [0.08, 0.9, meetingRoomSize.depth * 0.52], [meetingRoomSize.width / 2, 0.45, -meetingRoomSize.depth * 0.23], 0xeff6ff);
  addBox(group, [1.72, 0.65, 0.04], [0, 0.76, -meetingRoomSize.depth / 2 + 0.18], 0x293241);
  addBox(group, [3.55, 0.12, 2.05], [0, 0.48, 0], 0xe9e7df);
  addBox(group, [0.12, 0.22, 0.12], [-1.25, 0.31, -0.72], 0xd8d8d3);
  addBox(group, [0.12, 0.22, 0.12], [1.25, 0.31, -0.72], 0xd8d8d3);
  addBox(group, [0.12, 0.22, 0.12], [-1.25, 0.31, 0.72], 0xd8d8d3);
  addBox(group, [0.12, 0.22, 0.12], [1.25, 0.31, 0.72], 0xd8d8d3);
  [
    [-2.1, 0.3, -1.18],
    [-1.05, 0.3, -1.42],
    [0, 0.3, -1.48],
    [1.05, 0.3, -1.42],
    [2.1, 0.3, -1.18],
    [-2.1, 0.3, 1.18],
    [-1.05, 0.3, 1.42],
    [0, 0.3, 1.48],
    [1.05, 0.3, 1.42],
    [2.1, 0.3, 1.18],
    [-2.2, 0.3, -0.28],
    [-2.2, 0.3, 0.45],
    [2.2, 0.3, -0.28],
    [2.2, 0.3, 0.45],
  ].forEach((pos) => addBox(group, [0.32, 0.08, 0.32], pos as [number, number, number], 0xeeeeea));
  [-0.38, 0, 0.38].forEach((x) => addCylinder(group, 0.035, 0.035, 0.1, [x, 0.58, -0.18], 0x64748b));
  const label = createTextSprite("会议室", false);
  label.position.set(0, 1.34, -0.05);
  label.scale.set(1.05, 0.32, 1);
  group.add(label);
  scene.add(group);
};

const buildChatRoundTable = (scene: THREE.Scene, center: THREE.Vector3, seatCount: number, clusterIndex: number, snakeTargets: THREE.Object3D[] = []) => {
  const group = new THREE.Group();
  group.position.set(center.x, 0, center.z);
  const visualSeatCount = seatCount > 0 ? seatCount : 4;
  const tableRadius = Math.min(1.28, 0.46 + Math.sqrt(visualSeatCount) * 0.15);
  const accentColors = [0x7dd3fc, 0x86efac, 0xfde68a, 0xfca5a5, 0xc4b5fd, 0xfdba74];
  addCylinder(group, tableRadius, tableRadius, 0.12, [0, 0.5, 0], 0xf3f4f0);
  const tabletop = addCylinder(group, tableRadius * 0.94, tableRadius * 0.94, 0.018, [0, 0.575, 0], accentColors[clusterIndex % accentColors.length]);
  tabletop.userData.snakeGameTable = true;
  snakeTargets.push(tabletop);
  addCylinder(group, 0.08, 0.11, 0.48, [0, 0.25, 0], 0xd4d4cf);
  addCylinder(group, tableRadius * 0.42, tableRadius * 0.48, 0.035, [0, 0.035, 0], 0xcbcbc4);
  const chairCount = Math.min(visualSeatCount, 36);
  for (let index = 0; index < chairCount; index += 1) {
    const angle = -Math.PI / 2 + (index / chairCount) * Math.PI * 2;
    const chairRadius = tableRadius + 0.48;
    const x = Math.cos(angle) * chairRadius;
    const z = Math.sin(angle) * chairRadius;
    const chair = new THREE.Group();
    chair.position.set(x, 0, z);
    chair.rotation.y = Math.atan2(x, z);
    addBox(chair, [0.28, 0.07, 0.28], [0, 0.29, 0], 0xeeeeea);
    addBox(chair, [0.28, 0.38, 0.055], [0, 0.51, 0.16], 0xe5e7eb);
    [
      [-0.1, 0.15, -0.1],
      [0.1, 0.15, -0.1],
      [-0.1, 0.15, 0.1],
      [0.1, 0.15, 0.1],
    ].forEach((pos) => addBox(chair, [0.035, 0.3, 0.035], pos as [number, number, number], 0xd6d6d0));
    group.add(chair);
  }
  scene.add(group);
};

const getDiscussionTableCenter = (selectedZones: DiscussionZone[], clusterIndex: number) => {
  const zone = selectedZones[Math.min(selectedZones.length - 1, clusterIndex)];
  return new THREE.Vector3(zone.center.x, 0.04, zone.center.z);
};

const buildDiscussionZones = (scene: THREE.Scene, selectedZones: DiscussionZone[]) => {
  for (const zone of selectedZones) {
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(zone.width, 0.018, zone.depth), makeTransparentMat(zone.color, 0.48));
    carpet.position.set(zone.center.x, 0.006, zone.center.z);
    carpet.receiveShadow = true;
    scene.add(carpet);
    const label = createTextSprite(zone.label, false);
    label.position.set(zone.center.x, 0.16, zone.center.z - zone.depth / 2 + 0.36);
    label.scale.set(1.35, 0.38, 1);
    scene.add(label);
  }
};

const buildHallways = (scene: THREE.Scene) => {
  const group = new THREE.Group();
  addBox(group, [17.4, 0.018, 0.72], [1.05, 0.01, -2.05], 0xe8ecef);
  addBox(group, [0.72, 0.018, 8.65], [1.15, 0.012, 2.35], 0xe8ecef);
  addBox(group, [0.72, 0.018, 3.5], [classroomCenter.x + classroomSize.width / 2 + 0.45, 0.012, -4.2], 0xe8ecef);
  addBox(group, [0.72, 0.018, 3.5], [meetingRoomCenter.x - meetingRoomSize.width / 2 - 0.45, 0.012, -4.2], 0xe8ecef);
  addBox(group, [16.9, 0.018, 0.08], [1.05, 0.025, -1.68], 0xcbd5e1);
  addBox(group, [16.9, 0.018, 0.08], [1.05, 0.025, -2.42], 0xcbd5e1);
  scene.add(group);
};

type AgentSpec = {
  id: string;
  label: string;
  accent: number;
  bodyColor: number;
  position: [number, number];
  selected?: boolean;
  role: "focused" | "normal" | "patrol";
  workload?: MemberWorkload;
  capacityScore?: number;
  emoji: string;
};

type AgentState = "idle" | "walking" | "sitting" | "working" | "resting" | "running" | "drinking" | "toilet" | "leaving";

type AgentRig = {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  label: THREE.Sprite;
  thought: THREE.Sprite;
  role: AgentSpec["role"];
};

const addLimb = (
  parent: THREE.Object3D,
  length: number,
  radius: number,
  pos: [number, number, number],
  rotation: [number, number, number],
  color = 0x3ddc84,
) => {
  const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), makeMat(color));
  limb.position.set(...pos);
  limb.rotation.set(...rotation);
  limb.castShadow = true;
  parent.add(limb);
  return limb;
};

const buildAgent = (scene: THREE.Scene, spec: AgentSpec) => {
  const group = new THREE.Group();
  group.position.set(spec.position[0], 0.04, spec.position[1]);
  group.rotation.y = -0.08;
  group.scale.setScalar(1.18);

  const loadScore = Math.max(0, Math.min(100, spec.workload?.summary.capacity_score ?? spec.capacityScore ?? 22));
  const fillRatio = 0.18 + (loadScore / 100) * 0.82;
  const loadColor = spec.bodyColor;
  const shellMat = makeTransparentMat(loadColor, spec.selected ? 0.68 : 0.5, 0.58);
  const armMat = makeLoadMat(loadColor, spec.selected ? 0.86 : 0.72);
  const loadMat = makeLoadMat(loadColor, spec.selected ? 0.96 : 0.9);
  const darkerGray = spec.accent;
  const body = addBox(group, [0.34, 0.36, 0.24], [0, 0.58, 0.12], loadColor);
  body.material = shellMat;
  body.renderOrder = 2;
  body.rotation.x = -0.08;
  const bodyCoreHeight = 0.32 * fillRatio;
  const bodyCore = new THREE.Mesh(new THREE.BoxGeometry(0.28, bodyCoreHeight, 0.18), loadMat);
  bodyCore.position.set(0, -0.16 + bodyCoreHeight / 2, 0.024);
  bodyCore.castShadow = false;
  body.add(bodyCore);
  const head = addSphere(group, 0.18, [0, 0.9, 0.08], loadColor, [1, 0.72, 1]);
  head.material = shellMat;
  head.renderOrder = 2;
  addCylinder(group, 0.012, 0.012, 0.2, [-0.08, 1.03, 0.08], darkerGray, [0.55, 0, -0.45]);
  addCylinder(group, 0.012, 0.012, 0.2, [0.08, 1.03, 0.08], darkerGray, [0.55, 0, 0.45]);
  addSphere(group, 0.022, [-0.065, 0.92, 0.23], 0xffffff);
  addSphere(group, 0.022, [0.065, 0.92, 0.23], 0xffffff);
  const leftArm = addLimb(group, 0.3, 0.045, [-0.24, 0.61, 0.08], [1.35, 0.08, 0.18], loadColor);
  const rightArm = addLimb(group, 0.3, 0.045, [0.24, 0.61, 0.08], [1.35, -0.08, -0.18], loadColor);
  const leftLeg = addLimb(group, 0.01, 0.001, [-0.09, 0.28, 0.18], [0.08, 0, 0], loadColor);
  const rightLeg = addLimb(group, 0.01, 0.001, [0.09, 0.28, 0.18], [0.08, 0, 0], loadColor);
  leftArm.material = armMat;
  rightArm.material = armMat;
  leftLeg.material = armMat;
  rightLeg.material = armMat;
  leftLeg.visible = false;
  rightLeg.visible = false;
  addBox(group, [0.28, 0.06, 0.22], [0, 0.35, 0.18], 0xaeb0ac);
  const loadHalo = addCylinder(group, 0.25, 0.25, 0.018, [0, 0.08, 0.12], loadColor);
  loadHalo.material = makeLoadMat(loadColor, spec.selected ? 0.52 : 0.34);
  loadHalo.receiveShadow = false;
  const badge = addBox(group, [0.16, 0.035, 0.04], [0, 0.64, 0.245], loadColor);
  badge.material = makeLoadMat(loadColor, 0.9);
  badge.rotation.z = -0.35;

  const label = createTextSprite(spec.label, spec.selected);
  label.position.set(0, 1.44, 0);
  group.add(label);
  const thought = createEmojiSprite(spec.emoji);
  thought.position.set(0.48, 1.86, 0);
  group.add(thought);
  scene.add(group);
  group.userData.memberId = spec.id;
  return { group, body, head, leftArm, rightArm, leftLeg, rightLeg, label, thought, role: spec.role };
};

const setAgentPose = (rig: AgentRig, state: AgentState, phase: number) => {
  const walk = Math.sin(phase * 7);
  const run = Math.sin(phase * 12);
  rig.group.scale.setScalar(1.18);
  rig.group.position.y = 0.04;
  rig.group.rotation.z = rig.role === "patrol" && state !== "sitting" && state !== "working" ? -0.08 : 0;
  rig.body.position.set(0, 0.58, 0.12);
  rig.body.rotation.set(-0.08, 0, 0);
  rig.head.position.set(0, 0.9, 0.08);
  rig.head.rotation.y = Math.sin(phase * 1.7) * 0.12;
  rig.leftArm.position.set(-0.24, 0.61, 0.08);
  rig.rightArm.position.set(0.24, 0.61, 0.08);
  rig.leftLeg.position.set(-0.09, 0.28, 0.18);
  rig.rightLeg.position.set(0.09, 0.28, 0.18);
  rig.label.position.y = 1.44;
  rig.thought.position.set(0.48, 1.86, 0);

  if (state === "walking" || state === "leaving") {
    rig.group.position.y = 0.04 + Math.abs(walk) * 0.035;
    rig.leftArm.rotation.set(1.15, 0, 0.35 + walk * 0.42);
    rig.rightArm.rotation.set(1.15, 0, -0.35 - walk * 0.42);
    rig.leftLeg.rotation.set(0.18 + walk * 0.48, 0, 0.05);
    rig.rightLeg.rotation.set(0.18 - walk * 0.48, 0, -0.05);
    rig.leftArm.rotation.set(0.18, 0, 0.16);
    rig.rightArm.rotation.set(0.18, 0, -0.16);
    return;
  }

  if (state === "sitting" || state === "working") {
    rig.group.position.y = -0.08;
    rig.body.position.set(0, 0.5, 0.2);
    rig.body.rotation.set(-0.18, 0, 0);
    rig.head.position.set(0, 0.78, 0.12);
    rig.leftArm.rotation.set(1.5 + Math.sin(phase * 9) * 0.06, 0.08, 0.28);
    rig.rightArm.rotation.set(1.5 + Math.cos(phase * 9) * 0.06, -0.08, -0.28);
    rig.leftLeg.rotation.set(1.38, 0.15, 0.06);
    rig.rightLeg.rotation.set(1.38, -0.15, -0.06);
    rig.label.position.y = 1.32;
    rig.thought.position.set(0.48, 1.68, 0);
    return;
  }

  if (state === "resting") {
    rig.group.position.y = -0.12;
    rig.body.position.set(0, 0.43, 0.25);
    rig.body.rotation.set(-0.72, 0, 0);
    rig.head.position.set(0, 0.54, 0.43);
    rig.head.rotation.set(-0.42, Math.sin(phase * 0.8) * 0.04, 0);
    rig.leftArm.rotation.set(1.82, 0.1, 0.62);
    rig.rightArm.rotation.set(1.82, -0.1, -0.62);
    rig.leftLeg.rotation.set(1.4, 0.12, 0.06);
    rig.rightLeg.rotation.set(1.4, -0.12, -0.06);
    rig.label.position.y = 1.16;
    rig.thought.position.set(0.5, 1.48, 0);
    rig.thought.visible = true;
    return;
  }

  if (state === "running") {
    rig.group.position.y = 0.04 + Math.abs(run) * 0.065;
    rig.leftArm.rotation.set(1.0, 0, 0.52 + run * 0.62);
    rig.rightArm.rotation.set(1.0, 0, -0.52 - run * 0.62);
    rig.leftLeg.rotation.set(0.16 + run * 0.75, 0, 0.08);
    rig.rightLeg.rotation.set(0.16 - run * 0.75, 0, -0.08);
    return;
  }

  if (state === "drinking") {
    rig.body.rotation.set(-0.26, 0, 0);
    rig.leftArm.rotation.set(0.35, 0.1, 0.18);
    rig.rightArm.rotation.set(1.35, -0.2, -0.45);
    rig.head.rotation.y = Math.sin(phase * 4) * 0.08;
    return;
  }

  rig.group.position.y = 0.04 + Math.sin(phase * 2) * 0.018;
  rig.leftArm.rotation.set(1.35, 0.08, 0.18);
  rig.rightArm.rotation.set(1.35, -0.08, -0.18);
  rig.leftLeg.rotation.set(0.08, 0, 0.04);
  rig.rightLeg.rotation.set(0.08, 0, -0.04);
};

type LabAvatar = {
  id: string;
  name: string;
  selected?: boolean;
  workload?: MemberWorkload;
  member?: Member;
  area?: AreaKey;
  presenceStatus?: PresenceStatus;
  larkStatus?: LarkUserStatus;
  larkEmojiPath?: string;
  focusActive?: boolean;
  focusTaskId?: string;
  busySlots?: BusySlot[];
  classes?: ClassSchedule[];
  chatCluster?: LabChatCluster;
  interactions?: LabInteractionSummary;
};

const fallbackAvatars: LabAvatar[] = [
  { id: "fallback-marvis", name: "Marvis", selected: true },
  { id: "fallback-computer", name: "Computer Agent" },
  { id: "fallback-file", name: "File Agent" },
];

type WorkloadFilter = "all" | "overdue" | "free" | "busy";
type LabScope = "department" | "all";
type SpecialtyFilter = "all" | "research" | "development";
type AreaKey = "workspace" | "classroom" | "meeting_room" | "away";
type PresenceStatus = "auto" | "working" | "focusing" | "resting" | "classroom" | "meeting_room" | "away";
type InteractionTool = LabInteractionKind;
const WORKSTATION_LIMIT = 80;
const PRESENCE_STORAGE_KEY = "cloud-lab-presence-statuses";
const FOCUS_STORAGE_KEY = "insight-lab-focus-session";

const specialtyLabels: Record<SpecialtyFilter, string> = {
  all: "全实验室",
  research: "科研专岗",
  development: "开发专岗",
};

const memberMatchesSpecialty = (member: Member, specialty: SpecialtyFilter) => {
  if (specialty === "all") return true;
  const text = [
    member.department,
    member.position,
    member.title,
    member.research_area,
    member.bio,
    member.extra_memberships,
  ].filter(Boolean).join(" ");
  const keywords = specialty === "research"
    ? ["科研", "研究", "论文", "学术", "课题", "实验"]
    : ["开发", "前端", "后端", "工程", "软件", "系统", "算法", "数据", "技术"];
  return keywords.some((keyword) => text.includes(keyword));
};

const presenceStatusLabels: Record<PresenceStatus, string> = {
  auto: "自动",
  working: "工作中",
  focusing: "专注中",
  resting: "休息中",
  classroom: "上课中",
  meeting_room: "开会中",
  away: "外出",
};

const presenceStatusEmojis: Record<PresenceStatus, string[]> = {
  auto: [],
  working: [emojiAsset("fendou")],
  focusing: [emojiAsset("bisheng")],
  resting: [emojiAsset("kafei")],
  classroom: [emojiAsset("kan")],
  meeting_room: [emojiAsset("guzhang")],
  away: [emojiAsset("zaijian")],
};

const areaEmojis: Record<AreaKey, string[]> = {
  workspace: [emojiAsset("fendou"), emojiAsset("jizhi"), emojiAsset("lingguangyishan")],
  classroom: [emojiAsset("kan"), emojiAsset("sikao"), emojiAsset("jizhi")],
  meeting_room: [emojiAsset("guzhang"), emojiAsset("xiaoguzhang"), emojiAsset("ok")],
  away: [emojiAsset("zaijian"), emojiAsset("qingshu"), emojiAsset("taiyang")],
};

const getAvatarEmoji = (avatar: LabAvatar, fallback: string[], index: number) => {
  if (avatar.larkEmojiPath) return avatar.larkEmojiPath;
  const status = avatar.presenceStatus || "auto";
  const statusEmojis = presenceStatusEmojis[status];
  if (statusEmojis.length) return statusEmojis[index % statusEmojis.length];
  const area = avatar.area || "workspace";
  const scoped = areaEmojis[area] || fallback;
  return scoped[index % scoped.length] || fallback[index % fallback.length] || emojiAsset("weixiao");
};

const primaryAreaKeys: AreaKey[] = ["workspace", "classroom", "meeting_room"];
const developerOpenIds = new Set(["ou_20fec537961e0a66669370b00d0fc52d", "ou_c544c4877658cfa1df6cee41939b99c4"]);

type StoredFocusSession = {
  taskId: string;
  active: boolean;
};

const areaLabels: Record<AreaKey, string> = {
  workspace: "工作区",
  classroom: "教室",
  meeting_room: "会议室",
  away: "离线/外出",
};

const areaDescriptions: Record<AreaKey, string> = {
  workspace: "没有会议或课程冲突的成员优先安排在工作区",
  classroom: "培训、课程或课堂活动命中的成员自动归到教室",
  meeting_room: "日历会议或飞书开会中状态命中的成员自动归到会议室",
  away: "请假、外出或离线成员不参与现场研发排布",
};

const classroomCenter = new THREE.Vector3(-4.85, 0, -4.95);
const meetingRoomCenter = new THREE.Vector3(7.25, 0, -4.95);
const classroomSize = { width: 7.35, depth: 4.85 };
const meetingRoomSize = { width: 6.45, depth: 4.65 };
const coffeeBarCenter = new THREE.Vector3(-6.15, 0, 4.35);
const restroomCenter = new THREE.Vector3(-6.15, 0, -0.35);
const trashBinCenter = new THREE.Vector3(-8.95, 0, 5.35);
const coffeeBarSize = { width: 4.8, depth: 1.85 };
const restroomSize = { width: 3.9, depth: 2.55 };
const discussionZoneCenter = new THREE.Vector3(16.45, 0, -4.9);
const coffeeDiscussionZoneCenter = new THREE.Vector3(-3.15, 0, 5.0);
const MIN_DISCUSSION_TABLES = 3;
const MAX_DISCUSSION_TABLES = 6;
const discussionZones = [
  { center: discussionZoneCenter, width: 3.25, depth: 3.05, label: "群聊圆桌区", color: 0xdbeafe },
  { center: new THREE.Vector3(16.45, 0, -1.1), width: 3.25, depth: 2.65, label: "右侧圆桌区", color: 0xe0e7ff },
  { center: coffeeDiscussionZoneCenter, width: 2.75, depth: 2.75, label: "咖啡前圆桌区", color: 0xdcfce7 },
  { center: new THREE.Vector3(-3.15, 0, 2.35), width: 2.75, depth: 2.75, label: "咖啡下方圆桌区", color: 0xfef3c7 },
  { center: new THREE.Vector3(2.1, 0, 0.15), width: 2.85, depth: 2.45, label: "中央圆桌区", color: 0xfce7f3 },
  { center: new THREE.Vector3(12.25, 0, -1.55), width: 2.95, depth: 2.45, label: "右前圆桌区", color: 0xccfbf1 },
  { center: new THREE.Vector3(24.55, 0, -5.25), width: 2.9, depth: 2.75, label: "边侧圆桌区", color: 0xe9d5ff },
  { center: new THREE.Vector3(28.15, 0, -3.25), width: 2.9, depth: 2.75, label: "右侧备用区", color: 0xffedd5 },
  { center: new THREE.Vector3(24.55, 0, -1.05), width: 2.9, depth: 2.75, label: "右侧讨论区", color: 0xdbeafe },
  { center: new THREE.Vector3(28.15, 0, 1.15), width: 2.9, depth: 2.75, label: "右侧开放区", color: 0xdcfce7 },
  { center: new THREE.Vector3(24.55, 0, 3.15), width: 2.9, depth: 2.75, label: "右侧协作区", color: 0xfce7f3 },
  { center: new THREE.Vector3(28.15, 0, 5.35), width: 2.9, depth: 2.75, label: "右侧交流区", color: 0xccfbf1 },
];

type FootprintRect = {
  center: THREE.Vector3;
  width: number;
  depth: number;
  padding?: number;
};

type DiscussionZone = (typeof discussionZones)[number];

const rectsOverlap = (left: FootprintRect, right: FootprintRect, padding = 0) =>
  Math.abs(left.center.x - right.center.x) < (left.width + right.width) / 2 + (left.padding || 0) + (right.padding || 0) + padding
  && Math.abs(left.center.z - right.center.z) < (left.depth + right.depth) / 2 + (left.padding || 0) + (right.padding || 0) + padding;

const zoneFootprint = (zone: Pick<DiscussionZone, "center" | "width" | "depth">): FootprintRect => ({
  center: zone.center,
  width: zone.width,
  depth: zone.depth,
  padding: 0.24,
});

const getStaticObjectFootprints = (deskTargets: ReturnType<typeof createDeskTargets>): FootprintRect[] => [
  { center: classroomCenter, width: classroomSize.width, depth: classroomSize.depth, padding: 0.18 },
  { center: meetingRoomCenter, width: meetingRoomSize.width, depth: meetingRoomSize.depth, padding: 0.18 },
  { center: coffeeBarCenter, width: coffeeBarSize.width, depth: coffeeBarSize.depth, padding: 0.16 },
  { center: restroomCenter, width: restroomSize.width, depth: restroomSize.depth, padding: 0.16 },
  ...deskTargets.map((desk) => ({
    center: new THREE.Vector3(desk.position.x, 0, desk.position.z - 0.18),
    width: 2.4,
    depth: 2.05,
    padding: 0.18,
  })),
];

const selectDiscussionZones = (tableCount: number, deskTargets: ReturnType<typeof createDeskTargets>) => {
  const staticFootprints = getStaticObjectFootprints(deskTargets);
  const selected: DiscussionZone[] = [];
  const addNonOverlappingZone = (zone: DiscussionZone, zonePadding: number, objectPadding: number) => {
    if (selected.length >= tableCount || selected.includes(zone)) return;
    const footprint = zoneFootprint(zone);
    const hitsStaticObject = staticFootprints.some((object) => rectsOverlap(footprint, object, objectPadding));
    const hitsSelectedZone = selected.some((item) => rectsOverlap(footprint, zoneFootprint(item), zonePadding));
    if (!hitsStaticObject && !hitsSelectedZone) selected.push(zone);
  };
  for (const zone of discussionZones) {
    addNonOverlappingZone(zone, 0.3, 0.18);
  }
  for (const zone of discussionZones) {
    addNonOverlappingZone(zone, 0.14, 0.08);
  }
  return selected;
};

const getDeskLayout = (count: number) => {
  const columnCount = count <= 8 ? 4 : count <= 18 ? 6 : count <= 42 ? 8 : Math.min(10, Math.max(8, Math.ceil(count / 8)));
  const compact = count > 42;
  return {
    columnCount,
    xGap: count <= 8 ? 3.0 : count <= 18 ? 2.65 : count <= 42 ? 2.32 : 2.18,
    zGap: count <= 8 ? 2.35 : count <= 18 ? 2.1 : count <= 42 ? 1.9 : 1.82,
    xStart: count <= 8 ? -1.2 : count <= 18 ? -0.35 : count <= 42 ? 0.35 : 1.2,
    zStart: count <= 8 ? 9.2 : count <= 18 ? 10.0 : count <= 42 ? 10.55 : 10.8,
    compact,
  };
};

const getSceneBounds = (workstationCount: number) => {
  const count = Math.max(8, workstationCount);
  const layout = getDeskLayout(count);
  const rows = Math.max(1, Math.ceil(count / layout.columnCount));
  const deskMinX = layout.xStart - 1.2;
  const deskMaxX = layout.xStart + (layout.columnCount - 1) * layout.xGap + (layout.compact ? 1.9 : 1.45);
  const deskMaxZ = layout.zStart + 1.0;
  const deskMinZ = layout.zStart - (rows - 1) * layout.zGap - 1.85;
  const discussionMinX = Math.min(...discussionZones.map((zone) => zone.center.x - zone.width / 2));
  const discussionMaxX = Math.max(...discussionZones.map((zone) => zone.center.x + zone.width / 2));
  const discussionMinZ = Math.min(...discussionZones.map((zone) => zone.center.z - zone.depth / 2));
  const discussionMaxZ = Math.max(...discussionZones.map((zone) => zone.center.z + zone.depth / 2));
  const minX = Math.min(
    deskMinX,
    classroomCenter.x - classroomSize.width / 2,
    coffeeBarCenter.x - coffeeBarSize.width / 2,
    restroomCenter.x - restroomSize.width / 2,
    discussionMinX,
  );
  const maxX = Math.max(deskMaxX, meetingRoomCenter.x + meetingRoomSize.width / 2, discussionMaxX);
  const minZ = Math.min(
    deskMinZ,
    classroomCenter.z - classroomSize.depth / 2,
    meetingRoomCenter.z - meetingRoomSize.depth / 2,
    restroomCenter.z - restroomSize.depth / 2,
    discussionMinZ,
  );
  const maxZ = Math.max(
    deskMaxZ,
    coffeeBarCenter.z + coffeeBarSize.depth / 2,
    discussionMaxZ,
  );
  const width = maxX - minX;
  const depth = maxZ - minZ;
  return {
    center: new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
    floorWidth: width + 1.15,
    floorDepth: depth + 1.2,
    cameraSize: Math.max(11.5, Math.max(width * 0.56, depth * 0.94)),
  };
};

const seededOffset = (index: number, salt: number) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const createDeskTargets = (count: number) => {
  const { columnCount, xGap, zGap, xStart, zStart } = getDeskLayout(count);
  return Array.from({ length: count }, (_, index) => {
    const col = index % columnCount;
    const row = Math.floor(index / columnCount);
    const rowOffset = count > 8 && row % 2 === 1 ? (count > 42 ? 0.62 : 0.9) : 0;
    const jitterX = count > 4 ? (seededOffset(index, 1) - 0.5) * (count > 42 ? 0.26 : 0.38) : 0;
    const jitterZ = count > 4 ? (seededOffset(index, 2) - 0.5) * (count > 42 ? 0.18 : 0.28) : 0;
    const rowLean = count > 8 ? (row % 3 - 1) * 0.04 + (seededOffset(index, 3) - 0.5) * 0.12 : -0.08;
    return {
      key: `desk-${index}`,
      position: new THREE.Vector3(xStart + rowOffset + col * xGap + jitterX, 0.04, zStart - row * zGap + jitterZ),
      face: rowLean,
    };
  });
};

const createRoomTargets = (
  centerX: number,
  centerZ: number,
  columns: number,
  rows: number,
  xGap: number,
  zGap: number,
  jitter = 0.08,
  salt = 17,
) =>
  Array.from({ length: columns * rows }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return new THREE.Vector3(
      centerX + (col - (columns - 1) / 2) * xGap + (seededOffset(index, salt + 1) - 0.5) * jitter,
      0.04,
      centerZ + (row - (rows - 1) / 2) * zGap + (seededOffset(index, salt + 2) - 0.5) * jitter * 0.75,
    );
  }).sort((left, right) => {
    const leftScore = seededOffset(Math.round((left.x - centerX) * 100 + (left.z - centerZ) * 300), salt + 9);
    const rightScore = seededOffset(Math.round((right.x - centerX) * 100 + (right.z - centerZ) * 300), salt + 9);
    return leftScore - rightScore;
  });

const classroomTargets = createRoomTargets(classroomCenter.x, classroomCenter.z + 0.18, 7, 5, 1.05, 0.82, 0.18, 41);
const meetingTargets = [
  [-2.1, -1.58],
  [-1.05, -1.68],
  [0, -1.72],
  [1.05, -1.68],
  [2.1, -1.58],
  [-2.1, 1.58],
  [-1.05, 1.68],
  [0, 1.72],
  [1.05, 1.68],
  [2.1, 1.58],
  [-2.42, -0.62],
  [-2.42, 0.32],
  [2.42, -0.62],
  [2.42, 0.32],
  [-1.55, -1.92],
  [1.55, -1.92],
  [-1.55, 1.92],
  [1.55, 1.92],
  [-2.7, -1.12],
  [2.7, -1.12],
  [-2.7, 0.82],
  [2.7, 0.82],
].map(([x, z], index) => new THREE.Vector3(
  meetingRoomCenter.x + x + (seededOffset(index, 61) - 0.5) * 0.04,
  0.04,
  meetingRoomCenter.z + z + (seededOffset(index, 62) - 0.5) * 0.04,
));

const faceToward = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

const areaViewConfig: Record<AreaKey | "overview", { lookAt: THREE.Vector3; camera: THREE.Vector3 }> = {
  overview: { lookAt: new THREE.Vector3(5.1, 0, 2.35), camera: new THREE.Vector3(17.8, 18.5, 16.2) },
  workspace: { lookAt: new THREE.Vector3(5.25, 0, 2.75), camera: new THREE.Vector3(13.6, 14.4, 13.2) },
  classroom: { lookAt: classroomCenter.clone(), camera: classroomCenter.clone().add(new THREE.Vector3(4.3, 7.2, 4.4)) },
  meeting_room: { lookAt: meetingRoomCenter.clone(), camera: meetingRoomCenter.clone().add(new THREE.Vector3(4.2, 7.2, 4.3)) },
  away: { lookAt: new THREE.Vector3(-6.15, 0, 0.55), camera: new THREE.Vector3(-2.2, 5.8, 3.1) },
};

const awayTargets = createRoomTargets(restroomCenter.x + 0.2, restroomCenter.z + 1.45, 6, 4, 0.52, 0.42);

const spreadSeatIndex = (index: number, total: number, slotCount: number) => {
  if (slotCount <= 1) return 0;
  if (total <= 1) return Math.floor(slotCount / 2);
  const span = slotCount / Math.max(1, Math.min(total, slotCount));
  const bandStart = Math.floor(index * span);
  const bandEnd = Math.max(bandStart, Math.min(slotCount - 1, Math.floor((index + 1) * span) - 1));
  const bandSize = bandEnd - bandStart + 1;
  const offset = Math.floor(seededOffset(index, 31) * bandSize);
  return Math.max(0, Math.min(slotCount - 1, bandStart + offset));
};

const taskStatusLabel: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  blocked: "受阻",
  done: "完成",
  cancelled: "取消",
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "无截止";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const formatTimeRange = (start?: string | null, end?: string | null) => {
  const left = formatDateTime(start);
  const right = formatDateTime(end);
  return `${left} - ${right}`;
};

const nowInSlot = (slot: BusySlot, now = new Date()) => {
  const start = new Date(slot.start_at);
  const end = new Date(slot.end_at);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= now && end >= now;
};

const timeToMinutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const nowInClassSchedule = (item: ClassSchedule, now = new Date()) => {
  const day = now.getDay() || 7;
  if (item.day_of_week !== day) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return timeToMinutes(item.start_time) <= current && current <= timeToMinutes(item.end_time);
};

const getAreaForMember = (slots: BusySlot[] = [], classes: ClassSchedule[] = []): AreaKey => {
  const current = slots.filter((slot) => nowInSlot(slot));
  if (current.some((slot) => slot.kind === "leave")) return "away";
  if (current.some((slot) => slot.kind === "class")) return "classroom";
  if (current.some((slot) => slot.kind === "event")) return "meeting_room";
  if (classes.some((item) => nowInClassSchedule(item))) return "classroom";
  return "workspace";
};

const getAreaForStatus = (status: PresenceStatus, fallback: AreaKey): AreaKey => {
  if (status === "focusing") return "workspace";
  if (status === "classroom") return "classroom";
  if (status === "meeting_room") return "meeting_room";
  if (status === "away") return "away";
  return fallback;
};

const getInitialStateForAvatar = (avatar: LabAvatar, capacityScore: number): AgentState => {
  if (avatar.focusActive || avatar.presenceStatus === "focusing") return "working";
  if (avatar.presenceStatus === "resting") return "resting";
  if (avatar.chatCluster && avatar.area === "workspace") return "sitting";
  if (avatar.area === "classroom" || avatar.area === "meeting_room") return "sitting";
  if (avatar.area === "workspace" && (avatar.presenceStatus === "working" || capacityScore >= 35)) return "working";
  return "idle";
};

const getLockedStateForAvatar = (avatar: LabAvatar): AgentState | null => {
  if (avatar.focusActive || avatar.presenceStatus === "focusing") return "working";
  if (avatar.presenceStatus === "resting") return "resting";
  if (avatar.presenceStatus === "working") return "working";
  if (avatar.presenceStatus === "classroom" || avatar.presenceStatus === "meeting_room") return "sitting";
  if (avatar.presenceStatus === "away") return "idle";
  if (avatar.chatCluster && avatar.area === "workspace") return "sitting";
  if (avatar.area === "classroom" || avatar.area === "meeting_room") return "sitting";
  if (avatar.area === "away") return "idle";
  return null;
};

const workloadTone = (score: number) => {
  if (score >= 70) return "#ef4444";
  if (score >= 35) return "#f59e0b";
  return "#22c55e";
};

const matchesFilter = (avatar: LabAvatar, filter: WorkloadFilter) => {
  const summary = avatar.workload?.summary;
  if (filter === "all" || !summary) return true;
  if (filter === "overdue") return summary.overdue_tasks > 0;
  if (filter === "free") return summary.capacity_score < 35;
  return summary.capacity_score >= 70;
};

const toLocalIso = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  const timezoneOffset = -value.getTimezoneOffset();
  const sign = timezoneOffset >= 0 ? "+" : "-";
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}${sign}${pad(Math.floor(Math.abs(timezoneOffset) / 60))}:${pad(Math.abs(timezoneOffset) % 60)}`;
};

const toDateTimeLocalValue = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

const parseChineseDateTime = (text: string, fallbackHours = 1) => {
  const value = new Date();
  value.setMinutes(0, 0, 0);
  value.setHours(value.getHours() + fallbackHours);
  if (text.includes("后天")) value.setDate(value.getDate() + 2);
  else if (text.includes("明天")) value.setDate(value.getDate() + 1);
  const hourMatch = text.match(/(\d{1,2})\s*(点|:|：)(\d{1,2})?/);
  if (hourMatch) {
    let hour = Number(hourMatch[1]);
    const minute = hourMatch[3] ? Number(hourMatch[3]) : 0;
    if ((text.includes("下午") || text.includes("晚上")) && hour < 12) hour += 12;
    if (text.includes("中午") && hour < 11) hour += 12;
    value.setHours(Math.min(23, hour), Math.min(59, minute), 0, 0);
  } else if (text.includes("上午")) {
    value.setHours(10, 0, 0, 0);
  } else if (text.includes("下午")) {
    value.setHours(15, 0, 0, 0);
  } else if (text.includes("晚上")) {
    value.setHours(19, 0, 0, 0);
  }
  return value;
};

const stripCommandNoise = (text: string) =>
  text
    .replace(/^(请|帮我|帮忙|麻烦|现在|立即|给|向|为)+/, "")
    .replace(/(同步到飞书|发送通知|通知一下|通知|谢谢)$/g, "")
    .trim();

const findMentionedMembers = (text: string, members: Member[]) =>
  members.filter((member) => member.name && text.includes(member.name)).slice(0, 12);

const extractTaskTitle = (text: string, members: Member[]) => {
  let title = stripCommandNoise(text);
  members.forEach((member) => {
    title = title.replace(member.name, "");
  });
  title = title
    .replace(/(布置|安排|派发|分配)?(一个|一项)?任务/g, "")
    .replace(/(今天|明天|后天|上午|下午|晚上|\d{1,2}\s*(点|:|：)\d{0,2}|前|之前|完成)/g, "")
    .trim();
  return title || "云实验室语音任务";
};

const extractMeetingTitle = (text: string, members: Member[]) => {
  let title = stripCommandNoise(text);
  members.forEach((member) => {
    title = title.replace(member.name, "");
  });
  title = title
    .replace(/(安排|创建|发起|开|约)?(一个|一场)?(会议|会|同步会|讨论)/g, "")
    .replace(/(今天|明天|后天|上午|下午|晚上|\d{1,2}\s*(点|:|：)\d{0,2}|在|会议室|项目室|评审区|教室|研发区|工作区)/g, "")
    .trim();
  return title || "云实验室语音会议";
};

const extractLocation = (text: string) => {
  const match = text.match(/在([^，。,.]*?(会议室|项目室|评审区|教室|研发区|工作区|线上|实验室))/);
  if (match?.[1]) return match[1].trim();
  if (text.includes("会议室") || text.includes("项目室")) return "会议室";
  if (text.includes("评审区") || text.includes("教室")) return "教室";
  if (text.includes("研发区") || text.includes("工作区")) return "工作区";
  if (text.includes("线上")) return "线上会议室";
  return "会议室";
};

const LabScene = ({
  avatars,
  chatClusters,
  activeArea,
  selectedId,
  activeInteractionTool,
  onUseInteractionTool,
  onOpenSnakeGame,
  onSelectMember,
}: {
  avatars: LabAvatar[];
  chatClusters: LabChatCluster[];
  activeArea: AreaKey | null;
  selectedId?: string | null;
  activeInteractionTool: InteractionTool | null;
  onUseInteractionTool: (memberIds: string | string[], kind: InteractionTool) => void;
  onOpenSnakeGame: () => void;
  onSelectMember: (memberId: string) => void;
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null | undefined>(selectedId);
  const onSelectMemberRef = useRef(onSelectMember);
  const activeInteractionToolRef = useRef<InteractionTool | null>(activeInteractionTool);
  const onUseInteractionToolRef = useRef(onUseInteractionTool);
  const onOpenSnakeGameRef = useRef(onOpenSnakeGame);
  const avatarsRef = useRef(avatars);
  const activeAreaRef = useRef<AreaKey | null>(activeArea);
  const cameraControlsRef = useRef<null | { setArea: (area: AreaKey | null) => void }>(null);
  const sceneMembersKey = useMemo(
    () => [
      avatars.map((avatar) => `${avatar.id}:${avatar.area || "workspace"}:${avatar.presenceStatus || "auto"}:${avatar.chatCluster?.cluster_id || ""}`).join("|"),
      chatClusters.map((cluster) => `${cluster.cluster_id}:${cluster.member_open_ids.join(",")}:${cluster.thoughts.slice(0, 2).join("/")}`).join("|"),
    ].join("::"),
    [avatars, chatClusters],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    activeInteractionToolRef.current = activeInteractionTool;
  }, [activeInteractionTool]);

  useEffect(() => {
    avatarsRef.current = avatars;
  }, [avatars]);

  useEffect(() => {
    activeAreaRef.current = activeArea;
    cameraControlsRef.current?.setArea(activeArea);
  }, [activeArea]);

  useEffect(() => {
    onSelectMemberRef.current = onSelectMember;
  }, [onSelectMember]);

  useEffect(() => {
    onUseInteractionToolRef.current = onUseInteractionTool;
  }, [onUseInteractionTool]);

  useEffect(() => {
    onOpenSnakeGameRef.current = onOpenSnakeGame;
  }, [onOpenSnakeGame]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f3);

    const plannedAvatars = avatars.length ? avatars.slice(0, WORKSTATION_LIMIT) : fallbackAvatars;
    const plannedDeskCount = Math.max(plannedAvatars.length, 8);
    const sceneBounds = getSceneBounds(plannedDeskCount);
    const plannedDeskLayout = getDeskLayout(plannedDeskCount);
    const plannedDeskRows = Math.max(1, Math.ceil(plannedDeskCount / plannedDeskLayout.columnCount));
    const deskAreaCenter = new THREE.Vector3(
      plannedDeskLayout.xStart + ((plannedDeskLayout.columnCount - 1) * plannedDeskLayout.xGap) / 2,
      0,
      plannedDeskLayout.zStart - ((plannedDeskRows - 1) * plannedDeskLayout.zGap) / 2,
    );
    const aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
    const cameraSize = sceneBounds.cameraSize;
    const camera = new THREE.OrthographicCamera(
      (-cameraSize * aspect) / 2,
      (cameraSize * aspect) / 2,
      cameraSize / 2,
      -cameraSize / 2,
      0.1,
      140,
    );
    const initialArea = activeAreaRef.current;
    const configuredView = areaViewConfig[initialArea || "overview"];
    const dynamicLookAt = !initialArea ? sceneBounds.center.clone() : initialArea === "workspace" ? deskAreaCenter.clone() : configuredView.lookAt.clone();
    const dynamicCamera = !initialArea
      ? sceneBounds.center.clone().add(new THREE.Vector3(sceneBounds.cameraSize * 0.72, sceneBounds.cameraSize * 0.96, sceneBounds.cameraSize * 0.72))
      : initialArea === "workspace"
        ? deskAreaCenter.clone().add(new THREE.Vector3(sceneBounds.cameraSize * 0.52, sceneBounds.cameraSize * 0.72, sceneBounds.cameraSize * 0.52))
        : configuredView.camera.clone();
    camera.position.copy(dynamicCamera);
    camera.lookAt(dynamicLookAt);
    const baseCameraPos = camera.position.clone();
    const baseLookAt = dynamicLookAt.clone();
    const targetCameraPos = baseCameraPos.clone();
    const targetLookAt = baseLookAt.clone();
    const view = {
      azimuth: Math.atan2(baseCameraPos.x - baseLookAt.x, baseCameraPos.z - baseLookAt.z),
      elevation: Math.atan2(baseCameraPos.y - baseLookAt.y, Math.hypot(baseCameraPos.x - baseLookAt.x, baseCameraPos.z - baseLookAt.z)),
      distance: baseCameraPos.distanceTo(baseLookAt),
      zoom: initialArea ? 1.05 : 1.0,
    };
    const clampZoom = (zoom: number) => Math.max(0.45, Math.min(6.0, zoom));
    const applyCameraZoom = () => {
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
    };
    applyCameraZoom();
    const syncCameraTarget = () => {
      const horizontal = Math.cos(view.elevation) * view.distance;
      targetCameraPos.set(
        targetLookAt.x + Math.sin(view.azimuth) * horizontal,
        targetLookAt.y + Math.sin(view.elevation) * view.distance,
        targetLookAt.z + Math.cos(view.azimuth) * horizontal,
      );
    };
    const clampCameraLookAt = () => {
      const margin = 0.7;
      targetLookAt.x = Math.max(sceneBounds.center.x - sceneBounds.floorWidth / 2 + margin, Math.min(sceneBounds.center.x + sceneBounds.floorWidth / 2 - margin, targetLookAt.x));
      targetLookAt.z = Math.max(sceneBounds.center.z - sceneBounds.floorDepth / 2 + margin, Math.min(sceneBounds.center.z + sceneBounds.floorDepth / 2 - margin, targetLookAt.z));
      targetLookAt.y = 0;
    };
    const moveCameraTarget = (forwardAmount: number, rightAmount: number) => {
      const forward = new THREE.Vector3(Math.sin(view.azimuth), 0, Math.cos(view.azimuth)).normalize();
      const right = new THREE.Vector3(Math.cos(view.azimuth), 0, -Math.sin(view.azimuth)).normalize();
      targetLookAt.addScaledVector(forward, forwardAmount);
      targetLookAt.addScaledVector(right, rightAmount);
      clampCameraLookAt();
      syncCameraTarget();
    };
    cameraControlsRef.current = {
      setArea: (area) => {
        const nextConfiguredView = areaViewConfig[area || "overview"];
        const nextLookAt = !area ? sceneBounds.center.clone() : area === "workspace" ? deskAreaCenter.clone() : nextConfiguredView.lookAt.clone();
        const nextCamera = !area
          ? sceneBounds.center.clone().add(new THREE.Vector3(sceneBounds.cameraSize * 0.72, sceneBounds.cameraSize * 0.96, sceneBounds.cameraSize * 0.72))
          : area === "workspace"
            ? deskAreaCenter.clone().add(new THREE.Vector3(sceneBounds.cameraSize * 0.52, sceneBounds.cameraSize * 0.72, sceneBounds.cameraSize * 0.52))
            : nextConfiguredView.camera.clone();
        targetLookAt.copy(nextLookAt);
        clampCameraLookAt();
        view.distance = nextCamera.distanceTo(nextLookAt);
        view.azimuth = Math.atan2(nextCamera.x - nextLookAt.x, nextCamera.z - nextLookAt.z);
        view.elevation = Math.atan2(nextCamera.y - nextLookAt.y, Math.hypot(nextCamera.x - nextLookAt.x, nextCamera.z - nextLookAt.z));
        view.zoom = area ? Math.max(view.zoom, 1.05) : Math.min(view.zoom, 1.0);
        syncCameraTarget();
        applyCameraZoom();
      },
    };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, avatars.length > 48 ? 1.15 : 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    sun.position.set(-5, 9, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowSpan = Math.max(sceneBounds.floorWidth, sceneBounds.floorDepth) / 2 + 2;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    scene.add(sun);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(sceneBounds.floorWidth, 0.04, sceneBounds.floorDepth), makeMat(0xf2f2ef));
    floor.position.set(sceneBounds.center.x, -0.02, sceneBounds.center.z);
    floor.receiveShadow = true;
    scene.add(floor);

    const draggableObjects: DraggableSceneObject[] = [];
    buildHallways(scene);
    buildCoffeeBar(scene, draggableObjects);
    buildTrashBin(scene);
    buildRestroom(scene);
    buildClassroom(scene);
    buildMeetingRoom(scene);

    const sceneAvatars = avatars.length ? avatars.slice(0, WORKSTATION_LIMIT) : fallbackAvatars;
    const deskTargetCount = Math.max(sceneAvatars.length, 8);
    const deskTargets = createDeskTargets(deskTargetCount);
    const monitorSurfaces: MonitorSurface[] = [];
    deskTargets.forEach((desk, index) => buildDesk(scene, desk.position.x, desk.position.z - 0.45, -0.08, index, monitorSurfaces, draggableObjects));
    type ChatPlacement = {
      target: THREE.Vector3;
      center: THREE.Vector3;
      face: number;
      cluster: LabChatCluster;
    };
    const chatPlacements = new Map<string, ChatPlacement>();
    const sceneAvatarById = new Map(sceneAvatars.map((avatar) => [avatar.id, avatar]));
    const discussionParticipants = (cluster: LabChatCluster) =>
      cluster.member_open_ids
        .map((openId) => sceneAvatarById.get(openId))
        .filter((avatar): avatar is LabAvatar => Boolean(avatar && avatar.area === "workspace" && avatar.presenceStatus !== "focusing"));
    const discussionClusters = chatClusters
      .filter((cluster) => discussionParticipants(cluster).length >= 2)
      .slice(0, MAX_DISCUSSION_TABLES);
    const discussionTableCount = Math.min(MAX_DISCUSSION_TABLES, Math.max(MIN_DISCUSSION_TABLES, discussionClusters.length));
    const selectedDiscussionZones = selectDiscussionZones(discussionTableCount, deskTargets);
    buildDiscussionZones(scene, selectedDiscussionZones);
    const snakeGameTargets: THREE.Object3D[] = [];
    selectedDiscussionZones.forEach((_, clusterIndex) => {
      const cluster = discussionClusters[clusterIndex];
      const items = cluster ? discussionParticipants(cluster) : [];
      const center = getDiscussionTableCenter(selectedDiscussionZones, clusterIndex);
      const seatCount = items.length;
      buildChatRoundTable(scene, center, seatCount, clusterIndex, snakeGameTargets);
      const radius = Math.min(1.78, 0.86 + Math.sqrt(Math.max(seatCount, 1)) * 0.14);
      items.forEach((avatar, memberIndex) => {
        if (!cluster) return;
        if (avatar.chatCluster?.cluster_id !== cluster.cluster_id) return;
        const angle = -Math.PI / 2 + (memberIndex / Math.max(1, items.length)) * Math.PI * 2;
        const target = new THREE.Vector3(center.x + Math.cos(angle) * radius, 0.04, center.z + Math.sin(angle) * radius);
        chatPlacements.set(avatar.id, { target, center, face: Math.atan2(center.x - target.x, center.z - target.z), cluster });
      });
      if (!cluster) return;
      const thought = cluster.thoughts[0]?.replace(/^[^:：]+[:：]\s*/, "") || "正在讨论";
      const label = createTextSprite(`${cluster.chat_name || cluster.cluster_id} · ${items.length}人\n${thought}`, true);
      label.position.set(center.x, 2.3, center.z);
      label.scale.set(2.38, 0.76, 1);
      scene.add(label);
    });
    const idlePoints = [
      new THREE.Vector3(-2.2, 0.04, 2.1),
      new THREE.Vector3(-1.2, 0.04, -0.85),
      new THREE.Vector3(0.25, 0.04, 2.8),
      new THREE.Vector3(0.65, 0.04, -1.45),
      new THREE.Vector3(-2.6, 0.04, -1.35),
    ];
    const coffeeTargets = [
      new THREE.Vector3(coffeeBarCenter.x + 1.6, 0.04, coffeeBarCenter.z - 0.55),
      new THREE.Vector3(coffeeBarCenter.x + 2.35, 0.04, coffeeBarCenter.z - 0.58),
    ];
    const toiletEntry = new THREE.Vector3(restroomCenter.x + 3.1, 0.04, restroomCenter.z - 0.6);
    const toiletTarget = new THREE.Vector3(restroomCenter.x + 2.15, 0.04, restroomCenter.z - 1.1);
    const occupied = new Set<string>();
    const restrictedWanderZones = [
      { center: classroomCenter, size: classroomSize, padding: 0.42 },
      { center: meetingRoomCenter, size: meetingRoomSize, padding: 0.42 },
      { center: coffeeBarCenter, size: coffeeBarSize, padding: 0.35 },
      { center: restroomCenter, size: restroomSize, padding: 0.35 },
    ];
    const isWanderAllowed = (position: THREE.Vector3) =>
      restrictedWanderZones.every((zone) => !isInsideRect(position, zone.center, zone.size, zone.padding));
    const randomFloorPoint = () => {
      const minX = sceneBounds.center.x - sceneBounds.floorWidth / 2 + 0.55;
      const maxX = sceneBounds.center.x + sceneBounds.floorWidth / 2 - 0.55;
      const minZ = sceneBounds.center.z - sceneBounds.floorDepth / 2 + 0.55;
      const maxZ = sceneBounds.center.z + sceneBounds.floorDepth / 2 - 0.55;
      for (let attempt = 0; attempt < 36; attempt += 1) {
        const point = new THREE.Vector3(
          minX + Math.random() * (maxX - minX),
          0.04,
          minZ + Math.random() * (maxZ - minZ),
        );
        if (isWanderAllowed(point)) return point;
      }
      return new THREE.Vector3(sceneBounds.center.x + (Math.random() - 0.5) * 2.4, 0.04, sceneBounds.center.z + (Math.random() - 0.5) * 2.4);
    };
    const randomCoffeePoint = () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const point = new THREE.Vector3(
          coffeeBarCenter.x + 1.45 + Math.random() * 1.55,
          0.04,
          coffeeBarCenter.z - 0.9 + Math.random() * 0.7,
        );
        if (isWanderAllowed(point)) return point;
      }
      return randomFloorPoint();
    };

    type RuntimeAgent = {
      rig: AgentRig;
      state: AgentState;
      route: THREE.Vector3[];
      target: THREE.Vector3;
      holdUntil: number;
      speed: number;
      phaseOffset: number;
      capacityScore: number;
      baseArea: AreaKey;
      status: PresenceStatus;
      occupiedKey?: string;
      preferred: AgentSpec["role"];
      lockedState?: AgentState | null;
      areaSeatIndex: number;
      areaSeatTotal: number;
      chatTarget?: THREE.Vector3;
      chatFace?: number;
      nextThoughtAt: number;
      thoughtUntil: number;
      lastPosition: THREE.Vector3;
      stuckSince: number;
      routeAttempt: number;
      throwMotion?: {
        startAt: number;
        duration: number;
        origin: THREE.Vector3;
        apex: THREE.Vector3;
        previousState: AgentState;
        previousHoldUntil: number;
      };
    };

    const buildRoute = (from: THREE.Vector3, to: THREE.Vector3, attempt = 0) => {
      const route = [from.clone()];
      const jitter = (seededOffset(attempt + Math.round(from.x * 10) + Math.round(to.z * 7), 91) - 0.5) * 1.2;
      if (to.x > 0.5) {
        const aisleX = to.x > 10 ? 10.6 + jitter : to.x > 2.5 ? 2.5 + jitter * 0.55 : -0.65 + jitter * 0.35;
        route.push(new THREE.Vector3(aisleX, 0.04, from.z));
        if (Math.abs(to.z - from.z) > 3.2) route.push(new THREE.Vector3(aisleX, 0.04, (from.z + to.z) / 2 + jitter));
        route.push(new THREE.Vector3(aisleX, 0.04, to.z));
      } else if (to.x < -3) {
        const aisleX = -2.35 + jitter * 0.5;
        route.push(new THREE.Vector3(aisleX, 0.04, from.z));
        route.push(new THREE.Vector3(aisleX, 0.04, to.z));
      } else {
        const aisleX = -0.65 + jitter * 0.45;
        route.push(new THREE.Vector3(aisleX, 0.04, from.z));
        route.push(new THREE.Vector3(aisleX, 0.04, to.z));
      }
      route.push(to.clone());
      return route.filter((point, index) => index === 0 || point.distanceTo(route[index - 1]) > 0.08);
    };

    const release = (agent: RuntimeAgent) => {
      if (agent.occupiedKey) occupied.delete(agent.occupiedKey);
      agent.occupiedKey = undefined;
    };

    const randomFrom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

    const chooseDesk = () => {
      const free = deskTargets.filter((desk) => !occupied.has(desk.key));
      return free.length ? randomFrom(free) : undefined;
    };

    const sendTo = (agent: RuntimeAgent, target: THREE.Vector3, nextState: AgentState, speed = 0.78) => {
      agent.routeAttempt = (agent.routeAttempt + 1) % 9;
      agent.route = buildRoute(agent.rig.group.position, target, agent.routeAttempt);
      agent.target = target.clone();
      agent.state = nextState === "walking" ? "walking" : "walking";
      agent.speed = speed;
      agent.holdUntil = 0;
      agent.stuckSince = 0;
      agent.lastPosition.copy(agent.rig.group.position);
      agent.rig.group.userData.nextState = nextState;
    };

    const isInsideRect = (position: THREE.Vector3, center: THREE.Vector3, size: { width: number; depth: number }, padding = 0.15) =>
      Math.abs(position.x - center.x) <= size.width / 2 + padding
      && Math.abs(position.z - center.z) <= size.depth / 2 + padding;

    const forcePlace = (agent: RuntimeAgent, target: THREE.Vector3, nextState: AgentState, face = Math.PI) => {
      release(agent);
      agent.route = [];
      agent.target = target.clone();
      agent.state = nextState;
      agent.holdUntil = Number.POSITIVE_INFINITY;
      agent.rig.group.position.set(target.x, target.y, target.z);
      agent.rig.group.rotation.y = face;
      agent.rig.group.userData.nextState = nextState;
      agent.rig.group.userData.face = face;
    };

    const targetForArea = (targets: THREE.Vector3[], index: number, total: number) => {
      const base = targets[spreadSeatIndex(index, total, targets.length)].clone();
      const overflow = Math.floor(index / targets.length);
      if (overflow <= 0) return base;
      const ring = overflow * 0.34;
      const angle = ((index * 5) % 16) * (Math.PI / 8);
      base.x += Math.cos(angle) * ring;
      base.z += Math.sin(angle) * ring;
      return base;
    };

    const forcePlaceInArea = (agent: RuntimeAgent, area: AreaKey) => {
      if (area === "classroom") {
        forcePlace(agent, targetForArea(classroomTargets, agent.areaSeatIndex, agent.areaSeatTotal), "sitting", Math.PI);
        return true;
      }
      if (area === "meeting_room") {
        const target = targetForArea(meetingTargets, agent.areaSeatIndex, agent.areaSeatTotal);
        forcePlace(agent, target, "sitting", faceToward(target, meetingRoomCenter));
        return true;
      }
      if (area === "away") {
        forcePlace(agent, targetForArea(awayTargets, agent.areaSeatIndex, agent.areaSeatTotal), "idle", agent.rig.group.rotation.y);
        return true;
      }
      return false;
    };

    const sendStatusTarget = (agent: RuntimeAgent, status: PresenceStatus, area: AreaKey, now: number) => {
      release(agent);
      agent.status = status;
      agent.baseArea = area;
      agent.lockedState = getLockedStateForAvatar({ presenceStatus: status, area } as LabAvatar);
      if (status === "working" || status === "focusing" || status === "resting") {
        const desk = chooseDesk();
        if (desk) {
          occupied.add(desk.key);
          agent.occupiedKey = desk.key;
          agent.rig.group.userData.face = desk.face;
          sendTo(agent, desk.position, status === "resting" ? "resting" : "working", status === "resting" ? 0.42 : 0.72);
          return;
        }
      }
      if (status === "classroom") {
        forcePlaceInArea(agent, "classroom");
        return;
      }
      if (status === "meeting_room") {
        forcePlaceInArea(agent, "meeting_room");
        return;
      }
      if (status === "away") {
        forcePlaceInArea(agent, "away");
        return;
      }
      if (status === "auto" && area === "workspace" && agent.chatTarget) {
        forcePlace(agent, agent.chatTarget, "sitting", agent.chatFace ?? Math.PI);
        return;
      }
      if (forcePlaceInArea(agent, area)) {
        return;
      }
      agent.lockedState = getLockedStateForAvatar({ presenceStatus: "auto", area } as LabAvatar);
      agent.holdUntil = now;
      decideNext(agent, now);
    };

    const decideNext = (agent: RuntimeAgent, now: number) => {
      release(agent);
      if (agent.state === "resting") {
        const desk = chooseDesk();
        if (desk) {
          occupied.add(desk.key);
          agent.occupiedKey = desk.key;
          agent.rig.group.userData.face = desk.face;
          sendTo(agent, desk.position, "resting", 0.42);
          return;
        }
      }
      if (agent.lockedState) {
        agent.state = agent.lockedState;
        agent.holdUntil = now + 999;
        const expectedClassroomTarget = targetForArea(classroomTargets, agent.areaSeatIndex, agent.areaSeatTotal);
        const expectedMeetingTarget = agent.chatTarget || targetForArea(meetingTargets, agent.areaSeatIndex, agent.areaSeatTotal);
        const expectedAwayTarget = targetForArea(awayTargets, agent.areaSeatIndex, agent.areaSeatTotal);
        if (agent.baseArea === "classroom" && (!isInsideRect(agent.rig.group.position, classroomCenter, classroomSize) || agent.rig.group.position.distanceTo(expectedClassroomTarget) > 0.08)) {
          forcePlaceInArea(agent, "classroom");
        } else if (agent.baseArea === "meeting_room" && (!isInsideRect(agent.rig.group.position, meetingRoomCenter, meetingRoomSize) || agent.rig.group.position.distanceTo(expectedMeetingTarget) > 0.08)) {
          forcePlaceInArea(agent, "meeting_room");
        } else if (agent.baseArea === "away" && agent.rig.group.position.distanceTo(expectedAwayTarget) > 0.08) {
          forcePlaceInArea(agent, "away");
        }
        return;
      }
      const roll = Math.random();
      const veryFree = agent.capacityScore < 20;
      const canWander = veryFree && agent.baseArea === "workspace" && agent.status === "auto";
      const wanderWeight = canWander ? 0.22 : 0.02;
      if (canWander && roll < wanderWeight) {
        sendTo(agent, randomFloorPoint(), "idle", 0.72);
        return;
      }
      if (veryFree && roll < wanderWeight + 0.06) {
        agent.rig.group.userData.face = Math.PI;
        sendTo(agent, randomCoffeePoint(), "drinking", 0.6);
        return;
      }
      if (veryFree && roll < wanderWeight + 0.1 && !occupied.has("toilet")) {
        occupied.add("toilet");
        agent.occupiedKey = "toilet";
        agent.routeAttempt = (agent.routeAttempt + 1) % 9;
        agent.route = buildRoute(agent.rig.group.position, toiletEntry, agent.routeAttempt);
        agent.route.push(toiletTarget.clone());
        agent.target = toiletTarget.clone();
        agent.state = "walking";
        agent.speed = 0.62;
        agent.holdUntil = 0;
        agent.stuckSince = 0;
        agent.lastPosition.copy(agent.rig.group.position);
        agent.rig.group.userData.nextState = "toilet";
        return;
      }
      {
        const desk = chooseDesk();
        if (desk) {
          occupied.add(desk.key);
          agent.occupiedKey = desk.key;
          agent.rig.group.userData.face = desk.face;
          sendTo(agent, desk.position, agent.capacityScore < 20 ? "sitting" : "working", agent.capacityScore < 20 ? 0.52 : 0.68);
          return;
        }
      }
      sendTo(agent, randomFloorPoint(), "idle", 0.58);
    };

    const allSpawnPoints = [
      ...deskTargets.map((desk) => desk.position),
      ...idlePoints,
      ...coffeeTargets,
      new THREE.Vector3(-2.1, 0.04, 2.8),
      new THREE.Vector3(-1.6, 0.04, 0.45),
      new THREE.Vector3(0.25, 0.04, 1.5),
      new THREE.Vector3(3.25, 0.04, 3.35),
      new THREE.Vector3(5.4, 0.04, -0.95),
      new THREE.Vector3(-3.55, 0.04, -1.35),
    ];
    const areaCounts: Record<AreaKey, number> = { workspace: 0, classroom: 0, meeting_room: 0, away: 0 };
    const initialAreaTotals = sceneAvatars.reduce<Record<AreaKey, number>>(
      (acc, avatar) => {
        acc[avatar.area || "workspace"] += 1;
        return acc;
      },
      { workspace: 0, classroom: 0, meeting_room: 0, away: 0 },
    );
    const agents: RuntimeAgent[] = sceneAvatars.map((avatar, index) => {
      const desk = deskTargets[index];
      const statusScore = avatar.focusActive || avatar.presenceStatus === "focusing"
        ? 78
        : avatar.presenceStatus === "meeting_room" || avatar.presenceStatus === "classroom"
          ? 66
          : avatar.presenceStatus === "working"
            ? 54
            : avatar.presenceStatus === "away"
              ? 30
              : avatar.presenceStatus === "resting"
              ? 16
                : 22;
      const capacityScore = avatar.workload?.summary.capacity_score ?? statusScore;
      const capacity = getCapacityStyle(avatar.workload, capacityScore);
      const role = capacity.role;
      const chatPlacement = chatPlacements.get(avatar.id);
      const area = avatar.area || "workspace";
      const areaIndex = areaCounts[area];
      areaCounts[area] += 1;
      const spawn = chatPlacement?.target || (area === "classroom"
        ? classroomTargets[spreadSeatIndex(areaIndex, initialAreaTotals.classroom, classroomTargets.length)]
        : area === "meeting_room"
          ? meetingTargets[spreadSeatIndex(areaIndex, initialAreaTotals.meeting_room, meetingTargets.length)]
          : area === "away"
            ? awayTargets[spreadSeatIndex(areaIndex, initialAreaTotals.away, awayTargets.length)]
            : desk.position);
      if ((capacityScore >= 35 || avatar.presenceStatus === "working" || avatar.presenceStatus === "focusing" || avatar.presenceStatus === "resting") && area === "workspace" && desk) occupied.add(desk.key);
      const emoji = avatar.focusActive ? emojiAsset("bisheng") : getAvatarEmoji(avatar, capacity.emoji, index);
      const initialState = getInitialStateForAvatar(avatar, capacityScore);
      const lockedState = getLockedStateForAvatar(avatar);
      const rig = buildAgent(scene, {
        id: avatar.id,
        label: avatar.name,
        accent: capacity.accent,
        bodyColor: capacity.body,
        position: [spawn.x, spawn.z],
        selected: selectedIdRef.current ? avatar.id === selectedIdRef.current : avatar.selected,
        role,
        workload: avatar.workload,
        capacityScore,
        emoji,
      });
      if (chatPlacement) rig.group.rotation.y = chatPlacement.face;
      else if (area === "meeting_room") rig.group.rotation.y = faceToward(spawn, meetingRoomCenter);
      return {
        rig,
        state: lockedState || initialState,
        route: [],
        target: spawn.clone(),
        holdUntil: lockedState ? Number.POSITIVE_INFINITY : 4 + index * 0.55,
        speed: capacityScore >= 70 ? 0.62 : capacityScore >= 35 ? 0.74 : 0.88,
        phaseOffset: index * 1.37,
        capacityScore,
        baseArea: area,
        status: avatar.presenceStatus || "auto",
        occupiedKey: (capacityScore >= 35 || avatar.presenceStatus === "working" || avatar.presenceStatus === "focusing" || avatar.presenceStatus === "resting") && area === "workspace" && desk ? desk.key : undefined,
        preferred: role,
        lockedState,
        areaSeatIndex: areaIndex,
        areaSeatTotal: initialAreaTotals[area],
        chatTarget: chatPlacement?.target,
        chatFace: chatPlacement?.face,
        nextThoughtAt: 4 + index * 1.9,
        thoughtUntil: 0,
        lastPosition: spawn.clone(),
        stuckSince: 0,
        routeAttempt: 0,
      };
    });
    type InteractionSceneEffect = {
      kind: InteractionTool;
      sprite: THREE.Sprite;
      startAt: number;
      duration: number;
      from: THREE.Vector3;
      to: THREE.Vector3;
      spin: number;
    };
    type WhipSceneEffect = {
      line: THREE.Line;
      label: THREE.Sprite;
      startAt: number;
      duration: number;
      from: THREE.Vector3;
      to: THREE.Vector3;
      control: THREE.Vector3;
    };
    const interactionEffects: InteractionSceneEffect[] = [];
    const whipEffects: WhipSceneEffect[] = [];
    let cameraShakeUntil = 0;
    let cameraShakePower = 0;
    const draggableRaycastTargets = draggableObjects.map((item) => item.object);
    const agentRaycastTargets = agents.map((agent) => agent.rig.group);
    const moveVector = new THREE.Vector3();
    let avatarSnapshotAt = -1;
    let latestAvatars = new Map<string, LabAvatar>();
    let latestAreaSeatTotals: Record<AreaKey, number> = { workspace: 0, classroom: 0, meeting_room: 0, away: 0 };
    const refreshAvatarSnapshot = (now: number) => {
      if (now - avatarSnapshotAt < 0.45) return;
      avatarSnapshotAt = now;
      latestAvatars = new Map(avatarsRef.current.map((avatar) => [avatar.id, avatar]));
      latestAreaSeatTotals = { workspace: 0, classroom: 0, meeting_room: 0, away: 0 };
      agents.forEach((agent) => {
        const latestAvatar = latestAvatars.get(agent.rig.group.userData.memberId as string);
        latestAreaSeatTotals[latestAvatar?.area || agent.baseArea] += 1;
      });
      const latestAreaSeatCounters: Record<AreaKey, number> = { workspace: 0, classroom: 0, meeting_room: 0, away: 0 };
      agents.forEach((agent) => {
        const latestAvatar = latestAvatars.get(agent.rig.group.userData.memberId as string);
        const latestArea = latestAvatar?.area || agent.baseArea;
        agent.areaSeatIndex = latestAreaSeatCounters[latestArea];
        agent.areaSeatTotal = latestAreaSeatTotals[latestArea];
        latestAreaSeatCounters[latestArea] += 1;
      });
    };

    const keepInsideScene = (agent: RuntimeAgent) => {
      const position = agent.rig.group.position;
      const minX = sceneBounds.center.x - sceneBounds.floorWidth / 2 + 0.48;
      const maxX = sceneBounds.center.x + sceneBounds.floorWidth / 2 - 0.48;
      const minZ = sceneBounds.center.z - sceneBounds.floorDepth / 2 + 0.48;
      const maxZ = sceneBounds.center.z + sceneBounds.floorDepth / 2 - 0.48;
      position.x = Math.max(minX, Math.min(maxX, position.x));
      position.z = Math.max(minZ, Math.min(maxZ, position.z));
      position.y = 0.04;
      if (agent.baseArea !== "workspace" || agent.lockedState || agent.chatTarget) return;
      restrictedWanderZones.forEach((zone) => {
        const halfWidth = zone.size.width / 2 + zone.padding;
        const halfDepth = zone.size.depth / 2 + zone.padding;
        const dx = position.x - zone.center.x;
        const dz = position.z - zone.center.z;
        if (Math.abs(dx) > halfWidth || Math.abs(dz) > halfDepth) return;
        const pushX = halfWidth - Math.abs(dx);
        const pushZ = halfDepth - Math.abs(dz);
        if (pushX < pushZ) {
          position.x = zone.center.x + Math.sign(dx || seededOffset(agent.phaseOffset, 73) - 0.5 || 1) * halfWidth;
        } else {
          position.z = zone.center.z + Math.sign(dz || seededOffset(agent.phaseOffset, 79) - 0.5 || 1) * halfDepth;
        }
      });
    };

    const collisionWeight = (agent: RuntimeAgent) => {
      if (agent.throwMotion) return 0;
      if (agent.lockedState || agent.chatTarget || agent.baseArea !== "workspace") return 0;
      if (agent.state === "walking") return 1;
      if (agent.state === "idle") return 0.72;
      return 0.48;
    };

    const resolveAgentCollisions = () => {
      const minDistance = 0.62;
      const minDistanceSq = minDistance * minDistance;
      const cellSize = 0.9;
      const nearbyOffsets = [-1, 0, 1];
      const grid = new Map<string, number[]>();
      agents.forEach((agent, index) => {
        const weight = collisionWeight(agent);
        if (weight <= 0) return;
        const position = agent.rig.group.position;
        const cellX = Math.floor(position.x / cellSize);
        const cellZ = Math.floor(position.z / cellSize);
        const key = `${cellX}:${cellZ}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(index);
        else grid.set(key, [index]);
      });
      for (let pass = 0; pass < 2; pass += 1) {
        grid.forEach((bucket, key) => {
          const [cellXRaw, cellZRaw] = key.split(":");
          const cellX = Number(cellXRaw);
          const cellZ = Number(cellZRaw);
          bucket.forEach((i) => {
            nearbyOffsets.forEach((offsetX) => {
              nearbyOffsets.forEach((offsetZ) => {
                const candidates = grid.get(`${cellX + offsetX}:${cellZ + offsetZ}`);
                if (!candidates) return;
                candidates.forEach((j) => {
                  if (j <= i) return;
                  const left = agents[i];
                  const right = agents[j];
                  const leftWeight = collisionWeight(left);
                  const rightWeight = collisionWeight(right);
                  if (leftWeight + rightWeight <= 0) return;
                  const leftPosition = left.rig.group.position;
                  const rightPosition = right.rig.group.position;
                  const dx = rightPosition.x - leftPosition.x;
                  const dz = rightPosition.z - leftPosition.z;
                  const distanceSq = dx * dx + dz * dz;
                  if (distanceSq >= minDistanceSq) return;
                  const distance = Math.sqrt(distanceSq) || 0.001;
                  const correction = (minDistance - distance) / (leftWeight + rightWeight);
                  const nx = dx / distance;
                  const nz = dz / distance;
                  if (leftWeight > 0) {
                    leftPosition.x -= nx * correction * leftWeight;
                    leftPosition.z -= nz * correction * leftWeight;
                    keepInsideScene(left);
                  }
                  if (rightWeight > 0) {
                    rightPosition.x += nx * correction * rightWeight;
                    rightPosition.z += nz * correction * rightWeight;
                    keepInsideScene(right);
                  }
                });
              });
            });
          });
        });
      }
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const drag = {
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      pointerId: 0,
    };
    const interaction = {
      object: null as THREE.Object3D | null,
      kind: null as DraggableKind | null,
      ownerDeskIndex: undefined as number | undefined,
      offset: new THREE.Vector3(),
      dragY: 0.18,
    };
    const floorDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18);
    const floorHit = new THREE.Vector3();
    const clickMemory = {
      memberId: "",
      count: 0,
      at: 0,
    };
    const activePointers = new Map<number, { x: number; y: number }>();
    const pressedKeys = new Set<string>();
    const pinch = {
      active: false,
      startDistance: 0,
      startZoom: view.zoom,
    };

    const pointerDistance = () => {
      const points = Array.from(activePointers.values());
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };
    const updatePointerRay = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };
    const pointerToFloor = (event: PointerEvent) => {
      updatePointerRay(event);
      return raycaster.ray.intersectPlane(floorDragPlane, floorHit) ? floorHit.clone() : null;
    };
    const agentByMemberId = (memberId: string) => agents.find((agent) => agent.rig.group.userData.memberId === memberId);
    const showAgentEmoji = (agent: RuntimeAgent, emoji: string, duration = 2.4) => {
      const material = agent.rig.thought.material as THREE.SpriteMaterial;
      const texture = new THREE.TextureLoader().load(emojiAsset(emoji));
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
      agent.rig.thought.visible = true;
      agent.thoughtUntil = clock.elapsedTime + duration;
      agent.nextThoughtAt = agent.thoughtUntil + 4;
    };
    const showAgentHappy = (agent: RuntimeAgent, coffee = false) => {
      showAgentEmoji(agent, coffee ? "kafei" : (seededOffset(agent.phaseOffset, 121) > 0.5 ? "xiao" : "weixiao"), 3.2);
      agent.state = coffee ? "drinking" : "resting";
      agent.holdUntil = clock.elapsedTime + 3.2;
    };
    const showComputerDiscardHappy = (agent: RuntimeAgent) => {
      showAgentEmoji(agent, seededOffset(agent.phaseOffset, 121) > 0.5 ? "xiao" : "weixiao", 3.2);
      agent.state = "resting";
      agent.holdUntil = clock.elapsedTime + 3.2;
    };
    const launchAgent = (memberId: string) => {
      const agent = agentByMemberId(memberId);
      if (!agent) return;
      const now = clock.elapsedTime;
      const origin = agent.rig.group.position.clone();
      const direction = new THREE.Vector3(
        seededOffset(agent.phaseOffset, 151) > 0.5 ? 1 : -1,
        0,
        seededOffset(agent.phaseOffset, 157) > 0.5 ? 0.55 : -0.55,
      ).normalize();
      agent.throwMotion = {
        startAt: now,
        duration: 2.15,
        origin,
        apex: origin.clone().add(direction.multiplyScalar(4.2)).add(new THREE.Vector3(0, 0, -0.25)),
        previousState: agent.state,
        previousHoldUntil: agent.holdUntil,
      };
      agent.route = [];
      agent.state = "running";
      agent.holdUntil = now + 2.15;
      showAgentEmoji(agent, "fendou", 2.2);
    };
    const spawnInteractionSprite = (kind: InteractionTool, to: THREE.Vector3, options?: { from?: THREE.Vector3; duration?: number; scale?: number; spin?: number }) => {
      const texture = makeInteractionTexture(kind);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      const from = options?.from || to.clone().add(new THREE.Vector3(-2.1, 2.1, 1.2));
      const scale = options?.scale || 0.78;
      sprite.position.copy(from);
      sprite.scale.set(scale, scale, 1);
      scene.add(sprite);
      interactionEffects.push({
        kind,
        sprite,
        startAt: clock.elapsedTime,
        duration: options?.duration || 0.68,
        from,
        to,
        spin: options?.spin ?? 7.2,
      });
    };
    const spawnWhipCrack = (agent: RuntimeAgent, target: THREE.Vector3) => {
      const side = seededOffset(agent.phaseOffset, 173) > 0.5 ? 1 : -1;
      const from = target.clone().add(new THREE.Vector3(side * 2.1, 0.95, 1.15));
      const to = target.clone().add(new THREE.Vector3(-side * 0.1, 0.05, -0.08));
      const control = target.clone().add(new THREE.Vector3(side * 0.75, 1.28, 0.45));
      const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 18 }, () => from.clone()));
      const material = new THREE.LineBasicMaterial({ color: 0x7c2d12, linewidth: 3, transparent: true, opacity: 1 });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      const label = createTextSprite("啪!", true);
      label.position.copy(to).add(new THREE.Vector3(0.1, 0.78, 0));
      label.scale.set(0.78, 0.34, 1);
      label.visible = false;
      scene.add(label);
      whipEffects.push({ line, label, startAt: clock.elapsedTime, duration: 0.62, from, to, control });
      agent.rig.group.userData.whipHitUntil = clock.elapsedTime + 0.72;
      cameraShakeUntil = clock.elapsedTime + 0.28;
      cameraShakePower = 0.045;
    };
    const playInteractionEffect = (memberId: string, kind: InteractionTool) => {
      const agent = agentByMemberId(memberId);
      if (!agent) return;
      const target = agent.rig.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      if (kind === "throw") {
        spawnInteractionSprite("throw", target.clone().add(new THREE.Vector3(0, 1.3, 0)), { duration: 0.48, scale: 0.62, spin: 3.4 });
        launchAgent(memberId);
        return;
      }
      if (kind === "hammer") {
        spawnInteractionSprite("hammer", target.clone().add(new THREE.Vector3(0, 0.22, 0)), {
          from: target.clone().add(new THREE.Vector3(0.15, 2.45, 0.05)),
          duration: 0.44,
          scale: 0.9,
          spin: 11,
        });
        showAgentEmoji(agent, "fendou", 2.1);
        agent.state = "running";
        agent.holdUntil = clock.elapsedTime + 1.35;
        agent.rig.group.rotation.z = 0.42;
        window.setTimeout(() => {
          agent.rig.group.rotation.z = 0;
        }, 260);
        return;
      }
      if (kind === "whip") {
        spawnWhipCrack(agent, target);
        showAgentEmoji(agent, "bisheng", 2.8);
        agent.state = "working";
        agent.holdUntil = clock.elapsedTime + 8;
        return;
      }
      if (kind === "water") {
        spawnInteractionSprite("water", target.clone().add(new THREE.Vector3(0, 0.15, 0)), {
          from: target.clone().add(new THREE.Vector3(-1.3, 1.4, 0.65)),
          duration: 0.48,
          scale: 0.82,
          spin: 10,
        });
        for (let index = 0; index < 6; index += 1) {
          spawnInteractionSprite("water", target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.55, (Math.random() - 0.5) * 1.1)), {
            from: target.clone().add(new THREE.Vector3(-1.2 + Math.random() * 0.8, 1.65 + Math.random() * 0.6, 0.3 + Math.random() * 0.5)),
            duration: 0.38 + Math.random() * 0.18,
            scale: 0.28 + Math.random() * 0.16,
            spin: 16,
          });
        }
        showAgentEmoji(agent, "han", 2.4);
        agent.state = "running";
        agent.holdUntil = clock.elapsedTime + 1.8;
        return;
      }
      spawnInteractionSprite(kind, target, { duration: kind === "egg" ? 0.54 : 0.72, scale: kind === "egg" ? 0.72 : 0.8, spin: kind === "egg" ? 13 : 5 });
      showAgentEmoji(agent, kind === "flower" ? "xiao" : "fendou", 2.4);
    };
    const xzDistance = (left: THREE.Vector3, right: THREE.Vector3) => Math.hypot(left.x - right.x, left.z - right.z);
    const resetDraggableHome = (object: THREE.Object3D) => {
      const homeParent = object.userData.homeParent as THREE.Object3D | undefined;
      const homePosition = object.userData.homePosition as THREE.Vector3 | undefined;
      const homeRotation = object.userData.homeRotation as THREE.Euler | undefined;
      if (!homeParent || !homePosition || !homeRotation) return false;
      homeParent.attach(object);
      object.visible = true;
      object.position.copy(homePosition);
      object.rotation.copy(homeRotation);
      object.scale.set(1, 1, 1);
      object.updateMatrixWorld(true);
      return true;
    };
    const homeWorldPosition = (object: THREE.Object3D) => {
      const homeParent = object.userData.homeParent as THREE.Object3D | undefined;
      const homePosition = object.userData.homePosition as THREE.Vector3 | undefined;
      if (!homeParent || !homePosition) return null;
      homeParent.updateMatrixWorld(true);
      return homeParent.localToWorld(homePosition.clone());
    };
    const handleMemberClick = (memberId: string) => {
      const now = clock.elapsedTime;
      clickMemory.count = clickMemory.memberId === memberId && now - clickMemory.at < 2.2 ? clickMemory.count + 1 : 1;
      clickMemory.memberId = memberId;
      clickMemory.at = now;
      const agent = agentByMemberId(memberId);
      if (agent && clickMemory.count >= 3) {
        showAgentEmoji(agent, "fendou", 2.8);
        agent.state = "running";
        agent.holdUntil = now + 1.5;
      }
    };
    const startObjectDrag = (event: PointerEvent) => {
      updatePointerRay(event);
      const hits = raycaster.intersectObjects(draggableRaycastTargets, true);
      const hit = hits.find((item) => {
        let parent: THREE.Object3D | null = item.object;
        while (parent) {
                  if (parent.userData.draggableKind && parent.visible && !parent.userData.discarded) return true;
          parent = parent.parent;
        }
        return false;
      });
      if (!hit) return false;
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.draggableKind) object = object.parent;
      if (object && object.userData.discarded) return false;
      if (!object) return false;
      const floor = pointerToFloor(event);
      if (!floor) return false;
      scene.attach(object);
      interaction.object = object;
      interaction.kind = object.userData.draggableKind as DraggableKind;
      interaction.ownerDeskIndex = object.userData.ownerDeskIndex as number | undefined;
      interaction.offset.copy(object.position).sub(floor);
      interaction.dragY = interaction.kind === "coffee" ? Math.max(0.86, object.position.y) : Math.max(0.18, object.position.y);
      interaction.object.position.y = interaction.dragY;
      drag.active = true;
      drag.moved = true;
      drag.pointerId = event.pointerId;
      return true;
    };
    const finishObjectDrag = (event: PointerEvent) => {
      const object = interaction.object;
      if (!object || !interaction.kind) return false;
      const floor = pointerToFloor(event);
      if (floor) object.position.set(floor.x + interaction.offset.x, interaction.dragY, floor.z + interaction.offset.z);
      if (interaction.kind === "computer") {
        const owner = typeof interaction.ownerDeskIndex === "number" ? agents[interaction.ownerDeskIndex] : undefined;
        if (xzDistance(object.position, trashBinCenter) < 1.05) {
          if (owner) showComputerDiscardHappy(owner);
          object.userData.discarded = true;
          object.parent?.remove(object);
          object.visible = false;
        } else {
          const home = homeWorldPosition(object);
          if (home && xzDistance(object.position, home) < 1.35) {
            resetDraggableHome(object);
          } else {
            if (owner) showComputerDiscardHappy(owner);
            object.position.y = 0.18;
            object.rotation.y += 0.35;
          }
        }
      } else {
        const nearest = agents
          .map((agent) => ({ agent, distance: xzDistance(agent.rig.group.position, object.position) }))
          .sort((left, right) => left.distance - right.distance)[0];
        if (nearest && nearest.distance < 1.55) {
          showAgentHappy(nearest.agent, true);
          object.position.copy(nearest.agent.rig.group.position).add(new THREE.Vector3(0.18, 0.92, 0.08));
          setTimeout(() => resetDraggableHome(object), 360);
        } else {
          resetDraggableHome(object);
        }
      }
      interaction.object = null;
      interaction.kind = null;
      interaction.ownerDeskIndex = undefined;
      interaction.dragY = 0.18;
      return true;
    };

    const onPointerDown = (event: PointerEvent) => {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      renderer.domElement.setPointerCapture?.(event.pointerId);
      if (activePointers.size >= 2) {
        pinch.active = true;
        pinch.startDistance = pointerDistance();
        pinch.startZoom = view.zoom;
        drag.active = false;
        drag.moved = true;
        return;
      }
      if (startObjectDrag(event)) {
        event.preventDefault();
        return;
      }
      drag.active = true;
      drag.moved = false;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.pointerId = event.pointerId;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (activePointers.size >= 2) {
        event.preventDefault();
        const distance = pointerDistance();
        if (pinch.active && pinch.startDistance > 0 && distance > 0) {
          view.zoom = clampZoom(pinch.startZoom * (distance / pinch.startDistance));
          applyCameraZoom();
        }
        drag.moved = true;
        return;
      }
      if (interaction.object && event.pointerId === drag.pointerId) {
        event.preventDefault();
        const floor = pointerToFloor(event);
        if (floor) {
          interaction.object.position.set(floor.x + interaction.offset.x, interaction.dragY, floor.z + interaction.offset.z);
          interaction.object.rotation.x = Math.sin(clock.elapsedTime * 5) * 0.08;
          interaction.object.rotation.z = Math.cos(clock.elapsedTime * 4) * 0.06;
        }
        drag.moved = true;
        return;
      }
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
        drag.moved = true;
      }
      if (drag.moved) {
        view.azimuth -= dx * 0.008;
        view.elevation = Math.max(0.36, Math.min(1.18, view.elevation + dy * 0.006));
        syncCameraTarget();
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) {
        pinch.active = false;
      }
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      drag.active = false;
      if (finishObjectDrag(event)) return;
      if (drag.moved) return;
      updatePointerRay(event);
      const snakeHit = raycaster.intersectObjects(snakeGameTargets, true).find((item) => {
        let parent: THREE.Object3D | null = item.object;
        while (parent) {
          if (parent.userData.snakeGameTable) return true;
          parent = parent.parent;
        }
        return false;
      });
      if (snakeHit) {
        onOpenSnakeGameRef.current();
        return;
      }
      const intersections = raycaster.intersectObjects(agentRaycastTargets, true);
      const hit = intersections.find((item) => {
        let parent: THREE.Object3D | null = item.object;
        while (parent) {
          if (parent.userData.memberId) return true;
          parent = parent.parent;
        }
        return false;
      });
      if (!hit) return;
      let parent: THREE.Object3D | null = hit.object;
      while (parent && !parent.userData.memberId) parent = parent.parent;
      const memberId = parent?.userData.memberId as string | undefined;
      if (memberId) {
        const tool = activeInteractionToolRef.current;
        if (tool) {
          if (tool === "water") {
            const origin = agentByMemberId(memberId)?.rig.group.position;
            const targets = origin
              ? agents
                .filter((agent) => agent.rig.group.position.distanceTo(origin) <= 2.45)
                .slice(0, 10)
                .map((agent) => agent.rig.group.userData.memberId as string)
              : [memberId];
            onUseInteractionToolRef.current(targets.length ? targets : [memberId], tool);
          } else {
            onUseInteractionToolRef.current(memberId, tool);
          }
          return;
        }
        handleMemberClick(memberId);
        onSelectMemberRef.current(memberId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      view.zoom = clampZoom(view.zoom * Math.exp(-event.deltaY * 0.0015));
      applyCameraZoom();
    };
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tagName = element.tagName.toLowerCase();
      return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key)) return;
      pressedKeys.add(key);
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeys.delete(event.key.toLowerCase());
    };
    const onThrowAgent = (event: Event) => {
      const detail = (event as CustomEvent<{ memberId?: string; kind?: InteractionTool }>).detail;
      if (detail?.memberId) playInteractionEffect(detail.memberId, detail.kind || "throw");
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("cloud-lab:interaction-effect", onThrowAgent);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      window.cancelAnimationFrame(raf);
    };
    const onContextRestored = () => {
      clock.start();
      animate();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored, false);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      const now = clock.elapsedTime;
      const forwardInput = (pressedKeys.has("w") ? 1 : 0) - (pressedKeys.has("s") ? 1 : 0);
      const rightInput = (pressedKeys.has("d") ? 1 : 0) - (pressedKeys.has("a") ? 1 : 0);
      if (forwardInput || rightInput) {
        const length = Math.hypot(forwardInput, rightInput) || 1;
        const speed = Math.max(2.2, 6.8 / Math.max(0.8, view.zoom));
        moveCameraTarget((forwardInput / length) * speed * delta, (rightInput / length) * speed * delta);
      }
      monitorSurfaces.forEach((surface) => {
        const desk = deskTargets[surface.index];
        const owner = agents[surface.index];
        const occupiedByOwner = Boolean(
          desk
          && owner
          && owner.baseArea === "workspace"
          && ["working", "sitting", "resting"].includes(owner.state)
          && owner.rig.group.position.distanceTo(desk.position) < 0.95,
        );
        if (!occupiedByOwner) {
          if (surface.lastMode !== "locked") {
            paintMonitorLockScreen(surface);
            surface.lastMode = "locked";
            surface.texture.needsUpdate = true;
          }
          return;
        }
        if (!surface.animated) {
          if (surface.lastMode !== "static") {
            paintMonitorFrame(surface, surface.phase);
            surface.lastMode = "static";
            surface.lastFrame = -1;
            surface.texture.needsUpdate = true;
          }
          return;
        }
        const frame = Math.floor((now + surface.phase) * 8);
        if (surface.lastMode === "active" && frame === surface.lastFrame) return;
        surface.lastMode = "active";
        surface.lastFrame = frame;
        paintMonitorFrame(surface, now);
        surface.texture.needsUpdate = true;
      });
      for (let index = interactionEffects.length - 1; index >= 0; index -= 1) {
        const effect = interactionEffects[index];
        const progress = Math.min(1, (now - effect.startAt) / effect.duration);
        const eased = 1 - Math.pow(1 - progress, 2);
        effect.sprite.position.lerpVectors(effect.from, effect.to, eased);
        effect.sprite.position.y += Math.sin(progress * Math.PI) * (effect.kind === "hammer" || effect.kind === "whip" ? 0.18 : 0.62);
        effect.sprite.material.opacity = progress > 0.78 ? Math.max(0, 1 - (progress - 0.78) / 0.22) : 1;
        effect.sprite.rotation.z += delta * effect.spin;
        const pulse = effect.kind === "whip" ? 1 + Math.sin(progress * Math.PI) * 0.38 : 1 + Math.sin(progress * Math.PI) * 0.16;
        effect.sprite.scale.setScalar((effect.kind === "hammer" ? 0.9 : effect.kind === "whip" ? 1.05 : 0.78) * pulse);
        if (progress >= 1) {
          scene.remove(effect.sprite);
          const material = effect.sprite.material as THREE.SpriteMaterial;
          material.map?.dispose();
          material.dispose();
          interactionEffects.splice(index, 1);
        }
      }
      for (let index = whipEffects.length - 1; index >= 0; index -= 1) {
        const effect = whipEffects[index];
        const progress = Math.min(1, (now - effect.startAt) / effect.duration);
        const visibleProgress = Math.min(1, progress / 0.72);
        const points: THREE.Vector3[] = [];
        for (let pointIndex = 0; pointIndex < 18; pointIndex += 1) {
          const t = pointIndex / 17;
          const head = Math.min(1, Math.max(0, visibleProgress * 1.28 - (1 - t) * 0.38));
          const curveT = t * head;
          const left = effect.from.clone().lerp(effect.control, curveT);
          const right = effect.control.clone().lerp(effect.to, curveT);
          const point = left.lerp(right, curveT);
          point.y += Math.sin((t + progress * 1.8) * Math.PI) * 0.18 * (1 - progress);
          points.push(point);
        }
        effect.line.geometry.setFromPoints(points);
        const lineMat = effect.line.material as THREE.LineBasicMaterial;
        lineMat.opacity = progress > 0.72 ? Math.max(0, 1 - (progress - 0.72) / 0.28) : 1;
        lineMat.needsUpdate = true;
        effect.label.visible = progress > 0.34;
        if (effect.label.visible) {
          const labelPulse = 1 + Math.sin(Math.min(1, (progress - 0.34) / 0.3) * Math.PI) * 0.38;
          effect.label.scale.set(0.78 * labelPulse, 0.34 * labelPulse, 1);
          const labelMat = effect.label.material as THREE.SpriteMaterial;
          labelMat.opacity = progress > 0.76 ? Math.max(0, 1 - (progress - 0.76) / 0.24) : 1;
        }
        if (progress >= 1) {
          scene.remove(effect.line);
          scene.remove(effect.label);
          effect.line.geometry.dispose();
          (effect.line.material as THREE.Material).dispose();
          const labelMat = effect.label.material as THREE.SpriteMaterial;
          labelMat.map?.dispose();
          labelMat.dispose();
          whipEffects.splice(index, 1);
        }
      }
      const currentSelectedId = selectedIdRef.current || null;
      refreshAvatarSnapshot(now);
      agents.forEach((agent) => {
        const isSelected = agent.rig.group.userData.memberId === currentSelectedId;
        const latestAvatar = latestAvatars.get(agent.rig.group.userData.memberId as string);
        const latestStatus = latestAvatar?.presenceStatus || "auto";
        const latestArea = latestAvatar?.area || agent.baseArea;
        if (latestStatus !== agent.status || latestArea !== agent.baseArea) {
          sendStatusTarget(agent, latestStatus, latestArea, now);
        }
        if (agent.throwMotion) {
          const motion = agent.throwMotion;
          const progress = Math.min(1, (now - motion.startAt) / motion.duration);
          const outbound = progress <= 0.58;
          const segmentProgress = outbound ? progress / 0.58 : (progress - 0.58) / 0.42;
          const eased = 1 - Math.pow(1 - segmentProgress, 2);
          const from = outbound ? motion.origin : motion.apex;
          const to = outbound ? motion.apex : motion.origin;
          agent.rig.group.position.lerpVectors(from, to, eased);
          agent.rig.group.position.y = 0.04 + Math.sin(progress * Math.PI) * 2.6;
          agent.rig.group.rotation.y += delta * 8.5;
          agent.rig.group.rotation.z = Math.sin(progress * Math.PI * 2) * 0.45;
          setAgentPose(agent.rig, "running", now + agent.phaseOffset);
          agent.rig.group.scale.setScalar(isSelected ? 1.34 : 1.22);
          if (progress >= 1) {
            agent.rig.group.position.copy(motion.origin);
            agent.rig.group.rotation.z = 0;
            agent.throwMotion = undefined;
            agent.state = motion.previousState;
            agent.holdUntil = Math.max(now + 0.4, motion.previousHoldUntil);
          }
          return;
        }
        agent.rig.group.scale.setScalar(isSelected ? 1.3 : 1.18);
        if (now > agent.nextThoughtAt) {
          agent.rig.thought.visible = true;
          agent.thoughtUntil = now + 1.8 + Math.random() * 1.6;
          agent.nextThoughtAt = now + 8 + Math.random() * 12;
        }
        if (agent.rig.thought.visible && now > agent.thoughtUntil) {
          agent.rig.thought.visible = false;
        }
        if (agent.state === "walking" && agent.route.length > 1) {
          const current = agent.rig.group.position;
          const movedSinceLastFrame = current.distanceTo(agent.lastPosition);
          if (movedSinceLastFrame < 0.006) {
            agent.stuckSince = agent.stuckSince || now;
          } else {
            agent.stuckSince = 0;
            agent.lastPosition.copy(current);
          }
          if (agent.stuckSince && now - agent.stuckSince > 1.2) {
            agent.routeAttempt = (agent.routeAttempt + 1) % 9;
            if (agent.routeAttempt === 0 && agent.baseArea === "workspace" && !agent.lockedState && !agent.chatTarget) {
              const replacement = randomFloorPoint();
              agent.route = buildRoute(current, replacement, agent.routeAttempt);
              agent.target = replacement.clone();
              agent.rig.group.userData.nextState = "idle";
            } else {
              agent.route = buildRoute(current, agent.target, agent.routeAttempt);
            }
            agent.stuckSince = 0;
            agent.lastPosition.copy(current);
          }
          const next = agent.route[1];
          moveVector.subVectors(next, current);
          const distance = moveVector.length();
          if (distance < 0.035) {
            agent.route.shift();
            if (agent.route.length <= 1) {
              const nextState = (agent.rig.group.userData.nextState as AgentState | undefined) || "idle";
              agent.state = nextState === "working" ? "sitting" : nextState;
              agent.holdUntil = now + (nextState === "working" ? 5 + Math.random() * 10 : nextState === "running" ? 5 + Math.random() * 7 : nextState === "toilet" ? 4 + Math.random() * 6 : 3 + Math.random() * 5);
              if (nextState === "working") agent.state = "working";
              if (typeof agent.rig.group.userData.face === "number") agent.rig.group.rotation.y = agent.rig.group.userData.face;
            }
          } else {
            moveVector.normalize();
            current.add(moveVector.multiplyScalar(Math.min(distance, agent.speed * delta)));
            agent.rig.group.rotation.y = Math.atan2(moveVector.x, moveVector.z);
          }
        } else if (now > agent.holdUntil) {
          if (agent.lockedState) {
            agent.state = agent.lockedState;
            agent.holdUntil = now + 999;
            setAgentPose(agent.rig, agent.state, now + agent.phaseOffset);
            if (isSelected) agent.rig.group.scale.setScalar(1.3);
            return;
          }
          if (agent.state !== "idle") {
            agent.state = "leaving";
            agent.holdUntil = now + 0.25;
          }
          decideNext(agent, now);
        }
        setAgentPose(agent.rig, agent.state, now + agent.phaseOffset);
        if (typeof agent.rig.group.userData.whipHitUntil === "number" && now < agent.rig.group.userData.whipHitUntil) {
          agent.rig.group.rotation.z = Math.sin(now * 72 + agent.phaseOffset) * 0.09;
        } else if (!agent.throwMotion) {
          agent.rig.group.rotation.z *= 0.74;
        }
        if (isSelected) agent.rig.group.scale.setScalar(1.3);
      });
      resolveAgentCollisions();
      camera.position.lerp(targetCameraPos, 0.045);
      if (now < cameraShakeUntil) {
        const shake = cameraShakePower * Math.max(0, (cameraShakeUntil - now) / 0.28);
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake * 0.65;
      }
      camera.lookAt(targetLookAt);
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      const nextAspect = mount.clientWidth / Math.max(1, mount.clientHeight);
      camera.left = (-cameraSize * nextAspect) / 2;
      camera.right = (cameraSize * nextAspect) / 2;
      camera.top = cameraSize / 2;
      camera.bottom = -cameraSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.render(scene, camera);
    };
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("cloud-lab:interaction-effect", onThrowAgent);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      interactionEffects.forEach((effect) => {
        scene.remove(effect.sprite);
        const material = effect.sprite.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      });
      whipEffects.forEach((effect) => {
        scene.remove(effect.line);
        scene.remove(effect.label);
        effect.line.geometry.dispose();
        (effect.line.material as THREE.Material).dispose();
        const labelMaterial = effect.label.material as THREE.SpriteMaterial;
        labelMaterial.map?.dispose();
        labelMaterial.dispose();
      });
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((mat) => mat.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      if (cameraControlsRef.current) cameraControlsRef.current = null;
      mount.innerHTML = "";
    };
  }, [sceneMembersKey]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
};

const TaskPanel = ({
  avatars,
  selectedId,
  filter,
  collapsed,
  onFilterChange,
  onToggleCollapsed,
  onSelectMember,
  onDropTask,
}: {
  avatars: LabAvatar[];
  selectedId?: string | null;
  filter: WorkloadFilter;
  collapsed: boolean;
  onFilterChange: (filter: WorkloadFilter) => void;
  onToggleCollapsed: () => void;
  onSelectMember: (memberId: string) => void;
  onDropTask: (taskId: number, memberId: string) => void;
}) => {
  if (collapsed) {
    return (
      <div className="cloud-lab-task-toggle">
        <button type="button" className="cloud-lab-chip-button" data-active="false" onClick={onToggleCollapsed}>
          研发任务
        </button>
      </div>
    );
  }

  const rows = avatars
    .map((avatar) => ({ avatar, workload: avatar.workload }))
    .filter((item): item is { avatar: LabAvatar; workload: MemberWorkload } => Boolean(item.workload));
  const summary = rows.reduce(
    (acc, item) => {
      acc.open += item.workload.summary.open_tasks;
      acc.progress += item.workload.summary.in_progress_tasks;
      acc.overdue += item.workload.summary.overdue_tasks;
      if (item.workload.summary.capacity_score >= 70) acc.busy += 1;
      if (item.workload.summary.capacity_score < 35) acc.free += 1;
      return acc;
    },
    { open: 0, progress: 0, overdue: 0, busy: 0, free: 0 },
  );
  const sorted = [...rows]
    .filter(({ avatar }) => matchesFilter(avatar, filter))
    .sort((a, b) => b.workload.summary.capacity_score - a.workload.summary.capacity_score)
    .slice(0, 8);

  return (
    <div className="cloud-lab-task-panel">
      <div className="cloud-lab-task-title">
        <span>研发任务面板</span>
        <button type="button" className="cloud-lab-chip-button" data-active="false" onClick={onToggleCollapsed}>
          收起
        </button>
      </div>
      <div className="cloud-lab-filter-row">
        {[
          ["all", "全部"],
          ["overdue", "逾期"],
          ["busy", "高负载"],
          ["free", "空闲"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="cloud-lab-chip-button"
            data-active={filter === key}
            onClick={() => onFilterChange(key as WorkloadFilter)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="cloud-lab-task-summary">
        <div className="cloud-lab-task-metric">
          <span>待推</span>
          <strong>{summary.open}</strong>
        </div>
        <div className="cloud-lab-task-metric">
          <span>进行</span>
          <strong>{summary.progress}</strong>
        </div>
        <div className="cloud-lab-task-metric">
          <span>逾期</span>
          <strong>{summary.overdue}</strong>
        </div>
        <div className="cloud-lab-task-metric">
          <span>繁/闲</span>
          <strong>{summary.busy}/{summary.free}</strong>
        </div>
      </div>
      <div className="cloud-lab-resource-advice">
        建议: 优先把高负载成员的可拆分任务拖给空闲成员，会议/培训/外出成员暂不安排紧急开发。
      </div>
      <div className="cloud-lab-task-list">
        {sorted.length ? (
          sorted.map(({ avatar, workload }) => {
            const style = getCapacityStyle(workload);
            return (
              <div
                key={avatar.id}
                className="cloud-lab-task-row"
                data-selected={selectedId === avatar.id}
                data-focus={avatar.focusActive ? "true" : "false"}
                onClick={() => onSelectMember(avatar.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const taskId = Number(event.dataTransfer.getData("text/plain"));
                  if (taskId) onDropTask(taskId, avatar.id);
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="cloud-lab-task-name">{avatar.name}</div>
                  <div className="cloud-lab-task-detail">
                    待推 {workload.summary.open_tasks} · 进行 {workload.summary.in_progress_tasks} · 逾期 {workload.summary.overdue_tasks}
                  </div>
                  {avatar.focusActive ? <div className="cloud-lab-focus-pill"><img src={emojiAsset("bisheng")} alt="" />专注中</div> : null}
                </div>
                <div className="cloud-lab-task-badge" style={{ background: `#${style.body.toString(16).padStart(6, "0")}55` }}>
                  {avatar.focusActive ? "专注" : workload.summary.capacity_label || style.label}
                </div>
              </div>
            );
          })
        ) : (
          <div className="cloud-lab-task-row">
            <div>
              <div className="cloud-lab-task-name">任务同步中</div>
              <div className="cloud-lab-task-detail">等待研发成员负载数据</div>
            </div>
            <div className="cloud-lab-task-badge">同步</div>
          </div>
        )}
      </div>
    </div>
  );
};

const LabToolbar = ({
  departmentOpen,
  availabilityOpen,
  messageConfigOpen,
  canConfigureMessages,
  onToggleDepartments,
  onToggleAvailability,
  onToggleMessageConfig,
}: {
  departmentOpen: boolean;
  availabilityOpen: boolean;
  messageConfigOpen: boolean;
  canConfigureMessages: boolean;
  onToggleDepartments: () => void;
  onToggleAvailability: () => void;
  onToggleMessageConfig: () => void;
}) => (
  <div className="cloud-lab-toolbar">
    <button type="button" className="cloud-lab-chip-button" data-active={departmentOpen} onClick={onToggleDepartments}>
      部门
    </button>
    <button type="button" className="cloud-lab-chip-button" data-active={availabilityOpen} onClick={onToggleAvailability}>
      空闲
    </button>
    {canConfigureMessages ? (
      <button type="button" className="cloud-lab-chip-button" data-active={messageConfigOpen} onClick={onToggleMessageConfig}>
        消息群
      </button>
    ) : null}
  </div>
);

const interactionTools: Array<{ kind: InteractionTool; label: string }> = [
  { kind: "flower", label: "鲜花" },
  { kind: "egg", label: "鸡蛋" },
  { kind: "hammer", label: "锤子" },
  { kind: "whip", label: "鞭子" },
  { kind: "water", label: "大桶水" },
  { kind: "throw", label: "扔飞" },
];

const InteractionToolbox = ({
  open,
  activeTool,
  onToggle,
  onSelectTool,
}: {
  open: boolean;
  activeTool: InteractionTool | null;
  onToggle: () => void;
  onSelectTool: (tool: InteractionTool | null) => void;
}) => (
  <div className="cloud-lab-interaction-toolbox">
    <button type="button" className="cloud-lab-chip-button" data-active={open || Boolean(activeTool)} onClick={onToggle}>
      {activeTool ? (
        <>
          <span className="cloud-lab-tool-icon">{interactionToolIcons[activeTool]}</span>
          {interactionTools.find((tool) => tool.kind === activeTool)?.label}
        </>
      ) : "互动"} ▾
    </button>
    {open ? (
      <div className="cloud-lab-interaction-menu">
        {interactionTools.map((tool) => (
          <button
            key={tool.kind}
            type="button"
            className="cloud-lab-chip-button"
            data-active={activeTool === tool.kind}
            onClick={() => onSelectTool(activeTool === tool.kind ? null : tool.kind)}
          >
            <span className="cloud-lab-tool-icon">{interactionToolIcons[tool.kind]}</span>
            {tool.label}
          </button>
        ))}
        <button type="button" className="cloud-lab-chip-button" onClick={() => onSelectTool(null)}>
          关闭工具
        </button>
      </div>
    ) : null}
  </div>
);

type SnakeDirection = "up" | "down" | "left" | "right";

const SnakeGameOverlay = ({ onClose }: { onClose: () => void }) => {
  const size = 18;
  const [snake, setSnake] = useState([{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }]);
  const [food, setFood] = useState({ x: 13, y: 9 });
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const directionRef = useRef<SnakeDirection>("right");

  const placeFood = useCallback((body: Array<{ x: number; y: number }>) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const next = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) };
      if (!body.some((part) => part.x === next.x && part.y === next.y)) return next;
    }
    return { x: 0, y: 0 };
  }, []);

  const setDirection = useCallback((direction: SnakeDirection) => {
    const current = directionRef.current;
    if ((current === "up" && direction === "down") || (current === "down" && direction === "up") || (current === "left" && direction === "right") || (current === "right" && direction === "left")) return;
    directionRef.current = direction;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") setDirection("up");
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") setDirection("down");
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setDirection("left");
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setDirection("right");
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, setDirection]);

  useEffect(() => {
    if (gameOver) return undefined;
    const timer = window.setInterval(() => {
      setSnake((current) => {
        const head = current[0];
        const direction = directionRef.current;
        const next = {
          x: head.x + (direction === "left" ? -1 : direction === "right" ? 1 : 0),
          y: head.y + (direction === "up" ? -1 : direction === "down" ? 1 : 0),
        };
        if (next.x < 0 || next.x >= size || next.y < 0 || next.y >= size || current.some((part) => part.x === next.x && part.y === next.y)) {
          setGameOver(true);
          return current;
        }
        const ate = next.x === food.x && next.y === food.y;
        const body = ate ? [next, ...current] : [next, ...current.slice(0, -1)];
        if (ate) {
          setScore((value) => value + 1);
          setFood(placeFood(body));
        }
        return body;
      });
    }, 135);
    return () => window.clearInterval(timer);
  }, [food, gameOver, placeFood]);

  const restart = () => {
    directionRef.current = "right";
    setSnake([{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }]);
    setFood({ x: 13, y: 9 });
    setScore(0);
    setGameOver(false);
  };

  return (
    <div className="cloud-lab-game-overlay" onPointerDown={(event) => event.stopPropagation()}>
      <div className="cloud-lab-snake-game">
        <div className="cloud-lab-snake-header">
          <span>圆桌贪吃蛇 · {score}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="cloud-lab-chip-button" onClick={restart}>重开</button>
            <button type="button" className="cloud-lab-chip-button" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="cloud-lab-snake-board">
          {Array.from({ length: size * size }, (_, index) => {
            const x = index % size;
            const y = Math.floor(index / size);
            const snakeIndex = snake.findIndex((part) => part.x === x && part.y === y);
            const kind = snakeIndex === 0 ? "head" : snakeIndex > 0 ? "snake" : food.x === x && food.y === y ? "food" : "empty";
            return <div key={`${x}:${y}`} className="cloud-lab-snake-cell" data-kind={kind} />;
          })}
        </div>
        <div className="cloud-lab-snake-controls">
          <span />
          <button type="button" className="cloud-lab-chip-button" onClick={() => setDirection("up")}>↑</button>
          <span />
          <button type="button" className="cloud-lab-chip-button" onClick={() => setDirection("left")}>←</button>
          <button type="button" className="cloud-lab-chip-button" onClick={() => setDirection("down")}>↓</button>
          <button type="button" className="cloud-lab-chip-button" onClick={() => setDirection("right")}>→</button>
        </div>
        {gameOver ? <div className="cloud-lab-member-meta" style={{ marginTop: 8, color: "#fecaca" }}>游戏结束</div> : null}
      </div>
    </div>
  );
};

const DepartmentPanel = ({
  departments,
  expanded,
  selectedDepartment,
  selectedSpecialty,
  selectedId,
  canUseAll,
  currentOpenId,
  focusSession,
  onToggle,
  onSelectDepartment,
  onSelectMember,
  onShowAll,
  onSelectSpecialty,
}: {
  departments: Array<{ name: string; members: Member[] }>;
  expanded: Record<string, boolean>;
  selectedDepartment: string | null;
  selectedSpecialty: SpecialtyFilter;
  selectedId: string | null;
  canUseAll: boolean;
  currentOpenId?: string;
  focusSession: StoredFocusSession | null;
  onToggle: (department: string) => void;
  onSelectDepartment: (department: string | null) => void;
  onSelectMember: (memberId: string) => void;
  onShowAll: () => void;
  onSelectSpecialty: (specialty: SpecialtyFilter) => void;
}) => (
  <div className="cloud-lab-department-panel">
    <div className="cloud-lab-task-title">
      <span>部门</span>
      <span style={{ color: "#6b7280", fontSize: 12 }}>{departments.length} 个</span>
    </div>
    <div className="cloud-lab-filter-row">
      {canUseAll ? (
        <button type="button" className="cloud-lab-chip-button" data-active={selectedDepartment === null && selectedSpecialty === "all"} onClick={onShowAll}>
          {specialtyLabels.all}
        </button>
      ) : null}
      {(["research", "development"] as SpecialtyFilter[]).map((specialty) => (
        <button
          key={specialty}
          type="button"
          className="cloud-lab-chip-button"
          data-active={selectedDepartment === null && selectedSpecialty === specialty}
          onClick={() => onSelectSpecialty(specialty)}
        >
          {specialtyLabels[specialty]}
        </button>
      ))}
    </div>
    {departments.map((group) => {
      const open = Boolean(expanded[group.name]);
      return (
        <div key={group.name} className="cloud-lab-department-group">
          <button
            type="button"
            className="cloud-lab-department-head"
            onClick={() => {
              onSelectDepartment(group.name);
            }}
          >
            <span>{group.name}</span>
            <span className="cloud-lab-department-count">{group.members.length} 人 · {selectedDepartment === group.name ? "已选中" : "选择"}</span>
            <span
              role="button"
              tabIndex={0}
              className="cloud-lab-department-toggle"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(group.name);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggle(group.name);
                }
              }}
            >
              {open ? "收起" : "人员"}
            </span>
          </button>
          {open ? (
            <div>
              {group.members.slice(0, 80).map((member) => (
                <div
                  key={member.open_id}
                  className="cloud-lab-department-member"
                  data-selected={selectedId === member.open_id}
                  data-focus={Boolean(member.open_id === currentOpenId && focusSession?.active) ? "true" : "false"}
                  onClick={() => {
                    onSelectMember(member.open_id);
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="cloud-lab-task-name">{member.name}</div>
                    <div className="cloud-lab-task-detail">{member.position || member.title || member.role}</div>
                  </div>
                  <span className="cloud-lab-task-badge">
                    {member.open_id === currentOpenId && focusSession?.active ? "专注中" : member.status === "active" ? "在岗" : member.status}
                  </span>
                </div>
              ))}
              {group.members.length > 80 ? (
                <div className="cloud-lab-department-member">
                  <div style={{ minWidth: 0 }}>
                    <div className="cloud-lab-task-name">还有 {group.members.length - 80} 人</div>
                    <div className="cloud-lab-task-detail">已限制首屏渲染，切换到部门后会加载场景人员</div>
                  </div>
                  <span className="cloud-lab-task-badge">已优化</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    })}
  </div>
);

const currentAgendaText = (avatar: LabAvatar) => {
  if (avatar.focusActive) return `专注任务 #${avatar.focusTaskId}`;
  if (avatar.chatCluster) return `群聊讨论 · ${avatar.chatCluster.chat_name}`;
  if (avatar.larkStatus?.title) return `飞书状态 · ${avatar.larkStatus.title}`;
  const currentSlot = (avatar.busySlots || []).find((slot) => nowInSlot(slot));
  if (currentSlot) return `${currentSlot.title} · ${formatTimeRange(currentSlot.start_at, currentSlot.end_at)}`;
  const currentClass = (avatar.classes || []).find((item) => nowInClassSchedule(item));
  if (currentClass) return `${currentClass.course_name} · ${currentClass.start_time.slice(0, 5)}-${currentClass.end_time.slice(0, 5)} ${currentClass.location || ""}`;
  return avatar.workload?.summary.capacity_label || areaDescriptions[avatar.area || "workspace"];
};

const sameDepartment = (member: Member, department: string | null) =>
  !department || (member.department?.trim() || "未设置部门") === department;

const AreaStrip = ({
  avatars,
  selectedArea,
  onSelectArea,
}: {
  avatars: LabAvatar[];
  selectedArea: AreaKey | null;
  onSelectArea: (area: AreaKey | null) => void;
}) => {
  const groups = avatars.reduce<Record<AreaKey, LabAvatar[]>>(
    (acc, avatar) => {
      acc[avatar.area || "workspace"].push(avatar);
      return acc;
    },
    { workspace: [], classroom: [], meeting_room: [], away: [] },
  );
  const total = avatars.length;
  const summaryForArea = (area: AreaKey) => {
    const names = groups[area].slice(0, 4).map((avatar) => avatar.name).join("、");
    if (names) return names;
    return area === "workspace" ? areaDescriptions.workspace : "";
  };
  return (
    <div className="cloud-lab-area-strip">
      <button type="button" className="cloud-lab-area-card" data-area="overview" data-active={selectedArea === null} onClick={() => onSelectArea(null)}>
        <strong>全景 · {total} 人</strong>
        <span>查看研发团队整体空间</span>
      </button>
      {primaryAreaKeys.map((area) => (
        <button key={area} type="button" className="cloud-lab-area-card" data-area={area} data-active={selectedArea === area} onClick={() => onSelectArea(area)}>
          <strong>{areaLabels[area]} · {groups[area].length} 人</strong>
          {summaryForArea(area) ? <span>{summaryForArea(area)}</span> : null}
        </button>
      ))}
    </div>
  );
};

const SpacePanel = ({
  area,
  avatars,
  onClose,
  onSelectMember,
}: {
  area: AreaKey;
  avatars: LabAvatar[];
  onClose: () => void;
  onSelectMember: (memberId: string) => void;
}) => {
  const rows = avatars.filter((avatar) => (avatar.area || "workspace") === area);
  return (
    <div className="cloud-lab-space-panel">
      <div className="cloud-lab-task-title">
        <span>{areaLabels[area]} · {rows.length} 人</span>
        <button type="button" className="cloud-lab-close" onClick={onClose}>×</button>
      </div>
      {area === "workspace" || area === "away" ? (
        <div className="cloud-lab-member-meta" style={{ marginTop: 6 }}>
          {areaDescriptions[area]}
        </div>
      ) : null}
      {rows.length ? rows.map((avatar) => (
        <div key={avatar.id} className="cloud-lab-space-row" data-focus={avatar.focusActive ? "true" : "false"} onClick={() => onSelectMember(avatar.id)}>
          <div style={{ minWidth: 0 }}>
            <div className="cloud-lab-task-name">{avatar.name}</div>
            <div className="cloud-lab-task-detail">{currentAgendaText(avatar)}</div>
            {avatar.focusActive ? <div className="cloud-lab-focus-pill"><img src={emojiAsset("bisheng")} alt="" />专注中</div> : null}
          </div>
          <span className="cloud-lab-task-badge">{avatar.focusActive ? "专注" : avatar.workload?.summary.capacity_label || "同步中"}</span>
        </div>
      )) : (
        <div className="cloud-lab-space-row">
          <div>
            <div className="cloud-lab-task-name">暂无人员</div>
            <div className="cloud-lab-task-detail">当前没有成员被日程、会议或培训分配到这里</div>
          </div>
          <span className="cloud-lab-task-badge">空闲</span>
        </div>
      )}
    </div>
  );
};

const MemberSheet = ({
  avatar,
  onClose,
  onNavigateProfile,
  onNavigateProjects,
  onCreateTask,
  onDragTask,
  onArrangeMeeting,
  onSendInteraction,
  onSendGroupMessage,
  onSetStatus,
  messageDraft,
  onMessageDraftChange,
  commonChats,
  selectedChatId,
  onSelectedChatChange,
  loadingCommonChats,
  sendingGroupMessage,
  sendingInteractionKey,
  labMessageConfig,
  canEditStatus,
  canViewDetails,
}: {
  avatar: LabAvatar;
  onClose: () => void;
  onNavigateProfile: (memberId: string) => void;
  onNavigateProjects: (memberId: string) => void;
  onCreateTask: (memberId: string) => void;
  onDragTask: (task: MemberWorkloadTask) => void;
  onArrangeMeeting: (memberId: string) => void;
  onSendInteraction: (memberId: string, kind: LabInteractionKind) => void;
  onSendGroupMessage: (memberId: string) => void;
  onSetStatus: (memberId: string, status: PresenceStatus) => void;
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  commonChats: LabVisibleChat[];
  selectedChatId: string;
  onSelectedChatChange: (value: string) => void;
  loadingCommonChats: boolean;
  sendingGroupMessage: boolean;
  sendingInteractionKey: string | null;
  labMessageConfig: LabMessageConfig | null;
  canEditStatus: boolean;
  canViewDetails: boolean;
}) => {
  const workload = avatar.workload;
  const summary = workload?.summary;
  const tone = workloadTone(summary?.capacity_score ?? 0);
  const tasks = workload?.tasks.slice(0, 7) || [];
  const flowerCount = avatar.interactions?.flower_count ?? 0;
  const eggCount = avatar.interactions?.egg_count ?? 0;
  const interactionTitle = `鲜花 ${flowerCount} · 鸡蛋 ${eggCount}`;

  return (
    <div className="cloud-lab-member-sheet">
      <div className="cloud-lab-sheet-header">
        <div>
          <div className="cloud-lab-member-name" title={interactionTitle}>{avatar.name}</div>
          <div className="cloud-lab-member-meta">
            {workload?.member.department || "未设置部门"} · {workload?.member.position || workload?.member.title || "研发成员"}
          </div>
          {avatar.focusActive ? <div className="cloud-lab-focus-pill"><img src={emojiAsset("bisheng")} alt="" />正在专注任务 #{avatar.focusTaskId}</div> : null}
        </div>
        <button type="button" className="cloud-lab-close" onClick={onClose}>×</button>
      </div>
      {canViewDetails ? (
        <>
          <div className="cloud-lab-mini-grid">
            {[
              ["待推", summary?.open_tasks ?? 0],
              ["进行", summary?.in_progress_tasks ?? 0],
              ["受阻", summary?.blocked_tasks ?? 0],
              ["逾期", summary?.overdue_tasks ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="cloud-lab-mini-metric">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="cloud-lab-progress">
            <div style={{ width: `${Math.min(100, summary?.capacity_score ?? 0)}%`, background: tone }} />
          </div>
          <div className="cloud-lab-member-meta" style={{ fontWeight: 800 }}>
            {summary?.capacity_label || "负载同步中"} · {presenceStatusLabels[avatar.presenceStatus || "auto"]} · 活跃项目 {summary?.active_project_count ?? 0}
          </div>
        </>
      ) : (
        <div className="cloud-lab-member-meta" style={{ marginTop: 10, fontWeight: 800 }}>
          {presenceStatusLabels[avatar.presenceStatus || "auto"]} · {currentAgendaText(avatar)}
        </div>
      )}
      <div className="cloud-lab-status-row">
        {(["auto", "working", "focusing", "resting", "classroom", "meeting_room", "away"] as PresenceStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            className="cloud-lab-chip-button"
            data-active={(avatar.presenceStatus || "auto") === status}
            disabled={!canEditStatus}
            onClick={() => onSetStatus(avatar.id, status)}
          >
            {presenceStatusLabels[status]}
          </button>
        ))}
      </div>
      {!canEditStatus ? (
        <div className="cloud-lab-member-meta" style={{ marginTop: 6 }}>
          你只能查看这位成员状态，不能代为修改。
        </div>
      ) : null}
      {canViewDetails ? (
        <>
          <div className="cloud-lab-action-row">
            <Button size="mini" color="primary" fill="solid" onClick={() => onNavigateProfile(avatar.id)}>档案</Button>
            <Button size="mini" fill="outline" onClick={() => onNavigateProjects(avatar.id)}>项目</Button>
            <Button size="mini" fill="outline" onClick={() => onCreateTask(avatar.id)}>派任务</Button>
            <Button size="mini" fill="outline" onClick={() => onArrangeMeeting(avatar.id)}>约会议</Button>
            <Button size="mini" fill="outline" loading={sendingInteractionKey === `${avatar.id}:flower`} onClick={() => onSendInteraction(avatar.id, "flower")}>送鲜花</Button>
            <Button size="mini" fill="outline" loading={sendingInteractionKey === `${avatar.id}:egg`} onClick={() => onSendInteraction(avatar.id, "egg")}>丢鸡蛋</Button>
            <Button size="mini" fill="outline" loading={sendingInteractionKey === `${avatar.id}:throw`} onClick={() => onSendInteraction(avatar.id, "throw")}>扔飞</Button>
            <Button size="mini" fill="outline" loading={sendingInteractionKey === `${avatar.id}:hammer`} onClick={() => onSendInteraction(avatar.id, "hammer")}>锤子</Button>
            <Button size="mini" fill="outline" loading={sendingInteractionKey === `${avatar.id}:whip`} onClick={() => onSendInteraction(avatar.id, "whip")}>鞭子</Button>
          </div>
          <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
            <select
              className="cloud-lab-message-input"
              value={selectedChatId}
              onChange={(event) => onSelectedChatChange(event.target.value)}
            >
              {commonChats.map((chat) => (
                <option key={chat.chat_id} value={chat.chat_id}>
                  {chat.chat_name}{chat.member_count ? ` · ${chat.member_count}人` : ""}
                </option>
              ))}
              {labMessageConfig?.chat_id ? (
                <option value={labMessageConfig.chat_id}>{labMessageConfig.chat_name || "手动配置群"}</option>
              ) : null}
              {!commonChats.length && !labMessageConfig?.chat_id ? <option value="">暂无共同群聊</option> : null}
            </select>
            <input
              className="cloud-lab-message-input"
              value={messageDraft}
              placeholder={selectedChatId || labMessageConfig?.chat_id ? "以飞书用户身份发送并 @ 这位成员" : "未找到共同群聊，可先配置兜底群"}
              onChange={(event) => onMessageDraftChange(event.target.value)}
            />
            <Button
              size="mini"
              fill="outline"
              disabled={!(selectedChatId || labMessageConfig?.chat_id) || sendingGroupMessage}
              onClick={() => onSendGroupMessage(avatar.id)}
            >
              {loadingCommonChats ? "查群中" : "群里@"}
            </Button>
            <div className="cloud-lab-member-meta">使用飞书 CLI 的用户态发送；若服务器授权人不是当前网页登录人，飞书侧会显示 CLI 授权人。</div>
          </div>
        </>
      ) : null}
      <div className="cloud-lab-schedule-list">
        {(avatar.busySlots || []).slice(0, 3).map((slot, index) => (
          <div key={`${slot.kind}-${index}`} className="cloud-lab-schedule-row">
            {slot.kind === "class" ? "培训/课程" : slot.kind === "leave" ? "请假" : "日程"} · {slot.title}
            <br />
            {formatTimeRange(slot.start_at, slot.end_at)}
          </div>
        ))}
        {!(avatar.busySlots || []).length && (avatar.classes || []).slice(0, 2).map((item) => (
          <div key={item.schedule_id} className="cloud-lab-schedule-row">
            培训/课程表 · 周{item.day_of_week} {item.course_name}
            <br />
            {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)} {item.location || ""}
          </div>
        ))}
      </div>
      {canViewDetails ? <div className="cloud-lab-task-mini-list">
        {tasks.map((task) => (
          <div
            key={task.task_id}
            className="cloud-lab-task-mini"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", String(task.task_id));
              onDragTask(task);
            }}
          >
            <div className="cloud-lab-task-mini-title">{task.title}</div>
            <div className="cloud-lab-task-project-badge" data-linked={task.project_id ? "true" : "false"}>
              项目: {task.project_name || "独立任务"}
            </div>
            <div className="cloud-lab-task-mini-detail">
              {taskStatusLabel[task.status]} · {formatDateTime(task.due_date)}
            </div>
          </div>
        ))}
        {!tasks.length ? (
          <div className="cloud-lab-task-mini">
            <div className="cloud-lab-task-mini-title">暂无待推进任务</div>
            <div className="cloud-lab-task-mini-detail">可以把新任务分配给这位成员</div>
          </div>
        ) : null}
      </div> : null}
    </div>
  );
};

const VoicePanel = ({
  transcript,
  listening,
  supported,
  onTranscriptChange,
  onStart,
  onSubmit,
  onClose,
}: {
  transcript: string;
  listening: boolean;
  supported: boolean;
  onTranscriptChange: (value: string) => void;
  onStart: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) => (
  <div className="cloud-lab-voice-panel">
    <div className="cloud-lab-task-title">
      <span>语音操控</span>
      <button type="button" className="cloud-lab-close" onClick={onClose}>×</button>
    </div>
    <div className="cloud-lab-member-meta" style={{ marginBottom: 8 }}>
      可说: 给张三布置任务修复登录缺陷明天下午五点前完成；安排需求评审张三李四明天三点在会议室。
    </div>
    <TextArea
      value={transcript}
      onChange={onTranscriptChange}
      placeholder="语音识别结果或手动输入指令"
      autoSize={{ minRows: 3, maxRows: 5 }}
      style={{ "--font-size": "13px" }}
    />
    <div className="cloud-lab-action-row">
      <Button size="mini" color={listening ? "danger" : "primary"} onClick={onStart} disabled={!supported}>
        {listening ? "识别中" : "开始语音"}
      </Button>
      <Button size="mini" fill="outline" onClick={onSubmit}>
        执行指令
      </Button>
      {!supported ? <span className="cloud-lab-member-meta">当前浏览器不支持 Web Speech</span> : null}
    </div>
  </div>
);

const slotKindLabel = (kind: BusySlot["kind"]) => {
  if (kind === "class") return "有课";
  if (kind === "leave") return "请假";
  return "会议";
};

const AvailabilityPanel = ({
  range,
  rows,
  loading,
  onRangeChange,
  onQuery,
  onClose,
  onSelectMember,
}: {
  range: { start: string; end: string };
  rows: Array<{ member: Member; slots: BusySlot[] }>;
  loading: boolean;
  onRangeChange: (range: { start: string; end: string }) => void;
  onQuery: () => void;
  onClose: () => void;
  onSelectMember: (memberId: string) => void;
}) => {
  const freeCount = rows.filter((row) => !row.slots.length).length;
  const classCount = rows.filter((row) => row.slots.some((slot) => slot.kind === "class")).length;
  const meetingCount = rows.filter((row) => row.slots.some((slot) => slot.kind === "event")).length;
  const leaveCount = rows.filter((row) => row.slots.some((slot) => slot.kind === "leave")).length;
  return (
    <div className="cloud-lab-availability-panel">
      <div className="cloud-lab-task-title">
        <span>空闲查询</span>
        <button type="button" className="cloud-lab-close" onClick={onClose}>×</button>
      </div>
      <div className="cloud-lab-member-meta" style={{ marginTop: 6 }}>
        选择时间段，查看当前部门/筛选范围内谁空闲、谁有课或会议。
      </div>
      <div className="cloud-lab-availability-fields">
        <label>
          <span className="cloud-lab-field-label">开始</span>
          <input
            className="cloud-lab-message-input"
            type="datetime-local"
            value={range.start}
            onChange={(event) => onRangeChange({ ...range, start: event.target.value })}
          />
        </label>
        <label>
          <span className="cloud-lab-field-label">结束</span>
          <input
            className="cloud-lab-message-input"
            type="datetime-local"
            value={range.end}
            onChange={(event) => onRangeChange({ ...range, end: event.target.value })}
          />
        </label>
        <Button size="mini" color="primary" loading={loading} onClick={onQuery}>筛选</Button>
      </div>
      <div className="cloud-lab-availability-summary">
        {[
          ["空闲", freeCount],
          ["有课", classCount],
          ["开会", meetingCount],
          ["请假", leaveCount],
        ].map(([label, value]) => (
          <div key={label} className="cloud-lab-task-metric">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="cloud-lab-availability-list">
        {rows.slice(0, 120).map((row) => {
          const busy = row.slots.length > 0;
          const primary = row.slots[0];
          return (
            <div key={row.member.open_id} className="cloud-lab-availability-row" data-busy={busy ? "true" : "false"} onClick={() => onSelectMember(row.member.open_id)}>
              <div style={{ minWidth: 0 }}>
                <div className="cloud-lab-task-name">{row.member.name}</div>
                <div className="cloud-lab-task-detail">{row.member.department || "未设置部门"} · {row.member.position || row.member.title || row.member.role}</div>
                {busy ? (
                  <div className="cloud-lab-availability-slots">
                    {row.slots.slice(0, 3).map((slot) => `${slotKindLabel(slot.kind)}：${slot.title} ${formatTimeRange(slot.start_at, slot.end_at)}`).join("；")}
                  </div>
                ) : (
                  <div className="cloud-lab-availability-slots">该时间段未命中课程、会议或请假。</div>
                )}
              </div>
              <span className="cloud-lab-task-badge">{primary ? slotKindLabel(primary.kind) : "空闲"}</span>
            </div>
          );
        })}
        {!rows.length ? (
          <div className="cloud-lab-availability-row" data-busy="false">
            <div>
              <div className="cloud-lab-task-name">暂无结果</div>
              <div className="cloud-lab-task-detail">点击筛选后显示当前范围成员。</div>
            </div>
            <span className="cloud-lab-task-badge">待查</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const CloudLabPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { me } = useAuth();
  const targetMemberOpenId = searchParams.get("member_open_id") || searchParams.get("focus_member");
  const [members, setMembers] = useState<Member[]>([]);
  const [directoryMembers, setDirectoryMembers] = useState<Member[]>([]);
  const [workloads, setWorkloads] = useState<Record<string, MemberWorkload>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkloadFilter>("all");
  const [scope, setScope] = useState<LabScope>("department");
  const [draggingTask, setDraggingTask] = useState<MemberWorkloadTask | null>(null);
  const [busySlots, setBusySlots] = useState<Record<string, BusySlot[]>>({});
  const [classSchedules, setClassSchedules] = useState<Record<string, ClassSchedule[]>>({});
  const [larkStatuses, setLarkStatuses] = useState<Record<string, LarkUserStatus>>({});
  const [chatClusters, setChatClusters] = useState<LabChatCluster[]>([]);
  const [presenceStatuses, setPresenceStatuses] = useState<Record<string, PresenceStatus>>(() => {
    try {
      const raw = window.localStorage.getItem(PRESENCE_STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, PresenceStatus>;
    } catch {
      return {};
    }
  });
  const [departmentPanelOpen, setDepartmentPanelOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityRange, setAvailabilityRange] = useState(() => {
    const start = new Date();
    start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    return { start: toDateTimeLocalValue(start), end: toDateTimeLocalValue(end) };
  });
  const [availabilityMemberIds, setAvailabilityMemberIds] = useState<string[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<Record<string, BusySlot[]>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [messageConfigOpen, setMessageConfigOpen] = useState(false);
  const [interactionToolsOpen, setInteractionToolsOpen] = useState(false);
  const [activeInteractionTool, setActiveInteractionTool] = useState<InteractionTool | null>(null);
  const [snakeGameOpen, setSnakeGameOpen] = useState(false);
  const [labMessageConfig, setLabMessageConfig] = useState<LabMessageConfig | null>(null);
  const [messageConfigDraft, setMessageConfigDraft] = useState({ chat_id: "", chat_name: "" });
  const [memberMessageDraft, setMemberMessageDraft] = useState("");
  const [commonChats, setCommonChats] = useState<LabVisibleChat[]>([]);
  const [selectedMessageChatId, setSelectedMessageChatId] = useState("");
  const [loadingCommonChats, setLoadingCommonChats] = useState(false);
  const [sendingGroupMessage, setSendingGroupMessage] = useState(false);
  const [sendingInteractionKey, setSendingInteractionKey] = useState<string | null>(null);
  const [interactionSummary, setInteractionSummary] = useState<Record<string, LabInteractionSummary>>({});
  const [savingMessageConfig, setSavingMessageConfig] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(
    me?.department || null,
  );
  const [selectedSpecialty, setSelectedSpecialty] = useState<SpecialtyFilter>("all");
  const [viewReloadNonce, setViewReloadNonce] = useState(0);
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});
  const [departmentPanelActivityAt, setDepartmentPanelActivityAt] = useState(0);
  const [selectedArea, setSelectedArea] = useState<AreaKey | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [taskPanelCollapsed, setTaskPanelCollapsed] = useState(true);
  const [focusSession, setFocusSession] = useState<StoredFocusSession | null>(() => {
    try {
      const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as StoredFocusSession;
      return saved?.active && saved.taskId ? saved : null;
    } catch {
      return null;
    }
  });
  const recognitionRef = useRef<unknown>(null);
  const loadSeqRef = useRef(0);
  const workloadCacheRef = useRef<Record<string, MemberWorkload>>({});
  const busyCacheRef = useRef<Record<string, BusySlot[]>>({});
  const classCacheRef = useRef<Record<string, ClassSchedule[]>>({});

  const canViewMemberDetails = Boolean(
    me?.role === "admin"
    || me?.role === "staff"
    || ["团长", "政委", "部长"].some((marker) => (me?.title || "").includes(marker)),
  );
  const canUseAll = true;
  const canManagePresenceStatuses = Boolean(me?.open_id && developerOpenIds.has(me.open_id));

  useEffect(() => {
    if (!me?.open_id || !canViewMemberDetails) {
      setLabMessageConfig(null);
      return;
    }
    getLabMessageConfig()
      .then((config) => {
        setLabMessageConfig(config);
        setMessageConfigDraft({ chat_id: config.chat_id || "", chat_name: config.chat_name || "" });
      })
      .catch(() => {
        setLabMessageConfig(null);
      });
  }, [canViewMemberDetails, me?.open_id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(presenceStatuses));
    } catch {
      // localStorage may be unavailable in embedded privacy modes.
    }
  }, [presenceStatuses]);

  useEffect(() => {
    const readFocusSession = () => {
      try {
        const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
        if (!raw) {
          setFocusSession(null);
          return;
        }
        const saved = JSON.parse(raw) as StoredFocusSession;
        setFocusSession(saved?.active && saved.taskId ? saved : null);
      } catch {
        setFocusSession(null);
      }
    };
    const handleFocusEvent = (event: Event) => {
      const detail = (event as CustomEvent<StoredFocusSession | null>).detail;
      setFocusSession(detail?.active && detail.taskId ? detail : null);
    };
    window.addEventListener("focus-session:changed", handleFocusEvent);
    window.addEventListener("storage", readFocusSession);
    return () => {
      window.removeEventListener("focus-session:changed", handleFocusEvent);
      window.removeEventListener("storage", readFocusSession);
    };
  }, []);

  const keepDepartmentPanelActive = useCallback(() => {
    setDepartmentPanelActivityAt(Date.now());
  }, []);

  useEffect(() => {
    if (!departmentPanelOpen) return undefined;
    const timer = window.setTimeout(() => {
      setDepartmentPanelOpen(false);
      setExpandedDepartments({});
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [departmentPanelActivityAt, departmentPanelOpen]);

  useEffect(() => {
    if (!me) {
      setDirectoryMembers([]);
      return;
    }
    listMembers({ page_size: 300 })
      .then((page) => setDirectoryMembers(page.items))
      .catch(() => setDirectoryMembers([]));
  }, [me]);


  useEffect(() => {
    if (selectedSpecialty === "all" && scope === "department" && !selectedDepartment) {
      setSelectedDepartment(me?.department || null);
    }
  }, [me?.department, scope, selectedDepartment, selectedSpecialty]);

  const resolveMembersForScope = useCallback(async () => {
    const source = directoryMembers;
    if (source.length) {
      const department = selectedDepartment || (scope === "department" ? me?.department || null : null);
      const scoped = department ? source.filter((member) => (member.department?.trim() || "未设置部门") === department) : source;
      return scoped.filter((member) => memberMatchesSpecialty(member, selectedSpecialty));
    }
    const params = selectedDepartment
      ? { department: selectedDepartment, page_size: 100 }
      : scope === "department" && me?.department
        ? { department: me.department, page_size: 100 }
        : { page_size: 100 };
    const page = await listMembers(params);
    return page.items.filter((member) => memberMatchesSpecialty(member, selectedSpecialty));
  }, [directoryMembers, me?.department, scope, selectedDepartment, selectedSpecialty]);

  const mergeChatMembers = useCallback(async (scopedMembers: Member[], clusters: LabChatCluster[]) => {
    const chatMemberIds = new Set(clusters.flatMap((cluster) => cluster.member_open_ids));
    if (!chatMemberIds.size) return scopedMembers;
    let source = directoryMembers;
    if (!source.length || Array.from(chatMemberIds).some((openId) => !source.some((member) => member.open_id === openId))) {
      const page = await listMembers({ page_size: 300 }).catch(() => ({ items: [] as Member[] }));
      source = page.items.length ? page.items : source;
      if (page.items.length) setDirectoryMembers(page.items);
    }
    const allById = new Map(source.map((member) => [member.open_id, member]));
    const scopedDepartment = selectedDepartment || (scope === "department" ? me?.department || null : null);
    const chatMembers = Array.from(chatMemberIds)
      .map((openId) => allById.get(openId))
      .filter((member): member is Member => Boolean(member))
      .filter((member) => sameDepartment(member, scopedDepartment) && memberMatchesSpecialty(member, selectedSpecialty));
    return [
      ...chatMembers,
      ...scopedMembers.filter((member) => !chatMemberIds.has(member.open_id)),
    ];
  }, [directoryMembers, me?.department, scope, selectedDepartment, selectedSpecialty]);

  const loadLabData = useCallback(async (options?: { refresh?: boolean; refreshMemberIds?: string[] }) => {
    if (!me) {
      setMembers([]);
      setWorkloads({});
      setBusySlots({});
      setClassSchedules({});
      setLarkStatuses({});
      setChatClusters([]);
      setInteractionSummary({});
      return;
    }
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    const [scopedMembers, clusters] = await Promise.all([
      resolveMembersForScope(),
      listLabChatClusters({ max_chats: 80, message_page_size: 80, recent_minutes: 30 }).catch(() => [] as LabChatCluster[]),
    ]);
    if (loadSeqRef.current !== seq) return;
    const mergedMembers = await mergeChatMembers(scopedMembers, clusters);
    if (loadSeqRef.current !== seq) return;
    setMembers(mergedMembers);
    setChatClusters(clusters);
    const visibleMembers = mergedMembers.slice(0, WORKSTATION_LIMIT);
    const visibleIds = visibleMembers.map((member) => member.open_id);
    listLarkUserStatuses({ member_open_ids: visibleIds })
      .then((rows) => {
        if (loadSeqRef.current !== seq) return;
        setLarkStatuses(Object.fromEntries(rows.map((row) => [row.member_open_id, row])));
      })
      .catch(() => {
        if (loadSeqRef.current === seq) setLarkStatuses({});
      });
    listLabInteractionSummary(visibleIds)
      .then((rows) => {
        if (loadSeqRef.current !== seq) return;
        setInteractionSummary(Object.fromEntries(rows.map((row) => [row.member_open_id, row])));
      })
      .catch(() => {
        if (loadSeqRef.current === seq) setInteractionSummary({});
      });
    const refreshIds = new Set(options?.refresh ? visibleIds : options?.refreshMemberIds || []);
    refreshIds.forEach((openId) => {
      delete workloadCacheRef.current[openId];
      delete busyCacheRef.current[openId];
      delete classCacheRef.current[openId];
    });
    const cachedWorkloads = Object.fromEntries(
      visibleIds
        .map((openId) => [openId, workloadCacheRef.current[openId]] as const)
        .filter((entry): entry is readonly [string, MemberWorkload] => Boolean(entry[1])),
    );
    setWorkloads(cachedWorkloads);
    const missingWorkloadMembers = visibleMembers.filter((member) => !workloadCacheRef.current[member.open_id]);
    if (missingWorkloadMembers.length) {
      const bulkWorkloads = await getMemberWorkloads(missingWorkloadMembers.map((member) => member.open_id)).catch(() => ({}));
      if (loadSeqRef.current !== seq) return;
      Object.entries(bulkWorkloads).forEach(([openId, workload]) => {
        workloadCacheRef.current[openId] = workload;
      });
      setWorkloads(
        Object.fromEntries(
          visibleIds
            .map((openId) => [openId, workloadCacheRef.current[openId]] as const)
            .filter((entry): entry is readonly [string, MemberWorkload] => Boolean(entry[1])),
        ),
      );
    }
    const now = new Date();
    const end = new Date(now);
    end.setHours(end.getHours() + 8);
    const missingBusyIds = visibleIds.filter((openId) => !busyCacheRef.current[openId]);
    const missingClassIds = visibleIds.filter((openId) => !classCacheRef.current[openId]);
    if (missingBusyIds.length || missingClassIds.length) {
      const [freeBusy, classItems] = await Promise.all([
        missingBusyIds.length
          ? getFreeBusy({ member_ids: missingBusyIds, start: toLocalIso(now), end: toLocalIso(end) }).catch(() => ({ busy: [] as BusySlot[] }))
          : Promise.resolve({ busy: [] as BusySlot[] }),
        missingClassIds.length
          ? listClassSchedules({ member_open_ids: missingClassIds }).catch(() => [] as ClassSchedule[])
          : Promise.resolve([] as ClassSchedule[]),
      ]);
      const slotsByMember = (freeBusy.busy || []).reduce<Record<string, BusySlot[]>>((acc, slot) => {
        if (!acc[slot.member_open_id]) acc[slot.member_open_id] = [];
        acc[slot.member_open_id].push(slot);
        return acc;
      }, {});
      missingBusyIds.forEach((openId) => {
        busyCacheRef.current[openId] = slotsByMember[openId] || [];
      });
      const classesByMember = classItems.reduce<Record<string, ClassSchedule[]>>((acc, item) => {
        if (!acc[item.member_open_id]) acc[item.member_open_id] = [];
        acc[item.member_open_id].push(item);
        return acc;
      }, {});
      missingClassIds.forEach((openId) => {
        classCacheRef.current[openId] = classesByMember[openId] || [];
      });
    }
    if (loadSeqRef.current !== seq) return;
    setBusySlots(Object.fromEntries(visibleIds.map((openId) => [openId, busyCacheRef.current[openId] || []])));
    setClassSchedules(Object.fromEntries(visibleIds.map((openId) => [openId, classCacheRef.current[openId] || []])));
  }, [me, mergeChatMembers, resolveMembersForScope]);

  const queryAvailability = useCallback(async () => {
    const start = new Date(availabilityRange.start);
    const end = new Date(availabilityRange.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      Toast.show({ icon: "fail", content: "请选择有效时间段" });
      return;
    }
    setAvailabilityLoading(true);
    try {
      const scopedMembers = await resolveMembersForScope();
      const queryMembers = scopedMembers.slice(0, 200);
      const result = queryMembers.length
        ? await getFreeBusy({ member_ids: queryMembers.map((member) => member.open_id), start: toLocalIso(start), end: toLocalIso(end) })
        : { busy: [] as BusySlot[] };
      const slotsByMember = (result.busy || []).reduce<Record<string, BusySlot[]>>((acc, slot) => {
        if (!acc[slot.member_open_id]) acc[slot.member_open_id] = [];
        acc[slot.member_open_id].push(slot);
        return acc;
      }, {});
      Object.values(slotsByMember).forEach((slots) => slots.sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime()));
      setAvailabilityMemberIds(queryMembers.map((member) => member.open_id));
      setAvailabilitySlots(slotsByMember);
    } catch {
      Toast.show({ icon: "fail", content: "空闲查询失败" });
    } finally {
      setAvailabilityLoading(false);
    }
  }, [availabilityRange.end, availabilityRange.start, resolveMembersForScope]);

  useEffect(() => {
    let active = true;
    if (!me) {
      setMembers([]);
      setWorkloads({});
      return () => {
        active = false;
      };
    }
    loadLabData()
      .catch(() => {
        if (active) {
          setMembers([]);
          setWorkloads({});
        }
      });
    return () => {
      active = false;
    };
  }, [loadLabData, me, scope, selectedDepartment, viewReloadNonce]);

  const chatClusterByMember = useMemo(() => {
    const map = new Map<string, LabChatCluster>();
    chatClusters.forEach((cluster) => {
      cluster.member_open_ids.forEach((openId) => {
        if (!map.has(openId)) map.set(openId, cluster);
      });
    });
    return map;
  }, [chatClusters]);

  useEffect(() => {
    const visibleIds = members.slice(0, WORKSTATION_LIMIT).map((member) => member.open_id);
    if (!visibleIds.length) {
      setLarkStatuses({});
      return undefined;
    }
    let cancelled = false;
    const sync = () => {
      listLarkUserStatuses({ member_open_ids: visibleIds })
        .then((rows) => {
          if (!cancelled) setLarkStatuses(Object.fromEntries(rows.map((row) => [row.member_open_id, row])));
        })
        .catch(() => undefined);
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    const timer = window.setInterval(sync, 5000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(timer);
    };
  }, [members]);

  useEffect(() => {
    if (!me?.open_id) return undefined;
    let cancelled = false;
    const syncRecentChats = () => {
      listLabChatClusters({ max_chats: 80, message_page_size: 80, recent_minutes: 30 })
        .then((rows) => {
          if (!cancelled) setChatClusters(rows);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(syncRecentChats, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [me?.open_id]);

  const avatars = useMemo<LabAvatar[]>(
    () =>
      members.map((member) => {
        const autoArea = getAreaForMember(busySlots[member.open_id] || [], classSchedules[member.open_id] || []);
        const focusActive = Boolean(focusSession?.active && focusSession.taskId && member.open_id === me?.open_id);
        const larkStatus = larkStatuses[member.open_id];
        const larkPresence = larkStatus?.presence_status || null;
        const presenceStatus: PresenceStatus = focusActive ? "focusing" : (larkPresence as PresenceStatus | null) || presenceStatuses[member.open_id] || "auto";
        const chatCluster = focusActive ? undefined : chatClusterByMember.get(member.open_id);
        return {
          id: member.open_id,
          name: member.name,
          selected: false,
          member,
          workload: workloads[member.open_id],
          busySlots: busySlots[member.open_id] || [],
          classes: classSchedules[member.open_id] || [],
          presenceStatus,
          larkStatus,
          larkEmojiPath: larkStatus?.emoji_path || undefined,
          focusActive,
          focusTaskId: focusActive ? focusSession?.taskId : undefined,
          chatCluster,
          interactions: interactionSummary[member.open_id] || { member_open_id: member.open_id, flower_count: 0, egg_count: 0 },
          area: getAreaForStatus(presenceStatus, autoArea),
        };
      }),
    [busySlots, chatClusterByMember, classSchedules, focusSession, interactionSummary, larkStatuses, me?.open_id, members, presenceStatuses, workloads],
  );
  const visibleAvatars = useMemo(() => avatars.filter((avatar) => matchesFilter(avatar, filter)), [avatars, filter]);
  const stationAvatars = useMemo(() => {
    return [...visibleAvatars]
      .sort((left, right) => Number(Boolean(right.chatCluster)) - Number(Boolean(left.chatCluster)))
      .slice(0, WORKSTATION_LIMIT);
  }, [visibleAvatars]);
  const selectedAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedId) || null,
    [avatars, selectedId],
  );
  useEffect(() => {
    if (!targetMemberOpenId || !avatars.length) return;
    const target = avatars.find((avatar) => avatar.id === targetMemberOpenId);
    if (!target) return;
    setSelectedId(target.id);
    setSelectedArea(target.area && target.area !== "workspace" ? target.area : null);
    setTaskPanelCollapsed(false);
  }, [avatars, targetMemberOpenId]);
  useEffect(() => {
    if (!selectedId || !canViewMemberDetails) {
      setCommonChats([]);
      setSelectedMessageChatId("");
      return;
    }
    setLoadingCommonChats(true);
    setSelectedMessageChatId("");
    listLabCommonChats({ target_open_id: selectedId })
      .then((rows) => {
        setCommonChats(rows);
        setSelectedMessageChatId((current) => current || rows[0]?.chat_id || labMessageConfig?.chat_id || "");
      })
      .catch(() => {
        setCommonChats([]);
        setSelectedMessageChatId(labMessageConfig?.chat_id || "");
      })
      .finally(() => setLoadingCommonChats(false));
  }, [canViewMemberDetails, labMessageConfig?.chat_id, selectedId]);
  const departmentGroups = useMemo(
    () =>
      Array.from(
        (directoryMembers.length ? directoryMembers : members).reduce<Map<string, Member[]>>((acc, member) => {
          const key = member.department?.trim() || "未设置部门";
          acc.set(key, [...(acc.get(key) || []), member]);
          return acc;
        }, new Map()),
      )
        .map(([name, items]) => ({ name, members: items.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")) }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    [directoryMembers, members],
  );
  const availabilityRows = useMemo(() => {
    const memberById = new Map([...(directoryMembers.length ? directoryMembers : members), ...members].map((member) => [member.open_id, member]));
    return availabilityMemberIds
      .map((openId) => {
        const member = memberById.get(openId);
        if (!member) return null;
        return { member, slots: availabilitySlots[openId] || [] };
      })
      .filter((row): row is { member: Member; slots: BusySlot[] } => Boolean(row))
      .sort((left, right) => {
        if (left.slots.length !== right.slots.length) return left.slots.length - right.slots.length;
        return left.member.name.localeCompare(right.member.name, "zh-Hans-CN");
      });
  }, [availabilityMemberIds, availabilitySlots, directoryMembers, members]);

  useEffect(() => {
    if (!availabilityOpen || availabilityMemberIds.length || availabilityLoading) return;
    void queryAvailability();
  }, [availabilityMemberIds.length, availabilityLoading, availabilityOpen, queryAvailability]);

  useEffect(() => {
    const knownMembers = directoryMembers.length ? directoryMembers : members;
    if (selectedId && knownMembers.length && !knownMembers.some((member) => member.open_id === selectedId)) {
      setSelectedId(null);
    }
  }, [directoryMembers, members, selectedId]);

  const handleSelectMember = useCallback((memberId: string) => {
    startTransition(() => setSelectedId(memberId));
  }, []);

  const handleSetPresenceStatus = useCallback((memberId: string, status: PresenceStatus) => {
    if (!me?.open_id || (memberId !== me.open_id && !canManagePresenceStatuses)) {
      Toast.show({ icon: "fail", content: "只能修改自己的状态" });
      return;
    }
    const previousLocal = presenceStatuses[memberId];
    const previousLark = larkStatuses[memberId];
    const optimisticStatus: LarkUserStatus | null = status === "auto" ? null : {
      member_open_id: memberId,
      title: presenceStatusLabels[status],
      emoji_path: presenceStatusEmojis[status]?.[0] || null,
      presence_status: status,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    startTransition(() => {
      setPresenceStatuses((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      setLarkStatuses((prev) => {
        const next = { ...prev };
        if (optimisticStatus) next[memberId] = optimisticStatus;
        else delete next[memberId];
        return next;
      });
    });
    setLarkUserStatus(memberId, status)
      .then((row) => {
        setLarkStatuses((prev) => {
          const next = { ...prev };
          if (row) next[memberId] = row;
          else delete next[memberId];
          return next;
        });
      })
      .catch(() => {
        setPresenceStatuses((prev) => {
          const next = { ...prev };
          if (previousLocal) next[memberId] = previousLocal;
          else delete next[memberId];
          return next;
        });
        setLarkStatuses((prev) => {
          const next = { ...prev };
          if (previousLark) next[memberId] = previousLark;
          else delete next[memberId];
          return next;
        });
        Toast.show({ icon: "fail", content: "飞书状态同步失败" });
      });
  }, [canManagePresenceStatuses, larkStatuses, me?.open_id, presenceStatuses]);

  const applyDepartment = useCallback((department: string | null) => {
    startTransition(() => {
      setSelectedDepartment(department);
      setSelectedSpecialty("all");
      setSelectedArea(null);
      setFilter("all");
      if (department) setScope("department");
      else if (canUseAll) setScope("all");
      setViewReloadNonce((value) => value + 1);
    });
  }, [canUseAll]);

  const applySpecialty = useCallback((specialty: SpecialtyFilter) => {
    startTransition(() => {
      setSelectedSpecialty(specialty);
      setSelectedDepartment(null);
      setSelectedArea(null);
      setFilter("all");
      if (canUseAll) setScope("all");
      setViewReloadNonce((value) => value + 1);
    });
  }, [canUseAll]);

  const handleDropTask = useCallback(async (taskId: number, memberId: string) => {
    const target = avatars.find((avatar) => avatar.id === memberId);
    const task = draggingTask || avatars.flatMap((avatar) => avatar.workload?.tasks || []).find((item) => item.task_id === taskId);
    if (!target || !task) return;
    Dialog.confirm({
      title: "改派任务",
      content: `将「${task.title}」分配给 ${target.name}?`,
      confirmText: "改派",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await updateTask(taskId, { assignee_open_id: memberId });
          Toast.show({ icon: "success", content: "已改派" });
          setDraggingTask(null);
          await loadLabData({ refresh: true });
          setSelectedId(memberId);
        } catch {
          Toast.show({ icon: "fail", content: "改派失败" });
        }
      },
    });
  }, [avatars, draggingTask, loadLabData]);

  const voiceSupported = useMemo(
    () => typeof window !== "undefined" && (Boolean((window as any).SpeechRecognition) || Boolean((window as any).webkitSpeechRecognition)),
    [],
  );

  const startVoiceRecognition = useCallback(() => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      Toast.show({ icon: "fail", content: "当前浏览器不支持语音识别" });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setVoiceListening(true);
    recognition.onend = () => setVoiceListening(false);
    recognition.onerror = () => {
      setVoiceListening(false);
      Toast.show({ icon: "fail", content: "语音识别失败" });
    };
    recognition.onresult = (event: any) => {
      const result = Array.from(event.results || [])
        .map((item: any) => item[0]?.transcript || "")
        .join("");
      setVoiceText(result);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const executeVoiceCommand = useCallback(async () => {
    const text = voiceText.trim();
    if (!text) {
      Toast.show({ icon: "fail", content: "请先输入或识别语音指令" });
      return;
    }
    const mentioned = findMentionedMembers(text, members);
    if (!mentioned.length) {
      Toast.show({ icon: "fail", content: "没有识别到成员姓名" });
      return;
    }
    try {
      if (/会议|开会|同步会|讨论/.test(text)) {
        const start = parseChineseDateTime(text, 2);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        await createCalendarEvent({
          event_type: "meeting",
          title: extractMeetingTitle(text, mentioned),
          description: `云实验室语音创建: ${text}`,
          location: extractLocation(text),
          start_at: toLocalIso(start),
          end_at: toLocalIso(end),
          all_day: false,
          attendee_open_ids: Array.from(new Set([me?.open_id || "", ...mentioned.map((member) => member.open_id)])).filter(Boolean),
          sync_to_lark: true,
        });
        Toast.show({ icon: "success", content: "会议已创建并通知成员" });
      } else {
        const due = parseChineseDateTime(text, 4);
        const title = extractTaskTitle(text, mentioned);
        await Promise.all(
          mentioned.map((member) =>
            createTask({
              title,
              description: `云实验室语音创建: ${text}`,
              assignee_open_id: member.open_id,
              due_date: toLocalIso(due),
              status: "todo",
              priority: text.includes("紧急") ? "urgent" : text.includes("重要") ? "high" : "medium",
            }),
          ),
        );
        Toast.show({ icon: "success", content: `已派发给 ${mentioned.length} 人` });
      }
      setVoiceText("");
      setVoiceOpen(false);
      await loadLabData({ refresh: true });
    } catch {
      Toast.show({ icon: "fail", content: "指令执行失败" });
    }
  }, [loadLabData, me?.open_id, members, voiceText]);

  const arrangeQuickMeeting = useCallback(async (memberId: string) => {
    const target = members.find((member) => member.open_id === memberId);
    if (!target) return;
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    try {
      await createCalendarEvent({
        event_type: "meeting",
        title: `与${target.name}同步`,
        description: "从云实验室快速创建",
        location: "会议室",
        start_at: toLocalIso(start),
        end_at: toLocalIso(end),
        all_day: false,
        attendee_open_ids: Array.from(new Set([me?.open_id || "", target.open_id])).filter(Boolean),
        sync_to_lark: true,
      });
      Toast.show({ icon: "success", content: "会议已创建" });
      await loadLabData({ refresh: true });
    } catch {
      Toast.show({ icon: "fail", content: "创建会议失败" });
    }
  }, [loadLabData, me?.open_id, members]);

  const saveCloudLabMessageConfig = useCallback(async () => {
    const chatId = messageConfigDraft.chat_id.trim();
    if (!chatId) {
      Toast.show({ icon: "fail", content: "请填写群聊 ID" });
      return;
    }
    setSavingMessageConfig(true);
    try {
      const saved = await saveLabMessageConfig({
        chat_id: chatId,
        chat_name: messageConfigDraft.chat_name.trim() || null,
      });
      setLabMessageConfig(saved);
      setMessageConfigDraft({ chat_id: saved.chat_id || "", chat_name: saved.chat_name || "" });
      setMessageConfigOpen(false);
      Toast.show({ icon: "success", content: "发送群聊已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "保存群聊失败" });
    } finally {
      setSavingMessageConfig(false);
    }
  }, [messageConfigDraft.chat_id, messageConfigDraft.chat_name]);

  const sendGroupMentionFromLab = useCallback(async (memberId: string) => {
    const text = memberMessageDraft.trim();
    if (!text) {
      Toast.show({ icon: "fail", content: "请填写要发送的消息" });
      return;
    }
    setSendingGroupMessage(true);
    try {
      const result = await sendLabMentionMessage({ target_open_id: memberId, message: text, chat_id: selectedMessageChatId || labMessageConfig?.chat_id || null });
      setMemberMessageDraft("");
      Toast.show({ icon: "success", content: `已由 ${result.sender_name || "当前登录人"} 发送` });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      Toast.show({ icon: "fail", content: detail || "群消息发送失败" });
    } finally {
      setSendingGroupMessage(false);
    }
  }, [labMessageConfig?.chat_id, memberMessageDraft, selectedMessageChatId]);

  const sendLabInteraction = useCallback(async (memberIdsInput: string | string[], kind: LabInteractionKind) => {
    const memberIds = Array.from(new Set(Array.isArray(memberIdsInput) ? memberIdsInput : [memberIdsInput])).filter(Boolean);
    const key = `${memberIds[0] || "none"}:${kind}`;
    setSendingInteractionKey(key);
    try {
      await Promise.all(memberIds.map((memberId) => createLabInteraction({ target_open_id: memberId, kind })));
      setInteractionSummary((prev) => {
        const next = { ...prev };
        memberIds.forEach((memberId) => {
          const current = next[memberId] || { member_open_id: memberId, flower_count: 0, egg_count: 0 };
          next[memberId] = {
            ...current,
            flower_count: current.flower_count + (kind === "flower" ? 1 : 0),
            egg_count: current.egg_count + (kind === "egg" ? 1 : 0),
          };
        });
        return next;
      });
      memberIds.forEach((memberId) => {
        window.dispatchEvent(new CustomEvent("cloud-lab:interaction-effect", { detail: { memberId, kind } }));
      });
      Toast.show({
        icon: "success",
        content: kind === "flower" ? "鲜花已送出" : kind === "egg" ? "鸡蛋已丢出" : kind === "throw" ? "已扔飞" : kind === "hammer" ? "锤子已砸下" : kind === "water" ? `大桶水泼中 ${memberIds.length} 人` : "已抽成忙碌",
      });
    } catch {
      Toast.show({ icon: "fail", content: "互动失败" });
    } finally {
      setSendingInteractionKey(null);
    }
  }, []);

  const closeFloatingPanels = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".cloud-lab-department-panel, .cloud-lab-member-sheet, .cloud-lab-area-strip, .cloud-lab-toolbar, .cloud-lab-interaction-toolbox, .cloud-lab-message-config, .cloud-lab-availability-panel")) {
      return;
    }
    setSelectedId(null);
    setDepartmentPanelOpen(false);
    setAvailabilityOpen(false);
    setInteractionToolsOpen(false);
    setExpandedDepartments({});
  }, []);

  return (
    <>
      <style>{cloudLabStyles}</style>
      <div className="cloud-lab-stage">
        <div className="cloud-lab-canvas" data-cloud-lab-canvas="true" onPointerDown={closeFloatingPanels}>
          <LabScene
            avatars={stationAvatars}
            chatClusters={chatClusters}
            activeArea={selectedArea}
            selectedId={selectedId}
            activeInteractionTool={activeInteractionTool}
            onUseInteractionTool={sendLabInteraction}
            onOpenSnakeGame={() => setSnakeGameOpen(true)}
            onSelectMember={handleSelectMember}
          />
          {snakeGameOpen ? <SnakeGameOverlay onClose={() => setSnakeGameOpen(false)} /> : null}
          <div className="cloud-lab-view-hint">
            点击画面后用 WASD 平移 · 最近半小时群聊 · 点击成员查看状态和任务
          </div>
          <LabToolbar
            departmentOpen={departmentPanelOpen}
            availabilityOpen={availabilityOpen}
            messageConfigOpen={messageConfigOpen}
            canConfigureMessages={canViewMemberDetails}
            onToggleDepartments={() => {
              setDepartmentPanelOpen((value) => {
                const next = !value;
                if (next) keepDepartmentPanelActive();
                else setExpandedDepartments({});
                return next;
              });
              setAvailabilityOpen(false);
              setMessageConfigOpen(false);
              setInteractionToolsOpen(false);
            }}
            onToggleAvailability={() => {
              setAvailabilityOpen((value) => !value);
              setDepartmentPanelOpen(false);
              setMessageConfigOpen(false);
              setInteractionToolsOpen(false);
              setExpandedDepartments({});
            }}
            onToggleMessageConfig={() => {
              setMessageConfigOpen((value) => !value);
              setDepartmentPanelOpen(false);
              setAvailabilityOpen(false);
              setInteractionToolsOpen(false);
              setExpandedDepartments({});
            }}
          />
          <InteractionToolbox
            open={interactionToolsOpen}
            activeTool={activeInteractionTool}
            onToggle={() => setInteractionToolsOpen((value) => !value)}
            onSelectTool={(tool) => {
              setActiveInteractionTool(tool);
              setInteractionToolsOpen(Boolean(tool));
            }}
          />
          {availabilityOpen ? (
            <AvailabilityPanel
              range={availabilityRange}
              rows={availabilityRows}
              loading={availabilityLoading}
              onRangeChange={setAvailabilityRange}
              onQuery={() => void queryAvailability()}
              onClose={() => setAvailabilityOpen(false)}
              onSelectMember={(memberId) => {
                handleSelectMember(memberId);
                setAvailabilityOpen(false);
              }}
            />
          ) : null}
          {messageConfigOpen && canViewMemberDetails ? (
            <div className="cloud-lab-message-config">
              <div className="cloud-lab-task-title">
                <span>云实验室消息群</span>
                <button type="button" className="cloud-lab-close" onClick={() => setMessageConfigOpen(false)}>×</button>
              </div>
              <div className="cloud-lab-member-meta" style={{ marginTop: 6 }}>
                配置你自己的发送群聊，点击成员后可把消息发到该群并 @ 对方。
              </div>
              <div className="cloud-lab-message-fields">
                <input
                  className="cloud-lab-message-input"
                  value={messageConfigDraft.chat_id}
                  placeholder="群聊 ID，例如 oc_xxx"
                  onChange={(event) => setMessageConfigDraft((prev) => ({ ...prev, chat_id: event.target.value }))}
                />
                <input
                  className="cloud-lab-message-input"
                  value={messageConfigDraft.chat_name}
                  placeholder="群名备注，可选"
                  onChange={(event) => setMessageConfigDraft((prev) => ({ ...prev, chat_name: event.target.value }))}
                />
                <Button size="mini" color="primary" loading={savingMessageConfig} onClick={() => void saveCloudLabMessageConfig()}>
                  保存群聊
                </Button>
              </div>
            </div>
          ) : null}
          {departmentPanelOpen ? (
            <DepartmentPanel
              departments={departmentGroups}
              expanded={expandedDepartments}
              selectedDepartment={selectedDepartment}
              selectedSpecialty={selectedSpecialty}
              selectedId={selectedId}
              canUseAll={canUseAll}
              currentOpenId={me?.open_id}
              focusSession={focusSession}
              onToggle={(department) => {
                keepDepartmentPanelActive();
                setExpandedDepartments((prev) => ({ ...prev, [department]: !prev[department] }));
              }}
              onSelectDepartment={(department) => {
                keepDepartmentPanelActive();
                applyDepartment(department);
              }}
              onSelectMember={(memberId) => {
                keepDepartmentPanelActive();
                handleSelectMember(memberId);
              }}
              onShowAll={() => {
                if (!canUseAll) return;
                keepDepartmentPanelActive();
                applyDepartment(null);
              }}
              onSelectSpecialty={(specialty) => {
                if (!canUseAll) return;
                keepDepartmentPanelActive();
                applySpecialty(specialty);
              }}
            />
          ) : null}
          {selectedAvatar ? (
            <MemberSheet
              avatar={selectedAvatar}
              onClose={() => setSelectedId(null)}
              onNavigateProfile={(memberId) => navigate(`/members/${memberId}`)}
              onNavigateProjects={(memberId) => navigate(`/projects?member_open_id=${encodeURIComponent(memberId)}`)}
              onCreateTask={(memberId) => navigate(`/tasks/new?assignee_open_id=${encodeURIComponent(memberId)}`)}
              onDragTask={setDraggingTask}
              onArrangeMeeting={arrangeQuickMeeting}
              onSendInteraction={sendLabInteraction}
              onSendGroupMessage={sendGroupMentionFromLab}
              onSetStatus={handleSetPresenceStatus}
              messageDraft={memberMessageDraft}
              onMessageDraftChange={setMemberMessageDraft}
              commonChats={commonChats}
              selectedChatId={selectedMessageChatId}
              onSelectedChatChange={setSelectedMessageChatId}
              loadingCommonChats={loadingCommonChats}
              sendingGroupMessage={sendingGroupMessage}
              sendingInteractionKey={sendingInteractionKey}
              labMessageConfig={labMessageConfig}
              canEditStatus={Boolean(me?.open_id && (selectedAvatar.id === me.open_id || canManagePresenceStatuses))}
              canViewDetails={canViewMemberDetails}
            />
          ) : null}
          <AreaStrip
            avatars={avatars}
            selectedArea={selectedArea}
            onSelectArea={(area) => {
              startTransition(() => {
                setSelectedId(null);
                setSelectedArea((current) => (current === area ? null : area));
              });
            }}
          />
        </div>
      </div>
    </>
  );
};

export default CloudLabPage;
