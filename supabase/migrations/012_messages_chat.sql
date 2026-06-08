-- ============================================================
-- 012_messages_chat — Chat en tiempo real trainer ↔ cliente
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client reads own messages" ON messages
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Client sends messages" ON messages
  FOR INSERT WITH CHECK (client_id = auth.uid() AND sender_id = auth.uid());

CREATE POLICY "Trainer manages client messages" ON messages
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
    OR sender_id = auth.uid()
  );

CREATE POLICY "Admin full access messages" ON messages
  FOR ALL USING (get_my_role() = 'admin');
