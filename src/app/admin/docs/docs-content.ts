/**
 * docs-content.ts — All documentation content for the Admin Docs page.
 *
 * HOW TO ADD DOCUMENTATION FOR A NEW PAGE:
 * 1. Add a new DocSection entry to DOCS_SECTIONS below.
 * 2. Give it a unique `id`, a `title`, an `icon`, and a `color`.
 * 3. Add `articles` — each article has a `title`, `slug`, `tags`, and `content` (markdown-ish).
 * 4. That's it. The page auto-renders it. No other files need to change.
 *
 * CONTENT GUIDELINES:
 * - Keep language plain. Avoid jargon. Assume the reader knows the insurance business but not code.
 * - Use numbered steps for processes.
 * - Use "Note:" for important warnings.
 * - Keep articles short. If it's more than ~200 words, split it into two articles.
 * - Tag every article with relevant keywords so search works well.
 */

export interface DocArticle {
  slug: string
  title: string
  tags: string[]
  content: DocContent[]
}

export type DocContent =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "note"; text: string }
  | { type: "warning"; text: string }
  | { type: "kpi"; name: string; source: string; sourceDetail: string; column?: string }
  | { type: "kpis"; items: Array<{ name: string; source: string; sourceDetail: string; column?: string }> }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "faq"; q: string; a: string }

export interface DocSection {
  id: string
  title: string
  icon: string
  color: string
  description: string
  articles: DocArticle[]
}

// ─── DOCUMENTATION CONTENT ─────────────────────────────────────────────────

export const DOCS_SECTIONS: DocSection[] = [
  // ── DATA SYNC ────────────────────────────────────────────────────────────
  {
    id: "data-sync",
    title: "Data Sync",
    icon: "Database",
    color: "emerald",
    description: "How to upload daily reports and keep the dashboard current.",
    articles: [
      {
        slug: "data-sync-overview",
        title: "Overview",
        tags: ["sync", "upload", "overview", "data", "pipeline"],
        content: [
          { type: "p", text: "The Data Sync page is where you upload the daily source reports. Each source covers a different part of the data — calls, quotes, new business, texts, and premium. The dashboard combines all sources automatically." },
          { type: "p", text: "Navigate to Admin → Data Sync to get started." },
          { type: "kpis", items: [
            { name: "RC (RingCentral)", source: "RingCentral Export", sourceDetail: "Covers CSR agents' call counts and talk time.", column: "Office Performance / Users report" },
            { name: "Rico AP (Agent Performance)", source: "Ricochet Export", sourceDetail: "Covers Sales agent call counts (inbound, outbound).", column: "Agent Performance report" },
            { name: "Rico CH (Call History)", source: "Ricochet Export", sourceDetail: "Covers Sales agent talk time.", column: "Call History (ch- files)" },
            { name: "Hearsay (HS)", source: "Hearsay Export", sourceDetail: "Covers texts, opt-ins, opt-outs.", column: "Performance Breakdown Report" },
            { name: "Quotes", source: "DASH", sourceDetail: "Quote counts per agent.", column: "Quotes Detail" },
            { name: "NB (New Business)", source: "DASH", sourceDetail: "New policies, items written, premium.", column: "New Business Detail" },
            { name: "Premium (AgencyZoom)", source: "AgencyZoom", sourceDetail: "Premium, items, and points for Sales agents.", column: "sales-report file" },
          ]},
        ],
      },
      {
        slug: "data-sync-how-to-upload",
        title: "How to Upload a Report",
        tags: ["upload", "sync", "file", "how to", "step by step", "drag drop"],
        content: [
          { type: "steps", items: [
            "Go to Admin → Data Sync.",
            "Set the target date in the global date picker (top right). This is the default date for the upload.",
            "Drag your report file(s) into the upload zone, or click to browse.",
            "The system auto-detects the file type based on its filename. You'll see a colored badge confirming what was detected.",
            "IMPORTANT: Files like Premium (AgencyZoom) and Hearsay often do not map naturally to a single day. You MUST manually use the individual date picker next to those files in the upload list to enforce the correct target date.",
            "Click Upload & Process. The log will appear below showing the progress.",
            "Green = success. Red = there was an error — expand the log to see what went wrong.",
          ]},
          { type: "note", text: "You can upload multiple files at once. The system processes each source independently and combines them." },
          { type: "warning", text: "Agents on both RingCentral and Ricochet (e.g. Maila, Juanita, Denice) — their calls are ADDED together, not overwritten. You can upload RC and Rico AP together or separately, and the system will automatically handle summing their totals correctly." },
        ],
      },
      {
        slug: "data-sync-file-naming",
        title: "File Naming Rules",
        tags: ["file name", "filename", "detection", "rico", "rc", "hearsay", "premium", "quotes", "nb"],
        content: [
          { type: "p", text: "The system detects file types based on filename. Make sure files follow these naming patterns. (Note: The default export names provided by these systems are correct and supported as of 8/6/26.)" },
          { type: "table", headers: ["Source", "Filename Must Match", "Example"], rows: [
            ["RingCentral", "Starts with rc_ OR contains 'Office_Perf' and 'Users'", "rc_2026-08-05.csv"],
            ["Rico Call History", "Starts with ch-", "ch-july-calls.csv"],
            ["Rico Agent Performance", "Contains 'Agent Performance'", "Agent Performance July.xlsx"],
            ["Hearsay", "Contains 'Performance Breakdown Report'", "Performance Breakdown Report.xlsx"],
            ["Quotes", "Contains 'Quotes Detail'", "Quotes Detail Aug.xlsx"],
            ["New Business", "Contains 'New Business'", "New Business Aug.xlsx"],
            ["Premium (AgencyZoom)", "Contains 'sales-report'", "sales-report-2026-08.xlsx"],
          ]},
          { type: "note", text: "If a file shows 'Unknown' in the badge, rename it to match the pattern above and re-upload." },
        ],
      },
      {
        slug: "data-sync-upload-history",
        title: "Upload History",
        tags: ["history", "upload log", "past uploads", "audit"],
        content: [
          { type: "p", text: "Below the upload area, the Upload History table shows all past uploads — the date, which sources were included, and whether it succeeded or failed." },
          { type: "p", text: "You can expand any row to see the full processing log for that upload. This is useful when a number looks wrong — you can trace exactly what data was pushed on that day." },
          { type: "faq", q: "How do I fix a wrong number from a previous upload?", a: "Re-upload the correct file for the same date. The system will replace that source's data for that date without affecting other sources." },
        ],
      },
      {
        slug: "data-sync-faq",
        title: "FAQ & Troubleshooting",
        tags: ["error", "faq", "wrong number", "failed", "fix", "overwrite", "troubleshoot"],
        content: [
          { type: "faq", q: "The upload shows a processing error. What do I do?", a: "Expand the log section and read the error. Common causes: (1) wrong filename — rename the file to match the naming rules, (2) no agents matched — the agent names in the file don't match what's in the Agents table, (3) no data for the selected date." },
          { type: "faq", q: "A number on the report looks wrong after uploading. How do I fix it?", a: "Simply re-upload the corrected file for the same date and source. The system will replace only that source's data, leaving all other sources untouched." },
          { type: "faq", q: "Can I upload multiple files for the same date?", a: "Yes. Upload as many sources as you need. Each source is stored separately and combined when the report loads." },
          { type: "faq", q: "What happens if I upload RC and Rico AP for the same agent?", a: "Their calls are added together. For example, 40 RC calls + 23 Rico calls = 63 total on the report. This is correct behavior for dual-platform agents (Maila, Juanita, Denice)." },
          { type: "faq", q: "Why does the Source Checklist show some sources missing?", a: "The checklist shows which sources have been uploaded for the currently selected date. A missing source just means no file has been uploaded for that source on that date yet." },
        ],
      },
    ],
  },

  // ── REPORTS: DAILY ────────────────────────────────────────────────────────
  {
    id: "daily-report",
    title: "Daily Report",
    icon: "BarChart2",
    color: "blue",
    description: "Understanding the daily performance report and all its columns.",
    articles: [
      {
        slug: "daily-report-overview",
        title: "Overview",
        tags: ["daily", "report", "overview"],
        content: [
          { type: "p", text: "The Daily Report shows every agent's performance metrics for a selected day. Each row is one agent. Columns cover calls, texts, quotes, new business, and more." },
          { type: "p", text: "Navigate to Reports → Daily to access it. Use the date picker to switch between days." },
        ],
      },
      {
        slug: "daily-report-kpis",
        title: "Column Definitions (KPIs)",
        tags: ["kpi", "definition", "column", "calls", "talk time", "texts", "quotes", "nb", "items", "premium", "points", "daily"],
        content: [
          { type: "kpis", items: [
            { name: "Calls", source: "RingCentral + Ricochet AP", sourceDetail: "Total calls made/received. For CSR agents, this is from RingCentral. For Sales agents, from Ricochet Agent Performance. Dual-platform agents (Maila, Juanita, Denice) have calls from both sources added together.", column: "RC: calls column; Rico AP: calls column" },
            { name: "Inbound", source: "RingCentral + Ricochet AP", sourceDetail: "Subset of Calls — calls received from a customer.", column: "RC: inbound; Rico AP: inbound" },
            { name: "Outbound", source: "RingCentral + Ricochet AP", sourceDetail: "Subset of Calls — calls dialed out to a customer.", column: "RC: outbound; Rico AP: outbound" },
            { name: "Talk Time", source: "RingCentral + Ricochet CH", sourceDetail: "Total connected call duration in hours:minutes. CSR agents get this from RingCentral. Sales agents get this from the Ricochet Call History file (ch- files).", column: "RC: talk_time_seconds; Rico CH: Call Duration In Seconds" },
            { name: "Texts", source: "Hearsay", sourceDetail: "Total text messages sent and received through Hearsay.", column: "Performance Breakdown Report — Texts column" },
            { name: "Opt-Ins", source: "Hearsay", sourceDetail: "Customers who opted in to receive texts.", column: "Performance Breakdown Report — Opt-Ins column" },
            { name: "Opt-Outs", source: "Hearsay", sourceDetail: "Customers who opted out of texts.", column: "Performance Breakdown Report — Opt-Outs column" },
            { name: "Quotes", source: "Quotes Detail Export", sourceDetail: "Number of quotes submitted by the agent on that day.", column: "Quotes Detail — QuoteCount" },
            { name: "NB (New Business)", source: "New Business Export", sourceDetail: "Number of new policies written.", column: "New Business — NBCount" },
            { name: "Items", source: "New Business Export", sourceDetail: "Number of individual coverage items on new policies.", column: "New Business — Items" },
            { name: "Premium", source: "New Business Export", sourceDetail: "Written premium dollar amount from new policies. Note: NB Written Premium is NOT currently displayed on the dashboard. The 'Premium' column on reports uses AgencyZoom Premium.", column: "New Business — WrittenPremium" },
            { name: "Prem Premium", source: "AgencyZoom (Premium report)", sourceDetail: "Dollar premium from the AgencyZoom sales report. Note: This is the value actually displayed in the 'Premium' column on the daily, weekly, and MTD reports.", column: "sales-report — PremPremium" },
            { name: "Prem Items", source: "AgencyZoom (Premium report)", sourceDetail: "Item count from AgencyZoom for Sales/EA agents. Note: Prem Items are tracked in the database but are NOT currently displayed anywhere on the site. The 'Items' column on the reports uses NB Items.", column: "sales-report — PremItems" },
            { name: "Prem Points", source: "AgencyZoom (Premium report)", sourceDetail: "Points earned based on premium and items. Used in the scoring system.", column: "sales-report — PremPoints" },
            { name: "eAgent (Dismissed / Past Due)", source: "Manual Entry", sourceDetail: "Manually entered by the admin each day. Dismissed todos and past-due items from eAgent. Not pulled from any external system.", column: "Manual entry via eAgent modal" },
          ]},
        ],
      },
      {
        slug: "daily-report-eagent",
        title: "eAgent Data (Todos)",
        tags: ["eagent", "todos", "dismissed", "past due", "manual entry"],
        content: [
          { type: "p", text: "eAgent data is the only part of the daily report that is manually entered. It is not connected to any external system." },
          { type: "steps", items: [
            "On the Daily Report page, look for the eAgent column (Dismissed / Past Due).",
            "Click the edit icon or the eAgent button in the toolbar.",
            "Enter dismissed todo count and past-due count for each agent.",
            "Click Save. Data is stored for that date.",
          ]},
          { type: "note", text: "eAgent data is date-specific. If you enter data for Aug 5 and then view Aug 6, the eAgent columns will be blank until you enter data for Aug 6." },
        ],
      },
      {
        slug: "daily-report-notes",
        title: "Daily Notes",
        tags: ["notes", "daily notes", "comments"],
        content: [
          { type: "p", text: "Each day has a notes section at the bottom of the Daily Report. Use this for anything worth documenting — absences, unusual activity, data anomalies, etc." },
          { type: "steps", items: [
            "Scroll to the bottom of the Daily Report.",
            "Click Add Note or the edit icon.",
            "Type your note and save.",
          ]},
          { type: "note", text: "Notes are per-date. They appear only when viewing that specific date." },
        ],
      },
    ],
  },

  // ── REPORTS: WEEKLY ───────────────────────────────────────────────────────
  {
    id: "weekly-report",
    title: "Weekly Report",
    icon: "CalendarDays",
    color: "violet",
    description: "Understanding the weekly summary report.",
    articles: [
      {
        slug: "weekly-report-overview",
        title: "Overview",
        tags: ["weekly", "report", "overview", "week"],
        content: [
          { type: "p", text: "The Weekly Report aggregates each agent's performance across a full Monday–Sunday work week. Numbers are summed from the underlying daily data." },
          { type: "p", text: "Navigate to Reports → Weekly. Use the week selector to move between weeks." },
          { type: "note", text: "The weekly report reads directly from the daily_metrics database. If a day was not uploaded, that day's numbers will be zero in the weekly total." },
        ],
      },
      {
        slug: "weekly-report-kpis",
        title: "Column Definitions",
        tags: ["kpi", "definition", "weekly", "column", "prev month points", "auto items"],
        content: [
          { type: "kpis", items: [
            { name: "Calls / Talk Time / Texts / Quotes / NB / Items / Premium", source: "Summed from daily data", sourceDetail: "Same definitions as the Daily Report columns. Weekly values are simply the sum across all days in the week." },
            { name: "Prev Month Points", source: "Calculated", sourceDetail: "Previous month's EOM (End of Month) Auto Item Count multiplied by 10. Example: if an agent had 62 auto items at EOM in July, their Prev Month Points for the current week = 620. This is used as a baseline to set context for the current week's performance." },
            { name: "Auto Items (EOM)", source: "New Business Export", sourceDetail: "The count of auto policy items written through end of month. Pulled from the NBAutoCount field in the NB report." },
          ]},
        ],
      },
    ],
  },

  // ── REPORTS: MTD/MONTHLY ──────────────────────────────────────────────────
  {
    id: "mtd-report",
    title: "MTD / Monthly Report",
    icon: "TrendingUp",
    color: "amber",
    description: "Understanding the month-to-date and end-of-month report.",
    articles: [
      {
        slug: "mtd-report-overview",
        title: "Overview",
        tags: ["mtd", "month to date", "monthly", "report", "overview"],
        content: [
          { type: "p", text: "The MTD Report shows cumulative performance for the current month (or any selected month). Numbers roll up from all daily uploads within the selected month." },
          { type: "p", text: "Navigate to Reports → MTD. Use the month/year selector to view past months." },
        ],
      },
      {
        slug: "mtd-report-kpis",
        title: "Column Definitions",
        tags: ["kpi", "mtd", "monthly", "prev month", "points", "definition"],
        content: [
          { type: "kpis", items: [
            { name: "All Performance Columns", source: "Summed from daily data", sourceDetail: "Calls, Talk Time, Texts, Quotes, NB, Items, Premium — all summed across every day in the selected month that has been uploaded." },
            { name: "Prev Month Points", source: "Calculated", sourceDetail: "Previous month's EOM Auto Item Count × 10. Same formula as in the Weekly Report. This shows last month's auto item baseline multiplied by the point value of 10 per item." },
          ]},
        ],
      },
    ],
  },

  // ── AGENTS ────────────────────────────────────────────────────────────────
  {
    id: "agents",
    title: "Agent Management",
    icon: "Users",
    color: "sky",
    description: "How to add, edit, and manage agents on the roster.",
    articles: [
      {
        slug: "agents-overview",
        title: "Overview",
        tags: ["agents", "roster", "management", "overview"],
        content: [
          { type: "p", text: "The Agents page is your roster management tool. Every person tracked by the dashboard must have an agent record here. This is also where you define how each agent's name appears in external reports (system variants)." },
          { type: "p", text: "Navigate to Admin → Agent Management." },
        ],
      },
      {
        slug: "agents-system-variants",
        title: "System Variants (Name Matching)",
        tags: ["system variants", "name", "rc_name", "rico_name", "hs_name", "matching", "spine", "resolve"],
        content: [
          { type: "p", text: "Each external report uses its own format for agent names. System Variants tell the system how to match a name in a report to the correct agent record." },
          { type: "table", headers: ["Variant", "What It Maps"], rows: [
            ["rc_name", "Agent's name as it appears in RingCentral exports"],
            ["rico_name", "Agent's name as it appears in Ricochet exports"],
            ["hs_name", "Agent's name as it appears in Hearsay exports"],
            ["nb_name", "Agent's name in New Business / NB reports"],
            ["quotes_name", "Agent's name in Quotes Detail exports (usually includes agent code, e.g. 327-MAILA CASTRO)"],
            ["az_name", "Agent's name in AgencyZoom Premium reports"],
            ["full_name", "The agent's display name shown throughout the dashboard"],
          ]},
          { type: "warning", text: "If an agent's name in a report does not match any system variant, their data will be skipped during upload and won't appear on reports. Always set all variants when adding a new agent." },
          { type: "faq", q: "An agent has data in the source file but shows zeros on the report. What do I check?", a: "Go to Admin → Agent Management → find the agent → check their System Variants. The name in the file must match exactly (case-insensitive) one of the variants." },
        ],
      },
      {
        slug: "agents-dual-platform",
        title: "Dual-Platform Agents",
        tags: ["dual platform", "rc and rico", "maila", "juanita", "denice", "both systems"],
        content: [
          { type: "p", text: "Some agents use both RingCentral and Ricochet. These are called dual-platform agents. Currently: Maila, Juanita, and Denice." },
          { type: "p", text: "For these agents, both rc_name and rico_name must be set. Their calls from both systems are automatically added together on all reports. You do not need to do anything special when uploading — the system handles the combining." },
          { type: "note", text: "To add a new dual-platform agent: set both rc_name and rico_name in their System Variants. The pipeline will detect them in both sources and sum the results." },
        ],
      },
      {
        slug: "agents-add-new",
        title: "Adding a New Agent",
        tags: ["add agent", "new agent", "create agent"],
        content: [
          { type: "steps", items: [
            "Go to Admin → Agent Management.",
            "Click Add New Agent.",
            "Enter the agent's canonical name (this is how they appear throughout the dashboard).",
            "Set their Office and Team.",
            "Set all System Variants that apply — at minimum, the name as it appears in the systems they use.",
            "Set their Role (agent or admin).",
            "Save. The agent will appear on reports starting from the next upload.",
          ]},
          { type: "note", text: "New agents will show on reports only after at least one source file containing their data is uploaded. No data = no row on the report." },
        ],
      },
    ],
  },

  // ── USERS ─────────────────────────────────────────────────────────────────
  {
    id: "users",
    title: "Users & Permissions",
    icon: "ShieldCheck",
    color: "rose",
    description: "Manage who can log in and what they can access.",
    articles: [
      {
        slug: "users-overview",
        title: "Overview",
        tags: ["users", "permissions", "login", "access", "overview"],
        content: [
          { type: "p", text: "The Users page manages who can log into the dashboard. An Agent record and a User (login) are separate things — an agent can be on the roster without having a login." },
          { type: "p", text: "Navigate to Admin → User Access." },
        ],
      },
      {
        slug: "users-invite",
        title: "Inviting a User",
        tags: ["invite", "new user", "email", "login", "create account"],
        content: [
          { type: "steps", items: [
            "Go to Admin → User Access.",
            "Choose whether to create a new user or link an existing agent.",
            "If linking an existing agent, select their agent record. If adding a new user, select the new user option at the top.",
            "Enter their email address and set their password.",
            "Submit the form to create/link the account.",
          ]},
          { type: "note", text: "Users do NOT receive an automated invite email. They log in directly using the email address and password submitted by the admin." },
        ],
      },
      {
        slug: "users-page-permissions",
        title: "Page Permissions",
        tags: ["permissions", "access control", "page access", "restrict"],
        content: [
          { type: "p", text: "You can control which pages each user can see. By default, all users can see the main reports. The Admin section is restricted to admin-role users only." },
          { type: "steps", items: [
            "Go to Admin → User Access.",
            "Find the user in the Linked Agents list.",
            "Adjust their page permissions using the toggles.",
            "Changes take effect immediately.",
          ]},
        ],
      },
    ],
  },

  // ── COMMUNICATION HUB ─────────────────────────────────────────────────────
  {
    id: "communication",
    title: "Communication Hub",
    icon: "MessageSquare",
    color: "teal",
    description: "How to use the internal messaging system.",
    articles: [
      {
        slug: "communication-overview",
        title: "Overview",
        tags: ["communication", "chat", "messages", "hub", "overview"],
        content: [
          { type: "p", text: "The Communication Hub is an internal messaging system for the agency. It supports direct messages (DMs) and group channels." },
          { type: "p", text: "Navigate to the Communication icon in the sidebar, or go to /communication." },
        ],
      },
      {
        slug: "communication-channels",
        title: "Channels vs. Direct Messages",
        tags: ["channel", "direct message", "dm", "group", "all chat"],
        content: [
          { type: "table", headers: ["Type", "What It Is"], rows: [
            ["#All", "Everyone in the agency. This channel is always at the top and cannot be moved below pinned channels."],
            ["Channels", "Group conversations for teams, offices, or topics. Pinned channels appear above all others."],
            ["Direct Messages (DMs)", "Private conversations between individuals or small groups."],
          ]},
          { type: "note", text: "The #All channel is permanent — it cannot be deleted or archived." },
        ],
      },
      {
        slug: "communication-notifications",
        title: "Notifications",
        tags: ["notifications", "alerts", "desktop", "browser", "sound"],
        content: [
          { type: "p", text: "The hub sends notifications when you receive a new message — even if you're on a different browser tab or window." },
          { type: "steps", items: [
            "When you first open the Communication Hub, your browser will ask for notification permission. Click Allow.",
            "After that, any new message will trigger a browser notification and a sound.",
            "If notifications stop working, go to your browser settings and re-enable them for this site.",
          ]},
          { type: "faq", q: "I stopped getting notifications. How do I fix it?", a: "Open browser settings → Site Permissions → find this site → make sure Notifications is set to Allow." },
        ],
      },
    ],
  },

  // ── KPI DEFINITIONS ───────────────────────────────────────────────────────
  {
    id: "kpi-definitions",
    title: "KPI Definitions",
    icon: "BookOpen",
    color: "indigo",
    description: "Quick reference for every metric tracked on the dashboard.",
    articles: [
      {
        slug: "kpi-calls",
        title: "Calls",
        tags: ["calls", "kpi", "definition", "ringcentral", "ricochet"],
        content: [
          { type: "kpi", name: "Calls", source: "RingCentral + Ricochet AP", sourceDetail: "Total inbound + outbound calls for a given agent on a given day. CSR agents pull from RingCentral. Sales agents pull from Ricochet Agent Performance. Agents on both systems (Maila, Juanita, Denice) have their calls added from both sources.", column: "calls" },
        ],
      },
      {
        slug: "kpi-talk-time",
        title: "Talk Time",
        tags: ["talk time", "kpi", "definition", "duration", "call duration"],
        content: [
          { type: "kpi", name: "Talk Time", source: "RingCentral + Ricochet CH", sourceDetail: "Total connected call duration. CSR agents: from RingCentral (talk_time_seconds column). Sales agents: from Ricochet Call History file (Call Duration In Seconds column). Shown as HH:MM on reports.", column: "talk_time_seconds" },
        ],
      },
      {
        slug: "kpi-texts",
        title: "Texts",
        tags: ["texts", "kpi", "definition", "hearsay", "sms"],
        content: [
          { type: "kpi", name: "Texts", source: "Hearsay", sourceDetail: "Total text messages sent and received through the Hearsay platform on a given day.", column: "Performance Breakdown Report — Texts" },
        ],
      },
      {
        slug: "kpi-quotes",
        title: "Quotes",
        tags: ["quotes", "kpi", "definition", "quote count"],
        content: [
          { type: "kpi", name: "Quotes", source: "Quotes Detail Export", sourceDetail: "Number of insurance quotes submitted by the agent. Pulled from the Quotes Detail report, QuoteCount column.", column: "Quotes Detail — QuoteCount" },
        ],
      },
      {
        slug: "kpi-nb",
        title: "New Business (NB)",
        tags: ["nb", "new business", "kpi", "definition", "policies"],
        content: [
          { type: "kpi", name: "New Business (NB)", source: "New Business Export", sourceDetail: "Number of new policies written by the agent. Does not include renewals.", column: "New Business — NBCount" },
        ],
      },
      {
        slug: "kpi-items",
        title: "Items",
        tags: ["items", "kpi", "definition", "coverage"],
        content: [
          { type: "kpi", name: "Items", source: "New Business Export", sourceDetail: "Count of individual coverage items across all new business. A single policy can have multiple items (e.g. auto + renters = 2 items).", column: "New Business — Items" },
        ],
      },
      {
        slug: "kpi-premium",
        title: "Premium",
        tags: ["premium", "kpi", "definition", "written premium", "new business"],
        content: [
          { type: "kpi", name: "Premium (Written)", source: "New Business Export", sourceDetail: "Dollar amount of written premium from new business policies. This is from the NB report — not from AgencyZoom. Note: NB Written Premium is NOT currently displayed on the dashboard. The 'Premium' column seen on the reports actually displays AgencyZoom Premium (Prem Premium).", column: "New Business — WrittenPremium" },
        ],
      },
      {
        slug: "kpi-prem-premium",
        title: "Prem Premium (AgencyZoom)",
        tags: ["prem premium", "agencyzoom", "kpi", "definition", "sales", "ea"],
        content: [
          { type: "kpi", name: "Prem Premium", source: "AgencyZoom (sales-report)", sourceDetail: "Premium dollar amount from the AgencyZoom sales report. This is specifically for Sales/EA agents and is separate from the NB Written Premium. Used to track EA agent performance against their premium targets. Note: This is the value displayed in the 'Premium' column on the daily, weekly, and MTD reports.", column: "sales-report — PremPremium" },
        ],
      },
      {
        slug: "kpi-prem-points",
        title: "Prem Points",
        tags: ["prem points", "points", "agencyzoom", "kpi", "definition"],
        content: [
          { type: "kpi", name: "Prem Points", source: "AgencyZoom (sales-report)", sourceDetail: "Points earned by Sales/EA agents based on their premium production. Used in the scoring and ranking system.", column: "sales-report — PremPoints" },
        ],
      },
      {
        slug: "kpi-prev-month-points",
        title: "Prev Month Points",
        tags: ["prev month points", "previous month", "kpi", "definition", "auto items", "eom"],
        content: [
          { type: "kpi", name: "Prev Month Points", source: "Calculated Field", sourceDetail: "Previous month's End-of-Month (EOM) Auto Item Count multiplied by 10. Formula: prev_month_points = EOM_auto_items × 10. Example: if an agent ended July with 62 auto items, their Prev Month Points for August = 620. This appears on both the Weekly and MTD reports.", column: "Calculated from NBAutoItems" },
          { type: "note", text: "This is NOT pulled from any external file. It is calculated automatically from the agent's last EOM auto item count stored in the database." },
        ],
      },
      {
        slug: "kpi-auto-items",
        title: "Auto Items (NB Auto)",
        tags: ["auto items", "nb auto", "kpi", "definition", "eom"],
        content: [
          { type: "kpi", name: "NB Auto Items", source: "New Business Export", sourceDetail: "Count of auto policy items from new business. Used to calculate Prev Month Points for the following month.", column: "New Business — NBAutoItems" },
        ],
      },
    ],
  },

  // ── GOALS & HOLIDAYS ──────────────────────────────────────────────────────
  {
    id: "goals-holidays",
    title: "Goals & Holidays",
    icon: "Target",
    color: "orange",
    description: "Setting KPI targets and managing the business day calendar.",
    articles: [
      {
        slug: "goals-overview",
        title: "KPI Goals",
        tags: ["goals", "targets", "kpi goals", "overview"],
        content: [
          { type: "p", text: "The Goals page lets you set daily, weekly, monthly, and YTD performance targets for any KPI. Goals can be scoped to the whole agency, a specific office, or a specific team." },
          { type: "steps", items: [
            "Go to Admin → KPI Goals & Targets.",
            "Select the time period (daily / weekly / monthly / YTD).",
            "Select the scope (agency / office / team).",
            "Enter the target values for each KPI.",
            "Save. Goals appear as reference lines on the reports.",
          ]},
        ],
      },
      {
        slug: "holidays-overview",
        title: "Holiday Calendar",
        tags: ["holidays", "business days", "calendar", "pacing"],
        content: [
          { type: "p", text: "The Holiday Calendar tracks observed holidays. This is used in pacing calculations — the system deducts holidays from the business-day count to give accurate daily targets." },
          { type: "steps", items: [
            "Go to Admin → Holiday Calendar.",
            "Click a date to mark it as a holiday.",
            "Add a name for the holiday (e.g. 'Labor Day').",
            "Save. The system will exclude that day from pacing calculations.",
          ]},
          { type: "note", text: "Weekends are automatically excluded from business-day counts. You only need to add federal/observed holidays." },
        ],
      },
    ],
  },

  // ── DEVELOPER / MAINTENANCE ───────────────────────────────────────────────
  {
    id: "developer",
    title: "Developer Guide",
    icon: "Code",
    color: "slate",
    description: "How to maintain and extend the dashboard — for technical staff.",
    articles: [
      {
        slug: "dev-overview",
        title: "Tech Stack & Software Overview",
        tags: ["developer", "tech stack", "software", "tools", "supabase", "antigravity", "nextjs", "react", "apis"],
        content: [
          { type: "p", text: "This article provides a complete reference of all tools, frameworks, databases, and external system connections powering the DSR Dashboard." },
          { type: "note", text: "Recommended IDE: Google Antigravity is recommended for developing, maintaining, and extending this codebase." },
          { type: "heading", text: "Software & Technology Stack" },
          { type: "table", headers: ["Tool / Software", "Category", "Purpose & Usage"], rows: [
            ["Google Antigravity", "AI Coding Assistant / IDE", "Recommended development environment for maintaining and extending the repository."],
            ["Next.js (App Router)", "Frontend & API Framework", "Powers page routing, React server & client components, and backend API routes."],
            ["TypeScript", "Programming Language", "Provides type safety across the pipeline parsers, database entities, and UI components."],
            ["Supabase", "Database & Backend Service", "PostgreSQL database host, authentication system, and WebSocket realtime subscription engine for chat."],
            ["Tailwind CSS", "Styling Engine", "Utility-first CSS styling system for responsive dashboard UI layout."],
            ["Recharts", "Data Visualization", "Renders interactive line and bar charts for agency MTD pacing and daily trends."],
            ["Lucide React", "Icon Library", "Clean iconography used across all navigation, modals, and report headers."],
          ]},
          { type: "heading", text: "Uploaded Report Sources (Manual Exports)" },
          { type: "table", headers: ["Data Source", "Format / Type", "Data Provided"], rows: [
            ["RingCentral", "CSV Export", "CSR call counts, inbound/outbound breakdown, and talk time."],
            ["Ricochet360", "Excel Export (.xlsx / .csv)", "Sales agent call metrics (Agent Performance) and talk duration (Call History / ch- files)."],
            ["Hearsay Social", "Excel Export (.xlsx)", "Agent texting activity, opt-ins, and opt-outs."],
            ["DASH (AMS / Internal)", "Excel Export (.xlsx)", "Quotes Detail and New Business Detail policy counts, items written, and written premium."],
            ["AgencyZoom", "Excel Export (.xlsx)", "Sales/EA agent premium targets, item counts, and performance points."],
          ]},
          { type: "heading", text: "Automated Scripts & Connections" },
          { type: "table", headers: ["System / Connection", "Type", "Purpose & Function"], rows: [
            ["DeerDama", "Automated Script Connection", "Custom script integration that connects directly to the site to fetch/process data automatically."],
          ]},
        ],
      },
      {
        slug: "dev-adding-docs",
        title: "How to Add Documentation for a New Page",
        tags: ["developer", "docs", "new page", "add documentation", "maintain"],
        content: [
          { type: "p", text: "All documentation is defined in one file: src/app/admin/docs/docs-content.ts. When a new page or feature is added to the site, add its documentation there." },
          { type: "heading", text: "Steps" },
          { type: "steps", items: [
            "Open src/app/admin/docs/docs-content.ts.",
            "Find the DOCS_SECTIONS array.",
            "Either add a new DocSection entry (for a new top-level page), or add a new article to an existing section.",
            "Follow the structure in the file — each section has an id, title, icon, color, description, and an array of articles.",
            "Each article has a slug (unique ID), title, tags (for search), and content (array of content blocks).",
            "Content block types: p (paragraph), steps (numbered list), note, warning, kpi (single KPI definition), kpis (multiple), faq, table, list, heading.",
            "Save the file. The docs page will automatically render the new content.",
          ]},
          { type: "note", text: "There is no database involved in the documentation. All content is hardcoded in docs-content.ts. This makes it easy to version-control alongside the site." },
          { type: "heading", text: "Example: Adding an Article" },
          { type: "code", text: `{
  slug: "my-new-feature",
  title: "How to Use My New Feature",
  tags: ["new feature", "instructions"],
  content: [
    { type: "p", text: "Brief description of what this feature does." },
    { type: "steps", items: [
      "Step one.",
      "Step two.",
      "Step three.",
    ]},
    { type: "note", text: "Any important caveats go here." },
  ]
}` },
        ],
      },
      {
        slug: "dev-pipeline",
        title: "Data Pipeline Architecture",
        tags: ["developer", "pipeline", "architecture", "how it works", "parsers", "merge", "supabase"],
        content: [
          { type: "heading", text: "Upload Flow" },
          { type: "steps", items: [
            "User uploads files on /admin/sync.",
            "Client-side detects file types by filename (FILE_PATTERNS in src/lib/pipeline/types.ts).",
            "processUploadedFiles() in src/lib/pipeline/index.ts orchestrates parsing.",
            "Each file goes through its parser (src/lib/pipeline/parsers/*).",
            "Parsers use the Spine (src/lib/pipeline/spine.ts) to resolve agent names from system_variants.",
            "mergeAllData() in src/lib/pipeline/merge.ts combines all parsed data into one row per agent.",
            "pushToSupabase() in src/lib/pipeline/supabase-pusher.ts upserts to daily_metrics.",
            "recalculateSummaries() updates monthly/weekly rollups.",
          ]},
          { type: "heading", text: "Key Files" },
          { type: "table", headers: ["File", "Purpose"], rows: [
            ["src/lib/pipeline/types.ts", "SOURCE_FIELD_MAP — which DB columns each source owns. FILE_PATTERNS — filename detection."],
            ["src/lib/pipeline/spine.ts", "Loads agents from Supabase, resolves any name variant to the canonical agent record."],
            ["src/lib/pipeline/merge.ts", "Combines RC + Rico + HS + NB + Quotes + Premium into one AgentMetrics row per agent."],
            ["src/lib/pipeline/supabase-pusher.ts", "Writes merged data to daily_metrics. Handles per-source call breakdown (call_source_breakdown JSONB) so dual-platform agents sum correctly."],
            ["src/lib/pipeline/recalculate-summaries.ts", "Recomputes monthly/weekly aggregates after any daily upload."],
          ]},
          { type: "heading", text: "Call Data for Dual-Platform Agents" },
          { type: "p", text: "Agents on both RC and Rico are handled by the call_source_breakdown JSONB column on daily_metrics. The pusher stores each source's contribution separately and sums them into the calls/inbound/outbound/talk_time_seconds columns. Re-uploading one source replaces only that source's entry, keeping the other source's data intact." },
        ],
      },
      {
        slug: "dev-adding-source",
        title: "Adding a New Data Source",
        tags: ["developer", "new source", "parser", "data source"],
        content: [
          { type: "steps", items: [
            "Create a new parser in src/lib/pipeline/parsers/your-source-parser.ts. Follow the pattern of existing parsers — read the file, resolve agent names via spine.resolveAgent(), return a ParseResult.",
            "Add the source to the switch in src/lib/pipeline/index.ts (processUploadedFiles function).",
            "Add its filename detection pattern to FILE_PATTERNS in src/lib/pipeline/types.ts.",
            "Add it to SOURCE_FIELD_MAP in types.ts — list which daily_metrics columns this source populates.",
            "Add the same filename pattern to the API route at src/app/api/upload-data/route.ts (FILE_PATTERNS array there).",
            "Upload a test file and verify the processing log shows the correct agent rows.",
          ]},
        ],
      },
    ],
  },
]
