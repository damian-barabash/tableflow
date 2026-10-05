-- Recepcja AI: a steadier voice. Stability below 0.5 made the tone jump between sentences;
-- the panel's "Ekspresja" slider now maps 0–100 % to stability 1.0–0.5.
alter table rc_settings alter column voice_stability set default 0.6;
update rc_settings set voice_stability = 0.6 where voice_stability < 0.5;
