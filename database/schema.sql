
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(150),
    action VARCHAR(30) NOT NULL,
    entity VARCHAR(50),
    entity_id INT,
    details JSONB,
    ip VARCHAR(60),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity);

INSERT INTO public.school_settings (key, value) VALUES ('currency', 'ETB') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.fee_types (name) VALUES ('Tuition'), ('Registration'), ('Examination') ON CONFLICT (name) DO NOTHING;
