-- "Add to Google Wallet" clicked: we try object updates / messages for these cards (the object exists only once saved)
alter table public.loyalty_cards add column if not exists google_clicked_at timestamptz;
notify pgrst, 'reload schema';
