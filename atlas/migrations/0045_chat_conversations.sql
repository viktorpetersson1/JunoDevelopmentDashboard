-- 0045_chat_conversations.sql — AJ-v4: Ask Juno conversation history.
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 18 Jul 2026; this
-- file mirrors what was applied, for git history.
--
-- The pane persists a snapshot of the conversation after every turn so
-- chats survive the browser session and follow the user across devices.
-- Payload rows are the pane's ChatMessage JSON verbatim (opaque here).
-- Strictly personal: owner-only RLS on every verb.

CREATE TABLE atlas.chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL DEFAULT 'New conversation'
                    CHECK (length(title) BETWEEN 1 AND 120),
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_conversations_owner_idx
  ON atlas.chat_conversations (user_id, is_archived, last_message_at DESC);

CREATE TABLE atlas.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES atlas.chat_conversations(id) ON DELETE CASCADE,
  seq             int  NOT NULL CHECK (seq >= 0),
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON atlas.chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON atlas.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.chat_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.chat_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.chat_conversations TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.chat_messages TO postgres;

ALTER TABLE atlas.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_conversations_owner ON atlas.chat_conversations
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY chat_messages_owner ON atlas.chat_messages
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM atlas.chat_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM atlas.chat_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
