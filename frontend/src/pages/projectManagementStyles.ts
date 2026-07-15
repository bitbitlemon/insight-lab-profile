// ProjectManagementPage 全量样式 (从主文件拆出)

export const projectPanelStyles = `
  .pm-workbench {
    min-height: calc(100vh - 56px);
    background:
      linear-gradient(180deg, #F5F7FB 0, #F7F8FA 220px),
      #F7F8FA;
    color: #1F2329;
    font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .pm-topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 18px;
    background: rgba(255,255,255,0.96);
    border-bottom: 1px solid #E5E6EB;
    backdrop-filter: blur(10px);
  }
  .pm-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .pm-mark {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: linear-gradient(135deg, #3370FF, #14B8A6);
    color: #FFFFFF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
    flex: 0 0 auto;
  }
  .pm-title {
    font-size: 15px;
    font-weight: 700;
    color: #1F2329;
    white-space: nowrap;
  }
  .pm-breadcrumb {
    color: #646A73;
    font-size: 12px;
    white-space: nowrap;
  }
  .pm-module-tabs {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 30px;
    padding: 2px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #F7F8FA;
  }
  .pm-tab-btn,
  .pm-tool-btn,
  .pm-icon-btn,
  .pm-row-action {
    border: 1px solid #E5E6EB;
    background: #FFFFFF;
    color: #1F2329;
    border-radius: 5px;
    height: 28px;
    padding: 0 10px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }
  .pm-tool-btn:hover,
  .pm-row-action:hover {
    border-color: #BACEFD;
    background: #F7FAFF;
    color: #1D4ED8;
  }
  .pm-tab-btn {
    border-color: transparent;
    background: transparent;
    color: #646A73;
  }
  .pm-tab-btn[data-active="true"] {
    background: #FFFFFF;
    border-color: #E5E6EB;
    color: #3370FF;
    font-weight: 700;
  }
  .pm-primary-btn {
    height: 30px;
    border: 1px solid #3370FF;
    border-radius: 5px;
    background: #3370FF;
    color: #FFFFFF;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }
  .pm-primary-btn:hover {
    background: #1D4ED8;
    box-shadow: 0 6px 14px rgba(51,112,255,0.18);
    transform: translateY(-1px);
  }
  .pm-unified-search {
    position: relative;
    width: 300px;
  }
  .pm-search {
    width: 100%;
    height: 30px;
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: rgba(255,255,255,0.88);
    color: #1F2329;
    padding: 0 32px 0 10px;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }
  .pm-select {
    width: 180px;
    height: 30px;
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 0 8px;
    font-size: 13px;
    outline: none;
  }
  .pm-search:focus {
    border-color: #3370FF;
    box-shadow: 0 0 0 2px rgba(51,112,255,0.08);
  }
  .pm-search-clear {
    position: absolute;
    right: 5px;
    top: 4px;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #8F959E;
    cursor: pointer;
  }
  .pm-search-clear:hover {
    background: #F2F3F5;
    color: #1F2329;
  }
  .pm-people-popover {
    position: absolute;
    z-index: 40;
    top: 36px;
    left: 0;
    width: 340px;
    max-height: 320px;
    overflow-y: auto;
    border: 1px solid #DDE4EE;
    border-radius: 10px;
    background: #FFFFFF;
    box-shadow: 0 18px 42px rgba(31,35,41,0.16);
    padding: 8px;
  }
  .pm-people-popover-title {
    color: #646A73;
    font-size: 12px;
    font-weight: 800;
    padding: 4px 6px 8px;
  }
  .pm-people-option {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 9px;
    text-align: left;
    cursor: pointer;
  }
  .pm-people-option:hover {
    background: #F0F6FF;
  }
  .pm-people-avatar {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: #EEF4FF;
    color: #3370FF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 900;
    flex: 0 0 auto;
  }
  .pm-people-main {
    min-width: 0;
  }
  .pm-people-name {
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-people-meta {
    margin-top: 3px;
    color: #8F959E;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-layout {
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    min-height: calc(100vh - 48px);
  }
  .pm-sidebar {
    position: sticky;
    top: 48px;
    align-self: start;
    height: calc(100vh - 48px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #FFFFFF;
    border-right: 1px solid #E5E6EB;
    padding: 18px 12px 14px;
    box-sizing: border-box;
    overscroll-behavior: contain;
  }
  .pm-sidebar-profile {
    padding: 0 4px 18px;
    border-bottom: 1px solid #F0F1F3;
  }
  .pm-profile-home {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #1F2329;
    text-align: left;
    cursor: pointer;
  }
  .pm-profile-home:hover { background: #F5F7FA; }
  .pm-sidebar-nav {
    display: grid;
    gap: 5px;
    padding-top: 18px;
  }
  .pm-sidebar-label {
    padding: 0 10px 7px;
    color: #8F959E;
    font-size: 12px;
    font-weight: 600;
  }
  .pm-sidebar-nav-item {
    width: 100%;
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: #646A73;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }
  .pm-sidebar-nav-item svg { width: 18px; height: 18px; flex: 0 0 auto; }
  .pm-sidebar-nav-item span { flex: 1; }
  .pm-sidebar-nav-item em { color: #8F959E; font-size: 12px; font-style: normal; }
  .pm-sidebar-nav-item:hover { background: #F5F7FA; color: #3370FF; }
  .pm-sidebar-nav-item[data-active="true"] { background: #EDF4FF; color: #1D4ED8; font-weight: 700; }
  .pm-sidebar-nav-item[data-active="true"] em { color: #3370FF; }
  .pm-sidebar-footer { margin-top: auto; padding-top: 14px; border-top: 1px solid #F0F1F3; }
  .pm-primary-nav {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 16px 8px;
    background: #FFFFFF;
    overflow: visible;
  }
  .pm-primary-nav-top,
  .pm-primary-nav-bottom {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    flex: 0 0 auto;
  }
  .pm-primary-nav-item {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #999999;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: 0 0 44px;
    position: relative;
    z-index: 1;
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }
  .pm-primary-nav-item:hover {
    background: #f5f7fa;
    color: #666666;
  }
  .pm-primary-nav-item[data-active="true"] {
    background: #edf4ff;
    color: #1677ff;
  }
  .pm-secondary-nav {
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    padding: 20px 16px 16px;
    border-left: 1px solid #f4f5f7;
    background: #FFFFFF;
  }
  .pm-secondary-head {
    min-height: 48px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 22px;
  }
  .pm-secondary-title {
    color: #333333;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 600;
  }
  .pm-secondary-subtitle {
    margin-top: 3px;
    color: #999999;
    font-size: 12px;
    line-height: 1.35;
  }
  .pm-secondary-scroll {
    min-height: 0;
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-width: thin;
  }
  .pm-sidebar-section {
    margin-bottom: 28px;
  }
  .pm-sidebar-title {
    padding: 0 8px 8px;
    color: #999999;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 500;
  }
  .pm-nav-item {
    width: 100%;
    min-height: 38px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #666666;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    position: relative;
    margin-bottom: 2px;
    transition: background 0.15s ease, color 0.15s ease, padding 0.15s ease;
  }
  .pm-nav-item:hover {
    background: #f5f7fa;
    color: #333333;
  }
  .pm-nav-item[data-active="true"] {
    background: #edf4ff;
    color: #1677ff;
    font-weight: 500;
    box-shadow: none;
  }
  .pm-nav-item[data-active="true"]::before {
    content: "";
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 999px;
    background: #1677ff;
  }
  .pm-nav-item-child {
    padding-left: 26px;
    font-size: 13px;
    font-weight: 400;
  }
  .pm-nav-count {
    min-width: 24px;
    height: 20px;
    border-radius: 999px;
    background: #f5f6f8;
    color: #999999;
    font-size: 12px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 7px;
  }
  .pm-nav-label {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .pm-nav-icon {
    width: 22px;
    height: 22px;
    border-radius: 0;
    background: transparent;
    color: currentColor;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .pm-sidebar-profile {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    margin-top: 0;
    padding: 0 4px 18px;
    color: #666666;
  }
  .pm-sidebar-avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: #edf4ff;
    color: #1677ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    flex: 0 0 auto;
  }
  .pm-sidebar-profile-main {
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .pm-sidebar-profile-main b,
  .pm-sidebar-profile-main small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-sidebar-profile-main b {
    color: #333333;
    font-size: 13px;
    line-height: 1.3;
    font-weight: 500;
  }
  .pm-sidebar-profile-main small {
    color: #999999;
    font-size: 12px;
    line-height: 1.25;
  }
  .pm-sidebar-metric {
    padding: 8px;
    border: 1px solid #E8EAED;
    border-radius: 6px;
    background: #FAFAFA;
    margin-top: 8px;
  }
  .pm-sidebar-metric-row {
    display: flex;
    justify-content: space-between;
    color: #646A73;
    font-size: 12px;
    margin-bottom: 6px;
  }
  .pm-progress {
    height: 5px;
    border-radius: 999px;
    background: #E5E6EB;
    overflow: hidden;
  }
  .pm-progress > span {
    display: block;
    height: 100%;
    background: #3370FF;
  }
  .pm-approval-progress > span {
    background: #14B8A6;
  }
  .pm-approval-inline {
    min-width: 0;
  }
  .pm-approval-inline-sub {
    margin-top: 4px;
    color: #646A73;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-main {
    min-width: 0;
    padding: 14px 16px 22px;
    background: #F3F6FB;
    box-sizing: border-box;
  }
  .pm-metric-card {
    border: 1px solid #D8E2F0;
    border-radius: 10px;
    background: linear-gradient(180deg, #FFFFFF 0%, #F9FBFF 100%);
    box-shadow: 0 10px 28px rgba(31,35,41,0.04);
  }
  .pm-toolbar {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #FFFFFF;
    border: 1px solid #DDE3EC;
    border-radius: 6px 6px 0 0;
    padding: 8px 10px;
  }
  .pm-toolbar-left,
  .pm-toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pm-view-title {
    color: #1F2329;
    font-size: 16px;
    font-weight: 800;
  }
  .pm-muted {
    color: #646A73;
    font-size: 12px;
  }
  .pm-selector {
    --border-radius: 5px;
    --checked-color: #3370FF;
    max-width: 520px;
  }
  .pm-selector .adm-selector-item {
    min-height: 28px;
    border-radius: 5px;
    font-size: 12px;
    padding: 4px 9px;
  }
  .pm-content {
    background: #F7F9FC;
    border: 1px solid #D8E2F0;
    border-top: 0;
    border-radius: 0 0 10px 10px;
    min-height: 520px;
    overflow: hidden;
    box-shadow: 0 8px 22px rgba(31,35,41,0.04);
  }
  .pm-summary-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin: 10px 0;
  }
  .pm-cockpit {
    display: grid;
    gap: 12px;
    margin-bottom: 14px;
  }
  .pm-cockpit-hero {
    border-radius: 12px;
    background: linear-gradient(120deg, #172642, #2B1D49);
    color: #FFFFFF;
    padding: 18px;
  }
  .pm-cockpit-kicker {
    color: rgba(255,255,255,0.72);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.8px;
  }
  .pm-cockpit-title {
    margin-top: 6px;
    font-size: 22px;
    font-weight: 900;
  }
  .pm-cockpit-sub {
    margin-top: 6px;
    color: rgba(255,255,255,0.76);
    font-size: 13px;
  }
  .pm-identity-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }
  .pm-identity-item {
    border-radius: 8px;
    background: rgba(255,255,255,0.12);
    padding: 9px 10px;
    min-width: 0;
  }
  .pm-identity-item small {
    display: block;
    color: rgba(255,255,255,0.66);
    font-size: 11px;
  }
  .pm-identity-item b {
    display: block;
    margin-top: 3px;
    color: rgba(255,255,255,0.94);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-identity-switch {
    display: inline-flex;
    gap: 6px;
    border-radius: 8px;
    background: rgba(255,255,255,0.12);
    padding: 4px;
    margin-top: 12px;
  }
  .pm-identity-switch button {
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: rgba(255,255,255,0.78);
    padding: 0 10px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .pm-identity-switch button[data-active="true"] {
    background: #FFFFFF;
    color: #1D4ED8;
  }
  .pm-cockpit-grid {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 12px;
  }
  .pm-cockpit-panel {
    border: 1px solid #DDE6F6;
    border-radius: 10px;
    background: linear-gradient(180deg, #FFFFFF 0%, #F7FAFF 100%);
    padding: 14px;
    min-width: 0;
  }
  .pm-cockpit-panel h3 {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 10px;
    color: #1F2329;
    font-size: 14px;
  }
  .pm-cockpit-panel h3 span {
    color: #8F959E;
    font-size: 12px;
    font-weight: 600;
  }
  .pm-brief-list {
    display: grid;
    gap: 8px;
  }
  .pm-brief-item {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: start;
    border: 1px solid #F0F2F5;
    border-radius: 8px;
    background: #FAFBFC;
    padding: 9px;
  }
  .pm-brief-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    margin-top: 5px;
  }
  .pm-brief-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-brief-desc {
    margin-top: 2px;
    color: #646A73;
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .pm-cockpit-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }
  .pm-cockpit-metric {
    border-radius: 10px;
    background: #EEF5FF;
    padding: 12px;
  }
  .pm-cockpit-metric small {
    color: #646A73;
    font-size: 12px;
  }
  .pm-cockpit-metric b {
    display: block;
    margin-top: 4px;
    color: #111827;
    font-size: 24px;
  }
  .pm-line-health {
    display: grid;
    gap: 7px;
    margin-top: 12px;
  }
  .pm-line-health-row {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: center;
    color: #646A73;
    font-size: 12px;
  }
  .pm-line-health-bar {
    height: 7px;
    border-radius: 999px;
    background: #EEF0F4;
    overflow: hidden;
  }
  .pm-line-health-bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
  }
  .pm-view-switch {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pm-view-switch button {
    height: 28px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #FFFFFF;
    color: #4E5969;
    padding: 0 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .pm-view-switch button[data-active="true"] {
    border-color: #3370FF;
    background: #F0F6FF;
    color: #3370FF;
    font-weight: 800;
  }
  .pm-category-select {
    height: 30px;
    min-width: 128px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 0 30px 0 10px;
    font-size: 12px;
    font-weight: 800;
    outline: none;
  }
  .pm-category-select:focus {
    border-color: #3370FF;
    box-shadow: 0 0 0 3px rgba(51,112,255,0.12);
  }
  .pm-view-panel {
    padding: 12px;
  }
  .pm-board-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(180px, 1fr));
    gap: 12px;
    min-width: 1320px;
  }
  .pm-board-column {
    border: 1px solid #DDE6F6;
    border-radius: 10px;
    background: #F0F6FF;
    min-height: 280px;
    padding: 10px;
  }
  .pm-board-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
    margin-bottom: 9px;
  }
  .pm-board-card {
    width: 100%;
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    background: #FFFFFF;
    padding: 9px;
    margin-bottom: 8px;
    text-align: left;
    cursor: pointer;
  }
  .pm-board-card b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-board-card small {
    display: block;
    margin-top: 5px;
    color: #646A73;
    font-size: 12px;
  }
  .pm-gantt-sheet {
    min-width: 1080px;
    border: 1px solid #D4E0F0;
    border-radius: 10px;
    background: #FFFFFF;
    overflow: hidden;
  }
  .pm-gantt-head,
  .pm-gantt-row {
    display: grid;
    grid-template-columns: 260px 108px 96px 96px 1fr;
    align-items: center;
  }
  .pm-gantt-head {
    min-height: 38px;
    background: #F7F9FC;
    border-bottom: 1px solid #E5E6EB;
    color: #646A73;
    font-size: 12px;
    font-weight: 850;
  }
  .pm-gantt-head > span,
  .pm-gantt-cell {
    min-width: 0;
    padding: 8px 10px;
    border-right: 1px solid #EEF0F4;
  }
  .pm-gantt-row {
    min-height: 46px;
    border-bottom: 1px solid #F0F2F5;
    background: #FFFFFF;
    cursor: pointer;
  }
  .pm-gantt-row:hover {
    background: #F7FAFF;
  }
  .pm-gantt-name {
    min-width: 0;
    color: #1F2329;
    font-size: 13px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-gantt-days {
    display: grid;
    height: 100%;
  }
  .pm-gantt-day {
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid #EEF0F4;
    color: #646A73;
    font-size: 12px;
    white-space: nowrap;
  }
  .pm-gantt-track {
    position: relative;
    height: 100%;
    min-height: 46px;
    background-image: linear-gradient(to right, #EEF0F4 1px, transparent 1px);
    background-size: 44px 100%;
  }
  .pm-gantt-bar {
    position: absolute;
    top: 13px;
    display: block;
    height: 20px;
    min-width: 24px;
    border-radius: 5px;
    background: linear-gradient(90deg, #3370FF, #14B8A6);
    box-shadow: 0 4px 10px rgba(51,112,255,0.22);
  }
  .pm-gantt-bar[data-status="planning"] {
    background: linear-gradient(90deg, #8FC0FF, #3370FF);
  }
  .pm-gantt-bar[data-status="completed"],
  .pm-gantt-bar[data-status="archived"] {
    background: linear-gradient(90deg, #34C759, #14B8A6);
  }
  .pm-metric-card {
    padding: 12px;
  }
  .pm-metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 8px;
  }
  .pm-metric-item {
    border: 1px solid #EEF0F4;
    border-radius: 7px;
    background: #FAFBFC;
    padding: 9px;
  }
  .pm-metric-number {
    color: #1F2329;
    font-size: 18px;
    line-height: 1.1;
    font-weight: 850;
  }
  .pm-metric-number[data-tone="good"] {
    color: #15803D;
  }
  .pm-metric-number[data-tone="warn"] {
    color: #B45309;
  }
  .pm-metric-number[data-tone="danger"] {
    color: #B91C1C;
  }
  .pm-status-overview-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    grid-column: 1 / -1;
  }
  .pm-status-card {
    border: 1px solid #DDE6F6;
    border-radius: 10px;
    background: #F8FBFF;
    padding: 9px;
    min-width: 0;
  }
  .pm-status-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 7px;
  }
  .pm-status-card-title {
    color: #646A73;
    font-size: 12px;
    font-weight: 800;
  }
  .pm-status-card-count {
    color: #1F2329;
    font-size: 18px;
    line-height: 1;
    font-weight: 900;
  }
  .pm-status-project-list {
    display: grid;
    gap: 4px;
    max-height: 168px;
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }
  .pm-status-project-name {
    width: 100%;
    border: 0;
    border-radius: 4px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 4px 6px;
    font-size: 12px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    font-family: inherit;
  }
  .pm-status-project-name:hover,
  .pm-status-project-name:focus-visible {
    color: #3370FF;
    background: #F0F6FF;
    outline: none;
  }
  .pm-status-card-empty {
    color: #A8ABB2;
    font-size: 12px;
    padding: 4px 0;
  }
  .pm-table-scroll {
    width: 100%;
    overflow-x: auto;
  }
  .pm-project-list {
    display: grid;
    gap: 14px;
    padding: 12px;
    background: #F4F6FA;
  }
  .pm-project-card {
    border: 1px solid #D6E1EF;
    border-radius: 10px;
    background: linear-gradient(180deg, #FFFFFF 0%, #FBFDFF 100%);
    box-shadow: 0 8px 20px rgba(31,35,41,0.06);
    overflow: hidden;
    scroll-margin-top: 76px;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }
  .pm-project-card[data-highlight="true"] {
    border-color: #3370FF;
    box-shadow: 0 0 0 3px rgba(51,112,255,0.16), 0 8px 20px rgba(31,35,41,0.06);
    background: #F8FBFF;
  }
  .pm-project-card-head {
    display: grid;
    grid-template-columns: minmax(220px, 1.35fr) minmax(110px, 0.52fr) minmax(90px, 0.45fr) minmax(80px, 0.42fr) minmax(150px, 0.74fr) minmax(60px, 0.3fr) minmax(110px, 0.55fr) minmax(60px, 0.3fr);
    gap: 10px;
    align-items: center;
    min-width: 820px;
    padding: 10px 12px;
  }
  .pm-project-card-labels {
    display: grid;
    grid-template-columns: minmax(220px, 1.35fr) minmax(110px, 0.52fr) minmax(90px, 0.45fr) minmax(80px, 0.42fr) minmax(150px, 0.74fr) minmax(60px, 0.3fr) minmax(110px, 0.55fr) minmax(60px, 0.3fr);
    gap: 10px;
    min-width: 820px;
    padding: 8px 12px;
    color: #646A73;
    font-size: 11px;
    font-weight: 800;
    border-bottom: 1px solid #E5E6EB;
    background: #F7F8FA;
  }
  .pm-project-card-cell {
    min-width: 0;
    color: #1F2329;
    font-size: 12px;
  }
  .pm-project-card-cell-action {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .pm-project-card-label-action {
    text-align: right;
  }
  .pm-project-card:hover {
    border-color: #C8D6EA;
    box-shadow: 0 10px 24px rgba(31,35,41,0.08);
  }
  .pm-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .pm-table th {
    height: 32px;
    padding: 0 9px;
    border-bottom: 1px solid #E5E6EB;
    background: #F7F8FA;
    color: #646A73;
    font-size: 11px;
    font-weight: 700;
    text-align: left;
  }
  .pm-table td {
    height: 40px;
    padding: 6px 9px;
    border-bottom: 1px solid #E8EAED;
    color: #1F2329;
    font-size: 12px;
    vertical-align: middle;
  }
  .pm-table tr:hover td {
    background: #F7FAFF;
  }
  .pm-table tr[data-expanded="true"] td {
    background: #F7FAFF;
  }
  .pm-project-table tbody tr.pm-project-main-row td {
    background: #FFFFFF;
    border-top: 12px solid #F4F6FA;
    border-bottom: 1px solid #E6EAF2;
  }
  .pm-project-table tbody tr.pm-project-main-row td:first-child {
    border-left: 1px solid #E1E7F0;
    border-radius: 8px 0 0 0;
  }
  .pm-project-table tbody tr.pm-project-main-row td:last-child {
    border-right: 1px solid #E1E7F0;
    border-radius: 0 8px 0 0;
  }
  .pm-project-table tbody tr.pm-project-main-row[data-has-approval="false"] td {
    border-bottom: 1px solid #E1E7F0;
  }
  .pm-project-table tbody tr.pm-project-main-row[data-has-approval="false"] td:first-child {
    border-radius: 8px 0 0 8px;
  }
  .pm-project-table tbody tr.pm-project-main-row[data-has-approval="false"] td:last-child {
    border-radius: 0 8px 8px 0;
  }
  .pm-project-table tbody tr.pm-project-main-row:hover td {
    background: #FBFCFF;
  }
  .pm-approval-board-row {
    background: #F3F7FF;
    padding: 8px 10px 10px;
    border-top: 1px solid #E8EEF8;
  }
  .pm-approval-board-row:hover {
    background: #F3F7FF;
  }
  .pm-stage-node-map {
    background: #FFFFFF;
    border-top: 1px solid #EEF3FB;
    padding: 9px 10px 10px;
  }
  .pm-stage-node-map-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    color: #646A73;
    font-size: 11px;
  }
  .pm-stage-node-map-head span {
    color: #1F2329;
    font-weight: 850;
  }
  .pm-stage-node-map-head b {
    color: #3370FF;
    font-size: 11px;
  }
  .pm-stage-node-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(132px, 1fr));
    gap: 7px;
    overflow-x: auto;
  }
  .pm-stage-node-item {
    min-width: 132px;
    border: 1px solid #E8EEF8;
    border-radius: 7px;
    background: #FAFCFF;
    padding: 7px;
  }
  .pm-stage-node-title {
    color: #1D4ED8;
    font-size: 11px;
    line-height: 1.25;
    font-weight: 850;
    margin-bottom: 5px;
  }
  .pm-stage-node-list {
    color: #4E5969;
    font-size: 11px;
    line-height: 1.45;
    word-break: break-word;
  }
  .pm-approval-board {
    max-width: none;
    margin: 0;
    border: 1px solid #D8E4F8;
    border-radius: 8px;
    background: #FFFFFF;
    padding: 8px 10px;
    box-shadow: 0 4px 14px rgba(31,35,41,0.04);
    cursor: pointer;
  }
  .pm-approval-board-head {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #646A73;
    font-size: 11px;
    margin-bottom: 7px;
    flex-wrap: wrap;
    padding-bottom: 7px;
    border-bottom: 1px solid #EEF3FB;
  }
  .pm-approval-board-head > span:first-child {
    color: #1F2329;
    font-weight: 800;
  }
  .pm-approval-board-head b {
    color: #1D4ED8;
    font-size: 12px;
  }
  .pm-approval-node-flow {
    display: flex;
    align-items: flex-start;
    gap: 0;
    margin-top: 0;
    overflow-x: auto;
    padding: 3px 0 5px;
    background: #FAFCFF;
    border-radius: 6px;
  }
  .pm-approval-node-wrap {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 4px;
    width: 76px;
    flex: 0 0 76px;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .pm-approval-node-wrap:hover .pm-approval-node {
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(31,35,41,0.12);
  }
  .pm-approval-node {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid #32C15B;
    background: #EAFBE8;
    color: #168A35;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 850;
    box-sizing: border-box;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node {
    border-color: #3370FF;
    background: #3370FF;
    color: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(51,112,255,0.12);
  }
  .pm-approval-node-wrap[data-selected="true"] .pm-approval-node {
    outline: 2px solid rgba(51,112,255,0.28);
    outline-offset: 2px;
  }
  .pm-approval-node-wrap[data-status="waiting"] .pm-approval-node {
    border-color: #C6CBD2;
    color: #8F959E;
    background: #FFFFFF;
  }
  .pm-approval-node-label {
    width: 74px;
    color: #1F2329;
    font-size: 9px;
    line-height: 1.25;
    text-align: center;
    word-break: keep-all;
  }
  .pm-approval-node-date {
    color: #8F959E;
    font-size: 9px;
    line-height: 1.1;
    height: 11px;
    max-width: 74px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-approval-node-wrap[data-status="done"] .pm-approval-node-date {
    color: #15803D;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node-date {
    color: #1D4ED8;
    font-weight: 700;
  }
  .pm-approval-line {
    height: 2px;
    width: 24px;
    flex: 0 0 24px;
    margin-top: 19px;
    background: #BFC6D1;
    position: relative;
  }
  .pm-approval-line span {
    position: absolute;
    left: 50%;
    top: -15px;
    transform: translateX(-50%);
    color: #8F959E;
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
  }
  .pm-approval-line::after {
    content: "";
    position: absolute;
    right: -1px;
    top: -3px;
    width: 6px;
    height: 6px;
    border-top: 2px solid #C6CBD2;
    border-right: 2px solid #C6CBD2;
    transform: rotate(45deg);
  }
  .pm-approval-line[data-active="true"] {
    background: #74C989;
  }
  .pm-approval-line[data-active="true"]::after {
    border-color: #74C989;
  }
  .pm-approval-line[data-active="true"] span {
    color: #15803D;
  }
  .pm-approval-node-wrap[data-status="done"] .pm-approval-node-label {
    color: #15803D;
    font-weight: 700;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node-label {
    color: #1D4ED8;
    font-weight: 850;
  }
  .pm-approval-node-group {
    color: #8F959E;
    font-size: 9px;
    line-height: 1.1;
    height: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 74px;
  }
  .pm-approval-dialog {
    display: grid;
    gap: 12px;
    text-align: left;
  }
  .pm-approval-dialog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .pm-approval-dialog-grid div,
  .pm-approval-dialog-section {
    border: 1px solid #E8EAED;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 8px;
  }
  .pm-approval-dialog span {
    display: block;
    color: #8F959E;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .pm-approval-dialog b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .pm-approval-dialog p {
    margin: 0;
    color: #1F2329;
    font-size: 13px;
    line-height: 1.55;
  }
  .pm-approval-node-panel {
    margin-top: 10px;
    border: 1px solid #C9D8F0;
    border-radius: 7px;
    background: #FBFCFF;
    padding: 10px;
    box-shadow: inset 3px 0 0 #3370FF;
  }
  .pm-approval-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #E5ECF8;
  }
  .pm-approval-panel-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
  }
  .pm-approval-panel-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pm-approval-panel-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }
  .pm-approval-panel-grid div {
    border: 1px solid #EEF0F4;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 7px;
    min-width: 0;
  }
  .pm-approval-panel-grid span,
  .pm-approval-panel-box > .pm-muted {
    color: #8F959E;
    font-size: 11px;
  }
  .pm-approval-panel-grid b {
    display: block;
    margin-top: 2px;
    color: #1F2329;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .pm-approval-panel-split {
    display: grid;
    grid-template-columns: minmax(240px, 0.82fr) minmax(320px, 1.18fr);
    gap: 10px;
  }
  .pm-approval-panel-box {
    border: 1px solid #E0E7F2;
    border-radius: 6px;
    background: #FFFFFF;
    padding: 9px;
  }
  .pm-approval-material-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pm-approval-material-list label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    border: 1px solid #E5E6EB;
    border-radius: 999px;
    background: #FFFFFF;
    padding: 0 8px;
    color: #1F2329;
    font-size: 12px;
  }
  .pm-approval-material-table {
    display: grid;
    gap: 8px;
  }
  .pm-approval-material-row {
    display: grid;
    grid-template-columns: minmax(160px, 0.8fr) minmax(240px, 1fr) 96px;
    gap: 8px;
    align-items: center;
    border: 1px solid #EEF0F4;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 8px;
  }
  .pm-approval-material-name {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .pm-approval-material-name span {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #E8F3FF;
    color: #1D4ED8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 800;
    flex: 0 0 auto;
  }
  .pm-approval-material-name b {
    color: #1F2329;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-upload-btn {
    height: 30px;
    border: 1px solid #BACEFD;
    border-radius: 5px;
    background: #F7FAFF;
    color: #1D4ED8;
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
  }
  .pm-upload-btn input {
    display: none;
  }
  .pm-material-readonly {
    min-height: 36px;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    background: #FAFAFA;
    color: #646A73;
    padding: 8px 10px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .pm-material-readonly a {
    color: #1D4ED8;
    font-weight: 700;
    text-decoration: none;
  }
  .pm-guidance-box {
    margin-top: 10px;
    border: 1px solid #E4D7FF;
    border-radius: 6px;
    background: #FCFAFF;
    padding: 9px;
  }
  .pm-guidance-head,
  .pm-guidance-record-top,
  .pm-guidance-record-meta,
  .pm-guidance-evidence-tags {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pm-guidance-head {
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #EFE7FF;
  }
  .pm-guidance-evidence-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }
  .pm-guidance-evidence-card {
    border: 1px solid #EEE7FA;
    border-radius: 6px;
    background: #FFFFFF;
    padding: 8px;
    min-width: 0;
  }
  .pm-guidance-evidence-card span,
  .pm-guidance-record-meta {
    color: #8F959E;
    font-size: 11px;
  }
  .pm-guidance-evidence-card b {
    display: block;
    margin-top: 3px;
    color: #1F2329;
    font-size: 12px;
    line-height: 1.45;
  }
  .pm-guidance-form {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 9px;
  }
  .pm-guidance-checks {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .pm-guidance-checks label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    border: 1px solid #E5E6EB;
    border-radius: 999px;
    background: #FFFFFF;
    padding: 0 9px;
    color: #4E5969;
    font-size: 12px;
  }
  .pm-guidance-textarea {
    grid-column: 1 / 4;
    min-height: 64px;
    resize: vertical;
  }
  .pm-guidance-save {
    min-height: 64px;
    align-self: stretch;
  }
  .pm-guidance-record-list {
    display: grid;
    gap: 8px;
  }
  .pm-guidance-record {
    border: 1px solid #EEE7FA;
    border-radius: 6px;
    background: #FFFFFF;
    padding: 8px;
  }
  .pm-guidance-record-top {
    justify-content: space-between;
  }
  .pm-guidance-record-top b {
    color: #1F2329;
    font-size: 12px;
  }
  .pm-guidance-record p {
    margin: 6px 0;
    color: #1F2329;
    font-size: 12px;
    line-height: 1.55;
  }
  .pm-guidance-evidence-tags {
    margin-top: 6px;
  }
  .pm-guidance-evidence-tags span {
    border-radius: 999px;
    background: #F4F3FF;
    color: #5B21B6;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 700;
  }
  .pm-kv-line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid #F0F2F5;
    padding: 8px 0;
    color: #1F2329;
    font-size: 12px;
  }
  .pm-kv-line span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-kv-line b {
    color: #3370FF;
    white-space: nowrap;
  }
  .pm-name-cell {
    min-width: 0;
  }
  .pm-name-main {
    color: #1F2329;
    font-size: 13px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-name-sub {
    margin-top: 2px;
    color: #8F959E;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-tag {
    display: inline-flex;
    align-items: center;
    height: 20px;
    border-radius: 999px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .pm-assignee {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .pm-assignee-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-row-action {
    height: 26px;
    color: #646A73;
    padding: 0 8px;
  }
  .pm-row-action-danger {
    color: #C2410C;
  }
  .pm-row-action-danger:hover {
    border-color: #FCA5A5;
    background: #FFF1F0;
  }
  .pm-inline-editor {
    padding: 14px;
    background: #F4F6FA;
    border-bottom: 1px solid #E5E6EB;
  }
  .pm-detail-shell {
    display: grid;
    gap: 12px;
  }
  .pm-detail-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    background: #FFFFFF;
    border: 1px solid #E1E6F0;
    border-radius: 8px;
    padding: 12px;
  }
  .pm-detail-title {
    color: #1F2329;
    font-size: 16px;
    font-weight: 850;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-detail-subtitle {
    margin-top: 4px;
    color: #646A73;
    font-size: 12px;
    line-height: 1.5;
  }
  .pm-detail-badges {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pm-detail-section {
    background: #FFFFFF;
    border: 1px solid #E1E6F0;
    border-radius: 8px;
    overflow: hidden;
  }
  .pm-detail-section-head {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    background: #FAFBFC;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-detail-section-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 850;
  }
  .pm-detail-section-body {
    padding: 12px;
  }
  .pm-approval-section {
    border-color: #BACEFD;
  }
  .pm-approval-status-strip {
    display: grid;
    grid-template-columns: minmax(180px, 1.2fr) minmax(150px, 1fr) minmax(120px, 0.8fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid #D8E3FF;
    border-radius: 7px;
    background: #F7FAFF;
    padding: 10px 12px;
  }
  .pm-approval-status-strip div {
    min-width: 0;
  }
  .pm-approval-status-strip span:not(.pm-tag) {
    display: block;
    color: #646A73;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .pm-approval-status-strip b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-approval-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 14px;
    align-items: stretch;
    padding-bottom: 12px;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-approval-kicker {
    color: #3370FF;
    font-size: 12px;
    font-weight: 800;
    margin-bottom: 4px;
  }
  .pm-approval-title {
    color: #1F2329;
    font-size: 20px;
    line-height: 1.3;
    font-weight: 900;
  }
  .pm-approval-desc {
    margin-top: 8px;
    color: #4E5969;
    font-size: 13px;
    line-height: 1.7;
  }
  .pm-approval-current {
    border: 1px solid #D8E3FF;
    border-radius: 7px;
    background: #F7FAFF;
    padding: 12px;
    display: grid;
    gap: 7px;
    align-content: start;
  }
  .pm-approval-current b {
    color: #1F2329;
    font-size: 16px;
  }
  .pm-approval-current span:not(.pm-tag) {
    color: #646A73;
    font-size: 12px;
  }
  .pm-approval-stepper {
    display: grid;
    grid-template-columns: repeat(6, minmax(150px, 1fr));
    gap: 8px;
    margin-top: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .pm-approval-step {
    min-width: 150px;
    border: 1px solid #E5E6EB;
    border-radius: 7px;
    background: #FFFFFF;
    padding: 10px;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 8px;
  }
  .pm-approval-step[data-status="current"] {
    border-color: #3370FF;
    box-shadow: 0 8px 20px rgba(51,112,255,0.12);
  }
  .pm-approval-step-index {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: #F2F3F5;
    color: #646A73;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 850;
  }
  .pm-approval-step[data-status="done"] .pm-approval-step-index {
    background: #DCFCE7;
    color: #15803D;
  }
  .pm-approval-step[data-status="current"] .pm-approval-step-index {
    background: #3370FF;
    color: #FFFFFF;
  }
  .pm-approval-step-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 6px;
  }
  .pm-approval-step-head b {
    color: #1F2329;
    font-size: 13px;
  }
  .pm-approval-step p {
    margin: 6px 0 0;
    color: #4E5969;
    font-size: 12px;
    line-height: 1.6;
  }
  .pm-approval-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.8fr) minmax(320px, 1.2fr);
    gap: 12px;
    margin-top: 12px;
  }
  .pm-approval-card {
    border: 1px solid #E8EAED;
    border-radius: 7px;
    background: #FAFBFC;
    padding: 12px;
  }
  .pm-approval-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .pm-approval-fields div {
    min-width: 0;
    border-bottom: 1px solid #EEF0F4;
    padding-bottom: 7px;
  }
  .pm-approval-fields span {
    display: block;
    color: #8F959E;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .pm-approval-fields b {
    display: block;
    color: #1F2329;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .pm-approval-stage-list {
    display: grid;
    gap: 10px;
  }
  .pm-approval-stage-list b {
    color: #1F2329;
    font-size: 13px;
  }
  .pm-approval-stage-list p {
    margin: 5px 0 0;
    color: #4E5969;
    font-size: 12px;
    line-height: 1.65;
  }
  .pm-inline-grid {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 320px;
    gap: 12px;
    align-items: start;
  }
  .pm-detail-grid {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) minmax(320px, 0.92fr);
    gap: 12px;
    align-items: stretch;
  }
  .pm-inline-panel {
    background: #FFFFFF;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
    padding: 10px;
  }
  .pm-inline-label {
    color: #646A73;
    font-size: 12px;
    font-weight: 700;
    margin: 0 0 6px;
  }
  .pm-section-title {
    color: #1F2329;
    font-size: 13px;
    font-weight: 800;
    margin: 0 0 8px;
  }
  .pm-inline-field {
    width: 100%;
    min-height: 30px;
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: #FFFFFF;
    color: #1F2329;
    padding: 6px 8px;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }
  .pm-inline-textarea {
    min-height: 74px;
    resize: vertical;
    line-height: 1.5;
  }
  .pm-inline-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .pm-inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .pm-task-panel {
    display: grid;
    gap: 0;
  }
  .pm-task-table-head,
  .pm-task-table-row {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 86px 86px minmax(120px, 0.55fr) 76px;
    gap: 10px;
    align-items: center;
  }
  .pm-task-table-head {
    color: #646A73;
    font-size: 12px;
    font-weight: 800;
    padding: 8px 0;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-task-table-row {
    min-height: 42px;
    padding: 8px 0;
    border-bottom: 1px solid #F2F3F5;
    font-size: 12px;
    cursor: pointer;
  }
  .pm-task-table-row:hover,
  .pm-task-table-row[data-expanded="true"] {
    background: #F7FAFF;
  }
  .pm-task-group {
    border-bottom: 1px solid #E5E6EB;
  }
  .pm-task-group-head {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 10px;
    background: #FAFAFA;
    border-bottom: 1px solid #E8EAED;
  }
  .pm-task-group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 13px;
    font-weight: 800;
    color: #1F2329;
  }
  .pm-empty-wrap {
    padding: 58px 16px;
  }

  /* Enterprise SaaS polish for the project approval surface. */
  .pm-workbench {
    background: #f5f6f8;
    color: #333333;
  }
  .pm-main {
    background: #f5f6f8;
    padding: 16px 20px 24px;
  }
  .pm-toolbar,
  .pm-content,
  .pm-metric-card,
  .pm-cockpit-panel,
  .pm-status-card {
    border-color: #ebeef5;
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(31, 35, 41, 0.04);
  }
  .pm-toolbar {
    border-radius: 10px;
    min-height: 48px;
    margin-bottom: 12px;
    padding: 8px 12px;
  }
  .pm-content {
    border-radius: 10px;
    border-top: 1px solid #ebeef5;
    background: #ffffff;
    overflow: visible;
  }
  .pm-project-list {
    gap: 18px;
    padding: 18px;
    background: #f5f6f8;
  }
  .pm-project-card {
    border: 1px solid #ebeef5;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(31, 35, 41, 0.04);
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, background 0.18s ease;
  }
  .pm-project-card:hover {
    border-color: #d9e8ff;
    box-shadow: 0 6px 18px rgba(31, 35, 41, 0.07);
    transform: translateY(-1px);
  }
  .pm-project-card[data-highlight="true"] {
    border-color: #1677ff;
    box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.12), 0 6px 18px rgba(31, 35, 41, 0.07);
    background: #ffffff;
  }
  .pm-project-card-head {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(150px, auto) auto;
    gap: 16px;
    align-items: center;
    min-width: 0;
    padding: 14px 20px 10px;
  }
  .pm-project-overview,
  .pm-project-owner {
    min-width: 0;
  }
  .pm-name-main {
    color: #333333;
    font-size: 16px;
    line-height: 1.45;
    font-weight: 600;
  }
  .pm-name-sub {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    color: #999999;
  }
  .pm-tag {
    height: 22px;
    border: 1px solid rgba(0, 0, 0, 0.04);
    border-radius: 999px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 500;
    line-height: 20px;
  }
  .pm-card-field-label,
  .pm-card-field span {
    display: block;
    color: #999999;
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 4px;
  }
  .pm-card-field b {
    display: block;
    min-width: 0;
    color: #333333;
    font-size: 14px;
    line-height: 1.5;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-project-owner {
    display: grid;
    gap: 6px;
    align-content: center;
  }
  .pm-project-card-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .pm-row-action,
  .pm-primary-btn,
  .pm-primary,
  .pm-tool-btn,
  .pm-view-switch button,
  .pm-category-select {
    height: 32px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }
  .pm-primary,
  .pm-primary-btn {
    border-color: #1677ff;
    background: #1677ff;
    color: #ffffff;
  }
  .pm-primary:hover,
  .pm-primary-btn:hover {
    background: #0958d9;
    box-shadow: 0 4px 12px rgba(22, 119, 255, 0.2);
  }
  .pm-row-action,
  .pm-tool-btn,
  .pm-view-switch button {
    border-color: #ebeef5;
    background: #ffffff;
    color: #666666;
  }
  .pm-row-action:hover,
  .pm-tool-btn:hover,
  .pm-view-switch button:hover {
    border-color: #1677ff;
    color: #1677ff;
    background: #f0f7ff;
  }
  .pm-row-action-danger {
    color: #ff4d4f;
  }
  .pm-row-action-danger:hover {
    border-color: #ffccc7;
    background: #fff1f0;
    color: #ff4d4f;
  }
  .pm-progress {
    height: 6px;
    background: #f0f0f0;
  }
  .pm-progress > span {
    background: #1677ff;
    transition: width 0.18s ease;
  }
  .pm-approval-progress > span {
    background: #52c41a;
  }
  .pm-project-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 0.44fr);
    gap: 12px;
    padding: 0 20px 12px;
    background: #ffffff;
  }
  .pm-project-activity-panel,
  .pm-project-people-panel {
    min-width: 0;
    border-radius: 10px;
    background: #fafbfc;
    border: 1px solid #f0f0f0;
    padding: 10px 12px;
  }
  .pm-project-people-panel {
    position: relative;
  }
  .pm-project-mini-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .pm-project-mini-head span {
    color: #333333;
    font-size: 13px;
    line-height: 1.3;
    font-weight: 600;
  }
  .pm-project-mini-head b {
    min-width: 20px;
    height: 18px;
    border-radius: 999px;
    background: #f0f7ff;
    color: #1677ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 600;
  }
  .pm-project-activity-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;
  }
  .pm-project-activity-item {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    min-width: 0;
    padding: 2px 0;
  }
  .pm-project-activity-item i {
    width: 7px;
    height: 7px;
    margin-top: 5px;
    border-radius: 999px;
    background: #c9cdd4;
  }
  .pm-project-activity-item[data-tone="primary"] i {
    background: #1677ff;
  }
  .pm-project-activity-item[data-tone="success"] i {
    background: #52c41a;
  }
  .pm-project-activity-item[data-tone="warning"] i {
    background: #faad14;
  }
  .pm-project-activity-item[data-tone="danger"] i {
    background: #ff4d4f;
  }
  .pm-project-activity-item strong,
  .pm-project-activity-item span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-project-activity-item strong {
    color: #333333;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 600;
  }
  .pm-project-activity-item span {
    margin-top: 2px;
    color: #999999;
    font-size: 11px;
    line-height: 1.3;
  }
  .pm-project-activity-empty {
    grid-column: 1 / -1;
    color: #999999;
    font-size: 12px;
    padding: 4px 0;
  }
  .pm-project-people-editor {
    display: grid;
    gap: 8px;
  }
  .pm-people-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
  }
  .pm-people-row small {
    color: #999999;
    font-size: 12px;
    line-height: 1.3;
  }
  .pm-person-chip,
  .pm-person-avatar-btn,
  .pm-person-member-chip,
  .pm-person-add-btn {
    border: 0;
    background: transparent;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }
  .pm-person-chip {
    min-width: 0;
    max-width: 100%;
    height: 32px;
    border-radius: 999px;
    background: #ffffff;
    border: 1px solid #ebeef5;
    color: #333333;
    padding: 0 9px 0 3px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    justify-self: start;
  }
  .pm-person-chip span:last-child {
    min-width: 0;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }
  .pm-person-chip:hover,
  .pm-person-avatar-btn:hover,
  .pm-person-member-chip:hover,
  .pm-person-add-btn:hover {
    background: #edf4ff;
    transform: translateY(-1px);
  }
  .pm-person-chip:disabled,
  .pm-person-avatar-btn:disabled,
  .pm-person-member-chip:disabled,
  .pm-person-add-btn:disabled {
    cursor: not-allowed;
    opacity: 0.78;
    transform: none;
  }
  .pm-member-avatar-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
    overflow: visible;
  }
  .pm-member-count {
    color: #666666;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    flex: 0 0 auto;
    margin-left: 2px;
  }
  .pm-person-avatar-btn,
  .pm-person-add-btn,
  .pm-inline-avatar,
  .pm-inline-avatar-img {
    width: 30px;
    height: 30px;
    min-width: 30px;
    min-height: 30px;
    max-width: 30px;
    max-height: 30px;
    border-radius: 999px;
    flex: 0 0 auto;
  }
  .pm-person-avatar-btn,
  .pm-person-add-btn {
    margin-left: 0;
    border: 1px solid #e7ebf3;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .pm-person-member-chip {
    min-width: 0;
    max-width: 180px;
    height: 32px;
    border-radius: 999px;
    background: #ffffff;
    border: 1px solid #ebeef5;
    color: #333333;
    padding: 0 9px 0 3px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }
  .pm-person-member-chip span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }
  .pm-person-add-btn {
    background: #ffffff;
    color: #1677ff;
    font-size: 16px;
    line-height: 1;
  }
  .pm-inline-avatar,
  .pm-inline-avatar-img {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    object-fit: cover;
  }
  .pm-inline-avatar {
    background: #edf4ff;
    color: #1677ff;
    font-weight: 600;
  }
  .pm-person-picker {
    position: absolute;
    z-index: 60;
    right: 10px;
    top: 40px;
    width: min(340px, calc(100vw - 48px));
    max-height: 360px;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 18px 44px rgba(31, 35, 41, 0.16);
    padding: 10px;
  }
  .pm-person-picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .pm-person-picker-head span {
    color: #333333;
    font-size: 13px;
    font-weight: 600;
  }
  .pm-person-picker-head button {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #999999;
    cursor: pointer;
  }
  .pm-person-picker-head button:hover {
    background: #f5f7fa;
    color: #333333;
  }
  .pm-person-picker input {
    width: 100%;
    height: 32px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: #f5f6f8;
    color: #333333;
    font-size: 13px;
    outline: none;
    padding: 0 10px;
    box-sizing: border-box;
  }
  .pm-person-picker input:focus {
    border-color: #1677ff;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.08);
  }
  .pm-person-options {
    max-height: 268px;
    overflow-y: auto;
    margin-top: 8px;
    display: grid;
    gap: 4px;
  }
  .pm-person-options button {
    width: 100%;
    min-height: 44px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #333333;
    padding: 6px 8px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    text-align: left;
    cursor: pointer;
  }
  .pm-person-options button:hover,
  .pm-person-options button[data-selected="true"] {
    background: #edf4ff;
  }
  .pm-person-options button:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
  .pm-person-options strong,
  .pm-person-options small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-person-options strong {
    font-size: 13px;
    line-height: 1.35;
    font-weight: 600;
  }
  .pm-person-options small {
    margin-top: 2px;
    color: #999999;
    font-size: 11px;
  }
  .pm-person-options em {
    color: #999999;
    font-size: 11px;
    font-style: normal;
  }
  .pm-person-empty {
    color: #999999;
    font-size: 12px;
    padding: 12px 4px;
  }
  .pm-stage-node-map {
    border-top: 1px solid #f0f0f0;
    background: #ffffff;
    padding: 16px 20px 18px;
  }
  .pm-stage-node-map-head {
    margin-bottom: 12px;
    color: #999999;
    font-size: 12px;
  }
  .pm-stage-node-map-head span {
    color: #333333;
    font-size: 16px;
    font-weight: 600;
  }
  .pm-stage-node-map-head b {
    color: #666666;
    font-size: 12px;
    font-weight: 500;
  }
  .pm-stage-node-grid {
    grid-template-columns: repeat(7, minmax(136px, 1fr));
    gap: 10px;
  }
  .pm-stage-node-item {
    position: relative;
    min-width: 136px;
    min-height: 96px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: #f7f8fa;
    padding: 12px;
    transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  }
  .pm-stage-node-item:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(31, 35, 41, 0.06);
  }
  .pm-stage-node-item[data-stage-status="done"] {
    background: #f6ffed;
    border-color: #d9f7be;
  }
  .pm-stage-node-item[data-stage-status="current"] {
    background: #f0f7ff;
    border-color: #91caff;
    box-shadow: inset 0 0 0 1px rgba(22, 119, 255, 0.08);
  }
  .pm-stage-node-index {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #e5e6eb;
    color: #666666;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .pm-stage-node-item[data-stage-status="done"] .pm-stage-node-index {
    background: #52c41a;
    color: #ffffff;
  }
  .pm-stage-node-item[data-stage-status="current"] .pm-stage-node-index {
    background: #1677ff;
    color: #ffffff;
  }
  .pm-stage-node-title {
    color: #333333;
    font-size: 14px;
    line-height: 1.35;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .pm-stage-node-list {
    color: #666666;
    font-size: 12px;
    line-height: 1.5;
  }
  .pm-approval-board-row {
    border-top: 1px solid #f0f0f0;
    background: #ffffff;
    padding: 16px 20px 20px;
  }
  .pm-approval-board,
  .pm-approval-node-panel {
    border: 0;
    border-radius: 8px;
    background: #fafafa;
    box-shadow: none;
  }
  .pm-approval-board {
    padding: 14px 16px;
  }
  .pm-approval-board-head {
    border-bottom: 1px solid #f0f0f0;
    margin-bottom: 12px;
    padding-bottom: 12px;
    color: #999999;
    font-size: 12px;
  }
  .pm-approval-board-head > span:first-child {
    color: #333333;
    font-size: 16px;
    font-weight: 600;
  }
  .pm-approval-board-head b {
    color: #1677ff;
    font-size: 14px;
    font-weight: 600;
  }
  .pm-approval-node-flow {
    align-items: flex-start;
    gap: 0;
    background: transparent;
    padding: 4px 0 8px;
  }
  .pm-approval-node-wrap {
    width: 104px;
    flex-basis: 104px;
    gap: 6px;
    transition: transform 0.18s ease;
  }
  .pm-approval-node-wrap:hover {
    transform: translateY(-1px);
  }
  .pm-approval-node {
    width: 26px;
    height: 26px;
    border: 1px solid #52c41a;
    background: #f6ffed;
    color: #52c41a;
    font-size: 12px;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node {
    border-color: #1677ff;
    background: #1677ff;
    color: #ffffff;
    box-shadow: 0 0 0 4px rgba(22, 119, 255, 0.12);
  }
  .pm-approval-node-wrap[data-status="waiting"] .pm-approval-node {
    border-color: #d9d9d9;
    background: #ffffff;
    color: #999999;
  }
  .pm-approval-node-group,
  .pm-approval-node-date {
    max-width: 96px;
    color: #999999;
    font-size: 11px;
  }
  .pm-approval-node-label {
    width: 96px;
    color: #333333;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 500;
  }
  .pm-approval-node-wrap[data-status="done"] .pm-approval-node-label {
    color: #52c41a;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node-label {
    color: #1677ff;
    font-weight: 600;
  }
  .pm-approval-line {
    width: 36px;
    flex-basis: 36px;
    margin-top: 32px;
    background: #f0f0f0;
  }
  .pm-approval-line::after {
    border-color: #d9d9d9;
  }
  .pm-approval-line[data-active="true"] {
    background: #b7eb8f;
  }
  .pm-approval-line[data-active="true"]::after {
    border-color: #b7eb8f;
  }
  .pm-approval-line span {
    top: -20px;
    color: #999999;
    font-size: 10px;
  }
  .pm-approval-node-panel {
    margin-top: 14px;
    padding: 14px;
    overflow: hidden;
    animation: pmPanelIn 0.18s ease;
  }
  @keyframes pmPanelIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .pm-approval-panel-head,
  .pm-guidance-head {
    border-bottom-color: #f0f0f0;
  }
  .pm-approval-panel-title {
    color: #333333;
    font-size: 14px;
    font-weight: 600;
  }
  .pm-approval-panel-grid div,
  .pm-approval-panel-box,
  .pm-approval-material-row,
  .pm-guidance-box,
  .pm-guidance-record,
  .pm-guidance-evidence-card {
    border-color: #ebeef5;
    border-radius: 8px;
    background: #ffffff;
  }
  .pm-approval-panel-grid span,
  .pm-approval-panel-box > .pm-muted,
  .pm-muted {
    color: #999999;
  }
  .pm-section-title,
  .pm-view-title {
    color: #333333;
    font-size: 16px;
    font-weight: 600;
  }
  .pm-project-list {
    gap: 12px;
    padding: 12px;
  }
  .pm-project-card-head {
    grid-template-columns: minmax(260px, 1fr) minmax(118px, auto) auto;
    gap: 10px;
    padding: 8px 12px;
    min-height: 52px;
  }
  .pm-name-main {
    font-size: 17px;
    line-height: 1.32;
  }
  .pm-name-sub {
    gap: 4px;
    margin-top: 4px;
  }
  .pm-tag {
    height: 18px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 16px;
  }
  .pm-card-field-label,
  .pm-card-field span {
    font-size: 10px;
    line-height: 1.25;
    margin-bottom: 1px;
  }
  .pm-card-field b {
    font-size: 12px;
    line-height: 1.25;
  }
  .pm-project-owner {
    gap: 2px;
  }
  .pm-approval-inline-sub {
    margin-top: 2px;
    font-size: 10px;
  }
  .pm-progress {
    height: 3px;
  }
  .pm-row-action,
  .pm-primary-btn,
  .pm-primary,
  .pm-tool-btn,
  .pm-view-switch button,
  .pm-category-select {
    height: 28px;
    padding-left: 9px;
    padding-right: 9px;
  }
  .pm-stage-node-map {
    padding: 8px 12px 10px;
  }
  .pm-stage-node-map-head {
    margin-bottom: 8px;
  }
  .pm-stage-node-map-head span {
    font-size: 14px;
  }
  .pm-stage-node-grid {
    grid-template-columns: repeat(7, minmax(116px, 1fr));
    gap: 6px;
  }
  .pm-stage-node-item {
    min-width: 116px;
    min-height: 68px;
    padding: 8px;
  }
  .pm-stage-node-index {
    width: 18px;
    height: 18px;
    font-size: 10px;
    margin-bottom: 5px;
  }
  .pm-stage-node-title {
    font-size: 12px;
    line-height: 1.25;
    margin-bottom: 4px;
  }
  .pm-stage-node-list {
    font-size: 11px;
    line-height: 1.35;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    overflow: visible;
  }
  .pm-stage-node-chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: 18px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: #666666;
    padding: 0 6px;
    font-size: 10px;
    line-height: 16px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .pm-stage-node-item[data-stage-status="done"] .pm-stage-node-chip {
    background: rgba(82, 196, 26, 0.1);
    color: #237804;
  }
  .pm-stage-node-item[data-stage-status="current"] .pm-stage-node-chip {
    background: rgba(22, 119, 255, 0.1);
    color: #0958d9;
  }
  .pm-board-node-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .pm-board-node-chips span {
    display: inline-flex;
    align-items: center;
    min-height: 18px;
    border-radius: 999px;
    background: #edf4ff;
    color: #1677ff;
    padding: 0 6px;
    font-size: 10px;
    line-height: 16px;
  }
  .pm-approval-board-row {
    padding: 10px 14px 12px;
  }
  .pm-approval-board {
    padding: 10px 12px;
  }
  .pm-approval-board-head {
    margin-bottom: 8px;
    padding-bottom: 8px;
  }
  .pm-approval-board-head > span:first-child {
    font-size: 14px;
  }
  .pm-approval-node-flow {
    align-items: flex-start;
    padding: 6px 0 2px;
    overflow: visible;
  }
  .pm-approval-node-wrap {
    position: relative;
    width: 144px;
    flex-basis: 144px;
    gap: 5px;
    min-height: 128px;
    border-radius: 12px;
    padding: 4px 4px 6px;
    background: transparent;
    border: 0;
    box-shadow: none;
    transition: background 0.16s ease, transform 0.16s ease;
  }
  .pm-approval-node-wrap:hover,
  .pm-approval-node-wrap[data-selected="true"] {
    background: rgba(22, 119, 255, 0.05);
    transform: translateY(-1px);
  }
  .pm-approval-node-wrap[data-stage-approval="approved"] {
    color: #237804;
  }
  .pm-approval-node-wrap[data-stage-approval="done"] {
    color: #237804;
  }
  .pm-approval-node-wrap[data-stage-approval="pending"] {
    color: #ad6800;
  }
  .pm-approval-node-wrap[data-stage-approval="rejected"] {
    color: #a8071a;
  }
  .pm-approval-node-wrap[data-stage-approval="current"] {
    color: #0958d9;
  }
  .pm-approval-node-wrap[data-stage-approval="waiting"] {
    color: #999999;
  }
  .pm-approval-node {
    width: 34px;
    height: 34px;
    font-size: 12px;
    border-width: 2px;
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  }
  .pm-approval-node-wrap[data-stage-approval="approved"] .pm-approval-node,
  .pm-approval-node-wrap[data-stage-approval="done"] .pm-approval-node {
    background: #52c41a;
    border-color: #52c41a;
    color: #ffffff;
  }
  .pm-approval-node-wrap[data-stage-approval="pending"] .pm-approval-node {
    background: #faad14;
    border-color: #faad14;
    color: #ffffff;
  }
  .pm-approval-node-wrap[data-stage-approval="rejected"] .pm-approval-node {
    background: #ff4d4f;
    border-color: #ff4d4f;
    color: #ffffff;
  }
  .pm-approval-node-wrap[data-stage-approval="current"] .pm-approval-node {
    background: #1677ff;
    border-color: #1677ff;
    color: #ffffff;
  }
  .pm-approval-node-wrap[data-stage-approval="waiting"] .pm-approval-node {
    background: #ffffff;
    border-color: #d9d9d9;
    color: #999999;
  }
  .pm-approval-node-label {
    width: 132px;
    font-size: 12px;
    line-height: 1.25;
  }
  .pm-approval-node-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 3px;
    width: 136px;
    max-height: 46px;
    overflow: hidden;
  }
  .pm-approval-node-chips span {
    display: inline-flex;
    align-items: center;
    min-height: 16px;
    border-radius: 999px;
    background: rgba(245, 247, 250, 0.9);
    color: #666666;
    padding: 0 5px;
    font-size: 9px;
    line-height: 14px;
    max-width: 128px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-approval-node-wrap[data-status="done"] .pm-approval-node-chips span {
    background: rgba(82, 196, 26, 0.1);
    color: #237804;
  }
  .pm-approval-node-wrap[data-status="current"] .pm-approval-node-chips span {
    background: rgba(22, 119, 255, 0.1);
    color: #0958d9;
  }
  .pm-approval-node-group,
  .pm-approval-node-date {
    max-width: 132px;
    font-size: 10px;
    height: 11px;
  }
  .pm-stage-approval-actions {
    min-height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex-wrap: wrap;
    width: 136px;
  }
  .pm-stage-approval-badge,
  .pm-stage-approval-btn {
    min-height: 20px;
    border-radius: 999px;
    padding: 0 7px;
    font-size: 10px;
    line-height: 18px;
    white-space: nowrap;
  }
  .pm-stage-approval-badge {
    display: inline-flex;
    align-items: center;
    border: 1px solid transparent;
  }
  .pm-stage-approval-badge[data-tone="approved"] {
    background: rgba(82, 196, 26, 0.12);
    color: #237804;
  }
  .pm-stage-approval-badge[data-tone="pending"] {
    background: rgba(250, 173, 20, 0.14);
    color: #ad6800;
  }
  .pm-stage-approval-badge[data-tone="rejected"] {
    background: rgba(255, 77, 79, 0.12);
    color: #a8071a;
  }
  .pm-stage-approval-btn {
    border: 1px solid #ebeef5;
    background: #ffffff;
    color: #666666;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .pm-stage-approval-btn:hover {
    border-color: #1677ff;
    background: #edf4ff;
    color: #1677ff;
  }
  .pm-stage-approval-btn[data-primary="true"] {
    border-color: #1677ff;
    background: #1677ff;
    color: #ffffff;
  }
  .pm-stage-approval-btn:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
  .pm-approval-line {
    width: 24px;
    flex-basis: 24px;
    margin-top: 53px;
    align-self: flex-start;
  }
  .pm-approval-line span {
    display: block;
    height: 2px;
    min-width: 24px;
    overflow: hidden;
    color: transparent;
    border-radius: 999px;
    background: #d9d9d9;
  }
  .pm-approval-line[data-active="true"] span {
    background: #52c41a;
  }
  .pm-approval-line::after {
    display: none;
  }
  .pm-approval-line span {
    display: none !important;
  }
  .pm-cosigner-box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .pm-cosigner-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #f0f7ff;
    color: #1677ff;
    font-size: 12px;
  }
  .pm-cosigner-chip button {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .pm-approval-signers {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .pm-approval-signer {
    font-style: normal;
    padding: 1px 8px;
    border-radius: 999px;
    background: #f5f5f5;
    color: #666;
    font-size: 12px;
  }
  .pm-approval-signer[data-decision="approved"] { background: #f0fff4; color: #1a7f37; }
  .pm-approval-signer[data-decision="rejected"] { background: #fff1f0; color: #ff4d4f; }
  .pm-approval-signer[data-decision="pending"] { background: #fff7e6; color: #d46b08; }
  .pm-stage-approval-composer {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 172px;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    background: #ffffff;
    padding: 7px;
    box-shadow: 0 8px 22px rgba(31, 35, 41, 0.1);
    display: grid;
    gap: 6px;
    z-index: 24;
  }
  .pm-stage-approval-composer label {
    display: grid;
    gap: 3px;
    color: #999999;
    font-size: 10px;
    line-height: 1.2;
  }
  .pm-stage-approval-composer select {
    width: 100%;
    height: 24px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    background: #f5f6f8;
    color: #333333;
    font-size: 11px;
    outline: none;
  }
  .pm-stage-approval-composer-actions {
    display: flex;
    gap: 5px;
    justify-content: flex-end;
  }
  .pm-stage-approval-composer-actions button,
  .pm-approval-center-actions button,
  .pm-approval-center-stats button {
    border: 1px solid #ebeef5;
    border-radius: 6px;
    background: #ffffff;
    color: #666666;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .pm-stage-approval-composer-actions button {
    height: 24px;
    padding: 0 7px;
    font-size: 11px;
  }
  .pm-stage-approval-composer-actions button[data-primary="true"],
  .pm-approval-center-actions button[data-primary="true"],
  .pm-approval-center-stats button[data-active="true"] {
    border-color: #1677ff;
    background: #1677ff;
    color: #ffffff;
  }
  .pm-approval-center {
    display: grid;
    gap: 14px;
  }
  .pm-approval-center-head {
    border: 1px solid #ebeef5;
    border-radius: 10px;
    background: #ffffff;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .pm-approval-center-head h2 {
    margin: 0;
    color: #333333;
    font-size: 18px;
    line-height: 1.35;
    font-weight: 600;
  }
  .pm-approval-center-head p {
    margin: 4px 0 0;
    color: #999999;
    font-size: 13px;
  }
  .pm-approval-center-stats {
    display: flex;
    gap: 8px;
  }
  .pm-approval-center-stats button {
    min-width: 92px;
    height: 40px;
    padding: 0 12px;
    display: grid;
    place-items: center;
    font-size: 12px;
  }
  .pm-approval-center-stats b {
    font-size: 16px;
    line-height: 1;
  }
  .pm-approval-center-list {
    display: grid;
    gap: 10px;
  }
  .pm-approval-center-card {
    border: 1px solid #ebeef5;
    border-radius: 10px;
    background: #ffffff;
    padding: 14px 16px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }
  .pm-approval-center-kicker {
    color: #1677ff;
    font-size: 12px;
    font-weight: 600;
  }
  .pm-approval-center-main h3 {
    margin: 4px 0 3px;
    color: #333333;
    font-size: 16px;
    line-height: 1.35;
    font-weight: 600;
  }
  .pm-approval-center-main p {
    margin: 0;
    color: #666666;
    font-size: 13px;
  }
  .pm-approval-center-meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    color: #999999;
    font-size: 12px;
  }
  .pm-approval-center-actions {
    display: flex;
    gap: 8px;
  }
  .pm-approval-center-actions button {
    height: 32px;
    padding: 0 12px;
    font-size: 12px;
  }
  .pm-approval-center-actions button:disabled,
  .pm-approval-center-stats button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
  .pm-approval-center-empty {
    border: 1px dashed #d9d9d9;
    border-radius: 10px;
    background: #ffffff;
    color: #999999;
    padding: 26px;
    text-align: center;
    font-size: 14px;
  }
  .pm-approval-material-table {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .pm-approval-material-row {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 8px;
    border-color: #ebeef5;
    border-radius: 10px;
    background: #ffffff;
    padding: 10px;
  }
  .pm-approval-material-name b {
    white-space: normal;
    line-height: 1.35;
    font-size: 13px;
  }
  .pm-stage-check-control,
  .pm-stage-check-readonly {
    display: grid;
    gap: 8px;
  }
  .pm-stage-check-control[data-control="registration"],
  .pm-stage-check-control[data-control="person"],
  .pm-stage-check-control[data-control="evidence"] {
    grid-template-columns: minmax(104px, 0.8fr) minmax(0, 1fr);
    align-items: center;
  }
  .pm-stage-check-control input,
  .pm-stage-check-control select,
  .pm-stage-check-control textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: #f5f6f8;
    color: #333333;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }
  .pm-stage-check-control input,
  .pm-stage-check-control select {
    height: 32px;
    padding: 0 9px;
  }
  .pm-stage-check-control textarea {
    min-height: 64px;
    padding: 8px 9px;
    resize: vertical;
  }
  .pm-stage-check-control input:focus,
  .pm-stage-check-control select:focus,
  .pm-stage-check-control textarea:focus {
    border-color: #1677ff;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.08);
  }
  .pm-stage-check-toggle {
    height: 32px;
    border-radius: 999px;
    background: #edf4ff;
    color: #1677ff;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 600;
  }
  .pm-stage-check-toggle input {
    width: 14px;
    height: 14px;
    padding: 0;
    accent-color: #1677ff;
  }
  .pm-stage-check-control[data-control="link"] input {
    font-family: inherit;
  }
  .pm-stage-check-readonly {
    min-height: 34px;
    border-radius: 8px;
    background: #f5f6f8;
    padding: 8px 10px;
  }
  .pm-stage-check-readonly span {
    color: #666666;
    font-size: 12px;
    font-weight: 600;
  }
  .pm-stage-check-readonly b {
    color: #999999;
    font-size: 12px;
    font-weight: 400;
  }
  .pm-approval-node-panel {
    margin-top: 10px;
    padding: 10px;
  }
  .pm-approval-panel-grid {
    gap: 6px;
    margin-bottom: 6px;
  }
  .pm-approval-panel-grid div,
  .pm-approval-panel-box,
  .pm-approval-material-row,
  .pm-guidance-box {
    padding: 7px;
  }
  @media (max-width: 900px) {
    .pm-workbench {
      min-height: 100vh;
    }
    .pm-layout {
      grid-template-columns: 1fr;
    }
    .pm-sidebar {
      position: static;
      height: auto;
      overflow: visible;
      border-right: 0;
      border-bottom: 1px solid #E5E6EB;
      display: block;
      padding: 12px;
    }
    .pm-primary-nav {
      padding: 10px 6px;
    }
    .pm-primary-nav-item {
      width: 40px;
      height: 40px;
    }
    .pm-secondary-nav {
      padding: 12px;
    }
    .pm-sidebar-profile { padding: 0 0 10px; }
    .pm-sidebar-nav { display: flex; gap: 6px; padding-top: 10px; }
    .pm-sidebar-label,
    .pm-sidebar-footer { display: none; }
    .pm-sidebar-nav-item { flex: 1; justify-content: center; min-height: 38px; }
    .pm-sidebar-nav-item em { display: none; }
    .pm-topbar {
      position: static;
      height: auto;
      min-height: 48px;
      flex-wrap: wrap;
      padding: 8px 12px;
      gap: 8px;
    }
    .pm-brand {
      width: 100%;
    }
    .pm-module-tabs {
      flex: 1 1 auto;
    }
    .pm-toolbar-right {
      width: 100%;
    }
    .pm-primary-btn,
    .pm-tool-btn {
      flex: 1 1 120px;
    }
    .pm-unified-search,
    .pm-search {
      width: 100%;
    }
    .pm-people-popover {
      width: min(340px, calc(100vw - 24px));
    }
    .pm-select {
      width: 100%;
    }
    .pm-main {
      padding: 10px;
    }
    .pm-summary-grid {
      grid-template-columns: 1fr;
    }
    .pm-status-overview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pm-detail-head {
      grid-template-columns: 1fr;
      align-items: start;
    }
    .pm-detail-badges {
      justify-content: flex-start;
    }
    .pm-detail-grid {
      grid-template-columns: 1fr;
    }
    .pm-approval-hero,
    .pm-approval-status-strip,
    .pm-approval-grid {
      grid-template-columns: 1fr;
    }
    .pm-approval-stepper {
      grid-template-columns: repeat(6, 180px);
    }
    .pm-approval-panel-grid,
    .pm-approval-panel-split {
      grid-template-columns: 1fr;
    }
    .pm-approval-material-row,
    .pm-guidance-evidence-grid,
    .pm-guidance-form {
      grid-template-columns: 1fr;
    }
    .pm-guidance-textarea {
      grid-column: 1;
    }
    .pm-task-panel {
      overflow-x: auto;
    }
    .pm-task-table-head,
    .pm-task-table-row {
      min-width: 680px;
    }
    .pm-toolbar {
      align-items: stretch;
      flex-direction: column;
      border-radius: 6px;
    }
    .pm-toolbar-left,
    .pm-toolbar-right {
      width: 100%;
    }
    .pm-content {
      border-top: 1px solid #E5E6EB;
      border-radius: 6px;
      min-height: 420px;
      margin-top: 8px;
    }
    .pm-view-switch {
      width: 100%;
    }
    .pm-view-switch button {
      flex: 1 1 92px;
    }
    .pm-board-grid {
      grid-template-columns: repeat(4, 220px);
    }
    .pm-gantt-sheet {
      min-width: 960px;
    }
    .pm-approval-board {
      max-width: none;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .pm-approval-node-flow {
      min-width: 520px;
    }
    .pm-table {
      min-width: 820px;
    }
    .pm-inline-grid {
      grid-template-columns: 1fr;
    }
    .pm-table th,
    .pm-table td {
      height: 40px;
      padding: 6px 8px;
      font-size: 12px;
    }
    .pm-sidebar {
      padding: 0;
    }
    .pm-cockpit-grid {
      grid-template-columns: 1fr;
    }
    .pm-identity-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pm-cockpit-hero {
      border-radius: 10px;
      padding: 14px;
    }
    .pm-cockpit-title {
      font-size: 19px;
    }
    .pm-brief-item {
      grid-template-columns: 8px minmax(0, 1fr);
    }
    .pm-brief-item .pm-row-action {
      grid-column: 2;
      justify-self: start;
    }
    .pm-sidebar-section {
      margin-bottom: 16px;
    }
    .pm-sidebar-section:nth-of-type(n+3) {
      display: none;
    }
  }
  @media (max-width: 560px) {
    .pm-breadcrumb {
      display: none;
    }
    .pm-module-tabs {
      width: 100%;
    }
    .pm-tab-btn {
      flex: 1 1 0;
    }
    .pm-metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pm-inline-fields {
      grid-template-columns: 1fr;
    }
    .pm-approval-fields {
      grid-template-columns: 1fr;
    }
  }

  /* Pipefy-inspired enterprise process workspace: stages first, cards second. */
  @media (min-width: 901px) {
    .pm-workbench {
      background: #f6f7fb;
      color: #172033;
    }

    .pm-topbar {
      height: 56px;
      padding: 0 24px;
      background: #ffffff;
      border-bottom-color: #e6e9f0;
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
    }

    .pm-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
      font-size: 13px;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
    }

    .pm-title {
      color: #172033;
      font-size: 16px;
      letter-spacing: -0.01em;
    }

    .pm-layout {
      grid-template-columns: 248px minmax(0, 1fr);
      background: #f6f7fb;
    }

    .pm-sidebar {
      background: #ffffff;
      border-right-color: #e6e9f0;
      box-shadow: 2px 0 12px rgba(15, 23, 42, 0.025);
    }

    .pm-sidebar-profile {
      padding: 18px 16px;
      border-bottom: 1px solid #eef1f5;
    }

    .pm-sidebar-nav {
      padding: 16px 12px;
    }

    .pm-sidebar-label {
      margin: 0 8px 8px;
      color: #98a2b3;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .pm-sidebar-nav-item {
      min-height: 42px;
      margin: 3px 0;
      border-radius: 8px;
      color: #667085;
      font-size: 13px;
    }

    .pm-sidebar-nav-item:hover {
      background: #f4f7fc;
      color: #2563eb;
    }

    .pm-sidebar-nav-item[data-active="true"] {
      background: #edf4ff;
      color: #1d4ed8;
      box-shadow: inset 3px 0 0 #2563eb;
    }

    .pm-main {
      min-width: 0;
      padding: 22px 28px 32px;
      background: #f6f7fb;
    }

    .pm-toolbar {
      min-height: 56px;
      margin-bottom: 14px;
      padding: 10px 16px;
      border: 1px solid #e4e8f0;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.045);
    }

    .pm-view-title {
      color: #172033;
      font-size: 18px;
      font-weight: 750;
      letter-spacing: -0.015em;
    }

    .pm-muted {
      color: #8a94a6;
    }

    .pm-content {
      overflow: hidden;
      border: 1px solid #e4e8f0;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
    }

    .pm-view-panel {
      background: #f7f8fb;
    }

    .pm-board-grid {
      gap: 14px;
      padding: 16px;
      background: #f7f8fb;
    }

    .pm-board-column {
      min-width: 228px;
      padding: 10px;
      border: 1px solid #e2e7ef;
      border-radius: 12px;
      background: #eef1f6;
    }

    .pm-board-head {
      min-height: 38px;
      margin-bottom: 10px;
      padding: 0 10px;
      border: 1px solid #e5e9f0;
      border-radius: 8px;
      background: #ffffff;
      color: #344054;
      font-size: 12px;
      font-weight: 750;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    }

    .pm-board-card {
      margin-bottom: 8px;
      padding: 12px;
      border: 1px solid #e2e7ef;
      border-radius: 9px;
      background: #ffffff;
      color: #172033;
      box-shadow: 0 2px 5px rgba(15, 23, 42, 0.045);
      text-align: left;
    }

    .pm-board-card:hover {
      border-color: #a9c7ff;
      box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
      transform: translateY(-1px);
    }

    .pm-board-card b {
      color: #172033;
      font-size: 13px;
      line-height: 1.45;
    }

    .pm-board-card small {
      color: #8a94a6;
      line-height: 1.45;
    }

    .pm-progress {
      height: 5px;
      border-radius: 999px;
      background: #e9edf3;
    }

    .pm-progress > span {
      border-radius: inherit;
      background: linear-gradient(90deg, #2563eb, #6366f1);
    }

    .pm-project-list {
      gap: 14px;
      padding: 18px;
      background: #f7f8fb;
    }

    .pm-project-card {
      border-color: #e2e7ef;
      border-radius: 12px;
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.045);
    }

    .pm-project-card-head {
      padding: 16px 20px 13px;
      border-bottom: 1px solid #eef1f5;
    }

    .pm-name-main {
      color: #172033;
      font-size: 16px;
      font-weight: 700;
    }

    .pm-project-workspace {
      padding: 14px 20px 16px;
      background: #ffffff;
    }

    .pm-project-activity-panel,
    .pm-project-people-panel {
      border-color: #e7ebf2;
      background: #f8faff;
    }

    .pm-summary-grid,
    .pm-cockpit {
      margin-bottom: 14px;
    }

    .pm-cockpit-hero {
      border: 1px solid #dce7fb;
      border-radius: 12px;
      background: linear-gradient(135deg, #eef5ff 0%, #f7faff 58%, #ffffff 100%);
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.06);
    }

    .pm-cockpit-panel,
    .pm-metric-card,
    .pm-status-card {
      border-color: #e2e7ef;
      border-radius: 10px;
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.035);
    }

    .pm-process-hero {
      display: grid;
      grid-template-columns: minmax(290px, 0.82fr) minmax(520px, 1.18fr);
      gap: 28px;
      align-items: center;
      margin-bottom: 14px;
      padding: 24px 28px;
      border: 1px solid #dfe7f2;
      border-radius: 14px;
      background: linear-gradient(112deg, #ffffff 0%, #f8fbff 64%, #eef5fb 100%);
      box-shadow: 0 6px 20px rgba(35, 75, 125, 0.06);
    }

    .pm-process-copy {
      min-width: 0;
    }

    .pm-process-kicker {
      display: block;
      margin-bottom: 8px;
      color: #2563eb;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.14em;
    }

    .pm-process-copy h2 {
      margin: 0;
      color: #24364b;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: -0.03em;
    }

    .pm-process-copy p {
      max-width: 410px;
      margin: 9px 0 16px;
      color: #6b7b8f;
      font-size: 13px;
      line-height: 1.65;
    }

    .pm-process-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      color: #8a99aa;
      font-size: 12px;
    }

    .pm-process-stats b {
      margin-right: 4px;
      color: #24364b;
      font-size: 16px;
    }

    .pm-process-cta {
      margin-top: 18px;
      height: 34px;
      padding: 0 16px;
      border: 0;
      border-radius: 7px;
      background: #2563eb;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 14px rgba(37, 99, 235, 0.22);
    }

    .pm-process-cta:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }

    .pm-process-map {
      display: grid;
      grid-template-columns: minmax(126px, 1fr) 34px minmax(150px, 1.12fr) 34px minmax(150px, 1.12fr);
      align-items: center;
      min-height: 164px;
      padding: 18px;
      border-radius: 12px;
      background: #f0f5fa;
    }

    .pm-process-node {
      position: relative;
      display: flex;
      min-height: 108px;
      padding: 16px 14px;
      flex-direction: column;
      justify-content: center;
      border: 1px solid #dbe6f1;
      border-radius: 9px;
      background: #ffffff;
      box-shadow: 0 5px 13px rgba(46, 73, 105, 0.08);
    }

    .pm-process-node::after {
      position: absolute;
      right: -7px;
      top: 50%;
      width: 12px;
      height: 12px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #2563eb;
      content: "";
      transform: translateY(-50%);
    }

    .pm-process-node-action::after {
      display: none;
    }

    .pm-process-node-stage {
      border: 2px solid #2563eb;
    }

    .pm-process-node-action {
      border-color: #12b8a6;
      background: #f8fffd;
    }

    .pm-process-node-action::before {
      position: absolute;
      left: -8px;
      top: 50%;
      width: 12px;
      height: 12px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #12b8a6;
      content: "";
      transform: translateY(-50%);
    }

    .pm-process-node-icon,
    .pm-process-node-index {
      display: inline-flex;
      width: 24px;
      height: 24px;
      align-items: center;
      justify-content: center;
      margin-bottom: 10px;
      border-radius: 7px;
      background: #eaf2ff;
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
    }

    .pm-process-node-action .pm-process-node-icon {
      background: #dcfaf4;
      color: #079b8e;
    }

    .pm-process-node b {
      color: #34495e;
      font-size: 13px;
    }

    .pm-process-node small {
      margin-top: 5px;
      color: #8a99aa;
      font-size: 10px;
      line-height: 1.4;
    }

    .pm-process-connector {
      color: #2563eb;
      font-size: 22px;
      font-weight: 700;
      text-align: center;
    }

    .pm-board-grid {
      gap: 12px;
      padding: 18px;
      background: #eef3f8;
    }

    .pm-board-column {
      min-width: 218px;
      padding: 10px;
      border: 0;
      border-radius: 10px;
      background: #e6edf4;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
    }

    .pm-board-column:nth-child(1) { border-top: 3px solid #2563eb; }
    .pm-board-column:nth-child(2) { border-top: 3px solid #5b8def; }
    .pm-board-column:nth-child(3) { border-top: 3px solid #12b8a6; }
    .pm-board-column:nth-child(4) { border-top: 3px solid #f2b94b; }
    .pm-board-column:nth-child(5) { border-top: 3px solid #8798ad; }

    .pm-board-head {
      min-height: 32px;
      margin-bottom: 9px;
      padding: 0 4px;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      color: #53677d;
      font-size: 12px;
    }

    .pm-board-card {
      min-height: 126px;
      margin-bottom: 9px;
      padding: 13px;
      border: 1px solid #dbe4ee;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 3px 8px rgba(37, 61, 88, 0.06);
    }

    .pm-board-card:hover {
      border-color: #8eb6ff;
      box-shadow: 0 9px 18px rgba(37, 99, 235, 0.14);
    }

    .pm-board-card b {
      display: block;
      margin-bottom: 8px;
      color: #34495e;
      font-size: 13px;
      line-height: 1.45;
    }

    .pm-board-card small {
      display: block;
      color: #8798aa;
      font-size: 10px;
      line-height: 1.55;
    }

    .pm-board-node-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 8px 0 7px;
    }

    .pm-board-node-chips span {
      padding: 3px 6px;
      border-radius: 4px;
      background: #edf4ff;
      color: #4573c5;
      font-size: 9px;
    }

    .pm-progress {
      height: 4px;
      background: #e8edf3;
    }

    .pm-progress > span {
      background: linear-gradient(90deg, #2563eb, #12b8a6);
    }

  }

  @media (max-width: 900px) {
    .pm-process-hero {
      grid-template-columns: 1fr;
      gap: 18px;
      padding: 18px;
    }

    .pm-process-map {
      grid-template-columns: repeat(5, minmax(120px, 1fr));
      min-width: 680px;
    }

    .pm-process-hero {
      overflow: hidden;
    }

  }

  .pm-approval-flow-view {
    position: relative;
    padding: 18px;
    background: #eef3f8;
  }

  .pm-approval-flow-intro {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 14px;
    padding: 22px 24px;
    border: 1px solid #dce6f0;
    border-radius: 12px;
    background: linear-gradient(110deg, #ffffff 0%, #f8fbff 70%, #edf8f8 100%);
  }

  .pm-approval-flow-intro h2 {
    margin: 0;
    color: #34495e;
    font-size: 22px;
    letter-spacing: -0.03em;
  }

  .pm-approval-flow-intro p {
    margin: 8px 0 0;
    color: #8291a2;
    font-size: 12px;
  }

  .pm-approval-flow-project-picker {
    min-width: 260px;
  }

  .pm-approval-flow-project-picker label {
    display: block;
    margin-bottom: 6px;
    color: #718399;
    font-size: 11px;
    font-weight: 700;
  }

  .pm-approval-flow-project-picker select {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid #cbd9e8;
    border-radius: 7px;
    background: #ffffff;
    color: #34495e;
    font-size: 12px;
    outline: none;
  }

  .pm-approval-flow-shell {
    padding: 26px 34px 34px 74px;
    border: 1px solid #dce6f0;
    border-radius: 12px;
    background: #f1f5f9;
  }

  .pm-approval-flow-track {
    position: relative;
    max-width: 820px;
  }

  .pm-approval-flow-step {
    position: relative;
  }

  .pm-approval-flow-step:not(:last-child) {
    padding-bottom: 14px;
  }

  .pm-approval-flow-line {
    position: absolute;
    left: 21px;
    top: 50px;
    bottom: -1px;
    width: 2px;
    background: #bfd2e7;
  }

  .pm-approval-flow-step-button {
    position: relative;
    z-index: 1;
    display: grid;
    width: 100%;
    grid-template-columns: 44px minmax(0, 1fr) auto 30px;
    align-items: center;
    gap: 14px;
    min-height: 84px;
    padding: 14px 16px 14px 8px;
    border: 1px solid #d8e4ef;
    border-radius: 10px;
    background: #ffffff;
    color: #34495e;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(43, 69, 99, 0.05);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }

  .pm-approval-flow-step-button:hover,
  .pm-approval-flow-step[data-selected="true"] .pm-approval-flow-step-button {
    border-color: #12b8a6;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
    transform: translateX(2px);
  }

  .pm-approval-flow-dot {
    display: inline-flex;
    width: 36px;
    height: 36px;
    align-items: center;
    justify-content: center;
    margin-left: 4px;
    border: 3px solid #ffffff;
    border-radius: 50%;
    background: #2563eb;
    color: #ffffff;
    font-size: 12px;
    font-weight: 800;
    box-shadow: 0 0 0 2px #9fc0ed;
  }

  .pm-approval-flow-step[data-status="approved"] .pm-approval-flow-dot,
  .pm-approval-flow-step[data-status="done"] .pm-approval-flow-dot {
    background: #12b8a6;
    box-shadow: 0 0 0 2px #82ded4;
  }

  .pm-approval-flow-step[data-status="waiting"] .pm-approval-flow-dot {
    background: #9cabbc;
    box-shadow: 0 0 0 2px #d3dde7;
  }

  .pm-approval-flow-step-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .pm-approval-flow-step-main small {
    color: #9aa8b7;
    font-size: 10px;
  }

  .pm-approval-flow-step-main b {
    color: #34495e;
    font-size: 14px;
  }

  .pm-approval-flow-step-main em {
    overflow: hidden;
    color: #8999aa;
    font-size: 11px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-approval-flow-step-status {
    padding: 5px 8px;
    border-radius: 5px;
    background: #edf4ff;
    color: #2563eb;
    font-size: 10px;
    white-space: nowrap;
  }

  .pm-approval-flow-step[data-status="approved"] .pm-approval-flow-step-status,
  .pm-approval-flow-step[data-status="done"] .pm-approval-flow-step-status {
    background: #dcfaf4;
    color: #079b8e;
  }

  .pm-approval-flow-step[data-status="waiting"] .pm-approval-flow-step-status {
    background: #edf1f5;
    color: #8492a2;
  }

  .pm-approval-flow-step-arrow {
    display: inline-flex;
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;
    border: 1px solid #d8e4ef;
    border-radius: 50%;
    color: #2563eb;
    font-size: 15px;
  }

  .pm-approval-flow-empty {
    padding: 60px 20px;
    border: 1px dashed #cbd9e8;
    border-radius: 10px;
    background: #f8fbff;
    color: #8291a2;
    text-align: center;
  }

  .pm-material-modal-layer {
    position: fixed;
    z-index: 80;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(27, 46, 68, 0.28);
    backdrop-filter: blur(3px);
  }

  .pm-material-modal {
    width: min(560px, 100%);
    max-height: min(760px, calc(100vh - 48px));
    overflow: auto;
    border: 1px solid #d5e1ed;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 24px 70px rgba(27, 46, 68, 0.24);
  }

  .pm-material-modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid #edf1f5;
  }

  .pm-material-modal-head span {
    color: #2563eb;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .pm-material-modal-head h3 {
    margin: 8px 0 4px;
    color: #34495e;
    font-size: 20px;
  }

  .pm-material-modal-head p {
    margin: 0;
    color: #8b9aaa;
    font-size: 12px;
  }

  .pm-material-modal-head > button {
    width: 30px;
    height: 30px;
    border: 1px solid #d8e4ef;
    border-radius: 50%;
    background: #ffffff;
    color: #718399;
    font-size: 20px;
    cursor: pointer;
  }

  .pm-material-modal-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 16px 24px;
    background: #f7fafc;
  }

  .pm-material-modal-meta div {
    min-width: 0;
  }

  .pm-material-modal-meta small,
  .pm-material-modal-meta b {
    display: block;
  }

  .pm-material-modal-meta small {
    margin-bottom: 5px;
    color: #9aa8b7;
    font-size: 10px;
  }

  .pm-material-modal-meta b {
    overflow: hidden;
    color: #34495e;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-material-modal-section-title {
    padding: 20px 24px 10px;
    color: #34495e;
    font-size: 13px;
    font-weight: 800;
  }

  .pm-material-list {
    padding: 0 24px;
  }

  .pm-material-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 0;
    border-bottom: 1px solid #edf1f5;
  }

  .pm-material-item > span {
    display: inline-flex;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: #edf4ff;
    color: #2563eb;
    font-size: 11px;
    font-weight: 800;
  }

  .pm-material-item b,
  .pm-material-item small {
    display: block;
  }

  .pm-material-item b {
    color: #475b70;
    font-size: 12px;
  }

  .pm-material-item small {
    margin-top: 4px;
    color: #9aa8b7;
    font-size: 10px;
  }

  .pm-material-modal-note {
    margin: 18px 24px 0;
    padding: 12px;
    border-radius: 7px;
    background: #f5f9fd;
    color: #718399;
    font-size: 11px;
    line-height: 1.6;
  }

  .pm-material-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 18px 24px 22px;
  }

  .pm-material-modal-actions button {
    height: 34px;
    padding: 0 14px;
    border: 1px solid #d8e4ef;
    border-radius: 6px;
    background: #ffffff;
    color: #718399;
    font-size: 12px;
    cursor: pointer;
  }

  .pm-material-modal-actions button[data-primary="true"] {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
  }

  @media (max-width: 640px) {
    .pm-approval-flow-view {
      padding: 10px;
    }

    .pm-approval-flow-intro {
      align-items: stretch;
      flex-direction: column;
      padding: 18px;
    }

    .pm-approval-flow-project-picker {
      min-width: 0;
    }

    .pm-approval-flow-shell {
      padding: 18px 14px 22px 48px;
    }

    .pm-approval-flow-step-button {
      grid-template-columns: 36px minmax(0, 1fr) 26px;
      gap: 8px;
      padding-right: 10px;
    }

    .pm-approval-flow-step-status {
      display: none;
    }

    .pm-approval-flow-line {
      left: 17px;
    }

    .pm-approval-flow-dot {
      width: 30px;
      height: 30px;
      font-size: 10px;
    }

    .pm-material-modal-layer {
      align-items: flex-end;
      padding: 10px;
    }

    .pm-material-modal-meta {
      grid-template-columns: 1fr 1fr;
    }
  }

  .pm-trello-workbench {
    min-height: 100vh;
    background: #17212b;
  }

  .pm-trello-workbench .pm-topbar {
    position: relative;
    height: 56px;
    background: rgba(36, 46, 56, 0.96);
    border-bottom-color: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }

  .pm-trello-workbench .pm-title,
  .pm-trello-workbench .pm-breadcrumb {
    color: #ffffff;
  }

  .pm-trello-workbench .pm-mark {
    background: #ffffff;
    color: #34495e;
  }

  .pm-trello-workbench .pm-layout {
    grid-template-columns: 1fr;
    background: transparent;
  }

  .pm-trello-workbench .pm-sidebar {
    display: none;
  }

  .pm-trello-workbench .pm-main {
    min-width: 0;
    padding: 0;
    background: transparent;
  }

  .pm-trello-workbench .pm-toolbar-right .pm-tool-btn,
  .pm-trello-workbench .pm-toolbar-right .pm-primary-btn {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .pm-trello-workbench .pm-toolbar-right .pm-tool-btn {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .pm-trello-workbench .pm-toolbar-right .pm-primary-btn {
    background: #526dff;
    color: #ffffff;
  }

  .pm-trello-board-page {
    position: relative;
    min-height: calc(100vh - 56px);
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(24, 38, 50, 0.18) 0%, rgba(7, 16, 24, 0.78) 100%),
      radial-gradient(ellipse at 20% 74%, rgba(187, 147, 92, 0.78) 0%, rgba(83, 78, 67, 0.36) 22%, transparent 48%),
      radial-gradient(ellipse at 75% 68%, rgba(116, 77, 45, 0.85) 0%, transparent 32%),
      linear-gradient(135deg, #77818b 0%, #3c4a52 34%, #202a31 64%, #0a1016 100%);
  }

  .pm-trello-board-page::before,
  .pm-trello-board-page::after {
    position: absolute;
    z-index: 0;
    content: "";
    pointer-events: none;
  }

  .pm-trello-board-page::before {
    left: -8%;
    right: 42%;
    bottom: -6%;
    height: 48%;
    background: linear-gradient(160deg, rgba(41, 50, 55, 0.22), rgba(13, 20, 25, 0.92));
    clip-path: polygon(0 100%, 12% 47%, 27% 68%, 43% 16%, 54% 53%, 72% 27%, 100% 71%, 100% 100%);
  }

  .pm-trello-board-page::after {
    left: 35%;
    right: -8%;
    bottom: -8%;
    height: 54%;
    background: linear-gradient(148deg, rgba(155, 111, 63, 0.38), rgba(10, 16, 21, 0.96));
    clip-path: polygon(0 100%, 17% 42%, 31% 63%, 49% 8%, 64% 57%, 82% 24%, 100% 61%, 100% 100%);
  }

  .pm-trello-board-toolbar,
  .pm-trello-board-scroll {
    position: relative;
    z-index: 1;
  }

  .pm-trello-board-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    min-height: 58px;
    padding: 10px 24px;
    background: rgba(34, 44, 53, 0.64);
    color: #ffffff;
  }

  .pm-trello-board-title-group,
  .pm-trello-board-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pm-trello-board-mark {
    display: inline-flex;
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: #ffffff;
    color: #34495e;
    font-size: 16px;
    font-weight: 800;
  }

  .pm-trello-board-title-group b {
    font-size: 15px;
  }

  .pm-trello-board-divider {
    width: 1px;
    height: 22px;
    background: rgba(255, 255, 255, 0.28);
  }

  .pm-trello-board-context,
  .pm-trello-board-count,
  .pm-trello-board-hint {
    color: rgba(255, 255, 255, 0.75);
    font-size: 12px;
  }

  .pm-trello-board-actions button {
    height: 32px;
    padding: 0 13px;
    border: 0;
    border-radius: 5px;
    background: #526dff;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .pm-trello-board-scroll {
    overflow-x: auto;
    min-height: calc(100vh - 114px);
    padding: 18px 14px 28px;
  }

  .pm-trello-columns {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: max-content;
  }

  .pm-trello-list {
    width: 272px;
    flex: 0 0 272px;
    overflow: hidden;
    border-radius: 9px;
    background: rgba(239, 242, 245, 0.94);
    box-shadow: 0 8px 20px rgba(4, 12, 19, 0.18);
  }

  .pm-trello-list[data-highlight="true"] {
    outline: 3px solid rgba(37, 99, 235, 0.72);
    outline-offset: 3px;
    box-shadow: 0 12px 30px rgba(37, 99, 235, 0.3);
  }

  .pm-trello-list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px 14px;
    color: #34495e;
  }

  .pm-trello-list-head > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pm-trello-list-head b {
    font-size: 13px;
  }

  .pm-trello-list-head span {
    color: #7d8894;
    font-size: 11px;
  }

  .pm-trello-list-head button {
    border: 0;
    background: transparent;
    color: #71808d;
    font-size: 16px;
    letter-spacing: 2px;
    cursor: pointer;
  }

  .pm-trello-list-cards {
    display: flex;
    min-height: 100px;
    padding: 0 8px 9px;
    flex-direction: column;
    gap: 7px;
  }

  .pm-trello-card {
    width: 100%;
    padding: 10px 11px 9px;
    border: 1px solid #d7dde3;
    border-radius: 8px;
    background: #ffffff;
    color: #34495e;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(27, 46, 68, 0.07);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .pm-trello-card:hover {
    box-shadow: 0 8px 15px rgba(27, 46, 68, 0.15);
    transform: translateY(-1px);
  }

  .pm-trello-card-labels {
    display: flex;
    gap: 5px;
    margin-bottom: 7px;
  }

  .pm-trello-card-label {
    padding: 3px 6px;
    border-radius: 4px;
    background: #e9eef5;
    color: #667789;
    font-size: 9px;
    font-weight: 800;
  }

  .pm-trello-card-label[data-tone="urgent"],
  .pm-trello-card-label[data-tone="high"] {
    background: #ffd7d4;
    color: #c83d38;
  }

  .pm-trello-card-label[data-tone="category"] {
    background: #dceaff;
    color: #356bc7;
  }

  .pm-trello-card-title {
    display: block;
    color: #34495e;
    font-size: 13px;
    line-height: 1.45;
  }

  .pm-trello-card p {
    display: -webkit-box;
    overflow: hidden;
    margin: 6px 0 0;
    color: #7f8c98;
    font-size: 11px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .pm-trello-card-checks {
    overflow: hidden;
    margin-top: 7px;
    color: #6f7d89;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-trello-card-footer {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 10px;
    color: #86929d;
    font-size: 10px;
  }

  .pm-trello-avatar {
    display: inline-flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #f4a624;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
  }

  .pm-trello-card-progress {
    margin-left: auto;
    color: #5b78c9;
    font-weight: 800;
  }

  .pm-trello-progress {
    height: 4px;
    margin-top: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: #e7ebef;
  }

  .pm-trello-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #4e6dff, #2cb7a6);
  }

  .pm-trello-project-members {
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid #edf1f5;
  }

  .pm-trello-project-members-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #65788a;
    font-size: 10px;
    font-weight: 800;
  }

  .pm-trello-project-members-head span:last-child {
    color: #a0acb7;
    font-weight: 500;
  }

  .pm-trello-member-strip {
    display: flex;
    align-items: center;
    min-height: 28px;
    margin-top: 6px;
  }

  .pm-trello-member-avatar,
  .pm-trello-member-more {
    display: inline-flex;
    width: 23px;
    height: 23px;
    align-items: center;
    justify-content: center;
    margin-right: -3px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    background: #5b78c9;
    color: #ffffff;
    font-size: 9px;
    font-weight: 800;
  }

  .pm-trello-member-avatar:nth-child(2n) { background: #16a394; }
  .pm-trello-member-avatar:nth-child(3n) { background: #d48a3a; }

  .pm-trello-member-more {
    background: #e8edf3;
    color: #71808d;
  }

  .pm-trello-member-strip small {
    color: #9aa6b1;
    font-size: 10px;
  }

  .pm-trello-member-add-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 42px;
    gap: 5px;
    margin-top: 6px;
  }

  .pm-trello-member-add-row select,
  .pm-trello-member-add-row button {
    height: 28px;
    box-sizing: border-box;
    border: 1px solid #d8e4ef;
    border-radius: 5px;
    background: #ffffff;
    color: #718399;
    font-size: 9px;
  }

  .pm-trello-member-add-row select {
    min-width: 0;
    padding: 0 6px;
  }

  .pm-trello-member-add-row button {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
    cursor: pointer;
  }

  .pm-trello-member-add-row button:disabled {
    border-color: #d8e4ef;
    background: #eef1f4;
    color: #a0acb7;
    cursor: not-allowed;
  }

  .pm-trello-add-card,
  .pm-trello-add-list {
    border: 0;
    color: #667582;
    text-align: left;
    cursor: pointer;
  }

  .pm-trello-add-card {
    padding: 8px 7px 5px;
    background: transparent;
    font-size: 12px;
  }

  .pm-trello-add-card:hover {
    color: #2563eb;
  }

  .pm-trello-add-list {
    width: 272px;
    flex: 0 0 272px;
    padding: 14px;
    border-radius: 9px;
    background: rgba(239, 242, 245, 0.72);
    font-size: 13px;
  }

  .pm-trello-list {
    width: 360px;
    flex-basis: 360px;
    overflow: visible;
  }

  .pm-trello-add-list {
    width: 360px;
    flex-basis: 360px;
  }

  .pm-trello-project-card {
    position: relative;
    padding: 11px;
    border: 1px solid #d7dde3;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 2px 4px rgba(27, 46, 68, 0.07);
  }

  .pm-trello-project-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .pm-trello-edit-project {
    flex: 0 0 auto;
    padding: 3px 6px;
    border: 1px solid #d8e4ef;
    border-radius: 4px;
    background: #ffffff;
    color: #68809a;
    font-size: 9px;
    cursor: pointer;
  }

  .pm-trello-edit-project:hover {
    border-color: #8fb4f5;
    color: #2563eb;
  }

  .pm-trello-inline-editor {
    display: flex;
    margin-top: 7px;
    flex-direction: column;
    gap: 6px;
  }

  .pm-trello-inline-editor input,
  .pm-trello-inline-editor textarea,
  .pm-trello-inline-editor select {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 8px;
    border: 1px solid #cbd9e8;
    border-radius: 5px;
    background: #ffffff;
    color: #53687b;
    font-size: 10px;
    outline: none;
  }

  .pm-trello-inline-editor textarea {
    min-height: 54px;
    resize: vertical;
  }

  .pm-trello-inline-editor input:focus,
  .pm-trello-inline-editor textarea:focus,
  .pm-trello-inline-editor select:focus {
    border-color: #6d96ed;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08);
  }

  .pm-trello-inline-editor-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .pm-trello-inline-save {
    height: 30px;
    border: 0;
    border-radius: 5px;
    background: #2563eb;
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .pm-trello-inline-save:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .pm-trello-project-title-button {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: #34495e;
    text-align: left;
    cursor: pointer;
  }

  .pm-trello-project-title-button:hover .pm-trello-card-title {
    color: #2563eb;
  }

  .pm-trello-project-stages-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding-top: 9px;
    border-top: 1px solid #edf1f5;
    color: #65788a;
    font-size: 10px;
    font-weight: 800;
  }

  .pm-trello-project-stages-title span:last-child {
    color: #a0acb7;
    font-weight: 500;
  }

  .pm-trello-project-stages {
    display: flex;
    margin-top: 6px;
    flex-direction: column;
    gap: 4px;
  }

  .pm-trello-project-stage {
    display: grid;
    width: 100%;
    grid-template-columns: 22px minmax(0, 1fr) auto 18px;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 5px 6px;
    border: 1px solid #e6eaee;
    border-radius: 5px;
    background: #f8fafb;
    color: #52677b;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }

  .pm-trello-project-stage:hover,
  .pm-trello-project-stage[data-selected="true"] {
    border-color: #14b8a6;
    background: #f0fffc;
    transform: translateX(2px);
  }

  .pm-trello-stage-dot {
    display: inline-flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #e7efff;
    color: #4776d4;
    font-size: 9px;
    font-weight: 800;
  }

  .pm-trello-project-stage[data-status="approved"] .pm-trello-stage-dot,
  .pm-trello-project-stage[data-status="done"] .pm-trello-stage-dot {
    background: #d9f7ee;
    color: #089981;
  }

  .pm-trello-project-stage[data-status="waiting"] .pm-trello-stage-dot {
    background: #edf0f3;
    color: #96a2ad;
  }

  .pm-trello-project-stage > span:nth-child(2) {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .pm-trello-project-stage b {
    overflow: hidden;
    color: #53687b;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-trello-project-stage small {
    overflow: hidden;
    color: #9aa6b1;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-trello-project-stage em {
    padding: 3px 5px;
    border-radius: 4px;
    background: #edf4ff;
    color: #4c78d1;
    font-size: 8px;
    font-style: normal;
    white-space: nowrap;
  }

  .pm-trello-project-stage[data-status="approved"] em,
  .pm-trello-project-stage[data-status="done"] em {
    background: #d9f7ee;
    color: #089981;
  }

  .pm-trello-project-stage[data-status="waiting"] em {
    background: #eef1f4;
    color: #8e9ba7;
  }

  .pm-trello-project-stage i {
    color: #7d8d9b;
    font-size: 13px;
    font-style: normal;
    text-align: center;
  }

  .pm-trello-empty-card {
    padding: 22px 10px;
    color: #8997a3;
    font-size: 11px;
    text-align: center;
  }

  .pm-trello-material-popover {
    position: fixed;
    z-index: 70;
    top: 126px;
    right: 24px;
    width: min(360px, calc(100vw - 32px));
    max-height: calc(100vh - 150px);
    overflow: auto;
    border: 1px solid #d7e2eb;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 18px 50px rgba(8, 24, 38, 0.32);
  }

  .pm-trello-material-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 17px 13px;
    border-bottom: 1px solid #edf1f5;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .pm-trello-material-head:active {
    cursor: grabbing;
  }

  .pm-trello-material-head small {
    color: #2563eb;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  .pm-trello-material-head h3 {
    margin: 6px 0 3px;
    color: #34495e;
    font-size: 16px;
  }

  .pm-trello-material-head p {
    margin: 0;
    color: #91a0ad;
    font-size: 10px;
  }

  .pm-trello-material-head > button {
    width: 26px;
    height: 26px;
    border: 1px solid #d8e4ef;
    border-radius: 50%;
    background: #ffffff;
    color: #7a8996;
    font-size: 17px;
    cursor: pointer;
  }

  .pm-trello-material-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 12px 17px;
    background: #f7fafc;
  }

  .pm-trello-material-meta span {
    color: #9aa7b2;
    font-size: 9px;
  }

  .pm-trello-material-meta b {
    display: block;
    margin-top: 4px;
    overflow: hidden;
    color: #53687b;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-trello-material-title {
    padding: 15px 17px 8px;
    color: #53687b;
    font-size: 12px;
    font-weight: 800;
  }

  .pm-trello-material-items {
    padding: 0 17px;
  }

  .pm-trello-material-item {
    display: flex;
    gap: 7px;
    padding: 8px 0;
    border-bottom: 1px solid #edf1f5;
  }

  .pm-trello-material-item > span {
    display: inline-flex;
    width: 19px;
    height: 19px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: #eaf2ff;
    color: #4776d4;
    font-size: 9px;
    font-weight: 800;
  }

  .pm-trello-material-item > div {
    min-width: 0;
    flex: 1;
  }

  .pm-trello-material-item > div > b {
    display: block;
    margin-bottom: 5px;
    color: #53687b;
    font-size: 10px;
  }

  .pm-trello-material-item .pm-stage-check-control {
    width: 100%;
  }

  .pm-trello-material-item .pm-stage-check-control input,
  .pm-trello-material-item .pm-stage-check-control select,
  .pm-trello-material-item .pm-stage-check-control textarea {
    width: 100%;
    min-height: 28px;
    box-sizing: border-box;
    border: 1px solid #d9e4ef;
    border-radius: 5px;
    background: #ffffff;
    color: #53687b;
    padding: 5px 7px;
    font-size: 10px;
  }

  .pm-trello-material-item .pm-stage-check-control textarea {
    min-height: 42px;
    resize: vertical;
  }

  .pm-trello-material-note {
    margin: 12px 17px 0;
    padding: 9px;
    border-radius: 6px;
    background: #f4f8fc;
    color: #8493a1;
    font-size: 10px;
    line-height: 1.55;
  }

  .pm-trello-material-actions {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    padding: 13px 17px 16px;
  }

  .pm-trello-material-actions button {
    height: 30px;
    padding: 0 11px;
    border: 1px solid #d8e4ef;
    border-radius: 5px;
    background: #ffffff;
    color: #748493;
    font-size: 10px;
    cursor: pointer;
  }

  .pm-trello-material-actions button[data-primary="true"] {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
  }

  @media (max-width: 720px) {
    .pm-trello-workbench .pm-topbar {
      height: auto;
      min-height: 48px;
      padding: 8px 10px;
    }

    .pm-trello-workbench .pm-topbar .pm-toolbar-right {
      display: none;
    }

    .pm-trello-workbench .pm-title {
      font-size: 14px;
    }

    .pm-trello-board-page {
      min-height: calc(100vh - 48px);
    }

    .pm-trello-board-toolbar {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
    }

    .pm-trello-board-hint {
      display: none;
    }

    .pm-trello-board-title-group {
      width: 100%;
      flex-wrap: wrap;
      gap: 7px;
    }

    .pm-trello-board-divider {
      display: none;
    }

    .pm-trello-board-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .pm-trello-board-scroll {
      overflow-x: hidden;
      min-height: calc(100vh - 128px);
      padding: 10px;
    }

    .pm-trello-columns {
      width: 100%;
      min-width: 0;
      flex-direction: column;
      gap: 10px;
    }

    .pm-trello-list,
    .pm-trello-add-list {
      width: 100%;
      flex-basis: auto;
    }

    .pm-trello-list-head {
      padding: 11px 12px 8px;
    }

    .pm-trello-list-cards {
      padding: 0 7px 8px;
    }

    .pm-trello-project-card {
      padding: 10px;
    }

    .pm-trello-project-stage {
      grid-template-columns: 22px minmax(0, 1fr) auto 18px;
      min-height: 38px;
    }

    .pm-trello-project-stage em {
      max-width: 54px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pm-trello-material-popover {
      top: 92px;
      right: 10px;
      left: 10px;
      width: auto;
      max-height: calc(100vh - 108px);
    }
  }

  /* 统一工作区：所有模块沿用项目卡片看板的顶部与卡片语言 */
  .pm-workbench:not(.pm-trello-workbench) {
    min-height: 100vh;
    background: #17212b;
  }

  .pm-dashboard-main {
    min-height: calc(100vh - 56px);
    padding: 14px 16px 24px;
    background: #eef2f7;
    box-sizing: border-box;
  }

  .pm-dashboard-main .app-page-shell {
    max-width: 1440px;
    margin: 0 auto;
    padding: 0;
  }

  .pm-workbench:not(.pm-trello-workbench) .pm-topbar {
    height: 56px;
    background: rgba(36, 46, 56, 0.96);
    border-bottom-color: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }

  .pm-workbench:not(.pm-trello-workbench) .pm-title,
  .pm-workbench:not(.pm-trello-workbench) .pm-breadcrumb {
    color: #ffffff;
  }

  .pm-workbench:not(.pm-trello-workbench) .pm-mark {
    background: #ffffff;
    color: #34495e;
  }

  .pm-layout {
    grid-template-columns: minmax(0, 1fr) !important;
    min-height: calc(100vh - 56px);
  }

  .pm-sidebar {
    display: none !important;
  }

  .pm-main {
    min-width: 0;
    padding: 12px 16px 24px;
    background: #eef2f7;
  }

  .pm-workspace-tabs {
    flex: 0 0 auto;
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
  }

  .pm-workspace-tabs .pm-tab-btn {
    height: 30px;
    color: rgba(255, 255, 255, 0.74);
    border-color: transparent;
  }

  .pm-workspace-tabs .pm-tab-btn[data-active="true"] {
    background: #ffffff;
    border-color: #ffffff;
    color: #34495e;
  }

  .pm-workbench:not(.pm-trello-workbench) .pm-toolbar-right .pm-tool-btn {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .pm-workbench:not(.pm-trello-workbench) .pm-toolbar-right .pm-primary-btn {
    background: #526dff;
    border-color: #526dff;
  }

  .pm-toolbar {
    border-radius: 10px 10px 0 0;
    box-shadow: 0 8px 20px rgba(31, 35, 41, 0.08);
  }

  .pm-content {
    border-radius: 0 0 12px 12px;
    box-shadow: 0 10px 24px rgba(31, 35, 41, 0.08);
  }

  .pm-approval-center-head,
  .pm-approval-center-card,
  .pm-approval-center-empty,
  .pm-metric-card {
    border-color: #d8e4ef;
    border-radius: 9px;
    box-shadow: 0 8px 18px rgba(31, 35, 41, 0.06);
  }

  .pm-approval-center-card:hover,
  .pm-status-card:hover,
  .pm-approval-center-head:hover {
    border-color: #9fbdf5;
    box-shadow: 0 12px 24px rgba(37, 99, 235, 0.1);
  }

  @media (max-width: 860px) {
    .pm-topbar {
      height: auto !important;
      min-height: 56px;
      flex-wrap: wrap;
      padding: 8px 12px;
    }

    .pm-brand {
      flex: 1 1 auto;
    }

    .pm-workspace-tabs {
      order: 3;
      width: 100%;
      justify-content: stretch;
    }

    .pm-workspace-tabs .pm-tab-btn {
      flex: 1;
    }

    .pm-topbar > .pm-toolbar-right {
      flex: 0 0 auto;
    }

    .pm-main {
      padding: 10px 10px 18px;
    }

    .pm-approval-center-card {
      grid-template-columns: 1fr;
    }

    .pm-approval-center-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }
`;
