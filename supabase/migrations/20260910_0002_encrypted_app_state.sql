alter table public.profiles
  add column encrypted_state text,
  add column state_iv text,
  add constraint profiles_encrypted_state_pair
    check ((encrypted_state is null and state_iv is null) or (encrypted_state is not null and state_iv is not null));
