export const ANALYTICS_EVENTS = {
  REFERRAL_CREATED: 'referral_created',
  REFERRAL_LINK_SHARED: 'referral_link_shared',
  CONSERVATION_ALERT_VIEWED: 'conservation_alert_viewed',
  CONSERVATION_CALL_INITIATED: 'conservation_call_initiated',
  POLICY_REVIEW_STARTED: 'policy_review_started',
  POLICY_REVIEW_COMPLETED: 'policy_review_completed',
  AI_VOICE_CALL_STARTED: 'ai_voice_call_started',
  AI_VOICE_CALL_COMPLETED: 'ai_voice_call_completed',
  CLIENT_ADDED: 'client_added',
  CLIENT_REMOVED: 'client_removed',
  ANNIVERSARY_REWRITE_INITIATED: 'anniversary_rewrite_initiated',
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_STEP_BLOCKED: 'onboarding_step_blocked',
  ONBOARDING_RESUMED: 'onboarding_resumed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_PATCH_PROMPT_SENT: 'onboarding_patch_prompt_sent',
  ONBOARDING_MANUAL_CORRECTION_USED: 'onboarding_manual_correction_used',
  SETTINGS_UPDATED: 'settings_updated',
  PATCH_CONVERSATION_STARTED: 'patch_conversation_started',
  PATCH_MESSAGE_SENT: 'patch_message_sent',
  POSTHOG_CLIENT_BOOT: 'posthog_client_boot',
  DASHBOARD_LOAD_SLOW: 'dashboard_load_slow',
  API_REQUEST_FAILED: 'api_request_failed',
  EMPTY_STATE_SEEN: 'empty_state_seen',
  ACTION_FAILED: 'action_failed',
  DASHBOARD_EXIT_AFTER_ERROR: 'dashboard_exit_after_error',
  DASHBOARD_EXIT_AFTER_EMPTY_STATE: 'dashboard_exit_after_empty_state',
  CHURN_RISK_FLAGGED: 'churn_risk_flagged',
  DASHBOARD_ACCESS_GATE_CHECK: 'dashboard_access_gate_check',
  DASHBOARD_AUTH_GATE_RESOLVED: 'dashboard_auth_gate_resolved',
  DASHBOARD_AUTH_GATE_TIMEOUT: 'dashboard_auth_gate_timeout',
  BULK_IMPORT_SESSION_STARTED: 'bulk_import_session_started',
  BULK_IMPORT_FILE_PARSED: 'bulk_import_file_parsed',
  BULK_IMPORT_SESSION_COMPLETED: 'bulk_import_session_completed',
  BULK_IMPORT_ACTIVATED: 'bulk_import_activated',
  APPLICATION_UPLOAD_STARTED: 'application_upload_started',
  APPLICATION_UPLOAD_SIGNED_URL_FAILED: 'application_upload_signed_url_failed',
  APPLICATION_UPLOAD_PUT_FAILED: 'application_upload_put_failed',
  APPLICATION_JOB_CREATE_FAILED: 'application_job_create_failed',
  APPLICATION_POLL_STALLED: 'application_poll_stalled',
  APPLICATION_FALLBACK_TRIGGERED: 'application_fallback_triggered',
  APPLICATION_FALLBACK_FAILED: 'application_fallback_failed',
  APPLICATION_PARSE_COMPLETED: 'application_parse_completed',
  APPLICATION_CORE_COMPLETENESS: 'application_core_completeness',
  APPLICATION_SLA_BREACH: 'application_sla_breach',
  INGESTION_V3_PAGE_MAP_CLAMPED: 'ingestion_v3_page_map_clamped',
  // Phase 1 Track B — agent action item surface (forward-compat across
  // welcome / anniversary / retention / referral lanes). The generic
  // `action_item_*` events are the cross-lane funnel; the
  // welcome-specific events are the Phase 1 leading indicators called out
  // in the locked Q2 decision (CONTEXT.md > Channel Rules > Agent action
  // item surface; docs/AFL_Phase_1_Planning_Notes_2026-05-04.md §1-§3).
  ACTION_ITEM_CREATED: 'action_item_created',
  ACTION_ITEM_VIEWED: 'action_item_viewed',
  ACTION_ITEM_COMPLETED: 'action_item_completed',
  WELCOME_ACTION_ITEM_EXPIRED: 'welcome_action_item_expired',
  // Phase 1 Track B — welcome flow agent + client funnel
  WELCOME_SEND_INITIATED: 'welcome_send_initiated',
  WELCOME_SEND_COMPLETED: 'welcome_send_completed',
  CLIENT_ACTIVATED: 'client_activated',
  CLIENT_ACTIVATION_THUMBS_UP_RECEIVED: 'client_activation_thumbs_up_received',
  // Phase 1 Track B — PWA install + agent-side Web Push (HARD onboarding gates)
  PWA_INSTALL_PROMPTED: 'pwa_install_prompted',
  PWA_INSTALL_COMPLETED: 'pwa_install_completed',
  WEB_PUSH_PERMISSION_REQUESTED: 'web_push_permission_requested',
  WEB_PUSH_PERMISSION_GRANTED: 'web_push_permission_granted',
  WEB_PUSH_PERMISSION_DENIED: 'web_push_permission_denied',
  WEB_PUSH_SUBSCRIPTION_REGISTERED: 'web_push_subscription_registered',
  WEB_PUSH_SUBSCRIPTION_INVALIDATED: 'web_push_subscription_invalidated',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

type EventValue = string | number | boolean | null | undefined;
type GenericEventProperties = Record<string, EventValue>;

export type AnalyticsEventPropertiesMap = {
  referral_created: GenericEventProperties;
  referral_link_shared: {
    channel?: string;
  } & GenericEventProperties;
  conservation_alert_viewed: {
    status?: string;
    priority?: string;
    source?: string;
  } & GenericEventProperties;
  conservation_call_initiated: {
    source?: string;
  } & GenericEventProperties;
  policy_review_started: {
    current_status?: string;
  } & GenericEventProperties;
  policy_review_completed: {
    completion_status?: 'booked' | 'closed';
  } & GenericEventProperties;
  ai_voice_call_started: {
    call_type?: string;
  } & GenericEventProperties;
  ai_voice_call_completed: {
    call_duration_seconds?: number;
    call_type?: string;
  } & GenericEventProperties;
  client_added: {
    method?: 'manual' | 'csv_import' | 'pdf_parse' | 'book_of_business';
    imported_count?: number;
  } & GenericEventProperties;
  client_removed: GenericEventProperties;
  anniversary_rewrite_initiated: GenericEventProperties;
  onboarding_step_viewed: {
    step_name?: string;
  } & GenericEventProperties;
  onboarding_step_completed: {
    step_name?: string;
  } & GenericEventProperties;
  onboarding_step_blocked: {
    step_name?: string;
    reason?: string;
  } & GenericEventProperties;
  onboarding_resumed: {
    step_name?: string;
  } & GenericEventProperties;
  onboarding_completed: {
    total_steps?: number;
  } & GenericEventProperties;
  onboarding_patch_prompt_sent: {
    prompt_length?: number;
  } & GenericEventProperties;
  onboarding_manual_correction_used: {
    source?: 'application_review';
  } & GenericEventProperties;
  settings_updated: {
    setting_changed?: string;
  } & GenericEventProperties;
  patch_conversation_started: {
    entry?: string;
  } & GenericEventProperties;
  patch_message_sent: {
    message_length?: number;
  } & GenericEventProperties;
  posthog_client_boot: {
    path?: string;
  } & GenericEventProperties;
  dashboard_load_slow: {
    path?: string;
    load_time_ms?: number;
    threshold_ms?: number;
  } & GenericEventProperties;
  api_request_failed: {
    endpoint?: string;
    status_code?: number;
    duration_ms?: number;
    method?: string;
  } & GenericEventProperties;
  empty_state_seen: {
    area?: string;
    context?: string;
  } & GenericEventProperties;
  action_failed: {
    action?: string;
    surface?: string;
    reason?: string;
  } & GenericEventProperties;
  dashboard_exit_after_error: {
    path?: string;
    session_duration_ms?: number;
  } & GenericEventProperties;
  dashboard_exit_after_empty_state: {
    path?: string;
    session_duration_ms?: number;
  } & GenericEventProperties;
  churn_risk_flagged: {
    path?: string;
    risk_reason?: string;
    session_duration_ms?: number;
  } & GenericEventProperties;
  dashboard_access_gate_check: {
    stage?: 'start' | 'success' | 'not_activated' | 'timeout' | 'error';
    status_before?: string;
    activated?: boolean;
    reason?: string;
    http_status?: number;
    duration_ms?: number;
  } & GenericEventProperties;
  dashboard_auth_gate_resolved: {
    outcome?: 'authenticated' | 'redirect_signin' | 'redirect_onboarding' | 'error' | 'timeout';
    duration_ms?: number;
  } & GenericEventProperties;
  dashboard_auth_gate_timeout: {
    phase?: 'activation' | 'overall';
    duration_ms?: number;
    was_loading?: boolean;
    was_profile_loading?: boolean;
    was_activating_founding?: boolean;
    had_user?: boolean;
    subscription_status_known?: boolean;
  } & GenericEventProperties;
  bulk_import_session_started: {
    source?: 'local_bulk' | 'drive';
    total_files?: number;
    pdf_files?: number;
    spreadsheet_files?: number;
    text_files?: number;
  } & GenericEventProperties;
  bulk_import_file_parsed: {
    source?: 'local_bulk' | 'drive';
    file_type?: 'pdf' | 'spreadsheet' | 'text' | 'unknown';
    file_size_bytes?: number;
    success?: boolean;
    retry_attempt_count?: number;
    rows_loaded?: number;
    rejected_rows?: number;
    error?: string;
  } & GenericEventProperties;
  bulk_import_session_completed: {
    source?: 'local_bulk' | 'drive';
    total_files?: number;
    parsed_files?: number;
    failed_files?: number;
    loaded_rows?: number;
    elapsed_ms?: number;
  } & GenericEventProperties;
  bulk_import_activated: {
    source?: 'local_bulk' | 'drive';
    time_to_first_client_created_ms?: number;
    imported_count?: number;
    policy_count?: number;
  } & GenericEventProperties;
  application_upload_started: GenericEventProperties;
  application_upload_signed_url_failed: GenericEventProperties;
  application_upload_put_failed: GenericEventProperties;
  application_job_create_failed: GenericEventProperties;
  application_poll_stalled: GenericEventProperties;
  application_fallback_triggered: GenericEventProperties;
  application_fallback_failed: GenericEventProperties;
  application_parse_completed: GenericEventProperties;
  application_core_completeness: GenericEventProperties;
  application_sla_breach: GenericEventProperties;
  ingestion_v3_page_map_clamped: {
    carrier_form_type?: string;
    num_pages?: number;
    requested_count?: number;
    rendered_count?: number;
    skipped_pages?: string;
  } & GenericEventProperties;
  // ─── Phase 1 Track B telemetry ──────────────────────────────────────
  // Generic action item funnel — `lane` and `trigger_reason` use the
  // literal unions from web/lib/action-item-types.ts. PostHog can group
  // by lane for cross-lane analysis or filter to a single lane for
  // welcome-only Phase 1 metrics.
  action_item_created: {
    lane?: 'welcome' | 'anniversary' | 'retention' | 'referral';
    trigger_reason?: string;
    is_idempotent_replay?: boolean;
    days_until_expiry?: number;
  } & GenericEventProperties;
  action_item_viewed: {
    lane?: 'welcome' | 'anniversary' | 'retention' | 'referral';
    trigger_reason?: string;
    view_count_after?: number;
    age_days?: number;
  } & GenericEventProperties;
  action_item_completed: {
    lane?: 'welcome' | 'anniversary' | 'retention' | 'referral';
    trigger_reason?: string;
    completion_action?:
      | 'text_personally'
      | 'call'
      | 'send_templated_email'
      | 'toggle_ai_back_on'
      | 'skip'
      | 'expired_unhandled';
    age_days?: number;
    view_count_at_completion?: number;
  } & GenericEventProperties;
  welcome_action_item_expired: {
    days_queued?: number;
    view_count?: number;
  } & GenericEventProperties;
  // Welcome flow funnel — agent send + client activation half.
  welcome_send_initiated: {
    surface?: 'mobile_pwa_action_items' | 'mobile_pwa_inline' | 'desktop_action_items_readonly';
    channel?: 'agent_phone_sms';
  } & GenericEventProperties;
  welcome_send_completed: {
    surface?: 'mobile_pwa_action_items' | 'mobile_pwa_inline';
    channel?: 'agent_phone_sms';
    age_days_at_send?: number;
  } & GenericEventProperties;
  client_activated: {
    activation_inbound_received?: boolean;
    days_since_welcome_sent?: number | null;
    via?: 'linq_inbound_match' | 'linq_inbound_phone_fallback';
  } & GenericEventProperties;
  client_activation_thumbs_up_received: {
    minutes_after_activation?: number;
  } & GenericEventProperties;
  // PWA install + Web Push (agent side, browser, NOT Expo / mobile).
  pwa_install_prompted: {
    platform?: 'ios' | 'android' | 'desktop' | 'unknown';
    surface?: 'onboarding_milestone' | 'banner_reminder';
  } & GenericEventProperties;
  pwa_install_completed: {
    platform?: 'ios' | 'android' | 'desktop' | 'unknown';
    detection?: 'beforeinstallprompt' | 'display_mode_standalone' | 'navigator_standalone';
  } & GenericEventProperties;
  web_push_permission_requested: {
    surface?: 'onboarding_milestone' | 'banner_reminder';
  } & GenericEventProperties;
  web_push_permission_granted: GenericEventProperties;
  web_push_permission_denied: {
    permission_state?: 'denied' | 'default';
  } & GenericEventProperties;
  web_push_subscription_registered: GenericEventProperties;
  web_push_subscription_invalidated: {
    reason?: 'gone_410' | 'not_found_404' | 'forbidden_403' | 'unknown';
  } & GenericEventProperties;
};

export type AnalyticsEventProperties<T extends AnalyticsEventName> =
  AnalyticsEventPropertiesMap[T];
