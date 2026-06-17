do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_whatsapp_message_id_key'
  ) then
    alter table messages
      add constraint messages_whatsapp_message_id_key unique (whatsapp_message_id);
  end if;
end $$;
