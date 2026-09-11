-- Owner-confirmed preview inventory. Run once after migrations, never reset on startup.
INSERT INTO inventory (size, quantity) VALUES ('XS',1),('S',2),('M',2),('L',3) ON CONFLICT(size) DO NOTHING;
