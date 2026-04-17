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
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
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
  onboarding_step_completed: {
    step_name?: string;
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
};

export type AnalyticsEventProperties<T extends AnalyticsEventName> =
  AnalyticsEventPropertiesMap[T];
