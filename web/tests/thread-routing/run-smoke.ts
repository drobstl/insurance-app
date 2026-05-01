#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import { canAutoReplyInLane, responderForLane } from '../../lib/conversation-lane-guard';
import type { ConversationThreadDoc } from '../../lib/conversation-routing-types';

function makeThread(
  lane: ConversationThreadDoc['lane'],
  allowAutoReply: boolean,
  allowedResponder: ConversationThreadDoc['aiPolicy']['allowedResponder'],
): Pick<ConversationThreadDoc, 'lane' | 'aiPolicy'> {
  return {
    lane,
    aiPolicy: {
      allowAutoReply,
      allowedResponder,
    },
  };
}

function run() {
  const beneficiaryThread = makeThread('beneficiary', false, 'none');
  assert.equal(
    canAutoReplyInLane({
      thread: beneficiaryThread,
      responder: responderForLane('beneficiary'),
    }),
    false,
    'beneficiary lanes must be fenced by default',
  );

  const referralThread = makeThread('referral', true, 'referral');
  assert.equal(
    canAutoReplyInLane({
      thread: referralThread,
      responder: responderForLane('referral'),
    }),
    true,
    'referral lane should allow referral responder when enabled',
  );

  assert.equal(
    canAutoReplyInLane({
      thread: referralThread,
      responder: 'conservation',
    }),
    false,
    'wrong responder must be blocked',
  );

  const manualThread = makeThread('manual', true, 'manual_only');
  assert.equal(
    canAutoReplyInLane({
      thread: manualThread,
      responder: responderForLane('manual'),
    }),
    false,
    'manual-only lane should never auto reply',
  );

  console.log('[thread-routing-smoke] passed');
}

run();
