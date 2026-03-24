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
};

export type AnalyticsEventProperties<T extends AnalyticsEventName> =
  AnalyticsEventPropertiesMap[T];